"""Mock provider upstream for the relay test suite.

Endpoints::

    POST /echo         -> JSON {sha256, len, headers, body_head} of what it received
    POST /stream       -> text/event-stream, N events, properly terminated
    POST /breakstream  -> text/event-stream, 2 events, then socket closed WITHOUT
                          terminating (simulates a provider dropping the connection)
    POST /error500     -> 500 with a verbatim error body
    POST /slowstream   -> SSE with a deliberate pause between events
    GET  /probe        -> 200 "ok"
    GET  /_records     -> JSON request log
    POST /_records/reset -> clear the log

The request log is what lets the tests assert the single most important safety
property: that a failed or interrupted request caused EXACTLY ONE dispatch and
never a hidden second generation.
"""

from __future__ import annotations

import hashlib
import json
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import List

RECORDS_LOCK = threading.Lock()
RECORDS: List[dict] = []


def records() -> List[dict]:
    with RECORDS_LOCK:
        return list(RECORDS)


def reset_records() -> None:
    with RECORDS_LOCK:
        RECORDS.clear()


def count_path(path: str) -> int:
    with RECORDS_LOCK:
        return sum(1 for r in RECORDS if r["path"] == path)


class MockHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "MockProvider/1.0"
    sys_version = ""
    wbufsize = 0

    def log_message(self, fmt, *args):  # pragma: no cover
        pass

    # ------------------------------------------------------------- helpers

    def _read(self) -> bytes:
        length = int(self.headers.get("Content-Length", 0) or 0)
        return self.rfile.read(length) if length else b""

    def _record(self, body: bytes) -> dict:
        entry = {
            "t": time.time(),
            "method": self.command,
            "path": self.path,
            "len": len(body),
            "sha256": hashlib.sha256(body).hexdigest(),
            "headers": {k.lower(): v for k, v in self.headers.items()},
        }
        with RECORDS_LOCK:
            RECORDS.append(entry)
        return entry

    def _json(self, status: int, obj: dict) -> None:
        payload = json.dumps(obj).encode("utf-8")
        self.send_response_only(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True

    def _sse_start(self) -> None:
        self.send_response_only(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Mock-Marker", "sse")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()

    def _chunk_write(self, data: bytes) -> None:
        """Write one HTTP/1.1 chunk - how providers actually stream SSE."""
        self.wfile.write(b"%x\r\n" % len(data))
        self.wfile.write(data)
        self.wfile.write(b"\r\n")
        self.wfile.flush()

    def _sse_event(self, obj: dict) -> None:
        self._chunk_write(("data: %s\n\n" % json.dumps(obj)).encode("utf-8"))

    def _sse_terminate(self) -> None:
        self._chunk_write(b"data: [DONE]\n\n")
        # Terminating chunk: raw "0\r\n\r\n" (not wrapped in chunk format)
        self.wfile.write(b"0\r\n\r\n")
        self.wfile.flush()
        self.close_connection = True

    # --------------------------------------------------------------- verbs

    def do_GET(self) -> None:  # noqa: N802 (stdlib name)
        if self.path == "/probe":
            body = b"ok"
            self.send_response_only(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path == "/_records":
            self._json(200, {"records": records()})
            return
        self._json(404, {"error": "not_found", "path": self.path})

    def do_POST(self) -> None:  # noqa: N802 (stdlib name)
        if self.path == "/_records/reset":
            self._read()
            reset_records()
            self._json(200, {"reset": True})
            return

        body = self._read()
        entry = self._record(body)

        if self.path == "/echo":
            self._json(
                200,
                {
                    "sha256": entry["sha256"],
                    "len": entry["len"],
                    "headers": entry["headers"],
                    "body_head": body[:64].decode("utf-8", "replace"),
                },
            )
            return

        if self.path == "/stream":
            self._sse_start()
            for i in range(12):
                self._sse_event({"type": "delta", "i": i, "text": "token-%d" % i})
            self._sse_event({"type": "done", "usage": {"input": 4242}})
            self._sse_terminate()
            return

        if self.path == "/slowstream":
            self._sse_start()
            for i in range(5):
                self._sse_event({"type": "delta", "i": i})
                time.sleep(0.15)
            self._sse_event({"type": "done"})
            self._sse_terminate()
            return

        if self.path == "/breakstream":
            # Send two events, then close the socket WITHOUT the terminating
            # chunk so the client observes an incomplete chunked body.
            self._sse_start()
            self._sse_event({"type": "delta", "i": 0})
            self._sse_event({"type": "delta", "i": 1})
            try:
                self.connection.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            self.close_connection = True
            return

        if self.path == "/error500":
            payload = b'{"error":{"type":"overloaded","message":"provider is busy"}}'
            self.send_response_only(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("X-Mock-Error-Id", "err-abc-123")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        self._json(404, {"error": "not_found", "path": self.path})


class MockServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 64

    def server_bind(self) -> None:
        self.socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        super().server_bind()


def start_mock(host: str = "127.0.0.1", port: int = 0):
    """Start the mock upstream on an ephemeral port. Returns (server, thread, base_url)."""
    server = MockServer((host, port), MockHandler)
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.05})
    thread.daemon = True
    thread.start()
    bound = server.server_address[1]
    return server, thread, "http://%s:%d" % (host, bound)


def stop_mock(server, thread) -> None:
    server.shutdown()
    server.server_close()
    thread.join(timeout=5)
