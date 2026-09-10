"""Content-defined chunking (FastCDC-style) for the LLM Relay.

Why CDC instead of fixed-size chunks
------------------------------------
Conversation payloads are append-only *most* of the time, but harnesses do
edit history (re-ordering, redaction, retry variants, injected tool results).
Fixed-size chunking re-aligns every boundary after an insertion, so a single
small edit invalidates the whole tail and destroys dedup. Content-defined
chunking derives boundaries from the byte content itself, so an insertion
invalidates only the chunk that contains it; everything after it keeps the
same boundaries and the same hashes. Acceptance criterion 3 measures exactly
this.

Determinism across machines
---------------------------
Both sides (Windows shim, Linux relay) MUST agree on chunk boundaries. The
gear table is therefore derived deterministically from a fixed seed via
SHA-256 rather than shipped as a literal or generated from a platform RNG:

    GEAR[i] = int.from_bytes(sha256(b"llm-relay/cdc/gear-v1" + i.to_bytes(2,'big'))[:8], 'big')

Any change to the seed or the mask derivation invalidates every stored chunk
boundary; bump _GEAR_SEED / CDC_PROFILE if the parameters ever change.

Performance
-----------
Pure Python, roughly 15-40 MB/s. The shim is expected to chunk incrementally:
it caches the chunk list for the longest previously-seen byte prefix and only
runs CDC over the newly appended tail, so steady-state cost is proportional to
new bytes, not to conversation size. See shimref.ChunkerState.
"""

from __future__ import annotations

import hashlib
import math
from typing import Iterator, List, NamedTuple, Optional, Tuple

MASK64 = (1 << 64) - 1

#: Bump when DEFAULT_* sizes or the gear seed change. Stored chunk boundaries
#: are only comparable within one profile.
CDC_PROFILE = "fastcdc-v1-16k-64k-256k"

DEFAULT_MIN_SIZE = 16 * 1024
DEFAULT_AVG_SIZE = 64 * 1024
DEFAULT_MAX_SIZE = 256 * 1024

_GEAR_SEED = b"llm-relay/cdc/gear-v1"


def _build_gear_table() -> Tuple[int, ...]:
    table: List[int] = []
    for i in range(256):
        digest = hashlib.sha256(_GEAR_SEED + i.to_bytes(2, "big")).digest()
        table.append(int.from_bytes(digest[:8], "big"))
    return tuple(table)


#: 256-entry 64-bit gear table, deterministic across platforms.
GEAR: Tuple[int, ...] = _build_gear_table()


class Chunk(NamedTuple):
    """One content-defined chunk of a payload."""

    offset: int
    length: int
    sha256: str


def sha256_hex(data: bytes) -> str:
    """Hex SHA-256 of data. The single hash primitive used everywhere."""
    return hashlib.sha256(data).hexdigest()


def _masks(avg_size: int) -> Tuple[int, int]:
    """Return (mask_small, mask_large) for normalized FastCDC chunking.

    mask_small has MORE bits set, so it is harder to satisfy; it is used
    before the center point to discourage very small chunks. mask_large has
    FEWER bits, so it is easier to satisfy; it is used after the center point
    to discourage very large chunks. Together they pull the size distribution
    toward avg_size.
    """
    bits = max(4, int(round(math.log2(avg_size))))
    mask_small = (1 << (bits + 2)) - 1
    mask_large = (1 << max(1, bits - 2)) - 1
    return mask_small, mask_large


def _find_cut(
    data: bytes,
    start: int,
    end: int,
    min_size: int,
    max_size: int,
    center: int,
    mask_small: int,
    mask_large: int,
) -> int:
    """Return the exclusive end offset of the chunk beginning at start."""
    fp = 0
    i = start
    gear = GEAR

    # Region 1: [start, start+min_size) - advance the fingerprint, never cut.
    stop = min(start + min_size, end)
    while i < stop:
        fp = ((fp << 1) + gear[data[i]]) & MASK64
        i += 1
    if i >= end:
        return end

    # Region 2: [start+min_size, start+center) - cut on the harder mask.
    mid = min(start + center, end)
    while i < mid:
        fp = ((fp << 1) + gear[data[i]]) & MASK64
        i += 1
        if (fp & mask_small) == 0:
            return i

    # Region 3: [start+center, start+max_size) - cut on the easier mask.
    hi = min(start + max_size, end)
    while i < hi:
        fp = ((fp << 1) + gear[data[i]]) & MASK64
        i += 1
        if (fp & mask_large) == 0:
            return i

    # Region 4: hard cap.
    return hi


def chunk_bytes(
    data: bytes,
    start: int = 0,
    end: Optional[int] = None,
    *,
    min_size: int = DEFAULT_MIN_SIZE,
    avg_size: int = DEFAULT_AVG_SIZE,
    max_size: int = DEFAULT_MAX_SIZE,
) -> Iterator[Chunk]:
    """Yield Chunk records covering data[start:end].

    start exists so the shim can chunk incrementally: pass the offset of the
    last known boundary and only the new tail is scanned. Chunks are emitted in
    offset order and tile the range exactly (no gaps, no overlaps), so
    concatenating them in order reproduces data[start:end] byte for byte. That
    property is what makes hash-addressed reconstruction safe.
    """
    if end is None:
        end = len(data)
    if start < 0 or end > len(data) or start > end:
        raise ValueError("invalid range: start=%d end=%d len=%d" % (start, end, len(data)))
    if not (0 < min_size <= avg_size <= max_size):
        raise ValueError(
            "invalid sizes: min=%d avg=%d max=%d" % (min_size, avg_size, max_size)
        )

    if start == end:
        return

    mask_small, mask_large = _masks(avg_size)
    pos = start
    while pos < end:
        cut = _find_cut(
            data, pos, end, min_size, max_size, avg_size, mask_small, mask_large
        )
        piece = data[pos:cut]
        yield Chunk(pos, cut - pos, sha256_hex(piece))
        pos = cut


def chunk_list(data: bytes, start: int = 0, **kwargs) -> List[Chunk]:
    """Materialise chunk_bytes as a list."""
    return list(chunk_bytes(data, start=start, **kwargs))


def chunk_sizes(data: bytes, **kwargs) -> List[int]:
    """Chunk lengths only - used by tests and metrics."""
    return [c.length for c in chunk_bytes(data, **kwargs)]
