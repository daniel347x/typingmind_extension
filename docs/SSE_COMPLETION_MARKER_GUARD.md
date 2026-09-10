# SSE completion-marker compatibility guard (v4.439)

## Incident and evidence

A browser Network capture from Qwen via OpenRouter/Alibaba contained a complete, valid tool call: 259 argument characters, valid outer JSON and valid stringified `params`. The client delivered only 217 characters, ending immediately before an SSE JSON event whose tool-argument fragment contained the literal `[DONE]`. The remaining argument fragments and normal `finish_reason: tool_calls` arrived before the real `data: [DONE]` terminator.

An offline consumer deliberately using `payload.includes('[DONE]')` instead of whole-event sentinel recognition reproduces the exact 217-character cutoff. This identifies the mechanism very strongly, but is not an inspection of TypingMind's proprietary parser. Live verification of the workaround is still required. The private Network capture is NOT committed; the public tests use a synthetic fixture.

## What changes

`tmCreateSseDoneMarkerGuard` buffers a bounded SSE event, validates its combined `data` value as JSON, and escapes literal marker brackets in JSON data lines as `\u005bDONE\u005d`. JSON parsing restores exactly the original characters. Content, reasoning and tool-argument strings all use the same mechanism; it is not model-specific or a JSON-argument repair.

`tmWrapSseDoneMarkerResponse` applies the transform to intercepted `text/event-stream` responses after retry and existing Sol/Kimi rewrites, before continuity observation and TypingMind consumption. Raw response capture remains BEFORE these rewrites. No extra clone or fetch is added. Request bodies, MCP schemas, output limits, routing and decoded transcript content are unchanged. Content-Length is removed because serialized byte length can change.

- Frame bytes across arbitrary chunks; support LF, CRLF, CR and multiline SSE data.
- Preserve real terminal events, comments, id/event/retry fields and line endings.
- Preserve untouched bytes, BOM and invalid UTF-8; no replacement-character corruption.
- Buffer at most 1 MiB of an event before passing it through unshielded; stream oversized remainder verbatim and resume shielding at the next event. No payload truncation.
- Non-JSON and invalid-UTF-8 events pass through unchanged with diagnostics. Non-SSE responses and explicit passthrough requests retain their existing path.
- EOF tails are flushed; upstream errors and downstream cancellation propagate. No synthetic termination or auto-retry is added.

## Observation and rollback

A console message announces the first shielded event. The existing ring entry carries metadata only in `_sse_done_guard`: `events`, `replacements`, `bypassed`, and optional `last_bypass`. The ordinary Summary copy exposes it as `sse_done_guard`. Raw captures remain unshielded by design; an unchanged Network response is therefore expected after deployment.

Disable for the next response by setting `localStorage.setItem('tm_sse_done_guard_enabled', 'false')`; re-enable with `localStorage.removeItem('tm_sse_done_guard_enabled')`. Default is enabled. These are browser Console commands, not source edits. No new persistent payload store is introduced.

## Tests

Run `node tests/sse_done_marker_guard.test.cjs ./prompt-caching-header-fix.js` (Node 22 used). Optionally append the path to the private captured response, or set `TM_SSE_RECORDED_RESPONSE`, to run its exact 259/217-character regression. The private fixture remains local.

28 checks with the private fixture: JSON equivalence, nested argument reconstruction, content/reasoning coverage, every two-way byte split, single-byte chunks, UTF-8/BOM, LF/CRLF/CR, multiline data, existing escapes, comments, real terminal identity, idempotence, deterministic randomized chunk/event composition, oversized-event recovery, EOF, invalid UTF-8, cancellation/error propagation, response metadata, raw-clone preservation, capture-independent operation, opt-out, Summary counts and the production response-chain ordering.

Existing repo suites: 109 checks pass; the four failures in `sessions_delta_history.test.cjs` have byte-identical stdout/stderr against untouched v4.438 and the new source. They are pre-existing, not changed by this repair.

## Live acceptance

After the deployed widget shows v4.439, repeat the one-call Qwen probe, then read back the created scratch note. Confirm the complete literal and the AFTER marker survive. Check Summary guard counts. No further paid retry loop is needed for development; offline replay is the regression fixture.
