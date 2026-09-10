"""Relay metrics: thread-safe counters plus per-request records.

Everything here is observability, not correctness. The headline number is
bytes_saved - the payload bytes that did NOT cross the LTE uplink.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from typing import Deque, Dict, List, Optional


class Metrics:
    def __init__(self, *, recent_window: int = 500) -> None:
        self._lock = threading.Lock()
        self.started_at = time.time()

        self.requests = 0
        self.requests_ok = 0
        self.requests_missing = 0
        self.requests_verify_failed = 0
        self.requests_bad_envelope = 0
        self.requests_unauthorized = 0
        self.requests_unknown_route = 0
        self.requests_upstream_error = 0
        self.requests_interrupted = 0

        self.body_bytes = 0
        self.wire_bytes = 0
        self.response_bytes = 0

        self.chunks_total = 0
        self.chunks_new = 0
        self.miss_roundtrips = 0

        self.chunk_uploads = 0
        self.chunk_upload_bytes = 0

        self.latency_ms: List[float] = []  # rolling, capped below
        self._latency_window: Deque[float] = deque(maxlen=recent_window)
        self._recent: Deque[dict] = deque(maxlen=recent_window)

    # ---------------------------------------------------------------- record

    def record_request(self, rec: dict) -> None:
        with self._lock:
            self.requests += 1
            status_kind = rec.get("kind", "ok")
            attr = {
                "ok": "requests_ok",
                "missing": "requests_missing",
                "verify_failed": "requests_verify_failed",
                "bad_envelope": "requests_bad_envelope",
                "unauthorized": "requests_unauthorized",
                "unknown_route": "requests_unknown_route",
                "upstream_error": "requests_upstream_error",
                "interrupted": "requests_interrupted",
            }.get(status_kind)
            if attr:
                setattr(self, attr, getattr(self, attr) + 1)

            self.body_bytes += int(rec.get("body_len") or 0)
            self.wire_bytes += int(rec.get("wire_bytes") or 0)
            self.response_bytes += int(rec.get("response_bytes") or 0)
            self.chunks_total += int(rec.get("chunks_total") or 0)
            self.chunks_new += int(rec.get("chunks_new") or 0)
            self.miss_roundtrips += int(rec.get("miss_roundtrips") or 0)

            latency = rec.get("latency_ms")
            if latency is not None:
                self._latency_window.append(float(latency))

            rec = dict(rec)
            rec["t"] = round(time.time(), 3)
            self._recent.append(rec)

    def record_chunk_upload(self, count: int, nbytes: int) -> None:
        with self._lock:
            self.chunk_uploads += int(count)
            self.chunk_upload_bytes += int(nbytes)

    # ----------------------------------------------------------------- read

    @property
    def bytes_saved(self) -> int:
        with self._lock:
            return max(0, self.body_bytes - self.wire_bytes)

    def saved_pct(self) -> float:
        with self._lock:
            if self.body_bytes <= 0:
                return 0.0
            return round(100.0 * max(0, self.body_bytes - self.wire_bytes) / self.body_bytes, 3)

    def recent(self, limit: int = 50) -> List[dict]:
        with self._lock:
            items = list(self._recent)
        return items[-limit:]

    def snapshot(self, store_stats: Optional[dict] = None) -> dict:
        with self._lock:
            lat = list(self._latency_window)
            out = {
                "uptime_s": round(time.time() - self.started_at, 1),
                "requests": self.requests,
                "requests_ok": self.requests_ok,
                "requests_missing": self.requests_missing,
                "requests_verify_failed": self.requests_verify_failed,
                "requests_bad_envelope": self.requests_bad_envelope,
                "requests_unauthorized": self.requests_unauthorized,
                "requests_unknown_route": self.requests_unknown_route,
                "requests_upstream_error": self.requests_upstream_error,
                "requests_interrupted": self.requests_interrupted,
                "body_bytes": self.body_bytes,
                "wire_bytes": self.wire_bytes,
                "bytes_saved": max(0, self.body_bytes - self.wire_bytes),
                "saved_pct": (
                    round(100.0 * max(0, self.body_bytes - self.wire_bytes) / self.body_bytes, 3)
                    if self.body_bytes
                    else 0.0
                ),
                "response_bytes": self.response_bytes,
                "chunks_total": self.chunks_total,
                "chunks_new": self.chunks_new,
                "miss_roundtrips": self.miss_roundtrips,
                "chunk_uploads": self.chunk_uploads,
                "chunk_upload_bytes": self.chunk_upload_bytes,
                "latency_ms_avg": round(sum(lat) / len(lat), 2) if lat else None,
                "latency_ms_max": round(max(lat), 2) if lat else None,
                "latency_samples": len(lat),
            }
            if store_stats:
                out["store"] = store_stats
            return out
