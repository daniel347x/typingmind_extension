"""Content-addressed chunk store with LRU eviction.

Layout on disk::

    <root>/ab/cd/abcdef...<64 hex>        chunk bytes
    <db_path>                              hash -> size, atime, hits

Files are the source of truth for *content*; SQLite only carries LRU metadata.
Writes are temp-file -> fsync -> atomic rename, so a crash can never leave a
partial chunk that a hash would vouch for.

Tamper-evidence is structural: a chunk's name IS its SHA-256. Either the bytes
match the name or reconstruction fails verification and the request aborts
before dispatch. There is no stale-cache failure mode in this system.
"""

from __future__ import annotations

import os
import sqlite3
import tempfile
import threading
import time
from typing import Iterable, List, Optional, Sequence, Tuple

from .cdc import sha256_hex

DEFAULT_CAPACITY_BYTES = 100 * 1024 * 1024 * 1024  # 100 GB
_HEX_LEN = 64


def is_hex_sha256(value: object) -> bool:
    """True iff value is a 64-char lowercase hex string."""
    return (
        isinstance(value, str)
        and len(value) == _HEX_LEN
        and all(c in "0123456789abcdef" for c in value)
    )


class CorruptChunkError(Exception):
    """Raised when supplied bytes do not match the hash they claim."""


class ChunkStore:
    """Thread-safe content-addressed store."""

    def __init__(
        self,
        root: str,
        *,
        capacity_bytes: int = DEFAULT_CAPACITY_BYTES,
        db_path: Optional[str] = None,
    ) -> None:
        self.root = os.path.abspath(root)
        self.capacity_bytes = int(capacity_bytes)
        self.db_path = db_path or os.path.join(
            os.path.dirname(self.root) or ".", "index.sqlite"
        )
        os.makedirs(self.root, exist_ok=True)
        os.makedirs(os.path.dirname(self.db_path) or ".", exist_ok=True)

        self._lock = threading.RLock()
        self._db = sqlite3.connect(self.db_path, check_same_thread=False)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute("PRAGMA synchronous=NORMAL")
        self._db.execute(
            """
            CREATE TABLE IF NOT EXISTS chunks (
                sha256 TEXT PRIMARY KEY,
                size   INTEGER NOT NULL,
                atime  REAL NOT NULL,
                hits   INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        self._db.execute("CREATE INDEX IF NOT EXISTS ix_chunks_atime ON chunks(atime)")
        self._db.commit()

        row = self._db.execute("SELECT COALESCE(SUM(size), 0) FROM chunks").fetchone()
        self._total_bytes = int(row[0] or 0)

        self.puts = 0
        self.put_bytes = 0
        self.dedupe_skips = 0
        self.hits = 0
        self.misses = 0
        self.corrupt_rejects = 0
        self.evictions = 0
        self.evicted_bytes = 0

    # ---------------------------------------------------------------- paths

    def path_for(self, sha: str) -> str:
        if not is_hex_sha256(sha):
            raise ValueError("not a sha256 hex digest: %r" % (sha,))
        return os.path.join(self.root, sha[0:2], sha[2:4], sha)

    # ---------------------------------------------------------------- writes

    def put(self, sha: str, data: bytes, *, verify: bool = True) -> bool:
        """Store one chunk. Returns True if newly written, False if it existed.

        Raises CorruptChunkError if sha256(data) != sha - such a chunk is never
        written, and the caller must reject the request.
        """
        if not is_hex_sha256(sha):
            self.corrupt_rejects += 1
            raise CorruptChunkError("malformed hash: %r" % (sha,))
        actual = sha256_hex(data)
        if verify and actual != sha:
            self.corrupt_rejects += 1
            raise CorruptChunkError(
                "chunk hash mismatch: claimed %s actual %s" % (sha, actual)
            )

        path = self.path_for(sha)
        now = time.time()
        with self._lock:
            if os.path.exists(path):
                self.dedupe_skips += 1
                self._db.execute(
                    "UPDATE chunks SET atime=?, hits=hits+1 WHERE sha256=?", (now, sha)
                )
                self._db.commit()
                return False

            directory = os.path.dirname(path)
            os.makedirs(directory, exist_ok=True)
            fd, tmp = tempfile.mkstemp(dir=directory, prefix=".tmp-")
            try:
                with os.fdopen(fd, "wb") as fh:
                    fh.write(data)
                    fh.flush()
                    os.fsync(fh.fileno())
                os.replace(tmp, path)
            except BaseException:
                try:
                    os.unlink(tmp)
                except OSError:
                    pass
                raise

            self._db.execute(
                "INSERT OR REPLACE INTO chunks(sha256, size, atime, hits) VALUES(?,?,?,0)",
                (sha, len(data), now),
            )
            self._db.commit()
            self._total_bytes += len(data)
            self.puts += 1
            self.put_bytes += len(data)
        return True

    def put_many(self, items: Iterable[Tuple[str, bytes]]) -> int:
        """Store several chunks; returns count newly written."""
        written = 0
        for sha, data in items:
            if self.put(sha, data):
                written += 1
        return written

    # ----------------------------------------------------------------- reads

    def has(self, sha: str) -> bool:
        if not is_hex_sha256(sha):
            return False
        with self._lock:
            if not os.path.exists(self.path_for(sha)):
                self.misses += 1
                return False
            self.hits += 1
            self._db.execute(
                "UPDATE chunks SET atime=?, hits=hits+1 WHERE sha256=?",
                (time.time(), sha),
            )
            self._db.commit()
            return True

    def get(self, sha: str) -> Optional[bytes]:
        """Read one chunk, or None if absent."""
        if not is_hex_sha256(sha):
            return None
        path = self.path_for(sha)
        try:
            with open(path, "rb") as fh:
                data = fh.read()
        except FileNotFoundError:
            with self._lock:
                self.misses += 1
            return None
        with self._lock:
            self.hits += 1
            self._db.execute(
                "UPDATE chunks SET atime=?, hits=hits+1 WHERE sha256=?",
                (time.time(), sha),
            )
            self._db.commit()
        return data

    def missing(self, hashes: Sequence[str]) -> List[str]:
        """Subset of hashes not present on disk, order preserved."""
        out: List[str] = []
        for sha in hashes:
            if not is_hex_sha256(sha) or not os.path.exists(self.path_for(sha)):
                out.append(sha)
        with self._lock:
            self.misses += len(out)
            self.hits += len(hashes) - len(out)
        return out

    def reconstruct(self, manifest: Sequence[str]) -> Optional[bytes]:
        """Concatenate chunks in manifest order.

        Returns None if ANY chunk is absent - the caller must respond 409 and
        must NOT dispatch. Partial reconstruction is never returned.
        """
        parts: List[bytes] = []
        for sha in manifest:
            data = self.get(sha)
            if data is None:
                return None
            parts.append(data)
        return b"".join(parts)

    # ----------------------------------------------------------------- stats

    def total_bytes(self) -> int:
        with self._lock:
            return self._total_bytes

    def count(self) -> int:
        with self._lock:
            row = self._db.execute("SELECT COUNT(*) FROM chunks").fetchone()
            return int(row[0] or 0)

    def stats(self) -> dict:
        with self._lock:
            return {
                "root": self.root,
                "chunks": self.count(),
                "total_bytes": self._total_bytes,
                "capacity_bytes": self.capacity_bytes,
                "puts": self.puts,
                "put_bytes": self.put_bytes,
                "dedupe_skips": self.dedupe_skips,
                "hits": self.hits,
                "misses": self.misses,
                "corrupt_rejects": self.corrupt_rejects,
                "evictions": self.evictions,
                "evicted_bytes": self.evicted_bytes,
            }

    # ------------------------------------------------------------- eviction

    def evict_to_capacity(self, target_bytes: Optional[int] = None) -> int:
        """LRU-evict until total size <= target (default: capacity). Returns bytes freed."""
        target = self.capacity_bytes if target_bytes is None else int(target_bytes)
        freed = 0
        with self._lock:
            while self._total_bytes > target:
                row = self._db.execute(
                    "SELECT sha256, size FROM chunks ORDER BY atime ASC LIMIT 1"
                ).fetchone()
                if row is None:
                    break
                sha, size = row[0], int(row[1])
                path = self.path_for(sha)
                try:
                    os.unlink(path)
                except FileNotFoundError:
                    pass
                self._db.execute("DELETE FROM chunks WHERE sha256=?", (sha,))
                self._db.commit()
                self._total_bytes -= size
                freed += size
                self.evictions += 1
                self.evicted_bytes += size
        return freed

    def clear(self) -> int:
        """Ops/testing: wipe every chunk. Returns bytes freed.

        Safe by contract - the store is disposable. Nothing but bandwidth
        efficiency is lost.
        """
        with self._lock:
            rows = self._db.execute("SELECT sha256 FROM chunks").fetchall()
            for (sha,) in rows:
                try:
                    os.unlink(self.path_for(sha))
                except (FileNotFoundError, ValueError):
                    pass
            self._db.execute("DELETE FROM chunks")
            self._db.commit()
            freed = self._total_bytes
            self._total_bytes = 0
            self.evictions += len(rows)
            self.evicted_bytes += freed
            return freed

    def close(self) -> None:
        with self._lock:
            try:
                self._db.close()
            except sqlite3.Error:
                pass
