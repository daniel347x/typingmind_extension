"""LLM Relay server: stdlib-only HTTP relay with SSE passthrough.

Endpoint map (all require X-Relay-Token except /relay/health)::

    GET  /relay/health          liveness
    GET  /relay/metrics         counters + store stats
    GET  /relay/routes          configured route names (no secrets)
    POST /relay/chunks          bulk chunk upload  {"chunks":[{"sha256","b64"}]}
    POST /relay/has             existence query    {"sha256":[...]}
    POST /relay/store/evict     force LRU pass     {"target_bytes":N}
    POST /relay/store/clear     wipe store (disposable by contract)
    POST /r/<route>/<path...>   the relay itself (envelope body)

Safety rules implemented here (spec v1 sections 5 and 10):

* Dispatch happens ONLY after (a) every manifest chunk is present and
  (b) sha256(concat) == body_sha256 and len == body_len. Failures return
  409 / 422 and never reach a provider.
* Once dispatched, the relay never retries. An upstream break mid-stream is
  surfaced as an unterminated chunked response (client sees truncation),
  exactly like a provider dropping the connection.
* No timeout on the upstream stream (reasoning models can stream for many
  minutes). Config exposes upstream_read_timeout=None by default and setting
  it is documented as a deliberate deviation.
* Byte-identical passthrough: the body is never parsed for transformation and
  response bytes are copied verbatim.
"""

from __future__ import annotations

import base64
import binascii
import json
import logging
import socket
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Dict, List, Optional, Tuple

from . import __version__
from .cdc import sha256_hex
from .config import Config, Route
from .metrics import Metrics
from .protocol import (
    HOP_BY_HOP,
    H_BODY_LEN,
    H_BODY_SHA,
    H_BYTES_SAVED,
    H_CHUNKS_NEW,
    H_CHUNKS_TOTAL,
    H_DISPATCHED,
    H_MISS_RT,
    H_ROUTE,
    H_SAVED_PCT,
    H_WIRE_BYTES,
    HEADER_TOKEN,
    Envelope,
    ProtocolError,
    parse_envelope,
)
from .store import ChunkStore, CorruptChunkError

log = logging.getLogger("llm-relay")

READ_BLOCK = 65536


class RelayApp:
    """Shared application state (config, store, metrics)."""

    def __init__(self, config: Config, store: Optional[ChunkStore] = None) -> None:
        self.config = config
        self.store = store or ChunkStore(
            config.store_dir, capacity_bytes=config.capacity_bytes
        )
        self.metrics = Metrics()

    def snapshot(self) -> dict:
        snap = self.metrics.snapshot(self.store.stats())
        snap["version"] = __version__
        snap["config"] = self.config.to_dict()
        return snap


class RelayHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "LLMRelay/" + __version__
    sys_version = ""
    #: Unbuffered writes: every chunk goes straight onto the socket, which is
    #: what keeps SSE latency low.
    wbufsize = 0

    # ------------------------------------------------------------- plumbing

    @property
    def app(self) -> RelayApp:
        return self.server.relay  # type: ignore[attr-defined]

    def log_message(self, fmt: str, *args) -> None:  # pragma: no cover
        log.debug("%s - %s", self.address_string(), fmt % args)

    def _authorized(self) -> bool:
        import hmac

        supplied = self.headers.get(HEADER_TOKEN, "")
        expected = self.app.config.token
        return bool(expected) and hmac.compare_digest(supplied, expected)

    def _send_json(
        self, status: int, obj: dict, extra_headers: Optional[Dict[str, str]] = None
    ) -> None:
        payload = json.dumps(obj, separators=(",", ":")).encode("utf-8")
        self.send_response_only(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("X-Relay-Version", __version__)
        for key, value in (extra_headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True

    def _send_error(self, status: int, code: str, message: str, **extra) -> None:
        body = {"error": code, "message": message}
        body.update(extra)
        self._send_json(status, body)

    def _read_body(self, limit: int) -> bytes:
        length_header = self.headers.get("Content-Length")
        if length_header is None:
            raise ProtocolError(411, "missing_content_length", "Content-Length required")
        try:
            length = int(length_header)
        except ValueError:
            raise ProtocolError(400, "bad_content_length", "Content-Length not an integer")
        if length < 0:
            raise ProtocolError(400, "bad_content_length", "Content-Length negative")
        if length > limit:
            raise ProtocolError(
                413,
                "request_too_large",
                "request body %d bytes exceeds limit %d" % (length, limit),
            )
        data = self.rfile.read(length) if length else b""
        if len(data) != length:
            raise ProtocolError(400, "truncated_body", "request body truncated")
        return data

    # ---------------------------------------------------------- chunked I/O

    def _begin_response(
        self,
        status: int,
        headers: List[Tuple[str, str]],
        *,
        chunked: bool,
        content_length: Optional[int] = None,
    ) -> None:
        self.send_response_only(status)
        for key, value in headers:
            self.send_header(key, value)
        if chunked:
            self.send_header("Transfer-Encoding", "chunked")
        elif content_length is not None:
            self.send_header("Content-Length", str(content_length))
        self.end_headers()

    def _write_chunk(self, data: bytes) -> None:
        self.wfile.write(b"%x\r\n" % len(data))
        self.wfile.write(data)
        self.wfile.write(b"\r\n")
        self.wfile.flush()

    def _end_chunked(self) -> None:
        self.wfile.write(b"0\r\n\r\n")
        self.wfile.flush()

    def _abort_chunked(self) -> None:
        """Terminate WITHOUT the final zero-length chunk.

        The client therefore observes a truncated body - the same signal a real
        provider disconnect produces. This is deliberate: the relay must not
        pretend a broken stream completed, and must not retry it.
        """
        self.close_connection = True
        try:
            self.wfile.flush()
        except Exception:
            pass
        try:
            self.connection.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass

    # --------------------------------------------------------------- verbs

    def do_GET(self) -> None:  # noqa: N802 (stdlib name)
        path = self.path.split("?", 1)[0]
        if path == "/relay/health":
            self._send_json(200, {"ok": True, "version": __version__})
            return
        if not self._authorized():
            self.app.metrics.record_request({"kind": "unauthorized"})
            self._send_error(401, "unauthorized", "missing or invalid %s" % HEADER_TOKEN)
            return
        if path == "/relay/metrics":
            self._send_json(200, self.app.snapshot())
            return
        if path == "/relay/routes":
            self._send_json(
                200,
                {
                    "routes": [r.to_dict() for r in self.app.config.routes.values()],
                },
            )
            return
        self._send_error(404, "not_found", "no such endpoint: %s" % path)

    def do_POST(self) -> None:  # noqa: N802 (stdlib name)
        cfg = self.app.config
        path = self.path.split("?", 1)[0]

        if not self._authorized():
            self.app.metrics.record_request({"kind": "unauthorized"})
            self._send_error(401, "unauthorized", "missing or invalid %s" % HEADER_TOKEN)
            return

        try:
            if path == "/relay/chunks":
                self._handle_chunk_upload()
            elif path == "/relay/has":
                self._handle_has()
            elif path == "/relay/store/evict":
                self._handle_evict()
            elif path == "/relay/store/clear":
                self._handle_clear()
            elif path.startswith("/r/"):
                self._handle_relay(path)
            else:
                self._send_error(404, "not_found", "no such endpoint: %s" % path)
        except ProtocolError as exc:
            self.app.metrics.record_request({"kind": "bad_envelope", "code": exc.code})
            log.warning("protocol error %s: %s", exc.code, exc.message)
            self._send_error(exc.status, exc.code, exc.message)
        except CorruptChunkError as exc:
            self.app.metrics.record_request({"kind": "bad_envelope", "code": "chunk_corrupt"})
            log.warning("corrupt chunk rejected: %s", exc)
            self._send_error(422, "chunk_corrupt", str(exc))
        except Exception as exc:  # pragma: no cover - defensive
            log.exception("unhandled error on %s", path)
            try:
                self._send_error(500, "internal_error", "%s: %s" % (type(exc).__name__, exc))
            except Exception:
                self.close_connection = True
        _ = cfg

    # ------------------------------------------------------- ops endpoints

    def _handle_chunk_upload(self) -> None:
        raw = self._read_body(self.app.config.max_envelope_bytes)
        try:
            obj = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ProtocolError(400, "bad_json", str(exc))
        chunks = obj.get("chunks") if isinstance(obj, dict) else None
        if not isinstance(chunks, list):
            raise ProtocolError(400, "bad_chunks", "expected {'chunks': [...]}")

        stored = 0
        nbytes = 0
        for item in chunks:
            if not isinstance(item, dict):
                raise ProtocolError(400, "bad_chunk_item", "chunk entries must be objects")
            sha = item.get("sha256")
            b64 = item.get("b64")
            if not isinstance(sha, str) or not isinstance(b64, str):
                raise ProtocolError(400, "bad_chunk_item", "chunk needs sha256 and b64")
            try:
                data = base64.b64decode(b64.encode("ascii"), validate=True)
            except (binascii.Error, UnicodeEncodeError, ValueError) as exc:
                raise ProtocolError(400, "bad_chunk_b64", str(exc))
            # put() verifies sha256(data) == sha and raises otherwise.
            if self.app.store.put(sha, data):
                stored += 1
            nbytes += len(data)

        self.app.metrics.record_chunk_upload(len(chunks), nbytes)
        self.app.store.evict_to_capacity()
        self._send_json(
            200,
            {
                "received": len(chunks),
                "stored": stored,
                "bytes": nbytes,
                "total_bytes": self.app.store.total_bytes(),
            },
        )

    def _handle_has(self) -> None:
        raw = self._read_body(self.app.config.max_envelope_bytes)
        try:
            obj = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ProtocolError(400, "bad_json", str(exc))
        hashes = obj.get("sha256") if isinstance(obj, dict) else None
        if not isinstance(hashes, list):
            raise ProtocolError(400, "bad_request", "expected {'sha256': [...]}")
        missing = self.app.store.missing([h for h in hashes if isinstance(h, str)])
        present = [h for h in hashes if isinstance(h, str) and h not in set(missing)]
        self._send_json(200, {"present": present, "missing": missing})

    def _handle_evict(self) -> None:
        raw = self._read_body(1 << 20)
        target = None
        if raw:
            try:
                obj = json.loads(raw.decode("utf-8"))
                if isinstance(obj, dict) and obj.get("target_bytes") is not None:
                    target = int(obj["target_bytes"])
            except (UnicodeDecodeError, json.JSONDecodeError, ValueError, TypeError):
                raise ProtocolError(400, "bad_json", "invalid evict body")
        freed = self.app.store.evict_to_capacity(target)
        self._send_json(200, {"freed_bytes": freed, "total_bytes": self.app.store.total_bytes()})

    def _handle_clear(self) -> None:
        freed = self.app.store.clear()
        log.warning("chunk store cleared: %d bytes freed", freed)
        self._send_json(200, {"freed_bytes": freed, "total_bytes": 0})

    # --------------------------------------------------------- relay itself

    def _handle_relay(self, path: str) -> None:
        started = time.time()
        cfg = self.app.config

        # /r/<route>/<original path...>
        parts = path.split("/", 3)  # ['', 'r', route, rest]
        if len(parts) < 3 or not parts[2]:
            raise ProtocolError(400, "bad_route", "expected /r/<route>/<path>")
        route_name = parts[2]
        upstream_path = parts[3] if len(parts) > 3 else ""

        route: Optional[Route] = cfg.route(route_name)
        if route is None:
            self.app.metrics.record_request({"kind": "unknown_route", "route": route_name})
            self._send_error(
                404,
                "unknown_route",
                "no route named %r; configured: %s"
                % (route_name, ", ".join(cfg.route_names())),
                routes=cfg.route_names(),
            )
            return

        raw = self._read_body(cfg.max_envelope_bytes)
        env: Envelope = parse_envelope(
            raw,
            max_manifest_entries=cfg.max_manifest_entries,
            max_new_chunk_bytes=cfg.max_new_chunk_bytes,
            max_body_bytes=cfg.max_body_bytes,
        )

        # ---- Step 1: store any inline new chunks (hash-verified on put) ----
        newly_stored = 0
        for sha, data in env.new_chunks:
            if self.app.store.put(sha, data):
                newly_stored += 1

        # ---- Step 2: resolve manifest. Misses -> 409, NO dispatch. --------
        missing = self.app.store.missing(env.manifest)
        if missing:
            self.app.metrics.record_request(
                {
                    "kind": "missing",
                    "route": route_name,
                    "body_len": env.body_len,
                    "wire_bytes": len(raw),
                    "chunks_total": len(env.manifest),
                    "chunks_new": len(env.new_chunks),
                    "missing_count": len(missing),
                    "dispatched": False,
                    "latency_ms": (time.time() - started) * 1000.0,
                }
            )
            log.info(
                "route=%s missing %d/%d chunks -> 409 (no dispatch)",
                route_name,
                len(missing),
                len(env.manifest),
            )
            self._send_json(
                409,
                {
                    "error": "missing_chunks",
                    "missing": missing[:1000],
                    "missing_count": len(missing),
                    "message": "upload these chunks via POST /relay/chunks then retry the manifest once",
                },
                extra_headers={H_DISPATCHED: "0", H_ROUTE: route_name},
            )
            return

        # ---- Step 3: reconstruct and VERIFY. Mismatch -> 422, NO dispatch. -
        body = self.app.store.reconstruct(env.manifest)
        if body is None:  # pragma: no cover - race with eviction
            self._send_error(
                409,
                "missing_chunks",
                "chunks vanished during reconstruction (eviction race); retry once",
                missing=[],
                missing_count=0,
            )
            self.app.metrics.record_request({"kind": "missing", "route": route_name})
            return

        actual_sha = sha256_hex(body)
        if actual_sha != env.body_sha256 or len(body) != env.body_len:
            self.app.metrics.record_request(
                {
                    "kind": "verify_failed",
                    "route": route_name,
                    "body_len": env.body_len,
                    "actual_len": len(body),
                    "wire_bytes": len(raw),
                    "dispatched": False,
                    "latency_ms": (time.time() - started) * 1000.0,
                }
            )
            log.error(
                "VERIFICATION FAILED route=%s expected=%s/%d actual=%s/%d - aborting, no dispatch",
                route_name,
                env.body_sha256,
                env.body_len,
                actual_sha,
                len(body),
            )
            self._send_error(
                422,
                "body_verification_failed",
                "reconstructed body does not match body_sha256/body_len; request NOT dispatched",
                expected_sha256=env.body_sha256,
                actual_sha256=actual_sha,
                expected_len=env.body_len,
                actual_len=len(body),
            )
            return

        # ---- Step 4: DISPATCH. Beyond this point: never retry. ------------
        url = route.url_for(upstream_path)
        relay_headers = {
            H_DISPATCHED: "1",
            H_ROUTE: route_name,
            H_BODY_SHA: env.body_sha256,
            H_BODY_LEN: str(env.body_len),
            H_CHUNKS_TOTAL: str(len(env.manifest)),
            H_CHUNKS_NEW: str(len(env.new_chunks)),
            H_WIRE_BYTES: str(len(raw)),
            H_BYTES_SAVED: str(env.bytes_saved),
            H_SAVED_PCT: str(env.saved_pct),
            H_MISS_RT: "0",
        }

        log.info(
            "dispatch route=%s path=/%s body=%d wire=%d saved=%.2f%% chunks=%d/%d",
            route_name,
            upstream_path,
            env.body_len,
            len(raw),
            env.saved_pct,
            len(env.new_chunks),
            len(env.manifest),
        )

        try:
            self._forward_and_stream(url, body, env, route_name, relay_headers, started)
        finally:
            # Best-effort LRU housekeeping; never blocks the response.
            try:
                if self.app.store.total_bytes() > cfg.capacity_bytes:
                    self.app.store.evict_to_capacity()
            except Exception:  # pragma: no cover
                log.exception("eviction pass failed")

    # ------------------------------------------------------------ upstream

    def _forward_and_stream(
        self,
        url: str,
        body: bytes,
        env: Envelope,
        route_name: str,
        relay_headers: Dict[str, str],
        started: float,
    ) -> None:
        cfg = self.app.config
        request = urllib.request.Request(
            url, data=body, headers=dict(env.forward_headers), method=env.method
        )

        try:
            response = urllib.request.urlopen(request, timeout=cfg.upstream_read_timeout)
        except urllib.error.HTTPError as exc:
            # A provider 4xx/5xx IS a normal response: forward it verbatim.
            response = exc
        except (urllib.error.URLError, socket.timeout, OSError) as exc:
            # Failure BEFORE the response arrived. Nothing was streamed, so the
            # shim can safely report an error; we do not retry.
            self.app.metrics.record_request(
                {
                    "kind": "upstream_error",
                    "route": route_name,
                    "body_len": env.body_len,
                    "wire_bytes": env.wire_bytes,
                    "chunks_total": len(env.manifest),
                    "chunks_new": len(env.new_chunks),
                    "dispatched": True,
                    "latency_ms": (time.time() - started) * 1000.0,
                }
            )
            reason = getattr(exc, "reason", exc)
            log.error("upstream connect failed route=%s url=%s: %s", route_name, url, reason)
            self._send_error(
                502,
                "upstream_unreachable",
                "could not reach upstream (request WAS dispatched; relay will not retry): %s"
                % (reason,),
                **relay_headers,
            )
            return

        status = getattr(response, "status", None) or response.getcode()
        upstream_headers: List[Tuple[str, str]] = []
        content_type = ""
        for key, value in response.headers.items():
            lowered = key.lower()
            if lowered in HOP_BY_HOP or lowered == "content-length":
                continue
            if lowered == "content-type":
                content_type = value.lower()
            upstream_headers.append((key, value))

        streaming = env.stream or "text/event-stream" in content_type
        all_headers = upstream_headers + list(relay_headers.items())

        if not streaming:
            try:
                payload = response.read()
            except Exception as exc:
                log.error("upstream read failed (post-dispatch): %s", exc)
                self._send_error(
                    502,
                    "upstream_read_failed",
                    "upstream read failed after dispatch; relay will not retry: %s" % exc,
                    **relay_headers,
                )
                self.app.metrics.record_request(
                    {
                        "kind": "upstream_error",
                        "route": route_name,
                        "body_len": env.body_len,
                        "wire_bytes": env.wire_bytes,
                        "dispatched": True,
                        "latency_ms": (time.time() - started) * 1000.0,
                    }
                )
                return
            self._begin_response(
                status, all_headers, chunked=False, content_length=len(payload)
            )
            try:
                self.wfile.write(payload)
            except (BrokenPipeError, ConnectionResetError):
                self.close_connection = True
            finally:
                response.close()
            self.app.metrics.record_request(
                {
                    "kind": "ok",
                    "route": route_name,
                    "status": status,
                    "body_len": env.body_len,
                    "wire_bytes": env.wire_bytes,
                    "response_bytes": len(payload),
                    "chunks_total": len(env.manifest),
                    "chunks_new": len(env.new_chunks),
                    "dispatched": True,
                    "streaming": False,
                    "latency_ms": (time.time() - started) * 1000.0,
                }
            )
            return

        # ---- streaming path: chunked passthrough, no upstream timeout ----
        self._begin_response(status, all_headers, chunked=True)
        total = 0
        interrupted = False
        try:
            while True:
                # read1() returns as soon as ANY bytes are available, which is
                # what keeps SSE token latency low (read(n) would block to fill).
                piece = response.read1(READ_BLOCK) if hasattr(response, "read1") else response.read(READ_BLOCK)
                if not piece:
                    break
                total += len(piece)
                self._write_chunk(piece)
            self._end_chunked()
        except (BrokenPipeError, ConnectionResetError) as exc:
            # Client went away. Stop pulling from upstream; nothing to retry.
            interrupted = True
            log.warning("client disconnected mid-stream route=%s: %s", route_name, exc)
            self.close_connection = True
        except Exception as exc:
            # Upstream broke mid-stream. Terminate abnormally so the client
            # sees truncation, and NEVER retry (that could double-generate).
            interrupted = True
            log.error(
                "upstream stream interrupted route=%s after %d bytes: %s",
                route_name,
                total,
                exc,
            )
            self._abort_chunked()
        finally:
            try:
                response.close()
            except Exception:
                pass

        self.app.metrics.record_request(
            {
                "kind": "interrupted" if interrupted else "ok",
                "route": route_name,
                "status": status,
                "body_len": env.body_len,
                "wire_bytes": env.wire_bytes,
                "response_bytes": total,
                "chunks_total": len(env.manifest),
                "chunks_new": len(env.new_chunks),
                "dispatched": True,
                "streaming": True,
                "latency_ms": (time.time() - started) * 1000.0,
            }
        )


class RelayServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 128

    def __init__(self, app: RelayApp, bind: str, port: int) -> None:
        self.relay = app
        super().__init__((bind, port), RelayHandler)

    def server_bind(self) -> None:
        # Low-latency streaming: don't let Nagle batch SSE chunks.
        self.socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        super().server_bind()


def serve(
    config: Config,
    *,
    store: Optional[ChunkStore] = None,
    log_level: int = logging.INFO,
) -> RelayServer:
    """Build (but do not start) a bound RelayServer."""
    logging.basicConfig(
        level=log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s"
    )
    app = RelayApp(config, store=store)
    server = RelayServer(app, config.bind, config.port)
    if config.bind_warning:
        log.warning("%s", config.bind_warning)
    log.info(
        "llm-relay %s listening on %s:%d store=%s routes=%s",
        __version__,
        config.bind,
        config.port,
        app.store.root,
        ",".join(config.route_names()),
    )
    return server


def run_forever(config: Config, **kwargs) -> None:
    server = serve(config, **kwargs)
    try:
        server.serve_forever(poll_interval=0.2)
    except KeyboardInterrupt:
        log.info("shutting down")
    finally:
        server.server_close()
        server.relay.store.close()
