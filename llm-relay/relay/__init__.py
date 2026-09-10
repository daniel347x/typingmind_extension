"""LLM Relay - transport-only content-addressed dedup proxy.

Design contract (see Anchor Point [ap:LGDT9Y] SPEC v1):

    The relay is a byte-preserving transport. It never decides what the model
    sees, never rewrites a request, never infers a provider from a model name,
    and never replays an ambiguous request. Windows remains the single
    authority on conversation state.

The entire correctness contract reduces to one mechanical predicate:

    sha256(reconstructed_body) == sha256(original_body)

and dispatch to the provider occurs ONLY after that predicate passes.

Stdlib-only by design: no third-party dependencies, so deployment is "copy the
tree and run it". Compatible with Python 3.10+ (remote Linux) and 3.13 (local
Windows dev/test).
"""

from __future__ import annotations

__version__ = "1.0.0"
PROTOCOL_VERSION = 1

__all__ = ["__version__", "PROTOCOL_VERSION"]
