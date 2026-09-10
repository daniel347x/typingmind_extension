"""Wire protocol: envelope parsing, validation and error codes.

The relay endpoint is::

    POST /r/<route>/<original-path>

with a JSON *envelope* body. The original provider request body is NOT sent
inline - it is described by a manifest of chunk hashes plus any chunks the
relay does not already hold. The original request headers (including
Authorization) travel inside the envelope as forward_headers, which keeps them
unambiguous and separate from relay-level auth.

Envelope::

    {
      "v": 1,
      "method": "POST",
      "body_sha256": "<64 hex>",
      "body_len": 4123456,
      "manifest": ["<64 hex>", ...],
      "new_chunks": [{"sha256": "<64 hex>", "b64": "<base64>"}],
      "forward_headers": {"authorization": "Bearer ...", "content-type": "application/json"},
      "stream": true
    }

Failure semantics - the two rules that make this safe:

1. Misses and verification failures are reported BEFORE dispatch (409 / 422).
   Neither can cause a provider call, so neither can duplicate a generation.
2. Once dispatched, the relay never retries. If the upstream stream breaks,
   the response is terminated abnormally (chunked encoding left unterminated)
   so the client observes truncation exactly as it would from a provider that
   dropped the connection. The presence of X-Relay-Dispatched: 1 in the
   already-sent response headers tells the shim dispatch happened.
"""

from __future__ import annotations

import base64
import binascii
import json
from typing import Dict, List, Tuple

from . import PROTOCOL_VERSION
from .store import is_hex_sha256

#: Relay-level auth header (distinct from anything forwarded upstream).
HEADER_TOKEN = "X-Relay-Token"

#: Response headers the relay adds. Set before the body starts streaming.
H_DISPATCHED = "X-Relay-Dispatched"
H_BODY_SHA = "X-Relay-Body-Sha256"
H_BODY_LEN = "X-Relay-Body-Len"
H_CHUNKS_TOTAL = "X-Relay-Chunks-Total"
H_CHUNKS_NEW = "X-Relay-Chunks-New"
H_WIRE_BYTES = "X-Relay-Wire-Bytes"
H_BYTES_SAVED = "X-Relay-Bytes-Saved"
H_SAVED_PCT = "X-Relay-Saved-Pct"
H_MISS_RT = "X-Relay-Miss-Roundtrips"
H_ROUTE = "X-Relay-Route"

#: Hop-by-hop headers: never forwarded in either direction (RFC 7230 6.1).
HOP_BY_HOP = frozenset(
    {
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailers",
        "transfer-encoding",
        "upgrade",
    }
)

#: Request headers the relay must not forward upstream. content-length and host
#: are recomputed by the HTTP client; x-relay-* are ours.
_STRIP_FORWARD = frozenset({"content-length", "host"})

ALLOWED_METHODS = frozenset({"POST", "GET"})

MAX_INLINE_CHUNKS = 100_000


class ProtocolError(Exception):
    """A malformed or disallowed request. Carries an HTTP status for the reply."""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message

    def to_dict(self) -> dict:
        return {"error": self.code, "message": self.message}


class Envelope:
    """A validated relay envelope."""

    __slots__ = (
        "method",
        "body_sha256",
        "body_len",
        "manifest",
        "new_chunks",
        "forward_headers",
        "stream",
        "wire_bytes",
    )

    def __init__(
        self,
        *,
        method: str,
        body_sha256: str,
        body_len: int,
        manifest: List[str],
        new_chunks: List[Tuple[str, bytes]],
        forward_headers: Dict[str, str],
        stream: bool,
        wire_bytes: int = 0,
    ) -> None:
        self.method = method
        self.body_sha256 = body_sha256
        self.body_len = body_len
        self.manifest = manifest
        self.new_chunks = new_chunks
        self.forward_headers = forward_headers
        self.stream = stream
        self.wire_bytes = wire_bytes

    @property
    def bytes_saved(self) -> int:
        """Body bytes that did NOT cross the wire this request."""
        return max(0, self.body_len - self.wire_bytes)

    @property
    def saved_pct(self) -> float:
        if self.body_len <= 0:
            return 0.0
        return round(100.0 * self.bytes_saved / self.body_len, 3)


def _require(cond: bool, status: int, code: str, message: str) -> None:
    if not cond:
        raise ProtocolError(status, code, message)


def parse_envelope(
    raw: bytes,
    *,
    max_manifest_entries: int,
    max_new_chunk_bytes: int,
    max_body_bytes: int,
) -> Envelope:
    """Parse and validate an envelope. Raises ProtocolError on any problem.

    Validation is strict and total: nothing reaches the chunk store or the
    provider unless the envelope is well-formed and within limits.
    """
    _require(len(raw) > 0, 400, "empty_envelope", "request body is empty")
    try:
        obj = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProtocolError(400, "bad_json", "envelope is not valid JSON: %s" % exc)
    _require(isinstance(obj, dict), 400, "bad_envelope", "envelope must be a JSON object")

    version = obj.get("v")
    _require(
        version == PROTOCOL_VERSION,
        400,
        "bad_version",
        "unsupported protocol version %r (expected %d)" % (version, PROTOCOL_VERSION),
    )

    method = obj.get("method", "POST")
    _require(
        isinstance(method, str) and method.upper() in ALLOWED_METHODS,
        400,
        "bad_method",
        "method must be one of %s" % sorted(ALLOWED_METHODS),
    )

    body_sha = obj.get("body_sha256")
    _require(
        is_hex_sha256(body_sha), 400, "bad_body_sha256", "body_sha256 must be 64-hex"
    )

    body_len = obj.get("body_len")
    _require(
        isinstance(body_len, int) and not isinstance(body_len, bool) and body_len >= 0,
        400,
        "bad_body_len",
        "body_len must be a non-negative integer",
    )
    _require(
        body_len <= max_body_bytes,
        413,
        "body_too_large",
        "body_len %d exceeds limit %d" % (body_len, max_body_bytes),
    )

    manifest = obj.get("manifest")
    _require(isinstance(manifest, list), 400, "bad_manifest", "manifest must be a list")
    _require(len(manifest) > 0, 400, "empty_manifest", "manifest must not be empty")
    _require(
        len(manifest) <= max_manifest_entries,
        413,
        "manifest_too_large",
        "manifest has %d entries, limit %d" % (len(manifest), max_manifest_entries),
    )
    for entry in manifest:
        _require(
            is_hex_sha256(entry),
            400,
            "bad_manifest_entry",
            "manifest entries must be 64-hex, got %r" % (entry,),
        )

    # Individual chunk lengths are deliberately absent from the manifest (it
    # stays small: 64 hex chars per chunk). The authoritative integrity check
    # is body_sha256 + body_len against the concatenation, performed after
    # reconstruction and before dispatch.

    raw_chunks = obj.get("new_chunks", [])
    _require(
        isinstance(raw_chunks, list), 400, "bad_new_chunks", "new_chunks must be a list"
    )
    _require(
        len(raw_chunks) <= MAX_INLINE_CHUNKS,
        413,
        "too_many_new_chunks",
        "new_chunks has %d entries, limit %d" % (len(raw_chunks), MAX_INLINE_CHUNKS),
    )

    new_chunks: List[Tuple[str, bytes]] = []
    inline_bytes = 0
    for item in raw_chunks:
        _require(
            isinstance(item, dict), 400, "bad_chunk_item", "new_chunks items must be objects"
        )
        sha = item.get("sha256")
        _require(
            is_hex_sha256(sha), 400, "bad_chunk_hash", "chunk sha256 must be 64-hex"
        )
        b64 = item.get("b64")
        _require(isinstance(b64, str), 400, "bad_chunk_data", "chunk b64 must be a string")
        try:
            data = base64.b64decode(b64.encode("ascii"), validate=True)
        except (binascii.Error, UnicodeEncodeError, ValueError) as exc:
            raise ProtocolError(400, "bad_chunk_b64", "invalid base64: %s" % exc)
        inline_bytes += len(data)
        new_chunks.append((sha, data))

    _require(
        inline_bytes <= max_new_chunk_bytes,
        413,
        "new_chunks_too_large",
        "inline new chunks total %d bytes, limit %d" % (inline_bytes, max_new_chunk_bytes),
    )

    headers_raw = obj.get("forward_headers", {})
    _require(
        isinstance(headers_raw, dict),
        400,
        "bad_forward_headers",
        "forward_headers must be an object",
    )
    forward_headers: Dict[str, str] = {}
    for key, value in headers_raw.items():
        _require(
            isinstance(key, str) and isinstance(value, str),
            400,
            "bad_header_type",
            "forward_headers keys and values must be strings",
        )
        lowered = key.lower()
        if lowered in HOP_BY_HOP or lowered in _STRIP_FORWARD:
            continue
        if lowered.startswith("x-relay-"):
            continue
        # Reject CR/LF outright - header injection defence in depth.
        _require(
            "\r" not in value and "\n" not in value and "\r" not in key and "\n" not in key,
            400,
            "bad_header_value",
            "header %r contains CR/LF" % (key,),
        )
        forward_headers[key] = value

    stream = obj.get("stream", False)
    _require(isinstance(stream, bool), 400, "bad_stream", "stream must be a boolean")

    return Envelope(
        method=method.upper(),
        body_sha256=body_sha,
        body_len=body_len,
        manifest=list(manifest),
        new_chunks=new_chunks,
        forward_headers=forward_headers,
        stream=stream,
        wire_bytes=len(raw),
    )


def build_envelope(
    body: bytes,
    *,
    manifest: List[str],
    new_chunks: List[Tuple[str, bytes]],
    forward_headers: Dict[str, str],
    method: str = "POST",
    stream: bool = False,
) -> bytes:
    """Serialise an envelope (client-side helper; used by shimref and tests)."""
    from .cdc import sha256_hex

    obj = {
        "v": PROTOCOL_VERSION,
        "method": method,
        "body_sha256": sha256_hex(body),
        "body_len": len(body),
        "manifest": manifest,
        "new_chunks": [
            {"sha256": sha, "b64": base64.b64encode(data).decode("ascii")}
            for sha, data in new_chunks
        ],
        "forward_headers": forward_headers,
        "stream": stream,
    }
    return json.dumps(obj, separators=(",", ":")).encode("utf-8")
