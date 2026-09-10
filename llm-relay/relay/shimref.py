"""Reference client-side implementation of the relay protocol.

This module is the *specification in code* for the Windows shim (Session 2).
It is deliberately stdlib-only and platform-independent so it can be:

  * imported directly by the shim,
  * used by the test suite as the authoritative protocol peer, and
  * used in SHADOW mode to measure would-be savings without sending anything.

Key pieces
----------
``ChunkerState``
    Incremental content-defined chunking. Conversation payloads grow by
    appending, so the chunk list for the previously-seen byte prefix is reused
    and CDC only runs over the new tail. Without this, pure-Python CDC would
    rescan the whole multi-MB body on every turn.

``AckedIndex``
    The set of chunk hashes the relay is known to hold. Persisted to JSON so a
    shim restart does not re-upload a whole conversation. It is an
    *optimisation*: a stale entry costs one 409 round-trip, never correctness,
    because the relay verifies every chunk hash on arrival and verifies the
    reconstructed body hash before dispatch.

``RelayClient``
    relay()/relay_stream() with a bounded miss-recovery loop: at most ONE 409
    round-trip per request, then a hard failure.

Safety rule honoured here: the client never retries a request that was
dispatched. It uses ``X-Relay-Dispatched`` to distinguish "safe to resend" (0)
from "do not resend" (1), and only the former is ever retried.
"""

from __future__ import annotations

import base64
import json
import os
import threading
import time
import urllib.error
import urllib.request
from typing import Dict, Iterator, List, NamedTuple, Optional, Sequence, Tuple

from .cdc import Chunk, chunk_bytes, sha256_hex
from .protocol import (
    H_BODY_LEN,
    H_BODY_SHA,
    H_BYTES_SAVED,
    H_CHUNKS_NEW,
    H_CHUNKS_TOTAL,
    H_DISPATCHED,
    H_ROUTE,
    H_SAVED_PCT,
    H_WIRE_BYTES,
    HEADER_TOKEN,
    build_envelope,
)

READ_BLOCK = 65536


class RelayError(Exception):
    """A transport-level failure the caller must surface, never silently retry."""

    def __init__(
        self,
        message: str,
        *,
        status: Optional[int] = None,
        dispatched: Optional[bool] = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.dispatched = dispatched


class RelayResult(NamedTuple):
    status: int
    headers: Dict[str, str]
    body: bytes
    relay_metrics: dict


class SavingsPlan(NamedTuple):
    """What a request WOULD cost on the wire (used by SHADOW mode)."""

    body_len: int
    wire_bytes: int
    chunks_total: int
    chunks_new: int
    bytes_saved: int
    saved_pct: float


class ChunkerState:
    """Incremental CDC over an append-mostly byte stream."""

    def __init__(self, **cdc_kwargs) -> None:
        self._cdc_kwargs = cdc_kwargs
        self._prefix_len = 0
        self._prefix_sha: Optional[str] = None
        self._chunks: List[Chunk] = []
        self._lock = threading.Lock()

    def chunks_for(self, body: bytes) -> List[Chunk]:
        """Return the chunk list tiling ``body``, reusing the cached prefix."""
        with self._lock:
            reuse = (
                self._prefix_len > 0
                and len(body) >= self._prefix_len
                and sha256_hex(body[: self._prefix_len]) == self._prefix_sha
            )
            if reuse:
                chunks = list(self._chunks)
                start = self._prefix_len
            else:
                chunks = []
                start = 0

            if start < len(body):
                chunks.extend(chunk_bytes(body, start=start, **self._cdc_kwargs))

            # The final chunk ends at the payload end, not at a CDC boundary.
            # Cache only up to the last complete boundary so a future append
            # re-chunks that tail correctly instead of freezing a short chunk.
            cacheable = chunks[:-1] if len(chunks) > 1 else []
            self._chunks = cacheable
            self._prefix_len = (
                cacheable[-1].offset + cacheable[-1].length if cacheable else 0
            )
            self._prefix_sha = (
                sha256_hex(body[: self._prefix_len]) if self._prefix_len else None
            )
            return chunks

    def reset(self) -> None:
        with self._lock:
            self._prefix_len = 0
            self._prefix_sha = None
            self._chunks = []


class AckedIndex:
    """Persisted set of chunk hashes the relay is known to hold."""

    def __init__(self, path: Optional[str] = None) -> None:
        self.path = path
        self._set = set()
        self._lock = threading.Lock()
        self._dirty = False
        if path and os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as fh:
                    self._set = set(json.load(fh).get("acked", []))
            except (OSError, ValueError):
                self._set = set()

    def __contains__(self, sha: str) -> bool:
        with self._lock:
            return sha in self._set

    def __len__(self) -> int:
        with self._lock:
            return len(self._set)

    def add(self, hashes: Sequence[str]) -> None:
        with self._lock:
            self._set.update(hashes)
            self._dirty = True

    def discard(self, hashes: Sequence[str]) -> None:
        with self._lock:
            self._set.difference_update(hashes)
            self._dirty = True

    def clear(self) -> None:
        with self._lock:
            self._set.clear()
            self._dirty = True

    def flush(self) -> None:
        if not self.path:
            return
        with self._lock:
            if not self._dirty:
                return
            snapshot = sorted(self._set)
            self._dirty = False
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump({"acked": snapshot}, fh)
        os.replace(tmp, self.path)


class RelayClient:
    """Client for one relay endpoint."""

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:8787",
        token: str = "",
        *,
        chunker: Optional[ChunkerState] = None,
        acked: Optional[AckedIndex] = None,
        timeout: Optional[float] = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.chunker = chunker or ChunkerState()
        self.acked = acked or AckedIndex()
        #: Applies to reaching the LOCAL relay only. The relay itself never
        #: times out the upstream stream (spec v1 section 10).
        self.timeout = timeout

    # ----------------------------------------------------------------- http

    def _headers(self) -> Dict[str, str]:
        return {
            HEADER_TOKEN: self.token,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def _post_json(self, path: str, payload: dict) -> Tuple[int, Dict[str, str], bytes]:
        data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        request = urllib.request.Request(
            self.base_url + path, data=data, headers=self._headers(), method="POST"
        )
        try:
            response = urllib.request.urlopen(request, timeout=self.timeout)
        except urllib.error.HTTPError as exc:
            response = exc
        except (urllib.error.URLError, OSError) as exc:
            raise RelayError("cannot reach relay at %s: %s" % (self.base_url, exc))
        body = response.read()
        headers = {k.lower(): v for k, v in response.headers.items()}
        status = getattr(response, "status", None) or response.getcode()
        response.close()
        return status, headers, body

    # ------------------------------------------------------------- planning

    def plan(self, body: bytes) -> SavingsPlan:
        """Compute wire cost WITHOUT contacting the relay (SHADOW mode).

        Accounts for envelope JSON overhead and the 4/3 base64 expansion of new
        chunks, which is what actually crosses the LTE link.
        """
        chunks = self.chunker.chunks_for(body)
        manifest = [c.sha256 for c in chunks]
        new = [
            (c.sha256, body[c.offset : c.offset + c.length])
            for c in chunks
            if c.sha256 not in self.acked
        ]
        b64_bytes = sum(((len(d) + 2) // 3) * 4 for _, d in new)
        overhead = (
            len(json.dumps({"v": 1, "manifest": manifest}, separators=(",", ":")))
            + 64 * len(new)
            + 256
        )
        wire = overhead + b64_bytes
        saved = max(0, len(body) - wire)
        return SavingsPlan(
            body_len=len(body),
            wire_bytes=wire,
            chunks_total=len(manifest),
            chunks_new=len(new),
            bytes_saved=saved,
            saved_pct=round(100.0 * saved / len(body), 3) if body else 0.0,
        )

    # ----------------------------------------------------------- ops calls

    def upload_chunks(self, chunks: Sequence[Tuple[str, bytes]]) -> dict:
        """POST /relay/chunks - explicit bulk upload (miss recovery uses it inline)."""
        payload = {
            "chunks": [
                {"sha256": sha, "b64": base64.b64encode(data).decode("ascii")}
                for sha, data in chunks
            ]
        }
        status, _headers, body = self._post_json("/relay/chunks", payload)
        if status != 200:
            raise RelayError(
                "chunk upload failed: HTTP %d %s"
                % (status, body[:400].decode("utf-8", "replace")),
                status=status,
                dispatched=False,
            )
        return json.loads(body.decode("utf-8"))

    def has(self, hashes: Sequence[str]) -> Tuple[List[str], List[str]]:
        """POST /relay/has - warm the acked index after a relay cache wipe."""
        status, _headers, body = self._post_json("/relay/has", {"sha256": list(hashes)})
        if status != 200:
            raise RelayError(
                "has-query failed: HTTP %d" % status, status=status, dispatched=False
            )
        obj = json.loads(body.decode("utf-8"))
        return obj.get("present", []), obj.get("missing", [])

    def sync_acked(self, hashes: Sequence[str]) -> dict:
        """Reconcile the acked index against the relay; drops stale entries."""
        present, missing = self.has(hashes)
        self.acked.add(present)
        self.acked.discard(missing)
        return {"present": len(present), "missing": len(missing)}

    def clear_store(self) -> dict:
        """POST /relay/store/clear - ops/testing only."""
        status, _headers, body = self._post_json("/relay/store/clear", {})
        if status != 200:
            raise RelayError("clear failed: HTTP %d" % status, status=status)
        self.acked.clear()
        return json.loads(body.decode("utf-8"))

    def metrics(self) -> dict:
        request = urllib.request.Request(
            self.base_url + "/relay/metrics", headers=self._headers(), method="GET"
        )
        try:
            response = urllib.request.urlopen(request, timeout=self.timeout)
        except urllib.error.HTTPError as exc:
            response = exc
        except (urllib.error.URLError, OSError) as exc:
            raise RelayError("cannot reach relay: %s" % (exc,))
        body = response.read()
        response.close()
        return json.loads(body.decode("utf-8"))

    # ---------------------------------------------------------------- relay

    def _chunks_and_manifest(self, body: bytes) -> Tuple[List[Chunk], List[str]]:
        chunks = self.chunker.chunks_for(body)
        return chunks, [c.sha256 for c in chunks]

    def _build_envelope(
        self,
        body: bytes,
        *,
        chunks: List[Chunk],
        manifest: List[str],
        include_hashes: Optional[set] = None,
        exclude_acked: bool,
        forward_headers: Dict[str, str],
        stream: bool,
        method: str,
    ) -> bytes:
        if include_hashes is not None:
            wanted = include_hashes
        elif exclude_acked:
            wanted = {c.sha256 for c in chunks if c.sha256 not in self.acked}
        else:
            wanted = {c.sha256 for c in chunks}
        new = [
            (c.sha256, body[c.offset : c.offset + c.length])
            for c in chunks
            if c.sha256 in wanted
        ]
        return build_envelope(
            body,
            manifest=manifest,
            new_chunks=new,
            forward_headers=forward_headers,
            method=method,
            stream=stream,
        )

    def _attempt(
        self,
        route: str,
        path: str,
        envelope: bytes,
    ) -> Tuple[Optional["urllib.request.addinfourl"], Optional[urllib.error.HTTPError], Dict[str, str], bytes]:
        """One HTTP attempt. Returns (response, http_error, headers, error_body)."""
        url = "%s/r/%s/%s" % (self.base_url, route, path.lstrip("/"))
        request = urllib.request.Request(
            url, data=envelope, headers=self._headers(), method="POST"
        )
        try:
            response = urllib.request.urlopen(request, timeout=self.timeout)
            return response, None, {}, b""
        except urllib.error.HTTPError as exc:
            headers = {k.lower(): v for k, v in exc.headers.items()}
            raw = exc.read()
            return None, exc, headers, raw
        except (urllib.error.URLError, OSError) as exc:
            # Never reached the relay: nothing was dispatched, safe to report.
            raise RelayError("relay unreachable: %s" % (exc,), dispatched=False)

    def _missing_from_409(self, raw: bytes) -> List[str]:
        try:
            obj = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            raise RelayError(
                "malformed 409 body from relay", status=409, dispatched=False
            )
        missing = obj.get("missing")
        if not isinstance(missing, list) or not missing:
            raise RelayError(
                "409 without a usable missing list", status=409, dispatched=False
            )
        return [m for m in missing if isinstance(m, str)]

    def relay(
        self,
        route: str,
        path: str,
        body: bytes,
        *,
        forward_headers: Optional[Dict[str, str]] = None,
        stream: bool = False,
        method: str = "POST",
    ) -> RelayResult:
        """Send a request through the relay, buffering the whole response.

        Use :meth:`relay_stream` for SSE responses.
        """
        forward_headers = dict(forward_headers or {})
        chunks, manifest = self._chunks_and_manifest(body)
        envelope = self._build_envelope(
            body,
            chunks=chunks,
            manifest=manifest,
            exclude_acked=True,
            forward_headers=forward_headers,
            stream=stream,
            method=method,
        )

        miss_roundtrips = 0
        while True:
            response, exc, err_headers, err_body = self._attempt(route, path, envelope)
            if exc is not None:
                if exc.code == 409 and miss_roundtrips == 0:
                    miss_roundtrips = 1
                    missing = set(self._missing_from_409(err_body))
                    envelope = self._build_envelope(
                        body,
                        chunks=chunks,
                        manifest=manifest,
                        include_hashes=missing,
                        exclude_acked=False,
                        forward_headers=forward_headers,
                        stream=stream,
                        method=method,
                    )
                    continue
                raise RelayError(
                    "relay returned HTTP %d: %s"
                    % (exc.code, err_body[:400].decode("utf-8", "replace")),
                    status=exc.code,
                    dispatched=err_headers.get(H_DISPATCHED.lower()) == "1",
                )

            assert response is not None
            payload = response.read()
            headers = {k.lower(): v for k, v in response.headers.items()}
            status = getattr(response, "status", None) or response.getcode()
            response.close()
            break

        metrics = _metrics_from_headers(headers)
        metrics["miss_roundtrips"] = miss_roundtrips
        metrics["status"] = status
        if status == 200 and metrics.get("dispatched"):
            # Dispatch succeeded and the body verified upstream-side: the relay
            # provably holds every manifest chunk now.
            self.acked.add(manifest)
        return RelayResult(status, headers, payload, metrics)

    def relay_stream(
        self,
        route: str,
        path: str,
        body: bytes,
        *,
        forward_headers: Optional[Dict[str, str]] = None,
        method: str = "POST",
    ) -> Iterator[bytes]:
        """Stream the upstream response verbatim.

        Yields raw bytes exactly as the provider sent them. If the relay's
        upstream connection breaks mid-stream, the chunked response is left
        unterminated and this raises RelayError(dispatched=True) - the caller
        must surface a normal stream error and MUST NOT resend.
        """
        forward_headers = dict(forward_headers or {})
        chunks, manifest = self._chunks_and_manifest(body)
        envelope = self._build_envelope(
            body,
            chunks=chunks,
            manifest=manifest,
            exclude_acked=True,
            forward_headers=forward_headers,
            stream=True,
            method=method,
        )

        miss_roundtrips = 0
        while True:
            response, exc, err_headers, err_body = self._attempt(route, path, envelope)
            if exc is not None:
                if exc.code == 409 and miss_roundtrips == 0:
                    miss_roundtrips = 1
                    missing = set(self._missing_from_409(err_body))
                    envelope = self._build_envelope(
                        body,
                        chunks=chunks,
                        manifest=manifest,
                        include_hashes=missing,
                        exclude_acked=False,
                        forward_headers=forward_headers,
                        stream=True,
                        method=method,
                    )
                    continue
                raise RelayError(
                    "relay returned HTTP %d: %s"
                    % (exc.code, err_body[:400].decode("utf-8", "replace")),
                    status=exc.code,
                    dispatched=err_headers.get(H_DISPATCHED.lower()) == "1",
                )
            break

        assert response is not None
        headers = {k.lower(): v for k, v in response.headers.items()}
        self.acked.add(manifest)
        try:
            while True:
                piece = (
                    response.read1(READ_BLOCK)
                    if hasattr(response, "read1")
                    else response.read(READ_BLOCK)
                )
                if not piece:
                    break
                yield piece
        except Exception as exc:
            raise RelayError(
                "stream truncated by relay after dispatch (do NOT resend): %s" % (exc,),
                dispatched=True,
            )
        finally:
            try:
                response.close()
            except Exception:
                pass

    # --------------------------------------------------------------- direct

    def direct(
        self,
        base_url: str,
        path: str,
        body: bytes,
        *,
        forward_headers: Optional[Dict[str, str]] = None,
        method: str = "POST",
        timeout: Optional[float] = None,
    ) -> RelayResult:
        """DIRECT mode: call the provider straight from Windows.

        Keys are local in this design (the relay holds none), so DIRECT is
        simply "don't rewrite the base_url". Never used as an automatic
        fallback for an already-dispatched request.
        """
        url = base_url.rstrip("/") + "/" + path.lstrip("/")
        request = urllib.request.Request(
            url, data=body, headers=dict(forward_headers or {}), method=method
        )
        started = time.time()
        try:
            response = urllib.request.urlopen(request, timeout=timeout or self.timeout)
        except urllib.error.HTTPError as exc:
            response = exc
        except (urllib.error.URLError, OSError) as exc:
            raise RelayError("direct upstream unreachable: %s" % (exc,), dispatched=True)
        payload = response.read()
        headers = {k.lower(): v for k, v in response.headers.items()}
        status = getattr(response, "status", None) or response.getcode()
        response.close()
        return RelayResult(
            status,
            headers,
            payload,
            {"mode": "direct", "latency_ms": (time.time() - started) * 1000.0},
        )


def _metrics_from_headers(headers: Dict[str, str]) -> dict:
    def num(key: str) -> Optional[int]:
        value = headers.get(key.lower())
        try:
            return int(value) if value is not None else None
        except ValueError:
            return None

    return {
        "dispatched": headers.get(H_DISPATCHED.lower()) == "1",
        "route": headers.get(H_ROUTE.lower()),
        "body_sha256": headers.get(H_BODY_SHA.lower()),
        "body_len": num(H_BODY_LEN),
        "chunks_total": num(H_CHUNKS_TOTAL),
        "chunks_new": num(H_CHUNKS_NEW),
        "wire_bytes": num(H_WIRE_BYTES),
        "bytes_saved": num(H_BYTES_SAVED),
        "saved_pct": headers.get(H_SAVED_PCT.lower()),
    }
