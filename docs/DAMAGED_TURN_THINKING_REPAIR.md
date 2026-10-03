# Damaged-turn thinking repair and ring fingerprints — v4.463

## Incident

A Claude Opus 5.5 conversation (Anthropic direct, adaptive thinking, display summarized) could not continue. Every send, and every regenerate, returned:

> 400 `messages.3.content.40: thinking or redacted_thinking blocks in the latest assistant message cannot be modified. These blocks must remain as they were in the original response.`

## What the payload showed

- The wire `messages` array held **two assistant messages back to back**: a thought-only message, then the next response (a thought plus a tool call). Nowhere else in the conversation did that happen.
- TypingMind's UI showed the first response as a thought **plus a tool call with inputs and no result**.
- The ring buffer proved the call had run. The next request's prompt was the previous prompt plus about 1,550 tokens (its cache read equalled the previous prompt exactly), and the next response's thought refers to the call's result. The result reached the model in the live loop but was **never saved** in TypingMind's stored conversation.
- When TypingMind rebuilds a request from the stored conversation it leaves out a tool call that has no result (Anthropic would reject an unanswered `tool_use`), so only the call's thought remained.
- Anthropic numbers the request with the effort-only system message set aside and each tool loop folded into one assistant turn (tool-result-only user messages included). Counted that way, `messages.3` is the loop, and block 40 is the thought immediately after the orphaned one. Two independent numbers, one location.

## Repair

`tmRepairDamagedTurnThinking(body)` runs in the universal parsed-body pass, after the incomplete-tool-history repair and before the Fix 24 thinking writer inserts its effort-only messages.

1. **A gap** is an assistant message with no tool call whose next non-system message is also an assistant message.
2. From that message to the end of its turn (the next user message carrying anything other than tool results), `thinking` and `redacted_thinking` blocks are left out. Text, tool calls and tool results are untouched.
3. A message left empty is dropped when another assistant message follows it (the gap itself). Anywhere else the existing empty-content repair stubs it.
4. If the request ends in tool results (a loop still in progress), the assistant message that made those calls keeps its thinking, because Anthropic needs it to continue.
5. Shape-gated to bodies whose assistant messages carry Anthropic thinking blocks. Healthy requests are not reserialized, the repair is idempotent, and the saved conversation is never touched.

**Why leave thoughts out instead of only dropping the orphan.** Every thought after the gap was generated with context the saved conversation no longer has (the lost call and its result). Thinking omitted from a completed turn is accepted; thinking that no longer matches its original response is rejected. Leaving those thoughts out holds whatever Anthropic's exact check is. The cost is a one-time cache miss from the gap onward.

## Observability

- Capture Summary: `damaged_turn_thinking` = `{changed, gaps, strippedThinking, droppedMessages}` or null (stored as `_damaged_turn`).
- Ring row: orange **🩹 gap repaired** badge on the request line.
- Console: counts only.

## Ring fingerprints (same release)

Finding which ring entry was which in this incident meant matching thinking-character counts by hand. Every capture now carries:

- **Request** `_fp_out` = `{n, last, h}`: the message count, the last message's first words or the names of the tools whose results it carries, and an FNV-1a hash of that last message.
- **Response** `_fp_in` = `{b: [[kind, words or tool name], ...], more?, stop?, done}`: every block in order (thought, encrypted thought, text, tool call), its first words, the stop reason, and whether the stream finished. All four wire shapes, fed from the Thinking Observatory accumulator.
- **`_fp_resend`** when a request repeats the newest earlier request of the same conversation and model (same count, same final message): a regenerate, a retry or a resend.

They render as two lines under each ring row's timestamp (badges first, full text on hover; a stream that ended without a stop reason shows an orange **⚠ no stop**) and as the Summary field `fingerprint`.

## Validation

- `tests/damaged_turn_thinking.test.cjs`: 13 checks on synthetic fixtures (the reported shape, an in-progress loop, healthy conversations untouched, text kept, tool-call messages not treated as gaps, later turns untouched, system messages transparent, non-thinking bodies untouched, request and response fingerprints for all four shapes, RESEND, row rendering and escaping).
- The real failing payload (39 messages) was checked locally and not committed: 1 gap, 4 thoughts left out, 1 empty gap message dropped, messages 0–29 byte-identical, no back-to-back assistant messages left.
- Existing suites give results identical to v4.462 (`ka_singleton` and `sessions_delta_history` keep their pre-existing failures).
- Live acceptance: resend in the affected conversation.
