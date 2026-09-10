# LLM Relay — transport-only content-addressed dedup proxy

**Version:** 1.0.0
**Spec:** [ap:LGDT9Y] SPEC v1 — transport-only content-addressed dedup proxy
**Status:** Session 1 complete — relay core, tested locally, ready for deployment.

## What it does

Your Windows agentic harness sends LLM API requests to a local shim (Session 2).
The shim chunks the request body with content-defined chunking (CDC), hashes
each chunk with SHA-256, and sends only the *manifest* (hash list) plus any
*new* chunks to a relay running on a remote Linux box with a fast network.

The relay reconstructs the original request body from previously-stored chunks,
verifies it byte-for-byte (`sha256(reconstructed) == sha256(original)`), and
forwards it to the provider. The response streams back verbatim.

**Result:** repeated prompt prefixes (system prompt, tool definitions,
conversation history) cross the LTE uplink exactly once. Typical savings:
95–99% of upload bytes.

## Architecture

```
Windows (your desk)                Remote Linux (A100 box)         Providers
==================                 =======================         =========

┌──────────────┐                   ┌─────────────────────┐
│  TypingMind  │                   │  relay/server.py    │
│  + harness   │  localhost        │  • CDC chunk store  │──► api.anthropic.com
│  + interceptor│◄────────────────►│  • reconstruct+verify│──► api.openai.com
└──────────────┘                   │  • SSE passthrough  │──► api.deepseek.com
       ▲                           │  • metrics          │──► api.moonshot.ai
       │                           └─────────────────────┘──► api.z.ai
┌──────┴───────┐                          ▲
│  shim (S2)   │  SSH tunnel / bearer     │
│  • CDC       │──────────────────────────┘
│  • manifest  │
│  • acked idx │
└──────────────┘
```

## Safety rules (non-negotiable)

1. **Dispatch only after verification.** The relay never calls a provider until
   every manifest chunk is present and `sha256(concat)` matches `body_sha256`.
   Misses → 409. Mismatches → 422. Neither dispatches.
2. **No retry after dispatch.** If the upstream stream breaks, the relay
   terminates abnormally (unterminated chunked encoding). The client sees
   truncation exactly as it would from a provider disconnect. The relay never
   replays an ambiguous request.
3. **Byte-preserving transport.** The relay never parses, transforms, or
   rewrites the request body. Provider cache keys, `cache_control`, and prompt
   structure pass through unchanged.
4. **Disposable cache.** The chunk store is content-addressed and disposable.
   Deleting it loses bandwidth efficiency only — never conversation content.

## File layout

```
llm-relay/
├── relay/
│   ├── __init__.py          # version, protocol constants
│   ├── cdc.py               # content-defined chunking (FastCDC-style)
│   ├── store.py             # content-addressed chunk store + LRU eviction
│   ├── config.py            # JSON config loading + validation
│   ├── protocol.py          # envelope parsing, validation, error codes
│   ├── metrics.py           # thread-safe counters
│   ├── server.py            # HTTP server (stdlib-only, ThreadingHTTPServer)
│   ├── shimref.py           # reference client (Session 2 spec-in-code)
│   └── __main__.py          # python3 -m relay --config ...
├── tests/
│   ├── mock_upstream.py     # mock provider (echo, SSE, breakstream, error500)
│   └── test_relay.py        # acceptance criteria 1–9
├── config/
│   └── relay.json           # route table (name → base_url, no secrets)
├── deploy/
│   └── llm-relay.service    # systemd unit
├── README.md
├── .gitignore
└── deploy.sh                # one-command deploy to A100
```

## Quick start (local test)

```bash
cd llm-relay
python -m pytest tests/ -v --tb=short
```

## Deploy to A100 (207.211.185.21)

```bash
# 1. Copy the tree
scp -r llm-relay/ ubuntu@207.211.185.21:/opt/llm-relay/

# 2. Set the relay token
ssh ubuntu@207.211.185.21 'echo "LLM_RELAY_TOKEN=your-secret-token" | sudo tee /etc/llm-relay/env'

# 3. Install systemd service
ssh ubuntu@207.211.185.21 'sudo cp /opt/llm-relay/deploy/llm-relay.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now llm-relay'

# 4. Verify
ssh ubuntu@207.211.185.21 'curl -s http://127.0.0.1:8787/relay/health'
```

Or run `./deploy.sh` which does all of the above.

## Configuration

`config/relay.json`:

```json
{
  "bind": "127.0.0.1",
  "port": 8787,
  "token_env": "LLM_RELAY_TOKEN",
  "store_dir": "/var/lib/llm-relay/chunks",
  "capacity_bytes": 107374182400,
  "routes": {
    "anthropic-claude": { "base_url": "https://api.anthropic.com" },
    "openai-gpt":       { "base_url": "https://api.openai.com/v1" },
    "deepseek-direct":  { "base_url": "https://api.deepseek.com" },
    "kimi-direct":      { "base_url": "https://api.moonshot.ai/v1" },
    "zai-glm":          { "base_url": "https://api.z.ai/api/paas/v4" },
    "deepinfra":        { "base_url": "https://api.deepinfra.com/v1/openai" }
  }
}
```

**No provider keys in config.** The relay holds no credentials. The shim sends
the original `Authorization` header inside the envelope; the relay forwards it
verbatim. Adding a new provider is one JSON line.

## Metrics

`GET /relay/metrics` returns counters including:

- `body_bytes` / `wire_bytes` / `bytes_saved` / `saved_pct`
- `requests` / `requests_ok` / `requests_missing` / `requests_verify_failed`
- `store.total_bytes` / `store.chunks` / `store.evictions`

## Acceptance criteria (the audit)

| # | Criterion | Test class |
|---|-----------|------------|
| 1 | Byte fidelity: reconstructed body matches original exactly | `TestByteFidelity` |
| 2 | Dedup correctness: N-turn wire bytes ≈ new content + manifest | `TestDedupCorrectness` |
| 3 | CDC insertion stability: mid-history insert preserves most hashes | `TestCDCInsertionStability` |
| 4 | Miss path: one 409 round-trip → success; double miss → clean failure | `TestMissPath` |
| 5 | No duplicate dispatch: mid-stream kill → exactly one provider request | `TestNoDuplicateDispatch` |
| 6 | SSE fidelity: streaming response byte-identical vs direct | `TestSSEFidelity` |
| 7 | Auth: missing/bad token → 401; loopback-only bind | `TestAuth` |
| 8 | Store integrity: LRU eviction, atomic rename, sha256 sampling | `TestStoreIntegrity` |
| 9 | Shadow measurement: real savings on simulated session | `TestShadowMeasurement` |

All nine pass = Session 1 complete.

## Next: Session 2 (Windows shim)

`relay/shimref.py` is the specification-in-code for the Windows shim. It
implements `ChunkerState` (incremental CDC), `AckedIndex` (persisted known-
chunks), and `RelayClient` (bounded miss recovery, no post-dispatch retry).
Session 2 wraps this in a localhost HTTP server that speaks the same API
surface your harness expects (`/v1/chat/completions`, `/v1/messages`, etc.)
and rewrites the base_url to the relay.
