# Incomplete historical tool-call repair — v4.460

## Incident and evidence

A Grok-origin conversation continued after a tool-swarm AUTO-RESUME turn but failed when switching to Claude Fable and GPT Astra. The supplied Anthropic-shaped assistant item contained `type: tool_use` and `input`, but **neither `id` nor `name`**. Its next user message was the existing signposted AUTO-RESUME message, not a tool result.

That proves an incomplete outbound history item. It does **not** establish whether the client lost fields during receipt, persistence or conversion, or whether the tool executed. Do not infer non-execution or success; do not rerun anything automatically.

## Implementation

`tmRepairIncompleteToolHistory(body)` is called once in the universal parsed-body pass before endpoint branches, ID sanitizers, missing-result synthesis and thinking insertion. Thus direct, OpenRouter, relative proxy and custom-host proxy traffic share the fix. The established URL/header passthrough guard remains ahead of it.

| Shape | Call identity | Result identity | Damaged-group boundary |
|---|---|---|---|
| Anthropic Messages | `content[].tool_use.id` and `.name` | `tool_result.tool_use_id` | Immediately following user message |
| Chat Completions | `tool_calls[].id` and `.function.name` | `role: tool`, `tool_call_id` | Contiguous tool messages after assistant |
| Responses | `function_call.call_id` and `.name` | `function_call_output.call_id` | Flat call/output run, bounded by other messages/items; a new call after outputs starts a new run |
| Responses legacy nested content | `content[].function_call.call_id` and `.name` | Nested `function_call_output.call_id` | Immediately following user message |

Responses **item `id` is not `call_id`** and is not required by this repair. Gemini is untouched: ID-less name-based function calls/results are legitimate.

### Deliberately narrow policy

1. Remove each function/tool call lacking a nonblank string correlation ID or name. Do not infer a name from arguments or copy an ID from a guessed result.
2. Index surviving owners before removing anything. Their results are protected, including displaced results and punctuation aliases understood by older Anthropic/Kimi repairs. Custom/unknown Chat tool kinds are not validated using `function.name`, but still protect their result IDs.
3. Remove a result only when it has no surviving owner **and** it is in the damaged adjacent group, or carries a known ID of a removed call. This is not a global orphan purge. Outputs in later unrelated groups are left alone.
4. Server-managed Responses history (`previous_response_id`, `conversation`, or `item_reference`) can have owners outside the submitted array. Do not infer a nonblank unknown output is orphaned there merely because a local group was damaged; explicit removed-call IDs remain actionable.
5. Preserve valid parallel calls/results, other message blocks, prose, media and reasoning/signatures. If removing a fragment empties a message (or leaves Anthropic thinking-only content), add one deterministic text note: `[TypingMind payload extension: incomplete historical tool call omitted; execution status unknown.]`, or the analogous unmatched-result note. A valid Chat tool-only assistant remains `content: null`. Flat Responses items are simply removed.
6. Never recurse into tool arguments, schemas or result data. Never execute anything. Never modify AssemblyDB or the inbound response.

The note avoids an empty-message/alternation regression without implying that an interrupted operation succeeded. There is no new success stub or tool-result pairing. Missing-ID/name assistant calls now disappear **before** the older Kimi pair repair could fabricate IDs; that repair continues to handle complete calls with missing/displaced/blank-ID results. Inbound Kimi ID protection and auto-resume behavior are unchanged.

## Observability and caching

Capture Summary: `incomplete_tool_history` = `{changed, droppedCalls, droppedResults, filledMessages}` or null. The compact stored field `_incomplete_tool_history` survives the ring's existing underscore-metadata compaction policy. It is extension metadata, not a provider request field. Console logs counts only, not tool inputs.

Healthy requests do not get reserialized by this repair. Repeated identical histories produce identical repaired bytes; the function is idempotent. Correcting content far back in an existing conversation may cause a one-time cache-prefix miss. No guarantee about provider cache retention is implied.

## Offline validation

```sh
node --check prompt-caching-header-fix.js
node tests/incomplete_tool_history.test.cjs prompt-caching-header-fix.js
```

38 focused checks pass, executing the production function and the production pre-branch fetch hook with unrelated systems stubbed. Coverage includes the supplied malformed shape, missing/invalid IDs and names, mixed parallel calls, known/displaced results, custom-tool ownership, all three protocols, server-managed Responses, Gemini no-op, downstream existing repairs, metadata plumbing, healthy-byte preservation, deterministic prefixes and passthrough bypass. Fixtures contain no private command or transcript data and execute no tool.

Existing suites were run against pristine v4.459 and this patch. Six pass: keep-alive DOM identity, keep-alive output budget, global reasoning analytics, provider broad family, frozen ring modal, SSE completion-marker guard. Two have identical pre-existing failures: `ka_singleton` (six failures: missing harness dependency `tmKeepAliveRecentActivityTsForKey` and obsolete ping-clock assertion) and `sessions_delta_history` (four dashboard fixture/assertion failures). Those areas are not changed by this release.

Live acceptance is a retry of the affected conversation after loading v4.460; no paid provider request was made for testing.

Workflowy mutation inventory: [ap:HE0H9V], row 32.
