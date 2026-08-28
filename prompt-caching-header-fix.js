// TypingMind Prompt Caching & Tool Result Fix & Payload Analysis Extension
// Version: 4.304
// Issues Fixed:
//   - v4.304: COST-CALC CACHE-WRITE GATE FIX + FALLBACK AUDIT. The v4.236 cache-write gate
//     (bill creation only when cache_read > 0, 'evidence of reuse') silently zeroed the single
//     most expensive turn shape: a pure cache-MISS turn on a provider with no API cost field
//     (direct Anthropic first turn / >1h TTL expiry), where cache_read=0 and the whole prompt
//     lands in cache_creation -- ~$0.01 recorded instead of ~$2.00 true. Fix: bill cache_write
//     whenever cache_creation > 0 and a cache_write price exists. Fallback audit of providers
//     with NO API cost (direct Anthropic, Gemini native, direct OpenAI, Responses API, Moonshot
//     direct): every other component verified correct -- cache_read billed at read price
//     everywhere; Gemini/OpenAI/Responses new-input = prompt - cached (prompt INCLUDES cached
//     on those shapes, correct); Anthropic fresh tokens correctly flow through cache_creation
//     at the write rate (1.25x input); OpenAI/Gemini implicit caching has no write fee to bill.
//     OPERATIONAL NOTE: Set Costs cache_write values should reflect true write rates
//     (Anthropic = 1.25x input, e.g. $3.75/M on $3/M input) or writes stay silent-zero.
//   - v4.303: CTX-DIAL ANTHROPIC NUMERATOR FIX (the 969-of-551K '0%' bug, caught live on
//     claude-fable-5). Anthropic-native usage is SPLIT -- input_tokens (UNCACHED remainder
//     only) + cache_read_input_tokens + cache_creation_input_tokens + output_tokens, with no
//     total_tokens anywhere -- and the v4.86 generic extractor normalizes those SAME fields
//     into response_usage, so v4.297's `au && !usage` guard on the Anthropic-aware sum never
//     fired and the numerator collapsed to input+output (969). New rule: a reported
//     total_tokens wins; else prompt_tokens (OpenAI-style, INCLUDES the cached prefix) +
//     completion; else Anthropic-style input + cache-read + cache-write + completion
//     (=> 551,593 = 55.2% of the 1M override on Dan's row). snap.prompt now stores the FULL
//     prompt-side total (input+cached+written for Anthropic) so the tooltip is honest too.
//     Also: thinking_tokens inside output_tokens_details (Anthropic's reasoning spelling) is
//     now extracted as reasoning_tokens in BOTH the generic normalizer and the snapshot
//     fallback chain.
//   - v4.302: SWEEP PRE-FLIGHT KILLS NEEDLESS SESSION FLIPS. With the heartbeat ON, any session
//     whose tool call ran longer than the 75s grace got an inspection NAVIGATION -- the sweep
//     flipped to a visibly ACTIVE session (sidebar spinner spinning), parked through the ~9s
//     verification chain, then correctly aborted at the sidebar-authority step. All wasted
//     motion in front of the user (Dan: 'it just flips to the session, looks for something,
//     and sits there parked'). The sweep's candidate filter now runs the chain's OWN final
//     authority (tmSidebarHasToolActivity -- a sidebar-only DOM query that needs NO navigation)
//     BEFORE any switch: spinner positively present => actively executing => skip WITHOUT
//     navigating; spinner absent (incl. row not rendered / collapsed folder) => fall through
//     to the unchanged proven chain. Safe-direction only: this can never suppress a real
//     Continue (the full chain treats the same signal as conclusive do-not-act; a stalled
//     session shows no sidebar spinner), and the worst case in a transitional race is one
//     extra sweep-cycle delay, never a miss. The 10s-modal resume path is untouched.
//   - v4.301: FILTER LISTBOX USABILITY POLISH. (1) The ring-modal session Filter trigger had no
//     minimum width, so with 'All' selected it collapsed to a tiny pill that was hard to spot --
//     now min-width:150px, left-aligned, so it always reads as a real dropdown. (2) Rollover
//     feedback for the custom listbox rows: div-based rows cannot use inline :hover, so a
//     guarded one-time injected stylesheet adds .tm-flt-row:hover (the hover shade wins via
//     !important; selected rows return to their purple when unhovered).
//   - v4.300: MANAGEMENT OFF-SWITCH IS NOW REAL (auto-resume choke gate + in-flight cancel).
//     Dan caught the walk-away engine firing with the heartbeat toggle OFF (orange): the v4.292
//     toggle only gated the newer cross-session sweep, while the OLDER v4.281 sensors (15m
//     silence watchdog, stream abort/error/empty, turn-limit MutationObserver, oversized
//     recovery) still queued auto-continues -- and once queued, the 10s countdown, session
//     switch, and Continue submit had NO enabled checks at all. Fixes: (1) ONE choke gate in
//     tmQueueAutoContinue refuses every autonomous resume while disabled (covers all current
//     and FUTURE callers; only the manual debug hook's 'manual_debug' reason is exempt);
//     (2) toggling OFF now purges the pending queue AND aborts an in-flight countdown modal
//     (module-level cancel handle); (3) tmExecuteAutoContinue re-checks the flag before
//     navigation (covers a toggle flipped mid-countdown); (4) the management sweep's
//     session-switch verify loop aborts early when disabled; (5) tmCheckTurnLimitStop returns
//     before arming its 2-minute dedupe while disabled. Enabled-path behavior is unchanged --
//     the double-dozen proven flows are untouched.
//   - v4.299: CTX-DIAL PROVIDER-GRANULAR OVERRIDES + GUARANTEED BACK-OUT. The dial now carries
//     the row's provider slug (data-provider), and overrides land on the PRECISE key clicked:
//     'model::providerSlug' when the row names a provider (parity with Set Costs / Rate Providers
//     granularity), bare 'model' otherwise (direct routes). Resolution gains a top rung:
//     override[model::provider] > override[model] > endpoint discovery > provider-max > seed.
//     Back-out is always one click: empty input clears exactly the clicked key (auto-detection
//     resumes); typing 'clearall' removes EVERY override for the model. The prompt shows the
//     current effective value+source and warns when a model-wide override sits above a
//     provider-level key.
//   - v4.298: CTX-DIAL SEED ROUTE-FIX. The v4.297 kimi-k3 seed (262144) described THIRD-PARTY
//     serving windows, but the seed only ever fires for DIRECT routes (vendor-prefixed models
//     resolve per-endpoint via OpenRouter discovery first) -- and direct Moonshot serves K3 at
//     its full ~1M window. Seed corrected to 1048576 and anchored to BARE model names
//     (^kimi-k3...) so it can never leak into the discovery-owned prefixed case.
//   - v4.297: CONTEXT-WINDOW DIAL (provider-reported ground truth, one shared gauge component).
//     Every ring-buffer entry now stamps a _ctx_snapshot at response receipt: the provider-REPORTED
//     token totals for that exact turn (numerator = total_tokens -- everything the model consumed:
//     full history prompt + completion + reasoning, which TypingMind's native gauge undercounts,
//     e.g. Kimi K3 reasoning tokens), plus prompt/completion/reasoning/cached breakdown. One shared
//     SVG gauge renders it in TWO surfaces: each ring-modal row (cost/repair/cache/provider ribbon)
//     and the persistent widget's session-name row (identity-matched to the widget's current
//     session -- parallel-conversation safe, mirroring the v4.211 guards). Arc = total/max-ctx over
//     360deg with the color ramp: solid green <=40%, mostly green at 50%, yellowing past 50%,
//     orange ~65%, red >=75% (over 100% clamps full-red with a warning label). Denominator
//     resolution: manual per-model override > serving-provider maxContext (live OpenRouter
//     Endpoints discovery, v4.236) > built-in seed (kimi-k3 262144, gemini 1048576); unknown
//     renders a dashed 'tok N' gauge. Click ANY dial to set/clear a per-model override
//     (localStorage tm_model_ctx_overrides_v1); the denominator RE-RESOLVES live at render time,
//     so an override instantly re-scales every historical row. The snapshot field is
//     underscore-prefixed so it survives rich->compact ring stripping (same as _model/_identity).
//     Also: tmExtractKnownUsageEvidence now surfaces reasoning_tokens first-class
//     (completion_tokens_details/output_tokens_details.reasoning_tokens, top-level
//     reasoning_tokens/thinking_tokens, Gemini thoughtsTokenCount) -- display/audit only; totals
//     already include reasoning everywhere known.
//   - v4.296: TOOL-HANDOFF BADGE IDENTITY-ALIAS FIX. The v4.295 ledger DID flip correctly, but
//     the visible badge always rendered `clear`: continuity state is keyed by the raw pasted
//     Session ID (`a6f657d7`) used for sidebar navigation, while capture/widget identity stores
//     the derived routing form (`tm-a6f657d7`) and prefers it for display. Badge lookup therefore
//     missed the live ledger entry every time. The display resolver now tries the exact key first,
//     then its canonical raw alias with one leading `tm-` removed. This repairs both the persistent
//     widget and newest-per-session ring badge without changing the tested suspicion ledger,
//     sweep, navigation, or actuator logic.
//   - v4.295: LIVE TOOL-HANDOFF BADGE FEEDBACK. The management badge used to stay 'clear' through
//     entire healthy tool swarms because (a) its wording treated the pendingToolCall flag purely
//     as a stall warning and (b) neither the widget nor the ring modal re-rendered when the flag
//     flipped, so the tool-call handoff state was invisible. The existing flag's lifecycle already
//     matches the desired display exactly -- set the moment a response finishes on a tool call,
//     cleared the instant any outbound payload leaves for that session -- so no second state is
//     introduced. The badge now shows '🔵 clear' (blue) when no handoff is in flight and '🧰 tool'
//     (red) the moment a session enters the tool-execution handoff, and both state transitions
//     force an immediate widget + open-ring-modal re-render so the flip is visible live. Purely
//     presentational: sweep/actuator logic untouched.
//   - v4.294: SIDEBAR TOOL-ACTIVITY CONFIRMATION + 1.5s GAP-GUARD DELAYS. The DOM gap between
//     rapid tool calls is slightly longer than one second, so the two final idle confirmations
//     in the management sweep now wait 1500ms each. More importantly, TypingMind maintains a
//     continuous animate-spin indicator inside the session's left-sidebar row for the ENTIRE
//     client-side tool-execution window, with no mount/unmount gaps. When the existing chat-pane
//     checks conclude 'idle' (no spinner, static timer), the sweep now performs one final
//     authority check against that sidebar spinner. Presence of the sidebar spinner overrides the
//     idle conclusion and aborts the resume; absence confirms the stall and allows the Continue.
//     This removes the last race condition for sub-1.5s tool-turn gaps without replacing the
//     existing signals that short-circuit on proven activity.
//   - v4.293: MANAGEMENT-MODE IDLE CONFIRMATION + CAPITAL-C ACTUATOR + SESSION SUSPICION BADGES.
//     Rapid tool turns leave a sub-second DOM gap before TypingMind mounts the spinner, so the
//     v4.292 liveness probe could catch a false gap between tool calls. The management sweep now
//     requires two idle snapshots one second apart after the existing five-second timer comparison,
//     and the typed fallback submits `Continue` with a capital C. While management mode is enabled,
//     the widget's existing session/name row and each session's most-recent ring row carry a small
//     inline tool-suspicion badge: green `🧰 clear` for no pending tool call, muted red `🧰 idle`
//     for a confirmed idle candidate, and `…pending` inside the 75-second grace window. No extra
//     widget row is added and the badges disappear entirely when management mode is off.
//   - v4.292: AGENT MANAGEMENT MODE FOR BACKGROUND TOOL-SWARM STALLS. TypingMind removes its
//     native turn-limit Continue UI after navigating away, so the v4.291 visible-only observer
//     cannot recover a background session. A persisted, pulsing widget offshoot now enables a
//     suspicion-driven manager: an in-memory per-Session-ID ledger records healthy responses that
//     ended in tool calls across OpenAI chat/OpenRouter, Anthropic Messages, OpenAI Responses, and
//     Gemini-native functionCall shapes; the next outbound request clears the suspicion. After a
//     grace period the manager navigates only to suspicious sessions, scrolls the virtualized chat
//     pane to the bottom, and refuses to act while either the expanded animate-spin indicator is
//     visible or the collapsed tool timer advances over a 5-second sample. A native turn-limit UI
//     still uses its Continue button; otherwise the existing identity-verified, draft-safe actuator
//     types `continue`. Per-session cooldowns prevent duplicate management resumes; protocol state
//     remains memory-only while the intentional management-mode toggle survives refresh.
//   - v4.291: TURN-COUNT ('INFINITE LOOP') STOP SENSOR. TypingMind's turn-limit stop is purely
//     CLIENT-SIDE: the last request completed healthy and TypingMind simply declines to send the
//     next one -- no fetch, no payload, no error, so every network-layer sensor (tap, watchdog,
//     status) is blind to it by construction. A debounced MutationObserver now watches the visible
//     chat container for the stop UI (last rendered turns matching /infinite loop/i + a visible
//     'Continue' button) and feeds the SAME auto-resume actuator with reason 'turn_limit' --
//     whose native-button path (tmClickVisibleContinueButton) finally has its sensor. Session ID
//     is extracted from the selected sidebar row's hash-first title (no payload exists to derive
//     it from). Re-fire suppressed for 120s per identical stop text so one stop = one resume, but
//     a genuinely new stop (Dan's 'keep it going' intent) always fires again. v1 watches the
//     VISIBLE conversation only (hidden background containers carry no session-title mapping).
//   - v4.290: CONSUMED-PHRASE STRIPPING (ROLE-ALTERNATION SAFE). The approved v4.280 algorithm
//     called for removing the agent's verbatim recovery-phrase message from the wire once its
//     result is restored (it stays in AssemblyDB; we re-strip every turn, deterministically), but
//     the initial implementation left it in place. Stripping is now implemented with two safety
//     rules discovered during review: (1) only strip a message whose ENTIRE content is exactly
//     the phrase (never carve a phrase line out of a longer message); (2) never strip when removal
//     would create consecutive same-role neighbors -- e.g. [tool_result, assistant(phrase),
//     user('continue')] on Anthropic/Gemini shapes would become [user, user] and 400 on role
//     alternation, so those are left in place (harmless); on the OpenAI chat shape (tool -> user
//     is valid) the phrase is removed.
//   - v4.289: ACTUATOR FIXES FROM DAN'S LIVE MODAL-FIRED-BUT-NOTHING-HAPPENED TESTS. Two root
//     causes: (1) IDENTITY CHECK -- tmVisibleConversationHasSessionId scanned only the first 10
//     rendered user-message elements; on long conversations the FIRST user turn (the one carrying
//     the 'Session ID:' line) is virtualized OUT of the DOM, so the check failed even when the
//     target conversation was already active, and every path aborted (silently pre-v4.288). The
//     actuator now ALSO accepts the sidebar SELECTED row's title prefix (Dan's convention: the
//     session hash is always first in the conversation name) -- as the already-active test and
//     inside the post-switch verification loop. (2) SUBMIT RACE -- the continue text was set and
//     Ctrl+Enter dispatched SYNCHRONOUSLY, racing React's input registration (the transcription
//     widget's 200ms settle exists precisely for this); the submit now mirrors that proven
//     sequence: native setter + input/change events + focus, 200ms settle, re-find the input,
//     then dispatch Ctrl+Enter.
//   - v4.288: PER-SESSION EXPONENTIAL BACKOFF FOR ERROR-TRIGGERED AUTO-RESUMES. v4.287's floor was
//     the 10s modal alone: an instantly-failing endpoint (Moonshot overloaded for an hour) would be
//     hit ~every 12s (~300 full-payload attempts/hour). Error-triggered resumes (http_error_,
//     stream_error_, stall_no_bytes, stream_aborted, fetch_dropped, empty_stream) now space out
//     per session: 15s -> 30s -> 60s -> 120s -> 240s -> 480s -> clamp 600s, reset on the first
//     healthy response for that session. This is NOT a cap -- attempts never stop, they just
//     decelerate (~10 attempts/hour of outage instead of ~300). Recovery-phrase, turn-limit, and
//     manual resumes are never delayed; the modal shows the attempt number. In-memory by design:
//     a page refresh (Dan taking manual control) resets the clock.
//   - v4.287: CODE-LESS STREAMED ERRORS + HTTP-STATUS SENSOR. Two holes let a direct-Moonshot 429
//     die silently: (1) its error chunk carries only {message, type:'engine_overloaded_error'} with
//     NO numeric error.code, so the v4.286 transient classifier (Number(code) === 429/5xx) never
//     matched; (2) the tap never inspected response.status at all, so a real HTTP 429/5xx on a
//     non-OpenRouter endpoint (where the v4.202 retry engine deliberately does not run) never
//     queued a resume. The classifier now maps code-less errors by type/message heuristics
//     (overload/rate-limit -> 429, timeout -> 504, server/unavailable -> 503), and finish() checks
//     the HTTP status first: any 429/5xx response queues 'http_error_<status>' with the badge
//     tooltip breakdown. empty_stream stays gated to 2xx-with-no-data so error bodies never
//     misclassify.
//   - v4.286: CONNECTION-CLOSED DETECTION + PER-TURN TRIGGER MARKER. Three new dead-turn sensors
//     feed the same auto-resume actuator: (1) EMPTY STREAM -- HTTP 200 closes cleanly with zero
//     parsed data events (proxy/upstream died silently); (2) STREAM ABORTED -- the response stream
//     errors after bytes were flowing (connection dropped mid-turn); (3) FETCH DROPPED -- a fetch
//     rejects after >=30s in flight (dropped connection), while fast <30s failures (CORS/DNS/
//     refused) are still NEVER auto-resumed so hard failures cannot loop. Each detection stamps
//     the capture row with _auto_resume_triggered, rendered as a small clock marker beside the
//     guard badges (tooltip names the reason); the cumulative auto-resume badge + Guard report
//     break counts down by reason, now including 'no response (stall)', 'stream aborted',
//     'connection dropped', and 'empty response'.
//   - v4.285: SILENCE WATCHDOG FOR DEAD-ENDPOINT HANGS. Arms a per-request 15-minute timer
//     (configurable via localStorage tm_stall_watchdog_ms, min 60s) on every session-identified
//     outbound call; the timer resets on every received response chunk and cancels on stream
//     completion or fetch rejection. On expiry it queues the v4.281 auto-resume actuator with
//     reason 'stall_no_bytes'. Covers the failure that silently killed a live Kimi session: a
//     direct Moonshot endpoint accepting a tool-result payload and then going SILENT -- no SSE
//     error chunk exists for the continuity tap to parse, and no fetch rejection fires. 15 minutes
//     is deliberately generous so slow-but-alive models (Claude Fable's >5-minute pre-first-byte
//     thinking, which already forces the direct-Anthropic route around OpenRouter's 5-min idle
//     cutoff) can never false-trigger.
//   - v4.284: GUARD LOCATION INDEXES + GUARD REPORT POP-UP. Every stubbed/recovered entry now
//     carries its payload location ('messages[20]', 'messages[20].content[1]', 'input[7]',
//     'contents[12].parts[0]') so a 🛡️ badge on any turn maps straight back to the Network-tab
//     payload. The stub text itself gains a deterministic 'Payload location:' line (indices are
//     stable because history only appends), badge tooltips lead with the location, and rows with
//     guard data gain a Guard button that opens a formatted report (location, tool, id, size, plus
//     the auto-resume snapshot) in the existing JSON viewer with Copy.
//   - v4.283: GEMINI-NATIVE SUPPORT FOR THE OVERSIZED TOOL-RESULT GUARD. The v4.280 walker only
//     knew messages[]/input[]; Gemini's native contents[] shape (model parts[].functionCall -> user
//     parts[].functionResponse) silently bypassed the guard, so an oversized Gemini tool result
//     flowed through in full on every turn (confirmed live via DevTools Network tab on a 150 KB
//     read_text_file result to Gemini 3.7 Flash). The guard now walks contents[] with the
//     protocol's positional pairing, synthesizing deterministic call IDs ('gm-<name>-<occurrence>')
//     that are byte-stable across turns and unique even for identical parallel calls (a name+args
//     hash would collide exactly there). functionResponse parts are measured/stubbed/restored with
//     the same threshold, GLIMPSE/Lightning-Rod whitelist, 3-point sample, and recovery-phrase
//     protocol; thoughtSignature parts are never touched.
//   - v4.282: GUARD + AUTO-RESUME HISTORY BADGES IN THE RING MODAL. Each capture row now carries
//     three tiny persisted markers next to HIT/MISS: 🛡️N = oversized tool results stubbed on THAT
//     turn, ♻️N = oversized results restored in full on that turn via the recovery phrase (tooltips
//     list tool name/id/size), and ▶️N = cumulative auto-resume count as of that turn (tooltip
//     breaks down by reason: timeouts/rate limits/other 5xx/tool recovery/turn limit). Counts are
//     stamped onto the ring record at capture time; the auto-resume ledger lives in the tiny
//     tm_autoresume_stats_v1 store and is incremented only on a successful continue submission.
//   - v4.281: WALK-AWAY AUTO-RESUME. A passive clone-reader taps completed response streams without
//     delaying, suppressing, or rewriting the bytes TypingMind receives/persists. It detects late
//     streamed transient errors (including Kimi/OpenRouter mid-stream 504 idle timeouts) and, only
//     for requests where v4.280 actually stubbed a result, reconstructs a bounded final-text tail
//     to recognize the exact recovery phrase for one of those call IDs. Either signal queues one
//     session-ID-gated DOM actuator: a cancellable 10-second modal, exact sidebar-title-prefix
//     match, visible-conversation Session-ID verification, empty-draft guard, then React-compatible
//     insertion/submission of `continue`. Missing/ambiguous identity and verification failures all
//     fail closed; no cap is imposed on legitimate future resumes.
//   - v4.280: OVERSIZED TOOL-RESULT SAFETY GUARD. Every final outbound conversation payload is
//     scanned for individual tool results over a widget-configurable limit (default 100 KB). Large
//     results are replaced wire-only with one deterministic, cache-stable safety stub containing
//     tool name/id, stable arguments, exact serialized byte size, and bounded start/middle/end
//     samples. TypingMind's AssemblyDB remains untouched, so the original result is rehydrated on
//     every later turn and the same stub is regenerated byte-identically. If an assistant later
//     emits the exact instructed line `Please restore tool result <tool_call_id>`, subsequent
//     payloads pass that result through in full. GLIMPSE and Lightning Rod are explicitly
//     whitelisted (including qualified MCP names) because their intentionally large reading views
//     are normal. Supports Anthropic, OpenAI chat-completions, and OpenAI Responses tool shapes.
//   - v4.276: BEST-EFFORT RETROACTIVE ERROR BACKFILL. On extension load, pre-v4.275 ring entries
//     that still retain a JSON response body, raw response head, or saved SSE error segment are
//     scanned once and upgraded with the same persistent `error` record. This can recover the
//     already-captured Moonshot empty-assistant 400 without reproducing the now-fixed request.
//     Entries whose heavy response evidence was already quota-stripped remain honestly unchanged.
//   - v4.275: PERSISTENT PROVIDER-ERROR HISTORY. Every captured provider failure now gets a
//     first-class `error` field on its existing ring-buffer entry: non-streaming JSON errors,
//     HTTP>=400 bodies without a conventional error wrapper, error-bearing SSE chunks (including
//     HTTP-200 streamed failures), the extension's synthetic OpenRouter→Gemini 422, and fetch-level
//     rejections. The compact bounded record preserves status/source, a display message, and the
//     provider's actual error payload; unlike response_body/raw segments it survives the rich-entry
//     stripping pass, so old failures remain diagnosable. Each error renders as a loud red clickable
//     row near the bottom of its capture entry; clicking copies the full error JSON and opens the
//     existing formatted JSON viewer with its explicit Copy button. Summary JSON now includes error.
//   - v4.274: DIRECT MOONSHOT EMPTY-MESSAGE REPAIR. The existing OpenAI-compatible
//     repairChatCompletionsEmptyMessageContent() helper already protected OpenRouter Kimi traffic,
//     but the later direct api.moonshot.ai branch only injected prompt_cache_key and let historic
//     assistant messages with content:"" pass through unchanged. Moonshot rejects those requests
//     ('message ... with role assistant must not be empty'). Direct Moonshot chat-completions now
//     applies the same conservative placeholder repair, records the count in the existing repair
//     tally captured by the ring/widget, and reserializes whenever either caching or repair changes
//     the body. The tool_calls exemption is also narrowed to a genuinely NONEMPTY array, so a stale
//     tool_calls:[] field cannot let an otherwise empty assistant message escape repair.
//   - v4.273: FOUR-LEVEL PROVIDER CATALOG TREE (RATINGS + SET COSTS). The v4.272 flat model-family
//     grouping was still unusable for questions such as 'which OpenRouter Kimi-K3 provider works?'.
//     Both modals now project the unchanged model::provider stores into one colored nested tree:
//       LEVEL 1 broad family (Claude / GPT / Kimi / Gemini / DeepSeek / GLM / Qwen / Grok / MiniMax)
//       LEVEL 2 specific model (claude-opus-5, kimi-k3, deepseek-v4-flash-0731, ...)
//       LEVEL 3 route target (OpenRouter / DeepInfra / Moonshot / Anthropic / OpenAI / Google Gemini)
//       LEAF serving provider (Fireworks, Morph, Decart, StreamLake Fp8, direct host, ...)
//     Each leaf shows the FULL stored request model beneath the provider name and then the original
//     ratings/comment/delete controls or pricing inputs. OpenRouter leaf identity is the ACTUAL
//     serving provider (the distinction the ratings are for), while the model string remains visible
//     as secondary text. TypingMind proxy is an annotation badge on the endpoint branch, never an
//     extra hierarchy level. ONE shared tmBuildProviderCatalogTree projection drives both modals;
//     Ratings preserves its existing base-provider dedup, Set Costs preserves every distinct pricing
//     key. NO ratings/comments/prices/tombstones are re-keyed or reset. NEW full-path persistence
//     stores the most recently interacted branch separately for each modal and reconstructs all
//     ancestors on reopen; multiple branches may remain open during the current visit. Legacy
//     expansion keys remain untouched on disk but are no longer read. Validated against Dan's live
//     route/rating/cost/lock vocabulary, including Kimi OpenRouter + DeepInfra direct + Moonshot direct.
//   - v4.272: DIRECT-ENDPOINT PROVIDER DISCOVERY + MODEL-FAMILY CATALOG ORGANIZATION. TWO linked
//     fixes across both Provider Ratings and Set Costs. (1) DIRECT PROVIDERS NO LONGER VANISH:
//     discovery previously required cap._provider_label or cap.response_provider. Successful direct
//     DeepInfra turns carry neither even though URL/model/usage/cost are complete, so
//     moonshotai/Kimi-K3 @ api.deepinfra.com was skipped by BOTH modals. ONE shared resolver
//     (tmObservedProviderKey) now falls back to the concrete target host (rejecting 'unknown') and is
//     used by ratings discovery, cost discovery, route display, and no-API-cost calculation. The
//     supplied live shape now creates the existing-schema keys
//     moonshotai/kimi-k3::api.deepinfra.com in both stores. (2) GENERAL MODEL-FAMILY EXPANDERS:
//     top-level sections now group only by the final model-family segment, so
//     anthropic/claude-fable-5 and direct claude-fable-5 appear together under claude-fable-5.
//     Inside is one flat route list. Every item is TWO ROWS: row 1 shows all observable hops
//     (e.g. TypingMind proxy → OpenRouter → anthropic/claude-fable-5, or
//     DeepInfra → moonshotai/kimi-k3); row 2 holds Provider identity + ctx/status + rating/comment
//     controls, or the pricing fields in Set Costs. NO RATING/COST RESET OR SCHEMA MIGRATION:
//     underlying full model::provider keys and all counts/comments/prices remain byte-for-byte.
//     Only UI expansion state normalizes losslessly to family keys: Ratings keeps its persisted full
//     expanded set; Set Costs still remembers one most-recent family across opens and preserves
//     multiple open families in memory during a visit.
//   - v4.271: RING-MODAL SESSION-FILTER CUSTOM LISTBOX (MISS-COUNT RED). Replaces the native
//     <select data-action="set-modal-filter"> in renderPayloadCaptureModal with a div-based,
//     custom-styled listbox so the session Filter dropdown can render the miss count in the MISS
//     badge red (#ff6b6b) -- native <option> elements are single-color plain text, so they could
//     not (this was the v4.269 deferred item). Each identity row = [session label] [disambiguation?]
//     ($total) (misses / hits); the label + ($total) + slash + hits all inherit the session hue,
//     ONLY the miss number is #ff6b6b. Semantics preserved: selection still writes
//     tmModalFilterIdentity then re-renders; the All (empty) row clears the filter; selected state
//     survives re-renders. GOTCHAS handled the same way this file already handles them: (1) RE-RENDER
//     SURVIVAL -- open state is a module flag (tmModalFilterListboxOpen) and the whole modal
//     re-renders every captured turn, so an open listbox STAYS open (no v4.227-4.228 flash-close; no
//     parallel path). (2) ESCAPE -- Escape closes ONLY the listbox first, decided inside the existing
//     DOM-authoritative window-keyup guard (the v4.246/4.247-scarred territory); NO new per-render
//     document keydown listener is added; the flag resets on modal close. (3) CLICK-AWAY + DELEGATION
//     -- clicks resolve via closest('[data-action]') inside the modal's ONE delegated click listener
//     (never fighting it); clicking outside the listbox dismisses it. The panel is absolutely
//     positioned (own max-height + overflow-y) so it layers above ring rows without breaking the
//     modal's own scrolling. NOTE TO DAN: ships WITHOUT arrow-key navigation (the native select gave
//     that for free); can be added later on request.
//   - v4.270: OPENROUTER→GEMINI SILENT-DROP GUARD + GENERIC PROMPT-INGESTION MISMATCH. PROVEN via
//     billed-usage forensics: OpenRouter's OpenAI→Gemini translation silently empties large
//     tool-result content (~43K prompt tokens billed for a ~350K-token conversation; direct Google
//     billed 253K for the same history). (1) HARD BLOCK (default ON): every OpenRouter→Gemini
//     request (proxy-aware via x-target-endpoint) is refused with a synthetic non-retryable 422
//     BEFORE any network call, and a permanent 'openrouter_gemini_blocked' warning is stamped on
//     the capture's ring entry. (2) GENERIC MISMATCH (all providers, heuristic): compares exact
//     UTF-8 outbound bytes (new body_bytes_utf8) against provider-reported prompt tokens
//     (cache-aware: Anthropic cached tokens count as content received); a sub-50% ratio stamps a
//     soft 'prompt_ingestion_mismatch' warning. Both persist as FIRST-CLASS _warnings[] objects
//     (underscore-prefixed so they survive the rich→compact ring strip). Widget shows a red
//     identity-guarded banner RECOMPUTED FROM THE RING each render (survives refresh), dismissible
//     per-warning-id only (a dismissal never hides the NEXT turn's new warning); the ring modal
//     renders every warning as a permanent per-entry row, and gains a 🚫 OR→Gemini block toggle
//     (default BLOCKED; ALLOWED shown alarm-orange for controlled testing).
//   - v4.269: WIDGET MISS-COUNT RED. The persistent widget's (misses / hits) superscript now
//     renders the MISS COUNT in #ff6b6b (the MISS badge red -- the only red in the cost/cache
//     feedback system, since the hue palette deliberately avoids red); slash + hits stay #ccffcc.
//     NOTE: the ring-modal Filter DROPDOWN cannot color just the miss number the same way --
//     native <option> elements are single-color plain text (the session hue); doing it there
//     would require replacing the native select with a custom listbox component (deferred).
//   - v4.268: TRAILING SPACE after the merged (misses / hits) parenthetical in ring-modal rows.
//     The ratio badge ran flush onto the following field (session cost); a trailing &nbsp;
//     inside the HIT/MISS badge now restores the one-blank-space separation. Spacing only
//     applies when the ratio is rendered.
//   - v4.267: RATIO BADGE MERGED INTO HIT/MISS FIELD + BRIGHTER PALETTE + FILTER DROPDOWN RATIOS.
//     (a) The (misses / hits) parenthetical now lives INSIDE the HIT/MISS badge span itself
//     (one &nbsp; after the word; the fixed 30px/58px badge widths were removed so the merged
//     field can't clip). Palette brightened off the black point per user feedback: misses
//     #d07070, parens/slash #d0d0d8, hits #82c882. Ratio stays 9px even on MISS rows.
//     (b) The ring-modal session Filter dropdown now appends the same (misses / hits) ratio to
//     each option label, after the existing ($total) parenthetical; option text is plain escaped
//     text inheriting the session hue (no sub-spans possible inside <option>).
//   - v4.266: DEAD-BRANCH FIX in v4.265's ring-modal session-cost lookup. The hoisted-store
//     fallback read modalCostsStore[capIdKey].total but the ledger stores the cost total as
//     _total (underscore-prefixed, tmRecordSessionCost), so the typeof test always failed and
//     execution always fell through to the per-row tmGetSessionCost localStorage re-parse.
//     One-word fix (.total -> ._total): the hoisted store now actually serves session cost,
//     eliminating the per-row re-parse the hoist was intended to save. Badge behavior unchanged.
//   - v4.265: RING-BUFFER MODAL CUMULATIVE CACHE RATIO BADGE (misses / hits). Added a muted,
//     non-intrusive `(misses / hits)` session cache outcome badge adjacent to the HIT/MISS status
//     badge on every row in the Payload Capture ring buffer modal. Reads the per-identity ledger
//     (`tm_session_costs_v2`) once per modal render pass (hoisted outside the row loop for performance);
//     displays dim muddy red (`#9e4a4a`) for misses, neutral off-white/gray (`#a0a0ab`) for parens/slash,
//     and dim muddy green (`#487e48`) for hits at 9px/600 font size on both HIT and MISS rows.
//   - v4.264: DIRECT-ANTHROPIC AUTOMATIC CACHING + MESSAGE TOOL-INPUT STABILITY. v4.263
//     successfully restored cache writes, but a live follow-up reused only the stable 18,746-token
//     tools/system prefix and rewrote 157,256 conversation tokens at the expensive 1h rate.
//     Root cause in our strategy: moving explicit user-block breakpoints are a poor fit for
//     agentic histories and Anthropic's 20-block lookback; the extension also canonicalized only
//     body.tools schemas, not historical assistant tool_use.input objects in messages. Fix:
//     direct Anthropic now uses the API's current recommended TOP-LEVEL automatic cache_control
//     (server advances the final conversation breakpoint each request) plus ONE explicit system
//     marker as a stable fallback -- 2 of 4 slots total. Historical tool_use.input objects are
//     recursively key-canonicalized (arrays preserved) before caching so TypingMind reserialization
//     cannot invalidate message prefixes. The existing 1h TTL/beta and marker-free self-healing
//     gate remain. Expected warm pattern: large cache_read, only the newly appended suffix written.
//   - v4.263: DIRECT-ANTHROPIC PROMPT CACHING REGRESSION FIX. Live captures on direct
//     api.anthropic.com traffic (claude-fable-5) showed hasCacheControl:false with BOTH
//     cache_read_input_tokens:0 AND cache_creation_input_tokens:0 across consecutive 600K-token
//     turns -- TypingMind is no longer injecting cache_control markers for this model, and the
//     direct-Anthropic branch only ever added the beta header + crash repairs (it relied on
//     TypingMind's native injection, unlike the proxy path which got the same fix in v4.70).
//     Fix: tmEnsureDirectAnthropicCacheControl() mirrors the cap-safe Fix 5 strategy on the
//     NATIVE messages shape -- system is a TOP-LEVEL field here (string or block array), so its
//     last text block is tagged directly (caching tools + system), plus the last 2 user messages
//     (offsets 0/2 with 10/5 fallbacks): 3 markers total, safely under the 4-block cap. TTL is
//     1h, with the extended-cache-ttl-2025-04-11 beta appended alongside the existing
//     prompt-caching beta. Self-healing gate: injection runs ONLY when tmSummarizeCacheControl
//     finds no marker anywhere in the body, so if TypingMind resumes native injection we neither
//     fight it nor risk the provider block cap.
//   - v4.262: GENERIC INPUT-TOKEN NORMALIZATION FOR SEGMENTED RESPONSES. Preserve
//     input_tokens/inputTokens/inputTokenCount in provider-agnostic usage evidence so table-based
//     cost calculation can price formats that split usage across message_start/message_delta-style
//     events (observed on direct Anthropic Claude 5). Previously the generic extractor found cache
//     and output evidence first, creating response_usage without input tokens; that partial object
//     then won the cost-path fallback and stamped _cost_no_usage even though the saved raw segments
//     contained the full input/output counts. Completion-only evidence is now also recognized as
//     billable usage, allowing output pricing when a provider reports its counters incrementally.
//   - v4.261: KIMI TOOL-ID REPAIR VISIBILITY. When v4.259/4.260 replaces a missing or
//     duplicate provider tool-call ID, stamp the EXISTING payload-capture ring row with
//     `_tool_id_repair_count` + last-repair detail (no new localStorage store), immediately
//     repaint the persistent widget with an amber `ID↺` badge, and show the same badge on that
//     ring-modal entry. The capture Summary includes the fields too. Healthy turns clear the live
//     widget badge on the next status rebuild; historical ring rows retain their event fact.
//   - v4.260: KIMI TOOL-ID COLLISION ORACLE WIDENING. The v4.259 response guard now
//     reserves IDs from BOTH normalized history halves: assistant `tool_calls[].id` and
//     `role:'tool'` message `tool_call_id`. If history conversion/pruning retains only the tool
//     response, that surviving ID still blocks provider reuse. This is the deployment-marker
//     bump proving the refreshed TypingMind extension loaded the finalized guard.
//   - v4.259: KIMI DUPLICATE TOOL-CALL-ID RESPONSE GUARD. An intermittent Moonshot/Kimi
//     streaming failure can emit a response-local fallback id such as `edit_file_0` again on
//     later turns (the local tool index legitimately resets, but the correlation id must not).
//     TypingMind persists that duplicate and its tool-inspection modal later resolves the FIRST
//     matching result, showing a stale output beside the clicked call's current input. For every
//     Kimi chat-completions request, collect the historical assistant
//     `messages[].tool_calls[].id` AND tool-message `messages[].tool_call_id` union; transform
//     the returned SSE/JSON before TypingMind consumes it; preserve healthy unique ids
//     byte-for-byte, but replace a missing/history-duplicate/current-response-duplicate id with a
//     collision-checked `call_tm_<random>` id. A response-local map keyed by choice+tool index
//     keeps fragmented stream deltas and parallel tool calls paired. TypingMind therefore stores
//     the repaired assistant id and automatically echoes it on the tool response -- prevention
//     before IndexedDB, with no polling or historical database mutation. Non-Kimi responses are
//     untouched; Kimi responses with healthy ids are semantically unchanged.
//   - v4.258: RAW-SEGMENT SIZE SAFETY for Responses-API SSE. The final `response.completed`
//     event on OpenRouter/OpenAI Responses echoes the ENTIRE response object -- including the
//     full `tools` array (~megabytes on big MCP setups) -- so a single 'usage segment' could
//     dwarf the v4.255 1.5MB ring budget and get evicted/compact to nothing. Root cause: the
//     push was `usageSegments.push(jsonStr)` with NO per-segment bound. Fix: cap each stored
//     segment at 24KB; oversized segments are replaced by a compact skeleton that preserves
//     usage/cost/error verbatim and strips the giant echoed fields (tools, large output arrays,
//     reasoning content). Error-bearing segments are always kept (v4.198 behavior preserved);
//     a tiny hard-error row is never dead. This also hardens the direct-OpenAI Responses path,
//     whose response.completed echo is identical. Kimi reasoning-content counting (v4.257)
//     remains the audit surface; this change only bounds storage.

//   - v4.257: (a) Sol reasoning injector now ALSO guarantees reasoning.context='all_turns'
//     (GPT-5.6's persisted-reasoning context mode -- default on the modern direct/OpenRouter
//     Responses paths, but pinning it is harmless there and closes any legacy/Chat-Completions
//     config where it defaulted off; OpenAI/OpenRouter both document it as GPT-5.6-only).
//     Does NOT set store/include -- OpenRouter Responses is stateless by default and direct
//     OpenAI's stateful behavior must not be flipped. (b) tmSummarizeReasoningReplay now also
//     counts Kimi/Moonshot's `reasoning_content` field (native Chat-Completions thinking
//     channel) so Kimi continuity audits read correctly instead of false-negative none:true.
//     K3 docs: 'add the COMPLETE assistant message returned by the API to the next request. Do
//     not keep only content.' NOTE: v4.256's 1.5MB ring budget may evict the rich rich-skeleton
//     path for long convos, hiding per-message reasoning markers; the aggregate stays exact.

//   - v4.256: REASONING-REPLAY AGGREGATES THAT SURVIVE THE RECORD BUDGET. Live audit (2026-08)
//     found v4.255's per-message replay markers structurally invisible for real conversations:
//     any large history blows TM_PAYLOAD_CAPTURE_MAX_OUTBOUND_CHARS (1000), so capture falls
//     back to tmBuildMinimalCaptureSkeleton -- which carried none of the markers (the pasted
//     'skeleton' was even a DOUBLE-skeleton: tmBuildHugeSkeleton applied to the stored minimal
//     record, hence the self-referential keys list). Fix: ONE cheap single-pass aggregate,
//     tmSummarizeReasoningReplay -- counts only, never content: assistants, Anthropic thinking/
//     redacted_thinking blocks, chat-shape reasoning strings + reasoning_details (type
//     histogram), Responses-shape replayed reasoning items + encrypted chars; explicit
//     {none:true} when a scan finds nothing (distinguishes 'scanned, zero' from 'could not
//     scan'). Emitted at top level of BOTH skeleton tiers (rich chat + Responses branches, and
//     the minimal compact record), so every future row answers the replay question at a glance.
//     Also closes the flagged whitelist gap: Anthropic's native body-level `thinking` param now
//     surfaces in the rich chat skeleton AND the minimal record (is thinking explicitly
//     requested, or provider-defaulted?). Audit context: raw segments already proved Fable-5
//     via OpenRouter (Azure) thinks -- output_tokens_details.thinking_tokens 7126 -- and clean
//     multi-tool-loop turns prove within-loop signed-block replay (Anthropic hard-errors
//     otherwise). EXPECTATION for readers: thinking_blocks may legitimately be ZERO on
//     fresh-turn requests (Anthropic ignores prior-turn thinking by design); the cell that
//     must be nonzero is a mid-tool-loop continuation.
//   - v4.255: RING QUOTA SAFETY + INJECTED-FIELD VISIBILITY. (a) TypingMind hard-crashed when the
//     capture ring hit 4.3MB of the shared ~5MB origin localStorage quota -- at that size it is
//     TYPINGMIND'S OWN writes that start throwing, not ours (append path had evict-retries; the
//     response-stamp writer tmWriteCaptureRing just warned; and NOTHING bounded total bytes --
//     count caps alone cannot). Ring halved per Dan: 500 -> 250 entries, rich window 100 -> 50.
//     NEW hard byte budget (1.5MB) on the serialized ring, enforced in BOTH writers: over budget,
//     heavy fields (bodies, raw SSE segments, verbatim headers) are stripped oldest-first in
//     chunks, then oldest entries evicted; tmWriteCaptureRing also gains quota-catch
//     evict-and-retry. The ring can no longer starve the app. (b) Skeleton captures now SURFACE
//     the extension's own injected fields -- chat: reasoning / session_id / usage / provider /
//     prompt_cache_key; Responses: reasoning / include / store / previous_response_id -- plus
//     reasoning-REPLAY markers (per-message _reasoning_chars + _reasoning_details type list;
//     Responses input item `type` + _encrypted_reasoning_chars) and tool_calls name/arg-size
//     markers. These instrument the open question of whether prior-turn reasoning blocks are
//     replayed to reasoning models via OpenRouter (Fix 19's Grok 404 already proved replay
//     HAPPENS for reasoning_details-emitting models; this makes it visible per-turn).
//   - v4.254: Fix 15 POLARITY INVERSION -- preserve union+default everywhere EXCEPT Moonshot-bound
//     requests. v4.253 dropped the advisory `default` sibling from every anyOf-union optional on
//     every chat-completions-shaped body, universally -- needless information loss, since ONLY
//     Moonshot's day-one Kimi-K3 validator ever rejected union+default (OpenAI provably accepts
//     it: the untouched /v1/responses path ships exactly that shape; Fireworks' historical 400
//     was the SEPARATE typeless-property bug, which remains fixed unconditionally). Now the
//     default-drop is GATED to Moonshot-bound requests only: URL host contains 'moonshot'
//     (direct api.moonshot.*), OR body.model contains 'moonshot'/'kimi' (covers OpenRouter FLOAT
//     mode, where the serving provider is unknowable at request time and a moonshotai/* model MAY
//     land on Moonshot; over-stripping for the Kimi family is provably harmless -- the v4.253
//     test matrix showed Kimi emits minimal calls with or without defaults), OR an existing
//     body.provider order/only pin names a moonshot slug. Everywhere else union+default now
//     passes through VERBATIM. Constraint-conflicted unions (sibling type/enum/const --
//     genuinely contradictory schema, never emitted by FastMCP) still flatten unconditionally.
//     BONUS: this is the live H1-vs-H2 discriminator for WHY Sol null-fills all optionals via
//     OpenRouter -- if a coherent default is the omission cue (H1), Sol-via-OpenRouter now goes
//     minimal-args like the direct path; if it still null-fills, upstream strict-mode function
//     calling (H2) is the likelier mechanism. Either way calls succeed.
//   - v4.253: Fix 15 UNION PRESERVATION (the Sol-via-OpenRouter empty-string-optionals bug).
//     tmFlattenAnyOfForStrictSchema no longer collapses an anyOf/oneOf/allOf union whose ONLY
//     conflicting sibling is the advisory `default` annotation (the universal FastMCP Optional
//     shape: anyOf:[{X},{null}] + default:null) -- it now DROPS the `default` and KEEPS the
//     union intact, null arms and all. The old collapse-to-first-concrete-branch destroyed the
//     null arm (the model's in-schema cue that a field is meant to be omitted/null) and any
//     extra arms (e.g. render_spec's object form, anyOf:[string,object,null] -> bare string).
//     Proven live 2026-08: GPT-5.6 Sol via OpenRouter (chat-completions tool shape), seeing the
//     de-nulled bare types, populated every optional with "" (output_file:"") and crashed the
//     GLIMPSE MCP tool; the same forked turn sent direct to OpenAI /v1/responses (whose FLAT
//     tool shape this repair structurally never touches -- no tool.function.parameters) emitted
//     a clean minimal call. Moonshot's strict validator objects to the UNION+SIBLING
//     coexistence, NOT to a standalone union, so dropping the sibling satisfies it without
//     de-nulling; genuine constraint siblings (parent-level type/enum/const) would LOOSEN the
//     schema if deleted, so that rare shape falls through to the old conservative flatten.
//     Omission semantics are unaffected either way: optionality is governed by `required`
//     (never touched) and the MCP server's own defaults remain authoritative. NEEDS LIVE
//     RE-TEST vs Moonshot (Kimi locked) to confirm standalone unions pass its validator.
//   - v4.252: Ring-row polish, final pass. The '(T)' session-total tag gets a NON-BREAKING space
//     before it (it was running straight into the digits) and shifts from the pink family to a
//     near-white light gray, so it reads as a LABEL on the amount rather than as part of the
//     number. &nbsp; specifically -- with the field already nowrap, a regular space would be
//     collapsible and is not worth the ambiguity. Combined-field min-width 62px -> 68px to absorb
//     the extra space so the column still aligns for the widest amounts. Model name 21px -> 23px.
//   - v4.251: Two ring-row legibility tweaks.
//     (a) The v4.248 session-total tag now HUGS its dollar amount. The gap was not padding: the
//     amount lived in its own min-width:55px inline-block, so a short value like '$0.04' left the
//     tag stranded at the 55px mark instead of beside the digits. Fixed by collapsing amount + tag
//     into ONE inline-block that keeps the min-width (so the column still aligns across rows,
//     including em-dash rows), with the tag emitted immediately after the digits with NO
//     intervening space, shortened to '(T)' and given a slightly brighter tint so the pair reads as
//     a single field. Column alignment downstream is preserved; the field is simply narrower now,
//     consistently on every row.
//     (b) Model name font 13px -> 21px (+62%). It is THE primary identifying field when scrolling
//     the ring, but sat visually dominated by the button row directly above it. line-height nudged
//     1.1 -> 1.15 so taller glyphs cannot clip. Row height grows slightly; that is intended.
//   - v4.250: Gemini SESSION IDENTITY — the third and last head of the v4.244 Gemini hydra. Native
//     Gemini rows showed '—' for the session total and had NO clickable session hash (so the
//     session could not be named), while every other provider worked. ONE root cause: BOTH
//     session-derivation tiers read body.messages / body.input, but a Gemini-native body carries
//     body.contents (roles 'user'/'model', text under parts[].text) and body.systemInstruction. So
//     tier 1 (deriveConversationIdFromBody, which scans user turns for a pasted 'Session ID: ...')
//     found no user messages and returned null, and tier 2 (tmDeriveStableSessionId) hashed an
//     EMPTY seed and also returned null -- every Gemini capture got session_id null.
//     That single null explains both symptoms and the asymmetry that exposed it:
//       * tmRecordSessionCost bails on its FIRST line ('if (!sessionId || !model || cost <= 0)
//         return 0'), so session_cost_total was never stamped and tmGetSessionCost also returned 0
//         -> the '—'. Meanwhile the 12h/24h figures DID render, because tmComputeBlockCost walks
//         the RING by identity key and never consults the session ledger. Same money, two paths,
//         only one of which needs a session id.
//       * With no session id there was nothing to render or click, hence no way to name the session.
//     Fixed by teaching both tiers the Gemini shape via tmNormalizeGeminiBodyToMessages(), which
//     maps contents[]/systemInstruction onto the {role, content:string} form the existing scanners
//     already understand (Gemini 'model' role -> 'assistant'; a missing role means user).
//     SIDE BENEFIT worth knowing: a null session id also made the identity key
//     'null::model::host::direct' IDENTICAL for every Gemini conversation, so 12h/24h block costs
//     and hues were SMEARING all Gemini conversations into one bucket. Each conversation now gets
//     its own identity. Consequence: Gemini identity keys change again, so block/session totals
//     start a fresh (correct) bucket, and ring rows captured before v4.250 keep showing '—'
//     because their stored session_id is null -- new turns are correct.
//   - v4.249: Two more junk-row sources removed, by two DIFFERENT mechanisms chosen for safety.
//     (a) api.firecrawl.dev/v1/scrape -- a browser-side scraping-tool call, same class as the
//     already-filtered ElevenLabs TTS endpoint: a real third-party API but NOT an LLM provider, so
//     it carries no tokens, no cache and no per-token cost. Added to the capture-time host list.
//     Deliberately an EXPLICIT host, not a heuristic: a 'looks non-LLM' rule could silently drop a
//     genuine new provider, which is the one failure mode worth avoiding here.
//     (b) The dead OpenRouter Anthropic-skin probe: TypingMind's DIRECT call to
//     openrouter.ai/api/v1/messages, which the browser CORS-blocks -- it is the very call that
//     triggers TypingMind's 'enable the proxy' prompt. That grant lasts 24h, so the probe
//     reappears when it lapses (confirmed live: consecutive ring entries exactly 24h apart). The
//     fetch throws, so tmCaptureResponse NEVER runs and the row is informationally empty: no
//     status, no usage, no cost, and a display-computed MISS. Unlike (a) this canNOT be filtered at
//     capture time -- nothing about the request is knowable as doomed before it fails -- so it is a
//     DISPLAY filter folded into the existing retry-visibility toggle (relabeled 'Noise'), which
//     keeps the rows COUNTED and one click from visible rather than silently discarded.
//     WHY (b) CANNOT HIDE A REAL CHARGE: usage/cache/cost are stamped ONLY in tmCaptureResponse,
//     so a row that never received a response cannot carry billing data. tmIsDeadProxyProbeRow
//     additionally requires ALL of: direct (never cors-proxy) OpenRouter /v1/messages URL, no
//     response_status AND no response_ok, no usage/anthropic-usage/usage-segments, no table cost,
//     and age > 30s so the CURRENT in-flight turn is never hidden while awaiting its response.
//     Note these probe rows never polluted the cache ledger or cost totals (no response = no
//     stamping event); they were purely visual clutter, unlike the v4.245 /api/version rows, which
//     returned HTTP 200 and so DID write MISSes and clobber widget status.
//   - v4.248: Ring-row cost disambiguation. A ring entry shows TWO pink dollar amounts and neither
//     said which was which: the smaller one on the info row (row 2) is the running SESSION total,
//     the larger one at the left of the cost row is THIS single payload's inference cost. Two cues
//     added. (1) A small '(TOT)' tag sits to the right of the session total -- labeling just ONE of
//     the pair is sufficient to resolve the ambiguity, so the per-payload cost stays unlabeled and
//     uncluttered. The tag is rendered in a fixed min-width inline-block (empty when there is no
//     session total) so the row's column alignment is unchanged either way. (2) The per-payload
//     cost is nudged 1/3 of the way from the shared pink #ffccd5 toward the persistent widget's
//     distinctive mud-orange per-turn cost #ff6b3d, giving #ffaca2 -- rgb(255,204,213) ->
//     rgb(255,172,162), i.e. R unchanged, G/B moved one third. Deliberately only a THIRD: going
//     all the way to #ff6b3d would compete with the red MISS text, which must keep standing out.
//   - v4.247: Listener-leak cleanup completed. v4.246 neutralized the CONSEQUENCE of leaked
//     child-modal Escape listeners (the ring modal's guard no longer trusts state a leaked handler
//     can mutate); this removes the leak itself. The ratings modal leaked one document keydown
//     listener per family toggle (it re-renders by removing its overlay and calling itself again,
//     never removing the listener) -- unbounded growth across a long session. Same self-uninstall
//     guard now used by the cost-editor/json-viewer handlers: if the handler's own overlay is no
//     longer in the DOM, it is a leak, so it detaches itself and returns. Also applied to the
//     error-popup and provider-set handlers, which leak one copy per reopen.
//   - v4.246: Set Costs modal — collapsible model families (mirrors the v4.236 Rate Providers
//     expanders). With ~100+ model→provider rows the flat list was unusable. Persistence is
//     deliberately DIFFERENT from the ratings modal: the ratings modal stores the FULL expanded
//     set, whereas Set Costs stores only the SINGLE most-recently-expanded family
//     (tm_provider_costs_expanded_v1), so the modal always opens fully COLLAPSED except that one
//     family — even if several were open when it was last closed. Multiple families may still be
//     open during a visit (tracked in memory only, reset on each fresh open).
//   - v4.246: JSON viewer modal gets an explicit '📋 Copy' button (clipboard API with a
//     textarea/execCommand fallback, and a ✓/⚠ flash confirmation) so the pretty-printed contents
//     can be handed to an agent without manually selecting text.
//   - v4.246: Escape now RELIABLY closes the ring-buffer modal. The handler existed since v4.221
//     but was being defeated: child modals (ratings/cost-editor/json-viewer/...) re-render by
//     removing their overlay and calling themselves again WITHOUT removing their document-level
//     capture keydown listener. Those leaked listeners keep firing forever, and each one calls its
//     close(), which sets tmPayloadCaptureSuppressEscapeUntil = now+1500 — so the ring modal's
//     keyup handler saw a 'suppressed' window on EVERY subsequent Escape and ate it. One family
//     toggle in Rate Providers was enough to kill Escape for the rest of the page session. Fixed
//     at a SINGLE point instead of patching six modals: a window-CAPTURE keydown listener
//     snapshots {child-overlay-open, tmPromptActive, suppressed} BEFORE any document-level
//     (leaked) listener can run, and the keyup handler decides from that snapshot. A spurious
//     suppress set DURING the same keypress by a leaked handler is therefore invisible, while the
//     legitimate guards (native prompt() in flight, held-key repeat after a real child close, a
//     child modal genuinely open) all still win. tmAnyChildModalOpen() is DOM-authoritative, so
//     the state cannot get permanently stuck the way the old boolean could.
//   - v4.245: Junk ring rows from TypingMind's OWN backend eliminated (generalized v4.194).
//     '/api/version' (the deployment-SHA poll — response body is just {vercelGitSHA}) was landing
//     in the ring as an information-free row: model '', protocol 'unknown', no usage, permanent
//     MISS. Cause is identical to v4.194's '/api/check-cors': TypingMind calls its own backend
//     with a RELATIVE path, so the u.includes('typingmind') HOST check never matches. Not merely
//     cosmetic — each such row is an HTTP 200, so capWidgetFeed was true and it (a) wrote a MISS
//     into the cache-outcome ledger (empty identity, padding miss totals) and (b) replaced
//     tmMostRecentPayloadStatus, transiently clobbering the persistent widget's model/provider/hue
//     with junk. Fixed generally: a same-origin RELATIVE path can only reach the app's own server,
//     so it can never be a provider endpoint and is now filtered wholesale. THE ONE EXCEPTION is
//     TypingMind's cors-proxy, which DOES carry real LLM traffic — its exemption is now
//     HOST-AGNOSTIC ('/api/cors-proxy' rather than 'typingmind.com/api/cors-proxy') so it stays
//     captured even if TypingMind ever calls it relatively. Unknown relative paths are logged ONCE
//     each (console.debug) so a genuinely new traffic-carrying endpoint reveals itself instead of
//     silently vanishing from cost tracking.
//   - v4.244: Gemini NATIVE (generativelanguage.googleapis.com) observability repair — two
//     independent root causes that together produced 'every turn is a MISS and costs nothing'
//     on gemini-3.7-flash (i.e. money draining invisibly, the worst possible failure mode).
//     RC-1 (half-mapped usage fields): tmExtractKnownUsageEvidence recognized Gemini's
//     cachedContentTokenCount but NOT promptTokenCount / totalTokenCount / candidatesTokenCount,
//     so the normalized usage object held cached tokens and nothing else. The cache BADGE showed
//     a correct ~498K while tmIsSignificantCacheHit had no denominator at all (input_tokens ||
//     prompt_tokens || total_tokens all undefined) -> false -> MISS on a genuine 99.2% hit, every
//     turn. Also added a real completion_tokens extraction (never present for ANY provider
//     spelling before), summing Gemini's separately-reported thoughtsTokenCount since thinking is
//     billed as output. RC-2 (empty model): a native Gemini request body has NO `model` field —
//     the model lives in the URL path (/v1beta/models/gemini-3.7-flash:streamGenerateContent) —
//     and the response says `modelVersion`, not `model`, so tmCaptureModel resolved ''. That empty
//     string silently disabled the ENTIRE cost pipeline: tmDiscoverAndMergeProviderCosts skips the
//     row ('if (!model) continue') so no Set Costs entry was ever created to price, and
//     tmCaptureResponse's client-side cost block is gated on idModel so it never ran (no cost, not
//     even a _cost_init_needed flag). Google returns no cost field of its own, so there was no
//     other cost source. Model is now derived from the URL at capture time (x-target-endpoint
//     header checked too, for cors-proxied traffic) with modelVersion/URL fallbacks in
//     tmCaptureModel that ALSO back-fill ring rows captured before this version.
//   - v4.242: Fix 15 extended — Moonshot strict-schema repair. Moonshot AI's tool-schema
//     validator 400s ('tools.function.parameters is not a valid moonshot flavored json schema,
//     ... conflicting keywords found in anyOf with parent: keywords (default) are defined on the
//     parent') whenever a property carries BOTH an anyOf/oneOf/allOf union AND a sibling keyword
//     (default/type/enum/const) on the SAME node. FastMCP Optional[...] params emit exactly this
//     shape (anyOf:[{...},{type:'null'}] with a parent-level default). tmFlattenAnyOfForStrictSchema()
//     collapses such a union to a single concrete non-null branch, merging the parent default/
//     description/title back in, so every provider (Moonshot included) accepts it. Semantic-
//     preserving for the common Optional case; conservative otherwise.
// Issues Fixed:
//   - v4.236: Widget flashpoint cost fix — the persistent widget's top-row per-turn cost now
//     shows table-calculated cost for providers returning no API cost (e.g. Moonshot/DeepSeek
//     direct). The status object is stamped with the table cost at response-receipt, and the
//     post-refresh fallback (tmLastSuccessfulUsage) returns it too.
//   - v4.236: Cache-write cost billing in tmCalculateCostFromTable. When the response shows
//     cache reuse (cached_tokens > 0) AND cache creation tokens are present, they are billed
//     at the cache_write pricing field (if set in the Set Costs table). Quick-and-dirty: the
//     user sets cache_write to the output rate as a conservative overestimate.
//   - v4.234: Audit fixes — tmCalculateCostFromTable now reads Anthropic-style usage fields
//     (input_tokens/output_tokens) as fallbacks when prompt_tokens/completion_tokens are
//     absent; call-site tcUsage falls back to response_anthropic_usage so direct-Anthropic
//     providers get table-calculated cost instead of a silent ⚠. Doc lag fixed (v4.232
//     comments no longer say "planned for future version"). Beacon blocks added to
//     tmCalculateCostFromTable, tmDiscoverAndMergeProviderCosts, and tmShowCostEditorModal.
//   - v4.233: Client-side cost calculation from a global cost table ("Set Costs" modal).
//     New "Set Costs" button in the ring-buffer modal (next to "Rate Providers") opens a
//     hierarchical modal where you set per-million pricing (input, output, cache_read, cache_write)
//     for each model→provider combination. When a response carries NO cost field from the API,
//     the extension looks up the model+provider in this table and calculates cost from token
//     usage (cached_tokens × cache_read + new_input × input + output × output, all per-million).
//     Three flags are stamped on ring buffer entries:
//       _cost_calculated: cost was computed from the table (shown with ○ circle indicator).
//       _cost_no_usage:   table entry exists but token usage can't be determined (shown with ⚠
//                         red X, hover explains the problem).
//       _cost_init_needed: no table entry existed (or entry has all-zero pricing); a zero entry
//                         was auto-created and the user needs to populate it (shown with 🌱
//                         green indicator).
//     The pricing values used are also saved on the ring entry as _cost_pricing_used.
//     Token determination: prefer completion_tokens for output; fallback to total_tokens -
//     prompt_tokens; ultimate fallback total_tokens - cached_tokens (billed as output, includes
//     new input). New input = prompt_tokens - cached_tokens (only when not using the fallback).
//   - v4.232: Moonshot AI (api.moonshot.ai) prompt_cache_key injection — mirrors the DeepInfra
//     v4.79 pattern. Moonshot's API is OpenAI-compatible (/v1/chat/completions) and supports a
//     top-level `prompt_cache_key` parameter (confirmed in Kimi API Platform docs). The key
//     improves cross-instance KV cache hit rate on their serverless fleet. Uses the same stable
//     per-conversation derivation (tmDeriveStableSessionId) as DeepInfra and OpenRouter's
//     session_id. Also confirmed: Moonshot's API returns usage with cached_tokens but NO cost
//     field — cost must be calculated client-side from the published pricing ($3/M input cache
//     miss, $0.30/M cache hit, $15/M output). The cost-table interface for client-side cost
//     calculation is shipped in v4.233 (Set Costs modal).
//   - v4.231: Provider ratings system enhancements. Red rating buttons swapped so + (increment
//     failure count) sits on the left where you naturally slam it when angry. Inline comment
//     previews now appear to the right of each 📝 button (lines joined with " - ", ellipsis-
//     truncated).
//   - v4.230: Fix missing 12h/24h block costs on cache-MISS ring rows. Two causes: (1) LAYOUT:
//     the title-row left group was a fixed 150px box; the wider MISS badge (58px vs HIT's 30px)
//     overflowed and painted over the 12h/24h amounts. Now a natural-width flex row with
//     flex-shrink:0 on the cost chips. (2) STAMPING: 12h/24h snapshots were only written inside
//     the turnCost>0 branches; now always stamped whenever identity is known, after cost
//     accumulation, so misses/zero-delta turns still get the block aggregate. tmComputeBlockCost
//     now prefers ISO cap.ts over ts_local for reliable Date parsing.
//   - v4.229: Provider ratings system. A new "📊 Rate Providers" button in the ring-buffer
//     modal's model→provider map row opens a hierarchical modal showing every model→provider
//     combination discovered in the ring buffer (merged with localStorage-persisted ratings).
//     Each provider entry has 🔴 red (failure) and 🟢 green (success) counts with +/− buttons
//     (floor at 0), and a 📝 comment button that opens a nested textarea modal. Ratings are
//     independent of any session and persisted in localStorage key tm_provider_ratings_v1.
//     New combos from the ring buffer are auto-discovered and initialized with zero ratings.
//   - v4.228: Provider-routing dropdown flash-close fix (real root cause). The widget only
//     listened for 'click', never 'change' — so clicking the routing <select> to OPEN it
//     dispatched a click whose target.value was the PRE-change value. When a provider was
//     already locked (the normal case), that value was non-empty, so tmHandleProviderRoutingChange
//     re-applied the lock and unconditionally re-rendered the widget, destroying the <select>
//     DOM and instantly closing the native popup (the "click and it flashes shut" bug; v4.227's
//     empty-value guard only covered the no-lock case). Fix: routing + Sol-reasoning selects
//     are now handled by a real document-level 'change' listener (capture phase, survives the
//     widget's innerHTML rebuilds), and the widget click handler leaves selects alone.
//   - v4.227: (partial) Guarded tmHandleProviderRoutingChange against empty-value re-renders.
//   - v4.226: Model→Provider map row replaces session-init in the ring modal.
//   - v4.225: Per-entry 12h and 24h block cost snapshots. Each ring entry now stamps
//     _cost_12h and _cost_24h at response receipt — the aggregate per-turn cost for the
//     session identity within the current 12-hour block (and current+prior 12h block).
//     Displayed in the ring modal title row to the right of the total session cost
//     (which got a font bump from 9px to 11px). Two distinct colors (light blue / lavender)
//     distinguish the two values.
//   - v4.224: Time-window filter for the ring-buffer modal. A dropdown next to the sort pills
//     offers three options: Current 12h block (since the last noon or midnight boundary),
//     Current 24h block (current 12h + the previous full 12h block), or All. Applies to ALL
//     sort modes (chronological, turn-cost, session-cost). Timeline separators still appear
//     only in chronological mode.
//   - v4.223: Timeline separators in the ring-buffer modal (chronological sort only). When
//     scrolling through captures in chronological mode, a dim gray horizontal rule with a
//     date label is inserted at each day boundary (showing "Monday, June 23 → Tuesday, June 24")
//     and at each noon crossing on the same day (showing "Monday, June 26, 2026  AM → PM").
//     Makes it easy to visually navigate the timeline of captures at a glance.
//   - v4.216: AUDIT FIX for the v4.214 provider-display work (reported by Dan: picked 'Fireworks
//     Fast', still showed 'Fireworks'). The v4.214 label-resolution MACHINERY was correct --
//     the bug was UPSTREAM in the label source: v4.205 live discovery labeled every endpoint
//     with provider_name, which is IDENTICAL across variants ('Fireworks' for both 'fireworks'
//     and 'fireworks/fast'), and tmMergeSeedKnowledge preferred that live label over the seed's
//     curated 'Fireworks Fast'. So locks stored bare 'Fireworks' for either variant and the
//     display faithfully showed it. Fixes: (1) tmBuildLiveProviderEntries now derives the
//     variant from the tag slug and appends it ('fireworks/fast' -> 'Fireworks Fast');
//     (2) tmMergeSeedKnowledge prefers the curated seed label for known slugs; (3) bumped the
//     live cache key v1->v2 to drop stale 12h-cached labels; (4) one-time
//     tmRepairLockLabelsFromEntries() migration repairs existing lock labels on load.
//   - v4.215: Retry 5xx server errors, not just 429s. A 503 'upstream connect error' (or any
//     500-599) is usually a momentary blip that clears on resubmit, so it now joins the same
//     backoff auto-retry loop. 4xx client errors (400/401/403/404/422) are still never retried
//     (deterministic failures). Log line now shows the actual error code instead of hardcoded 429.
//   - v4.214: Provider display labels now resolve through the lock store. When a lock exists
//     for an identity, its label (e.g. 'Fireworks Fast') is shown instead of the bare
//     response_provider string (always just 'Fireworks' for both variants). Applied to all
//     three display points: persistent widget model row, ring-modal row badge, and the
//     ring-modal routing dropdown. Shared helper tmResolveProviderLabel(idKey, fallback).
//   - v4.213: SESSION INITIALIZATION. New '🌱 Init session' row in the ring-buffer modal: paste a
//     Session ID and pick a model+provider (or provider set) from MEMORY (distinct model/provider
//     pairs from successful ring entries + existing set locks), saved as the single global entry
//     tm_provider_init_v1. On the FIRST outbound payload carrying that pasted Session ID (Tier-1
//     deriveConversationIdFromBody) with NO provider lock anywhere for that session, the stored
//     choice is persisted as that identity's lock and applied to THAT request; from then on the
//     standard lock machinery (and the dropdowns) own it. Model MISMATCH => a once-per-session
//     blocking alert and the init is NOT applied (request proceeds unrouted). Lets Dan pre-seed
//     routing for a brand-new conversation before any traffic exists.
//   - v4.211: Persistent-widget error hygiene + cache-badge repair (Dan's 'leave all values the
//     same on a 429' spec). (1) WIDGET-FEED GATE: error responses (HTTP>=400 OR an error chunk in
//     the body) no longer rebuild tmMostRecentPayloadStatus -- the widget keeps the LAST
//     SUCCESSFUL turn's cost/cache/provider instead of being wiped by an empty error turn.
//     (2) 429s are NO LONGER written to the per-identity cache ledger as misses -- consecutive-
//     hit streaks and miss totals now count real turns only. (3) Widget badges read the
//     cache-outcome LEDGER (tmGetCacheOutcomeForIdentity) instead of the ephemeral
//     status.cacheStats, plus a last-successful-usage fallback (tmLastSuccessfulUsage) -- so
//     badges finally render after refresh AND after error turns (they lived inside the
//     turn-cost span, which vanished whenever cost was 0). (4) IDENTITY GUARD: the red error row
//     only renders when the error's identity matches the widget's displayed identity, and a
//     success clears only its OWN session's banner -- parallel conversations no longer overwrite
//     each other's widget.
//   - v4.210: Ring-buffer modal retry-visibility toggle. With auto-retry absorbing most 429s, the
//     ring modal was drowning in retry-attempt rows, hiding the real turns. New '⏳ Retries:
//     hidden/shown' button in the control row (next to sort pills + identity filter) filters out
//     auto-retry/429 rows -- detected three ways for robustness: vendor tag 'openrouter-retry',
//     HTTP status 429, or a captured response that parses to an OpenRouter 429 error (covers
//     200-streamed 429s too). DEFAULT: hidden (spam gone immediately). Persisted in localStorage
//     (tm_ring_hide_retries_v1) across refresh; button shows live hidden-count. Identity+retry
//     filters hoisted ahead of the banner so the count renders in the control row.
//   - v4.209: HTTP-200 STREAMED provider errors are now caught. OpenRouter can deliver a provider
//     error as a chat.completion.chunk with an `error` field INSIDE an HTTP 200 SSE stream
//     (observed: Together 429 with bare {error_type} metadata -- Dan's 'blazing red error and it
//     died' case that slipped the >=400 gate). tmPeekStreamForError reads ONLY the first SSE data
//     event (<=4KB / <=4s cap, comment/heartbeat-safe) from the live stream; healthy streams are
//     REBUILT byte-for-byte (prefix chunks + remainder via the same reader) so token streaming is
//     never buffered or delayed; error streams are cancelled and routed into the SAME backoff/
//     auto-retry core (tmHandleOpenRouterError) as HTTP>=400, with a synthetic prefix-only
//     response as the safe fallback for every non-retry outcome (NEVER a partially-read
//     original). Error parser now also reads the chunk's top-level `provider` field so bare
//     Format-A blobs name the provider in the widget error row.
//   - v4.208: Anthropic tool-use ID sanitizer for cross-model transcript compatibility. Some
//     non-Anthropic/OpenRouter models write tool_use IDs like 'search_web:0', but direct Anthropic
//     requires ^[a-zA-Z0-9_-]+$ and rejects colons. repairAnthropicToolUseIds() now rewrites any
//     non [A-Za-z0-9_-] char to underscore on BOTH assistant tool_use.id and paired user
//     tool_result.tool_use_id across all Anthropic-shaped outbound payloads (direct Anthropic,
//     OpenRouter /v1/messages skin, and TypingMind proxy -> Anthropic messages), before missing
//     tool_result repair so all downstream logic sees canonical IDs. Also carries forward the
//     v4.207 retry reset/backoff fix: successful responses unconditionally reset the per-identity
//     429 counter and the retry clamp is 15s (max retries 20), preventing stale 30s backoff slog.
//   - v4.206: Provider-routing dropdown now lives in the RING-BUFFER MODAL on the MOST RECENT
//     entry of each identity (tracked by the canonical 4-part key, first occurrence in sort
//     order). This makes routing controllable PER-SESSION immediately after a TypingMind refresh
//     and across parallel conversations -- the persistent widget only ever shows the single
//     most-recent identity and only after first traffic. The dropdown builder and change handler
//     are now SHARED (tmBuildProviderRoutingDropdown / tmHandleProviderRoutingChange) between the
//     widget model row and the ring modal; the modal's existing 'change' listener delegates.
//     Ring dropdowns also lazily kick off live endpoint discovery per model.
//   - v4.205: LIVE provider discovery. The widget now lazily fetches OpenRouter's Endpoints API
//     per model (12h localStorage cache, tm_provider_live_v1) so NEW providers -- and new models
//     like DeepSeek -- appear in the dropdown/set-modal automatically with no source edit. The
//     fetch carries the tm_passthrough=1 sentinel so OUR OWN hook passes it verbatim (no capture
//     row, no auto-retry, no injection); any failure (CORS/network/404) silently keeps the seed
//     table. tmMergeSeedKnowledge preserves curated seed order/notes/toxic flags (base-slug
//     tolerant: seed 'moonshotai' matches live 'moonshotai/mxfp4') and appends new providers with
//     live values (cache flag from input_cache_read pricing -- Nebius's 0%-cache confession is
//     machine-readable). tmIsMultiProviderModel / dropdown / set-modal / AUTO-order all read live
//     entries. ALSO: on TypingMind refresh the widget provider label now reads the last ring
//     entry's response_provider (captured since v4.197) before degrading to the bare host.
//   - v4.204: Fix 18 -- multi-select allowed-provider SET. Dropdown gains '🎯 Multi-select set…',
//     opening a checkbox modal of the model's providers (cache/toxic badges, current set
//     pre-checked). Apply writes a SET lock ({mode:'set', slugs, labels}) keyed by the canonical
//     identity; injection then sends provider.only=[slugs] with NO order (OpenRouter smart-
//     balances WITHIN the set, routing around hot pools => fewer 429s) and allow_fallbacks:true
//     (fallbacks stay inside the set). Each set member keeps its own prompt cache warm across
//     interleaved turns (observed live). Single-lock path now also clears any stale provider.only.
//     Widget shows 🎯 glyph + Set(N)/Set: A+B in the dropdown. Auto-stamp skips set locks for
//     free (a lock exists). ALSO: TM_AUTO_RETRY_MAX raised 5 -> 20 per Dan: for a walk-away run,
//     'came back to an error' and 'came back to a retry loop' cost the same, but only one can
//     still finish -- ~5-8 min absorption per chain, subsequent chains ride the 30s clamp.
//   - v4.203: Fix 17 hardening. (1) Retry ANY 429, not just those carrying retry_after_seconds --
//     providers omit it constantly (observed: Moonshot sends bare {error_type:rate_limit_exceeded};
//     Fireworks sends {provider_error_code} with NO retry_after). v4.202 required the field and so
//     silently did nothing on those. (2) EXPONENTIAL BACKOFF with a PER-SESSION consecutive-failure
//     counter (tm_ratelimit_state_v1, keyed by canonical sid::model::host::proxy identity): wait =
//     min(max(hint, 2^(fails-1)), 30s), so a hardcoded-1s hint can't re-hammer a hot pool. Counter
//     RESETS on a successful response for the same identity; entries self-expire after 1h. (3) Any
//     HTTP>=400 with an unparseable body still raises the widget error row (never a silent generic).
//     (4) BUGFIX: originalFetch.apply(this,...) inside setTimeout -> apply(window,...); 'this' is
//     undefined in strict mode and would kill the retry with an illegal-invocation TypeError.
//   - v4.202: Fix 17 -- OpenRouter error surfacing + auto-retry. (a) tmParseOpenRouterError reads
//     the rich error segment (429 rate-limit / provider errors) that TypingMind flattens into a
//     useless generic error. (b) A clickable red error row on the persistent widget opens a popup
//     with the full raw error JSON + remedy_hint; auto-cleared on the next successful response.
//     (c) tmMaybeAutoRetry auto-retries transient 429s per retry_after_seconds (cap 5, max 30s
//     each) so a walk-away background run finishes in real time instead of stalling on a 1s blip
//     until the human types 'continue'. Runs ONLY on OpenRouter URLs and ONLY buffers error
//     responses (>=400) -- successful streaming responses are never buffered or delayed.
//   - v4.201: Fix 16 AUDIT FIXES (Opus 4.8 audit of GLM-5.2's v4.200). BUG A (critical): three
//     surfaces computed the lock identity key three ways -- injector used host='' (-> 'unknown'),
//     stamp used tmExtractEndpointHost ('openrouter.ai'), widget used widgetIdentity -- so stamped
//     locks were INVISIBLE to the injector and AUTO never engaged. Now ONE shared builder
//     (tmComputeRoutingIdentityKey, url+headers at call sites) mirrors the capture-side key
//     byte-for-byte; widget uses the canonical stamped identity.key directly. BUG B (critical):
//     dropdown change handler referenced modelForDisplay (scoped to renderGpt51UsageWidget) from
//     inside ensureGpt51UsageWidget -> ReferenceError crashed manual switches; model now derived
//     from the identity key. BUG C: float mode showed lock glyph + wrong wave emoji (U+1F330
//     chestnut -> U+1F30A wave). BUG D: duplicate 'baseten' alias key. BUG E: dead '__auto'
//     sentinel in stamp simplified to a single !existingLock check (a Float lock EXISTS, so it
//     blocks re-stamping for free).
//   - v4.200: Fix 16 — generic provider routing with auto-lock. Replaces the hardcoded Fix 13
//     Kimi block with a model-agnostic 3-mode system: LOCKED (hard-pin to one provider,
//     allow_fallbacks:false — visible hard-fail, never a silent $0.65 bounce), AUTO (preference
//     order from seed, allow_fallbacks:true — first success auto-stamps a lock), FLOAT (inject
//     nothing — escape hatch). Dropdown on the persistent widget model row shows lock state
//     (glyph + label) and lets you switch/unlock/float. Only renders for multi-provider models
//     (seed table today; live Endpoints API fetch in phase 2). Lock store keyed by canonical
//     4-part identity, integrated into the session-scoped prune/touch lifecycle. Provider
//     slug normalization handles display-name to slug (Moonshot AI -> moonshotai, BaseTen ->
//     baseten, etc.) including spelling drift. Error-only responses never auto-stamp a lock.
//   - v4.199: Fix 15 — tool-schema type repair. TypingMind's MCP->OpenAI tools conversion DROPS
//     any JSON-Schema `type` whose value is an ARRAY (e.g. FastMCP Optional served as
//     `type:["string","null"]`), leaving a property with default/description/title and NO type.
//     Lax providers (Moonshot/OpenAI/Anthropic) tolerate it; Fireworks' strict validator 400s the
//     whole request ('JSON Schema not supported: could not understand the instance ...'). Confirmed
//     live on lightning_rod.comment. tmRepairToolSchemas() now walks body.tools and re-injects a
//     single-string type into any typeless property (universal, before canonicalization). Restores
//     portability across ALL providers; one expected cache miss on first post-deploy turn (tools
//     bytes change once), stable thereafter.
//   - v4.199: Fix 13 order changed to FIREWORKS-FIRST (speed over cache-stickiness) since Moonshot
//     is molasses under launch load. order:['fireworks','moonshotai','together','modal'],
//     allow_fallbacks:true. Watch the inline provider badge: a turn that bounces off Fireworks to
//     another provider will cost a cache write (the speed/cache tradeoff, by design).
//   - v4.198: (a) Raw Seg button now appears on FAILURE rows. Provider 400s (e.g. Fireworks
//     'JSON Schema not supported') return a single error-only SSE chunk with no usage, which
//     previously was dropped — the row showed a provider but had NO Raw Seg button. Now error
//     chunks are preserved as segments, and the button falls back to a raw-response-head dump
//     (in_raw_head) so it is never dead on a crashed turn. (b) Persistent widget model row now
//     shows the serving provider after a pipe (model | provider), matching the ring-buffer row.
//   - v4.197: Fix 13 — Kimi provider pinning. OpenRouter post-open-weights load balancing began
//     landing long-idle Kimi K3 sessions on non-caching providers (Baseten ~41%, Nebius 0.0%),
//     causing full-price prompt-cache misses every turn. tmEnsureOpenRouterAccountingAndSession
//     now injects body.provider {order:[moonshotai,fireworks,together,modal], ignore:[baseten,
//     nebius,morph,digitalocean], allow_fallbacks:true} for Kimi/Moonshot models only. order
//     disables OpenRouter load balancing; ignore is a hard floor. Merge-not-clobber.
//   - v4.197: Capture response `provider` string (from SSE chunk / JSON response) onto the capture
//     record as response_provider, and display it inline (light green) at the right end of each
//     payload-capture modal row's cost/repair/cache line — so the serving provider is visible at a
//     glance (Moonshot vs Baseten) without opening the raw segment. Falls back to endpoint host.
// Purpose: 
//   1. Inject missing prompt-caching-2024-07-31 beta flag into Anthropic API requests
//   2. Strip non-standard "name" field from tool_result content blocks
//   3. Intercept and analyze payloads when [DEBUG-command-fileId] trigger detected
//   4. Inject OpenAI Responses API prompt caching parameters (prompt_cache_key, prompt_cache_retention) for GPT-5.1
//   5. Track GPT-5.1 per-conversation usage and cached_tokens based on "load files <keyword>" first user message
// Issues Fixed:
//   - v4.84: Universal tools key canonicalization. tmStabilizeToolsOrdering() now runs once globally
//     on every intercepted JSON request body before endpoint-specific branches (except passthrough),
//     not just OpenRouter. This applies the proven v4.58 fix to DeepInfra, direct OpenAI, direct
//     Anthropic, TypingMind proxy Anthropic, and any future endpoint with top-level body.tools.
//     It recursively sorts object keys only; array order remains semantic and untouched. This should
//     prevent TypingMind's nondeterministic tool-schema key ordering from busting exact-prefix prompt
//     caches on providers beyond OpenRouter, especially DeepInfra GLM-5.2.
//   - v4.83: Fix Session ID parsing when Dan's first message contains other text before the ID
//     (e.g. "Load GLIMPSE\n\nSession ID: cd02b901"). deriveConversationIdFromBody now scans
//     each user message with a multiline regex for a Session ID line anywhere in the text, instead
//     of requiring the whole message to start with "Session ID:". This fixes the widget/modal
//     pasted-ID display and ensures DeepInfra prompt_cache_key uses the explicit pasted ID.
//   - v4.80: Session ID system for prompt_cache_key + conversation identification. Clicking the
//     widget header row copies "Session ID: <8-char hex>" to clipboard for pasting into the first
//     turn. deriveConversationIdFromBody now scans for "Session ID: <hash>" instead of the obsolete
//     "load files" / "CONVERSATION IDENTITY:" patterns. The session ID is displayed in a small dimmed
//     row below the widget header AND per-row in the payload capture modal. tmDeriveStableSessionId
//     unchanged (Tier 1 now tries Session ID, Tier 2 FNV-1a hash fallback remains).
//   - v4.79: DeepInfra prompt caching fix — inject top-level `prompt_cache_key` into every
//     DeepInfra request body using the same stable per-conversation derivation as OpenRouter's
//     session_id (tmDeriveStableSessionId). DeepInfra load-balances across GPU workers; without a
//     cache key, requests landing on a different instance miss the KV cache and pay full price
//     (~25% of turns). The key pins all turns of a conversation to one shared cache slot, even
//     across instances. Key is scoped per-model + per-account (no collisions). Only injected when
//     not already present (self-healing if TypingMind ever adds native support).
//   - v4.78: Added DeepInfra (api.deepinfra.com) as a new supported endpoint for GLM-5.2.
//     It's an OpenAI-compatible /v1/openai/chat/completions endpoint. No repairs or cache
//     injection needed (prompt caching appears automatic). Usage comes via the standard SSE
//     root-level usage object (same path as OpenRouter). Cost is in `estimated_cost` (not `cost`),
//     so tmRenderCacheReport + tmExtractCostVal now check estimated_cost too. Cached tokens
//     in prompt_tokens_details.cached_tokens (same shape as OpenRouter).
//   - v4.77: Removed the '(collapsed – click ▸ to expand)' hint row — saves vertical space,
//     the toggle icon is self-evident.
//   - v4.76: Final tweak — number font 11px→12px, purple lightened further toward white (#a98bc8 → #b8a0d5),
//     and set bold for emphasis. Σ, $, and reset button unchanged.
//   - v4.75: Bumped the numeric value font from 10px to 11px and lightened its purple toward white (#8b6db5 → #a98bc8).
//     Σ, $, and reset button unchanged (9px, #5d3f8e).
//   - v4.74: Swapped the two purple shades (number now #8b6db5, Σ$/reset now #5d3f8e) and bumped
//     the numeric value's font-size from 9px to 10px for emphasis.
//   - v4.73: Widened the widget by 50px (maxWidth 260→310) to prevent text rollover.
//     Deepened the total-cost purple: standard purple #8b6db5 for Σ, $, and reset button;
//     the numeric value itself rendered in an even darker purple #5d3f8e for emphasis.
//   - v4.72: Added running total cost to the always-visible widget header (far right, muted purple
//     #a088b8, 9px — one notch below the per-turn cost). Accumulates every per-turn cost from server
//     responses (Anthropic usage.cost or OpenRouter usage.cost) into a localStorage-persisted running
//     total (key: tm_total_cost). Includes a small ⟲ reset button that zeroes the total. Survives page
//     refresh; no sync. Does NOT affect the per-row equivalent in the payload-capture modal.
//   - v4.71: Added inference cost badge to the shared tmRenderCacheReport() helper — now appended in gray
//     (#9aa4b2, non-colorized to avoid clashing with the blue cache-read / red cache-write indicators)
//     to ALL three return paths, so it surfaces in BOTH the always-visible widget header AND the per-row
//     payload-capture modal ribbon. Reads cost from whichever usage object carries it (Anthropic
//     response_anthropic_usage.cost or OpenRouter response_usage.cost). Format: $X.XXX (3 decimals).
//   - v4.70: PROXY-PATH CACHING REGRESSION FIX. TypingMind's cors-proxy branch (v4.62) deliberately did
//     NOT inject prompt-caching, on the (then-true) assumption that TypingMind + the native /v1/messages
//     endpoint set cache_control themselves. That assumption is now FALSE: live proxy-path captures show
//     cache_read_input_tokens == 0, so the full ~350K-token prefix is re-billed at full price EVERY turn
//     ($1-2 sessions ballooning to $10-30). FIX: in the proxyIsAnthropicMessages block, mirror the
//     OpenRouter Anthropic Skin branch — inject top-level cache_control {ephemeral, 1h} + the
//     prompt-caching beta header — but ONLY when the body does not already carry cache_control (so if
//     TypingMind ever resumes native injection we neither fight it nor trip the provider 'too many
//     cache_control blocks' cap). Self-healing either way.
//   - v4.69: The per-row payload-capture modal ribbon now also shows the cache report (blue = reused/saved,
//     red = newly-created) to the RIGHT of the repair tally — same font/colors as the always-visible header
//     — so you can scan cache read/write across the most recent turns at a glance. Extracted a shared
//     tmRenderCacheReport() helper used by both the header and the modal rows.
//   - v4.68: Alert-fatigue fix for the repair badge. Slot 2 (historic empty tool_use.input) is common and
//     harmless (no-arg tool calls like GLIMPSE serialize input as {}), so it ALONE no longer turns the R
//     block orange or raises the ⚠. The badge is a calm slate (#9aa4b2) by default and only goes orange +
//     bold + ⚠ when a genuinely notable repair fired: R slots 1/3/4 (tool_result.name / empty content /
//     missing tool_result) or T (orphaned tool_call). So orange now reliably means 'look at this'.
//   - v4.67: HOTFIX for a regression exposed by v4.62 (running repairs on the proxy path for the first
//     time). repairAnthropicMissingToolResults only checked the IMMEDIATELY-following message for an
//     existing tool_result, so on TypingMind's already-well-formed proxy (native /v1/messages) payloads
//     it could inject a SECOND tool_result for an id that already had one -> Anthropic 400 'each tool_use
//     must have a single result. Found multiple tool_result blocks with id ...'. FIX: build a GLOBAL set
//     of every tool_use_id that already has a result ANYWHERE in the payload and only inject for ids that
//     are truly missing everywhere (marking each satisfied as we go), so a duplicate is now structurally
//     impossible. On a valid payload nothing is truly missing -> the repair is a no-op. (Latent bug; also
//     protected the direct-Anthropic + /v1/messages-skin branches.)
//   - v4.66: Also render the two-family repair badge PER-ROW in the payload-capture modal, so you can
//     scan the ring buffer and spot exactly which individual payloads triggered repairs (same R/T +
//     family bright/dim as the header). Extracted a shared tmRenderRepairBlocks() helper used by both.
//   - v4.65: Add the OpenAI-family repair block (T n = orphaned tool_call repair count) beside the
//     Anthropic R a/b/c/d block, and drive a FAMILY highlight: the most-recent payload's family is
//     full-bright while the other family's block is DIMMED (not-applicable). So the header now reports
//     BOTH repair families regardless of transport/endpoint (Anthropic vs OpenAI); the OpenRouter
//     OpenAI-compat and OpenAI Responses branches now tag their family too. (Gemini repairs excluded.)
//   - v4.64: Extend the repair-tally badge to the STANDARD (non-proxy) Anthropic-native branches too:
//     direct api.anthropic.com and the OpenRouter /v1/messages skin now build the same per-call tally
//     (previously only the cors-proxy branch did), so the header badge is populated regardless of which
//     Anthropic path a payload took. NOTE: the 4 counted repairs are Anthropic-messages-shaped
//     (tool_result.name strip / historic empty tool_use.input / empty content / missing tool_result);
//     the OpenRouter OpenAI-compat path (/api/v1/chat/completions) has a different body shape so these do
//     NOT apply there, and Gemini thoughtSignature + OpenAI orphaned-tool-call repairs are separate and
//     intentionally not part of this tally.
//   - v4.63: Repurpose the always-visible widget header (top line) into a live status readout for the
//     MOST RECENT payload: version + repair-tally badge (orange, R a/b/c/d; bold+⚠ if any>0) + cache
//     report (green 'cache' label, BLUE cache-read/saved, RED cache-creation/expensive). Replaces the
//     stale hard-coded 'GPT-5.1 Conversations' title so a glance confirms caching is landing and flags
//     any crash-repairs without opening the modal. Updates async on each response (may 'jump' across
//     concurrent sessions — intentional; not mapped to individual sessions).
//   - v4.62: (a) NEW TypingMind cors-proxy branch — resolves the real upstream from the x-target-endpoint
//     header (TypingMind proxies OpenRouter's native Anthropic /v1/messages via www.typingmind.com/api/cors-proxy)
//     and applies CRASH-PREVENTION REPAIRS ONLY (empty content, missing tool_result, historic empty
//     tool_use.input, stray tool_result.name). Deliberately injects NO cache_control / anthropic-beta:
//     prompt caching on this path already works via TypingMind + the native endpoint (confirmed live by
//     cache_read_input_tokens ~184K on a warm turn). (b) Payload-capture Summary now reports repair_tally
//     (per-repair counts) and the noise filter EXEMPTS typingmind.com/api/cors-proxy so proxied LLM
//     traffic is captured. (c) Removed obsolete GPT-5.4 reasoning-effort forcing (TypingMind now exposes
//     the reasoning control natively; forcing reasoning.effort=xhigh is dead weight and would DOWNGRADE a
//     higher native tier like GPT-5.5 'max').
//   - v4.61: PASSTHROUGH GUARD now keys off a STATELESS URL SENTINEL  tm_passthrough=1  in the request
//     URL (replacing the v4.60 global flag, which was racy across parallel streaming sessions). A URL
//     query param needs no Access-Control-Allow-Headers grant (so it avoids OpenRouter's CORS preflight
//     rejection) AND rides on the request itself (so it can't bleed across concurrent sessions). The
//     x-tm-passthrough header check remains as a harmless fallback.
//   - v4.60: (superseded by v4.61) global-flag  window.__refineDirectFetch  passthrough — racy, replaced.
//   - v4.59: PASSTHROUGH GUARD. Requests carrying header  x-tm-passthrough: 1  bypass this interceptor
//     entirely (no repairs, no prompt-caching header injection, no payload capture) and go straight to
//     the original fetch. Lets sibling extensions (e.g. the Whisper widget's "✨ Refine" Claude/OpenRouter
//     calls) coexist without having their non-conversation payloads corrupted.
//   - v4.8 (Nov 17, 2025): Move tool-call popup width control into Deepgram/Whisper widget; keep this extension focused on payloads only
//   - v4.6 (Nov 16, 2025): Render GPT-5.1 Conversations widget on load using persisted localStorage stats (no message required)
//   - v4.5 (Nov 16, 2025): Expose active extension version in GPT-5.1 widget title to confirm deployment state
//   - v4.4 (Nov 16, 2025): Prime Forge widget tweaks (font bump, collapsible "other conversations", horizontal offset) and NBSP normalization in block_insert_or_replace workflow
//   - v4.3 (Nov 16, 2025): Adds per-conversation usage tracking and lightweight UI widget keyed by first "load files <keyword>" user message, plus approximate cost based on hard-coded GPT-5.1 pricing
//   - v4.2 (Nov 16, 2025): Injects prompt_cache_key & prompt_cache_retention for OpenAI GPT-5.1 /v1/responses calls
//   - v4.1 (Nov 12, 2025): No-op test for documentation validation. Updated welcome message.
//   - v1.0: TypingMind sends extended-cache-ttl but not base prompt-caching flag
//   - v2.0: (planned) Strip non-standard ttl field from cache_control objects
//   - v3.0: Strip "name" field from tool results (MCP adds "name":"STDOUT" but Anthropic rejects it)
//   - v4.0: Payload analysis for debugging tool call patterns
// Impact: Enables 80-90% cost savings via prompt caching (Anthropic + OpenAI GPT-5.1) + fixes run_command crashes + payload debugging + GPT-5.1 per-conversation cost visibility

(function() {
  'use strict';

  // @carto-group id=client-group-1 label="Client group 1"

  const EXT_VERSION = '4.304';

  const GPT51_PRICING = {
    INPUT_NONCACHED_PER_TOKEN: 1.25 / 1e6,   // $1.25 per 1M non-cached input tokens
    INPUT_CACHED_PER_TOKEN:   0.125 / 1e6,   // $0.125 per 1M cached input tokens
    OUTPUT_PER_TOKEN:         10 / 1e6       // $10 per 1M output tokens
  };

  const GPT51_CONTEXT_LIMIT = 400000;        // 400k token context window for GPT-5.1

  // v4.162: Toggleable Sol reasoning effort (medium / high / x-high / max). Persisted in localStorage.
  const TM_SOL_REASONING_EFFORT_KEY = 'tm_sol_reasoning_effort';

  function tmGetSolReasoningEffort() {
    try {
      var v = localStorage.getItem(TM_SOL_REASONING_EFFORT_KEY);
      return (v === 'medium' || v === 'high' || v === 'xhigh' || v === 'max') ? v : 'high';
    } catch (e) { return 'high'; }
  }

  function tmSetSolReasoningEffort(level) {
    try { localStorage.setItem(TM_SOL_REASONING_EFFORT_KEY, level); } catch (e) {}
  }

  // (v4.62) Removed obsolete GPT-5.4 reasoning-effort helpers (tmModelString / tmIsGpt54Model /
  // tmEnsureOpenRouterGpt54Reasoning / tmEnsureOpenAIGpt54Reasoning). TypingMind now exposes the
  // reasoning-effort control natively, so forcing reasoning.effort=xhigh is dead weight — and on a
  // model with a higher native tier (e.g. GPT-5.5 'max') it would actively DOWNGRADE the request.

  // Last Anthropic request body (for export of user+assistant-only JSON)
  let lastAnthropicBodyForExport = null;

  // Last Gemini request body (for export of user+assistant-only JSON)
  let lastGeminiBodyForExport = null;

  // Last Grok request body (for export of user+assistant-only JSON)
  let lastGrokBodyForExport = null;

  // Last GPT-5.1 request body (for export of user+assistant-only JSON)
  let lastGpt51BodyForExport = null;

  // (v4.63) Most-recent-payload status for the always-visible widget header: repair tally + cache usage.
  // Reflects whichever payload most recently RECEIVED a response, across all sessions (it may 'jump').
  let tmMostRecentPayloadStatus = { ts: 0, repairTally: null, anthropicUsage: null, orUsage: null };

  // (v4.72) Running total cost — persisted in localStorage, survives page refreshes.
  const TM_TOTAL_COST_KEY = 'tm_total_cost';

  function tmGetTotalCost() {
    try {
      var v = parseFloat(localStorage.getItem(TM_TOTAL_COST_KEY));
      return (!isNaN(v) && v >= 0) ? v : 0;
    } catch (e) {
      return 0;
    }
  }

  function tmSetTotalCost(val) {
    try {
      localStorage.setItem(TM_TOTAL_COST_KEY, String(val));
    } catch (e) {
      console.warn('⚠️ [v' + EXT_VERSION + '] Failed to persist tm_total_cost:', e);
    }
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmPruneSessionScopedStorage-0m8e,
  //   role=__lambdao_1.tmPruneSessionScopedStorage,
  //   slice_labels=tm-payload-cost-visibility,tm-payload-overview,
  //   kind=ast,
  //   comment=Anti-leak: prunes every session-derived map by per-entry _ts. Global settings are intentionally left alone.,
  // ]
  function tmPruneSessionScopedStorage(cutoff) {
    function pruneMap(storeKey, missingTsMeansOld) {
      try {
        var raw = localStorage.getItem(storeKey);
        if (!raw) return;
        var map = JSON.parse(raw);
        if (!map || typeof map !== 'object') return;
        var changed = false;
        var keys = Object.keys(map);
        for (var i = 0; i < keys.length; i++) {
          var entry = map[keys[i]];
          var ts = (entry && typeof entry === 'object') ? Number(entry._ts || 0) : 0;
          if ((ts && ts < cutoff) || (!ts && missingTsMeansOld)) {
            delete map[keys[i]];
            changed = true;
          }
        }
        if (changed) localStorage.setItem(storeKey, JSON.stringify(map));
      } catch (e) {}
    }
    pruneMap(TM_SESSION_COSTS_KEY, false);
    pruneMap('tm_session_names', true);
    pruneMap(TM_SESSION_HUES_KEY, true);
    pruneMap('gpt51_conv_usage', true);
    pruneMap(TM_PROVIDER_LOCKS_KEY, false);
    try { tmSessionHueCache = null; } catch (e) {}
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmResetTotalCost-6cs3,
  //   role=__lambdao_1.tmResetTotalCost,
  //   slice_labels=tm-payload-cost-visibility,tm-payload-overview,
  //   kind=ast,
  //   comment=Resets global cost and prunes week-old session-derived map entries.,
  // ]
  function tmResetTotalCost() {
    tmSetTotalCost(0);
    // Purge week-old session-derived maps. These maps carry per-entry _ts metadata;
    // global settings are intentionally not session-scoped and are left alone.
    try {
      tmPruneSessionScopedStorage(Date.now() - 7 * 24 * 60 * 60 * 1000);
    } catch (e) {}
    renderGpt51UsageWidget();
  }

  // (v4.106) Per-session cost tracking.
  // v4.153 keys by session ID + model + resolved endpoint host + proxy/direct flag.
  const TM_SESSION_COSTS_KEY = 'tm_session_costs_v2';

  // ==================== PROVIDER ROUTING (Fix 16, v4.200) ====================
  // Per-conversation provider lock store. Keyed by the canonical 4-part identity
  // (sid::model::host::proxy|direct). Value: {slug, label, ts, manual}.
  // When a lock exists, tmApplyProviderRouting injects order:[slug], allow_fallbacks:false --
  // guaranteeing the same provider every turn so prompt caching actually works.
  // A lock failure (provider down/400) hard-fails visibly and FREE (no tokens served) rather
  // than silently bouncing to a $0.65 miss on a different provider. The human sees the failure,
  // opens the dropdown, and manually switches -- informed consent to exactly one cache write.
  const TM_PROVIDER_LOCKS_KEY = 'tm_provider_locks_v1';

  // Seed table: models known to have multiple OpenRouter providers. Used to build the dropdown
  // menu and as the preference-order fallback when no lock exists. Each entry: slug -> {label,
  // cache (bool), note}. Phase 2 replaces this with a live Endpoints API fetch; the seed table
  // guarantees offline functionality today.
  var TM_PROVIDER_SEED = {
    'moonshotai/kimi-k3': [
      { slug: 'fireworks',      label: 'Fireworks',       cache: true,  note: '~82% hit / fast' },
      { slug: 'fireworks/fast', label: 'Fireworks Fast',  cache: true,  note: '64 tps / $0.45 cache' },
      { slug: 'moonshotai',     label: 'Moonshot AI',     cache: true,  note: 'official / ~92% hit / slow under load' },
      { slug: 'together',       label: 'Together',        cache: true,  note: '~79% hit' },
      { slug: 'modal',          label: 'Modal',           cache: true,  note: '~76% hit / mxfp4' },
      { slug: 'baseten',        label: 'Baseten',         cache: false, note: 'poor cache ~41%', toxic: true },
      { slug: 'nebius',         label: 'Nebius',          cache: false, note: 'no cache / fp4 / 47% up', toxic: true },
      { slug: 'morph',          label: 'Morph',           cache: false, note: 'poor cache ~44%', toxic: true },
      { slug: 'digitalocean',   label: 'DigitalOcean',    cache: false, note: '~60% hit', toxic: true }
    ]
    // Phase 2: live Endpoints API fetch will populate this per-model at runtime.
    // DeepSeek, GLM, etc. will be auto-discovered; the seed is a launch-day fallback.
  };

  // Normalize a provider display name from the response (e.g. "Moonshot AI", "Fireworks",
  // "BaseTen") to an injection slug ("moonshotai", "fireworks", "baseten"). Tolerant of
  // case and the BaseTen/Baseten spelling drift seen in the live API.
  var TM_PROVIDER_SLUG_ALIASES = {
    'moonshot ai': 'moonshotai', 'moonshot': 'moonshotai', 'moonshotai': 'moonshotai',
    'fireworks': 'fireworks', 'fireworks fast': 'fireworks/fast', 'fireworks/fast': 'fireworks/fast',
    'together': 'together',
    'modal': 'modal',
    'baseten': 'baseten',
    'nebius': 'nebius', 'nebius token factory': 'nebius',
    'morph': 'morph',
    'digitalocean': 'digitalocean', 'digital ocean': 'digitalocean'
  };

  function tmProviderNameToSlug(name) {
    if (!name) return null;
    var key = String(name).toLowerCase().trim();
    if (TM_PROVIDER_SLUG_ALIASES.hasOwnProperty(key)) return TM_PROVIDER_SLUG_ALIASES[key];
    return key;
  }

  function tmGetProviderLocks() {
    try {
      var raw = localStorage.getItem(TM_PROVIDER_LOCKS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function tmGetProviderLock(identityKey) {
    var locks = tmGetProviderLocks();
    return (locks && locks[identityKey]) || null;
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmSetProviderLock-kwah,
  //   role=__lambdao_1.tmSetProviderLock,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Writes a LOCKED single-provider lock for an identity key (hard pin; injection sends allow_fallbacks:false).,
  // ]
  function tmSetProviderLock(identityKey, slug, label, manual) {
    try {
      var locks = tmGetProviderLocks();
      locks[identityKey] = { slug: slug, label: label, ts: Date.now(), manual: !!manual, _session_id: identityKey.split('::')[0] };
      localStorage.setItem(TM_PROVIDER_LOCKS_KEY, JSON.stringify(locks));
    } catch (e) {}
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmClearProviderLock-15zq,
  //   role=__lambdao_1.tmClearProviderLock,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  // ]
  function tmClearProviderLock(identityKey) {
    try {
      var locks = tmGetProviderLocks();
      delete locks[identityKey];
      localStorage.setItem(TM_PROVIDER_LOCKS_KEY, JSON.stringify(locks));
    } catch (e) {}
  }

  // (Fix 18, v4.204) Write a SET lock: the curated list of providers OpenRouter may route among.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmSetProviderSetLock-w968,
  //   role=__lambdao_1.tmSetProviderSetLock,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Writes a SET lock (provider.only slug list; OpenRouter price/uptime-balances within the set, fallbacks stay inside).,
  // ]
  function tmSetProviderSetLock(identityKey, slugs, labels) {
    try {
      var locks = tmGetProviderLocks();
      locks[identityKey] = { mode: 'set', slugs: slugs.slice(), labels: (labels || slugs).slice(), ts: Date.now(), manual: true, _session_id: identityKey.split('::')[0] };
      localStorage.setItem(TM_PROVIDER_LOCKS_KEY, JSON.stringify(locks));
    } catch (e) {}
  }

  // (v4.214) Resolve the DISPLAY label for a provider: when a lock exists for this identity,
  // use the lock's label (which carries the full 'Fireworks Fast' distinction) instead of the
  // bare response_provider string (which is always just 'Fireworks' for both variants).
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmResolveProviderLabel-l60n,
  //   role=__lambdao_1.tmResolveProviderLabel,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Resolves an identity's provider display label through the lock store (variant-aware, e.g. 'Fireworks Fast' vs bare 'Fireworks').,
  // ]
  function tmResolveProviderLabel(idKey, fallbackProvider) {
    try {
      if (idKey) {
        var lock = tmGetProviderLock(idKey);
        if (lock) {
          if (lock.mode === 'set' && Array.isArray(lock.labels)) return 'Set: ' + lock.labels.join('+');
          if (lock.label) return lock.label;
        }
      }
    } catch (e) {}
    return fallbackProvider || '';
  }

  // ==================== MODEL → PROVIDER MAP (v4.226) ====================
  // Replaces the old v4.213 session-init system. The ring-buffer modal now has a row with
  // two dropdowns: Model (aggregated from ring entries) → Provider (from tmGetProviderEntries,
  // the live-discovery + seed list). The selection is saved as a simple key-value map:
  //   localStorage[tm_model_provider_map_v1] = { "moonshotai/kimi-k3": "moonshotai", ... }
  // One provider per model. When a NEW outbound payload creates a new session identity
  // (sid::model::host::proxy not yet in tm_session_costs_v2), the model→provider map is
  // consulted: if the model has a mapped provider, that provider is auto-locked for the
  // identity. This means every new session automatically gets the pre-chosen provider.
  var TM_MODEL_PROVIDER_MAP_KEY = 'tm_model_provider_map_v1';

  function tmGetModelProviderMap() {
    try { var r = localStorage.getItem(TM_MODEL_PROVIDER_MAP_KEY); return r ? JSON.parse(r) : {}; } catch (e) { return {}; }
  }
  function tmSetModelProvider(model, slug) {
    try {
      var map = tmGetModelProviderMap();
      map[model] = slug;
      localStorage.setItem(TM_MODEL_PROVIDER_MAP_KEY, JSON.stringify(map));
    } catch (e) {}
  }
  function tmGetModelProvider(model) {
    try {
      var map = tmGetModelProviderMap();
      return map[model] || null;
    } catch (e) { return null; }
  }

  // (v4.236) Normalize a provider identifier to its LOWERCASE BASE slug for dedup. Accepts a slug
  // ('deepinfra/fp8' -> 'deepinfra') OR a display label ('DeepInfra Fp8' -> 'deepinfra'). Stripping
  // the variant suffix lets us collapse 'DeepInfra' and 'DeepInfra Fp8' to ONE ratings row (we keep
  // the most granular entry). We deliberately do NOT resolve against tmGetProviderEntries here
  // (seed labels like 'Fireworks Fast' would otherwise wrongly map 'fireworks'->'fireworks/fast');
  // base-slug normalization is the conservative, correct granularity for ratings dedup.
  function tmNormalizeProviderBaseSlug(s) {
    try {
      if (!s) return '';
      var x = String(s).toLowerCase().trim();
      x = x.split('/')[0];           // slug form: drop variant
      x = x.split(/\s+/)[0];         // label form: drop trailing variant word ('Fp8')
      x = x.replace(/[^a-z0-9]/g, '');
      return x;
    } catch (e) { return String(s || '').toLowerCase(); }
  }

  // (v4.238) Format a max-context token count compactly for dropdown/ratings display.
  // 1048576 -> '1.0M', 524288 -> '524k', 200000 -> '200k'. Returns '' for null/0.
  function tmFmtCtx(n) {
    try {
      if (typeof n !== 'number' || !isFinite(n) || n <= 0) return '';
      if (n >= 1000000) return (Math.round(n / 100000) / 10) + 'M';
      if (n >= 1000) return Math.round(n / 1000) + 'k';
      return String(n);
    } catch (e) { return ''; }
  }

  // (v4.272) Normalize a provider-catalog model to its MODEL FAMILY for modal grouping only.
  // OpenRouter commonly names models as vendor/model (e.g. anthropic/claude-fable-5), while
  // direct endpoints use the bare model (claude-fable-5). The persisted rating/cost key remains
  // the FULL model::provider pair; only the disclosure-header grouping uses the final path segment.
  function tmProviderModelFamily(model) {
    var s = String(model || '').toLowerCase().replace(/:(nitro|floor|free)$/i, '');
    var parts = s.split('/').filter(function(p) { return !!p; });
    return parts.length ? parts[parts.length - 1] : s;
  }

  // (v4.272) Friendly label for a concrete target endpoint. This is presentation-only; storage
  // continues to use the exact provider label/host that existing rating and cost lookups expect.
  function tmProviderEndpointLabel(host) {
    var h = String(host || '').toLowerCase();
    if (h === 'openrouter.ai') return 'OpenRouter';
    if (h === 'api.deepinfra.com') return 'DeepInfra';
    if (h === 'api.moonshot.ai') return 'Moonshot';
    if (h === 'api.anthropic.com') return 'Anthropic';
    if (h === 'generativelanguage.googleapis.com') return 'Google Gemini';
    if (h === 'api.openai.com') return 'OpenAI';
    if (!h) return '';
    return h;
  }

  // (v4.272) ONE provider-key resolver shared by ratings discovery, cost discovery, route display,
  // and the no-API-cost calculation path. Direct providers such as DeepInfra may return complete
  // usage/cost evidence without response_provider or _provider_label; in that case the concrete
  // target host is the durable fallback key (e.g. api.deepinfra.com).
  function tmObservedProviderKey(cap) {
    if (!cap) return '';
    if (typeof cap._provider_label === 'string' && cap._provider_label) return cap._provider_label;
    if (typeof cap.response_provider === 'string' && cap.response_provider) return cap.response_provider;
    try {
      var host = tmExtractEndpointHost(cap) || '';
      return (host && host !== 'unknown') ? host : '';
    } catch (e) { return ''; }
  }

  // (v4.272) Build route-path presentation metadata from the ring. The key matches the existing
  // persisted model::provider key exactly, so this adds no migration/reset blast radius. Newest
  // observation wins. Example paths:
  //   TypingMind proxy → OpenRouter → anthropic/claude-fable-5
  //   DeepInfra → moonshotai/kimi-k3
  function tmBuildProviderRouteCatalog() {
    var out = {};
    try {
      var ring = tmReadCaptureRing();
      for (var i = 0; i < ring.length; i++) {
        var cap = ring[i];
        if (!cap) continue;
        var model = '';
        try { model = tmCaptureModel(cap); } catch (e) {}
        if (!model) continue;
        model = String(model).toLowerCase().replace(/:(nitro|floor|free)$/i, '');
        var provider = tmObservedProviderKey(cap);
        if (!provider) continue;
        var host = '';
        var isProxy = false;
        try { host = tmExtractEndpointHost(cap) || ''; } catch (e) {}
        try { isProxy = tmIsProxyCapture(cap); } catch (e) {}
        var hops = [];
        if (isProxy) hops.push('TypingMind proxy');
        var endpointLabel = tmProviderEndpointLabel(host);
        if (endpointLabel) hops.push(endpointLabel);
        hops.push(model);
        var providerDisplay = provider;
        if (host && String(provider).toLowerCase() === String(host).toLowerCase()) {
          providerDisplay = endpointLabel ? (endpointLabel + ' (' + host + ')') : host;
        }
        out[model + '::' + provider] = {
          route: hops.join(' \u2192 '),
          providerDisplay: providerDisplay,
          host: host,
          isProxy: isProxy
        };
      }
    } catch (e) {}
    return out;
  }

  function tmProviderRouteForStoredEntry(model, provider, catalog) {
    var key = model + '::' + provider;
    if (catalog && catalog[key]) return catalog[key];
    var providerStr = String(provider || '');
    var looksLikeHost = providerStr.indexOf('.') !== -1;
    var endpointLabel = looksLikeHost ? tmProviderEndpointLabel(providerStr) : providerStr;
    return {
      route: (endpointLabel || providerStr) + ' \u2192 ' + model,
      providerDisplay: (looksLikeHost && endpointLabel && endpointLabel !== providerStr)
        ? (endpointLabel + ' (' + providerStr + ')')
        : providerStr,
      host: '',
      isProxy: false
    };
  }

  // (v4.273) Broadest tree family: first hyphen-delimited token of the specific model name.
  // Display aliases keep acronym/canonical casing readable while the key remains lowercase.
  function tmProviderBroadFamily(model) {
    var specific = tmProviderModelFamily(model).replace(/^~+/, '');
    var key = (specific.split('-')[0] || specific || 'other').toLowerCase();
    var labels = {
      claude: 'Claude', gpt: 'GPT', kimi: 'Kimi', gemini: 'Gemini', deepseek: 'DeepSeek',
      glm: 'GLM', qwen: 'Qwen', grok: 'Grok', minimax: 'MiniMax', user: 'Other'
    };
    return { key: key, label: labels[key] || (key.charAt(0).toUpperCase() + key.slice(1)) };
  }

  // Resolve the route TARGET (tree level 3) independently from the serving provider (leaf).
  // Exact ring evidence wins. Historical namespaced model rows without ring evidence are known
  // OpenRouter catalog records; concrete host provider keys identify direct routes.
  function tmProviderEndpointForStoredEntry(model, provider, routeInfo) {
    var p = String(provider || '');
    var pl = p.toLowerCase();
    var host = routeInfo && routeInfo.host ? String(routeInfo.host).toLowerCase() : '';
    if (!host && pl.indexOf('.') !== -1) host = pl;
    if (!host && (pl === 'openrouter.ai' || String(model || '').indexOf('/') !== -1)) host = 'openrouter.ai';
    var label = host ? tmProviderEndpointLabel(host) : (p || 'Unclassified route');
    return {
      key: (host || label).toLowerCase(),
      label: label,
      host: host,
      viaProxy: !!(routeInfo && routeInfo.isProxy)
    };
  }

  function tmProviderLeafDisplay(provider, endpointInfo, routeInfo) {
    var p = String(provider || '');
    if (endpointInfo && endpointInfo.host === 'openrouter.ai' && p.toLowerCase() === 'openrouter.ai') {
      return 'Unresolved serving provider';
    }
    return (routeInfo && routeInfo.providerDisplay) ? routeInfo.providerDisplay : p;
  }

  // Shared 4-level projection used by BOTH Provider Ratings and Set Costs:
  // broad family → specific model → route endpoint → serving-provider leaf.
  // `dedupeBase=true` preserves Ratings' existing v4.236 base-provider dedup; Set Costs passes
  // false because every distinct persisted pricing key must remain independently editable.
  function tmBuildProviderCatalogTree(records, routeCatalog, dedupeBase) {
    var tree = {};
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      if (!rec || !rec.storageModel || !rec.provider) continue;
      var broad = tmProviderBroadFamily(rec.storageModel);
      var specific = tmProviderModelFamily(rec.storageModel);
      var routeInfo = tmProviderRouteForStoredEntry(rec.storageModel, rec.provider, routeCatalog);
      var endpoint = tmProviderEndpointForStoredEntry(rec.storageModel, rec.provider, routeInfo);
      if (!tree[broad.key]) tree[broad.key] = { key: broad.key, label: broad.label, variants: {} };
      var variants = tree[broad.key].variants;
      if (!variants[specific]) variants[specific] = { key: specific, label: specific, endpoints: {} };
      var endpoints = variants[specific].endpoints;
      if (!endpoints[endpoint.key]) endpoints[endpoint.key] = {
        key: endpoint.key, label: endpoint.label, host: endpoint.host,
        viaProxy: endpoint.viaProxy, leaves: {}
      };
      var leafKey = rec.storageModel + '::' + rec.provider;
      if (dedupeBase) leafKey = rec.storageModel + '::' + tmNormalizeProviderBaseSlug(rec.provider);
      var candidate = {
        storageModel: rec.storageModel,
        provider: rec.provider,
        value: rec.value,
        routeInfo: routeInfo,
        endpoint: endpoint,
        leafDisplay: tmProviderLeafDisplay(rec.provider, endpoint, routeInfo)
      };
      var old = endpoints[endpoint.key].leaves[leafKey];
      var granular = rec.provider.indexOf('/') !== -1 || /\s/.test(rec.provider);
      if (!old || (dedupeBase && granular && old.provider.indexOf('/') === -1 && !/\s/.test(old.provider))) {
        endpoints[endpoint.key].leaves[leafKey] = candidate;
      }
      if (endpoint.viaProxy) endpoints[endpoint.key].viaProxy = true;
    }
    return tree;
  }

  var TM_RATINGS_TREE_PATH_KEY = 'tm_provider_ratings_tree_path_v1';
  var TM_COSTS_TREE_PATH_KEY = 'tm_provider_costs_tree_path_v1';
  var tmRatingsTreeExpanded = {};
  var tmCostsTreeExpanded = {};

  function tmTreePathId(path) { return (path || []).join('\u001f'); }
  function tmReadTreePath(key) {
    try { var v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function tmWriteTreePath(key, path) {
    try {
      if (path && path.length) localStorage.setItem(key, JSON.stringify(path));
      else localStorage.removeItem(key);
    } catch (e) {}
  }
  function tmSeedTreeExpanded(path) {
    var out = {};
    for (var i = 1; i <= (path || []).length; i++) out[tmTreePathId(path.slice(0, i))] = true;
    return out;
  }
  function tmTreePathStartsWith(full, prefix) {
    if (!full || !prefix || full.length < prefix.length) return false;
    for (var i = 0; i < prefix.length; i++) if (full[i] !== prefix[i]) return false;
    return true;
  }
  function tmToggleTreePath(expanded, path, storageKey) {
    var id = tmTreePathId(path);
    if (expanded[id]) {
      for (var k in expanded) {
        if (expanded.hasOwnProperty(k) && (k === id || k.indexOf(id + '\u001f') === 0)) delete expanded[k];
      }
      var remembered = tmReadTreePath(storageKey);
      if (tmTreePathStartsWith(remembered, path)) tmWriteTreePath(storageKey, path.slice(0, -1));
      return false;
    }
    expanded[id] = true;
    for (var i = 1; i < path.length; i++) expanded[tmTreePathId(path.slice(0, i))] = true;
    tmWriteTreePath(storageKey, path);
    return true;
  }

  // ==================== PROVIDER RATINGS (v4.229) ====================
  // Tracks per-model, per-provider ratings (red = failures, green = successes)
  // and free-text comments. Independent of any session — persisted in localStorage.
  // Key format: "model_lower::provider_label" → { red: N, green: N, comment: "..." }
  var TM_PROVIDER_RATINGS_KEY = 'tm_provider_ratings_v1';

  function tmGetProviderRatings() {
    try { var r = localStorage.getItem(TM_PROVIDER_RATINGS_KEY); return r ? JSON.parse(r) : {}; } catch (e) { return {}; }
  }

  function tmSaveProviderRatings(ratings) {
    try { localStorage.setItem(TM_PROVIDER_RATINGS_KEY, JSON.stringify(ratings)); } catch (e) {}
  }

  function tmGetProviderRatingEntry(model, provider) {
    try {
      var ratings = tmGetProviderRatings();
      var key = model + '::' + provider;
      return ratings[key] || { red: 0, green: 0, comment: '' };
    } catch (e) { return { red: 0, green: 0, comment: '' }; }
  }

  function tmSetProviderRatingField(model, provider, field, value) {
    try {
      var ratings = tmGetProviderRatings();
      var key = model + '::' + provider;
      if (!ratings[key]) ratings[key] = { red: 0, green: 0, comment: '' };
      ratings[key][field] = value;
      localStorage.setItem(TM_PROVIDER_RATINGS_KEY, JSON.stringify(ratings));
    } catch (e) {}
  }

  // (v4.236) Permanently delete a provider-rating row (cleanup of duplicate/detritus entries).
  // (v4.239) ALSO tombstone the key in a `_deleted` map — otherwise tmDiscoverAndMergeProviderRatings
  // (which runs on every modal open) immediately re-derives the provider from the ring buffer and
  // re-adds it, making the trash icon appear to do nothing.
  function tmDeleteProviderRating(model, provider) {
    try {
      var ratings = tmGetProviderRatings();
      var key = model + '::' + provider;
      if (ratings.hasOwnProperty(key)) delete ratings[key];
      if (!ratings._deleted || typeof ratings._deleted !== 'object') ratings._deleted = {};
      ratings._deleted[key] = true;
      tmSaveProviderRatings(ratings);
    } catch (e) {}
  }

  // (v4.273) Expansion state now uses the shared full-path tree helpers above. Legacy v4.236/
  // v4.246 localStorage keys are intentionally left untouched on disk, but are no longer read;
  // ratings and costs each remember their most recently interacted full tree branch.

  // Scan the ring buffer for all observed model→provider combos. Also adds entries for
  // locked providers (tm_provider_locks_v1) and model→provider map entries — so a provider
  // that hangs and never returns a response is STILL in the list and rateable.
  function tmDiscoverAndMergeProviderRatings() {
    try {
      var ratings = tmGetProviderRatings();
      var ring = tmReadCaptureRing();
      var changed = false;
      // (v4.239) Tombstoned (user-deleted) keys must NOT be re-added by discovery.
      var deleted = (ratings._deleted && typeof ratings._deleted === 'object') ? ratings._deleted : {};

      // (A) Ring buffer combos — providers that actually returned a response.
      for (var i = 0; i < ring.length; i++) {
        var cap = ring[i];
        if (!cap) continue;
        var model = '';
        try { model = tmCaptureModel(cap); } catch (e) {}
        if (!model) continue;
        model = model.toLowerCase().replace(/:(nitro|floor|free)$/i, '');
        var provider = tmObservedProviderKey(cap);
        if (provider) {
          var key = model + '::' + provider;
          if (!ratings[key] && !deleted[key]) { ratings[key] = { red: 0, green: 0, comment: '' }; changed = true; }
        }
      }

      // (B) Locked providers — known even if no response was received (hanging request).
      try {
        var locksStr = localStorage.getItem('tm_provider_locks_v1');
        if (locksStr) {
          var locks = JSON.parse(locksStr);
          for (var idKey in locks) {
            if (!locks.hasOwnProperty(idKey)) continue;
            var lock = locks[idKey];
            if (!lock || lock.slug === '__float') continue;
            var parts = idKey.split('::');
            if (parts.length < 2) continue;
            var lockModel = parts[1].toLowerCase().replace(/:(nitro|floor|free)$/i, '');
            if (!lockModel) continue;
            var lockProv = lock.label || lock.slug;
            if (!lockProv) continue;
            var lockKey = lockModel + '::' + lockProv;
            if (!ratings[lockKey] && !deleted[lockKey]) { ratings[lockKey] = { red: 0, green: 0, comment: '' }; changed = true; }
          }
        }
      } catch (e) {}

      // (C) Model→Provider map entries — the saved per-model defaults.
      try {
        var mpMap = tmGetModelProviderMap();
        for (var mpModel in mpMap) {
          if (!mpMap.hasOwnProperty(mpModel)) continue;
          var mpSlug = mpMap[mpModel];
          if (!mpSlug) continue;
          var mpLabel = mpSlug;
          try {
            var entries = tmGetProviderEntries(mpModel);
            for (var ei = 0; ei < entries.length; ei++) {
              if (entries[ei].slug === mpSlug) { mpLabel = entries[ei].label; break; }
            }
          } catch (e) {}
          var mpKey = mpModel + '::' + mpLabel;
          if (!ratings[mpKey] && !deleted[mpKey]) { ratings[mpKey] = { red: 0, green: 0, comment: '' }; changed = true; }
        }
      } catch (e) {}

      if (changed) tmSaveProviderRatings(ratings);
    } catch (e) {}
  }

  // Collect all unique model names from the ring buffer entries.
  function tmCollectRingModels() {
    var models = [];
    var seen = {};
    try {
      var ring = tmReadCaptureRing();
      for (var i = ring.length - 1; i >= 0; i--) {
        var cap = ring[i];
        if (!cap) continue;
        var model = '';
        try { model = tmCaptureModel(cap); } catch (e) {}
        if (!model) continue;
        if (seen[model]) continue;
        seen[model] = true;
        models.push(model);
      }
    } catch (e) {}
    return models;
  }

  // ==================== PROVIDER COST TABLE (v4.233) ====================
  // Per-model, per-provider pricing table for client-side cost calculation.
  // When a response carries NO cost field from the API, the extension looks up the
  // model+provider in this table and calculates cost from token usage × pricing.
  // Key format: "model_lower::provider_label" → { input: N, output: N, cache_read: N, cache_write: N|null }
  // All prices are per-million tokens (e.g. 3.00 = $3.00 per 1M tokens).
  var TM_PROVIDER_COSTS_KEY = 'tm_provider_costs_v1';

  function tmGetProviderCosts() {
    try { var r = localStorage.getItem(TM_PROVIDER_COSTS_KEY); return r ? JSON.parse(r) : {}; } catch (e) { return {}; }
  }

  function tmSaveProviderCosts(costs) {
    try { localStorage.setItem(TM_PROVIDER_COSTS_KEY, JSON.stringify(costs)); } catch (e) {}
  }

  function tmGetProviderCostEntry(model, provider) {
    try {
      var costs = tmGetProviderCosts();
      var key = model + '::' + provider;
      return costs[key] || { input: 0, output: 0, cache_read: 0, cache_write: null };
    } catch (e) { return { input: 0, output: 0, cache_read: 0, cache_write: null }; }
  }

  function tmSetProviderCostField(model, provider, field, value) {
    try {
      var costs = tmGetProviderCosts();
      var key = model + '::' + provider;
      if (!costs[key]) costs[key] = { input: 0, output: 0, cache_read: 0, cache_write: null };
      costs[key][field] = value;
      localStorage.setItem(TM_PROVIDER_COSTS_KEY, JSON.stringify(costs));
    } catch (e) {}
  }

  // Check if a cost entry has been populated (has non-zero pricing for at least one field).
  // cache_write is excluded — it can remain null/zero by design.
  function tmIsCostEntryPopulated(entry) {
    if (!entry) return false;
    return (Number(entry.input) > 0 || Number(entry.output) > 0 || Number(entry.cache_read) > 0);
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmDiscoverAndMergeProviderCosts-dcst,
  //   role=__lambdao_1.tmDiscoverAndMergeProviderCosts,
  //   slice_labels=tm-payload-cost-visibility,tm-payload-overview,
  //   kind=ast,
  //   comment=Discovers model→provider combos from ring buffer, locks, and model→provider map; auto-creates zero-cost entries for new combos (mirrors ratings discovery).,
  // ]
  // Discover model+provider combos from ring buffer, locks, and model→provider map.
  // Auto-creates zero entries for combos that don't exist yet (like ratings discovery).
  function tmDiscoverAndMergeProviderCosts() {
    try {
      var costs = tmGetProviderCosts();
      var ring = tmReadCaptureRing();
      var changed = false;

      // (A) Ring buffer combos
      for (var i = 0; i < ring.length; i++) {
        var cap = ring[i];
        if (!cap) continue;
        var model = '';
        try { model = tmCaptureModel(cap); } catch (e) {}
        if (!model) continue;
        model = model.toLowerCase().replace(/:(nitro|floor|free)$/i, '');
        var provider = tmObservedProviderKey(cap);
        if (provider) {
          var key = model + '::' + provider;
          if (!costs[key]) { costs[key] = { input: 0, output: 0, cache_read: 0, cache_write: null }; changed = true; }
        }
      }

      // (B) Locked providers
      try {
        var locksStr = localStorage.getItem('tm_provider_locks_v1');
        if (locksStr) {
          var locks = JSON.parse(locksStr);
          for (var idKey in locks) {
            if (!locks.hasOwnProperty(idKey)) continue;
            var lock = locks[idKey];
            if (!lock || lock.slug === '__float') continue;
            var parts = idKey.split('::');
            if (parts.length < 2) continue;
            var lockModel = parts[1].toLowerCase().replace(/:(nitro|floor|free)$/i, '');
            if (!lockModel) continue;
            var lockProv = lock.label || lock.slug;
            if (!lockProv) continue;
            var lockKey = lockModel + '::' + lockProv;
            if (!costs[lockKey]) { costs[lockKey] = { input: 0, output: 0, cache_read: 0, cache_write: null }; changed = true; }
          }
        }
      } catch (e) {}

      // (C) Model→Provider map
      try {
        var mpMap = tmGetModelProviderMap();
        for (var mpModel in mpMap) {
          if (!mpMap.hasOwnProperty(mpModel)) continue;
          var mpSlug = mpMap[mpModel];
          if (!mpSlug) continue;
          var mpLabel = mpSlug;
          try {
            var entries = tmGetProviderEntries(mpModel);
            for (var ei = 0; ei < entries.length; ei++) {
              if (entries[ei].slug === mpSlug) { mpLabel = entries[ei].label; break; }
            }
          } catch (e) {}
          var mpKey = mpModel + '::' + mpLabel;
          if (!costs[mpKey]) { costs[mpKey] = { input: 0, output: 0, cache_read: 0, cache_write: null }; changed = true; }
        }
      } catch (e) {}

      if (changed) tmSaveProviderCosts(costs);
    } catch (e) {}
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmCalculateCostFromTable-ccft,
  //   role=__lambdao_1.tmCalculateCostFromTable,
  //   slice_labels=tm-payload-cost-visibility,tm-payload-overview,
  //   kind=ast,
  //   comment=Calculates per-turn cost from token usage × pricing table entry when API returns no cost. Handles OpenAI-style (prompt_tokens/completion_tokens) and Anthropic-style (input_tokens/output_tokens) fields.,
  // ]
  // (v4.233) Calculate cost from token usage × pricing table entry.
  // Uses the SAME response usage evidence that tmExtractKnownUsageEvidence / tmMergeUsageInto
  // produce (the response_usage object on the capture record).
  // (v4.234) Also reads Anthropic-style fields: input_tokens as fallback for prompt_tokens,
  // output_tokens as fallback for completion_tokens — so direct-Anthropic providers work.
  // Token determination:
  //   cached_tokens → cache_read_input_tokens / cached_tokens / prompt_tokens_details.cached_tokens
  //   output_tokens → prefer completion_tokens; fallback total - prompt; ultimate fallback total - cached
  //   new_input    → prompt_tokens - cached_tokens (only when NOT using the total-cached fallback)
  // Returns { cost: N, pricing_used: {...} } or { cost: null, reason: 'no_usage' }
  function tmCalculateCostFromTable(usageEvidence, pricing) {
    if (!usageEvidence || !pricing) return { cost: null, reason: 'no_usage' };

    var cached = Number(
      usageEvidence.cache_read_input_tokens ||
      usageEvidence.cached_tokens ||
      (usageEvidence.prompt_tokens_details && usageEvidence.prompt_tokens_details.cached_tokens) || 0
    );
    var prompt = Number(usageEvidence.prompt_tokens || usageEvidence.input_tokens || 0);
    var completion = Number(usageEvidence.completion_tokens || usageEvidence.output_tokens || 0);
    var total = Number(usageEvidence.total_tokens || 0);

    // Can we determine ANY billable token usage? Completion-only segments can still be priced.
    if (prompt == 0 && total == 0 && cached == 0 && completion == 0) {
      return { cost: null, reason: 'no_usage' };
    }

    var cost = 0;
    var hasCalculableCost = false;

    // Cache reuse cost (cache_read pricing)
    if (cached > 0 && Number(pricing.cache_read) > 0) {
      cost += (cached * Number(pricing.cache_read)) / 1000000;
      hasCalculableCost = true;
    }

    // (v4.236) Cache creation cost (billed at whatever cache_write price the table carries).
    // (v4.304) GATE FIX: the old `cached > 0` precondition ('evidence of reuse implies active
    // cache maintenance') silently ZEROED the single most expensive turn shape there is -- a
    // pure cache-MISS turn (first turn of a conversation, or >1h TTL expiry), where cache_read
    // is 0 and the ENTIRE prompt lands in cache_creation. Anthropic bills writes regardless of
    // reads (1.25x input rate), so a ~551K-token miss recorded ~$0.01 instead of ~$2.00. Bill
    // whenever write tokens exist and the table has a cache_write price; still silently
    // skipped (by design) when no price is set.
    var cacheWriteTokens = Number(
      usageEvidence.cache_creation_input_tokens ||
      usageEvidence.cache_write_tokens ||
      (usageEvidence.prompt_tokens_details && usageEvidence.prompt_tokens_details.cache_write_tokens) || 0
    );
    if (cacheWriteTokens > 0 && Number(pricing.cache_write) > 0) {
      cost += (cacheWriteTokens * Number(pricing.cache_write)) / 1000000;
      hasCalculableCost = true;
    }

    // Determine output tokens: prefer completion_tokens, then total - prompt, then total - cached (fallback)
    var outputTokens = null;
    var usingFallback = false;

    if (completion > 0) {
      outputTokens = completion;
    } else if (total > 0 && prompt > 0 && total > prompt) {
      outputTokens = total - prompt;
    } else if (total > 0 && total > cached) {
      outputTokens = total - cached;
      usingFallback = true; // Includes new input too — don't separately calculate new input
    }

    // New input tokens: only if we have prompt_tokens AND not using the fallback
    var newInputTokens = null;
    if (prompt > 0 && !usingFallback) {
      newInputTokens = Math.max(0, prompt - cached);
    }

    if (outputTokens != null && outputTokens > 0 && Number(pricing.output) > 0) {
      cost += (outputTokens * Number(pricing.output)) / 1000000;
      hasCalculableCost = true;
    }

    if (newInputTokens != null && newInputTokens > 0 && Number(pricing.input) > 0) {
      cost += (newInputTokens * Number(pricing.input)) / 1000000;
      hasCalculableCost = true;
    }

    if (!hasCalculableCost) {
      return { cost: null, reason: 'no_usage' };
    }

    return { cost: cost, pricing_used: pricing };
  }

  // The auto-lock engine, called from tmApplyProviderRouting when NO lock exists for the
  // identity. Checks if this is a NEW session (not yet in tm_session_costs_v2). If so, looks
  // up the model in the model→provider map. If found, locks that provider for the identity.
  // Returns the applied lock, or null if N/A.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmMaybeAutoLockFromModelMap-z9k2,
  //   role=__lambdao_1.tmMaybeAutoLockFromModelMap,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=v4.226: auto-locks the model→provider map's provider for a NEW session identity (one that has no entry in tm_session_costs_v2 yet). Replaces the old v4.213 session-init engine.,
  // ]
  function tmMaybeAutoLockFromModelMap(body, idKey) {
    try {
      if (!body || !body.model || !idKey) return null;
      // Check if this identity already exists in tm_session_costs_v2. If it does, this is
      // an existing session — don't auto-lock (it already has its own lock or AUTO mode).
      var costs = tmGetSessionCosts();
      if (costs && costs[idKey]) return null; // session already exists — leave it alone

      // New session: look up the model in the model→provider map.
      var model = String(body.model).toLowerCase().replace(/:(nitro|floor|free)$/i, '');
      var slug = tmGetModelProvider(model);
      if (!slug) return null;

      // Find the label from provider entries for this model.
      var label = slug;
      try {
        var entries = tmGetProviderEntries(model);
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].slug === slug) { label = entries[i].label; break; }
        }
      } catch (e) {}

      tmSetProviderLock(idKey, slug, label, false);
      console.log('🌱 [v' + EXT_VERSION + '] Auto-locked provider from model→provider map: ' + model + ' -> ' + label + ' (' + slug + ') for ' + idKey);
      return tmGetProviderLock(idKey);
    } catch (e) { return null; }
  }

  // Check if a model has multiple providers (live entries preferred; seed-table fallback).
  function tmIsMultiProviderModel(model) {
    if (!model) return false;
    var m = String(model).toLowerCase();
    m = m.replace(/:(nitro|floor|free)$/i, '');
    var live = tmGetLiveProviderEntries(m);
    if (live) return live.length >= 2;
    return TM_PROVIDER_SEED.hasOwnProperty(m);
  }

  // Get the seed entry list for a model (returns [] if unknown).
  function tmGetProviderSeed(model) {
    if (!model) return [];
    var m = String(model).toLowerCase();
    m = m.replace(/:(nitro|floor|free)$/i, '');
    return TM_PROVIDER_SEED[m] || [];
  }

  // ==================== LIVE PROVIDER DISCOVERY (v4.205) ====================
  // Fetches OpenRouter's Endpoints API per model and caches the provider list for 12h, so NEW
  // providers (and new models like DeepSeek) appear in the dropdown/set-modal automatically --
  // no source edit, no deploy. The fetch carries the tm_passthrough=1 sentinel so OUR OWN hook
  // passes it through verbatim (no capture row, no auto-retry, no injection). Any failure (CORS,
  // network, 404) silently keeps the seed table -- the user never sees an error.
  var TM_PROVIDER_LIVE_KEY = 'tm_provider_live_v2';  // (v4.216) bumped v1->v2 to invalidate stale 'Fireworks'-only labels
  var TM_PROVIDER_LIVE_TTL = 12 * 3600 * 1000;
  var tmProviderFetchInFlight = {};

  function tmReadProviderLive() {
    try { var r = localStorage.getItem(TM_PROVIDER_LIVE_KEY); return r ? JSON.parse(r) : {}; } catch (e) { return {}; }
  }

  function tmGetLiveProviderEntries(model) {
    try {
      var m = String(model || '').toLowerCase().replace(/:(nitro|floor|free)$/i, '');
      var rec = tmReadProviderLive()[m];
      if (!rec || !Array.isArray(rec.entries)) return null;
      if (Date.now() - Number(rec.ts || 0) > TM_PROVIDER_LIVE_TTL) return null;
      // (v4.237) SELF-HEAL: entries cached before maxContext was captured have NO maxContext field
      // and would otherwise be served until the 12h TTL expires, hiding the context-window display.
      // Treat such a record as stale (return null) so the caller refetches/rebuilds with the field.
      if (!rec.entries.some(function(e) { return e && e.maxContext != null; })) return null;
      return rec.entries;
    } catch (e) { return null; }
  }

  // Build seed-shaped entries from the Endpoints API response. cache = has input_cache_read
  // pricing (Nebius famously OMITS it -- the 0%-cache confession, machine-readable).
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmBuildLiveProviderEntries-9nhf,
  //   role=__lambdao_1.tmBuildLiveProviderEntries,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Parses an OpenRouter Endpoints-API response into provider entries (slug, label, tag-derived variant, pricing).,
  // ]
  function tmBuildLiveProviderEntries(endpoints) {
    var out = [];
    var seen = {};
    for (var i = 0; i < endpoints.length; i++) {
      var ep = endpoints[i];
      if (!ep || !ep.tag) continue;
      var slug = String(ep.tag);
      if (seen[slug]) continue;
      seen[slug] = true;
      var hasCache = !!(ep.pricing && ep.pricing.input_cache_read != null);
      var parts = [];
      if (ep.quantization && ep.quantization !== 'unknown') parts.push(String(ep.quantization));
      if (typeof ep.uptime_last_30m === 'number') parts.push(Math.round(ep.uptime_last_30m) + '% up');
      // (v4.216 AUDIT FIX) provider_name is the SAME for endpoint variants ('Fireworks' for both
      // 'fireworks' and 'fireworks/fast'), so derive the variant from the tag slug and append it
      // to the label -- otherwise every variant renders as the bare provider name and the user
      // cannot tell them apart (the exact bug reported: picked 'Fireworks Fast', saw 'Fireworks').
      var tagParts = slug.split('/');
      var variant = tagParts.length > 1 ? tagParts.slice(1).join('/') : '';
      var baseLabel = ep.provider_name || tagParts[0];
      var label = variant ? (baseLabel + ' ' + variant.charAt(0).toUpperCase() + variant.slice(1)) : baseLabel;
      // (v4.236) Capture the endpoint's max context window (tokens) so we can display it and so
      // the user can see WHICH providers can serve a long conversation. This is the root cause of
      // 'No endpoints found' on long threads: the prompt exceeds a pinned provider's window and
      // allow_fallbacks:false leaves nowhere to go. OpenRouter Endpoints API returns context_length.
      var maxCtx = (typeof ep.context_length === 'number' && ep.context_length > 0) ? ep.context_length : null;
      if (maxCtx) parts.push('ctx ' + maxCtx);
      out.push({ slug: slug, label: label, cache: hasCache, note: parts.join(' · '), toxic: !hasCache, maxContext: maxCtx });
    }
    // (v4.237) Safety net: if NO endpoint carried context_length (older/leaner API shape), backfill
    // from the model-level average so every entry still carries a maxContext (avoids the self-heal
    // staleness gate spinning forever, and gives the user a ballpark window rather than nothing).
    if (out.length && !out.some(function(e) { return e && e.maxContext != null; })) {
      var avg = null;
      try {
        for (var ai = 0; ai < endpoints.length; ai++) {
          var ep2 = endpoints[ai];
          if (ep2 && ep2.stats && typeof ep2.stats.p50_context_length === 'number' && ep2.stats.p50_context_length > 0) { avg = Math.round(ep2.stats.p50_context_length); break; }
          if (ep2 && typeof ep2.max_context === 'number' && ep2.max_context > 0) { avg = ep2.max_context; break; }
        }
      } catch (e) {}
      if (avg) { for (var bi = 0; bi < out.length; bi++) out[bi].maxContext = avg; }
    }
    return out;
  }

  // Merge live entries with the curated seed: seed ORDER and curated notes/toxic flags win for
  // known slugs (base-slug tolerant: seed 'moonshotai' matches live 'moonshotai/mxfp4'); brand-new
  // providers unknown to the seed are appended with live values. Seed slugs that vanished from
  // the API are dropped (live truth).
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmMergeSeedKnowledge-s3wb,
  //   role=__lambdao_1.tmMergeSeedKnowledge,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Merges live-discovered providers over the curated seed table, preserving seed order/notes/toxic flags.,
  // ]
  function tmMergeSeedKnowledge(model, liveEntries) {
    var seed = TM_PROVIDER_SEED[model] || [];
    if (!seed.length) return liveEntries;
    var bySlug = {};
    for (var i = 0; i < liveEntries.length; i++) bySlug[liveEntries[i].slug] = liveEntries[i];
    function findLive(slug) {
      if (bySlug[slug]) return bySlug[slug];
      for (var k in bySlug) { if (Object.prototype.hasOwnProperty.call(bySlug, k) && k.indexOf(slug + '/') === 0) return bySlug[k]; }
      return null;
    }
    var merged = [];
    for (var j = 0; j < seed.length; j++) {
      var s = seed[j];
      var lv = findLive(s.slug);
      if (lv) {
        // (v4.216 AUDIT FIX) prefer the CURATED SEED label over the live label for known slugs.
        // The live label (provider_name) is identical across variants ('Fireworks' for both
        // 'fireworks' and 'fireworks/fast'), so preferring it discarded the seed's richer
        // 'Fireworks Fast' distinction -- the reported bug. Seed label wins; live fills the rest.
        merged.push({ slug: lv.slug, label: s.label || lv.label, cache: lv.cache, note: s.note || lv.note, toxic: !!(s.toxic || lv.toxic), maxContext: (lv.maxContext != null ? lv.maxContext : null) });
        delete bySlug[lv.slug];
      }
    }
    for (var k2 in bySlug) { if (Object.prototype.hasOwnProperty.call(bySlug, k2)) merged.push(bySlug[k2]); }
    return merged;
  }

  // (v4.216) One-time migration: repair stale lock labels (e.g. a 'fireworks/fast' lock stored
  // as bare 'Fireworks' before variant-aware labels existed) from the current entry tables.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmRepairLockLabelsFromEntries-o2fg,
  //   role=__lambdao_1.tmRepairLockLabelsFromEntries,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=One-time migration repairing stale lock labels from current provider entries on load.,
  // ]
  function tmRepairLockLabelsFromEntries() {
    try {
      var locks = tmGetProviderLocks();
      var changed = false;
      for (var k in locks) {
        if (!Object.prototype.hasOwnProperty.call(locks, k)) continue;
        var L = locks[k];
        if (!L || L.mode === 'set' || !L.slug) continue;
        var model = k.split('::')[1] || '';
        var entries = tmGetProviderEntries(model);
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].slug === L.slug && entries[i].label && entries[i].label !== L.label) {
            L.label = entries[i].label;
            changed = true;
            break;
          }
        }
      }
      if (changed) localStorage.setItem(TM_PROVIDER_LOCKS_KEY, JSON.stringify(locks));
    } catch (e) {}
  }

  // Live-aware entry list: fresh live entries win; otherwise the seed.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmGetProviderEntries-x3li,
  //   role=__lambdao_1.tmGetProviderEntries,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Provider-list entry point for a model: live-discovery entries merged over the seed table.,
  // ]
  function tmGetProviderEntries(model) {
    if (!model) return [];
    var live = tmGetLiveProviderEntries(model);
    if (live && live.length) return live;
    return tmGetProviderSeed(model);
  }

  // Fire the endpoints fetch for a model if we have no fresh live record and none is in flight.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmMaybeFetchProviderEndpoints-q932,
  //   role=__lambdao_1.tmMaybeFetchProviderEndpoints,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Lazy OpenRouter Endpoints-API fetch (12h localStorage cache, tm_passthrough=1 sentinel so our own hook ignores it); any failure silently keeps the seed table.,
  // ]
  function tmMaybeFetchProviderEndpoints(model) {
    try {
      if (!model) return;
      var m = String(model).toLowerCase().replace(/:(nitro|floor|free)$/i, '');
      if (tmGetLiveProviderEntries(m)) return;
      if (tmProviderFetchInFlight[m]) return;
      tmProviderFetchInFlight[m] = true;
      var url = 'https://openrouter.ai/api/v1/models/' + m + '/endpoints?tm_passthrough=1';
      fetch(url).then(function(r) { return r.ok ? r.json() : null; }).then(function(j) {
        delete tmProviderFetchInFlight[m];
        var eps = j && j.data && Array.isArray(j.data.endpoints) ? j.data.endpoints : null;
        if (!eps || !eps.length) return;
        var entries = tmMergeSeedKnowledge(m, tmBuildLiveProviderEntries(eps));
        var s2 = tmReadProviderLive();
        s2[m] = { ts: Date.now(), entries: entries };
        try { localStorage.setItem(TM_PROVIDER_LIVE_KEY, JSON.stringify(s2)); } catch (e) {}
        try { renderGpt51UsageWidget(); } catch (e) {}
      }).catch(function() { delete tmProviderFetchInFlight[m]; });
    } catch (e) {}
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmGetSessionCosts-fnas,
  //   role=__lambdao_1.tmGetSessionCosts,
  //   slice_labels=tm-payload-cost-visibility,tm-payload-overview,
  //   kind=ast,
  //   comment=Reads per-identity session cost aggregate from tm_session_costs_v2.,
  // ]
  function tmGetSessionCosts() {
    try {
      var raw = localStorage.getItem(TM_SESSION_COSTS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmExtractEndpointHost-6uov,
  //   role=__lambdao_1.tmExtractEndpointHost,
  //   slice_labels=tm-payload-cost-visibility,tm-payload-overview,
  //   kind=ast,
  //   comment=Endpoint identity: resolves real target host (x-target-endpoint for proxy traffic, fallback to URL host).,
  // ]
  function tmExtractEndpointHost(cap) {
    // (v4.107) Extract a short host identifier from the capture URL for per-endpoint stratification.
    try {
      var u = String(cap.url || '').toLowerCase();
      // For proxy traffic, prefer the target endpoint from the outbound headers.
      var hdrs = cap.headers || {};
      var tgt = String(hdrs['x-target-endpoint'] || '').toLowerCase();
      if (tgt) {
        var m = tgt.match(/https?:\/\/([^\/]+)/);
        if (m) return m[1];
      }
      var m2 = u.match(/https?:\/\/([^\/]+)/);
      if (m2) return m2[1];
    } catch (e) {}
    return 'unknown';
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmIsProxyCapture-am0g,
  //   role=__lambdao_1.tmIsProxyCapture,
  //   slice_labels=tm-payload-cost-visibility,tm-payload-overview,
  //   kind=ast,
  //   comment=Detects whether a capture was routed via TypingMind's cors-proxy.,
  // ]
  function tmIsProxyCapture(cap) {
    try {
      return !!(cap && cap.url && String(cap.url).toLowerCase().includes('typingmind.com/api/cors-proxy'));
    } catch (e) { return false; }
  }

  // v4.157: THE single canonical identity-key builder. Cost AND hue both route through this
  // so their keys can never drift (previously hue used '' for a missing host, cost used 'unknown').
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmBuildIdentityKey-r49n,
  //   role=__lambdao_1.tmBuildIdentityKey,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Canonical sid::model::host::proxy|direct identity key (v4.157). Cost, hue, routing locks, and retry backoff ALL key off this so they can never drift; tmBuildSessionCostKey is a thin alias.,
  // ]
  function tmBuildIdentityKey(sessionId, model, endpointHost, isProxy) {
    return (sessionId || '') + '::' + (model || '') + '::' + (endpointHost || 'unknown') + '::' + (isProxy ? 'proxy' : 'direct');
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmBuildSessionCostKey-stdp,
  //   role=__lambdao_1.tmBuildSessionCostKey,
  //   slice_labels=tm-payload-cost-visibility,tm-payload-overview,
  //   kind=ast,
  //   comment=THE canonical 4-part identity key (sid::model::host::proxy|direct). Cost and hue must both key off this identity.,
  // ]
  function tmBuildSessionCostKey(sessionId, model, endpointHost, isProxy) {
    return tmBuildIdentityKey(sessionId, model, endpointHost, isProxy);
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmRecordSessionCost-34n7,
  //   role=__lambdao_1.tmRecordSessionCost,
  //   slice_labels=tm-payload-cost-visibility,tm-payload-overview,
  //   kind=ast,
  //   comment=Event-sourced session cost ledger; persists per-identity totals in tm_session_costs_v2 and stamps session_cost_total onto capture rows at response receipt.,
  // ]
  function tmRecordSessionCost(sessionId, model, endpointHost, isProxy, cost) {
    if (!sessionId || !model || cost <= 0) return 0;
    try {
      var costs = tmGetSessionCosts();
      var key = tmBuildSessionCostKey(sessionId, model, endpointHost, isProxy);
      var entry = costs[key];
      var total = 0;
      if (typeof entry === 'object') {
        total = (entry._total || 0) + cost;
      } else {
        entry = {};
        total = (Number(entry) || 0) + cost;
      }
      // v4.170: Preserve existing fields (e.g., cache hit/miss counters) instead of replacing the object.
      entry._total = total;
      entry._session_id = String(sessionId);
      entry._ts = Date.now();
      costs[key] = entry;
      localStorage.setItem(TM_SESSION_COSTS_KEY, JSON.stringify(costs));
      return total;
    } catch (e) {}
    return 0;
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmGetSessionCost-3tm0,
  //   role=__lambdao_1.tmGetSessionCost,
  //   slice_labels=tm-payload-cost-visibility,tm-payload-overview,
  //   kind=ast,
  //   comment=Reads a single per-identity session cost total from tm_session_costs_v2 via tmBuildSessionCostKey.,
  // ]
  function tmGetSessionCost(sessionId, model, endpointHost, isProxy) {
    if (!sessionId || !model) return 0;
    try {
      var costs = tmGetSessionCosts();
      var key = tmBuildSessionCostKey(sessionId, model, endpointHost, isProxy);
      var entry = costs[key];
      if (typeof entry === 'object') return entry._total || 0;
      return Number(entry) || 0;
    } catch (e) { return 0; }
  }

  // v4.169: Record cache hit/miss for the identity ledger (tm_session_costs_v2).
  // Called once per response at stamp time, never during render.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmRecordIdentityCacheOutcome-nrz7,
  //   role=__lambdao_1.tmRecordIdentityCacheOutcome,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Writes per-identity HIT/MISS ledger fields (_cache_hits/_misses/_streak/_last) onto the tm_session_costs_v2 record; 429s are never recorded as misses.,
  // ]
  function tmRecordIdentityCacheOutcome(sessionId, model, endpointHost, isProxy, isHit) {
    if (!sessionId || !model) return null;
    try {
      var costs = tmGetSessionCosts();
      var key = tmBuildSessionCostKey(sessionId, model, endpointHost, isProxy);
      var entry = costs[key];
      if (!entry || typeof entry !== 'object') {
        entry = { _total: Number(entry) || 0, _session_id: String(sessionId), _ts: Date.now() };
      }
      var kind = isHit ? 'hit' : 'miss';
      entry._cache_hits = Number(entry._cache_hits || 0);
      entry._cache_misses = Number(entry._cache_misses || 0);
      if (isHit) entry._cache_hits++; else entry._cache_misses++;
      if (entry._cache_last === kind) {
        entry._cache_streak = Number(entry._cache_streak || 0) + 1;
      } else {
        entry._cache_last = kind;
        entry._cache_streak = 1;
      }
      entry._session_id = String(sessionId);
      entry._ts = Date.now();
      costs[key] = entry;
      localStorage.setItem(TM_SESSION_COSTS_KEY, JSON.stringify(costs));
      return entry;
    } catch (e) { return null; }
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmTouchSessionScopedStores-gz4j,
  //   role=__lambdao_1.tmTouchSessionScopedStores,
  //   slice_labels=tm-payload-cost-visibility,tm-payload-overview,
  //   kind=ast,
  //   comment=Anti-leak: touches _ts on all session-derived entries for a given sessionId. Called at response receipt so active sessions stay fresh.,
  // ]
  function tmTouchSessionScopedStores(sessionId, ts) {
    if (!sessionId) return;
    ts = ts || Date.now();
    function entrySessionId(key, entry) {
      if (entry && typeof entry === 'object' && entry._session_id) return String(entry._session_id);
      if (String(key).indexOf('::') >= 0) return String(key).split('::')[0];
      return String(key);
    }
    function touchMap(storeKey, convertLegacy) {
      try {
        var raw = localStorage.getItem(storeKey);
        if (!raw) return;
        var map = JSON.parse(raw);
        if (!map || typeof map !== 'object') return;
        var changed = false;
        var keys = Object.keys(map);
        for (var i = 0; i < keys.length; i++) {
          var key = keys[i];
          var entry = map[key];
          if (entrySessionId(key, entry) !== String(sessionId)) continue;
          if (entry && typeof entry === 'object') {
            entry._session_id = String(sessionId);
            entry._ts = ts;
          } else if (convertLegacy === 'cost') {
            map[key] = { _total: Number(entry) || 0, _session_id: String(sessionId), _ts: ts };
          } else if (convertLegacy === 'name') {
            map[key] = { _name: String(entry || ''), _session_id: String(sessionId), _ts: ts };
          } else if (convertLegacy === 'hue') {
            map[key] = { _hue: Number(entry), _session_id: String(sessionId), _ts: ts };
          } else if (convertLegacy === 'gpt51') {
            map[key] = { _session_id: String(sessionId), _ts: ts };
          }
          changed = true;
        }
        if (changed) localStorage.setItem(storeKey, JSON.stringify(map));
      } catch (e) {}
    }
    touchMap(TM_SESSION_COSTS_KEY, 'cost');
    touchMap('tm_session_names', 'name');
    touchMap(TM_SESSION_HUES_KEY, 'hue');
    touchMap('gpt51_conv_usage', 'gpt51');
    touchMap(TM_PROVIDER_LOCKS_KEY, false);
    try { tmSessionHueCache = null; } catch (e) {}
  }

  // (v4.211) Read the per-identity cache-outcome ledger entry (fields live on the
  // tm_session_costs_v2 record: _cache_hits / _cache_misses / _cache_streak / _cache_last).
  // The widget badges read THIS instead of the ephemeral tmMostRecentPayloadStatus.cacheStats,
  // so they survive TypingMind refresh and are unaffected by error turns.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmGetCacheOutcomeForIdentity-63s5,
  //   role=__lambdao_1.tmGetCacheOutcomeForIdentity,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Reads the per-identity cache-outcome ledger entry (v4.211); widget badges read THIS, not ephemeral live status, so they survive refresh and error storms.,
  // ]
  function tmGetCacheOutcomeForIdentity(idKey) {
    try {
      if (!idKey) return null;
      var costs = tmGetSessionCosts();
      var e = costs[idKey];
      if (!e || typeof e !== 'object') return null;
      return e;
    } catch (e) { return null; }
  }

  // (v4.211) Find the most recent ring entry that actually carried usage (a successful turn), so
  // the widget status line can render cost/cache-report/badges even after a refresh wiped the
  // live status. Bounded scan for safety.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmLastSuccessfulUsage-joja,
  //   role=__lambdao_1.tmLastSuccessfulUsage,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Bounded backward scan of the ring for the most recent entry that actually carried usage; the widget-feed gate's fallback so cost/cache render after refresh.,
  // ]
  function tmLastSuccessfulUsage() {
    try {
      var ring = tmReadCaptureRing();
      var budget = 60;
      for (var i = ring.length - 1; i >= 0 && budget > 0; i--, budget--) {
        var cap = ring[i];
        if (!cap) continue;
        if (cap.response_anthropic_usage || cap.response_usage) {
          return { au: cap.response_anthropic_usage || null, oru: cap.response_usage || null,
                   tableCost: (typeof cap._table_cost === 'number' && cap._table_cost > 0) ? cap._table_cost : 0 };
        }
      }
    } catch (e) {}
    return null;
  }

  // (v4.122) Determine if a capture represents a significant cache hit.
  // Requires cached tokens > 1000 AND at least 50% of prompt tokens. No cost heuristics.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmIsSignificantCacheHit-qzgp,
  //   role=__lambdao_1.tmIsSignificantCacheHit,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=HIT/MISS determination from a capture's usage evidence (normalized usage first, raw-segment fallback).,
  // ]
  function tmIsSignificantCacheHit(cap) {
    try {
      function num(v) {
        var n = Number(v);
        return isFinite(n) ? n : null;
      }
      function isSignificant(cached, total) {
        cached = num(cached); total = num(total);
        if (cached == null || total == null) return false;
        if (cached <= 1000) return false;
        if (total <= 0) return false;
        return (cached / total) >= 0.5;
      }
      function usageHit(u) {
        if (!u || typeof u !== 'object') return false;
        if (isSignificant(u.cache_read_input_tokens, u.input_tokens || u.prompt_tokens || u.total_tokens)) return true;
        if (u.prompt_tokens_details && isSignificant(u.prompt_tokens_details.cached_tokens, u.prompt_tokens || u.total_tokens)) return true;
        if (u.input_tokens_details && isSignificant(u.input_tokens_details.cached_tokens, u.input_tokens || u.prompt_tokens || u.total_tokens)) return true;
        return false;
      }

      if (usageHit(cap.response_anthropic_usage)) return true;
      if (usageHit(cap.response_usage)) return true;

      // Raw SSE usage-segment fallback. This catches rows captured before/without normalized prompt_tokens.
      if (Array.isArray(cap.response_usage_segments)) {
        for (var i = 0; i < cap.response_usage_segments.length; i++) {
          try {
            var parsed = JSON.parse(cap.response_usage_segments[i]);
            if (usageHit(parsed && parsed.usage)) return true;
            var evidence = tmExtractKnownUsageEvidence(parsed);
            if (usageHit(evidence)) return true;
          } catch (e) {}
        }
      }
    } catch (e) {}
    return false;
  }

  // (v4.131) Persistent per-session/model/endpoint hue map for well-separated colors.
  // v4.152 uses a v2 key because older cache entries could assign the same hue to
  // distinct model/endpoint identities by seeding from sessionId alone.
  // v4.156 bumps to v3 key: golden-angle placement needs clean slate (v2 is poisoned with hue-30 collisions).
  const TM_SESSION_HUES_KEY = 'tm_session_hues_v3';
  var tmSessionHueCache = null;
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmLoadSessionHueCache-qzed,
  //   role=__lambdao_1.tmLoadSessionHueCache,
  //   slice_labels=tm-payload-cost-visibility,
  //   comment=Loads the in-memory hue cache from tm_session_hues_v3. Null memo on store version bumps.,
  //   kind=ast,
  // ]
  function tmLoadSessionHueCache() {
    if (tmSessionHueCache) return tmSessionHueCache;
    try {
      var raw = localStorage.getItem(TM_SESSION_HUES_KEY);
      tmSessionHueCache = raw ? JSON.parse(raw) : {};
    } catch (e) { tmSessionHueCache = {}; }
    return tmSessionHueCache;
  }
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmSaveSessionHueCache-m2ml,
  //   role=__lambdao_1.tmSaveSessionHueCache,
  //   slice_labels=tm-payload-cost-visibility,
  //   comment=Persists in-memory hue cache to tm_session_hues_v3.,
  //   kind=ast,
  // ]
  function tmSaveSessionHueCache() {
    try { localStorage.setItem(TM_SESSION_HUES_KEY, JSON.stringify(tmSessionHueCache || {})); } catch (e) {}
  }
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmAssignSessionHue-c3l7,
  //   role=__lambdao_1.tmAssignSessionHue,
  //   slice_labels=tm-payload-cost-visibility,tm-payload-overview,
  //   kind=ast,
  //   comment=Hue placement for new identity keys. v4.157: integer permutation (n*137 mod 300, coprime with 300) + collision-probe so no two identities share a hue within a 300-set; replaced golden-angle round which repeated at n=24.,
  // ]
  function tmAssignSessionHue(seedKey, existingHues) {
    // Usable wheel: [30, 330] (300°). Red arc excluded BY CONSTRUCTION, not by clamp.
    // v4.157: integer permutation. STEP=137 is coprime with 300 (gcd=1), so
    // (n*137)%300 visits all 300 integer offsets before repeating — no rounding,
    // no exact-duplicate hues within a 300-identity working set. Then collision-probe
    // against the hues already in the cache so we never hand back an occupied hue even
    // across store generations / manual edits.
    var STEP = 137;
    var used = {};
    for (var i = 0; i < existingHues.length; i++) { used[existingHues[i]] = true; }
    var n = existingHues.length;
    for (var probe = 0; probe < 300; probe++) {
      var hue = 30 + (((n + probe) * STEP) % 300);
      if (!used[hue]) return hue;
    }
    // Wheel genuinely full (>=300 distinct identities) — fall back deterministically.
    return 30 + ((n * STEP) % 300);
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmModelEndpointColor-0nfj,
  //   role=__lambdao_1.tmModelEndpointColor,
  //   slice_labels=tm-payload-cost-visibility,tm-payload-overview,
  //   kind=ast,
  //   comment=Identity→color entry point. Key = sid::model::host::proxy|direct. Caches in tm_session_hues_v3. Empty model → fixed '#fff2f5' (silent; check tooltip).,
  // ]
  function tmModelEndpointColor(model, endpointHost, isProxy, sessionId) {
    if (!model) return '#fff2f5';
    var cache = tmLoadSessionHueCache();
    // v4.157: use the ONE canonical identity-key builder (shared with cost) so hue and
    // cost keys can never drift on host-fallback normalization.
    var key = tmBuildIdentityKey(sessionId, model, endpointHost, isProxy);
    var entry = cache[key];
    var hue = (entry && typeof entry === 'object') ? entry._hue : entry;
    // Use the FULL hue identity as the seed, not just sessionId. Otherwise the
    // same session can bias multiple model/endpoint combinations toward the same color.
    var hueSeed = key;
    if (hue == null) {
      // Collect existing hues from the cache.
      var existing = [];
      var keys = Object.keys(cache);
      for (var i = 0; i < keys.length; i++) {
        var v = cache[keys[i]];
        var hv = (v && typeof v === 'object') ? v._hue : v;
        if (typeof hv === 'number') existing.push(hv);
      }
      hue = tmAssignSessionHue(hueSeed, existing);
      cache[key] = { _hue: hue, _session_id: sessionId || '', _ts: Date.now() };
      tmSaveSessionHueCache();
    }
    return 'hsl(' + hue + ', 55%, 72%)';
  }

  // (v4.134) Human-readable session name storage.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmGetSessionName-ha2z,
  //   role=__lambdao_1.tmGetSessionName,
  //   slice_labels=tm-payload-cost-visibility,tm-payload-overview,
  //   kind=ast,
  //   comment=Human-readable session name lookup; keyed by sessionId only (names are per-conversation, not per-model).,
  // ]
  function tmGetSessionName(sessionId) {
    if (!sessionId) return '';
    try {
      var raw = localStorage.getItem('tm_session_names');
      var map = raw ? JSON.parse(raw) : {};
      var entry = map[sessionId];
      return (entry && typeof entry === 'object') ? (entry._name || '') : (entry || '');
    } catch (e) { return ''; }
  }
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmSetSessionName-2h0s,
  //   role=__lambdao_1.tmSetSessionName,
  //   slice_labels=tm-payload-cost-visibility,tm-payload-overview,
  //   kind=ast,
  //   comment=Stores human-readable session name with _session_id + _ts metadata.,
  // ]
  function tmSetSessionName(sessionId, name) {
    if (!sessionId) return;
    try {
      var raw = localStorage.getItem('tm_session_names');
      var map = raw ? JSON.parse(raw) : {};
      map[sessionId] = { _name: String(name || '').trim(), _session_id: String(sessionId), _ts: Date.now() };
      localStorage.setItem('tm_session_names', JSON.stringify(map));
    } catch (e) {}
  }

  // (v4.80) Generate a random 8-char hex session ID for click-to-copy.
  function tmGenRandomSessionId() {
    return ('00000000' + Math.floor(Math.random() * 0xFFFFFFFF).toString(16)).slice(-8);
  }

  // (v4.80) Get the display session ID for the most-recent payload.
  // Returns the derived session ID if available, else null.
  // (v4.82) Also expose the pasted session ID (from deriveConversationIdFromBody).
  function tmGetDisplaySessionId() {
    try {
      if (tmMostRecentPayloadStatus && tmMostRecentPayloadStatus.sessionId) {
        return tmMostRecentPayloadStatus.sessionId;
      }
    } catch (e) {}
    return null;
  }

  function tmGetDisplayPastedSessionId() {
    try {
      if (tmMostRecentPayloadStatus && tmMostRecentPayloadStatus.pastedSessionId) {
        return tmMostRecentPayloadStatus.pastedSessionId;
      }
    } catch (e) {}
    return null;
  }

  // (v4.72) Extract the per-turn cost from a usage object (same logic as tmRenderCacheReport).
  // (v4.78) Also check estimated_cost (DeepInfra's field name).
  function tmExtractCostVal(au, oru) {
    if (au && au.cost != null) return Number(au.cost) || 0;
    if (oru && oru.cost != null) return Number(oru.cost) || 0;
    if (oru && oru.estimated_cost != null) return Number(oru.estimated_cost) || 0;
    if (au && au.estimated_cost != null) return Number(au.estimated_cost) || 0;
    return 0;
  }

  console.log('🔧 Prompt Caching & Tool Result Fix & Payload Analysis v' + EXT_VERSION + ' - Initializing...');

  // v4.156 Boot-time zombie cleanup: remove poisoned v1/v2 hue stores and legacy cost store.
  try { localStorage.removeItem('tm_session_hues'); } catch (e) {}
  try { localStorage.removeItem('tm_session_hues_v2'); } catch (e) {}
  try { localStorage.removeItem('tm_session_costs'); } catch (e) {}
  
  // ==================== OPENROUTER CACHE TTL WARNING ====================
  // Tracks the last OpenRouter+Claude request timestamp and displays a visual
  // warning in the widget when the 5-minute cache TTL is about to expire.
  let tmOpenRouterLastRequestTs = 0;
  let tmOpenRouterCacheWarningInterval = null;
  const TM_OR_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  const TM_OR_CACHE_WARN_MS = 3 * 60 * 1000; // Start warning at 3 minutes

  function tmResetOpenRouterCacheTimer() {
    tmOpenRouterLastRequestTs = Date.now();

    // Cache TTL warning UI disabled: the one-second visual countdown/gradient
    // is not needed and can interact badly with other DOM observers/layout code.
    // IMPORTANT: this does NOT affect cache_control injection; it only disables
    // the visual OpenRouter cache-warning widget updates.
    if (tmOpenRouterCacheWarningInterval) {
      clearInterval(tmOpenRouterCacheWarningInterval);
      tmOpenRouterCacheWarningInterval = null;
    }

    try {
      const widget = document.getElementById('gpt51-usage-widget');
      const warningEl = document.getElementById('tm-or-cache-warning');
      if (warningEl) warningEl.remove();
      if (widget) {
        widget.style.background = 'rgba(0,0,0,0.80)';
        widget.style.animation = '';
      }
    } catch (e) {}
  }

  // @carto-group id=client-group-2 label="Client group 2"

  function tmUpdateCacheWarningDisplay() {
    const widget = document.getElementById('gpt51-usage-widget');
    if (!widget) return;

    const elapsed = Date.now() - tmOpenRouterLastRequestTs;
    const remaining = TM_OR_CACHE_TTL_MS - elapsed;

    // Remove warning elements and reset style if not in warning zone
    let warningEl = document.getElementById('tm-or-cache-warning');

    if (tmOpenRouterLastRequestTs === 0 || elapsed < TM_OR_CACHE_WARN_MS) {
      // Not in warning zone — reset widget to normal
      widget.style.background = 'rgba(0,0,0,0.80)';
      widget.style.animation = '';
      if (warningEl) warningEl.remove();
      return;
    }

    if (remaining <= 0) {
      // Cache expired
      widget.style.background = '#cc3300';
      widget.style.animation = '';
      if (!warningEl) {
        warningEl = document.createElement('div');
        warningEl.id = 'tm-or-cache-warning';
        warningEl.style.cssText = 'font-size:11px;font-weight:bold;color:#fff;padding:3px 0;text-align:center;';
        widget.insertBefore(warningEl, widget.firstChild);
      }
      const overSec = Math.floor(-remaining / 1000);
      const overMins = Math.floor(overSec / 60);
      const overSecsRem = overSec % 60;
      const overStr = overMins + 'm ' + (overSecsRem < 10 ? '0' : '') + overSecsRem + 's';
      warningEl.textContent = '⚠️ CACHE EXPIRED +' + overStr + ' ago';
      return;
    }

    // In warning zone (3min to 5min) — gradient from dark to orange
    const warnProgress = (elapsed - TM_OR_CACHE_WARN_MS) / (TM_OR_CACHE_TTL_MS - TM_OR_CACHE_WARN_MS);
    const clampedProgress = Math.min(Math.max(warnProgress, 0), 1);
    // Pulse: oscillate opacity between 0.7 and 1.0
    const pulse = 0.85 + 0.15 * Math.sin(Date.now() / 400);
    const r = Math.round(0 + clampedProgress * 204); // 0 -> 204 (orange)
    const g = Math.round(0 + clampedProgress * 102); // 0 -> 102
    const b = Math.round(0);                          // stays 0
    widget.style.background = 'rgba(' + r + ',' + g + ',' + b + ',' + (0.80 * pulse) + ')';
    widget.style.animation = '';

    // Format remaining time
    const remSec = Math.ceil(remaining / 1000);
    const mins = Math.floor(remSec / 60);
    const secs = remSec % 60;
    const timeStr = mins + 'm ' + (secs < 10 ? '0' : '') + secs + 's';

    if (!warningEl) {
      warningEl = document.createElement('div');
      warningEl.id = 'tm-or-cache-warning';
      warningEl.style.cssText = 'font-size:11px;font-weight:bold;color:#fff;padding:3px 0;text-align:center;';
      widget.insertBefore(warningEl, widget.firstChild);
    }
    warningEl.textContent = '⚠️ Send keepalive to OpenRouter. Time remaining: ' + timeStr;
  }

  // DEBUG: Expose conversation state for console inspection
  // NOTE: These are best-effort debugging utilities, not part of TypingMind itself.
  //       They exist so a human can quickly export the latest payload(s) for agent analysis.

  const TM_PAYLOAD_CAPTURE_RING_KEY = 'tm_payload_captures_v1';
  const TM_PAYLOAD_CAPTURE_EXPORT_KEY = 'tm_payload_captures_last_export';
  const TM_PAYLOAD_CAPTURE_ENABLED_KEY = 'tm_payload_capture_enabled';
  const TM_PAYLOAD_CAPTURE_REDACT_AUTH_KEY = 'tm_payload_capture_redact_auth';

  // (v4.255) Ring HALVED (500->250, rich 100->50) after it grew to 4.3MB of the shared ~5MB
  // origin quota and starved TypingMind's own localStorage writes (hard app crash).
  const TM_PAYLOAD_CAPTURE_MAX_ENTRIES = 250;
  const TM_PAYLOAD_CAPTURE_MAX_RICH_ENTRIES = 50;
  // (v4.255) HARD BYTE BUDGET for the serialized ring -- count caps alone do not bound bytes
  // (headers + raw SSE segments legally added up to 4.3MB under the old caps). Both writers keep
  // JSON.stringify(ring) under this via oldest-first stripping, then eviction.
  const TM_PAYLOAD_CAPTURE_MAX_TOTAL_CHARS = 1_500_000;
  const TM_PAYLOAD_CAPTURE_TRUNCATION_KEY = 'tm_payload_capture_truncation';
  const TM_PAYLOAD_CAPTURE_MAX_STRING_CHARS_DEFAULT = 250;
  // (v4.280) Per-tool-result context-bomb guard. Stored as KB because that is the human-facing
  // widget unit; conversion to bytes happens only at comparison time. GLIMPSE/Lightning Rod are
  // intentionally exempt because large reading projections are normal for Dan's workflow.
  const TM_TOOL_RESULT_GUARD_KB_KEY = 'tm_tool_result_guard_kb';
  const TM_TOOL_RESULT_GUARD_KB_DEFAULT = 100;
  // Hard record budgets keep the 250-entry ring safe. Rich entries (first 50) get full detail.
  const TM_PAYLOAD_CAPTURE_MAX_OUTBOUND_CHARS = 1000;
  const TM_PAYLOAD_CAPTURE_MAX_RESPONSE_CHARS = 1000;

  // (v4.270) PROMPT-INGESTION MISMATCH thresholds. A heuristic response-time detector comparing
  // the final outbound payload size against the provider-reported prompt tokens. Only checked for
  // large payloads; below 50KB per-message overhead dominates and the ratio is meaningless.
  const TM_PAYLOAD_MISMATCH_MIN_BYTES = 50 * 1024;
  // Warn when provider-reported prompt tokens fall below 50% of (bytes/4) -- i.e. fewer than one
  // prompt token per eight outbound bytes, a screaming anomaly. The proven OpenRouter→Gemini drop
  // landed at ~0.17-0.27, far below this; normal tokenizer differences stay well above it.
  const TM_PAYLOAD_MISMATCH_RATIO = 0.5;
  // (v4.270) Default-ON hard block of the OpenRouter→Gemini route (silent large-tool-result drop).
  const TM_BLOCK_OR_GEMINI_KEY = 'tm_block_openrouter_gemini';

  // Escape-key handler reference (added on modal open, removed on close).
  var tmPayloadCaptureModalEscapeHandler = null;

  var tmPromptActive = false;
  var tmPayloadCaptureSuppressEscapeUntil = 0;
  // (v4.271) Whether the ring-modal session-Filter custom listbox is currently open. A module
  // flag (not DOM-scoped) so the whole-modal re-render that fires on every captured turn SURVIVES
  // an open listbox; Escape / click-away dismiss it, and it resets on modal close.
  var tmModalFilterListboxOpen = false;

  // (v4.246) DOM-AUTHORITATIVE child-modal test. Every modal openable from within the ring-buffer
  // modal owns a fixed overlay id; if one is present in the DOM it owns the Escape key and the
  // ring modal must not react. Reading the DOM (rather than trusting a mutable boolean) means this
  // can never get permanently stuck -- the failure mode that silently killed Escape before.
  var TM_CHILD_MODAL_OVERLAY_IDS = [
    'tm-json-viewer-overlay',
    'tm-error-popup-overlay',
    'tm-provider-ratings-overlay',
    'tm-rating-comment-overlay',
    'tm-cost-editor-overlay',
    'tm-provider-set-overlay',
    'tm-payload-modal-overlay'
  ];
  function tmAnyChildModalOpen() {
    try {
      for (var i = 0; i < TM_CHILD_MODAL_OVERLAY_IDS.length; i++) {
        var el = document.getElementById(TM_CHILD_MODAL_OVERLAY_IDS[i]);
        if (el && el.parentNode && el.style && el.style.display !== 'none') return true;
      }
    } catch (e) {}
    return false;
  }
  // (v4.246) Snapshot of the guard state taken at KEYDOWN on window CAPTURE -- i.e. before any
  // document-level listener (including LEAKED ones from a re-rendered child modal) can mutate it.
  // The keyup handler decides from this, so a spurious suppress-window set during the same
  // keypress by a leaked handler cannot swallow the Escape.
  var tmEscapeGuardSnapshot = null;
  var tmPayloadCaptureModalEscapeKeydownSnapshotter = null;

  function tmGetTruncationLimit() {
    try {
      const v = parseInt(localStorage.getItem(TM_PAYLOAD_CAPTURE_TRUNCATION_KEY), 10);
      return (!isNaN(v) && v >= 100) ? v : TM_PAYLOAD_CAPTURE_MAX_STRING_CHARS_DEFAULT;
    } catch (e) {
      return TM_PAYLOAD_CAPTURE_MAX_STRING_CHARS_DEFAULT;
    }
  }

  function tmSetTruncationLimit(val) {
    try {
      const n = parseInt(val, 10);
      if (!isNaN(n) && n >= 100) {
        localStorage.setItem(TM_PAYLOAD_CAPTURE_TRUNCATION_KEY, String(n));
        return n;
      }
    } catch (e) {}
    return tmGetTruncationLimit();
  }

  function tmGetToolResultGuardKb() {
    try {
      var v = parseInt(localStorage.getItem(TM_TOOL_RESULT_GUARD_KB_KEY), 10);
      return (!isNaN(v) && v >= 1) ? v : TM_TOOL_RESULT_GUARD_KB_DEFAULT;
    } catch (e) { return TM_TOOL_RESULT_GUARD_KB_DEFAULT; }
  }

  function tmSetToolResultGuardKb(val) {
    try {
      var n = parseInt(val, 10);
      if (!isNaN(n) && n >= 1) {
        localStorage.setItem(TM_TOOL_RESULT_GUARD_KB_KEY, String(n));
        return n;
      }
    } catch (e) {}
    return tmGetToolResultGuardKb();
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmSanitizeMalformedEmptyNoteValues-32dn,
  //   role=__lambdao_1.tmSanitizeMalformedEmptyNoteValues,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Fix 11: pre-JSON.parse sanitizer for TypingMind cross-model conversion bugs (empty note values) that would otherwise be fatal request crashes.,
  // ]
  function tmSanitizeMalformedEmptyNoteValues(rawBody, contextLabel) {
    // (v4.102) TypingMind cross-model conversion can emit invalid JSON fragments like
    // "note": } or "note": , when switching old tool-history into Gemini format.
    // This must run BEFORE JSON.parse and BEFORE endpoint-specific branches/proxy routing.
    if (typeof rawBody !== 'string' || rawBody.indexOf('"note"') === -1) return rawBody;
    var count = 0;
    var fixed = rawBody.replace(/("note"\s*:\s*)(?=[}\],])/g, function(m, prefix) {
      count++;
      return prefix + 'null';
    });
    if (count > 0) {
      console.log('✅ [v' + EXT_VERSION + '] Sanitized ' + count + ' malformed empty "note" JSON value(s)' + (contextLabel ? (' in ' + contextLabel) : '') + '.');
    }
    return fixed;
  }

  // Backwards-compat alias (used in pre-4.37 code paths that reference the const directly)
  const TM_PAYLOAD_CAPTURE_MAX_STRING_CHARS = TM_PAYLOAD_CAPTURE_MAX_STRING_CHARS_DEFAULT;


  // "Truly huge" fallback threshold (after truncation). If a capture exceeds this,
  // we store a skeleton that preserves protocol-critical fields (model, cache_control,
  // tool_use ids, etc.) while stripping large text.
  const TM_PAYLOAD_CAPTURE_TRULY_HUGE_CHARS = 2_000_000;

  function tmCaptureEnabled() {
    try {
      // Default: ON unless explicitly disabled.
      return localStorage.getItem(TM_PAYLOAD_CAPTURE_ENABLED_KEY) !== 'false';
    } catch (e) {
      return true;
    }
  }

  function tmNormalizeHeaders(h) {
    const out = {};
    if (!h) return out;
    try {
      if (typeof Headers !== 'undefined' && h instanceof Headers) {
        h.forEach((v, k) => { out[k] = v; });
        return out;
      }
    } catch (e) {}

    if (Array.isArray(h)) {
      h.forEach(pair => {
        if (!pair || pair.length < 2) return;
        out[String(pair[0])] = String(pair[1]);
      });
      return out;
    }

    if (typeof h === 'object') {
      Object.keys(h).forEach(k => { out[k] = String(h[k]); });
    }

    return out;
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmMaybeRedactHeaders-zoar,
  //   role=__lambdao_1.tmMaybeRedactHeaders,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Redacts Authorization/Cookie/x-api-key in stored capture headers when tm_payload_capture_redact_auth is set.,
  // ]
  function tmMaybeRedactHeaders(headersObj) {
    try {
      const redact = localStorage.getItem(TM_PAYLOAD_CAPTURE_REDACT_AUTH_KEY) === 'true';
      if (!redact) return headersObj;
    } catch (e) {
      return headersObj;
    }

    const out = { ...headersObj };
    Object.keys(out).forEach(k => {
      const lower = String(k).toLowerCase();
      if (lower === 'authorization' || lower === 'cookie' || lower === 'x-api-key') {
        out[k] = '[REDACTED]';
      }
    });
    return out;
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmTruncateStringsDeep-02sm,
  //   role=__lambdao_1.tmTruncateStringsDeep,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Recursive string truncation for captured payloads (widget 'Trunc:' setting, default 1000); arrays are NOT truncated so full cache_control history survives.,
  // ]
  function tmTruncateStringsDeep(x, maxChars, seen) {
    if (x == null) return x;

    const t = typeof x;
    if (t === 'string') {
      if (x.length <= maxChars) return x;
      const extra = x.length - maxChars;
      return x.slice(0, maxChars) + `… [tm_truncated +${extra} chars]`;
    }
    if (t === 'number' || t === 'boolean') return x;

    if (!seen) seen = new WeakSet();
    if (t === 'object') {
      // Avoid circular refs
      try {
        if (seen.has(x)) return '[tm_circular_ref]';
        seen.add(x);
      } catch (e) {}

      if (Array.isArray(x)) {
        // NO array truncation (per Dan request)
        return x.map(v => tmTruncateStringsDeep(v, maxChars, seen));
      }

      const out = {};
      Object.keys(x).forEach(k => {
        out[k] = tmTruncateStringsDeep(x[k], maxChars, seen);
      });
      return out;
    }

    return `[tm_unhandled_type:${t}]`;
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmDetectProtocol-ca7p,
  //   role=__lambdao_1.tmDetectProtocol,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Classifies a capture as openai-chat / anthropic-messages / gemini / responses-api from URL+body shape; drives Summary and modal rendering.,
  // ]
  function tmDetectProtocol(url, bodyObj) {
    const u = String(url || '');
    if (u.includes('/v1/responses')) return 'openai-responses';
    // (v4.78) DeepInfra hosts an OpenAI-compatible chat-completions endpoint at /v1/openai/chat/completions
    if (u.includes('api.deepinfra.com')) return 'deepinfra-chat-completions';
    if (u.includes('/v1/chat/completions')) return 'openai-chat-completions';
    // Anthropic-native: direct Anthropic OR OpenRouter Anthropic Skin (/api/v1/messages)
    if (u.includes('api.anthropic.com') || (u.includes('openrouter.ai') && u.includes('/v1/messages')) || (bodyObj && Array.isArray(bodyObj.messages) && !Array.isArray(bodyObj.input))) {
      return 'anthropic-messages';
    }
    if (bodyObj && Array.isArray(bodyObj.contents)) return 'gemini-generatecontent';
    return 'unknown';
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmBuildHugeSkeleton-92sj,
  //   role=__lambdao_1.tmBuildHugeSkeleton,
  //   slice_labels=tm-payload-cost-visibility,tm-payload-overview,
  //   kind=ast,
  //   comment=Skeleton builder for oversized payload captures. NOTE: Gemini contents-bodies fall through to key-only stub (no model field) — model must be carried on _model.; v4.255: surfaces injected fields (chat: reasoning/session_id/usage/provider/prompt_cache_key; Responses: reasoning/include/store/previous_response_id) plus reasoning-replay markers (_reasoning_chars/_reasoning_details; Responses input type/name/_encrypted_reasoning_chars) and tool_calls name/arg-size markers.,
  // ]
  function tmBuildHugeSkeleton(bodyObj) {
    // Preserve enough structure to debug cache_control placement + tool use + protocol.
    // Intentionally strips large text.
    if (!bodyObj || typeof bodyObj !== 'object') return bodyObj;

    // Anthropic/OpenAI chat-style
    if (Array.isArray(bodyObj.messages)) {
      return {
        _tm_skeleton: true,
        model: bodyObj.model || null,
        cache_control: bodyObj.cache_control || undefined,
        tools: Array.isArray(bodyObj.tools) ? { count: bodyObj.tools.length } : undefined,
        system: bodyObj.system ? '[tm_system_present]' : undefined,
        // (v4.255) Surface the extension's own INJECTED fields so skeleton captures prove what
        // actually went out (the Sol reasoning injection was invisible here during the 2026-08
        // debugging session -- session_id too; both were skeleton drops, not wire absences).
        reasoning: bodyObj.reasoning || undefined,
        thinking: bodyObj.thinking || undefined,
        session_id: bodyObj.session_id || undefined,
        usage: bodyObj.usage || undefined,
        provider: bodyObj.provider || undefined,
        prompt_cache_key: bodyObj.prompt_cache_key || undefined,
        reasoning_replay: tmSummarizeReasoningReplay(bodyObj),
        messages: bodyObj.messages.map(m => {
          const msg = { role: m && m.role ? m.role : null };
          const c = m && m.content;
          if (typeof c === 'string') {
            msg.content = tmTruncateStringsDeep(c, 200);
          } else if (Array.isArray(c)) {
            msg.content = c.map(block => {
              if (!block || typeof block !== 'object') return block;
              const b = { type: block.type || null };
              // Keep the cache_control object if present
              if (block.cache_control) b.cache_control = block.cache_control;
              // Keep tool wiring
              if (block.id) b.id = block.id;
              if (block.tool_use_id) b.tool_use_id = block.tool_use_id;
              if (block.name) b.name = block.name;
              // Keep short previews of text
              if (typeof block.text === 'string') b.text = tmTruncateStringsDeep(block.text, 200);
              // Keep input/output shapes but truncate deep strings
              if (block.input !== undefined) b.input = tmTruncateStringsDeep(block.input, 200);
              if (block.content !== undefined) b.content = tmTruncateStringsDeep(block.content, 200);
              return b;
            });
          } else {
            msg.content = '[tm_content_unhandled]';
          }
          // (v4.255) Reasoning-REPLAY markers: prove whether prior-turn reasoning blocks are
          // being sent BACK to the model (chat-completions form: assistant `reasoning` string /
          // `reasoning_details` blocks, e.g. reasoning.encrypted). Types/sizes only -- never
          // content. Plus tool_calls name/arg-size markers (previously invisible in skeletons).
          if (m && typeof m.reasoning === 'string' && m.reasoning.length) msg._reasoning_chars = m.reasoning.length;
          if (m && Array.isArray(m.reasoning_details)) {
            msg._reasoning_details = m.reasoning_details.map(function(d) { return d && (d.type || d.format) ? String(d.type || d.format) : '?'; });
          }
          if (m && Array.isArray(m.tool_calls)) {
            msg.tool_calls = m.tool_calls.map(function(tc) {
              var fn = tc && tc.function;
              return { name: fn && fn.name ? fn.name : null, args_chars: (fn && typeof fn.arguments === 'string') ? fn.arguments.length : 0 };
            });
          }
          return msg;
        })
      };
    }

    // OpenAI Responses API style
    if (Array.isArray(bodyObj.input)) {
      return {
        _tm_skeleton: true,
        model: bodyObj.model || null,
        prompt_cache_key: bodyObj.prompt_cache_key,
        prompt_cache_retention: bodyObj.prompt_cache_retention,
        // (v4.255) Surface injected/replay-relevant Responses-API fields.
        reasoning: bodyObj.reasoning || undefined,
        include: bodyObj.include || undefined,
        store: (typeof bodyObj.store === 'boolean') ? bodyObj.store : undefined,
        previous_response_id: bodyObj.previous_response_id || undefined,
        reasoning_replay: tmSummarizeReasoningReplay(bodyObj),
        input: bodyObj.input.map(m => {
          const msg = { role: m && m.role ? m.role : null };
          // (v4.255) Responses input items carry replayed reasoning/function items via `type`
          // (e.g. type:'reasoning' with encrypted_content). Mark type + name + encrypted SIZE
          // only -- never the encrypted payload itself.
          if (m && m.type) msg.type = m.type;
          if (m && m.name) msg.name = m.name;
          if (m && m.encrypted_content) msg._encrypted_reasoning_chars = String(m.encrypted_content).length;
          const c = m && m.content;
          msg.content = tmTruncateStringsDeep(c, 200);
          return msg;
        })
      };
    }

    return {
      _tm_skeleton: true,
      keys: Object.keys(bodyObj)
    };
  }

  // (v4.256) ONE-PASS reasoning-replay AGGREGATE -- counts/types only, never content. Survives
  // every record budget (unlike v4.255's per-message markers, which die with the rich skeleton
  // on any real-sized conversation). Covers all three wire shapes: Anthropic thinking/
  // redacted_thinking content blocks, chat-completions per-message reasoning strings +
  // reasoning_details, and Responses-API replayed reasoning items with encrypted_content.
  // Returns {assistants, none:true} when a scan finds nothing (explicit zero, distinct from
  // undefined = shape not scannable).
  // v4.257: Also count Kimi/Moonshot's native Chat-Completions thinking field,
  // `reasoning_content`, which is the continuity channel Moonshot's docs require clients to
  // replay verbatim as part of the complete assistant message. Counts only; never content.
  function tmSummarizeReasoningReplay(bodyObj) {
    try {
      var msgs = Array.isArray(bodyObj && bodyObj.messages) ? bodyObj.messages
        : (Array.isArray(bodyObj && bodyObj.input) ? bodyObj.input : null);
      if (!msgs) return undefined;
      var agg = { assistants: 0, thinking_blocks: 0, redacted_blocks: 0, reasoning_strs: 0, reasoning_content_strs: 0, reasoning_details: 0, reasoning_detail_types: {}, encrypted_items: 0, encrypted_chars: 0 };
      for (var i = 0; i < msgs.length; i++) {
        var m = msgs[i];
        if (!m) continue;
        if (m.role === 'assistant') agg.assistants++;
        if (typeof m.reasoning === 'string' && m.reasoning.length) agg.reasoning_strs++;
        if (typeof m.reasoning_content === 'string' && m.reasoning_content.length) agg.reasoning_content_strs++;
        if (Array.isArray(m.reasoning_details)) {
          agg.reasoning_details += m.reasoning_details.length;
          for (var d = 0; d < m.reasoning_details.length; d++) {
            var det = m.reasoning_details[d];
            var t = (det && (det.type || det.format)) ? String(det.type || det.format) : '?';
            agg.reasoning_detail_types[t] = (agg.reasoning_detail_types[t] || 0) + 1;
          }
        }
        if (m.type === 'reasoning') {
          agg.encrypted_items++;
          if (m.encrypted_content) agg.encrypted_chars += String(m.encrypted_content).length;
        }
        var c = m.content;
        if (Array.isArray(c)) {
          for (var b = 0; b < c.length; b++) {
            var blk = c[b];
            if (!blk) continue;
            if (blk.type === 'thinking') agg.thinking_blocks++;
            else if (blk.type === 'redacted_thinking') agg.redacted_blocks++;
          }
        }
      }
      if (!agg.thinking_blocks && !agg.redacted_blocks && !agg.reasoning_strs && !agg.reasoning_content_strs && !agg.reasoning_details && !agg.encrypted_items) {
        return { assistants: agg.assistants, none: true };
      }
      return agg;
    } catch (e) { return undefined; }
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmBuildMinimalCaptureSkeleton-a6iw,
  //   role=__lambdao_1.tmBuildMinimalCaptureSkeleton,
  //   slice_labels=tm-payload-cost-visibility,tm-payload-overview,
  //   kind=ast,
  //   comment=Last-resort compact capture record; preserves model, session_id, cache_control, tool count, message shape. No full message text. v4.256: also carries thinking/reasoning body params + the tmSummarizeReasoningReplay aggregate (counts only) -- real-sized conversations always land in THIS record, so the reasoning-replay audit must live here, not only in the rich skeleton.,
  // ]
  function tmBuildMinimalCaptureSkeleton(bodyObj) {
    // Last-resort compact record for the long-history ring: enough context to identify/cache-debug
    // a request, but never a copy of its large tool/message payload.
    var messages = Array.isArray(bodyObj && bodyObj.messages) ? bodyObj.messages :
      (Array.isArray(bodyObj && bodyObj.input) ? bodyObj.input : []);
    var tail = messages.slice(-8).map(function(m) {
      var c = m && m.content;
      return {
        role: (m && m.role) || null,
        content_kind: Array.isArray(c) ? 'array[' + c.length + ']' : typeof c,
        content_types: Array.isArray(c) ? c.slice(0, 6).map(function(b) { return (b && b.type) || typeof b; }) : undefined
      };
    });
    return {
      _tm_compact_capture: true,
      model: (bodyObj && bodyObj.model) || null,
      keys: (bodyObj && typeof bodyObj === 'object') ? Object.keys(bodyObj) : [],
      prompt_cache_key: bodyObj && bodyObj.prompt_cache_key,
      // (v4.256) Reasoning audit fields -- present even in the last-resort record, because real
      // conversations ALWAYS land here (the rich skeleton dies on the 1000-char record budget).
      thinking: bodyObj && bodyObj.thinking,
      reasoning: bodyObj && bodyObj.reasoning,
      reasoning_replay: tmSummarizeReasoningReplay(bodyObj),
      session_id: bodyObj && bodyObj.session_id,
      usage: bodyObj && bodyObj.usage,
      cache_control: bodyObj && bodyObj.cache_control,
      tools: Array.isArray(bodyObj && bodyObj.tools) ? { count: bodyObj.tools.length } : undefined,
      message_count: messages.length,
      recent_messages: tail
    };
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmBuildCompactResponseSkeleton-qlnf,
  //   role=__lambdao_1.tmBuildCompactResponseSkeleton,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Compact structural view of a response body with large text stripped (the Response Skeleton copy button).,
  // ]
  function tmBuildCompactResponseSkeleton(responseObj) {
    var usage = tmExtractKnownUsageEvidence(responseObj);
    return {
      _tm_compact_response: true,
      keys: (responseObj && typeof responseObj === 'object') ? Object.keys(responseObj) : [],
      model: responseObj && responseObj.model,
      id: responseObj && responseObj.id,
      usage: usage || undefined
    };
  }

  function tmReadCaptureRing() {
    try {
      const raw = localStorage.getItem(TM_PAYLOAD_CAPTURE_RING_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  // (v4.255) Strip the heavy per-entry fields (bodies, raw SSE usage segments, verbatim
  // headers). Used by the byte-budget enforcer when the serialized ring outgrows its budget;
  // preserves identity/cost/cache metadata (_model, _identity, response_usage, session ids, ts).
  function tmStripCaptureHeavyFields(entry) {
    if (!entry) return;
    if (!entry._model && entry.body) {
      try { var b = entry.stored_as_skeleton ? entry.body_skeleton : entry.body; if (b && b.model) entry._model = b.model; } catch (e) {}
    }
    entry.body = null;
    entry.body_skeleton = null;
    entry.response_body = null;
    entry.response_body_head = null;
    entry.response_body_compacted = null;
    entry.response_usage_segments = null;
    entry.headers = null;
    entry.response_headers = null;
    entry.stored_as_skeleton = false;
  }

  // (v4.255) Serialize the ring under TM_PAYLOAD_CAPTURE_MAX_TOTAL_CHARS. Root cause of the
  // 2026-08 TypingMind hard crash: the ring reached 4.3MB of the shared ~5MB origin quota, so
  // the APP'S OWN localStorage writes started throwing. Pass 1 strips heavy fields oldest-first
  // (chunks of 20); pass 2 evicts oldest entries (chunks of 10). Mutates `ring` in place.
  function tmSerializeRingWithinBudget(ring) {
    var s = JSON.stringify(ring);
    if (s.length <= TM_PAYLOAD_CAPTURE_MAX_TOTAL_CHARS) return s;
    var idx = 0;
    while (s.length > TM_PAYLOAD_CAPTURE_MAX_TOTAL_CHARS && idx < ring.length) {
      var end = Math.min(idx + 20, ring.length);
      for (; idx < end; idx++) tmStripCaptureHeavyFields(ring[idx]);
      s = JSON.stringify(ring);
    }
    while (s.length > TM_PAYLOAD_CAPTURE_MAX_TOTAL_CHARS && ring.length > 1) {
      ring.splice(0, Math.min(10, ring.length - 1));
      s = JSON.stringify(ring);
    }
    console.warn('⚠️ [v' + EXT_VERSION + '] Payload capture ring exceeded its byte budget; compacted/evicted to ' + ring.length + ' entries, ' + s.length + ' chars.');
    return s;
  }

  function tmWriteCaptureRing(arr) {
    try {
      var s = tmSerializeRingWithinBudget(arr);
      try {
        localStorage.setItem(TM_PAYLOAD_CAPTURE_RING_KEY, s);
      } catch (quotaErr) {
        // (v4.255) Quota still exceeded (other origin keys grew): evict oldest quarter and retry.
        for (var attempt = 0; attempt < 4; attempt++) {
          try {
            arr.splice(0, Math.max(1, Math.floor(arr.length / 4)));
            localStorage.setItem(TM_PAYLOAD_CAPTURE_RING_KEY, JSON.stringify(arr));
            console.warn('⚠️ [v' + EXT_VERSION + '] Ring write hit quota; evicted oldest quarter (attempt ' + (attempt + 1) + ', ' + arr.length + ' entries left).');
            return;
          } catch (e2) {}
        }
        console.warn('⚠️ [v' + EXT_VERSION + '] Failed to persist payload capture ring buffer after eviction retries.');
      }
    } catch (e) {
      // If localStorage is full or blocked, do not break fetch.
      console.warn('⚠️ [v' + EXT_VERSION + '] Failed to persist payload capture ring buffer:', e);
    }
  }

  function tmUpdateCaptureRecord(captureId, patch) {
    if (!captureId || !patch) return;
    const ring = tmReadCaptureRing();
    const idx = ring.findIndex(r => r && r.id === captureId);
    if (idx < 0) return;
    ring[idx] = { ...ring[idx], ...patch };
    tmWriteCaptureRing(ring);
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmCaptureFetchCall-54u9,
  //   role=__lambdao_1.tmCaptureFetchCall,
  //   slice_labels=tm-payload-cost-visibility,tm-payload-overview,
  //   kind=ast,
  //   comment=Capture-time record creation. Stamps _model + session IDs immediately so identity survives body stripping/skeletonization; _model falls back to the URL path (/models/<name>) for Gemini-native traffic, which carries no body.model. Noise filter excludes localhost/typingmind-telemetry/ElevenLabs plus ALL same-origin relative paths (TypingMind's own backend: /api/version, /api/check-cors, ...) EXCEPT /api/cors-proxy, which carries real LLM traffic.,
  // ]
  function tmCaptureFetchCall(url, options, convIdForThisCall, vendorForThisCall, repairTallyForThisCall) {
    if (!tmCaptureEnabled()) return null;

    // Ignore TypingMind internal sync/telemetry calls and localhost traffic (noise).
    // EXCEPTION (v4.62): TypingMind's cors-proxy carries REAL LLM traffic (x-target-endpoint) even
    // though the host is typingmind.com — we WANT to capture those. Only genuine TM telemetry is noise.
    try {
      const u = String(url || '').toLowerCase();
      // (v4.245) HOST-AGNOSTIC cors-proxy match. This endpoint carries REAL LLM traffic and must
      // NEVER be filtered; matching on the path alone keeps it captured even if TypingMind calls
      // it via a relative path (which the relative-path rule below would otherwise swallow).
      const isTmCorsProxy = u.includes('/api/cors-proxy');
      // v4.194: also exclude TypingMind's CORS-preflight probe. It calls its OWN backend via the
      // RELATIVE path '/api/check-cors' (no domain, so the 'typingmind' substring check misses it),
      // with the real provider endpoint only present in the body. No model/usage/cost — pure noise.
      if (!isTmCorsProxy &&
          (u.includes('typingmind') || u.includes('localhost') || u.includes('127.0.0.1') || u.includes('127.') || u.includes('_vercel') || u.includes('api.elevenlabs.io') || u.includes('api.firecrawl.dev') || u.includes('/api/check-cors') || u.includes('/api/version'))) {
        return null;
      }

      // (v4.245) GENERALIZED same-origin noise filter. TypingMind polls its own backend with
      // RELATIVE paths ('/api/version', '/api/check-cors', ...), which the HOST checks above can
      // never see — so each one landed in the ring as a junk row (model '', protocol 'unknown', no
      // usage, permanent MISS) that also wrote a MISS to the cache ledger and clobbered the
      // widget's most-recent status with a junk identity. A relative path resolves against the
      // app's OWN origin, so it CANNOT be a provider endpoint (every provider URL is absolute and
      // cross-origin) — with exactly one exception, the cors-proxy, exempted host-agnostically
      // above. '//host/path' (protocol-relative) is deliberately NOT treated as relative.
      // Unknown relative paths are dropped but logged ONCE each, so if TypingMind ever routes real
      // billable traffic through a new same-origin endpoint it announces itself in the console
      // instead of disappearing from cost tracking.
      if (!isTmCorsProxy && u.charAt(0) === '/' && u.charAt(1) !== '/') {
        try {
          var loggedRel = tmCaptureFetchCall._loggedRelativePaths || (tmCaptureFetchCall._loggedRelativePaths = {});
          if (!loggedRel[u]) {
            loggedRel[u] = true;
            console.debug('\ud83d\udd07 [v' + EXT_VERSION + '] Payload capture: ignoring same-origin relative path (TypingMind backend, not provider traffic): ' + u);
          }
        } catch (eRelLog) {}
        return null;
      }
    } catch (e) {}

    const id = 'cap_' + Date.now() + '_' + Math.random().toString(16).slice(2);
    const headersNorm = tmMaybeRedactHeaders(tmNormalizeHeaders(options && options.headers));

    const now = new Date();
    const record = {
      id,
      ts: now.toISOString(),
      ts_local: now.toLocaleString('en-US', { hour12: false, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' }),
      url: String(url || ''),
      method: (options && options.method) ? String(options.method) : 'POST',
      vendorHint: vendorForThisCall || null,
      convIdHint: convIdForThisCall || null,
      repair_tally: repairTallyForThisCall || null,
      headers: headersNorm,
      body_parse_error: null,
      protocol: 'unknown',
      body: null,
      body_skeleton: null,
      body_chars_estimate: null,
      stored_as_skeleton: false,

      // Response capture (filled in later, best-effort)
      response_status: null,
      response_ok: null,
      response_headers: null,
      response_body_parse_error: null,
      response_body: null,
      response_body_chars: null,
      response_usage_segments: null
    };

    try {
      const bodyRaw = options && options.body;
      if (typeof bodyRaw === 'string') {
        record.body_chars_estimate = bodyRaw.length;
        // (v4.270) Exact UTF-8 byte count for the prompt-ingestion-mismatch heuristic. String
        // length counts UTF-16 code units, so multi-byte chars (emoji, CJK, box-drawing) inflate
        // the true byte size; the mismatch detector needs the real outbound byte size. Legacy
        // body_chars_estimate is preserved for backward compatibility / older ring entries.
        try {
          record.body_bytes_utf8 = (typeof TextEncoder !== 'undefined')
            ? new TextEncoder().encode(bodyRaw).length
            : bodyRaw.length;
        } catch (eBytes) { record.body_bytes_utf8 = bodyRaw.length; }
        const parsed = JSON.parse(bodyRaw);
        record.protocol = tmDetectProtocol(url, parsed);
        record._model = (parsed && parsed.model) ? String(parsed.model) : null;

        // (v4.244) Gemini-native traffic carries NO body.model — the model lives in the URL path
        // (/v1beta/models/gemini-3.7-flash:streamGenerateContent). An empty model is the kill
        // switch for the ENTIRE cost pipeline: tmDiscoverAndMergeProviderCosts skips the row
        // ('if (!model) continue') so no Set Costs entry is ever created for the user to price,
        // and tmCaptureResponse's client-side cost block is gated on idModel so it never runs —
        // real money spent, silent $0 reported. It also poisons the identity key (sid::::host::
        // direct), smearing session cost/hue across models. Derive it from the URL; check the
        // cors-proxy x-target-endpoint header first, since proxied traffic hides the real URL
        // there while the request URL is just typingmind.com/api/cors-proxy.
        if (!record._model) {
          try {
            var modelUrl = String(url || '');
            try {
              var tgtEndpoint = headersNorm && (headersNorm['x-target-endpoint'] || headersNorm['X-Target-Endpoint']);
              if (tgtEndpoint && /\/models\//i.test(String(tgtEndpoint))) modelUrl = String(tgtEndpoint);
            } catch (eTgt) {}
            var urlModelMatch = modelUrl.match(/\/models\/([^\/:?#]+)/i);
            if (urlModelMatch && urlModelMatch[1]) record._model = decodeURIComponent(urlModelMatch[1]);
          } catch (eUrlModel) {}
        }

        // (v4.90) Always derive and store session IDs on every capture record.
        try {
          record.session_id = tmDeriveStableSessionId(parsed);
          record.pasted_session_id = deriveConversationIdFromBody(parsed);
        } catch (e) {
          record.session_id = null;
          record.pasted_session_id = null;
        }

        // v4.87: a 100-entry history needs a strict record budget. Prefer a small truncated
        // payload only when it fits; otherwise retain a diagnostic skeleton, then a tiny fallback.
        var compact = tmTruncateStringsDeep(parsed, tmGetTruncationLimit());
        var compactStr = JSON.stringify(compact);
        if (compactStr.length <= TM_PAYLOAD_CAPTURE_MAX_OUTBOUND_CHARS) {
          record.body = compact;
        } else {
          var skeleton = tmBuildHugeSkeleton(parsed);
          var skeletonStr = JSON.stringify(skeleton);
          record.body_skeleton = (skeletonStr.length <= TM_PAYLOAD_CAPTURE_MAX_OUTBOUND_CHARS)
            ? skeleton
            : tmBuildMinimalCaptureSkeleton(parsed);
          record.stored_as_skeleton = true;
        }
      } else if (bodyRaw != null) {
        // Non-string body (rare in TypingMind LLM calls, but possible).
        record.body = { _tm_non_string_body: true, type: typeof bodyRaw };
      }
    } catch (e) {
      record.body_parse_error = String(e && e.message ? e.message : e);
    }

    const ring = tmReadCaptureRing();
    ring.push(record);
    while (ring.length > TM_PAYLOAD_CAPTURE_MAX_ENTRIES) {
      ring.shift();
    }

    // (v4.138) Strip body/response data from entries beyond the rich threshold to free storage.
    for (var si = 0; si < ring.length - TM_PAYLOAD_CAPTURE_MAX_RICH_ENTRIES; si++) {
      var old = ring[si];
      if (old) {
        // (v4.144) Save model name so it survives stripping.
        if (!old._model && old.body) {
          try { var b = old.stored_as_skeleton ? old.body_skeleton : old.body; if (b && b.model) old._model = b.model; } catch (e) {}
        }
        old.body = null;
        old.body_skeleton = null;
        old.response_body = null;
        old.response_body_head = null;
        old.response_body_compacted = null;
        old.stored_as_skeleton = false;
      }
    }

    // Guard against localStorage quota overflow: if write fails, evict oldest entries and retry
    var writeOk = false;
    var ringStr = tmSerializeRingWithinBudget(ring); // (v4.255) hard byte budget BEFORE first write
    for (var attempt = 0; attempt < 5 && !writeOk; attempt++) {
      try {
        localStorage.setItem(TM_PAYLOAD_CAPTURE_RING_KEY, ringStr);
        writeOk = true;
      } catch (quotaErr) {
        // Evict oldest entry and retry
        if (ring.length > 1) {
          ring.shift();
          ringStr = JSON.stringify(ring); // (v4.255) re-serialize after eviction for the retry
          console.warn('\u26a0\ufe0f [v' + EXT_VERSION + '] Payload capture ring exceeded localStorage quota; evicted oldest entry (attempt ' + (attempt + 1) + ')');
        } else {
          // Even a single entry is too large; store a minimal stub
          ring[0] = { id: record.id, ts: record.ts, ts_local: record.ts_local, url: record.url, protocol: record.protocol, _tm_oversized: true };
          try { localStorage.setItem(TM_PAYLOAD_CAPTURE_RING_KEY, JSON.stringify(ring)); } catch (e2) {}
          console.warn('\u26a0\ufe0f [v' + EXT_VERSION + '] Payload capture: even single entry too large for localStorage; stored stub.');
          writeOk = true;
        }
      }
    }

    return id;
  }

  // @carto-group id=client-group-3 label="Client group 3"

  // (v4.86) Provider-agnostic response-usage fallback. Unknown normal endpoints are already
  // captured; this reads known cache/cost field variants anywhere in JSON or SSE event objects,
  // normalizes them for the widget/modal, and never changes the outbound request.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmExtractKnownUsageEvidence-jgts,
  //   role=__lambdao_1.tmExtractKnownUsageEvidence,
  //   slice_labels=tm-payload-cost-visibility,tm-payload-overview,
  //   kind=ast,
  //   comment=Fix 10: provider-agnostic deep-walk of a response object for known usage/cost/cache field shapes so unfamiliar providers still surface observability. Normalizes OpenAI/Anthropic/OpenRouter/Gemini spellings (incl. Gemini's promptTokenCount/totalTokenCount/candidatesTokenCount+thoughtsTokenCount) into input_tokens/prompt_tokens/total_tokens/completion_tokens/cache_read_input_tokens — a MISSING spelling here does not just lose a number, it silently breaks the hit/miss ratio test and the cost calculation downstream.,
  // ]
  function tmExtractKnownUsageEvidence(root) {
    if (!root || typeof root !== 'object') return null;
    var out = {};
    var found = false;
    var seen = (typeof WeakSet !== 'undefined') ? new WeakSet() : null;

    function num(v) {
      var n = Number(v);
      return isFinite(n) ? n : null;
    }
    function firstNum(obj, keys) {
      for (var i = 0; i < keys.length; i++) {
        if (obj && obj[keys[i]] != null) {
          var n = num(obj[keys[i]]);
          if (n != null) return n;
        }
      }
      return null;
    }
    function setIfAbsent(key, value) {
      if (value != null && out[key] == null) { out[key] = value; found = true; }
    }
    function inspect(obj) {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
      var details = obj.prompt_tokens_details || obj.promptTokensDetails || obj.input_tokens_details || obj.inputTokensDetails || null;
      var read = firstNum(obj, ['cache_read_input_tokens', 'cacheReadInputTokens', 'cache_read_tokens', 'cacheReadTokens', 'cached_tokens', 'cachedTokens', 'cached_content_token_count', 'cachedContentTokenCount', 'cache_hit_tokens', 'cacheHitTokens']);
      if (read == null && details) read = firstNum(details, ['cached_tokens', 'cachedTokens', 'cached_content_token_count', 'cachedContentTokenCount', 'cache_read_tokens', 'cacheReadTokens']);
      var write = firstNum(obj, ['cache_creation_input_tokens', 'cacheCreationInputTokens', 'cache_write_tokens', 'cacheWriteTokens', 'cache_creation_tokens', 'cacheCreationTokens', 'cache_write_input_tokens', 'cacheWriteInputTokens']);
      if (write == null && details) write = firstNum(details, ['cache_write_tokens', 'cacheWriteTokens', 'cache_creation_tokens', 'cacheCreationTokens']);
      var cost = firstNum(obj, ['cost', 'estimated_cost', 'estimatedCost']);
      // (v4.218) OpenRouter can report cost:0 at the top level when the real charge is nested in
      // cost_details.upstream_inference_cost (observed on a 502 streamed error with real usage).
      // Prefer the real upstream cost over a zero top-level cost so error responses still log cost.
      if ((cost == null || cost === 0) && obj.cost_details) {
        var uic = firstNum(obj.cost_details, ['upstream_inference_cost', 'upstreamInferenceCost']);
        if (uic != null && uic > 0) cost = uic;
      }
      setIfAbsent('cache_read_input_tokens', read);
      setIfAbsent('cache_creation_input_tokens', write);
      setIfAbsent('cost', cost);
      // (v4.120) Preserve prompt_tokens / total_tokens so the hit/miss ratio check works.
      // (v4.244) GEMINI-NATIVE SPELLINGS. The Google generativelanguage API reports
      // promptTokenCount / totalTokenCount / candidatesTokenCount inside usageMetadata. Only its
      // cachedContentTokenCount was recognized here, so the cache BADGE rendered a correct value
      // while tmIsSignificantCacheHit had NO denominator (input_tokens || prompt_tokens ||
      // total_tokens all undefined) -> isSignificant() bailed -> EVERY Gemini turn reported MISS
      // on a real ~99% hit. Gemini's promptTokenCount INCLUDES the cached tokens, matching
      // prompt_tokens semantics, so both the ratio test and (prompt - cached) new-input math work.
      // Preserve input_tokens as its own canonical fallback rather than forcing it into
      // prompt_tokens: some segmented APIs use input_tokens while OpenAI-style APIs use
      // prompt_tokens. Downstream cost logic already accepts either spelling.
      setIfAbsent('input_tokens', firstNum(obj, ['input_tokens', 'inputTokens', 'inputTokenCount']));
      setIfAbsent('prompt_tokens', firstNum(obj, ['prompt_tokens', 'promptTokens', 'promptTokenCount']));
      setIfAbsent('total_tokens', firstNum(obj, ['total_tokens', 'totalTokens', 'totalTokenCount']));
      // (v4.244) completion/output tokens were never extracted for ANY provider spelling, so
      // tmCalculateCostFromTable could only reach output via its total-minus-prompt fallback (and
      // for Gemini, with no total either, it billed nothing at all). Gemini bills thinking as
      // output but reports it SEPARATELY from candidates (totalTokenCount = promptTokenCount +
      // candidatesTokenCount + thoughtsTokenCount), so the two are summed for the candidates case.
      var completionTok = firstNum(obj, ['completion_tokens', 'completionTokens', 'output_tokens', 'outputTokens', 'candidatesTokenCount']);
      if (completionTok != null) {
        if (obj.candidatesTokenCount != null) {
          var thoughtsTok = firstNum(obj, ['thoughtsTokenCount', 'thoughts_token_count', 'reasoning_tokens', 'reasoningTokens']);
          if (thoughtsTok != null) completionTok += thoughtsTok;
        }
        setIfAbsent('completion_tokens', completionTok);
      }
      // (v4.297) FIRST-CLASS reasoning/thinking token extraction (the context-dial breakdown).
      // OpenAI chat-completions: usage.completion_tokens_details.reasoning_tokens; OpenAI Responses
      // API: usage.output_tokens_details.reasoning_tokens; Moonshot/direct: top-level
      // reasoning_tokens; Gemini: thoughtsTokenCount. total_tokens ALREADY includes reasoning
      // everywhere we know of, so this is display/audit only -- NEVER added into any total here.
      var compDetails = obj.completion_tokens_details || obj.completionTokensDetails || obj.output_tokens_details || obj.outputTokensDetails || null;
      var reasoningTok = firstNum(obj, ['reasoning_tokens', 'reasoningTokens', 'thinking_tokens', 'thinkingTokens', 'thoughtsTokenCount']);
      if (reasoningTok == null && compDetails) reasoningTok = firstNum(compDetails, ['reasoning_tokens', 'reasoningTokens', 'thinking_tokens', 'thinkingTokens']);
      setIfAbsent('reasoning_tokens', reasoningTok);
      if (read != null || write != null) {
        out.prompt_tokens_details = out.prompt_tokens_details || {};
        if (read != null) out.prompt_tokens_details.cached_tokens = read;
        if (write != null) out.prompt_tokens_details.cache_write_tokens = write;
      }
    }
    function walk(node, depth) {
      if (!node || typeof node !== 'object' || depth > 8) return;
      try {
        if (seen) { if (seen.has(node)) return; seen.add(node); }
      } catch (e) {}
      if (Array.isArray(node)) {
        for (var ai = 0; ai < node.length; ai++) walk(node[ai], depth + 1);
        return;
      }
      inspect(node);
      var keys = Object.keys(node);
      for (var ki = 0; ki < keys.length; ki++) {
        var value = node[keys[ki]];
        if (value && typeof value === 'object') walk(value, depth + 1);
      }
    }
    walk(root, 0);
    return found ? out : null;
  }

  function tmMergeUsageInto(dst, src) {
    if (!src) return dst;
    dst = dst || {};
    var keys = Object.keys(src);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = src[k];
      if (v == null) continue;
      // Deep-merge prompt_tokens_details so cached_tokens and cache_write_tokens
      // from separate SSE chunks survive rather than clobbering each other.
      if (k === 'prompt_tokens_details' && v && typeof v === 'object' && !Array.isArray(v)) {
        dst[k] = dst[k] || {};
        tmMergeUsageInto(dst[k], v);
        continue;
      }
      // Never overwrite a positive cost with zero.
      if (k === 'cost' && v === 0 && dst[k] && dst[k] > 0) continue;
      dst[k] = v;
    }
    return dst;
  }

  // ==================== (v4.275) PERSISTENT PROVIDER ERROR CAPTURE ====================
  // Responses were already stored best-effort, but old entries lose response_body/raw SSE segments
  // when the rich window is compacted. `error` is deliberately a separate small metadata field, so
  // the exact provider failure remains visible and inspectable for the lifetime of the ring entry.
  const TM_CAPTURE_ERROR_MAX_CHARS = 24 * 1024;

  function tmFindProviderErrorPayload(root) {
    if (root == null || typeof root !== 'object') return null;
    var queue = [{ value: root, depth: 0 }];
    var seen = (typeof WeakSet !== 'undefined') ? new WeakSet() : null;
    var scanned = 0;
    while (queue.length && scanned < 200) {
      var item = queue.shift();
      var node = item.value;
      var depth = item.depth;
      if (!node || typeof node !== 'object') continue;
      scanned++;
      try { if (seen) { if (seen.has(node)) continue; seen.add(node); } } catch (e) {}
      if (!Array.isArray(node)) {
        if (Object.prototype.hasOwnProperty.call(node, 'error') && node.error != null && node.error !== false && node.error !== '') {
          return node.error;
        }
        if (Array.isArray(node.errors) && node.errors.length) return node.errors;
        if (String(node.type || '').toLowerCase() === 'error' &&
            (node.message != null || node.detail != null || node.code != null)) return node;
      }
      if (depth >= 6) continue;
      var vals = Array.isArray(node) ? node : Object.keys(node).map(function(k) { return node[k]; });
      for (var i = 0; i < vals.length && queue.length < 200; i++) {
        if (vals[i] && typeof vals[i] === 'object') queue.push({ value: vals[i], depth: depth + 1 });
      }
    }
    return null;
  }

  function tmCapturedErrorMessage(payload) {
    try {
      if (payload == null) return 'Unknown provider error';
      if (typeof payload === 'string') return payload;
      if (Array.isArray(payload)) {
        var parts = [];
        for (var ai = 0; ai < payload.length && ai < 5; ai++) parts.push(tmCapturedErrorMessage(payload[ai]));
        return parts.filter(Boolean).join(' | ') || 'Provider returned an error array';
      }
      var keys = ['message', 'detail', 'error_description', 'reason', 'title', 'statusText'];
      for (var ki = 0; ki < keys.length; ki++) {
        var v = payload[keys[ki]];
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
      if (payload.error != null && payload.error !== payload) return tmCapturedErrorMessage(payload.error);
      var s = JSON.stringify(payload);
      return s || 'Unknown provider error';
    } catch (e) { return String(payload); }
  }

  function tmBoundCapturedErrorPayload(payload) {
    try {
      if (typeof payload === 'string') {
        return payload.length <= TM_CAPTURE_ERROR_MAX_CHARS
          ? payload
          : payload.slice(0, TM_CAPTURE_ERROR_MAX_CHARS) + '... [tm_error_truncated]';
      }
      var raw = JSON.stringify(payload);
      if (raw.length <= TM_CAPTURE_ERROR_MAX_CHARS) return payload;
      var compact = tmTruncateStringsDeep(payload, 4000);
      var compactRaw = JSON.stringify(compact);
      if (compactRaw.length <= TM_CAPTURE_ERROR_MAX_CHARS) return compact;
      return {
        _tm_error_compacted: true,
        _original_chars: raw.length,
        raw_json_head: raw.slice(0, TM_CAPTURE_ERROR_MAX_CHARS - 120) + '... [tm_error_compacted]'
      };
    } catch (e) {
      return String(payload).slice(0, TM_CAPTURE_ERROR_MAX_CHARS);
    }
  }

  function tmBuildCapturedProviderError(payload, status, source) {
    var statusNum = Number(status);
    if (!isFinite(statusNum) || statusNum <= 0) statusNum = null;
    var msg = tmCapturedErrorMessage(payload);
    if (msg.length > 2000) msg = msg.slice(0, 2000) + '... [tm_error_message_truncated]';
    return {
      status: statusNum,
      source: source || 'response',
      message: msg,
      payload: tmBoundCapturedErrorPayload(payload)
    };
  }

  // Best-effort one-time upgrade for errors captured before v4.275. If their rich response body
  // or raw SSE evidence still exists, preserve it now before a later compaction pass removes it.
  function tmBackfillCapturedErrorsFromRing() {
    var ring = tmReadCaptureRing();
    var changed = 0;
    for (var ri = 0; ri < ring.length; ri++) {
      var cap = ring[ri];
      if (!cap || cap.error) continue;
      var payload = null;
      var source = null;

      if (cap.response_body != null) {
        payload = tmFindProviderErrorPayload(cap.response_body);
        if (payload == null && Number(cap.response_status) >= 400) payload = cap.response_body;
        if (payload != null) source = 'backfill-json';
      }

      if (payload == null && Array.isArray(cap.response_usage_segments)) {
        for (var si = 0; si < cap.response_usage_segments.length; si++) {
          try {
            var segObj = JSON.parse(cap.response_usage_segments[si]);
            var segErr = tmFindProviderErrorPayload(segObj);
            if (segErr != null) { payload = segErr; source = 'backfill-sse'; break; }
          } catch (eSeg) {}
        }
      }

      if (payload == null && typeof cap.response_body_head === 'string' && cap.response_body_head) {
        var head = cap.response_body_head;
        try {
          var headObj = JSON.parse(head);
          payload = tmFindProviderErrorPayload(headObj);
          if (payload == null && Number(cap.response_status) >= 400) payload = headObj;
          if (payload != null) source = 'backfill-head-json';
        } catch (eHeadJson) {}
        if (payload == null) {
          var headLines = head.split('\n');
          for (var hi = 0; hi < headLines.length; hi++) {
            var hline = headLines[hi].trim();
            if (!hline.startsWith('data: ')) continue;
            try {
              var hobj = JSON.parse(hline.slice(6).trim());
              var herr = tmFindProviderErrorPayload(hobj);
              if (herr != null) { payload = herr; source = 'backfill-head-sse'; break; }
            } catch (eHeadSse) {}
          }
        }
        if (payload == null && Number(cap.response_status) >= 400) {
          payload = head;
          source = 'backfill-http-text';
        }
      }

      if (payload != null) {
        cap.error = tmBuildCapturedProviderError(payload, cap.response_status, source || 'backfill');
        changed++;
      }
    }
    if (changed) tmWriteCaptureRing(ring);
    return changed;
  }

  // ==================== (v4.270) OPENROUTER→GEMINI GUARD + INGESTION MISMATCH ====================

  // Resolve the EFFECTIVE target URL for a request. TypingMind can route real provider traffic
  // through its own same-origin /api/cors-proxy, in which case the true endpoint is carried in
  // the x-target-endpoint header, not the request URL. The OpenRouter→Gemini detector MUST use
  // this, or it will silently miss proxied OpenRouter traffic (the exact case we're guarding).
  function tmResolveEffectiveTargetUrl(url, options) {
    var effective = String(url || '');
    try {
      var headers = tmNormalizeHeaders(options && options.headers);
      var target = headers && (headers['x-target-endpoint'] || headers['X-Target-Endpoint']);
      if (target) effective = String(target);
    } catch (e) {}
    return effective;
  }

  // Detect the PROVEN-lossy OpenRouter→Gemini route. Returns a descriptor object, or null if the
  // request is not OpenRouter→Gemini. A hard block applies to ALL such requests (not only large
  // ones) because the silent large-tool-result drop cannot be predicted from the outside.
  function tmDetectOpenRouterGeminiRoute(url, options, body) {
    try {
      var target = tmResolveEffectiveTargetUrl(url, options).toLowerCase();
      if (target.indexOf('openrouter.ai') === -1) return null;
      var model = String((body && body.model) || '').toLowerCase().replace(/:(nitro|floor|free)$/i, '');
      var isGemini = model.indexOf('gemini') !== -1 &&
        (model.indexOf('google/') === 0 || model.indexOf('gemini') === 0);
      if (!isGemini) return null;
      return {
        code: 'openrouter_gemini_blocked',
        model: model,
        effective_target_url: target
      };
    } catch (e) { return null; }
  }

  // The default-ON toggle. Only an explicit localStorage 'false' disables the block. Controlled
  // from the ring-buffer modal's 🚫 button (not the crowded persistent widget).
  function tmShouldBlockOpenRouterGemini() {
    try { return localStorage.getItem(TM_BLOCK_OR_GEMINI_KEY) !== 'false'; } catch (e) { return true; }
  }

  // Provider-aware effective prompt-token count from a capture's recorded usage evidence.
  // CRITICAL: a bare input_tokens is WRONG for cached Anthropic turns (input_tokens:2 while
  // cache_creation_input_tokens:348324). Cached prompt tokens still count as content that
  // reached the provider. Precedence: OpenRouter/OpenAI prompt_tokens first, then the summed
  // Anthropic counters (uncached + cache-read + cache-write), then generic fallbacks.
  function tmEffectivePromptTokens(cap) {
    if (!cap) return null;
    function n(v) { var x = Number(v); return (isFinite(x) && x > 0) ? x : 0; }
    var u = cap.response_usage || {};
    var a = cap.response_anthropic_usage || {};
    var openai = n(u.prompt_tokens);
    if (openai > 0) return openai;
    var anthropic = n(a.input_tokens) + n(a.cache_read_input_tokens) + n(a.cache_creation_input_tokens);
    if (anthropic > 0) return anthropic;
    var generic = n(u.input_tokens);
    if (generic > 0) return generic;
    var total = n(u.total_tokens);
    if (total > 0) return total;
    return null;
  }

  // Response-time heuristic: does the provider-reported prompt-token count fall egregiously below
  // what the outbound payload size predicts? This does NOT prove content was dropped (providers may
  // legitimately differ); it raises a soft 'prompt_ingestion_mismatch' warning for investigation.
  // Prefers the exact UTF-8 byte count (body_bytes_utf8) over the legacy UTF-16 code-unit count.
  function tmDetectPromptIngestionMismatch(cap) {
    try {
      if (!cap) return null;
      var bytes = Number(cap.body_bytes_utf8 || cap.body_chars_estimate || 0);
      if (!isFinite(bytes) || bytes < TM_PAYLOAD_MISMATCH_MIN_BYTES) return null;
      var reported = tmEffectivePromptTokens(cap);
      if (!reported || reported <= 0) return null;
      var estimated = Math.ceil(bytes / 4);
      if (estimated <= 0) return null;
      var ratio = reported / estimated;
      if (ratio >= TM_PAYLOAD_MISMATCH_RATIO) return null;
      return {
        code: 'prompt_ingestion_mismatch',
        severity: 'critical',
        title: 'Prompt ingestion mismatch',
        message: 'Provider reported far fewer prompt tokens than the outbound payload size predicts.',
        ts: Date.now(),
        details: {
          outbound_bytes: bytes,
          estimated_prompt_tokens: estimated,
          reported_prompt_tokens: reported,
          reported_to_estimated_ratio: Math.round(ratio * 1000) / 1000,
          estimated_deficit_tokens: Math.max(estimated - reported, 0)
        }
      };
    } catch (e) { return null; }
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmCaptureResponse-vq1x,
  //   role=__lambdao_1.tmCaptureResponse,
  //   slice_labels=tm-payload-cost-visibility,tm-payload-overview,
  //   kind=ast,
  //   comment=Response receipt = the ONE identity/cost/metadata stamping event (usage extraction, cost recording, _identity stamp, store touch, widget render).,
  // ]
  function tmCaptureResponse(captureId, response) {
    if (!tmCaptureEnabled() || !captureId || !response) return;

    try {
      const hdrs = tmMaybeRedactHeaders(tmNormalizeHeaders(response.headers));
      tmUpdateCaptureRecord(captureId, {
        response_status: response.status,
        response_ok: response.ok,
        response_headers: hdrs
      });
    } catch (e) {
      // ignore
    }

    // Best-effort response body capture (can be large / streaming)
    try {
      const clone = response.clone();
      clone.text().then(
        function(text) {
          const patch = { response_body_chars: (typeof text === 'string' ? text.length : null) };
          // (v4.211) Track whether this response carried an ERROR (HTTP>=400 or an error chunk),
          // so the widget-feed gate below can leave the last SUCCESSFUL turn's values untouched.
          var capHadError = false;
          try { capHadError = (Number(response.status) >= 400); } catch (e) {}
          try {
            // Try JSON parse first (non-streaming responses)
            const parsed = JSON.parse(text);
            var storedResponse = tmTruncateStringsDeep(parsed, tmGetTruncationLimit());
            if (JSON.stringify(storedResponse).length <= TM_PAYLOAD_CAPTURE_MAX_RESPONSE_CHARS) {
              patch.response_body = storedResponse;
            } else {
              patch.response_body = tmBuildCompactResponseSkeleton(parsed);
              patch.response_body_compacted = true;
            }
            // Non-streaming provider responses: surface any known cache/cost evidence too.
            var jsonUsage = tmExtractKnownUsageEvidence(parsed);
            if (jsonUsage) patch.response_usage = jsonUsage;
            // (v4.197) Capture the top-level provider string for inline modal display.
            if (parsed && typeof parsed.provider === 'string' && parsed.provider) {
              patch.response_provider = parsed.provider;
            }
            // (v4.275) Persist the provider's actual error separately from response_body. For an
            // HTTP failure without a conventional nested `error`, preserve the whole JSON body.
            var jsonErrorPayload = tmFindProviderErrorPayload(parsed);
            if (jsonErrorPayload == null && Number(response.status) >= 400) jsonErrorPayload = parsed;
            if (jsonErrorPayload != null) {
              patch.error = tmBuildCapturedProviderError(jsonErrorPayload, response.status, 'json');
              capHadError = true;
            }
          } catch (e) {
            // SSE/streaming: store head for context
            var s = String(text || '');
            var headLimit = Math.min(tmGetTruncationLimit(), TM_PAYLOAD_CAPTURE_MAX_RESPONSE_CHARS);
            patch.response_body_head = s.slice(0, headLimit) +
              (s.length > headLimit ? ('... [tm_truncated +' + (s.length - headLimit) + ' chars]') : '');

            // Extract usage from SSE stream by scanning all data: lines
            try {
              var lines = s.split('\n');
              var lastUsage = null;
              var anthropicUsage = null;
              var usageSegments = [];
              var sseProvider = null; // (v4.197) top-level provider string carried by each SSE chunk
              for (var li = 0; li < lines.length; li++) {
                var line = lines[li].trim();
                if (!line.startsWith('data: ')) continue;
                var jsonStr = line.slice(6).trim();
                if (jsonStr === '[DONE]') continue;
                try {
                  var parsed2 = JSON.parse(jsonStr);
                  var hit = false;
                  // Generic fallback for unfamiliar providers / field nesting. This is read-only:
                  // it merely promotes cache read/write + cost evidence into the capture/widget.
                  var genericUsage = tmExtractKnownUsageEvidence(parsed2);
                  if (genericUsage) {
                    lastUsage = tmMergeUsageInto(lastUsage, genericUsage);
                    hit = true;
                  }
                  // OpenRouter-style: usage in root of chunk
                  if (!genericUsage && parsed2 && parsed2.usage) {
                    lastUsage = tmMergeUsageInto(lastUsage, parsed2.usage);
                    hit = true;
                  }
                  // OpenAI Responses-style: usage in response.completed -> response.usage
                  if (parsed2 && parsed2.response && parsed2.response.usage) {
                    lastUsage = tmMergeUsageInto(lastUsage, parsed2.response.usage);
                    hit = true;
                  }
                  // Anthropic-style: usage in message_start
                  if (parsed2 && parsed2.type === 'message_start' && parsed2.message && parsed2.message.usage) {
                    anthropicUsage = parsed2.message.usage; hit = true;
                  }
                  // Anthropic-style: additional usage in message_delta
                  if (parsed2 && parsed2.type === 'message_delta' && parsed2.usage) {
                    anthropicUsage = anthropicUsage || {};
                    var du = parsed2.usage;
                    for (var k in du) { if (Object.prototype.hasOwnProperty.call(du, k)) { anthropicUsage[k] = du[k]; } }
                    hit = true;
                  }
                  // (v4.197) Capture the top-level provider string (e.g. 'Moonshot AI', 'Baseten')
                  // so the modal row can show it inline without opening the raw segment.
                  if (!sseProvider && parsed2 && typeof parsed2.provider === 'string' && parsed2.provider) {
                    sseProvider = parsed2.provider;
                  }
                  // (v4.198) ALSO preserve ERROR-bearing segments (provider 400s / schema rejections),
                  // which carry NO usage. Previously these were dropped, so a crashed turn showed a
                  // provider (extracted above) but had NO Raw Seg button — you couldn't see the error
                  // without opening the network tab. A chunk with an `error` field is exactly the
                  // diagnostic you want, so mark it as worth keeping.
                  // (v4.275) Persist the first actual streamed error as a compact first-class field.
                  // Keep the raw segment too (v4.198), but `error` survives old-entry compaction.
                  var sseErrorPayload = tmFindProviderErrorPayload(parsed2);
                  if (sseErrorPayload != null) {
                    hit = true;
                    capHadError = true;
                    if (!patch.error) patch.error = tmBuildCapturedProviderError(sseErrorPayload, response.status, 'sse');
                  }
                  // (v4.258) Build a compact skeleton for an oversized SSE segment: preserve usage/cost/error
  // verbatim, strip the giant echoed fields (tools, large output arrays, reasoning content).
  // Returns a JSON string capped near TM_RAW_SEG_SKELETON_MAX. Never throws.
  const TM_RAW_SEG_MAX_CHARS = 24 * 1024;
  function tmSlimRawSegment(jsonStr) {
    try {
      if (typeof jsonStr !== 'string' || jsonStr.length <= TM_RAW_SEG_MAX_CHARS) return jsonStr;
      var p = JSON.parse(jsonStr);
      var slim = { _tm_slim_segment: true, _orig_chars: jsonStr.length };
      // Root identity fields commonly useful for debugging.
      var carry = ['id','object','created','model','provider','service_tier','status','type'];
      for (var ci = 0; ci < carry.length; ci++) {
        var k = carry[ci];
        if (Object.prototype.hasOwnProperty.call(p, k) && p[k] != null) slim[k] = p[k];
      }
      // Usage / cost evidence: keep verbatim (small).
      if (p.usage) slim.usage = p.usage;
      if (p.cost != null) slim.cost = p.cost;
      if (p.cost_details) slim.cost_details = p.cost_details;
      if (p.prompt_tokens_details) slim.prompt_tokens_details = p.prompt_tokens_details;
      if (p.completion_tokens_details) slim.completion_tokens_details = p.completion_tokens_details;
      // Error objects are the entire reason we keep raw segments; always preserve verbatim.
      if (p.error) slim.error = p.error;
      // Choices: keep only finish metadata, drop large content.
      if (Array.isArray(p.choices)) {
        slim.choices = p.choices.map(function(c) {
          var o = {};
          if (c && c.index != null) o.index = c.index;
          if (c && c.finish_reason) o.finish_reason = c.finish_reason;
          if (c && c.native_finish_reason) o.native_finish_reason = c.native_finish_reason;
          return o;
        });
      }
      // response.completed wrapper: keep response.usage + status + error + stop, drop response.tools/output.
      if (p.response && typeof p.response === 'object' && !Array.isArray(p.response)) {
        var r = p.response;
        var sr = { _tm_slim_response: true };
        var rcarry = ['id','object','created_at','completed_at','status','model','stop_reason','stop_sequence','service_tier','speed'];
        for (var ri = 0; ri < rcarry.length; ri++) {
          var rk = rcarry[ri];
          if (Object.prototype.hasOwnProperty.call(r, rk) && r[rk] != null) sr[rk] = r[rk];
        }
        if (r.usage) sr.usage = r.usage;
        if (r.error) sr.error = r.error;
        if (r.cost != null) sr.cost = r.cost;
        if (r.cost_details) sr.cost_details = r.cost_details;
        if (Array.isArray(r.output)) sr._output_items_count = r.output.length;
        if (Array.isArray(r.tools)) sr._tools_count = r.tools.length;
        slim.response = sr;
      }
      var out = JSON.stringify(slim);
      if (out.length > TM_RAW_SEG_MAX_CHARS) {
        // Absolute backstop: hard truncate the skeleton itself.
        out = out.slice(0, TM_RAW_SEG_MAX_CHARS - 40) + '... [tm_slim_truncated]';
      }
      return out;
    } catch (e) {
      // On any parse/shape surprise, fall back to a bounded head of the original string.
      return String(jsonStr).slice(0, TM_RAW_SEG_MAX_CHARS - 40) + '... [tm_slim_fallback_truncated]';
    }
  }

                  if (hit) { usageSegments.push(tmSlimRawSegment(jsonStr)); }
                } catch (parseErr) {}
              }
              if (usageSegments.length > 0) { patch.response_usage_segments = usageSegments; }
              if (lastUsage) { patch.response_usage = lastUsage; }
              if (anthropicUsage) { patch.response_anthropic_usage = anthropicUsage; }
              if (sseProvider) { patch.response_provider = sseProvider; }
              // HTTP errors sometimes return plain text or nonstandard SSE with no JSON `error`.
              // Preserve that exact bounded body rather than recording only status:false.
              if (capHadError && !patch.error) {
                patch.error = tmBuildCapturedProviderError(s, response.status, 'http-text');
              }
            } catch (usageErr) {}
          }
          tmUpdateCaptureRecord(captureId, patch);

          // (v4.63) Feed the always-visible widget header with this (most-recent) payload's status.
          try {
            var capRec = getCaptureById(captureId);
            // (v4.211) WIDGET-FEED GATE: on ERROR responses (HTTP>=400 or an error chunk in the
            // body) the persistent widget must keep showing the LAST SUCCESSFUL turn's values.
            // capWidgetFeed gates the status rebuild, store-touch, status identity/provider
            // assignment, cache-outcome ledger write, cost accumulation, and widget render below.
            // (The capture's own _identity stamp further down stays UNGATED: the ring modal
            // and provider dropdowns want identity even on error captures.)
            var capWidgetFeed = !capHadError;
            tmMostRecentPayloadStatus = capWidgetFeed ? {
              ts: Date.now(),
              captureId: captureId,
              toolIdRepairCount: Number(capRec && capRec._tool_id_repair_count || 0),
              toolIdRepairLast: (capRec && capRec._tool_id_repair_last) || null,
              repairTally: (capRec && capRec.repair_tally) || null,
              anthropicUsage: patch.response_anthropic_usage || (capRec && capRec.response_anthropic_usage) || null,
              orUsage: patch.response_usage || (capRec && capRec.response_usage) || null,
              sessionId: (capRec && capRec.session_id) || (function() {
                try {
                  var reqBody = (capRec && capRec.stored_as_skeleton) ? capRec.body_skeleton : (capRec && capRec.body);
                  if (reqBody) return tmDeriveStableSessionId(reqBody);
                } catch (e) {}
                return null;
              })(),
              pastedSessionId: (capRec && capRec.pasted_session_id) || (function() {
                try {
                  var reqBody = (capRec && capRec.stored_as_skeleton) ? capRec.body_skeleton : (capRec && capRec.body);
                  if (reqBody) return deriveConversationIdFromBody(reqBody);
                } catch (e) {}
                return null;
              })()
            } : tmMostRecentPayloadStatus;
            // Touch any stored session-derived metadata for this session, even if this
            // particular response carries no billable cost.
            try {
              if (capWidgetFeed) tmTouchSessionScopedStores(tmMostRecentPayloadStatus.sessionId || tmMostRecentPayloadStatus.pastedSessionId, Date.now());
            } catch (e) {}
            // v4.157: Resolve + stamp identity UNCONDITIONALLY (independent of cost), so every
            // response — zero-cost, no-usage, or errored — carries a canonical identity for hue/cost.
            // Also hang it on tmMostRecentPayloadStatus so the widget uses ONE identity for both
            // hue and cost (no more mixing most-recent-response session with last-ring-entry model).
            // (v4.230) Hoist identity fields so the unconditional 12h/24h block-cost stamp below
            // can always see them (previously they were try-block locals only).
            var idSid = null, idModel = '', idHost = '', idIsProxy = false, idKey = null;
            try {
              if (capRec) {
                idSid = capRec.session_id || tmMostRecentPayloadStatus.sessionId || null;
                try { idModel = tmCaptureModel(capRec); } catch (e) {}
                try { idHost = tmExtractEndpointHost(capRec); } catch (e) {}
                try { idIsProxy = tmIsProxyCapture(capRec); } catch (e) {}
                idKey = tmBuildIdentityKey(idSid, idModel, idHost, idIsProxy);
                var identity = { sid: idSid, model: idModel, host: idHost, proxy: idIsProxy, key: idKey };
                if (capWidgetFeed) tmMostRecentPayloadStatus.identity = identity;
                // (v4.198) Carry the serving provider onto the most-recent status so the persistent
                // widget can show it next to the model name. Prefer the captured provider string;
                // fall back to the endpoint host so something useful shows for older/edge captures.
                if (capWidgetFeed) tmMostRecentPayloadStatus.provider = patch.response_provider || (capRec && capRec.response_provider) || idHost || null;
                tmUpdateCaptureRecord(captureId, { _identity: identity });
                // (Fix 16, v4.200) AUTO-STAMP provider lock. If this is a multi-provider model, the
                // response had a real provider (not an error-only chunk), and no lock exists yet for
                // this conversation identity, stamp one now. From this point on, every subsequent
                // turn hard-pins to this provider -- no more silent bouncing to a $0.65 miss.
                try {
                  var lockProvider = patch.response_provider || (capRec && capRec.response_provider) || null;
                  var lockSlug = lockProvider ? tmProviderNameToSlug(lockProvider) : null;
                  // Only stamp if the response was NOT an error (check for error-only chunks:
                  // choices is empty and error field present in response_body_head or segments).
                  var hadError = false;
                  try {
                    if (capRec && capRec.response_usage_segments) {
                      for (var si = 0; si < capRec.response_usage_segments.length; si++) {
                        try {
                          var seg = JSON.parse(capRec.response_usage_segments[si]);
                          if (seg && seg.error) { hadError = true; break; }
                        } catch (e) {}
                      }
                    }
                  } catch (e2) {}
                  if (lockSlug && !hadError && tmIsMultiProviderModel(idModel)) {
                    var existingLock = tmGetProviderLock(idKey);
                    // (v4.201 AUDIT FIX E) stamp ONLY when no lock exists. A Float lock entry EXISTS,
                    // so this single check simultaneously (a) never overwrites a real lock and
                    // (b) never re-stamps after the user chose Float. GLM's '__auto' sentinel was
                    // dead code -- nothing ever stores it.
                    if (!existingLock) {
                      tmSetProviderLock(idKey, lockSlug, lockProvider, false);
                      console.log('🔒 [v' + EXT_VERSION + '] Auto-stamped provider lock: ' + lockProvider + ' (' + lockSlug + ') for ' + idKey);
                    }
                  }
                } catch (lockErr) {}
                // (v4.219) Stamp the serving-provider label onto the capture record itself, so the
                // ring-modal badge can show per-turn HISTORY instead of resolving every row through
                // the CURRENT lock (v4.214's side effect: changing the lock rewrote every historical
                // row's provider label, making per-provider hit/miss comparison impossible). Rule: a
                // pinned single provider's lock.label IS what served (allow_fallbacks:false); for
                // SET / FLOAT / no-lock the response's own provider string names what actually
                // served (for SET, the actual member). Underscore fields survive rich->compact
                // stripping (same as _model / _identity).
                try {
                  var _histProvLabel = null;
                  var _histLock = idKey ? tmGetProviderLock(idKey) : null;
                  if (_histLock && _histLock.mode !== 'set' && _histLock.slug && _histLock.slug !== '__float' && _histLock.label) {
                    _histProvLabel = _histLock.label;
                  }
                  if (!_histProvLabel) {
                    _histProvLabel = patch.response_provider || (capRec && capRec.response_provider) || idHost || null;
                  }
                  if (_histProvLabel) tmUpdateCaptureRecord(captureId, { _provider_label: _histProvLabel });
                } catch (e) {}
                // (v4.297) CONTEXT-WINDOW SNAPSHOT. Stamp this turn's provider-REPORTED token
                // totals onto the ring entry (snapshot-in-time; underscore field survives
                // rich->compact stripping). Per-entry truth regardless of error status (an errored
                // turn still consumed real context); the WIDGET dial separately identity-matches,
                // so error rows never leak into another conversation's display.
                try {
                  var _ctxUsage = patch.response_usage || (capRec && capRec.response_usage) || null;
                  var _ctxAu = patch.response_anthropic_usage || (capRec && capRec.response_anthropic_usage) || null;
                  var _ctxSnap = tmComputeCtxSnapshot(_ctxUsage, _ctxAu, idModel, capRec);
                  if (_ctxSnap) tmUpdateCaptureRecord(captureId, { _ctx_snapshot: _ctxSnap });
                } catch (eCtx) {}
                // v4.169: Record cache hit/miss for the identity ledger, then attach to status.
                // (v4.211) GATED: an error response is NOT a cache miss -- it must not break the
                // hit streak or inflate the miss total, so the ledger is never touched on errors.
                if (capWidgetFeed) try {
                  var cacheHit = tmIsSignificantCacheHit(capRec);
                  var cacheStats = tmRecordIdentityCacheOutcome(idSid, idModel, idHost, idIsProxy, cacheHit);
                  tmMostRecentPayloadStatus.cacheHit = cacheHit;
                  tmMostRecentPayloadStatus.cacheStats = cacheStats;
                  tmUpdateCaptureRecord(captureId, { _cache_hit: cacheHit });
                } catch (e) {}
              }
            } catch (e) {}
            // (v4.270) PROMPT-INGESTION MISMATCH (generic, heuristic). Runs for EVERY provider
            // (not just Gemini) once response_usage is stamped above. Compares the exact outbound
            // byte count against the provider-reported prompt tokens; a sub-50% ratio means far
            // fewer tokens reached the model than the payload size predicts -- possibly silently
            // dropped / transformed content. Soft warning (code 'prompt_ingestion_mismatch'); it
            // does NOT assert data was dropped, only that the counts diverge suspiciously. The
            // widget banner is recomputed from the ring at render time; here we only persist the
            // warning onto the ring entry so it survives reload and shows in the modal row.
            try {
              var capForMismatch = getCaptureById(captureId);
              var mmWarn = tmDetectPromptIngestionMismatch(capForMismatch);
              if (mmWarn) {
                var mmArr = (capForMismatch && Array.isArray(capForMismatch._warnings)) ? capForMismatch._warnings.slice() : [];
                var mmId = 'prompt_ingestion_mismatch:' + captureId;
                var mmDup = false;
                for (var mmi = 0; mmi < mmArr.length; mmi++) { if (mmArr[mmi] && mmArr[mmi].id === mmId) { mmDup = true; break; } }
                if (!mmDup) {
                  mmWarn.id = mmId;
                  mmArr.push(mmWarn);
                  tmUpdateCaptureRecord(captureId, { _warnings: mmArr });
                  console.warn('\uD83D\uDEA8 [v' + EXT_VERSION + '] Prompt-ingestion mismatch: reported ' + mmWarn.details.reported_prompt_tokens + ' prompt tokens vs ~' + mmWarn.details.estimated_prompt_tokens + ' estimated (' + Math.round(mmWarn.details.reported_to_estimated_ratio * 100) + '%). Investigate possible silent content drop.');
                }
              }
            } catch (eMm) {}

            // (v4.72) Accumulate per-turn cost into the running total.
            // (v4.218) UNGATED: error responses can carry real usage/cost (e.g. a 502 streamed
            // error with upstream_inference_cost). The tokens were consumed and the provider
            // charged for them regardless of error status. Widget STATUS rebuild and cache-ledger
            // write stay gated on capWidgetFeed (above), but cost accumulation must not be.
            // Read from the CURRENT capture's patch (not tmMostRecentPayloadStatus, which keeps
            // the last successful turn's values on error).
            try {
              var errTurnCost = tmExtractCostVal(patch.response_anthropic_usage, patch.response_usage);
              if (errTurnCost > 0) {
                tmSetTotalCost(tmGetTotalCost() + errTurnCost);
                try {
                  if (capRec) {
                    var errSessionTotal = tmRecordSessionCost(idSid, idModel, idHost, idIsProxy, errTurnCost);
                    var errCostStamp = { _model: idModel };
                    if (errSessionTotal > 0) errCostStamp.session_cost_total = errSessionTotal;
                    tmUpdateCaptureRecord(captureId, errCostStamp);
                  }
                } catch (e) {}
              }
            } catch (e) {}
            // Also accumulate cost on successful responses (original path, gated).
            if (capWidgetFeed) try {
              var turnCost = tmExtractCostVal(tmMostRecentPayloadStatus.anthropicUsage, tmMostRecentPayloadStatus.orUsage);
              if (turnCost > 0) {
                // Avoid double-counting: the ungated block above already recorded this cost.
                // Only record if the ungated block missed it (e.g. patch had no usage but
                // tmMostRecentPayloadStatus did from a prior capture in this same response).
                var alreadyRecorded = (patch.response_usage && tmExtractCostVal(null, patch.response_usage) === turnCost) ||
                                      (patch.response_anthropic_usage && tmExtractCostVal(patch.response_anthropic_usage, null) === turnCost);
                if (!alreadyRecorded) {
                  tmSetTotalCost(tmGetTotalCost() + turnCost);
                  try {
                    if (capRec) {
                      var newSessionTotal = tmRecordSessionCost(idSid, idModel, idHost, idIsProxy, turnCost);
                      var okCostStamp = { _model: idModel };
                      if (newSessionTotal > 0) okCostStamp.session_cost_total = newSessionTotal;
                      tmUpdateCaptureRecord(captureId, okCostStamp);
                    }
                  } catch (e) {}
                }
              }
            } catch (e) {}
            // (v4.233) Client-side cost calculation from the global cost table.
            // If no cost was returned by the API, look up the model+provider in the cost table
            // and calculate cost from token usage × pricing. Three flags are stamped on the
            // ring buffer entry: _cost_calculated, _cost_no_usage, _cost_init_needed.
            try {
              var apiTurnCost = tmExtractCostVal(
                (capWidgetFeed ? tmMostRecentPayloadStatus.anthropicUsage : patch.response_anthropic_usage),
                (capWidgetFeed ? tmMostRecentPayloadStatus.orUsage : patch.response_usage)
              );
              if (apiTurnCost == 0 && capRec && idModel) {
                var tcModel = String(idModel).toLowerCase().replace(/:(nitro|floor|free)$/i, '');
                var tcProvider = tmObservedProviderKey(capRec);

                if (tcProvider) {
                  var tcEntry = tmGetProviderCostEntry(tcModel, tcProvider);
                  var tcPopulated = tmIsCostEntryPopulated(tcEntry);

                  if (!tcPopulated) {
                    // Entry doesn't exist or has all zeros — ensure entry exists, set init flag
                    if (!tmGetProviderCosts()[tcModel + '::' + tcProvider]) {
                      var tcCosts = tmGetProviderCosts();
                      tcCosts[tcModel + '::' + tcProvider] = { input: 0, output: 0, cache_read: 0, cache_write: null };
                      tmSaveProviderCosts(tcCosts);
                    }
                    tmUpdateCaptureRecord(captureId, { _cost_init_needed: true });
                  } else {
                    // Entry is populated — try to calculate cost from token usage
                    // (v4.234) Fall back to response_anthropic_usage for direct-Anthropic providers
                    var tcUsage = patch.response_usage || (capRec && capRec.response_usage) || patch.response_anthropic_usage || (capRec && capRec.response_anthropic_usage) || null;
                    if (tcUsage) {
                      var tcResult = tmCalculateCostFromTable(tcUsage, tcEntry);
                      if (tcResult.cost != null && tcResult.cost > 0) {
                        tmSetTotalCost(tmGetTotalCost() + tcResult.cost);
                        try {
                          var tcSessionTotal = tmRecordSessionCost(idSid, idModel, idHost, idIsProxy, tcResult.cost);
                          var tcCostStamp = { _model: idModel, _cost_calculated: true, _table_cost: tcResult.cost, _cost_pricing_used: tcEntry };
                          if (tcSessionTotal > 0) tcCostStamp.session_cost_total = tcSessionTotal;
                          tmUpdateCaptureRecord(captureId, tcCostStamp);
                          // (v4.236) Stamp table cost onto the status object for the widget flashpoint.
                          if (capWidgetFeed) { try { tmMostRecentPayloadStatus.tableCost = tcResult.cost; } catch (e2) {} }
                        } catch (e) {}
                      } else if (tcResult.reason === 'no_usage') {
                        tmUpdateCaptureRecord(captureId, { _cost_no_usage: true });
                      }
                    } else {
                      tmUpdateCaptureRecord(captureId, { _cost_no_usage: true });
                    }
                  }
                }
              }
            } catch (e) {}
            // (v4.230) ALWAYS snapshot 12h/24h block costs when identity is known — independent
            // of hit/miss, and independent of whether this turn added a new cost delta. Previously
            // these were only written inside the turnCost>0 branches, so some miss/zero-delta rows
            // never received the fields. Runs AFTER cost accumulation so the current turn's usage
            // is already on the ring entry that tmComputeBlockCost walks.
            try {
              if (capRec && idKey) {
                var blockStart = tmGetCurrentBlockStart();
                tmUpdateCaptureRecord(captureId, {
                  _cost_12h: tmComputeBlockCost(idKey, blockStart),
                  _cost_24h: tmComputeBlockCost(idKey, blockStart - (12 * 60 * 60 * 1000))
                });
              }
            } catch (e) {}
            if (capWidgetFeed) renderGpt51UsageWidget();
          } catch (e) {}
        },
        function(err) {
          tmUpdateCaptureRecord(captureId, { response_body_parse_error: String(err && err.message ? err.message : err) });
        }
      );
    } catch (e) {
      tmUpdateCaptureRecord(captureId, { response_body_parse_error: String(e && e.message ? e.message : e) });
    }
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmExportPayloadCapturesToClipboard-vb49,
  //   role=__lambdao_1.tmExportPayloadCapturesToClipboard,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Copies the full ring buffer JSON to the clipboard (the window._payloadExtDebug.exportCapturesToClipboard path).,
  // ]
  function tmExportPayloadCapturesToClipboard() {
    const ring = tmReadCaptureRing();
    const json = JSON.stringify(ring, null, 2);

    try {
      localStorage.setItem(TM_PAYLOAD_CAPTURE_EXPORT_KEY, json);
    } catch (e) {
      console.warn('⚠️ [v' + EXT_VERSION + '] Failed to save payload capture export to localStorage:', e);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(json).then(
        function() {
          console.log('✅ [v' + EXT_VERSION + '] Copied payload captures to clipboard (' + ring.length + ' entries).');
        },
        function(err) {
          console.warn('⚠️ [v' + EXT_VERSION + '] Clipboard write failed for payload captures:', err);
        }
      );
    }

    console.warn('⚠️ [v' + EXT_VERSION + '] Clipboard API not available. Read from localStorage key: ' + TM_PAYLOAD_CAPTURE_EXPORT_KEY);
  }

  function tmClearPayloadCaptures() {
    try {
      localStorage.removeItem(TM_PAYLOAD_CAPTURE_RING_KEY);
    } catch (e) {}
  }

  window._payloadExtDebug = {
    // Existing
    getLastSeenConv: () => lastSeenConversation,
    getAnthropicBody: () => lastAnthropicBodyForExport,
    getGeminiBody: () => lastGeminiBodyForExport,
    getGrokBody: () => lastGrokBodyForExport,
    getGpt51Body: () => lastGpt51BodyForExport,

    // NEW: always-on payload capture ring buffer
    getCaptures: () => tmReadCaptureRing(),
    exportCapturesToClipboard: () => tmExportPayloadCapturesToClipboard(),
    clearCaptures: () => tmClearPayloadCaptures(),
    testOversizedToolGuard: (body) => {
      var clone = JSON.parse(JSON.stringify(body));
      return { body: clone, report: tmApplyOversizedToolResultGuard(clone) };
    },
    queueAutoContinue: (sessionId, reason) => tmQueueAutoContinue(sessionId, reason || 'manual_debug'),
    getAgentManagementState: () => JSON.parse(JSON.stringify(tmAgentManagementSessions || {})),
    setAgentManagementEnabled: (enabled) => tmSetAgentManagementEnabled(!!enabled),
    runAgentManagementSweep: () => tmRunAgentManagementSweep(),
    inspectManagedDom: () => tmVisibleToolExecutionSnapshot(),
    classifyContinuityObject: (obj) => {
      var state = { textTail: '', transientError: null, sawToolCall: false, sawAnyData: false };
      tmInspectContinuityObject(obj, state);
      return { sawToolCall: state.sawToolCall, sawAnyData: state.sawAnyData, transientError: state.transientError };
    }
  };

  // ==================== PAYLOAD ANALYSIS HELPERS ====================

  function analyzeToolComparison(body, fileId) {
    const report = [];
    report.push('PAYLOAD ANALYSIS - Tool Call Comparison');
    report.push('Generated: ' + new Date().toISOString());
    report.push('File ID: ' + fileId);
    report.push('');
    report.push('=== TOOL CALL SUMMARY (Last 10 Messages) ===');
    report.push('');

    const messages = body.messages || [];
    const last10 = messages.slice(-10);

    const editFileCalls = [];
    const workflowyCalls = [];

    last10.forEach((msg, idx) => {
      if (msg.role === 'assistant' && msg.content && Array.isArray(msg.content)) {
        msg.content.forEach(block => {
          if (block.type === 'tool_use') {
            if (block.name === 'edit_file') {
              const editCount = block.input?.edits?.length || 0;
              editFileCalls.push({ messageIndex: idx, editCount });
            } else if (block.name === 'workflowy_create_node') {
              workflowyCalls.push({ messageIndex: idx });
            }
          }
        });
      }
    });

    report.push('edit_file calls: ' + editFileCalls.length + ' total');
    if (editFileCalls.length > 0) {
      editFileCalls.forEach((call, i) => {
        report.push(`  - Call ${i + 1}: ${call.editCount} edit${call.editCount !== 1 ? 's' : ''} in array`);
      });
      const totalEdits = editFileCalls.reduce((sum, call) => sum + call.editCount, 0);
      report.push(`  Total edit operations: ${totalEdits}`);
    }
    report.push('');

    report.push('workflowy_create_node calls: ' + workflowyCalls.length + ' total');
    report.push('');

    report.push('=== COMPARISON ===');
    if (editFileCalls.length > 0) {
      const totalEdits = editFileCalls.reduce((sum, call) => sum + call.editCount, 0);
      const avgEdits = (totalEdits / editFileCalls.length).toFixed(1);
      report.push(`edit_file: ${editFileCalls.length} tool calls, ${totalEdits} operations (avg ${avgEdits} ops/call)`);
    }
    report.push(`workflowy_create_node: ${workflowyCalls.length} tool calls, ${workflowyCalls.length} operations (1 op/call)`);
    report.push('');
    report.push('=== PATTERNS ===');
    if (editFileCalls.length > 0) {
      report.push('edit_file: Batches multiple edits per call');
    }
    if (workflowyCalls.length > 0) {
      report.push('workflowy_create_node: One node per call, but many calls can be in parallel');
    }

    const reportText = report.join('\n');
    localStorage.setItem('debug_payload_analysis_' + fileId, reportText);

    console.log('📊 [DEBUG] Analysis complete - saved to localStorage with key:', 'debug_payload_analysis_' + fileId);
    console.log('📋 Report preview:');
    console.log(reportText);

    return reportText;
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.checkForDebugTrigger-ax34,
  //   role=__lambdao_1.checkForDebugTrigger,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Fix 3: detects the DEBUG trigger in an outbound payload and runs payload analysis.,
  // ]
  function checkForDebugTrigger(body) {
    if (!body.messages || body.messages.length === 0) return null;

    const lastMessage = body.messages[body.messages.length - 1];
    if (lastMessage.role !== 'user') return null;

    let userText = '';
    if (typeof lastMessage.content === 'string') {
      userText = lastMessage.content;
    } else if (Array.isArray(lastMessage.content)) {
      const textBlocks = lastMessage.content.filter(block => block.type === 'text');
      userText = textBlocks.map(block => block.text).join(' ');
    }

    const triggerMatch = userText.match(/@\[DEBUG-(.+)-([^-\]]+)\]/);
    if (triggerMatch) {
      return {
        command: triggerMatch[1],
        fileId: triggerMatch[2]
      };
    }

    return null;
  }

  // ==================== GPT-5.1 CONVERSATION ID & USAGE WIDGET HELPERS ====================

  // (v4.250) Gemini-native bodies do NOT use messages[]/system: they carry `contents[]` (roles
  // 'user' and 'model', with text under parts[].text) plus `systemInstruction`. Both session-id
  // tiers below scanned only messages[]/input[], so every Gemini capture derived session_id = null
  // -- which silently disabled the session-cost ledger (tmRecordSessionCost bails on a falsy
  // sessionId) AND left no session hash to display or click. This normalizes a Gemini body onto the
  // {role, content:string} shape those scanners already understand, so both tiers work unchanged.
  // Kept deliberately read-only and total: it never mutates the body and returns [] for any
  // non-Gemini shape, so callers can try it as a pure fallback.
  function tmNormalizeGeminiBodyToMessages(body) {
    var out = [];
    try {
      if (!body) return out;
      // Text of a Gemini node: join every parts[].text (skipping non-text parts such as
      // thoughtSignature / inlineData / functionCall, which carry no stable conversation identity).
      function partsText(node) {
        if (!node) return '';
        if (typeof node === 'string') return node;
        if (!Array.isArray(node.parts)) return (typeof node.text === 'string') ? node.text : '';
        var acc = [];
        for (var i = 0; i < node.parts.length; i++) {
          var p = node.parts[i];
          if (p && typeof p.text === 'string' && p.text) acc.push(p.text);
        }
        return acc.join('\n');
      }
      var sysText = partsText(body.systemInstruction || body.system_instruction || null);
      if (sysText) out.push({ role: 'system', content: sysText });
      if (Array.isArray(body.contents)) {
        for (var c = 0; c < body.contents.length; c++) {
          var item = body.contents[c];
          if (!item) continue;
          // Gemini's assistant role is 'model'; an ABSENT role means user (single-turn form).
          out.push({ role: (item.role === 'model') ? 'assistant' : 'user', content: partsText(item) });
        }
      }
    } catch (e) {}
    return out;
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.deriveConversationIdFromBody-aubh,
  //   role=__lambdao_1.deriveConversationIdFromBody,
  //   slice_labels=tm-payload-cost-visibility,tm-payload-overview,
  //   kind=ast,
  //   comment=Session identity tier 1: scans first 10 user messages for 'Session ID: <hash>' line (multiline regex). Returns pasted ID or null. Understands messages[] / input[] AND (v4.250) Gemini's contents[] via tmNormalizeGeminiBodyToMessages -- returning null here cascades into a dead session-cost ledger and an unnameable session.,
  // ]
  function deriveConversationIdFromBody(body) {
    let userMessages = [];
    if (Array.isArray(body.messages)) {
      userMessages = body.messages.filter(m => m && m.role === 'user');
    } else if (Array.isArray(body.input)) {
      userMessages = body.input.filter(m => m && m.role === 'user');
    } else if (Array.isArray(body.contents)) {
      // (v4.250) Gemini-native shape. This is the tier that matters most in practice, because the
      // pasted 'Session ID: ...' line lives in the first user turn -- so once Gemini bodies are
      // scanned, Gemini sessions get the SAME human-chosen id as every other provider.
      userMessages = tmNormalizeGeminiBodyToMessages(body).filter(m => m && m.role === 'user');
    }
    if (!userMessages.length) return null;

    // (v4.83) Primary: scan all user messages for a line containing "Session ID: <hash>".
    // This replaces the obsolete "load files" / "CONVERSATION IDENTITY:" patterns.
    // IMPORTANT: Dan's first message often has other text before the ID, e.g.
    //   Load GLIMPSE\n\nSession ID: cd02b901
    // so this must be a multiline line-scan, NOT a whole-message startsWith() check.
    const maxToScan = Math.min(userMessages.length, 10);

    for (let i = 0; i < maxToScan; i++) {
      const msg = userMessages[i];
      let text = '';
      if (typeof msg.content === 'string') {
        text = msg.content;
      } else if (Array.isArray(msg.content)) {
        const textBlocks = msg.content.filter(
          block => block && (block.type === 'text' || block.type === 'input_text')
        );
        text = textBlocks.map(block => block.text || '').join('\n');
      }

      const m = String(text || '').match(/^\s*Session\s+ID\s*:\s*([^\s`]+)/im);
      if (m && m[1]) {
        let id = String(m[1]).trim();
        // Be tolerant of Markdown/backtick punctuation around pasted snippets.
        id = id.replace(/^`+|`+$/g, '').replace(/[.,;:]+$/g, '');
        if (id) return id.length > 128 ? id.slice(0, 128) : id;
      }
    }

    return null;
  }

  function getGpt51UsageStore() {
    try {
      const raw = localStorage.getItem('gpt51_conv_usage');
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.warn('⚠️ [v' + EXT_VERSION + '] Failed to parse gpt51_conv_usage from localStorage:', e);
      return {};
    }
  }

  function saveGpt51UsageStore(store) {
    try {
      localStorage.setItem('gpt51_conv_usage', JSON.stringify(store));
    } catch (e) {
      console.warn('⚠️ [v' + EXT_VERSION + '] Failed to save gpt51_conv_usage to localStorage:', e);
    }
  }

  // @carto-group id=client-group-4 label="Client group 4"

  // @beacon[
  //   id=auto-beacon@__lambdao_1.updateGpt51Usage-ambz,
  //   role=__lambdao_1.updateGpt51Usage,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Per-conversation GPT-5.1 usage/cost accumulator (gpt51_conv_usage store); drives the widget's context-%-of-limit readout.,
  // ]
  function updateGpt51Usage(convId, usage) {
    if (!convId || !usage) return;
    const store = getGpt51UsageStore();
    const stats = store[convId] || { input: 0, cached: 0, output: 0, total: 0, cost: 0 };

    const input = usage.input_tokens || 0;
    const cached = (usage.input_tokens_details && usage.input_tokens_details.cached_tokens) || 0;
    const output = usage.output_tokens || 0;
    const total = usage.total_tokens || (input + output);

    const nonCached = Math.max(0, input - cached);
    const turnCost =
      nonCached * GPT51_PRICING.INPUT_NONCACHED_PER_TOKEN +
      cached * GPT51_PRICING.INPUT_CACHED_PER_TOKEN +
      output * GPT51_PRICING.OUTPUT_PER_TOKEN;

    const contextPct = GPT51_CONTEXT_LIMIT > 0 ? (input / GPT51_CONTEXT_LIMIT * 100) : 0;

    stats.input += input;
    stats.cached += cached;
    stats.output += output;
    stats.total += total;
    stats.cost = (stats.cost || 0) + turnCost;
    stats.lastContextInput = input;
    stats.lastContextPct   = contextPct;
    stats.hidden = false; // ensure conversation reappears in widget once new usage arrives
    stats._session_id = convId;
    stats._ts = Date.now();

    store[convId] = stats;
    saveGpt51UsageStore(store);
    renderGpt51UsageWidget();
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.exportAnthropicConversationToClipboard-rmip,
  //   role=__lambdao_1.exportAnthropicConversationToClipboard,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Clean-JSON continuity export: user/assistant text only, tool blocks + thinking stripped, ~1/10th token size for ARC handoffs.,
  // ]
  function exportAnthropicConversationToClipboard() {
    if (!lastAnthropicBodyForExport || !Array.isArray(lastAnthropicBodyForExport.messages)) {
      alert('No Anthropic conversation available to export yet.');
      return;
    }

    const srcMessages = lastAnthropicBodyForExport.messages;
    const filtered = [];

    srcMessages.forEach(msg => {
      if (!msg || (msg.role !== 'user' && msg.role !== 'assistant')) return;
      const originalContent = msg.content;
      const newMsg = { role: msg.role };

      if (typeof originalContent === 'string') {
        const t = originalContent.trim();
        if (!t) return;
        newMsg.content = t;
      } else if (Array.isArray(originalContent)) {
        const textBlocks = originalContent.filter(
          b => b && b.type === 'text' && typeof b.text === 'string' && b.text.trim() !== ''
        );
        if (!textBlocks.length) return;
        const combined = textBlocks.map(b => b.text).join('\n\n');
        const t = combined.trim();
        if (!t) return;
        newMsg.content = t;
      } else {
        return;
      }

      filtered.push(newMsg);
    });

    const exportObj = {
      model: lastAnthropicBodyForExport.model || null,
      created_at: new Date().toISOString(),
      messages: filtered
    };

    const json = JSON.stringify(exportObj, null, 2);

    try {
      localStorage.setItem('tm_export_conversation_last', json);
    } catch (e) {
      console.warn('⚠️ [v' + EXT_VERSION + '] Failed to save tm_export_conversation_last to localStorage:', e);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json).then(
        function() {
          alert('Exported Anthropic conversation (user+assistant only) to clipboard.');
        },
        function(err) {
          console.warn('⚠️ [v' + EXT_VERSION + '] Clipboard write failed for export:', err);
          alert('Export prepared (user+assistant only), but clipboard write failed. See console/localStorage.');
        }
      );
    } else {
      alert('Export prepared (user+assistant only). Retrieve from localStorage key: tm_export_conversation_last.');
    }
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.exportGeminiConversationToClipboard-c8oz,
  //   role=__lambdao_1.exportGeminiConversationToClipboard,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Gemini variant of the clean-JSON continuity export.,
  // ]
  function exportGeminiConversationToClipboard() {
    if (!lastGeminiBodyForExport || !Array.isArray(lastGeminiBodyForExport.contents)) {
      alert('No Gemini conversation available to export yet.');
      return;
    }

    const srcContents = lastGeminiBodyForExport.contents;
    const filtered = [];

    srcContents.forEach(entry => {
      if (!entry || (entry.role !== 'user' && entry.role !== 'model')) return;
      if (!Array.isArray(entry.parts)) return;

      const texts = entry.parts
        .filter(p => p && typeof p.text === 'string' && p.text.trim() !== '')
        .map(p => p.text.trim());

      if (!texts.length) return;

      const combined = texts.join('\n\n').trim();
      if (!combined) return;

      filtered.push({
        role: entry.role === 'model' ? 'assistant' : 'user',
        content: combined
      });
    });

    const exportObj = {
      model: lastGeminiBodyForExport.model || null,
      created_at: new Date().toISOString(),
      messages: filtered
    };

    const json = JSON.stringify(exportObj, null, 2);

    try {
      localStorage.setItem('tm_export_gemini_conversation_last', json);
    } catch (e) {
      console.warn('⚠️ [v' + EXT_VERSION + '] Failed to save tm_export_gemini_conversation_last to localStorage:', e);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json).then(
        function() {
          alert('Exported Gemini conversation (user+assistant only) to clipboard.');
        },
        function(err) {
          console.warn('⚠️ [v' + EXT_VERSION + '] Clipboard write failed for Gemini export:', err);
          alert('Gemini export prepared (user+assistant only), but clipboard write failed. See console/localStorage.');
        }
      );
    } else {
      alert('Gemini export prepared (user+assistant only). Retrieve from localStorage key: tm_export_gemini_conversation_last.');
    }
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.exportGpt51ConversationToClipboard-25wd,
  //   role=__lambdao_1.exportGpt51ConversationToClipboard,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=OpenAI/GPT-5.1 variant of the clean-JSON continuity export.,
  // ]
  function exportGpt51ConversationToClipboard() {
    if (!lastGpt51BodyForExport || !Array.isArray(lastGpt51BodyForExport.input)) {
      alert('No GPT-5.1 conversation available to export yet.');
      return;
    }

    const src = lastGpt51BodyForExport.input;
    const filtered = [];

    src.forEach(entry => {
      if (!entry || (entry.role !== 'user' && entry.role !== 'assistant')) return;

      const content = entry.content;
      if (typeof content === 'string') {
        const t = content.trim();
        if (!t) return;
        filtered.push({ role: entry.role, content: t });
        return;
      }

      if (Array.isArray(content)) {
        const texts = content
          .filter(p => p && typeof p.text === 'string' && p.text.trim() !== '')
          .map(p => p.text.trim());
        if (!texts.length) return;
        const combined = texts.join('\n\n').trim();
        if (!combined) return;
        filtered.push({
          role: entry.role,
          content: combined,
        });
      }
    });

    if (!filtered.length) {
      alert('No user/assistant messages found to export for GPT-5.1.');
      return;
    }

    const exportObj = {
      model: lastGpt51BodyForExport.model || null,
      created_at: new Date().toISOString(),
      messages: filtered,
    };

    const json = JSON.stringify(exportObj, null, 2);

    try {
      localStorage.setItem('tm_export_gpt51_conversation_last', json);
    } catch (e) {
      console.warn('⚠️ [v' + EXT_VERSION + '] Failed to save tm_export_gpt51_conversation_last to localStorage:', e);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json).then(
        function() {
          alert('Exported GPT-5.1 conversation (user+assistant only) to clipboard.');
        },
        function(err) {
          console.warn('⚠️ [v' + EXT_VERSION + '] Clipboard write failed for GPT-5.1 export:', err);
          alert('GPT-5.1 export prepared (user+assistant only), but clipboard write failed. See console/localStorage.');
        }
      );
    } else {
      alert('GPT-5.1 export prepared (user+assistant only). Retrieve from localStorage key: tm_export_gpt51_conversation_last.');
    }
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.exportGrokConversationToClipboard-czfu,
  //   role=__lambdao_1.exportGrokConversationToClipboard,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Grok variant of the clean-JSON continuity export.,
  // ]
  function exportGrokConversationToClipboard() {
    if (!lastGrokBodyForExport || !Array.isArray(lastGrokBodyForExport.messages)) {
      alert('No Grok conversation available to export yet.');
      return;
    }

    const src = lastGrokBodyForExport.messages;
    const filtered = [];

    src.forEach(entry => {
      if (!entry || (entry.role !== 'user' && entry.role !== 'assistant')) return;

      const content = entry.content;
      if (typeof content === 'string') {
        const t = content.trim();
        if (!t) return;
        filtered.push({ role: entry.role, content: t });
        return;
      }

      if (Array.isArray(content)) {
        const texts = content
          .filter(p => p && typeof p.text === 'string' && p.text.trim() !== '')
          .map(p => p.text.trim());
        if (!texts.length) return;
        const combined = texts.join('\n\n').trim();
        if (!combined) return;
        filtered.push({
          role: entry.role,
          content: combined,
        });
      }
    });

    if (!filtered.length) {
      alert('No user/assistant messages found to export for Grok.');
      return;
    }

    const exportObj = {
      model: lastGrokBodyForExport.model || null,
      created_at: new Date().toISOString(),
      messages: filtered,
    };

    const json = JSON.stringify(exportObj, null, 2);

    try {
      localStorage.setItem('tm_export_grok_conversation_last', json);
    } catch (e) {
      console.warn('⚠️ [v' + EXT_VERSION + '] Failed to save tm_export_grok_conversation_last to localStorage:', e);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json).then(
        function() {
          alert('Exported Grok conversation (user+assistant only) to clipboard.');
        },
        function(err) {
          console.warn('⚠️ [v' + EXT_VERSION + '] Clipboard write failed for Grok export:', err);
          alert('Grok export prepared (user+assistant only), but clipboard write failed. See console/localStorage.');
        }
      );
    } else {
      alert('Grok export prepared (user+assistant only). Retrieve from localStorage key: tm_export_grok_conversation_last.');
    }
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.ensureGpt51UsageWidget-0ti9,
  //   role=__lambdao_1.ensureGpt51UsageWidget,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Builds the persistent upper-right widget DOM (status rows, Trunc input, Gemini repair toggle, routing dropdown, session name/copy controls) and wires all click handlers.,
  // ]
  function ensureGpt51UsageWidget() {
    let el = document.getElementById('gpt51-usage-widget');
    if (!el) {
      // (v4.292) One shared animation definition for the narrow management-mode offshoot.
      // The offshoot itself is rebuilt with the widget's innerHTML, but this style node is stable.
      try {
        if (!document.getElementById('tm-agent-management-style')) {
          var mgStyle = document.createElement('style');
          mgStyle.id = 'tm-agent-management-style';
          mgStyle.textContent = '@keyframes tmAgentManagePulse{0%,100%{box-shadow:0 0 0 0 rgba(255,70,70,.25)}50%{box-shadow:0 0 0 7px rgba(255,70,70,.55)}}';
          document.head.appendChild(mgStyle);
        }
      } catch (e) {}
      el = document.createElement('div');
      el.id = 'gpt51-usage-widget';
      el.style.position = 'fixed';
      el.style.top = '19px'; // v4.196: lower 7px so superscript badges clear the menu bar
      // Move widget ~250px left from original right edge position
      el.style.right = '262px';
      el.style.zIndex = '99999';
      el.style.background = 'rgba(0,0,0,0.80)';
      el.style.color = '#fff';
      el.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      // Bump base font size one notch
      el.style.fontSize = '12px';
      el.style.padding = '2px 8px'; // v4.195: shave ~20px height (was 6px vertical)
      el.style.borderRadius = '4px';
      el.style.maxWidth = '385px';
      el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.35)';
      el.style.pointerEvents = 'auto';
      el.style.cursor = 'default';
      el.style.whiteSpace = 'normal';
      el.style.lineHeight = '1.15'; // v4.195: shave ~20px height (was 1.3)
      const storedCollapsed = localStorage.getItem('gpt51_widget_collapsed');
      if (storedCollapsed === 'true' || storedCollapsed === 'false') {
        el.dataset.collapsed = storedCollapsed;
      }
      document.body.appendChild(el);

      el.addEventListener('click', function(ev) {
        const target = ev.target;
        if (target && target.dataset) {
          // Toggle entire widget collapsed/expanded
          if (target.dataset.action === 'toggle-widget') {
            const widget = ensureGpt51UsageWidget();
            const currentlyCollapsed = widget.dataset.collapsed === 'true';
            const nextState = !currentlyCollapsed;
            widget.dataset.collapsed = String(nextState);
            try {
              localStorage.setItem('gpt51_widget_collapsed', widget.dataset.collapsed);
            } catch (e) {
              console.warn('⚠️ [v' + EXT_VERSION + '] Failed to save gpt51_widget_collapsed to localStorage:', e);
            }
            renderGpt51UsageWidget();
            ev.stopPropagation();
            return;
          }

          // (v4.292) Explicit walk-away agent-management mode. The mode is persisted so a
          // TypingMind refresh cannot silently disarm an unattended run; response suspicion stays
          // memory-only and is rebuilt naturally from subsequent network traffic.
          if (target.dataset.action === 'toggle-agent-management') {
            tmSetAgentManagementEnabled(!tmAgentManagementEnabled());
            ev.stopPropagation();
            ev.preventDefault();
            return;
          }

          // Open payload tool filter modal
          if (target.dataset.action === 'open-payload-modal') {
            openPayloadModal();
            ev.stopPropagation();
            return;
          }

          // Open payload capture modal (ring buffer summary + per-entry copy)
          if (target.dataset.action === 'open-payload-capture-modal') {
            openPayloadCaptureModal();
            ev.stopPropagation();
            return;
          }

          // Truncation limit change
          if (target.dataset.action === 'set-truncation-limit') {
            const newVal = target.value;
            tmSetTruncationLimit(newVal);
            ev.stopPropagation();
            return;
          }

          // Clear ALL GPT-5.1 tracked conversations
          if (target.dataset.action === 'clear-gpt51-conversations') {
            const ok = confirm('Clear ALL tracked GPT-5.1 conversations from this widget?');
            if (ok) {
              try { localStorage.removeItem('gpt51_conv_usage'); } catch (e) {}
              renderGpt51UsageWidget();
            }
            ev.stopPropagation();
            return;
          }
          
          // TOGGLE GEMINI REPAIR (v4.24)
          if (target.dataset.action === 'toggle-gemini-repair') {
            const enabled = localStorage.getItem('tm_gemini_repair_enabled') !== 'false';
            localStorage.setItem('tm_gemini_repair_enabled', String(!enabled));
            alert('Gemini Repair is now: ' + (!enabled ? 'ENABLED' : 'DISABLED'));
            ev.stopPropagation();
            return;
          }
          // (v4.162) Sol reasoning effort dropdown — handled by the 'change' listener (v4.228),
          // NOT on click (see set-provider-routing note below for the flash-close rationale).
          if (target.dataset.action === 'set-sol-reasoning-effort') {
            return;
          }
          // (Fix 17, v4.202) Open the error popup with the full raw error JSON.
          if (target.dataset.action === 'open-error-popup') {
            try { tmShowErrorPopup(); } catch (e) {}
            ev.stopPropagation();
            return;
          }
          // (v4.236) Dismiss the persistent 'endpoint not found' banner.
          if (target.dataset.action === 'dismiss-endpoint-not-found') {
            tmEndpointNotFound = null;
            try { renderGpt51UsageWidget(); } catch (e) {}
            ev.stopPropagation();
            ev.preventDefault();
            return;
          }
          // (v4.270) Dismiss the prompt-warning banner. Request-scoped: records ONLY this exact
          // warning id, so the NEXT turn's new warning still surfaces. The ring keeps the warning
          // permanently; this only hides the persistent widget banner for the dismissed warning.
          if (target.dataset.action === 'dismiss-warning-banner') {
            try { tmDismissWarningBanner(target.dataset.warningId || ''); } catch (e) {}
            try { renderGpt51UsageWidget(); } catch (e) {}
            ev.stopPropagation();
            ev.preventDefault();
            return;
          }
          // (Fix 16, v4.200) Provider routing dropdown — handled by the 'change' listener
          // (v4.228), NOT on click. Clicking a <select> to OPEN it also dispatches a click
          // whose target.value is the PRE-change value; when a provider is already locked that
          // value is non-empty, so acting here re-applied the lock and re-rendered the widget,
          // destroying the <select> DOM and flash-closing the native popup instantly.
          if (target.dataset.action === 'set-provider-routing') {
            return;
          }
          // Close (hide) a specific conversation from the list
          if (target.dataset.convId) {
            const convId = target.dataset.convId;
            const store = getGpt51UsageStore();
            const stats = store[convId] || {};
            // Mark as hidden instead of deleting so stats persist and can be revived on next message
            stats.hidden = true;
            store[convId] = stats;
            saveGpt51UsageStore(store);
            renderGpt51UsageWidget();
            ev.stopPropagation();
            return;
          }
          // Export Anthropic conversation (user+assistant-only JSON)
          if (target.dataset.action === 'export-anthropic-conversation') {
            exportAnthropicConversationToClipboard();
            ev.stopPropagation();
            return;
          }
          // Export Gemini conversation (user+assistant-only JSON)
          if (target.dataset.action === 'export-gemini-conversation') {
            exportGeminiConversationToClipboard();
            ev.stopPropagation();
            return;
          }
          // Export Grok conversation (user+assistant-only JSON)
          if (target.dataset.action === 'export-grok-conversation') {
            exportGrokConversationToClipboard();
            ev.stopPropagation();
            return;
          }
          // Export GPT-5.1 conversation (user+assistant-only JSON)
          if (target.dataset.action === 'export-gpt51-conversation') {
            exportGpt51ConversationToClipboard();
            ev.stopPropagation();
            return;
          }
          // Toggle visibility of "other" conversations (collapsible region)
          if (target.dataset.toggle === 'others') {
            const widget = ensureGpt51UsageWidget();
            const currentlyCollapsed = widget.dataset.othersCollapsed === 'true' || !widget.dataset.othersCollapsed;
            widget.dataset.othersCollapsed = String(!currentlyCollapsed);
            renderGpt51UsageWidget();
            ev.stopPropagation();
            return;
          }
          // (v4.72) Reset the running total cost
          if (target.dataset.action === 'reset-total-cost') {
            tmResetTotalCost();
            ev.stopPropagation();
            return;
          }
          // (v4.297) Context dial: set/clear the per-model max-context override.
          if (target.dataset.action === 'ctx-dial-set') {
            tmCtxDialPromptSet(target.dataset.model || '', target.dataset.provider || '');
            ev.stopPropagation();
            ev.preventDefault();
            return;
          }
          // (v4.142) Set a human-readable name for the session from the widget.
          if (target.dataset.action === 'set-session-name') {
            var sid = target.dataset.sessionId;
            if (sid) {
              var currentName = tmGetSessionName(sid);
              tmPromptActive = true;
              var newName = prompt('Session name for ' + sid + ':', currentName || '');
              setTimeout(function() { tmPromptActive = false; }, 100);
              if (newName !== null) {
                tmSetSessionName(sid, newName);
                renderGpt51UsageWidget();
              }
            }
            ev.stopPropagation();
            return;
          }
          // (v4.80) Copy a random Session ID to clipboard (clicking the header row)
          if (target.dataset.action === 'copy-session-id' || (target.closest && target.closest('[data-action="copy-session-id"]'))) {
            var randomId = tmGenRandomSessionId();
            var sessionIdStr = 'Session ID: ' + randomId;
            copyTextToClipboard(sessionIdStr, 'Session ID');
            console.log('📋 [v' + EXT_VERSION + '] Copied to clipboard: ' + sessionIdStr);
            ev.stopPropagation();
            return;
          }
        }
      });
    }
    return el;
  }

  // (v4.228) Real 'change' handling for the widget's <select> controls (provider routing +
  // Sol reasoning). A select's value only meaningfully changes via 'change'; processing it
  // on 'click' fires on OPEN with the pre-change value and (for routing) re-rendered the
  // widget, killing the popup. Attached to document (not the widget el) so it survives the
  // widget's frequent innerHTML rebuilds.
  document.addEventListener('change', function(ev) {
    var t = ev.target;
    if (!t || !t.dataset) return;
    if (t.dataset.action === 'set-provider-routing') {
      tmHandleProviderRoutingChange(t);
      ev.stopPropagation();
      return;
    }
    if (t.dataset.action === 'set-sol-reasoning-effort') {
      var newLevel = t.value;
      if (newLevel && (newLevel === 'medium' || newLevel === 'high' || newLevel === 'xhigh' || newLevel === 'max')) {
        tmSetSolReasoningEffort(newLevel);
        console.log('✅ [v' + EXT_VERSION + '] Sol reasoning effort set to: ' + newLevel);
      }
      ev.stopPropagation();
      return;
    }
  }, true);

  // (v4.63) Compact token formatter for the header badge (184301 -> "184.3k").
  function tmFmtTok(n) {
    if (n == null || isNaN(Number(n))) return '0';
    n = Number(n);
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'm';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  // (v4.63) Build the always-visible widget header: version + repair tally (orange) + most-recent cache
  // report (green 'cache' label, BLUE = cache-read/saved, RED = cache-creation/expensive). Repurposes the
  // old useless "GPT-5.1 Conversations" title. Reflects the MOST RECENT payload across sessions (may jump).
  // (v4.66) Render the two-family repair badge (R a/b/c/d + T n) for a SINGLE payload's tally.
  // family='anthropic' brightens R and dims T; family='openai' brightens T and dims R; null dims both.
  // Used by the per-row payload-capture modal ribbon (header keeps its own equivalent inline copy).
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmRenderRepairBlocks-vwem,
  //   role=__lambdao_1.tmRenderRepairBlocks,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Renders the per-fix repair tally blocks in the widget.,
  // ]
  function tmRenderRepairBlocks(tally) {
    var rt = tally || null;
    var family = (rt && rt.family) ? rt.family : null;
    var out = [];
    var rvals = rt
      ? [rt.toolResultName || 0, rt.historicToolInputs || 0, rt.emptyMessageContent || 0, rt.missingToolResults || 0]
      : [0, 0, 0, 0];
    var rsum = rvals[0] + rvals[1] + rvals[2] + rvals[3];
    var rActive = (family === 'anthropic');
    var rTitle = 'Anthropic repairs: tool_result.name / historic tool_use.input / empty content / missing tool_result';
    // slot 2 (historicToolInputs) is benign/common (no-arg tool calls like GLIMPSE), so it ALONE never
    // raises the alarm; only slots 1/3/4 do. Calm slate when no real alarm; orange only when it matters.
    var rAlarm = rvals[0] + rvals[2] + rvals[3];
    var rStyle = 'color:' + ((rActive && rAlarm > 0) ? '#ff9d3d' : '#9aa4b2') + ';' + (rActive ? '' : 'opacity:0.3;');
    if (rActive && rAlarm > 0) {
      out.push('<span title="' + rTitle + '" style="' + rStyle + 'font-weight:bold;">\u26a0 R ' + rvals.join('/') + '</span>');
    } else {
      out.push('<span title="' + rTitle + '" style="' + rStyle + '">R ' + rvals.join('/') + '</span>');
    }
    var tVal = rt ? (rt.orphanedToolCalls || 0) : 0;
    var tActive = (family === 'openai');
    var tTitle = 'OpenAI repairs: orphaned tool_call (injected missing preceding output_text)';
    var tStyle = 'color:' + ((tActive && tVal > 0) ? '#ff9d3d' : '#9aa4b2') + ';' + (tActive ? '' : 'opacity:0.3;');
    if (tActive && tVal > 0) {
      out.push('<span title="' + tTitle + '" style="' + tStyle + 'font-weight:bold;">\u26a0 T ' + tVal + '</span>');
    } else {
      out.push('<span title="' + tTitle + '" style="' + tStyle + '">T ' + tVal + '</span>');
    }
    return out.join(' ');
  }

  // (v4.69) Render the prompt-cache report (blue = tokens reused/saved, red = newly-created/expensive) for
  // a payload's usage. Shared by the always-visible header AND the per-row payload-capture modal ribbon.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmRenderCacheReport-ilrd,
  //   role=__lambdao_1.tmRenderCacheReport,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Renders the cache read/write evidence line (cached tokens, hit streak, per-turn cost) in the widget.,
  // ]
  function tmRenderCacheReport(au, oru, costFontSize) {
    // (v4.71) Extract inference cost for the gray cost badge (appended to all return paths so it
    // surfaces in BOTH the always-visible widget header AND the per-row payload-capture modal).
    // (v4.78) Also check estimated_cost (DeepInfra's field name).
    var costVal = 0;
    if (au && au.cost != null) { costVal = au.cost; }
    else if (oru && oru.cost != null) { costVal = oru.cost; }
    else if (oru && oru.estimated_cost != null) { costVal = oru.estimated_cost; }
    else if (au && au.estimated_cost != null) { costVal = au.estimated_cost; }
    var costColor = costFontSize ? '#ffccd5' : '#9aa4b2';
    var costStyle = 'color:' + costColor + ';' + (costFontSize ? ('font-size:' + costFontSize + ';font-weight:600;') : '');
    // When costFontSize is set the caller renders the cost separately (modal left-pin, or widget inline).
    // v4.168: '__skip_cost__' sentinel suppresses the cost badge entirely (widget now renders cost inline).
    var skipCost = (costFontSize === '__skip_cost__');
    var costStr = (costVal > 0 && !costFontSize && !skipCost)
      ? ' <span title="inference cost" style="' + costStyle + '">$' + costVal.toFixed(3) + '</span>'
      : '';

    var genericUsage = (oru && (oru.cache_read_input_tokens != null || oru.cache_creation_input_tokens != null)) ? oru : null;
    if (genericUsage) {
      return '<span style="color:#7dd67d;">cache</span> ' +
        '<span title="cache read (saved)" style="color:#5ab0ff;">↺' + tmFmtTok(genericUsage.cache_read_input_tokens || 0) + '</span> ' +
        '<span title="cache write / creation" style="color:#9aa4b2;">+' + tmFmtTok(genericUsage.cache_creation_input_tokens || 0) + '</span>' + costStr;
    }
    if (au && (au.cache_read_input_tokens != null || au.cache_creation_input_tokens != null)) {
      return '<span style="color:#7dd67d;">cache</span> ' +
        '<span title="cache read (saved)" style="color:#5ab0ff;">\u21ba' + tmFmtTok(au.cache_read_input_tokens || 0) + '</span> ' +
        '<span title="cache creation (expensive/new)" style="color:#9aa4b2;">+' + tmFmtTok(au.cache_creation_input_tokens || 0) + '</span>' + costStr;
    }
    if (oru && oru.prompt_tokens_details && oru.prompt_tokens_details.cached_tokens != null) {
      var orWrite = (oru.cache_write_tokens != null) ? oru.cache_write_tokens : (oru.prompt_tokens_details.cache_write_tokens || 0);
      return '<span style="color:#7dd67d;">cache</span> ' +
        '<span title="cached tokens (saved)" style="color:#5ab0ff;">\u21ba' + tmFmtTok(oru.prompt_tokens_details.cached_tokens || 0) + '</span> ' +
        '<span title="cache write" style="color:#9aa4b2;">+' + tmFmtTok(orWrite) + '</span>' + costStr;
    }
    return '<span style="color:#7dd67d;opacity:0.55;">cache \u2013</span>' + costStr;
  }

  // ==================== CONTEXT-WINDOW DIAL (v4.297) ====================
  // A snapshot-in-time of the provider-REPORTED context size, stamped on every ring entry at
  // response receipt (tmCaptureResponse) and rendered by ONE shared SVG gauge in TWO surfaces:
  // each ring-modal row and the persistent widget's session-name row. Numerator = total_tokens
  // (everything the model consumed that turn, INCLUDING reasoning -- the ground truth that
  // TypingMind's native gauge undercounts). Denominator = model/provider max context, resolved
  // LIVE at render time: manual override > serving-provider maxContext (OpenRouter Endpoints
  // discovery) > built-in seed. Live re-resolution means a later override instantly re-scales
  // every historical row; the stamped max_ctx fields are kept only as an offline fallback.

  const TM_MODEL_CTX_OVERRIDES_KEY = 'tm_model_ctx_overrides_v1';
  // Built-in per-model-family context windows for DIRECT (non-OpenRouter) routes, where the
  // Endpoints-API discovery cannot reach. Deliberately tiny -- only values we are confident in;
  // everything else is one click away via the dial's override prompt. (OpenRouter-routed models
  // get their true per-endpoint window from live discovery automatically.)
  const TM_MODEL_CTX_SEED = [
    [/^kimi[-_]?k3/i, 1048576],  // Moonshot Kimi K3 DIRECT: full ~1M window. Bare-name anchored:
                                 // vendor-prefixed 'moonshotai/kimi-k3' never reaches the seed --
                                 // it resolves PER-ENDPOINT via OpenRouter discovery (third-party
                                 // providers serve K3 at ~256K, Moonshot's own endpoint at ~1M).
    [/gemini/i, 1048576]        // Google Gemini native: 1M window
  ];

  function tmReadModelCtxOverrides() {
    try { var r = localStorage.getItem(TM_MODEL_CTX_OVERRIDES_KEY); return r ? JSON.parse(r) : {}; } catch (e) { return {}; }
  }
  function tmSaveModelCtxOverrides(o) {
    try { localStorage.setItem(TM_MODEL_CTX_OVERRIDES_KEY, JSON.stringify(o || {})); } catch (e) {}
  }

  // Denominator resolution. modelKey = lowercase model (vendor-prefixed or bare); provSlug =
  // serving provider slug when known (matched base-slug tolerant so 'fireworks' finds
  // 'fireworks/fast' and vice versa). Returns { max, source: 'override'|'provider'|'provider-max'|'seed'|null }.
  function tmResolveModelMaxCtx(modelKey, provSlug) {
    var m = String(modelKey || '').toLowerCase().replace(/:(nitro|floor|free)$/i, '');
    if (!m) return { max: null, source: null };
    // 0) Provider-SPECIFIC manual override (v4.299: most precise rung; key = 'model::providerSlug')
    if (provSlug) {
      try {
        var ovP = tmReadModelCtxOverrides();
        var hnP = Number(ovP[m + '::' + provSlug]);
        if (isFinite(hnP) && hnP > 0) return { max: hnP, source: 'override-provider' };
      } catch (eP0) {}
    }
    // 1) Manual per-model override (exact full key, then final slash segment)
    try {
      var ov = tmReadModelCtxOverrides();
      var hit = ov[m];
      if (hit == null) { var seg = m.split('/').pop(); if (seg && ov[seg] != null) hit = ov[seg]; }
      var hn = Number(hit);
      if (isFinite(hn) && hn > 0) return { max: hn, source: 'override' };
    } catch (e) {}
    // 2) Provider entries (live OpenRouter discovery merged over the seed table)
    try {
      var entries = tmGetProviderEntries(m) || [];
      var anyMax = false;
      for (var ei = 0; ei < entries.length; ei++) { if (entries[ei] && entries[ei].maxContext != null) { anyMax = true; break; } }
      // Kick off the lazy Endpoints-API fetch when nothing usable is cached -- the NEXT turn's
      // snapshot (or a later render) picks up the fresh windows. Carries the tm_passthrough
      // sentinel and is fully guarded/in-flight-deduped by tmMaybeFetchProviderEndpoints itself.
      if (!anyMax) { try { tmMaybeFetchProviderEndpoints(m); } catch (eF) {} }
      if (provSlug) {
        for (var i = 0; i < entries.length; i++) {
          var e = entries[i];
          if (!e || e.maxContext == null || !e.slug) continue;
          if (e.slug === provSlug || e.slug.indexOf(provSlug + '/') === 0 || provSlug.indexOf(e.slug + '/') === 0) {
            return { max: e.maxContext, source: 'provider' };
          }
        }
      }
      var best = null;
      for (var bi = 0; bi < entries.length; bi++) { var be = entries[bi]; if (be && be.maxContext != null && (best == null || be.maxContext > best)) best = be.maxContext; }
      if (best != null) return { max: best, source: 'provider-max' };
    } catch (e2) {}
    // 3) Built-in seed (direct routes with well-known windows)
    for (var si = 0; si < TM_MODEL_CTX_SEED.length; si++) {
      if (TM_MODEL_CTX_SEED[si][0].test(m)) return { max: TM_MODEL_CTX_SEED[si][1], source: 'seed' };
    }
    return { max: null, source: null };
  }

  // 2s memo so a 500-row modal render pass does not re-parse the localStorage discovery store
  // per row. Busted explicitly by tmCtxDialPromptSet after an override change.
  var tmCtxResolveMemo = { ts: 0, map: {} };
  function tmResolveModelMaxCtxCached(model, capRec) {
    var now = Date.now();
    if (now - tmCtxResolveMemo.ts > 2000) { tmCtxResolveMemo = { ts: now, map: {} }; }
    var m = String(model || '').toLowerCase().replace(/:(nitro|floor|free)$/i, '');
    var provSlug = '';
    try {
      var pl = (capRec && (capRec._provider_label || capRec.response_provider)) || null;
      if (pl) provSlug = tmProviderNameToSlug(pl) || '';
    } catch (e) {}
    var ck = m + '::' + provSlug;
    if (!Object.prototype.hasOwnProperty.call(tmCtxResolveMemo.map, ck)) {
      tmCtxResolveMemo.map[ck] = tmResolveModelMaxCtx(m, provSlug || null);
    }
    return tmCtxResolveMemo.map[ck];
  }

  // Build the per-turn context snapshot from normalized usage evidence. Numerator rule
  // (rewritten v4.303): a reported total_tokens wins (OpenAI/OpenRouter/Gemini totalTokenCount);
  // else prompt_tokens (OpenAI-style, INCLUDES the cached prefix) + completion; else
  // Anthropic-style input + cache-read + cache-write + completion -- Anthropic reports these
  // SPLIT and the true context size includes the cached prefix.
  function tmComputeCtxSnapshot(usage, au, model, capRec) {
    usage = usage || null; au = au || null;
    function pick() { for (var i = 0; i < arguments.length; i++) { var v = arguments[i]; if (v != null && isFinite(Number(v))) return Number(v); } return null; }
    // (v4.303) The v4.297 version gated the Anthropic sum on `au && !usage`, but the generic
    // extractor normalizes Anthropic fields into `usage` too, so the guard never fired and the
    // numerator collapsed to input+output (969 of a 551K conversation). promptTok is kept
    // SEPARATE from inputTok because their cache semantics differ: OpenAI prompt_tokens
    // INCLUDES cached tokens; Anthropic input_tokens EXCLUDES them.
    var promptTok = pick(usage && usage.prompt_tokens);
    var inputTok = pick(usage && usage.input_tokens, au && au.input_tokens);
    var completion = pick(usage && usage.completion_tokens, au && au.output_tokens);
    var cached = pick(usage && usage.cache_read_input_tokens, usage && usage.prompt_tokens_details && usage.prompt_tokens_details.cached_tokens, au && au.cache_read_input_tokens);
    var cacheWrite = pick(usage && usage.cache_creation_input_tokens, usage && usage.prompt_tokens_details && usage.prompt_tokens_details.cache_write_tokens, au && au.cache_creation_input_tokens);
    var total = pick(usage && usage.total_tokens, au && au.total_tokens);
    var fullPrompt = null;
    if (promptTok != null) fullPrompt = promptTok;
    else if (inputTok != null) fullPrompt = inputTok + (cached || 0) + (cacheWrite || 0);
    if (total == null && promptTok != null) total = promptTok + (completion || 0);
    if (total == null && inputTok != null) total = inputTok + (cached || 0) + (cacheWrite || 0) + (completion || 0);
    if (total == null || total <= 0) return null;
    var reasoning = pick(usage && usage.reasoning_tokens,
      usage && usage.completion_tokens_details && usage.completion_tokens_details.reasoning_tokens,
      usage && usage.output_tokens_details && usage.output_tokens_details.reasoning_tokens,
      usage && usage.output_tokens_details && usage.output_tokens_details.thinking_tokens,
      au && au.output_tokens_details && au.output_tokens_details.thinking_tokens,
      au && au.output_tokens_details && au.output_tokens_details.reasoning_tokens);
    var snap = { total: total, prompt: fullPrompt, completion: completion, reasoning: reasoning, cached: cached, cache_write: cacheWrite, model: model || null, ts: Date.now() };
    // Provenance/fallback only: the denominator RE-RESOLVES live at render time.
    try {
      var mr = tmResolveModelMaxCtxCached(model, capRec);
      if (mr && mr.max != null) { snap.max_ctx = mr.max; snap.max_ctx_source = mr.source; }
    } catch (e) {}
    return snap;
  }

  // Newest ring entry carrying a _ctx_snapshot FOR THIS identity. Strict match when idKey is
  // known: the dial must never show a DIFFERENT conversation's context beside this session's
  // name (parallel-conversation safe, same rule as the v4.211 widget guards).
  function tmLatestCtxSnapshotEntryForIdentity(idKey) {
    try {
      var ring = tmReadCaptureRing();
      var i, cap;
      if (idKey) {
        for (i = ring.length - 1; i >= 0; i--) {
          cap = ring[i];
          if (cap && cap._ctx_snapshot && cap._identity && cap._identity.key === idKey) return cap;
        }
        return null;
      }
      for (i = ring.length - 1; i >= 0; i--) { cap = ring[i]; if (cap && cap._ctx_snapshot) return cap; }
    } catch (e) {}
    return null;
  }

  // The ramp: solid green <=40%, mostly green at 50%, yellowing past 50%, orange ~65%, red >=75%.
  function tmCtxDialColor(pct) {
    if (pct == null) return '#9aa4b2';
    var p = Math.max(0, Math.min(100, pct));
    var hue;
    if (p <= 40) hue = 120;
    else if (p >= 75) hue = 0;
    else hue = 120 * (1 - (p - 40) / 35);
    return 'hsl(' + Math.round(hue) + ',85%,55%)';
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmRenderCtxDial-v297,
  //   role=__lambdao_1.tmRenderCtxDial,
  //   slice_labels=tm-payload-overview,tm-payload-cost-visibility,
  //   kind=ast,
  //   comment=THE shared context-window gauge (v4.297): one SVG dial rendered into BOTH the ring-modal row ribbon and the persistent widget session-name row. Arc = provider-reported total_tokens / model max-ctx over 360deg (green <=40%, yellow past 50%, orange ~65%, red >=75%); dashed 'tok N' when the denominator is unknown. Click sets/clears a per-model override (tm_model_ctx_overrides_v1). Children are pointer-events:none so clicks land on the wrapper's own data-action.,
  // ]
  function tmRenderCtxDial(snap, opts) {
    opts = opts || {};
    if (!snap || snap.total == null) return '';
    var size = opts.size || 16;
    var model = snap.model || (opts.cap && opts.cap._identity && opts.cap._identity.model) || '';
    var mr = tmResolveModelMaxCtxCached(model, opts.cap || null);
    // (v4.299) Resolve the row's provider slug up front: it rides the dial's data-provider attr
    // so the click handler targets a 'model::providerSlug' override key (not just 'model').
    var provSlugForAttr = '';
    try {
      var plA = (opts.cap && (opts.cap._provider_label || opts.cap.response_provider)) || null;
      if (plA) provSlugForAttr = tmProviderNameToSlug(plA) || '';
    } catch (ePA) {}
    var maxCtx = mr.max, maxSrc = mr.source;
    if (maxCtx == null && snap.max_ctx != null) { maxCtx = snap.max_ctx; maxSrc = snap.max_ctx_source || 'stamped'; }
    var pct = (maxCtx != null && maxCtx > 0) ? (snap.total / maxCtx) * 100 : null;
    var color = tmCtxDialColor(pct);
    var r = (size / 2) - 2;
    var cx = size / 2;
    var circ = 2 * Math.PI * r;
    var sw = size >= 18 ? 2.6 : 2.2;
    var arc;
    if (pct != null) {
      var frac = Math.max(0.004, Math.min(1, pct / 100));
      arc = '<circle cx="' + cx + '" cy="' + cx + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="' + sw + '" stroke-linecap="round" stroke-dasharray="' + (frac * circ).toFixed(1) + ' ' + circ.toFixed(1) + '"/>';
    } else {
      // No denominator: dashed neutral ring -- a gauge without a scale.
      arc = '<circle cx="' + cx + '" cy="' + cx + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="' + sw + '" stroke-dasharray="2 3" opacity="0.7"/>';
    }
    var svg = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" style="display:inline-block;vertical-align:middle;transform:rotate(-90deg);pointer-events:none;">' +
      '<circle cx="' + cx + '" cy="' + cx + '" r="' + r + '" fill="none" stroke="#3a3f4a" stroke-width="' + sw + '"/>' + arc + '</svg>';
    var over = (pct != null && pct > 100);
    var label = pct != null ? String(Math.round(pct)) + '%' : ('tok ' + tmFmtTok(snap.total));
    var NL = String.fromCharCode(10);
    var tip = [];
    tip.push('ctx ' + tmFmtTok(snap.total) + (maxCtx ? (' / ' + tmFmtTok(maxCtx) + (pct != null ? ' (' + (Math.round(pct * 10) / 10) + '%)' : '')) : ' / max unknown'));
    var bd = [];
    if (snap.prompt != null) bd.push('prompt ' + Math.round(snap.prompt).toLocaleString());
    if (snap.completion != null) bd.push('completion ' + Math.round(snap.completion).toLocaleString());
    if (snap.reasoning != null) bd.push('reasoning ' + Math.round(snap.reasoning).toLocaleString());
    if (snap.cached != null) bd.push('cached ' + tmFmtTok(snap.cached));
    if (bd.length) tip.push(bd.join(' · '));
    tip.push('total ' + Math.round(snap.total).toLocaleString() + ' tokens this turn (provider-reported, incl. reasoning)');
    tip.push('max: ' + (maxSrc || 'unknown') + (model ? ' -- click to override ' + (provSlugForAttr ? ('model::' + provSlugForAttr) : 'model') : ''));
    if (over) tip.push('⚠ OVER the model context window');
    var sep = opts.leadingSep ? ' <span style="opacity:0.4;">·</span> ' : '';
    var clickable = !!model;
    return sep + '<span ' + (clickable ? 'data-action="ctx-dial-set" data-model="' + escapeHtml(model) + '" data-provider="' + escapeHtml(provSlugForAttr) + '" ' : '') +
      'title="' + escapeHtml(tip.join(NL)) + '" style="display:inline-flex;align-items:center;gap:3px;margin-left:4px;cursor:' + (clickable ? 'pointer' : 'help') + ';vertical-align:middle;white-space:nowrap;">' +
      svg +
      '<span style="font-size:10px;font-weight:600;color:' + color + ';pointer-events:none;line-height:1;">' + (over ? '⚠' : '') + label + '</span>' +
      '</span>';
  }

  // Click handler for every dial (v4.299: provider-granular). The dial carries the row's
  // provider slug, so an override lands on the PRECISE key it was clicked from:
  // 'model::providerSlug' when the row names a provider, bare 'model' otherwise (direct routes).
  // Empty input clears exactly that key (auto-detection resumes); 'clearall' removes EVERY
  // override for the model -- the always-available back-out for a mistaken click. Re-renders
  // both surfaces afterward (renderPayloadCaptureModal no-ops when the modal is closed).
  function tmCtxDialPromptSet(model, provSlug) {
    model = String(model || '').trim();
    if (!model) return;
    provSlug = String(provSlug || '').trim();
    var key = model.toLowerCase().replace(/:(nitro|floor|free)$/i, '');
    var seg = key.split('/').pop();
    var targetKey = provSlug ? (key + '::' + provSlug) : key;
    var ov = tmReadModelCtxOverrides();
    var curKeyVal = (ov[targetKey] != null) ? ov[targetKey] : '';
    var eff = tmResolveModelMaxCtx(key, provSlug || null);
    var NL2 = String.fromCharCode(10);
    var lines = [];
    lines.push('Max context window (tokens) for ' + model + (provSlug ? (' :: ' + provSlug) : '') + ':');
    lines.push('Current: ' + (eff && eff.max != null ? (eff.max + ' (' + eff.source + ')') : 'unknown'));
    lines.push('');
    lines.push('Enter a number to override THIS key only (' + targetKey + ').');
    lines.push("Empty input = clear this key (auto-detection resumes). 'clearall' = remove EVERY override for this model.");
    if (provSlug && eff && eff.source === 'override') {
      lines.push('NOTE: a MODEL-WIDE override is currently in force; clearing this key will NOT remove it -- use clearall.');
    }
    tmPromptActive = true;
    var v = prompt(lines.join(NL2), (curKeyVal === '' ? '' : String(curKeyVal)));
    try { tmPayloadCaptureSuppressEscapeUntil = Date.now() + 1500; } catch (eSup) {}
    setTimeout(function() { tmPromptActive = false; }, 100);
    if (v === null) return;
    var vTrim = String(v).replace(/^\s+|\s+$/g, '');
    if (vTrim.toLowerCase() === 'clearall') {
      var delCount = 0;
      for (var ok in ov) {
        if (!Object.prototype.hasOwnProperty.call(ov, ok)) continue;
        if (ok === key || ok === seg || ok.indexOf(key + '::') === 0 || (seg && ok.indexOf(seg + '::') === 0)) { delete ov[ok]; delCount++; }
      }
      tmSaveModelCtxOverrides(ov);
      tmCtxResolveMemo = { ts: 0, map: {} };
      try { renderGpt51UsageWidget(); } catch (e1) {}
      try { renderPayloadCaptureModal(); } catch (e2) {}
      alert('Cleared ' + delCount + ' override(s) for ' + model + '. Auto-detection resumed.');
      return;
    }
    var vNum = vTrim.replace(/[,\s]/g, '');
    if (vNum === '') { delete ov[targetKey]; }
    else {
      var n = Number(vNum);
      if (!isFinite(n) || n <= 0) { alert('Not a valid token count: ' + v); return; }
      ov[targetKey] = Math.round(n);
    }
    tmSaveModelCtxOverrides(ov);
    tmCtxResolveMemo = { ts: 0, map: {} }; // bust the memo so the re-render re-scales immediately
    try { renderGpt51UsageWidget(); } catch (e1) {}
    try { renderPayloadCaptureModal(); } catch (e2) {}
  }

  // @carto-group id=client-group-5 label="Client group 5"

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmBuildWidgetStatusLine-pmi7,
  //   role=__lambdao_1.tmBuildWidgetStatusLine,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Composes the widget's top status line from live status with ledger fallback.,
  // ]
  function tmBuildWidgetStatusLine() {
    var st = tmMostRecentPayloadStatus || {};
    var rt = st.repairTally || null;
    var family = (rt && rt.family) ? rt.family : null;   // 'anthropic' | 'openai' | null
    var parts = [];
    parts.push('<span style="opacity:0.7;">v' + EXT_VERSION + '</span>');

    // v4.261: current most-recent payload required one or more Kimi tool-ID replacements.
    // Bright only on the affected turn; the next status rebuild carries zero and clears it.
    var idRepairCount = Number(st.toolIdRepairCount || 0);
    if (idRepairCount > 0) {
      var idRepairLast = st.toolIdRepairLast || {};
      var idRepairTitle = 'Kimi tool-call ID repaired before TypingMind persistence';
      if (idRepairLast.from || idRepairLast.to) {
        idRepairTitle += ': ' + String(idRepairLast.from || '?') + ' → ' + String(idRepairLast.to || '?');
      }
      parts.push(
        '<span title="' + escapeHtml(idRepairTitle) + '" ' +
        'style="color:#ffd166;font-weight:bold;text-shadow:0 1px 2px #000;">ID↺' +
        (idRepairCount > 1 ? (' ' + idRepairCount) : '') + '</span>'
      );
    }

    // Anthropic-family repair block: R a/b/c/d. Full-bright when the most-recent payload was Anthropic
    // family; dimmed (not applicable) otherwise. Bold + ⚠ only when active AND non-zero.
    var rvals = rt
      ? [rt.toolResultName || 0, rt.historicToolInputs || 0, rt.emptyMessageContent || 0, rt.missingToolResults || 0]
      : [0, 0, 0, 0];
    var rsum = rvals[0] + rvals[1] + rvals[2] + rvals[3];
    var rActive = (family === 'anthropic');
    var rTitle = 'Anthropic repairs: tool_result.name / historic tool_use.input / empty content / missing tool_result';
    // slot 2 (historicToolInputs) is benign/common (no-arg tool calls like GLIMPSE), so it ALONE never
    // raises the alarm; only slots 1/3/4 do. Calm slate when no real alarm; orange only when it matters.
    var rAlarm = rvals[0] + rvals[2] + rvals[3];
    var rStyle = 'color:' + ((rActive && rAlarm > 0) ? '#ff9d3d' : '#9aa4b2') + ';' + (rActive ? '' : 'opacity:0.3;');
    if (rActive && rAlarm > 0) {
      parts.push('<span title="' + rTitle + '" style="' + rStyle + 'font-weight:bold;">\u26a0 R ' + rvals.join('/') + '</span>');
    } else {
      parts.push('<span title="' + rTitle + '" style="' + rStyle + '">R ' + rvals.join('/') + '</span>');
    }

    // OpenAI-family repair block: T n (orphaned tool_call repair). Full-bright when the most-recent
    // payload was OpenAI family; dimmed otherwise.
    var tVal = rt ? (rt.orphanedToolCalls || 0) : 0;
    var tActive = (family === 'openai');
    var tTitle = 'OpenAI repairs: orphaned tool_call (injected missing preceding output_text)';
    var tStyle = 'color:' + ((tActive && tVal > 0) ? '#ff9d3d' : '#9aa4b2') + ';' + (tActive ? '' : 'opacity:0.3;');
    if (tActive && tVal > 0) {
      parts.push('<span title="' + tTitle + '" style="' + tStyle + 'font-weight:bold;">\u26a0 T ' + tVal + '</span>');
    } else {
      parts.push('<span title="' + tTitle + '" style="' + tStyle + '">T ' + tVal + '</span>');
    }

    var au = st.anthropicUsage;
    var oru = st.orUsage;
    // (v4.236) Table-cost fallback for providers returning no API cost (e.g. Moonshot/DeepSeek direct).
    var tableCostFallback = (st && typeof st.tableCost === 'number' && st.tableCost > 0) ? st.tableCost : 0;
    // (v4.211) Fallback when the live status is empty (post-refresh, or the last turn was an
    // error): use the most recent SUCCESSFUL turn's usage from the ring, so cost + cache report
    // + badges still render instead of going blank.
    if (!au && !oru) {
      try {
        var lastOk = tmLastSuccessfulUsage();
        if (lastOk) { au = lastOk.au; oru = lastOk.oru; if (lastOk.tableCost > 0) tableCostFallback = lastOk.tableCost; }
      } catch (e) {}
    }
    // v4.168: Per-turn cost is now rendered inline here (not via tmRenderCacheReport's tiny gray badge)
    // so it can be the flashpoint — larger font, orange-red, bold.
    var turnCostVal = tmExtractCostVal(au, oru);
    // (v4.236) Fall back to table-calculated cost for providers with no API cost field.
    if (!(turnCostVal > 0) && tableCostFallback > 0) turnCostVal = tableCostFallback;
    // v4.169: Cache hit/miss badges around the cost.
    // (v4.211) Read the per-identity cache-outcome LEDGER (survives refresh; error turns no
    // longer stamp tmMostRecentPayloadStatus, so status.cacheStats alone would go stale/blank).
    var ledgerStats = null;
    try {
      var identKey = (st.identity && st.identity.key) || '';
      if (!identKey) {
        var _r2 = tmReadCaptureRing();
        var _l2 = _r2.length > 0 ? _r2[_r2.length - 1] : null;
        if (_l2 && _l2._identity && _l2._identity.key) identKey = _l2._identity.key;
      }
      if (identKey) ledgerStats = tmGetCacheOutcomeForIdentity(identKey);
    } catch (e) {}
    var stats = ledgerStats || (st.cacheStats || {});
    var cacheHit = (st.cacheHit != null) ? !!st.cacheHit : !!(stats && stats._cache_last === 'hit');
    var streak = Number(stats._cache_streak || 0);
    var totalHits = Number(stats._cache_hits || 0);
    var totalMisses = Number(stats._cache_misses || 0);
    var missBorder = cacheHit
      ? ''
      : 'border:2px solid #ffd166;border-radius:7px;padding:2px 5px;';
    // v4.190: when the fat miss border is present, raise both superscripts ~7px so they clear it
    var supTopAdj = missBorder ? -7 : 0;
    var turnCostStr = (turnCostVal > 0)
      ? ' <span title="inference cost (this turn) — ' + (cacheHit ? 'cache hit' : 'cache miss') + '" ' +
          'style="position:relative;display:inline-block;color:#ff6b3d;font-size:13px;font-weight:bold;' + missBorder + '">' +
            '$' + turnCostVal.toFixed(3) +
            (streak > 0
              ? '<span style="position:absolute;top:' + (-10 + supTopAdj) + 'px;left:-7px;color:#fff4e6;font-size:9px;font-weight:bold;text-shadow:0 1px 2px #000;">' + streak + '</span>'
              : '') +
            // v4.189: hit/miss superscript readability — font 9px->11px, spaces around the slash
            // v4.269: miss count in the MISS badge red (#ff6b6b) -- the system's one reserved
            // red -- while slash + hits keep the legacy light green.
            ((totalMisses > 0 || totalHits > 0)
              ? '<span style="position:absolute;top:' + (-14 + supTopAdj) + 'px;right:-18px;color:#ccffcc;font-size:11px;font-weight:600;text-shadow:0 1px 2px #000;"><span style="color:#ff6b6b;">' + totalMisses + '</span> / ' + totalHits + '</span>'
              : '') +
        '</span>'
      : '';
    // Build the cache report WITHOUT the cost badge (cost is rendered separately above).
    var cacheReportNoCost = tmRenderCacheReport(au, oru, '__skip_cost__');
    parts.push(cacheReportNoCost + turnCostStr);

    // (v4.73) Running total cost — deeper purple (#8b6db5) for Σ$/reset; numeric value in even darker purple (#5d3f8e).
    var totalCost = tmGetTotalCost();
    parts.push('<span title="running total cost (session)" style="color:#5d3f8e;font-size:9px;">\u03a3$<span style="color:#b8a0d5;font-size:12px;font-weight:bold;">' + totalCost.toFixed(3) + '</span></span>' +
      ' <span data-action="reset-total-cost" title="Reset total" style="cursor:pointer;color:#5d3f8e;font-size:9px;opacity:0.6;">\u21ba</span>');

    return parts.join(' <span style="opacity:0.4;">\u00b7</span> ');
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.renderGpt51UsageWidget-j6og,
  //   role=__lambdao_1.renderGpt51UsageWidget,
  //   slice_labels=tm-payload-cost-visibility,tm-payload-overview,
  //   kind=ast,
  //   comment=Primary widget render. MUST read stamped cap._identity for hue+cost together; never re-derive per-surface. Also renders modal/payload links, trunc control, Gemini repair toggle.,
  // ]
  function renderGpt51UsageWidget() {
    if (typeof document === 'undefined') return;
    const el = ensureGpt51UsageWidget();
    const store = getGpt51UsageStore();
    const convIds = Object.keys(store).filter(id => !store[id].hidden);
    const hasGpt51Convs = convIds.length > 0;

    // Widget-level collapse state (persisted in localStorage)
    const collapsed = el.dataset.collapsed === 'true' ||
      (!el.dataset.collapsed && localStorage.getItem('gpt51_widget_collapsed') === 'true');

    const lines = [];
    const managing = tmAgentManagementEnabled();
    lines.push(
      '<button type="button" data-action="toggle-agent-management" title="Agent management mode — monitor tool-call sessions and auto-continue confirmed stalls" ' +
      'style="position:absolute;right:100%;top:0;margin-right:4px;width:28px;height:28px;padding:0;border-radius:7px 0 0 7px;cursor:pointer;pointer-events:auto;font-size:14px;font-weight:bold;line-height:26px;text-align:center;color:' + (managing ? '#fff' : '#e6a35c') + ';background:' + (managing ? '#b51515' : '#4b2b10') + ';border:1px solid ' + (managing ? '#ff6666' : '#9a5a22') + ';animation:' + (managing ? 'tmAgentManagePulse 1.4s ease-in-out infinite' : 'none') + ';">&#9881;</button>'
    );
    const toggleIcon = collapsed ? '▸' : '▾';
    lines.push(
      '<div data-action="copy-session-id" title="Click to copy Session ID to clipboard" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-size:10px;margin-bottom:2px;gap:6px;flex-wrap:wrap;">' +
        '<span style="font-weight:normal;line-height:1.5;">' + tmBuildWidgetStatusLine() + '</span>' +
        '<span data-action="toggle-widget" style="cursor:pointer;font-size:10px;opacity:0.8;margin-left:6px;font-weight:bold;">' + toggleIcon + '</span>' +
      '</div>'
    );

    // (v4.134) Session ID row with name support.
    var displaySessionId = tmGetDisplaySessionId();
    var displayPastedId = tmGetDisplayPastedSessionId();
    var displaySessionName = tmGetSessionName(displaySessionId || displayPastedId);
    var displaySidColor = '#9aa4b2';
    var displaySidTooltip = '';
    // Determine hue for the most-recent-payload session.
    // v4.157: prefer the identity stamped on tmMostRecentPayloadStatus (single source for BOTH
    // hue and cost); fall back to the last ring entry's _identity; then per-field derivation.
    var widgetIdentity = null;
    try {
      if (tmMostRecentPayloadStatus && tmMostRecentPayloadStatus.identity) {
        widgetIdentity = tmMostRecentPayloadStatus.identity;
      } else {
        var ring = tmReadCaptureRing();
        var last = ring.length > 0 ? ring[ring.length - 1] : null;
        if (last && last._identity) {
          widgetIdentity = last._identity;
        } else if (last) {
          var lastModel = '';
          var lastHost = '';
          var lastIsProxy = false;
          var lastSid = last.session_id || null;
          try { lastModel = tmCaptureModel(last); } catch (e) {}
          try { lastHost = tmExtractEndpointHost(last); } catch (e) {}
          try { lastIsProxy = tmIsProxyCapture(last); } catch (e) {}
          widgetIdentity = { sid: lastSid, model: lastModel, host: lastHost, proxy: lastIsProxy, key: tmBuildIdentityKey(lastSid, lastModel, lastHost, lastIsProxy) };
        }
      }
      if (widgetIdentity) {
        displaySidColor = tmModelEndpointColor(widgetIdentity.model, widgetIdentity.host, widgetIdentity.proxy, widgetIdentity.sid);
        displaySidTooltip = widgetIdentity.key || '';
      }
    } catch (e) {}
    // (v4.297) Context dial for the widget's current identity: newest ring entry carrying a
    // _ctx_snapshot for THIS identity (never another conversation's -- parallel-safe).
    var widgetCtxDialHtml = '';
    try {
      var ctxCapForWidget = tmLatestCtxSnapshotEntryForIdentity(widgetIdentity && widgetIdentity.key);
      if (ctxCapForWidget) widgetCtxDialHtml = tmRenderCtxDial(ctxCapForWidget._ctx_snapshot, { size: 16, cap: ctxCapForWidget });
    } catch (eCtxW) { widgetCtxDialHtml = ''; }

    if (displaySessionId || displayPastedId) {
      var sidParts = [];
      sidParts.push('<span data-action="open-payload-capture-modal" style="opacity:0.5;cursor:pointer;pointer-events:auto;font-size:13px;text-decoration:underline;">Session ID:</span> <span data-action="set-session-name" data-session-id="' + escapeHtml(displaySessionId || '') + '" title="Click to name this session" style="cursor:pointer;color:' + displaySidColor + ';font-size:10px;pointer-events:auto;">' + (displaySessionId || displayPastedId || '(none)') + '</span>');
      if (displayPastedId) sidParts.push('<span data-action="open-payload-capture-modal" style="opacity:0.5;cursor:pointer;pointer-events:auto;">pasted:</span> <span data-action="set-session-name" data-session-id="' + escapeHtml(displayPastedId || '') + '" title="Click to name this session" style="cursor:pointer;color:' + displaySidColor + ';font-size:10px;pointer-events:auto;">' + displayPastedId + '</span>');
      // (v4.146) Current session total at the left, before the labels.
      // v4.157: reuse the single widgetIdentity resolved above for the cost lookup, so hue
      // and cost come from ONE identity (no more mixing sources).
      var displaySid = displaySessionId || displayPastedId;
      var widgetSessionCost = 0;
      try {
        if (widgetIdentity && widgetIdentity.sid && widgetIdentity.model) {
          widgetSessionCost = tmGetSessionCost(widgetIdentity.sid, widgetIdentity.model, widgetIdentity.host, widgetIdentity.proxy);
        }
      } catch (e) {}
      if (widgetSessionCost > 0) {
        sidParts.unshift('<span data-action="open-payload-capture-modal" title="Open payload capture history" style="cursor:pointer;color:' + displaySidColor + ';font-size:11px;font-weight:bold;pointer-events:auto;">$' + widgetSessionCost.toFixed(2) + '</span>');
      }
      lines.push('<div data-action="open-payload-capture-modal" title="' + (displaySidTooltip ? escapeHtml('identity: ' + displaySidTooltip) : 'Open payload capture history') + '" style="cursor:pointer;font-size:8px;font-family:monospace;margin-bottom:2px;">' + sidParts.join(' | ') + '</div>');

      // (v4.148) Session name gets its own full-width row so the session/status row does not wrap.
      // Keep the same color/bold treatment and the same rename click action, but make the UX clearer.
      var nameSid = displaySessionId || displayPastedId || '';
      if (displaySessionName) {
        lines.push('<div data-action="set-session-name" data-session-id="' + escapeHtml(nameSid) + '" title="Click to rename" style="cursor:pointer;color:' + displaySidColor + ';font-size:11px;font-weight:bold;font-family:monospace;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + displaySessionName + widgetCtxDialHtml + tmAgentManagementBadge(nameSid) + '</div>');
      } else {
        lines.push('<div data-action="set-session-name" data-session-id="' + escapeHtml(nameSid) + '" title="Click to name this session" style="cursor:pointer;color:#ccc;font-size:9px;font-family:monospace;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">click to name session' + widgetCtxDialHtml + tmAgentManagementBadge(nameSid) + '</div>');
      }
    } else {
      lines.push('<div data-action="open-payload-capture-modal" title="Open payload capture history" style="cursor:pointer;font-size:12px;opacity:0.3;font-family:monospace;margin-bottom:2px;">Session ID: (none yet \u2014 click header to generate)</div>');
    }

    // v4.192: model row — active session's model string in the session identity color
    // v4.198: + serving provider appended (pipe-separated, light green) so you can see WHICH
    // OpenRouter endpoint (Moonshot vs Fireworks vs Baseten) served the most-recent turn at a
    // glance, right in the persistent widget — no need to open the ring-buffer modal.
    // v4.200: + provider routing dropdown (Fix 16) for multi-provider models. Shows lock state
    // with a glyph and lets you switch/lock/float/unlock. Only renders for multi-provider models.
    var modelForDisplay = '';
    try {
      if (widgetIdentity && widgetIdentity.model) modelForDisplay = widgetIdentity.model;
    } catch (e) {}
    var providerForDisplay = '';
    try {
      var _st = tmMostRecentPayloadStatus || {};
      if (_st.provider) providerForDisplay = String(_st.provider);
      else {
        // (v4.205) Refresh fallback: read the SERVING provider off the last ring entry (captured
        // since v4.197) before degrading to the bare endpoint host ('openrouter.ai').
        try {
          var _ring = tmReadCaptureRing();
          var _last = _ring.length > 0 ? _ring[_ring.length - 1] : null;
          if (_last && _last.response_provider) providerForDisplay = String(_last.response_provider);
        } catch (e2) {}
        if (!providerForDisplay && widgetIdentity && widgetIdentity.host) providerForDisplay = String(widgetIdentity.host);
      }
    } catch (e) {}
    // (v4.214) When a lock exists, use its label (e.g. 'Fireworks Fast') instead of the bare
    // response_provider ('Fireworks') so the distinction is visible in the widget.
    try {
      var _wIdKey = (widgetIdentity && widgetIdentity.key) || '';
      if (_wIdKey) providerForDisplay = tmResolveProviderLabel(_wIdKey, providerForDisplay);
    } catch (e) {}
    if (modelForDisplay) {
      var providerSuffix = providerForDisplay
        ? (' <span style="opacity:0.5;">|</span> <span title="serving provider" style="color:#8ef0a0;">' + escapeHtml(providerForDisplay) + '</span>')
        : '';
      // (Fix 16, v4.200) Provider routing dropdown for multi-provider models.
      var routingDropdown = '';
      try {
        var _rModel = String(modelForDisplay).toLowerCase().replace(/:(nitro|floor|free)$/i, '');
        // (v4.205) Kick off a lazy Endpoints-API discovery for OpenRouter-routed models so new
        // providers/models appear in the dropdown automatically (silent seed fallback).
        try {
          var _rHost2 = (widgetIdentity && widgetIdentity.host) || '';
          if (_rHost2.indexOf('openrouter') !== -1 || (!_rHost2 && _rModel.indexOf('/') !== -1)) {
            tmMaybeFetchProviderEndpoints(_rModel);
          }
        } catch (e) {}
        if (tmIsMultiProviderModel(_rModel)) {
          // (v4.201) canonical stamped identity key; (v4.206) shared dropdown builder (also used
          // by the ring-buffer modal's most-recent entry per identity).
          var _rIdKey = (widgetIdentity && widgetIdentity.key) || '';
          routingDropdown = tmBuildProviderRoutingDropdown(_rIdKey, _rModel, providerForDisplay);
        }
      } catch (e) {}
      lines.push('<div title="active model | serving provider" style="color:' + displaySidColor + ';font-size:9px;font-family:monospace;margin-bottom:2px;overflow:visible;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(modelForDisplay) + providerSuffix + routingDropdown + '</div>');
    }

    // (Fix 17, v4.202) Error row: when the most-recent response carried an OpenRouter error,
    // show a compact clickable red row. Click opens a popup with the full raw error JSON.
    // Auto-cleared on the next successful response (see tmMaybeAutoRetry fast path).
    // (v4.211) IDENTITY GUARD: only show the banner when the error's identity matches the
    // identity the widget is currently displaying -- a parallel conversation's 429 must NOT
    // append a red row to THIS session's widget. (If the widget shows no identity, show it.)
    try {
      if (tmMostRecentError) {
        var errMatches = true;
        try {
          var wKey = (widgetIdentity && widgetIdentity.key) || '';
          if (wKey && tmMostRecentError.idKey && tmMostRecentError.idKey !== wKey) errMatches = false;
        } catch (e) {}
        if (errMatches) {
          var errCode = tmMostRecentError.code != null ? tmMostRecentError.code : '?';
          var errProv = tmMostRecentError.provider ? (' ' + escapeHtml(tmMostRecentError.provider)) : '';
          var retryNote = (tmMostRecentError.attempt > 0) ? (' (retried x' + tmMostRecentError.attempt + ')') : '';
          lines.push('<div data-action="open-error-popup" title="Click for full error JSON" style="cursor:pointer;font-size:9px;font-family:monospace;margin-bottom:2px;color:#ff6b6b;font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">⚠ err ' + escapeHtml(String(errCode)) + errProv + retryNote + ' — click</div>');
        }
      }
    } catch (e) {}

    // (v4.236) Persistent orange banner for 'No endpoints found for <model>'. Unlike the red
    // error row (auto-clears on success), this STAYS until the user clicks its X — so Dan can't
    // forget that the remedy is to switch the provider routing. Identity-guarded like the error row.
    try {
      if (tmEndpointNotFound) {
        var enfMatches = true;
        try {
          var wKey2 = (widgetIdentity && widgetIdentity.key) || '';
          if (wKey2 && tmEndpointNotFound.idKey && tmEndpointNotFound.idKey !== wKey2) enfMatches = false;
        } catch (e) {}
        if (enfMatches) {
          var enfProv = tmEndpointNotFound.provider ? (' for ' + escapeHtml(tmEndpointNotFound.provider)) : '';
          lines.push('<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;background:#3a2200;border:1px solid #ff9500;border-radius:4px;padding:3px 6px;">' +
            '<span style="color:#ff9500;font-size:11px;font-weight:bold;font-family:monospace;line-height:1.3;flex:1;">⛔ Provider/endpoint not found' + enfProv + '. Consider switching providers.</span>' +
            '<span data-action="dismiss-endpoint-not-found" title="Dismiss" style="cursor:pointer;color:#ff9500;font-weight:bold;font-size:13px;flex-shrink:0;line-height:1;">×</span>' +
            '</div>');
        }
      }
    } catch (e) {}

    // (v4.270) PROMPT-WARNING banner — the RING is the source of truth (survives refresh). Scan
    // backward for the newest capture carrying a critical warning for THIS identity; suppress it
    // only if that exact warning id was dismissed (a dismissal never hides a later turn's new
    // warning). Identity-guarded like the error/endpoint banners so parallel conversations don't
    // cross-contaminate.
    try {
      var wWidgetKey = (widgetIdentity && widgetIdentity.key) || '';
      var newestWarn = null;
      try {
        var warnRing = tmReadCaptureRing();
        for (var wri = warnRing.length - 1; wri >= 0; wri--) {
          var wCap = warnRing[wri];
          if (!wCap || !Array.isArray(wCap._warnings) || !wCap._warnings.length) continue;
          if (wWidgetKey) { var wCapKey = tmCapIdentityKey(wCap); if (wCapKey && wCapKey !== wWidgetKey) continue; }
          for (var wwi = wCap._warnings.length - 1; wwi >= 0; wwi--) {
            var cand = wCap._warnings[wwi];
            if (cand && cand.severity === 'critical') { newestWarn = cand; break; }
          }
          if (newestWarn) break;
        }
      } catch (eScan) {}
      if (newestWarn && !tmIsWarningBannerDismissed(newestWarn.id)) {
        var wTitle = escapeHtml(newestWarn.title || 'Prompt warning');
        var wMsg = escapeHtml(newestWarn.message || '');
        var wDetail = '';
        try {
          var dd = newestWarn.details || {};
          if (dd.reported_prompt_tokens != null && dd.estimated_prompt_tokens != null) {
            wDetail = ' (~' + Math.round(dd.estimated_prompt_tokens / 1000) + 'K est vs ' + Math.round(dd.reported_prompt_tokens / 1000) + 'K reported)';
          } else if (dd.model) {
            wDetail = ' (' + escapeHtml(String(dd.model)) + ')';
          }
        } catch (eD) {}
        lines.push('<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;background:#3a0000;border:1px solid #ff3333;border-radius:4px;padding:3px 6px;">' +
          '<span style="color:#ff4444;font-size:11px;font-weight:bold;font-family:monospace;line-height:1.3;flex:1;">\uD83D\uDEA8 ' + wTitle + wDetail + ' — ' + wMsg + '</span>' +
          '<span data-action="dismiss-warning-banner" data-warning-id="' + escapeHtml(String(newestWarn.id || '')) + '" title="Dismiss (this turn only)" style="cursor:pointer;color:#ff4444;font-weight:bold;font-size:13px;flex-shrink:0;line-height:1;">×</span>' +
          '</div>');
      }
    } catch (eWarn) {}

    if (collapsed) {
      el.innerHTML = lines.join('');
      return;
    }

    // Always show export/modal links (work for all vendors), even if no GPT-5.1 convs
    if (!hasGpt51Convs) {
      lines.push('<div style="font-size:10px;opacity:0.9;margin-top:4px;cursor:pointer;text-decoration:underline;" data-action="open-payload-capture-modal">Copy payload…</div>');
      lines.push('<div style="font-size:10px;opacity:0.9;margin-top:4px;display:flex;align-items:center;gap:4px;">Trunc:<input id="tm-trunc-input" type="number" min="100" step="500" value="' + tmGetTruncationLimit() + '" data-action="set-truncation-limit" style="width:52px;font-size:10px;background:#222;color:#fff;border:1px solid #555;border-radius:3px;padding:0 2px;" /></div>');
      lines.push('<div style="font-size:10px;opacity:0.9;margin-top:3px;display:flex;align-items:center;gap:4px;" title="Per-tool-result safety limit. GLIMPSE and Lightning Rod are whitelisted.">Guard KB:<input id="tm-tool-result-guard-kb" type="number" min="1" step="25" value="' + tmGetToolResultGuardKb() + '" style="width:52px;font-size:10px;background:#222;color:#fff;border:1px solid #555;border-radius:3px;padding:0 2px;" /></div>');

      const repairEnabled = localStorage.getItem('tm_gemini_repair_enabled') !== 'false';
      const repairColor = repairEnabled ? '#a0ffa0' : '#ffaaaa';
      const repairText = repairEnabled ? 'Gemini Repair: ON' : 'Gemini Repair: OFF';
      lines.push('<div style="font-size:10px;opacity:0.9;margin-top:4px;cursor:pointer;text-decoration:underline;color:' + repairColor + ';" data-action="toggle-gemini-repair">' + repairText + '</div>');

      el.innerHTML = lines.join('');

      // Wire up truncation input (needs change event, not click)
      var truncInput = el.querySelector('#tm-trunc-input');
      if (truncInput) {
        truncInput.addEventListener('change', function() { tmSetTruncationLimit(this.value); });
        truncInput.addEventListener('click', function(e) { e.stopPropagation(); });
      }
      var guardInput = el.querySelector('#tm-tool-result-guard-kb');
      if (guardInput) {
        guardInput.addEventListener('change', function() { this.value = tmSetToolResultGuardKb(this.value); });
        guardInput.addEventListener('click', function(e) { e.stopPropagation(); });
      }
      return;
    }

    let totalCost = 0;

    // Use up to the last 5 conversations, most recent first
    const ordered = convIds.slice(-5).reverse();
    const activeId = ordered[0];
    const otherIds = ordered.slice(1);

    let activeLine = null;
    const otherLines = [];

    ordered.forEach((convId, idx) => {
      const s = store[convId];
      const cachedPct = s.input > 0 ? ((s.cached / s.input) * 100).toFixed(1) : '0.0';
      const safeId = convId.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const cost = s.cost || 0;
      const ctxInput = s.lastContextInput || 0;
      const ctxPct = s.lastContextPct != null ? s.lastContextPct : 0;
      const ctxPctStr = ctxPct.toFixed ? ctxPct.toFixed(1) : ctxPct.toString();
      const ctxColor = ctxPct >= 75 ? '#ff8080' : (ctxPct >= 50 ? '#ffcf80' : '#a0ffa0');
      totalCost += cost;

      const rowHtml =
        '<div style="margin-bottom:3px;">' +
          '<span style="float:right;cursor:pointer;color:#ffaaaa;margin-left:6px;" data-conv-id="' + safeId + '">×</span>' +
          '<div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px;">' +
            safeId +
          '</div>' +
          '<div style="font-size:10px;opacity:0.85;">' +
            'in:' + s.input + ' cached:' + s.cached + ' (' + cachedPct + '%) out:' + s.output + ' · $' + cost.toFixed(4) +
          '</div>' +
          '<div style="font-size:10px;margin-top:1px;color:' + ctxColor + ';">' +
            'ctx:' + ctxInput + ' (' + ctxPctStr + '% of 400k)' +
          '</div>' +
        '</div>';

      if (idx === 0) {
        activeLine = rowHtml; // Always-visible active conversation
      } else {
        otherLines.push(rowHtml); // Candidates for collapsible region
      }
    });

    // Header + total are always visible
    lines.push('<div style="font-weight:bold;font-size:10px;margin-bottom:2px;">GPT-5.1 Conversations (v' + EXT_VERSION + ')</div>');
    lines.push('<div style="font-size:12px;opacity:0.9;margin-bottom:4px;">≈ Total cost: $' + totalCost.toFixed(4) + '</div>');

    // Active conversation row is always visible (never collapsible)
    if (activeLine) {
      lines.push(activeLine);
    }

    // Collapsible region for all OTHER conversations
    if (otherLines.length > 0) {
      const collapsed = el.dataset.othersCollapsed === 'true' || !el.dataset.othersCollapsed;
      const toggleLabel = collapsed
        ? 'Show other conversations (' + otherLines.length + ')'
        : 'Hide other conversations';

      lines.push(
        '<div style="font-size:10px;opacity:0.9;margin:2px 0 4px 0;cursor:pointer;text-decoration:underline;" data-toggle="others">' +
          toggleLabel +
        '</div>'
      );

      if (!collapsed) {
        otherLines.forEach(line => lines.push(line));
      }
    }

    lines.push('<div style="font-size:10px;opacity:0.9;margin-top:2px;cursor:pointer;text-decoration:underline;" data-action="open-payload-capture-modal">Copy payload…</div>');
    lines.push('<div style="font-size:10px;opacity:0.9;margin-top:2px;cursor:pointer;text-decoration:underline;color:#ffaaaa;" data-action="clear-gpt51-conversations">Clear ALL GPT-5.1 conversations</div>');
    lines.push('<div style="font-size:10px;opacity:0.9;margin-top:4px;display:flex;align-items:center;gap:4px;">Trunc:<input id="tm-trunc-input" type="number" min="100" step="500" value="' + tmGetTruncationLimit() + '" data-action="set-truncation-limit" style="width:52px;font-size:10px;background:#222;color:#fff;border:1px solid #555;border-radius:3px;padding:0 2px;" /></div>');
    lines.push('<div style="font-size:10px;opacity:0.9;margin-top:3px;display:flex;align-items:center;gap:4px;" title="Per-tool-result safety limit. GLIMPSE and Lightning Rod are whitelisted.">Guard KB:<input id="tm-tool-result-guard-kb" type="number" min="1" step="25" value="' + tmGetToolResultGuardKb() + '" style="width:52px;font-size:10px;background:#222;color:#fff;border:1px solid #555;border-radius:3px;padding:0 2px;" /></div>');

    const repairEnabled = localStorage.getItem('tm_gemini_repair_enabled') !== 'false';
    const repairColor = repairEnabled ? '#a0ffa0' : '#ffaaaa';
    const repairText = repairEnabled ? 'Gemini Repair: ON' : 'Gemini Repair: OFF';
    lines.push('<div style="font-size:10px;opacity:0.9;margin-top:4px;cursor:pointer;text-decoration:underline;color:' + repairColor + ';" data-action="toggle-gemini-repair">' + repairText + '</div>');

    el.innerHTML = lines.join('');

    // Wire up truncation input (needs change event, not click)
    var truncInput2 = el.querySelector('#tm-trunc-input');
    if (truncInput2) {
      truncInput2.addEventListener('change', function() { tmSetTruncationLimit(this.value); });
      truncInput2.addEventListener('click', function(e) { e.stopPropagation(); });
    }
    var guardInput2 = el.querySelector('#tm-tool-result-guard-kb');
    if (guardInput2) {
      guardInput2.addEventListener('change', function() { this.value = tmSetToolResultGuardKb(this.value); });
      guardInput2.addEventListener('click', function(e) { e.stopPropagation(); });
    }
  }

  // ==================== PAYLOAD TOOL FILTERS & MODAL ====================

  let lastSeenConversation = null;

  function getPayloadFilterStore() {
    try {
      const raw = localStorage.getItem('tm_payload_tool_filters');
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.warn('⚠️ [v' + EXT_VERSION + '] Failed to parse tm_payload_tool_filters from localStorage:', e);
      return {};
    }
  }

  function savePayloadFilterStore(store) {
    try {
      localStorage.setItem('tm_payload_tool_filters', JSON.stringify(store));
    } catch (e) {
      console.warn('⚠️ [v' + EXT_VERSION + '] Failed to save tm_payload_tool_filters to localStorage:', e);
    }
  }

  function conversationKey(vendor, convId) {
    return vendor + '::' + convId;
  }

  function getFilterForConversation(vendor, convId) {
    if (!vendor || !convId) {
      return { convId: null, vendor: null, toolEntries: {} };
    }
    const store = getPayloadFilterStore();
    const key = conversationKey(vendor, convId);
    return store[key] || { convId, vendor, toolEntries: {} };
  }

  function saveFilterForConversation(cfg) {
    if (!cfg || !cfg.vendor || !cfg.convId) return;
    const store = getPayloadFilterStore();
    const key = conversationKey(cfg.vendor, cfg.convId);
    store[key] = cfg;
    savePayloadFilterStore(store);
  }

  function deleteFilterConversation(convKey) {
    const store = getPayloadFilterStore();
    if (store[convKey]) {
      delete store[convKey];
      savePayloadFilterStore(store);
    }
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.notePayloadConversation-kdcg,
  //   role=__lambdao_1.notePayloadConversation,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Registers a conversation in the payload-filter store when tool groups are first seen in its payloads.,
  // ]
  function notePayloadConversation(vendor, convId, model) {
    if (!vendor || !convId) return;
    lastSeenConversation = { vendor, convId, model: model || null };
  }

  const TOOL_INPUT_STUB = { _tm_excluded: true, _tm_stub: true };
  const TOOL_OUTPUT_STUB = [{ type: 'text', text: '[tm_excluded_tool_output]' }];

  // @beacon[
  //   id=auto-beacon@__lambdao_1.collectAnthropicToolGroups-zhi0,
  //   role=__lambdao_1.collectAnthropicToolGroups,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Groups a body's tool_use/tool_result blocks into per-tool-call entries for the tool-filter modal.,
  // ]
  function collectAnthropicToolGroups(body) {
    const groups = {};
    if (!body || !Array.isArray(body.messages)) return groups;
    const messages = body.messages;

    messages.forEach((msg, msgIndex) => {
      if (!msg || !Array.isArray(msg.content)) return;
      msg.content.forEach((block, blockIndex) => {
        if (!block || !block.type) return;
        if (block.type === 'tool_use') {
          const id = block.id || ('m' + msgIndex + '_b' + blockIndex);
          const g = groups[id] || (groups[id] = {
            id,
            name: block.name || 'tool',
            toolUseBlocks: [],
            toolResultBlocks: [],
            inputSize: 0,
            outputSize: 0
          });
          g.toolUseBlocks.push({ msgIndex, blockIndex, blockRef: block });
          if (block.input !== undefined) {
            try { g.inputSize += JSON.stringify(block.input).length; } catch (e) {}
          }
        } else if (block.type === 'tool_result' && block.tool_use_id) {
          const id = block.tool_use_id;
          const g = groups[id] || (groups[id] = {
            id,
            name: block.name || 'tool',
            toolUseBlocks: [],
            toolResultBlocks: [],
            inputSize: 0,
            outputSize: 0
          });
          g.toolResultBlocks.push({ msgIndex, blockIndex, blockRef: block });
          if (block.content !== undefined) {
            try { g.outputSize += JSON.stringify(block.content).length; } catch (e) {}
          }
        }
      });
    });

    return groups;
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.applyAnthropicToolFilters-urhj,
  //   role=__lambdao_1.applyAnthropicToolFilters,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Applies the per-conversation tool filter: replaces excluded tool inputs/outputs with stubs so payloads slim down (one cache miss, then ongoing savings).,
  // ]
  function applyAnthropicToolFilters(body, vendor, convId) {
    if (!body || !Array.isArray(body.messages) || !vendor || !convId) return false;
    const groups = collectAnthropicToolGroups(body);
    const keys = Object.keys(groups);
    if (!keys.length) return false;

    const cfg = getFilterForConversation(vendor, convId);
    let changed = false;

    keys.forEach(id => {
      const g = groups[id];
      const entry = cfg.toolEntries[id] || { includeInput: true, includeOutput: true };

      if (!entry.includeInput) {
        g.toolUseBlocks.forEach(info => {
          const block = info.blockRef;
          if (block && block.input !== undefined && block.input !== TOOL_INPUT_STUB) {
            block.input = TOOL_INPUT_STUB;
            changed = true;
          }
        });
      }

      if (!entry.includeOutput) {
        g.toolResultBlocks.forEach(info => {
          const block = info.blockRef;
          if (block && block.content !== undefined && block.content !== TOOL_OUTPUT_STUB) {
            block.content = TOOL_OUTPUT_STUB;
            changed = true;
          }
        });
      }

      cfg.toolEntries[id] = entry;
    });

    if (changed) {
      saveFilterForConversation(cfg);
    }

    return changed;
  }

  // ==================== OVERSIZED TOOL-RESULT SAFETY GUARD (v4.280) ====================
  // Wire-only and stateless: TypingMind retains the original result in AssemblyDB, so every
  // natural outbound turn presents it again. We regenerate the same deterministic stub unless a
  // persisted assistant recovery line cites that exact tool-call id. No result bytes are cached.
  function tmUtf8ByteLength(value) {
    var s = (typeof value === 'string') ? value : String(value == null ? '' : value);
    try { return new TextEncoder().encode(s).length; } catch (e) {}
    try { return unescape(encodeURIComponent(s)).length; } catch (e2) { return s.length; }
  }

  function tmStableJson(value) {
    function normalize(x, seen) {
      if (x == null || typeof x !== 'object') return x;
      if (seen.indexOf(x) !== -1) return '[Circular]';
      seen.push(x);
      var out;
      if (Array.isArray(x)) {
        out = x.map(function(v) { return normalize(v, seen); });
      } else {
        out = {};
        Object.keys(x).sort().forEach(function(k) { out[k] = normalize(x[k], seen); });
      }
      seen.pop();
      return out;
    }
    try { return JSON.stringify(normalize(value, [])); } catch (e) { return String(value); }
  }

  function tmToolNameIsLargeResultWhitelisted(name) {
    var n = String(name || '').trim().toLowerCase();
    if (!n) return false;
    if (n === 'glimpse' || n === 'lightning_rod' || n === 'workflowy_glimpse') return true;
    return /(?:^|[.:/])glimpse$/.test(n) || /(?:^|[.:/])lightning_rod$/.test(n) ||
      /__glimpse$/.test(n) || /__lightning_rod$/.test(n);
  }

  function tmToolResultText(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      var parts = [];
      for (var i = 0; i < content.length; i++) {
        var b = content[i];
        if (typeof b === 'string') parts.push(b);
        else if (b && typeof b.text === 'string') parts.push(b.text);
        else if (b && typeof b.content === 'string') parts.push(b.content);
        else if (b != null) parts.push(tmStableJson(b));
      }
      return parts.join('\n');
    }
    return tmStableJson(content);
  }

  function tmClipSampleLine(line) {
    var s = String(line == null ? '' : line);
    return s.length > 500 ? (s.slice(0, 500) + ' …[line clipped]') : s;
  }

  function tmBuildThreePointToolSample(content) {
    var text = tmToolResultText(content).replace(/\r\n?/g, '\n');
    var lines = text.split('\n');
    if (!lines.length) lines = [''];
    function take(start, count) {
      var out = [];
      for (var i = start; i < Math.min(start + count, lines.length); i++) out.push(tmClipSampleLine(lines[i]));
      return out.join('\n');
    }
    if (lines.length <= 9) return take(0, lines.length);
    var midStart = Math.max(0, Math.floor((lines.length - 3) / 2));
    return take(0, 3) + '\n… [middle sample] …\n' + take(midStart, 3) +
      '\n… [end sample] …\n' + take(lines.length - 3, 3);
  }

  function tmBuildOversizedToolStub(meta, content, sizeBytes, limitBytes, at) {
    var args = tmStableJson(meta.args == null ? {} : meta.args);
    if (args.length > 4000) args = args.slice(0, 4000) + '…[arguments clipped]';
    return '[TM OVERSIZED TOOL RESULT SAFETY]\n' +
      'Tool: ' + String(meta.name || 'unknown_tool') + '\n' +
      'Tool call ID: ' + String(meta.id || 'unknown') + '\n' +
      (at ? ('Payload location: ' + String(at) + '\n') : '') +
      'Serialized result size: ' + sizeBytes + ' bytes (' + (sizeBytes / 1024).toFixed(1) + ' KB)\n' +
      'Configured safety limit: ' + limitBytes + ' bytes (' + (limitBytes / 1024).toFixed(1) + ' KB)\n' +
      'Arguments: ' + args + '\n\n' +
      'The full result was withheld to prevent accidental context exhaustion. A deterministic sample follows.\n' +
      '--- SAMPLE: START / MIDDLE / END ---\n' + tmBuildThreePointToolSample(content) + '\n' +
      '--- END SAMPLE ---\n\n' +
      'If the complete original result is truly required, your next assistant message must be exactly this single line:\n' +
      'Please restore tool result ' + String(meta.id || 'unknown');
  }

  function tmCollectRecoveryToolIds(body) {
    var ids = {};
    var re = /(?:^|\n)\s*Please restore tool result\s+([^\s]+)\s*(?=$|\n)/g;
    function scanText(text) {
      if (typeof text !== 'string') return;
      re.lastIndex = 0;
      var m;
      while ((m = re.exec(text)) !== null) ids[String(m[1])] = true;
    }
    function scanMessage(msg) {
      if (!msg || (msg.role !== 'assistant' && msg.role !== 'model')) return;
      if (typeof msg.content === 'string') scanText(msg.content);
      if (Array.isArray(msg.content)) msg.content.forEach(function(b) {
        if (b && typeof b.text === 'string' && (b.type === 'text' || b.type === 'output_text' || !b.type)) scanText(b.text);
      });
      if (Array.isArray(msg.parts)) msg.parts.forEach(function(p) { if (p && typeof p.text === 'string' && !p.thought) scanText(p.text); });
    }
    if (Array.isArray(body && body.messages)) body.messages.forEach(scanMessage);
    if (Array.isArray(body && body.input)) body.input.forEach(scanMessage);
    if (Array.isArray(body && body.contents)) body.contents.forEach(scanMessage);
    return ids;
  }

  // (v4.283) Gemini-native contents[] tool pairing. Gemini carries NO tool-call IDs: model turns
  // hold parts[].functionCall and the following user turn answers POSITIONALLY via
  // parts[].functionResponse (matched by name + order). We synthesize deterministic IDs
  // 'gm-<name>-<n>' (n = per-name occurrence across the conversation) -- byte-stable across turns
  // for the same history, and unique even for identical parallel calls with identical args.
  function tmWalkGeminiToolPairs(body, onCall, onResult) {
    if (!body || !Array.isArray(body.contents)) return;
    var nameCounts = {};
    var pending = []; // queue of {id, name} from model functionCalls awaiting their functionResponse
    function nextId(name) {
      nameCounts[name] = (nameCounts[name] || 0) + 1;
      return 'gm-' + name + '-' + nameCounts[name];
    }
    body.contents.forEach(function(node, nodeIndex) {
      if (!node || !Array.isArray(node.parts)) return;
      var isModel = (node.role === 'model');
      node.parts.forEach(function(part, partIndex) {
        if (!part) return;
        if (isModel && part.functionCall && part.functionCall.name) {
          var cname = String(part.functionCall.name);
          var cid = nextId(cname);
          pending.push({ id: cid, name: cname });
          if (onCall) onCall(cid, cname, part.functionCall.args);
        } else if (!isModel && part.functionResponse && part.functionResponse.name) {
          var rname = String(part.functionResponse.name);
          // Match the earliest pending call with this name (positional protocol); orphan -> synthesize.
          var idx = -1;
          for (var i = 0; i < pending.length; i++) { if (pending[i].name === rname) { idx = i; break; } }
          var rid;
          if (idx >= 0) { rid = pending[idx].id; pending.splice(idx, 1); }
          else { rid = nextId(rname); }
          if (onResult) onResult(rid, rname, part, 'contents[' + nodeIndex + '].parts[' + partIndex + ']');
        }
      });
    });
  }

  function tmCollectToolCallMetadata(body) {
    var map = {};
    function put(id, name, args) {
      if (!id) return;
      map[String(id)] = { id: String(id), name: name || 'unknown_tool', args: args == null ? {} : args };
    }
    if (Array.isArray(body && body.messages)) {
      body.messages.forEach(function(msg) {
        if (!msg) return;
        if (Array.isArray(msg.tool_calls)) msg.tool_calls.forEach(function(tc) {
          if (!tc) return;
          var fn = tc.function || {};
          var parsedArgs = fn.arguments;
          if (typeof parsedArgs === 'string') { try { parsedArgs = JSON.parse(parsedArgs); } catch (e) {} }
          put(tc.id || tc.call_id, fn.name || tc.name, parsedArgs);
        });
        if (Array.isArray(msg.content)) msg.content.forEach(function(block) {
          if (!block) return;
          if (block.type === 'tool_use') put(block.id, block.name, block.input);
          if (block.type === 'function_call') {
            var a = block.arguments;
            if (typeof a === 'string') { try { a = JSON.parse(a); } catch (e) {} }
            put(block.call_id || block.id, block.name, a);
          }
        });
      });
    }
    if (Array.isArray(body && body.input)) body.input.forEach(function(item) {
      if (!item) return;
      if (item.type === 'function_call') {
        var a = item.arguments;
        if (typeof a === 'string') { try { a = JSON.parse(a); } catch (e) {} }
        put(item.call_id || item.id, item.name, a);
      }
      if (Array.isArray(item.content)) item.content.forEach(function(block) {
        if (!block || block.type !== 'function_call') return;
        var a2 = block.arguments;
        if (typeof a2 === 'string') { try { a2 = JSON.parse(a2); } catch (e) {} }
        put(block.call_id || block.id, block.name, a2);
      });
    });
    // (v4.283) Gemini-native contents[]: synthetic deterministic call IDs via positional pairing.
    tmWalkGeminiToolPairs(body, function(id, name, args) { put(id, name, args); }, null);
    return map;
  }

  // (v4.290) Remove consumed recovery-phrase messages from the wire once their result is
  // restored. Two safety rules: strip ONLY a message whose entire content is exactly the phrase,
  // and NEVER when removal would create consecutive same-role neighbors (Anthropic/Gemini role
  // alternation 400s -- e.g. phrase between a tool_result user message and a 'continue' user
  // message must be left in place). Deterministic: same history -> same decision, every turn.
  function tmStripConsumedRecoveryPhrases(body, recoveredIdMap) {
    var removed = 0;
    function phraseOf(text) {
      if (typeof text !== 'string') return null;
      var m = text.trim().match(/^Please restore tool result\s+([^\s]+)$/);
      return (m && recoveredIdMap[String(m[1])]) ? String(m[1]) : null;
    }
    function wholeMessagePhrase(msg) {
      if (!msg) return false;
      if (typeof msg.content === 'string') return !!phraseOf(msg.content);
      if (Array.isArray(msg.content) && msg.content.length === 1) {
        var b = msg.content[0];
        if (b && typeof b.text === 'string' && (b.type === 'text' || b.type === 'output_text' || !b.type)) return !!phraseOf(b.text);
      }
      if (Array.isArray(msg.parts) && msg.parts.length === 1) {
        var p = msg.parts[0];
        if (p && typeof p.text === 'string' && !p.thought) return !!phraseOf(p.text);
      }
      return false;
    }
    function stripFrom(arr, roleOf) {
      if (!Array.isArray(arr)) return;
      for (var i = arr.length - 1; i >= 0; i--) {
        var msg = arr[i];
        if (!msg) continue;
        var role = roleOf(msg);
        if (role !== 'assistant' && role !== 'model') continue;
        if (!wholeMessagePhrase(msg)) continue;
        var prev = i > 0 ? roleOf(arr[i - 1]) : null;
        var next = i < arr.length - 1 ? roleOf(arr[i + 1]) : null;
        if (prev && next && prev === next) continue; // alternation hazard: keep the message
        arr.splice(i, 1);
        removed++;
      }
    }
    if (Array.isArray(body.messages)) stripFrom(body.messages, function(m) { return m && m.role; });
    if (Array.isArray(body.input)) stripFrom(body.input, function(m) { return m && m.role; });
    if (Array.isArray(body.contents)) stripFrom(body.contents, function(n) { return n && (n.role === 'model' ? 'model' : 'user'); });
    return removed;
  }

  function tmApplyOversizedToolResultGuard(body) {
    var report = { changed: false, stubbed: [], recovered: [], whitelisted: [] };
    if (!body || typeof body !== 'object') return report;
    var limitBytes = tmGetToolResultGuardKb() * 1024;
    var recoveryIds = tmCollectRecoveryToolIds(body);
    var callMap = tmCollectToolCallMetadata(body);

    function processResult(id, content, replace, opts) {
      opts = opts || {};
      id = String(id || 'unknown');
      var meta = callMap[id] || { id: id, name: 'unknown_tool', args: {} };
      if (tmToolNameIsLargeResultWhitelisted(meta.name)) {
        report.whitelisted.push({ id: id, name: meta.name });
        return;
      }
      var sizeBytes;
      if (typeof opts.sizeBytes === 'number') {
        sizeBytes = opts.sizeBytes;
      } else {
        var serialized;
        try { serialized = JSON.stringify(content); } catch (e) { serialized = String(content); }
        sizeBytes = tmUtf8ByteLength(serialized);
      }
      if (sizeBytes <= limitBytes) return;
      if (recoveryIds[id]) {
        report.recovered.push({ id: id, name: meta.name, bytes: sizeBytes, at: opts.at || null });
        return;
      }
      var sampleSource = (opts.sampleContent != null) ? opts.sampleContent : content;
      var stub = tmBuildOversizedToolStub(meta, sampleSource, sizeBytes, limitBytes, opts.at);
      replace(stub);
      report.changed = true;
      report.stubbed.push({ id: id, name: meta.name, bytes: sizeBytes, at: opts.at || null });
    }

    if (Array.isArray(body.messages)) body.messages.forEach(function(msg, msgIndex) {
      if (!msg) return;
      if (msg.role === 'tool' && (msg.tool_call_id || msg.call_id)) {
        processResult(msg.tool_call_id || msg.call_id, msg.content, function(stub) { msg.content = stub; }, { at: 'messages[' + msgIndex + ']' });
      }
      if (Array.isArray(msg.content)) msg.content.forEach(function(block, blockIndex) {
        if (!block || block.type !== 'tool_result' || !block.tool_use_id) return;
        processResult(block.tool_use_id, block.content, function(stub) {
          block.content = [{ type: 'text', text: stub }];
        }, { at: 'messages[' + msgIndex + '].content[' + blockIndex + ']' });
      });
    });

    if (Array.isArray(body.input)) body.input.forEach(function(item, inputIndex) {
      if (!item) return;
      if (item.type === 'function_call_output' && (item.call_id || item.id)) {
        processResult(item.call_id || item.id, item.output, function(stub) { item.output = stub; }, { at: 'input[' + inputIndex + ']' });
      } else if (item.role === 'tool' && (item.tool_call_id || item.call_id)) {
        processResult(item.tool_call_id || item.call_id, item.content, function(stub) { item.content = stub; }, { at: 'input[' + inputIndex + ']' });
      }
    });

    // (v4.283) Gemini-native contents[]: measure/stub/restore parts[].functionResponse with the
    // same policy. Size is measured on the full serialized response node; the 3-point sample is
    // built from the joined response.content[].text so it reads like the real tool output.
    tmWalkGeminiToolPairs(body, null, function(id, name, part, at) {
      var resp = part && part.functionResponse ? part.functionResponse.response : null;
      var serialized;
      try { serialized = JSON.stringify(resp); } catch (e) { serialized = String(resp); }
      var sizeBytes = tmUtf8ByteLength(serialized);
      var sampleText;
      try {
        if (resp && Array.isArray(resp.content)) {
          sampleText = resp.content.map(function(c) { return (c && typeof c.text === 'string') ? c.text : tmStableJson(c); }).join('\n');
        } else {
          sampleText = (typeof resp === 'string') ? resp : tmStableJson(resp);
        }
      } catch (e) { sampleText = serialized; }
      processResult(id, resp, function(stub) {
        part.functionResponse.response = { name: name, content: [{ text: stub }] };
      }, { sizeBytes: sizeBytes, sampleContent: sampleText, at: at || null });
    });

    if (report.stubbed.length) console.warn('🛡️ [v' + EXT_VERSION + '] Withheld ' + report.stubbed.length + ' oversized tool result(s):', report.stubbed);
    if (report.recovered.length) {
      console.log('✅ [v' + EXT_VERSION + '] Recovery phrase found; passing full tool result(s):', report.recovered);
      // (v4.290) Remove the consumed phrase message(s) from the wire where role-alternation-safe.
      try {
        var recoveredIdMap = {};
        report.recovered.forEach(function(x) { recoveredIdMap[String(x.id)] = true; });
        var strippedPhrases = tmStripConsumedRecoveryPhrases(body, recoveredIdMap);
        if (strippedPhrases > 0) {
          report.changed = true;
          report.phrases_stripped = strippedPhrases;
          console.log('✂️ [v' + EXT_VERSION + '] Stripped ' + strippedPhrases + ' consumed recovery-phrase message(s) from outbound payload (kept in AssemblyDB).');
        }
      } catch (eStrip) {}
    }
    return report;
  }

  function humanReadableSize(bytes) {
    if (!bytes || isNaN(bytes)) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    const kb = bytes / 1024;
    if (kb < 1024) return kb.toFixed(1) + ' KB';
    const mb = kb / 1024;
    return mb.toFixed(2) + ' MB';
  }

  let payloadModalEl = null;
  let payloadModalInnerEl = null;

  // @beacon[
  //   id=auto-beacon@__lambdao_1.ensurePayloadModal-xwhd,
  //   role=__lambdao_1.ensurePayloadModal,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Builds the tool-filter modal DOM (per-tool-call include/exclude toggles with byte sizes).,
  // ]
  function ensurePayloadModal() {
    if (payloadModalEl) return payloadModalEl;

    const overlay = document.createElement('div');
    overlay.id = 'tm-payload-modal-overlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '100000';
    overlay.style.background = 'rgba(0,0,0,0.55)';
    overlay.style.display = 'none';

    const panel = document.createElement('div');
    panel.id = 'tm-payload-modal';
    panel.style.position = 'absolute';
    panel.style.top = '50%';
    panel.style.left = '50%';
    panel.style.transform = 'translate(-50%, -50%)';
    panel.style.width = '80vw';
    panel.style.height = '80vh';
    panel.style.background = 'rgba(15,15,20,0.96)';
    panel.style.color = '#fff';
    panel.style.borderRadius = '6px';
    panel.style.boxShadow = '0 4px 16px rgba(0,0,0,0.6)';
    panel.style.padding = '10px 12px';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    panel.style.fontSize = '12px';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.marginBottom = '6px';
    header.innerHTML =
      '<div style="font-weight:600;">Payload Tool Filters</div>' +
      '<div style="font-size:11px;opacity:0.8;">' +
      'Use this to exclude large tool inputs/outputs from future payloads while keeping prompt caching viable.' +
      '</div>' +
      '<button data-action="close-payload-modal" ' +
      'style="margin-left:8px;background:#444;color:#fff;border:none;border-radius:3px;padding:2px 6px;font-size:11px;cursor:pointer;">Close</button>';

    const body = document.createElement('div');
    body.id = 'tm-payload-modal-body';
    body.style.flex = '1';
    body.style.overflow = 'auto';
    body.style.marginTop = '4px';

    panel.appendChild(header);
    panel.appendChild(body);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // Remove old escape handler; we add a fresh one on each open.
    if (tmPayloadCaptureModalEscapeHandler) {
      window.removeEventListener('keyup', tmPayloadCaptureModalEscapeHandler, true);
      tmPayloadCaptureModalEscapeHandler = null;
    }

    overlay.addEventListener('click', function(ev) {
      const t = ev.target;
      if (t.dataset && t.dataset.action === 'close-payload-modal') {
        closePayloadModal();
        ev.stopPropagation();
        return;
      }
      if (t === overlay) {
        closePayloadModal();
        return;
      }
      if (t.dataset && t.dataset.action === 'delete-payload-conv') {
        const convKey = t.dataset.convKey;
        deleteFilterConversation(convKey);
        renderPayloadModal();
        ev.stopPropagation();
        return;
      }
      if (t.dataset && t.dataset.part && t.dataset.groupId) {
        const part = t.dataset.part; // "input" or "output"
        const groupId = t.dataset.groupId;
        if (!lastSeenConversation || !lastSeenConversation.vendor || !lastSeenConversation.convId) {
          return;
        }
        const cfg = getFilterForConversation(lastSeenConversation.vendor, lastSeenConversation.convId);
        const entry = cfg.toolEntries[groupId] || { includeInput: true, includeOutput: true };
        if (part === 'input') {
          entry.includeInput = !entry.includeInput;
        } else if (part === 'output') {
          entry.includeOutput = !entry.includeOutput;
        }
        cfg.toolEntries[groupId] = entry;
        saveFilterForConversation(cfg);
        renderPayloadModal();
        ev.stopPropagation();
        return;
      }
    });

    payloadModalEl = overlay;
    payloadModalInnerEl = body;
    return overlay;
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.renderPayloadModal-iaf2,
  //   role=__lambdao_1.renderPayloadModal,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Renders the tool-filter modal rows with inclusion state and size totals.,
  // ]
  function renderPayloadModal() {
    if (typeof document === 'undefined') return;
    const overlay = ensurePayloadModal();
    const bodyEl = payloadModalInnerEl;
    if (!bodyEl) return;

    const store = getPayloadFilterStore();
    const convKeys = Object.keys(store);

    let html = '';

    // Global conversation list
    html += '<div style="margin-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.15);padding-bottom:4px;">';
    html += '<div style="font-weight:600;margin-bottom:2px;">Tracked conversations</div>';
    if (!convKeys.length) {
      html += '<div style="font-size:11px;opacity:0.8;">No payload filter state yet. Open a conversation and toggle tool filters to create entries.</div>';
    } else {
      convKeys.forEach(key => {
        const cfg = store[key] || {};
        const safeLabel = ((cfg.vendor || '?') + ' :: ' + (cfg.convId || key)).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html += '<div style="font-size:11px;margin-bottom:2px;display:flex;align-items:center;justify-content:space-between;">' +
          '<span style="max-width:80%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + safeLabel + '</span>' +
          '<button data-action="delete-payload-conv" data-conv-key="' + key + '" ' +
          'style="margin-left:6px;background:#552222;color:#fff;border:none;border-radius:3px;padding:1px 4px;font-size:10px;cursor:pointer;">Delete</button>' +
          '</div>';
      });
    }
    html += '</div>';

    // Current conversation section
    html += '<div>';
    html += '<div style="font-weight:600;margin-bottom:2px;">Current conversation</div>';

    if (!lastSeenConversation || !lastSeenConversation.vendor || !lastSeenConversation.convId) {
      html += '<div style="font-size:11px;opacity:0.8;">No active conversation detected yet. Send a message (with your usual "load files &lt;id&gt;" pattern) and try again.</div>';
      html += '</div>';
      bodyEl.innerHTML = html;
      return;
    }

    const vendor = lastSeenConversation.vendor;
    const convId = lastSeenConversation.convId;
    const model = lastSeenConversation.model || '';
    const headerLine = '[' + vendor + '] ' + convId + (model ? (' · ' + model) : '');
    html += '<div style="font-size:11px;opacity:0.9;margin-bottom:4px;">' + headerLine + '</div>';

    if (vendor !== 'anthropic') {
      html += '<div style="font-size:11px;opacity:0.8;">Tool payload filtering is currently implemented for Anthropic. This conversation is ' + vendor + ', so only global management applies for now.</div>';
      html += '</div>';
      bodyEl.innerHTML = html;
      return;
    }

    if (!lastAnthropicBodyForExport || !Array.isArray(lastAnthropicBodyForExport.messages)) {
      html += '<div style="font-size:11px;opacity:0.8;">No cached Anthropic payload for this conversation yet. Send a message and try again.</div>';
      html += '</div>';
      bodyEl.innerHTML = html;
      return;
    }

    const groups = collectAnthropicToolGroups(lastAnthropicBodyForExport);
    const ids = Object.keys(groups);
    if (!ids.length) {
      html += '<div style="font-size:11px;opacity:0.8;">No tool calls found in the latest Anthropic payload for this conversation.</div>';
      html += '</div>';
      bodyEl.innerHTML = html;
      return;
    }

    const cfg = getFilterForConversation(vendor, convId);

    html += '<div style="font-size:11px;opacity:0.9;margin-bottom:2px;">Tool calls in latest Anthropic payload</div>';
    html += '<div style="font-size:10px;opacity:0.8;margin-bottom:4px;">Toggle input/output to exclude large arguments from future payloads. Excluded parts will be replaced with small constant stubs to preserve prompt caching.</div>';

    ids.forEach(id => {
      const g = groups[id];
      const entry = cfg.toolEntries[id] || { includeInput: true, includeOutput: true };
      const safeId = id.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const name = (g.name || 'tool').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const inSize = humanReadableSize(g.inputSize);
      const outSize = humanReadableSize(g.outputSize);

      const bothIncluded = entry.includeInput && entry.includeOutput;
      const bothExcluded = !entry.includeInput && !entry.includeOutput;

      let rowBg = 'rgba(20,40,24,0.85)'; // both included
      if (bothExcluded) {
        rowBg = 'rgba(40,40,40,0.85)';
      } else if (!entry.includeInput || !entry.includeOutput) {
        rowBg = 'rgba(32,32,32,0.85)';
      }

      const inputBg = entry.includeInput ? '#245f36' : '#444444';
      const outputBg = entry.includeOutput ? '#245f36' : '#444444';

      html += '<div style="margin-bottom:4px;padding:4px;border-radius:4px;background:' + rowBg + ';">';
      html += '<div style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
              name + ' <span style="opacity:0.7;font-weight:400;">[' + safeId + ']</span></div>';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:2px;font-size:11px;">';
      html += '<div>in: ' + inSize + ' · out: ' + outSize + '</div>';
      html += '<div>';
      html += '<button data-group-id="' + id + '" data-part="input" ' +
              'style="margin-left:4px;background:' + inputBg + ';color:#fff;border:none;border-radius:3px;padding:1px 6px;font-size:10px;cursor:pointer;">In</button>';
      html += '<button data-group-id="' + id + '" data-part="output" ' +
              'style="margin-left:4px;background:' + outputBg + ';color:#fff;border:none;border-radius:3px;padding:1px 6px;font-size:10px;cursor:pointer;">Out</button>';
      html += '</div>';
      html += '</div>';
      html += '</div>';
    });

    html += '</div>';
    bodyEl.innerHTML = html;
  }

  function openPayloadModal() {
    if (typeof document === 'undefined') return;
    const overlay = ensurePayloadModal();
    overlay.style.display = 'block';
    renderPayloadModal();
  }

  function closePayloadModal() {
    if (!payloadModalEl) return;
    payloadModalEl.style.display = 'none';
  }

  // ==================== PAYLOAD CAPTURE MODAL (RING BUFFER) ====================

  let payloadCaptureModalEl = null;
  let payloadCaptureModalInnerEl = null;

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.ensurePayloadCaptureModal-l2it,
  //   role=__lambdao_1.ensurePayloadCaptureModal,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Builds the ring-buffer modal DOM including the model→provider map row, retry-visibility toggle, and per-entry copy buttons.,
  // ]
  function ensurePayloadCaptureModal() {
    if (payloadCaptureModalEl) return payloadCaptureModalEl;

    const overlay = document.createElement('div');
    overlay.id = 'tm-payload-capture-modal-overlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '100001';
    overlay.style.background = 'rgba(0,0,0,0.55)';
    overlay.style.display = 'none';

    const panel = document.createElement('div');
    panel.id = 'tm-payload-capture-modal';
    panel.style.position = 'absolute';
    panel.style.top = '50%';
    panel.style.left = '13vw';
    panel.style.transform = 'translateY(-50%)';
    panel.style.width = '58vw';
    panel.style.border = '2px solid rgba(255,255,255,0.18)';
    panel.style.height = '86vh';
    panel.style.background = 'rgba(15,15,20,0.96)';
    panel.style.color = '#fff';
    panel.style.borderRadius = '6px';
    panel.style.boxShadow = '0 4px 16px rgba(0,0,0,0.6)';
    panel.style.padding = '10px 12px';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    panel.style.fontSize = '12px';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.marginBottom = '6px';
    header.innerHTML =
      '<div style="font-weight:600;">Payload Capture Ring Buffer</div>' +
      '<div style="font-size:11px;opacity:0.8;">' +
      'Most recent first. Copy outbound/request + inbound/response pieces for debugging.' +
      '</div>' +
      '<button data-action="close-payload-capture-modal" ' +
      'style="margin-left:8px;background:#444;color:#fff;border:none;border-radius:3px;padding:2px 6px;font-size:11px;cursor:pointer;">Close</button>';

    const body = document.createElement('div');
    body.id = 'tm-payload-capture-modal-body';
    body.style.flex = '1';
    body.style.overflow = 'auto';
    body.style.marginTop = '4px';

    panel.appendChild(header);
    panel.appendChild(body);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    payloadCaptureModalEl = overlay;
    payloadCaptureModalInnerEl = body;

    overlay.addEventListener('click', function(ev) {
      const t = ev.target;
      if (!t) return;

      // Click outside panel closes
      if (t === overlay) {
        closePayloadCaptureModal();
        return;
      }

      // (v4.271) Custom session-Filter listbox: trigger toggle, option selection, click-away.
      // Resolved via closest() because listbox rows contain child <span>s -- deliberately does
      // NOT fight the modal's own delegated data-action click handling. Selection writes
      // tmModalFilterIdentity then re-renders (identical to the old set-modal-filter handler).
      if (t && t.closest) {
        var lbEl = t.closest('[data-action="toggle-modal-filter-listbox"], [data-action="set-modal-filter-listbox"]');
        if (lbEl && lbEl.dataset) {
          if (lbEl.dataset.action === 'toggle-modal-filter-listbox') {
            tmModalFilterListboxOpen = !tmModalFilterListboxOpen;
            renderPayloadCaptureModal();
            ev.stopPropagation();
            return;
          }
          if (lbEl.dataset.action === 'set-modal-filter-listbox') {
            tmModalFilterIdentity = lbEl.dataset.identityKey || null;
            tmModalFilterListboxOpen = false;
            renderPayloadCaptureModal();
            ev.stopPropagation();
            return;
          }
        }
        // Click-away: if the listbox is open and this click is nowhere on it, dismiss it.
        if (tmModalFilterListboxOpen &&
            !t.closest('[data-role="modal-filter-listbox"], [data-action="toggle-modal-filter-listbox"]')) {
          tmModalFilterListboxOpen = false;
          renderPayloadCaptureModal();
          ev.stopPropagation();
          return;
        }
      }

      if (t.dataset && t.dataset.action === 'close-payload-capture-modal') {
        closePayloadCaptureModal();
        return;
      }

      // (v4.210) Toggle retry/429 row visibility and re-render.
      if (t.dataset && t.dataset.action === 'toggle-hide-retries') {
        tmSetHideRetries(!tmGetHideRetries());
        renderPayloadCaptureModal();
        ev.stopPropagation();
        return;
      }

      // (v4.270) Toggle the OpenRouter→Gemini hard block (default ON). Persisted to localStorage;
      // the fetch override reads it on every request. Re-render to reflect the new state.
      if (t.dataset && t.dataset.action === 'toggle-or-gemini-block') {
        try {
          var nextOn = !tmShouldBlockOpenRouterGemini();
          localStorage.setItem(TM_BLOCK_OR_GEMINI_KEY, nextOn ? 'true' : 'false');
          console.log('\uD83D\uDEAB [v' + EXT_VERSION + '] OpenRouter→Gemini hard block: ' + (nextOn ? 'ON (blocked)' : 'OFF (allowed -- testing only)'));
        } catch (eT) {}
        renderPayloadCaptureModal();
        ev.stopPropagation();
        return;
      }

      // (v4.226) Model→Provider map dropdown handlers are handled in the change listener below.

      if (t.dataset && t.dataset.action === 'copy-payload-capture') {
        const capId = t.dataset.captureId;
        const part = t.dataset.part;
        if (!capId || !part) return;
        copyPayloadCapturePart(capId, part);
        return;
      }

      // Click-to-copy for the enable/disable console commands shown in the empty-state notice.
      if (t.dataset && t.dataset.action === 'copy-plain-text') {
        const txt = t.dataset.copyText || t.textContent || '';
        if (txt) copyTextToClipboard(txt, 'console command');
        return;
      }

      // (v4.297) Context dial: set/clear the per-model max-context override.
      if (t.dataset && t.dataset.action === 'ctx-dial-set') {
        tmCtxDialPromptSet(t.dataset.model || '', t.dataset.provider || '');
        ev.stopPropagation();
        return;
      }

      // (v4.134) Set a human-readable name for the session.
      if (t.dataset && t.dataset.action === 'set-session-name') {
        var sid = t.dataset.sessionId;
        if (sid) {
          var currentName = tmGetSessionName(sid);
          tmPromptActive = true;
          var newName = prompt('Session name for ' + sid + ':', currentName || '');
          // Native prompt() closes on Escape, but the corresponding keyup can arrive after
          // prompt() returns. Suppress that trailing Escape so it does not also close the
          // ring-buffer modal underneath the rename prompt.
          tmPayloadCaptureSuppressEscapeUntil = Date.now() + 1500;
          // Delay resetting the flag so the immediate keyup escape handler still sees it.
          setTimeout(function() { tmPromptActive = false; }, 100);
          if (newName !== null) {
            tmSetSessionName(sid, newName);
            renderPayloadCaptureModal();
            renderGpt51UsageWidget();
          }
        }
        return;
      }

      // (v4.229) Open the provider ratings modal.
      if (t.dataset && t.dataset.action === 'show-provider-ratings') {
        tmShowProviderRatingsModal();
        ev.stopPropagation();
        return;
      }
      // (v4.233) Open the Set Costs modal.
      if (t.dataset && t.dataset.action === 'show-cost-editor') {
        tmShowCostEditorModal();
        ev.stopPropagation();
        return;
      }
    });

    // v4.162: Change handler for Sol reasoning effort dropdown + v4.163: identity filter dropdown.
    overlay.addEventListener('change', function(ev) {
      var t = ev.target;
      // (v4.206) Provider-routing dropdowns now live in the ring modal too (shared handler).
      if (t && t.dataset && t.dataset.action === 'set-provider-routing') {
        tmHandleProviderRoutingChange(t);
        ev.stopPropagation();
        return;
      }
      if (t && t.dataset && t.dataset.action === 'set-sol-reasoning-effort') {
        var newLevel = t.value;
        if (newLevel && (newLevel === 'medium' || newLevel === 'high' || newLevel === 'xhigh' || newLevel === 'max')) {
          tmSetSolReasoningEffort(newLevel);
          console.log('✅ [v' + EXT_VERSION + '] Sol reasoning effort set to: ' + newLevel);
        }
        ev.stopPropagation();
      }
      // (v4.224) Time-window filter dropdown
      if (t && t.dataset && t.dataset.action === 'set-modal-time-filter') {
        tmModalTimeFilter = t.value || 'all';
        renderPayloadCaptureModal();
        ev.stopPropagation();
      }
      // (v4.226) Model→Provider map: model dropdown changed — populate provider dropdown.
      if (t && t.dataset && t.dataset.action === 'set-mpm-model') {
        var mpmModel = t.value || '';
        var mpmProviderSelect = document.getElementById('tm-mpm-provider-select');
        if (mpmProviderSelect && mpmModel) {
          // Kick off live discovery for this model so the provider list is fresh.
          try { tmMaybeFetchProviderEndpoints(mpmModel); } catch (e) {}
          var mpmEntries = tmGetProviderEntries(mpmModel);
          var mpmHtml = '<option value="">— select provider —</option>';
          var mpmCurrentSlug = tmGetModelProvider(mpmModel.toLowerCase().replace(/:(nitro|floor|free)$/i, ''));
          for (var mpei = 0; mpei < mpmEntries.length; mpei++) {
            var mpe = mpmEntries[mpei];
            var badge = mpe.cache ? '\uD83D\uDFE2' : '\u26D4';
            var mpmSel = (mpmCurrentSlug === mpe.slug) ? ' selected' : '';
            // (v4.238) Append the provider's max-context window as a parenthetical so Dan can pick
            // the provider that can actually serve a long conversation at a glance.
            var mpeCtx = (mpe.maxContext != null) ? (' (ctx: ' + tmFmtCtx(mpe.maxContext) + ')') : '';
            mpmHtml += '<option value="' + escapeHtml(mpe.slug) + '"' + mpmSel + '>' + badge + ' ' + escapeHtml(mpe.label) + mpeCtx + '</option>';
          }
          mpmProviderSelect.innerHTML = mpmHtml;
        }
        ev.stopPropagation();
      }
      // (v4.226) Model→Provider map: provider dropdown changed — save the mapping.
      if (t && t.dataset && t.dataset.action === 'set-mpm-provider') {
        var mpmSlug = t.value || '';
        var mpmModelSel = document.getElementById('tm-mpm-model-select');
        var mpmSelectedModel = mpmModelSel ? String(mpmModelSel.value || '') : '';
        if (mpmSelectedModel && mpmSlug) {
          var mpmNormModel = mpmSelectedModel.toLowerCase().replace(/:(nitro|floor|free)$/i, '');
          tmSetModelProvider(mpmNormModel, mpmSlug);
          console.log('🌱 [v' + EXT_VERSION + '] Model→Provider map saved: ' + mpmNormModel + ' -> ' + mpmSlug);
          // Re-render to reflect the updated mapping in the model dropdown labels.
          renderPayloadCaptureModal();
        }
        ev.stopPropagation();
      }
    });

    // v4.163: Sort pill click handler (separate listener, stops at first match)
    overlay.addEventListener('click', function(ev) {
      var t = ev.target;
      if (t && t.dataset && t.dataset.action === 'set-modal-sort') {
        tmModalSortMode = t.dataset.sortMode || 'chronological';
        renderPayloadCaptureModal();
        ev.stopPropagation();
      }
    });

    return overlay;
  }

  function getCaptureById(captureId) {
    const ring = tmReadCaptureRing();
    return ring.find(r => r && r.id === captureId) || null;
  }

  function copyTextToClipboard(text, label) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function() {
          console.log('✅ [v' + EXT_VERSION + '] Copied: ' + (label || 'payload'));
        },
        function(err) {
          console.warn('⚠️ [v' + EXT_VERSION + '] Clipboard write failed:', err);
          alert('Clipboard write failed; see console.');
        }
      );
      return;
    }
    alert('Clipboard API not available.');
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmSummarizeCacheControl-vufq,
  //   role=__lambdao_1.tmSummarizeCacheControl,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Walks a body for cache_control markers; produces the count + sample-paths summary carried in Summary copies.,
  // ]
  function tmSummarizeCacheControl(bodyObj) {
    // Returns {count, ttls: {...}, hasAny, paths_sample:[...]} for quick debugging.
    const out = { count: 0, hasAny: false, ttls: {}, paths_sample: [] };
    const maxPaths = 20;

    function walk(x, path) {
      if (x == null) return;
      if (typeof x !== 'object') return;
      if (Array.isArray(x)) {
        for (let i = 0; i < x.length; i++) {
          walk(x[i], path + '[' + i + ']');
        }
        return;
      }
      // object
      if (Object.prototype.hasOwnProperty.call(x, 'cache_control')) {
        out.count += 1;
        out.hasAny = true;
        if (out.paths_sample.length < maxPaths) out.paths_sample.push(path + '.cache_control');
        try {
          const cc = x.cache_control;
          if (cc && typeof cc === 'object' && typeof cc.ttl === 'string') {
            out.ttls[cc.ttl] = (out.ttls[cc.ttl] || 0) + 1;
          } else {
            out.ttls['(none)'] = (out.ttls['(none)'] || 0) + 1;
          }
        } catch (e) {}
      }
      Object.keys(x).forEach(k => {
        walk(x[k], path ? (path + '.' + k) : k);
      });
    }

    walk(bodyObj, 'body');
    return out;
  }

  // ==================== OPENROUTER ERROR SURFACING + AUTO-RETRY (Fix 17, v4.202) ====================
  // OpenRouter returns rich, actionable error segments (429 rate-limit / provider errors) that
  // TypingMind flattens into a useless generic error. We already CAPTURE the raw error segment.
  // Fix 17: (a) parse it, (b) surface it on the persistent widget as a clickable row + JSON popup,
  // (c) AUTO-RETRY transient 429s (per retry_after_seconds) so a walk-away run finishes in real
  // time instead of stalling on a 1s blip until the human types 'continue'.
  var tmMostRecentError = null;

  // (v4.236) Distinct, persistent (until dismissed) widget banner for the specific 'No endpoints
  // found for <model>' case — the routing-into-a-dead-end failure that is easy to forget the
  // remedy for. Separate from tmMostRecentError (which auto-clears on success) because Dan wants
  // this reminder to STAY until he clicks its X. { model, provider, ts, idKey }
  var tmEndpointNotFound = null;

  // (v4.270) A dismissal is REQUEST-scoped: dismissing a banner for turn N must not permanently
  // suppress warnings for turn N+1. We persist ONLY the dismissed warning's id here; the banner
  // itself is recomputed from the RING each render (survives reload), and suppressed only when
  // the newest matching warning still carries this exact dismissed id. localStorage-backed so it
  // also survives a TypingMind refresh. Identity-guarded like the other widget banners.
  var TM_WARNING_DISMISS_KEY = 'tm_warning_banner_dismissed_v1';
  function tmGetDismissedWarnings() {
    try { return JSON.parse(localStorage.getItem(TM_WARNING_DISMISS_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function tmDismissWarningBanner(id) {
    if (!id) return;
    try {
      var d = tmGetDismissedWarnings();
      d[id] = Date.now();
      // bound the map
      var keys = Object.keys(d);
      if (keys.length > 60) {
        keys.sort(function(a, b) { return d[a] - d[b]; });
        while (keys.length > 60) { delete d[keys.shift()]; }
      }
      localStorage.setItem(TM_WARNING_DISMISS_KEY, JSON.stringify(d));
    } catch (e) {}
  }
  function tmIsWarningBannerDismissed(id) {
    if (!id) return false;
    try { return !!tmGetDismissedWarnings()[id]; } catch (e) { return false; }
  }

  // Scan raw response text (SSE or bare JSON) for an OpenRouter-style error object.
  // Returns a structured summary or null. Uses fromCharCode(10) for newline to avoid escapes.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmParseOpenRouterError-0qxf,
  //   role=__lambdao_1.tmParseOpenRouterError,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Fix 17: parses rich OpenRouter error bodies/segments (incl. streamed chunks) into {provider, code, message, retryAfter, remedy_hint, raw}.,
  // ]
  function tmParseOpenRouterError(text) {
    if (!text || typeof text !== 'string') return null;
    var NL = String.fromCharCode(10);
    var found = null;
    function consider(obj) {
      if (found || !obj || typeof obj !== 'object') return;
      var e = obj.error;
      if (!e || typeof e !== 'object') return;
      var md = e.metadata || {};
      found = {
        code: (e.code != null ? e.code : null),
        message: (e.message != null ? String(e.message) : ''),
        // (v4.209) Format-A error chunks carry `provider` at the CHUNK ROOT (no provider_name in
        // metadata), so fall back to obj.provider -- the widget row can name Together/Fireworks.
        provider: (md.provider_name != null ? String(md.provider_name) : (typeof obj.provider === 'string' ? obj.provider : null)),
        raw: (md.raw != null ? String(md.raw) : null),
        remedy_hint: (md.remedy_hint != null ? String(md.remedy_hint) : null),
        retryAfter: (md.retry_after_seconds != null ? Number(md.retry_after_seconds) : null),
        full: obj
      };
    }
    try {
      var lines = text.split(NL);
      for (var i = 0; i < lines.length && !found; i++) {
        var ln = lines[i].trim();
        if (ln.indexOf('data: ') === 0) {
          var js = ln.slice(6).trim();
          if (!js || js === tmDoneMarker()) continue;
          try { consider(JSON.parse(js)); } catch (e2) {}
        }
      }
      if (!found) { try { consider(JSON.parse(text)); } catch (e3) {} }
    } catch (e4) {}
    return found;
  }

  // The literal SSE done marker, built without brackets in source to stay escape-safe.
  function tmDoneMarker() { return '[' + 'DONE' + ']'; }

  var TM_AUTO_RETRY_MAX = 20;       // (v4.204, Dan: walk-away runs should absorb, never surface) ~5-8 min coverage per chain
  var TM_AUTO_RETRY_MAX_WAIT = 15;  // (v4.207) clamp lowered 30->15s: 30s felt punishing when a healthy retry was one 1s bump away

  // (v4.203) PER-SESSION rate-limit backoff state. Keyed by the canonical routing identity
  // (sid::model::host::proxy). Consecutive 429s anywhere in the session escalate the wait
  // exponentially (1,2,4,8,16,30s); a successful response for the SAME identity resets it.
  // Entries self-expire after 1h so stale failures never poison a later session.
  var TM_RATELIMIT_STATE_KEY = 'tm_ratelimit_state_v1';
  var TM_RATELIMIT_STALE_MS = 3600000;
  function tmReadRateLimitMap() {
    try { var r = localStorage.getItem(TM_RATELIMIT_STATE_KEY); return r ? JSON.parse(r) : {}; } catch (e) { return {}; }
  }
  function tmGetRateLimitFails(key) {
    try {
      var m = tmReadRateLimitMap(); var e = m[key];
      if (!e) return 0;
      if (Date.now() - Number(e.ts || 0) > TM_RATELIMIT_STALE_MS) return 0;
      return Number(e.fails) || 0;
    } catch (e) { return 0; }
  }
  function tmBumpRateLimitFails(key) {
    try {
      var m = tmReadRateLimitMap();
      var f = tmGetRateLimitFails(key) + 1;
      m[key] = { fails: f, ts: Date.now() };
      localStorage.setItem(TM_RATELIMIT_STATE_KEY, JSON.stringify(m));
      return f;
    } catch (e) { return 1; }
  }
  function tmResetRateLimitFails(key) {
    try {
      var m = tmReadRateLimitMap();
      if (m[key]) { delete m[key]; localStorage.setItem(TM_RATELIMIT_STATE_KEY, JSON.stringify(m)); }
    } catch (e) {}
  }

  // (v4.209) Healthy-return path for OpenRouter 2xx responses: unconditionally reset the
  // per-identity 429 counter (a success = healthy pool), clear any error banner, apply the Sol
  // Pro guard, return the (possibly rebuilt) response.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmHealthyOpenRouterReturn-dnwp,
  //   role=__lambdao_1.tmHealthyOpenRouterReturn,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=2xx path (v4.209/4.211): resets the identity's retry counter, clears ONLY its own error banner (parallel-conversation safe), applies the Sol Pro guard.,
  // ]
  function tmHealthyOpenRouterReturn(response, args, shouldSanitizeSolProUsage) {
    var okKey = null;
    try {
      var okBody = JSON.parse((args[1] && args[1].body) || '{}');
      okKey = tmComputeRoutingIdentityKey(okBody, args[0], args[1]);
      if (okKey) tmResetRateLimitFails(okKey);
    } catch (e) {}
    // (v4.211) Clear the error banner ONLY when this success belongs to the SAME identity that
    // errored -- a parallel conversation's success must not clear another session's banner.
    if (tmMostRecentError) {
      var canClear = true;
      try {
        if (tmMostRecentError.idKey && okKey && tmMostRecentError.idKey !== okKey) canClear = false;
      } catch (e) {}
      if (canClear) {
        tmMostRecentError = null;
        try { renderGpt51UsageWidget(); } catch (e) {}
      }
    }
    if (shouldSanitizeSolProUsage) { try { return tmWrapSolProResponse(response); } catch (e) {} }
    return response;
  }

  // (v4.209) Shared error core for BOTH HTTP>=400 bodies and HTTP-200 streamed error chunks.
  // Stamps the widget error banner, then either auto-retries (429 with per-session backoff) or
  // returns `passThrough` (a SAFE, unread response -- NEVER a partially-read original).
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmHandleOpenRouterError-1diu,
  //   role=__lambdao_1.tmHandleOpenRouterError,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Shared error core for HTTP>=400 bodies and HTTP-200 streamed error chunks: stamps the identity-guarded error banner, auto-retries 429/5xx with per-session exponential backoff (max 20 attempts, 15s clamp), never retries 4xx.,
  // ]
  function tmHandleOpenRouterError(response, err, status, args, shouldSanitizeSolProUsage, attempt, passThrough) {
    var reqBody = null;
    try { reqBody = JSON.parse((args[1] && args[1].body) || '{}'); } catch (e) {}
    // (v4.211) Compute the error's identity ONCE and carry it on the banner, so the widget can
    // refuse to show banners from OTHER (parallel) conversations, and a success can clear only
    // its OWN banner.
    var errIdKey = null;
    try { if (reqBody) errIdKey = tmComputeRoutingIdentityKey(reqBody, args[0], args[1]); } catch (e) {}
    if (err) {
      tmMostRecentError = {
        ts: Date.now(), model: (reqBody && reqBody.model) || '', provider: err.provider, code: err.code,
        message: err.message, raw: err.raw, remedy_hint: err.remedy_hint,
        retryAfter: err.retryAfter, full: err.full, attempt: attempt, idKey: errIdKey
      };
      // (v4.236) Detect the 'No endpoints found for <model>' case and raise the persistent
      // orange banner. Provider label comes from the request's pinned provider (order[0]/only[0])
      // when present, else the error's provider field, else empty.
      try {
        var _msg = String((err && err.message) || '');
        var _mm = _msg.match(/No endpoints found for\s+([^\s.]+)/i);
        if (_mm) {
          var _provLabel = '';
          try {
            if (reqBody && reqBody.provider && Array.isArray(reqBody.provider.order) && reqBody.provider.order.length) _provLabel = String(reqBody.provider.order[0]);
            else if (reqBody && reqBody.provider && Array.isArray(reqBody.provider.only) && reqBody.provider.only.length) _provLabel = String(reqBody.provider.only[0]);
          } catch (e2) {}
          if (!_provLabel && err && err.provider) _provLabel = String(err.provider);
          tmEndpointNotFound = { model: String(_mm[1]), provider: _provLabel, ts: Date.now(), idKey: errIdKey };
        }
      } catch (e) {}
      try { renderGpt51UsageWidget(); } catch (e) {}
    }
    // (v4.215) Retry transient errors: 429 (rate limit) AND 5xx (server errors like 503
    // 'upstream connect error' -- usually a momentary blip that clears on resubmit, as Dan hit).
    // Do NOT retry 4xx client errors (400/401/403/404/422 -- deterministic, would just fail again).
    var retryCode = (err && err.code != null && !isNaN(Number(err.code))) ? Number(err.code) : status;
    var isRetryable = (retryCode === 429) || (retryCode >= 500 && retryCode < 600);
    if (isRetryable && attempt < TM_AUTO_RETRY_MAX) {
      var idKey = errIdKey;
      var failsTotal = idKey ? tmBumpRateLimitFails(idKey) : (attempt + 1);
      var hintSec = (err && err.retryAfter != null) ? Math.max(Number(err.retryAfter) || 1, 1) : 0;
      var backoffSec = Math.pow(2, Math.min(Math.max(failsTotal - 1, 0), 4));
      var waitSec = Math.min(Math.max(hintSec, backoffSec), TM_AUTO_RETRY_MAX_WAIT);
      console.warn('⏳ [v' + EXT_VERSION + '] Auto-retry ' + (attempt + 1) + '/' + TM_AUTO_RETRY_MAX + ' in ' + waitSec + 's (' + retryCode + (err && err.provider ? ' ' + err.provider : '') + ', consecutive fail #' + failsTotal + ')');
      return new Promise(function(resolve) {
        setTimeout(function() {
          var retryCapId = null;
          try { retryCapId = tmCaptureFetchCall(args[0], args[1] || {}, null, 'openrouter-retry', null); } catch (e) {}
          originalFetch.apply(window, args).then(function(r2) {
            if (retryCapId) { try { tmCaptureResponse(retryCapId, r2); } catch (e) {} }
            resolve(tmMaybeAutoRetry(r2, args, retryCapId, shouldSanitizeSolProUsage, attempt + 1));
          }).catch(function() { resolve(passThrough || response); });
        }, waitSec * 1000);
      });
    }
    var out = passThrough || response;
    if (shouldSanitizeSolProUsage) { try { return tmWrapSolProResponse(out); } catch (e) {} }
    return out;
  }

  // (v4.209) HTTP-200 STREAMED-ERROR peek. OpenRouter can deliver a provider error as a
  // chat.completion.chunk with an `error` field INSIDE an HTTP 200 SSE stream (observed live:
  // Together 429 with bare {error_type} metadata). The HTTP-status gate never sees these. We read
  // only the FIRST SSE data event (<=4KB, <=4s cap; keeps reading through comment/heartbeat lines
  // until a data: line completes) from the live stream. Healthy streams are REBUILT byte-for-byte
  // (prefix chunks + remainder via the same reader) and passed through with zero buffering of the
  // token flow. Error streams are cancelled and routed into the shared error/retry core, with a
  // synthetic prefix-only response as the safe fallback for every non-retry outcome.
  var TM_STREAM_SNIFF_BYTES = 4096;
  var TM_STREAM_SNIFF_MS = 4000;

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmSyntheticStreamResponse-mhl2,
  //   role=__lambdao_1.tmSyntheticStreamResponse,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  // ]
  function tmSyntheticStreamResponse(text, original) {
    try {
      return new Response(text, { status: 200, statusText: 'OK', headers: { 'Content-Type': 'text/event-stream' } });
    } catch (e) { return original; }
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmPeekStreamForError-s5s9,
  //   role=__lambdao_1.tmPeekStreamForError,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=HTTP-200 streamed-error peek: reads only the FIRST SSE data event (<=4KB, <=4s cap); healthy streams are rebuilt byte-identically, errors go to the shared error core with a synthetic response.,
  // ]
  function tmPeekStreamForError(response, args, shouldSanitizeSolProUsage, attempt) {
    var reader;
    try { reader = response.body.getReader(); } catch (e) {
      return Promise.resolve(tmHealthyOpenRouterReturn(response, args, shouldSanitizeSolProUsage));
    }
    var decoder = new TextDecoder();
    var prefixChunks = [];
    var prefixText = '';
    var startTs = Date.now();
    var NL = String.fromCharCode(10);

    function rebuildResponse() {
      var rebuiltBody = new ReadableStream({
        start: function(controller) {
          for (var i = 0; i < prefixChunks.length; i++) controller.enqueue(prefixChunks[i]);
        },
        pull: function(controller) {
          return reader.read().then(function(res) {
            if (res.done) { controller.close(); }
            else { controller.enqueue(res.value); }
          }).catch(function(e) { controller.error(e); });
        },
        cancel: function(reason) { try { reader.cancel(reason); } catch (e) {} }
      });
      return new Response(rebuiltBody, { status: response.status, statusText: response.statusText, headers: response.headers });
    }

    function loop() {
      if (prefixText.length >= TM_STREAM_SNIFF_BYTES) return Promise.resolve(null);
      var remaining = TM_STREAM_SNIFF_MS - (Date.now() - startTs);
      if (remaining <= 0) return Promise.resolve(null);
      return Promise.race([
        reader.read(),
        new Promise(function(r) { setTimeout(function() { r(null); }, remaining); })
      ]).then(function(res) {
        if (!res || res.done) return null;
        prefixChunks.push(res.value);
        prefixText += decoder.decode(res.value, { stream: true });
        // Stop as soon as one complete data: line has arrived (error or first content event).
        var hasDataLine = (prefixText.indexOf('data: ') !== -1) && (prefixText.indexOf(NL) !== -1);
        if (hasDataLine) return null;
        return loop();
      });
    }

    return loop().then(function() {
      var err = tmParseOpenRouterError(prefixText);
      if (err) {
        try { reader.cancel(); } catch (e) {}
        var synthetic = tmSyntheticStreamResponse(prefixText, response);
        return tmHandleOpenRouterError(response, err, 200, args, shouldSanitizeSolProUsage, attempt, synthetic);
      }
      return tmHealthyOpenRouterReturn(rebuildResponse(), args, shouldSanitizeSolProUsage);
    }).catch(function() {
      // The peek itself failed (e.g. network abort mid-read). If we already consumed chunks, hand
      // back the rebuilt stream rather than a partially-read original.
      try { reader.cancel(); } catch (e) {}
      if (prefixChunks.length > 0) {
        try { return tmHealthyOpenRouterReturn(rebuildResponse(), args, shouldSanitizeSolProUsage); } catch (e2) {}
      }
      return tmHealthyOpenRouterReturn(response, args, shouldSanitizeSolProUsage);
    });
  }

  // Given a (possibly error) response, decide whether to surface + auto-retry. Returns a promise
  // resolving to a response. Non-error responses pass straight through untouched (never buffered).
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmMaybeAutoRetry-50zz,
  //   role=__lambdao_1.tmMaybeAutoRetry,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Retry dispatcher: non-error responses pass through untouched (never buffered); HTTP>=400 goes to tmHandleOpenRouterError; streamed 200s go through tmPeekStreamForError.,
  // ]
  function tmMaybeAutoRetry(response, args, captureId, shouldSanitizeSolProUsage, attempt) {
    attempt = attempt || 0;
    var status = 0;
    try { status = Number(response.status) || 0; } catch (e) {}
    var looksError = (status >= 400) || (status === 0);
    if (!looksError) {
      // (v4.209) HTTP 200 is NOT proof of health: OpenRouter can stream a provider error as a
      // mid-stream SSE chunk (observed: Together 429 as chat.completion.chunk with choices:[]).
      // Peek the first SSE data event; healthy streams are rebuilt byte-identically.
      if (response && response.body && typeof response.body.getReader === 'function') {
        return tmPeekStreamForError(response, args, shouldSanitizeSolProUsage, attempt);
      }
      return Promise.resolve(tmHealthyOpenRouterReturn(response, args, shouldSanitizeSolProUsage));
    }
    // Error status: clone + read the (small) body, then run the shared error core.
    var clone;
    try { clone = response.clone(); } catch (e) { return Promise.resolve(response); }
    return clone.text().then(function(text) {
      var err = tmParseOpenRouterError(text);
      // (v4.203) Synthesize a minimal error for ANY HTTP >= 400 even when the body doesn't parse,
      // so the widget error row ALWAYS appears on a hard failure (never a silent generic).
      if (!err && status >= 400) {
        err = { code: status, message: 'HTTP ' + status, provider: null, raw: null, remedy_hint: null, retryAfter: null, full: null };
      }
      return tmHandleOpenRouterError(response, err, status, args, shouldSanitizeSolProUsage, attempt, response);
    }).catch(function() { return response; });
  }

  // ==================== WALK-AWAY CONTINUITY ACTUATOR + PASSIVE STREAM TAP (v4.281) ====================
  // TypingMind continues receiving/persisting the original response stream. We consume a CLONE in
  // parallel, retain only bounded text/raw tails, and use the DOM solely after the turn has ended.
  var TM_AUTO_CONTINUE_COUNTDOWN_SECONDS = 10;
  var tmAutoContinueQueue = [];
  var tmAutoContinueActive = null;

  // (v4.285) Silence watchdog tunable: per-request timer with no received bytes before we
  // conclude the endpoint went silent and queue an auto-resume. Default 15 min; floor 60s.
  var TM_STALL_WATCHDOG_KEY = 'tm_stall_watchdog_ms';
  var TM_STALL_WATCHDOG_DEFAULT_MS = 15 * 60 * 1000;
  function tmGetStallWatchdogMs() {
    try {
      var v = parseInt(localStorage.getItem(TM_STALL_WATCHDOG_KEY), 10);
      return (!isNaN(v) && v >= 60000) ? v : TM_STALL_WATCHDOG_DEFAULT_MS;
    } catch (e) { return TM_STALL_WATCHDOG_DEFAULT_MS; }
  }

  // (v4.282) Cumulative auto-resume ledger. Tiny counts-only store; snapshotted onto each capture
  // row so the ring modal shows the running total 'as of that turn' with a reason breakdown.
  var TM_AUTORESUME_STATS_KEY = 'tm_autoresume_stats_v1';
  function tmGetAutoResumeStats() {
    try {
      var s = JSON.parse(localStorage.getItem(TM_AUTORESUME_STATS_KEY) || '{}');
      if (!s || typeof s !== 'object') s = {};
      if (typeof s.total !== 'number' || isNaN(s.total)) s.total = 0;
      if (!s.by_reason || typeof s.by_reason !== 'object') s.by_reason = {};
      return s;
    } catch (e) { return { total: 0, by_reason: {} }; }
  }
  function tmRecordAutoResumeSuccess(reason) {
    try {
      var s = tmGetAutoResumeStats();
      s.total++;
      var r = String(reason || 'unknown');
      s.by_reason[r] = (s.by_reason[r] || 0) + 1;
      s.last_ts = Date.now();
      localStorage.setItem(TM_AUTORESUME_STATS_KEY, JSON.stringify(s));
    } catch (e) {}
  }
  function tmAutoResumeReasonLabel(k) {
    if (k === 'oversized_result_recovery') return 'tool recovery';
    if (k === 'turn_limit') return 'turn limit';
    if (k === 'tool_swarm_stall') return 'tool swarm stall';
    if (k === 'stall_no_bytes') return 'no response (stall)';
    if (k === 'stream_aborted') return 'stream aborted';
    if (k === 'fetch_dropped') return 'connection dropped';
    if (k === 'empty_stream') return 'empty response';
    if (k === 'manual_debug') return 'manual';
    var mh = String(k || '').match(/^http_error_(\d+)$/);
    if (mh) return 'HTTP ' + mh[1];
    var m = String(k || '').match(/^stream_error_(\d+)$/);
    if (m) {
      if (m[1] === '504') return 'timeouts (504)';
      if (m[1] === '429') return 'rate limits (429)';
      return 'error ' + m[1];
    }
    return String(k || 'unknown');
  }

  function tmFindVisibleChatContainer() {
    try {
      var els = document.querySelectorAll('div.dynamic-chat-content-container');
      for (var i = 0; i < els.length; i++) if (els[i].offsetParent !== null) return els[i];
      return els.length ? els[els.length - 1] : null;
    } catch (e) { return null; }
  }

  // ==================== AGENT MANAGEMENT MODE (v4.292) ====================
  // Network truth narrows the candidate set: a healthy response ended in a tool call and no
  // later outbound payload followed for that Session ID. DOM truth then excludes a still-running
  // client-side tool before the existing auto-continue actuator is allowed to submit anything.
  var TM_AGENT_MANAGEMENT_KEY = 'tm_agent_management_enabled_v1';
  var TM_AGENT_MANAGEMENT_SWEEP_MS = 60000;
  var TM_AGENT_MANAGEMENT_GRACE_MS = 75000;
  var TM_AGENT_MANAGEMENT_RETRY_COOLDOWN_MS = 5 * 60 * 1000;
  var tmAgentManagementSessions = {};
  var tmAgentManagementTimer = null;
  var tmAgentManagementTimerDue = 0;
  var tmAgentManagementBusy = false;

  // (v4.296) Resolve the display identity onto the continuity ledger's raw Session-ID key.
  // Capture/widget surfaces prefer tmDeriveStableSessionId(), which prepends `tm-` to an explicit
  // pasted ID; the continuity/DOM actuator deliberately uses the raw pasted ID itself. Try exact
  // first (future-proof if the ledger changes), then remove exactly one routing prefix.
  function tmAgentManagementDisplayState(sessionId) {
    var id = String(sessionId || '');
    if (!id) return null;
    if (tmAgentManagementSessions[id]) return tmAgentManagementSessions[id];
    if (id.indexOf('tm-') === 0) {
      var raw = id.slice(3);
      if (tmAgentManagementSessions[raw]) return tmAgentManagementSessions[raw];
    }
    return null;
  }

  // (v4.295/v4.296) Shared one-badge formatter for both status surfaces: the persistent widget's
  // current session/name row and the most-recent ring row for each managed session. The badge
  // mirrors pendingToolCall directly; v4.296 normalizes derived `tm-…` display IDs back onto the
  // raw continuity-ledger key so the live flip is actually visible.
  function tmAgentManagementBadge(sessionId) {
    if (!tmAgentManagementEnabled() || !sessionId) return '';
    var s = tmAgentManagementDisplayState(sessionId);
    var pending = !!(s && s.pendingToolCall);
    var text = pending ? '🧰 tool' : '🔵 clear';
    var color = pending ? '#d08b8b' : '#8fb8ff';
    var tip = pending
      ? 'Agent management: response ended on a tool call — TypingMind is executing client-side and owes the next outbound payload. Healthy swarms flicker tool→clear each turn; a badge STUCK on tool is the stall signature.'
      : 'Agent management: no tool-call handoff in flight for this session.';
    return ' <span title="' + escapeHtml(tip) + '" style="color:' + color + ';font-size:9px;font-weight:600;white-space:nowrap;">' + text + '</span>';
  }

  // (v4.295) Force both badge surfaces to reflect a state flip the moment it happens, without
  // waiting for the next capture-driven render. Guarded no-ops when management mode is off.
  function tmAgentManagementRefreshBadgeUI() {
    if (!tmAgentManagementEnabled()) return;
    try { renderGpt51UsageWidget(); } catch (e) {}
    try { if (typeof payloadCaptureModalInnerEl !== 'undefined' && payloadCaptureModalInnerEl && payloadCaptureModalInnerEl.isConnected) renderPayloadCaptureModal(); } catch (e2) {}
  }

  function tmAgentManagementEnabled() {
    try { return localStorage.getItem(TM_AGENT_MANAGEMENT_KEY) === 'true'; } catch (e) { return false; }
  }

  function tmSetAgentManagementEnabled(enabled) {
    enabled = !!enabled;
    try { localStorage.setItem(TM_AGENT_MANAGEMENT_KEY, enabled ? 'true' : 'false'); } catch (e) {}
    if (tmAgentManagementTimer) { try { clearTimeout(tmAgentManagementTimer); } catch (e2) {} tmAgentManagementTimer = null; tmAgentManagementTimerDue = 0; }
    // (v4.300) OFF is immediate and total: purge pending resumes and abort an in-flight
    // countdown modal, so nothing queued while ON can fire after the toggle.
    if (!enabled) {
      try { tmAutoContinueQueue.length = 0; } catch (eQ) {}
      try { tmCancelAutoContinueCountdown(); } catch (eC) {}
    }
    if (enabled) tmScheduleAgentManagementSweep(1200);
    try { renderGpt51UsageWidget(); } catch (e3) {}
    console.log((enabled ? '🔴' : '🟠') + ' [v' + EXT_VERSION + '] Agent management mode ' + (enabled ? 'ENABLED' : 'disabled') + '.');
  }

  function tmAgentManagementNoteOutbound(sessionId, captureId) {
    if (!sessionId) return;
    var key = String(sessionId);
    var s = tmAgentManagementSessions[key] || { sessionId: key };
    var flipped = !!s.pendingToolCall; // (v4.295) true→false flip drives the live badge update
    s.pendingToolCall = false;
    s.lastOutboundAt = Date.now();
    s.captureId = captureId || s.captureId || null;
    s.resumeQueuedAt = 0;
    tmAgentManagementSessions[key] = s;
    if (flipped) tmAgentManagementRefreshBadgeUI();
  }

  function tmAgentManagementNoteResponse(sessionId, endedWithToolCall, captureId) {
    if (!sessionId) return;
    var key = String(sessionId);
    var s = tmAgentManagementSessions[key] || { sessionId: key };
    var flipped = (!!s.pendingToolCall) !== (!!endedWithToolCall); // (v4.295) any flip repaints
    s.pendingToolCall = !!endedWithToolCall;
    s.responseFinishedAt = Date.now();
    s.captureId = captureId || s.captureId || null;
    if (!s.pendingToolCall) s.resumeQueuedAt = 0;
    tmAgentManagementSessions[key] = s;
    if (flipped) tmAgentManagementRefreshBadgeUI();
    if (s.pendingToolCall && tmAgentManagementEnabled()) tmScheduleAgentManagementSweep(TM_AGENT_MANAGEMENT_GRACE_MS);
  }

  function tmAgentManagementPending(sessionId) {
    var s = tmAgentManagementSessions[String(sessionId || '')];
    return !!(s && s.pendingToolCall);
  }

  function tmScrollVisibleChatToBottom() {
    var container = tmFindVisibleChatContainer();
    if (!container) return null;
    var scroller = container;
    try {
      var n = container;
      while (n && n !== document.body) {
        var cs = window.getComputedStyle ? window.getComputedStyle(n) : null;
        var oy = cs ? String(cs.overflowY || '') : '';
        if (/(auto|scroll)/i.test(oy) && n.scrollHeight > n.clientHeight + 4) { scroller = n; break; }
        n = n.parentElement;
      }
      if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'auto' });
      else scroller.scrollTop = scroller.scrollHeight;
    } catch (e) { try { scroller.scrollTop = scroller.scrollHeight; } catch (e2) {} }
    return scroller;
  }

  function tmVisibleToolExecutionSnapshot() {
    var out = { spinner: false, timer: null };
    var container = tmFindVisibleChatContainer();
    if (!container) return out;
    try {
      var kids = container.children || [];
      var from = Math.max(0, kids.length - 8);
      for (var i = from; i < kids.length; i++) {
        var root = kids[i];
        var spins = root.querySelectorAll ? root.querySelectorAll('svg.animate-spin') : [];
        for (var si = 0; si < spins.length; si++) {
          if (spins[si].offsetParent !== null) { out.spinner = true; break; }
        }
        var groups = root.querySelectorAll ? root.querySelectorAll('[data-element-id="chat-plugin-group"] button') : [];
        for (var gi = groups.length - 1; gi >= 0; gi--) {
          if (groups[gi].offsetParent === null) continue;
          var text = String(groups[gi].innerText || groups[gi].textContent || '');
          var m = text.match(/(?:\b\d+\s*m\s*)?\d+\s*s\b/i);
          if (m) { out.timer = m[0].replace(/\s+/g, ''); break; }
        }
        if (out.spinner) break;
      }
    } catch (e) {}
    return out;
  }

  // (v4.294) SIDEBAR TOOL-ACTIVITY CONFIRMATION. TypingMind renders a continuous animate-spin
  // inside the session's left-sidebar row for the whole client-side tool-execution window. This
  // is the most reliable 'do not act' signal because it has no sub-second gaps. Locate the row
  // using the same Session-ID prefix logic as the auto-resume actuator, then test for the spinner.
  function tmSidebarHasToolActivity(sessionId) {
    if (!sessionId) return false;
    try {
      var rows = document.querySelectorAll('[data-element-id="custom-chat-item"], [data-element-id="selected-chat-item"]');
      var sid = String(sessionId).toLowerCase();
      for (var i = 0; i < rows.length; i++) {
        var titleEl = rows[i].querySelector('.truncate.w-full') || rows[i].querySelector('.truncate');
        var title = titleEl ? String(titleEl.textContent || '').trim().toLowerCase() : '';
        if (title.indexOf(sid) !== 0) continue;
        var spinner = rows[i].querySelector('svg.animate-spin');
        if (spinner && spinner.offsetParent !== null) return true;
      }
    } catch (e) {}
    return false;
  }

  function tmAgentManagementOpenSession(sessionId, cb) {
    function waitVerified() {
      var started = Date.now();
      (function check() {
        // (v4.300) Abort the chain if management was toggled OFF mid-switch.
        if (!tmAgentManagementEnabled()) { cb(new Error('management disabled')); return; }
        if (tmConversationVerified(sessionId)) { cb(null); return; }
        if (Date.now() - started < 7000) { setTimeout(check, 150); return; }
        cb(new Error('switched conversation failed Session-ID verification'));
      })();
    }
    if (tmConversationVerified(sessionId)) { cb(null); return; }
    var matches = tmFindSidebarConversation(sessionId);
    if (matches.length === 1) {
      try { (matches[0].titleEl || matches[0].row).click(); waitVerified(); } catch (e) { cb(e); }
      return;
    }
    if (matches.length > 1) { cb(new Error('ambiguous sidebar Session-ID match')); return; }
    tmScrollSidebarForMatch(sessionId, function(found) {
      if (found && found.length === 1) {
        try { (found[0].titleEl || found[0].row).click(); waitVerified(); } catch (e) { cb(e); }
      } else if (found && found.length > 1) cb(new Error('ambiguous sidebar Session-ID match after scroll'));
      else cb(new Error('sidebar conversation not found'));
    });
  }

  function tmFinishAgentManagementSweep() {
    tmAgentManagementBusy = false;
    if (tmAgentManagementEnabled()) tmScheduleAgentManagementSweep(TM_AGENT_MANAGEMENT_SWEEP_MS);
  }

  function tmInspectManagedSession(state) {
    tmScrollVisibleChatToBottom();
    setTimeout(function() {
      if (!tmAgentManagementEnabled() || !tmAgentManagementPending(state.sessionId)) { tmFinishAgentManagementSweep(); return; }

      // If the native stop UI survived, preserve v4.291's best actuator: click its own Continue.
      var nativeStop = tmDetectTurnLimitStop();
      if (nativeStop) {
        var nativeQueued = tmQueueAutoContinue(state.sessionId, 'turn_limit', 'typingmind turn-count stop');
        if (nativeQueued) state.resumeQueuedAt = Date.now();
        tmFinishAgentManagementSweep();
        return;
      }

      var first = tmVisibleToolExecutionSnapshot();
      if (first.spinner) { tmFinishAgentManagementSweep(); return; }
      setTimeout(function() {
        if (!tmAgentManagementEnabled() || !tmAgentManagementPending(state.sessionId)) { tmFinishAgentManagementSweep(); return; }
        tmScrollVisibleChatToBottom();
        var second = tmVisibleToolExecutionSnapshot();
        var timerAdvanced = !!(first.timer && second.timer && first.timer !== second.timer);
        if (second.spinner || timerAdvanced) { tmFinishAgentManagementSweep(); return; }

        // (v4.294) FINAL GAP GUARD: require TWO 1.5-second-apart idle snapshots after the timer
        // comparison, then confirm with the sidebar's continuous tool-activity spinner before
        // acting. The 1.5s delay covers the observed mount gap; the sidebar check eliminates
        // any residual uncertainty for sub-1.5s tool-turn gaps.
        setTimeout(function() {
          if (!tmAgentManagementEnabled() || !tmAgentManagementPending(state.sessionId)) { tmFinishAgentManagementSweep(); return; }
          var third = tmVisibleToolExecutionSnapshot();
          if (third.spinner) { tmFinishAgentManagementSweep(); return; }
          setTimeout(function() {
            if (!tmAgentManagementEnabled() || !tmAgentManagementPending(state.sessionId)) { tmFinishAgentManagementSweep(); return; }
            var fourth = tmVisibleToolExecutionSnapshot();
            if (fourth.spinner) { tmFinishAgentManagementSweep(); return; }

            // FINAL AUTHORITY: the sidebar spinner runs continuously for the entire tool window.
            // If it is present, TypingMind is still executing; abort rather than risk a duplicate.
            if (tmSidebarHasToolActivity(state.sessionId)) {
              console.log('🧭 [v' + EXT_VERSION + '] Agent management: sidebar tool activity detected for ' + state.sessionId + '; aborting idle conclusion.');
              tmFinishAgentManagementSweep();
              return;
            }

            var queued = tmQueueAutoContinue(state.sessionId, 'tool_swarm_stall', 'healthy response ended with tool call; no outbound payload; DOM idle');
            if (queued) {
              state.resumeQueuedAt = Date.now();
              try { if (state.captureId) tmUpdateCaptureRecord(state.captureId, { _auto_resume_triggered: 'tool_swarm_stall' }); } catch (e) {}
              console.warn('🧭 [v' + EXT_VERSION + '] Agent management confirmed an idle tool-call session; queueing Continue for ' + state.sessionId + '.');
            }
            tmFinishAgentManagementSweep();
          }, 1500);
        }, 1500);
      }, 5000);
    }, 900);
  }

  function tmRunAgentManagementSweep() {
    tmAgentManagementTimer = null;
    tmAgentManagementTimerDue = 0;
    if (!tmAgentManagementEnabled() || tmAgentManagementBusy) return;
    var now = Date.now();
    var candidates = Object.keys(tmAgentManagementSessions).map(function(k) { return tmAgentManagementSessions[k]; }).filter(function(s) {
      if (!s || !s.pendingToolCall || !s.responseFinishedAt) return false;
      if (now - s.responseFinishedAt < TM_AGENT_MANAGEMENT_GRACE_MS) return false;
      if (s.resumeQueuedAt && now - s.resumeQueuedAt < TM_AGENT_MANAGEMENT_RETRY_COOLDOWN_MS) return false;
      // (v4.302) PRE-FLIGHT: the sidebar tool-activity spinner is the inspection chain's OWN
      // final authority, and it is queryable WITHOUT navigating. Positively present => this
      // session is executing a tool right now => skip the inspection navigation entirely
      // (the chain would only park ~9s and abort on this same signal). Absent (incl. row not
      // rendered) => fall through to the unchanged proven chain; safe-direction only.
      if (tmSidebarHasToolActivity(s.sessionId)) return false;
      return true;
    }).sort(function(a, b) { return a.responseFinishedAt - b.responseFinishedAt; });
    if (!candidates.length) { tmScheduleAgentManagementSweep(TM_AGENT_MANAGEMENT_SWEEP_MS); return; }
    tmAgentManagementBusy = true;
    var state = candidates[0];
    tmAgentManagementOpenSession(state.sessionId, function(err) {
      if (err) {
        console.warn('⚠️ [v' + EXT_VERSION + '] Agent management could not inspect ' + state.sessionId + ': ' + err.message);
        state.resumeQueuedAt = Date.now();
        tmFinishAgentManagementSweep();
        return;
      }
      tmInspectManagedSession(state);
    });
  }

  function tmScheduleAgentManagementSweep(delayMs) {
    if (!tmAgentManagementEnabled()) return;
    var delay = Math.max(250, Number(delayMs) || TM_AGENT_MANAGEMENT_SWEEP_MS);
    var due = Date.now() + delay;
    // Keep the earliest pending sweep. A busy second session producing rapid tool calls must not
    // postpone inspection of an older already-stalled session indefinitely.
    if (tmAgentManagementTimer && tmAgentManagementTimerDue && tmAgentManagementTimerDue <= due) return;
    if (tmAgentManagementTimer) { try { clearTimeout(tmAgentManagementTimer); } catch (e) {} }
    tmAgentManagementTimerDue = due;
    tmAgentManagementTimer = setTimeout(tmRunAgentManagementSweep, delay);
  }

  function tmInitAgentManagement() {
    if (tmAgentManagementEnabled()) tmScheduleAgentManagementSweep(2500);
  }

  function tmVisibleConversationHasSessionId(sessionId) {
    var container = tmFindVisibleChatContainer();
    if (!container || !sessionId) return false;
    try {
      var users = container.querySelectorAll('[data-element-id="user-message"]');
      var max = Math.min(users.length, 10);
      for (var i = 0; i < max; i++) {
        var text = String(users[i].innerText || users[i].textContent || '');
        var m = text.match(/^\s*Session\s+ID\s*:\s*([^\s`]+)/im);
        if (m && String(m[1]).replace(/^`+|`+$/g, '').replace(/[.,;:]+$/g, '') === String(sessionId)) return true;
      }
    } catch (e) {}
    return false;
  }

  function tmFindSidebarConversation(sessionId) {
    var matches = [];
    try {
      var rows = document.querySelectorAll('[data-element-id="custom-chat-item"], [data-element-id="selected-chat-item"]');
      var sid = String(sessionId || '').toLowerCase();
      for (var i = 0; i < rows.length; i++) {
        var titleEl = rows[i].querySelector('.truncate.w-full') || rows[i].querySelector('.truncate');
        var title = titleEl ? String(titleEl.textContent || '').trim() : '';
        if (title.toLowerCase().indexOf(sid) === 0) matches.push({ row: rows[i], title: title, titleEl: titleEl });
      }
    } catch (e) {}
    return matches;
  }

  // (v4.288) TypingMind VIRTUALIZES the sidebar list (and folders may be collapsed): a target
  // conversation that is not currently rendered cannot be found by a single querySelector sweep.
  // Sweep the scroll container top->bottom to force rows to mount, re-querying at each stop.
  function tmScrollSidebarForMatch(sessionId, cb) {
    var sc = null;
    try {
      var cands = document.querySelectorAll('#navbar nav .overflow-y-auto');
      for (var i = 0; i < cands.length; i++) {
        if (cands[i].offsetParent !== null && cands[i].scrollHeight > cands[i].clientHeight) { sc = cands[i]; break; }
      }
      if (!sc && cands.length) sc = cands[0];
    } catch (e) {}
    if (!sc) { cb([]); return; }
    var origTop = sc.scrollTop;
    var maxTop = Math.max(sc.scrollHeight - sc.clientHeight, 0);
    var positions = [];
    for (var y = 0; y <= maxTop; y += Math.max(400, Math.floor(sc.clientHeight * 0.8))) positions.push(y);
    if (positions.length > 40) positions = positions.slice(0, 40);
    var i2 = 0;
    (function stepFn() {
      if (i2 >= positions.length) { try { sc.scrollTop = origTop; } catch (e) {} cb([]); return; }
      try { sc.scrollTop = positions[i2]; } catch (e) {}
      i2++;
      setTimeout(function() {
        var m = tmFindSidebarConversation(sessionId);
        if (m.length) { try { sc.scrollTop = origTop; } catch (e) {} cb(m); return; }
        stepFn();
      }, 90);
    })();
  }

  // (v4.288) Failures must NEVER be silent: a dismissible red toast names the abort reason so Dan
  // can see exactly why a resume did not fire (previously console-only, invisible unless DevTools
  // happened to be open on the right tab).
  function tmShowAutoContinueAbort(item, reason) {
    if (typeof document === 'undefined' || !document.body) return;
    var old = document.getElementById('tm-auto-continue-abort');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var overlay = document.createElement('div');
    overlay.id = 'tm-auto-continue-abort';
    overlay.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;max-width:420px;background:#2a0d0d;color:#ffd9d9;border:2px solid #ff6b6b;border-radius:8px;padding:12px 14px;font-family:system-ui,sans-serif;font-size:12px;box-shadow:0 8px 40px #000;cursor:pointer;';
    overlay.innerHTML = '<div style="font-weight:700;color:#ff8a8a;margin-bottom:4px;">⛔ Auto-resume aborted</div>' +
      '<div>' + escapeHtml(String(reason || 'unknown')) + (item && item.sessionId ? (' — session <b>' + escapeHtml(String(item.sessionId)) + '</b>') : '') + '</div>' +
      '<div style="margin-top:6px;opacity:0.8;">Click to dismiss (auto-dismiss 15s).</div>';
    overlay.onclick = function() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };
    document.body.appendChild(overlay);
    setTimeout(function() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 15000);
  }

  // (v4.289) SIDEBAR-TITLE identity check: the currently-ACTIVE conversation's selected sidebar
  // row. Robust where the message-DOM check fails (long conversations virtualize the first user
  // turn -- which carries the Session ID line -- out of the rendered list). Relies on Dan's
  // naming convention: the session hash is always the first text of the conversation title.
  function tmActiveSidebarConversationHasSessionId(sessionId) {
    try {
      var rows = document.querySelectorAll('[data-element-id="selected-chat-item"]');
      var sid = String(sessionId || '').toLowerCase();
      for (var i = 0; i < rows.length; i++) {
        var titleEl = rows[i].querySelector('.truncate.w-full') || rows[i].querySelector('.truncate');
        var title = titleEl ? String(titleEl.textContent || '').trim().toLowerCase() : '';
        if (title.indexOf(sid) === 0) return true;
      }
    } catch (e) {}
    return false;
  }

  function tmConversationVerified(sessionId) {
    if (tmVisibleConversationHasSessionId(sessionId)) return true;
    return tmActiveSidebarConversationHasSessionId(sessionId);
  }

  function tmFindVisibleChatInput() {
    var selectors = [
      '#chat-input-textbox', '[data-element-id="chat-input-textbox"]',
      'textarea[placeholder*="Press"]', 'textarea.main-chat-input',
      'textarea[placeholder*="Message"]', 'div[contenteditable="true"]',
      '[contenteditable="true"]', 'div[role="textbox"]', 'textarea'
    ];
    try {
      for (var s = 0; s < selectors.length; s++) {
        var els = document.querySelectorAll(selectors[s]);
        for (var i = 0; i < els.length; i++) {
          var el = els[i];
          if (el.offsetParent !== null && !el.closest('#deepgram-panel') && !el.closest('#gpt51-usage-widget') && String(el.id || '').indexOf('deepgram') === -1) return el;
        }
      }
    } catch (e) {}
    return null;
  }

  function tmSubmitContinueIntoVisibleConversation(onDone) {
    var input = tmFindVisibleChatInput();
    if (!input) throw new Error('visible TypingMind chat input not found');
    var existing = (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') ? String(input.value || '') : String(input.textContent || '');
    if (existing.trim()) throw new Error('chat input contains an unsent draft; refusing to overwrite it');

    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      var proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(input, 'Continue');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (input.contentEditable === 'true') {
      input.textContent = 'Continue';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      throw new Error('unsupported TypingMind chat input element');
    }
    input.focus();
    // (v4.289) The transcription widget's proven rhythm: WAIT ~200ms for React/TypingMind to
    // process the insertion, RE-FIND the input, then dispatch Ctrl+Enter. v4.281-4.288 fired
    // Enter synchronously after the value-set, racing registration -- the submit silently no-oped.
    setTimeout(function() {
      try {
        var input2 = tmFindVisibleChatInput() || input;
        var down = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, ctrlKey: true, bubbles: true, cancelable: true });
        var up = new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, ctrlKey: true, bubbles: true, cancelable: true });
        input2.dispatchEvent(down);
        input2.dispatchEvent(up);
        if (onDone) onDone(null);
      } catch (e2) {
        if (onDone) onDone(e2);
      }
    }, 200);
  }

  // ==================== TURN-LIMIT STOP WATCHER (v4.291) ====================
  // The turn-count stop is CLIENT-SIDE: no fetch/payload exists, so only a DOM watcher can catch
  // it. Feeds the shared actuator (reason 'turn_limit' -> native Continue button, then text-submit).
  function tmExtractActiveSessionId() {
    try {
      var rows = document.querySelectorAll('[data-element-id="selected-chat-item"]');
      for (var i = 0; i < rows.length; i++) {
        var titleEl = rows[i].querySelector('.truncate.w-full') || rows[i].querySelector('.truncate');
        var title = titleEl ? String(titleEl.textContent || '').trim() : '';
        var m = title.match(/^([A-Za-z0-9]{6,})\b/);
        if (m && m[1]) return m[1];
      }
    } catch (e) {}
    return null;
  }

  function tmDetectTurnLimitStop() {
    var container = tmFindVisibleChatContainer();
    if (!container) return null;
    try {
      // Scan only the LAST few rendered turns for the stop text (whole-container innerText is
      // expensive on long histories and could false-match an old discussion ABOUT infinite loops).
      var kids = container.children;
      var from = Math.max(0, kids.length - 6);
      var stopEl = null;
      for (var i = kids.length - 1; i >= from; i--) {
        var t = String(kids[i].innerText || '');
        if (/infinite loop/i.test(t)) { stopEl = kids[i]; break; }
      }
      if (!stopEl) return null;
      var btn = null;
      var buttons = container.querySelectorAll('button');
      for (var j = buttons.length - 1; j >= 0; j--) {
        if (String(buttons[j].innerText || buttons[j].textContent || '').trim().toLowerCase() === 'continue' && buttons[j].offsetParent !== null) { btn = buttons[j]; break; }
      }
      if (!btn) return null;
      return { stopEl: stopEl, button: btn };
    } catch (e) { return null; }
  }

  var tmTurnLimitLastHandled = { sig: '', ts: 0 };
  function tmCheckTurnLimitStop() {
    // (v4.300) Respect the OFF switch before doing any work (also keeps the 2-minute dedupe
    // signature from being armed by a stop we deliberately ignore while disabled).
    if (!tmAgentManagementEnabled()) return;
    var det = tmDetectTurnLimitStop();
    if (!det) return;
    var sig = String(det.stopEl.innerText || '').slice(0, 200);
    if (tmTurnLimitLastHandled.sig === sig && (Date.now() - tmTurnLimitLastHandled.ts) < 120000) return;
    var sessionId = tmExtractActiveSessionId();
    if (!sessionId) {
      console.warn('⚠️ [v' + EXT_VERSION + '] Turn-limit stop detected but no Session ID could be extracted from the sidebar title; skipping auto-continue.');
      return;
    }
    tmTurnLimitLastHandled = { sig: sig, ts: Date.now() };
    console.warn('⏳ [v' + EXT_VERSION + '] Turn-limit stop detected for session ' + sessionId + ' — queueing auto-continue.');
    tmQueueAutoContinue(sessionId, 'turn_limit', 'typingmind turn-count stop');
  }

  var tmTurnLimitObserver = null;
  function tmInitTurnLimitWatcher() {
    if (tmTurnLimitObserver || typeof document === 'undefined' || !document.body) return;
    var debounceTimer = null;
    tmTurnLimitObserver = new MutationObserver(function() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(tmCheckTurnLimitStop, 700);
    });
    tmTurnLimitObserver.observe(document.body, { childList: true, subtree: true });
    console.log('✅ [v' + EXT_VERSION + '] Turn-limit stop watcher initialized.');
  }

  function tmClickVisibleContinueButton() {
    var container = tmFindVisibleChatContainer();
    if (!container) return false;
    try {
      var buttons = container.querySelectorAll('button');
      for (var i = buttons.length - 1; i >= 0; i--) {
        if (String(buttons[i].innerText || buttons[i].textContent || '').trim().toLowerCase() === 'continue' && buttons[i].offsetParent !== null) {
          buttons[i].click();
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  function tmWaitForConversationAndResume(item, match) {
    var started = Date.now();
    function check() {
      if (!tmConversationVerified(item.sessionId)) {
        if (Date.now() - started < 6000) { setTimeout(check, 150); return; }
        tmFinishAutoContinue(false, 'switched conversation failed Session-ID verification');
        return;
      }
      try {
        // For TypingMind's own turn-limit stop, prefer its native Continue affordance. Timeout and
        // recovery-phrase cases normally have none, so use the proven text-submit path.
        var clicked = (item.reason === 'turn_limit') ? tmClickVisibleContinueButton() : false;
        if (clicked) {
          try { tmRecordAutoResumeSuccess(item.reason); } catch (eRec) {}
          try { if (tmAutoResumeIsErrorReason(item.reason)) tmNoteAutoResumeAttempt(item.sessionId); } catch (eBk) {}
          console.log('▶️ [v' + EXT_VERSION + '] Auto-resumed session ' + item.sessionId + ' (' + item.reason + ')' + (match ? ' via ' + match.title : '') + '.');
          tmFinishAutoContinue(true, null);
          return;
        }
        tmSubmitContinueIntoVisibleConversation(function(submitErr) {
          if (submitErr) { tmFinishAutoContinue(false, submitErr.message || String(submitErr)); return; }
          try { tmRecordAutoResumeSuccess(item.reason); } catch (eRec) {}
          // (v4.288) Escalate the session's backoff only when an ERROR-triggered resume was actually
          // submitted; recovery-phrase/turn-limit resumes never decelerate.
          try { if (tmAutoResumeIsErrorReason(item.reason)) tmNoteAutoResumeAttempt(item.sessionId); } catch (eBk) {}
          console.log('▶️ [v' + EXT_VERSION + '] Auto-resumed session ' + item.sessionId + ' (' + item.reason + ')' + (match ? ' via ' + match.title : '') + '.');
          tmFinishAutoContinue(true, null);
        });
      } catch (e) {
        tmFinishAutoContinue(false, e && e.message ? e.message : String(e));
      }
    }
    check();
  }

  function tmClickSidebarMatch(item, match) {
    try {
      // Click the TITLE element (what a user actually clicks); it bubbles to whichever ancestor
      // carries React's navigation handler. Deliberately NOT any inner <button> -- on some rows
      // the first inner button is a hover action icon (menu), not the open-conversation target.
      var clickTarget = match.titleEl || match.row;
      clickTarget.click();
      tmWaitForConversationAndResume(item, match);
    } catch (e) {
      tmFinishAutoContinue(false, 'failed to click sidebar conversation');
    }
  }

  function tmExecuteAutoContinue(item) {
    if (!item || !item.sessionId) { tmFinishAutoContinue(false, 'missing Session ID'); return; }
    // (v4.300) Final gate before navigation: the toggle may have flipped OFF during the countdown.
    if (!tmAgentManagementEnabled() && item.reason !== 'manual_debug') { tmFinishAutoContinue(false, 'management disabled'); return; }
    // A currently-visible matching conversation needs no sidebar row at all (its folder may be
    // collapsed or virtualized). Verify it directly and avoid needless navigation.
    if (tmConversationVerified(item.sessionId)) {
      tmWaitForConversationAndResume(item, null);
      return;
    }
    var matches = tmFindSidebarConversation(item.sessionId);
    if (matches.length === 1) { tmClickSidebarMatch(item, matches[0]); return; }
    if (matches.length > 1) { tmFinishAutoContinue(false, 'ambiguous sidebar Session-ID match'); return; }
    // Not rendered: sweep the virtualized sidebar to force rows to mount, then retry the match.
    tmScrollSidebarForMatch(item.sessionId, function(found) {
      if (found && found.length === 1) { tmClickSidebarMatch(item, found[0]); return; }
      if (found && found.length > 1) { tmFinishAutoContinue(false, 'ambiguous sidebar Session-ID match (after scroll)'); return; }
      tmFinishAutoContinue(false, 'sidebar conversation not found (folder collapsed or row not rendered)');
    });
  }

  function tmFinishAutoContinue(ok, error) {
    var item = tmAutoContinueActive;
    var overlay = null;
    try { overlay = document.getElementById('tm-auto-continue-overlay'); } catch (e) {}
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (!ok) {
      console.warn('⚠️ [v' + EXT_VERSION + '] Auto-resume aborted' + (item ? ' for ' + item.sessionId : '') + ': ' + error);
      try { tmShowAutoContinueAbort(item, error); } catch (eT) {}
    }
    tmAutoContinueActive = null;
    // Give TypingMind time to register the just-submitted request before a second queued session
    // switches the visible UI again. Parallel fetches may continue normally after that handoff.
    setTimeout(tmProcessAutoContinueQueue, 1500);
  }

  // (v4.300) Module-level handle so toggling management OFF aborts an in-flight countdown.
  var tmAutoContinueCountdownCancel = null;

  function tmShowAutoContinueCountdown(item) {
    if (typeof document === 'undefined' || !document.body) { tmFinishAutoContinue(false, 'DOM unavailable'); return; }
    var old = document.getElementById('tm-auto-continue-overlay');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var overlay = document.createElement('div');
    overlay.id = 'tm-auto-continue-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;';
    var box = document.createElement('div');
    box.style.cssText = 'width:min(560px,88vw);background:#15151b;color:#fff;border:2px solid #5da9ff;border-radius:10px;padding:18px;box-shadow:0 12px 55px #000;';
    var remaining = TM_AUTO_CONTINUE_COUNTDOWN_SECONDS;
    var attemptInfo = '';
    try {
      if (tmAutoResumeIsErrorReason(item.reason)) {
        var bkNow = tmAutoResumeBackoff[String(item.sessionId)];
        if (bkNow && bkNow.fails > 0) attemptInfo = ' (attempt ' + (bkNow.fails + 1) + ')';
      }
    } catch (eAI) {}
    box.innerHTML = '<div style="font-size:17px;font-weight:700;color:#8bc2ff;margin-bottom:8px;">▶ Auto-resume queued</div>' +
      '<div style="font-size:13px;line-height:1.45;margin-bottom:10px;">Session <b style="color:#a8ffb0;">' + escapeHtml(String(item.sessionId)) + '</b> stopped because <b>' + escapeHtml(String(item.reason)) + escapeHtml(attemptInfo) + '</b>.<br>TypingMind will switch to it and submit <code>Continue</code> in <span id="tm-auto-continue-seconds">' + remaining + '</span>s.</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;"><button id="tm-auto-continue-cancel" style="padding:6px 12px;background:#6a3030;color:#fff;border:1px solid #b75;border-radius:5px;cursor:pointer;">Cancel</button><button id="tm-auto-continue-now" style="padding:6px 12px;background:#245f9e;color:#fff;border:1px solid #68aef5;border-radius:5px;cursor:pointer;">Resume now</button></div>';
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    var finished = false;
    function finish(run, why) {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      tmAutoContinueCountdownCancel = null;
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (run) tmExecuteAutoContinue(item); else tmFinishAutoContinue(false, why || 'cancelled by user');
    }
    tmAutoContinueCountdownCancel = function() { finish(false, 'management disabled'); };
    box.querySelector('#tm-auto-continue-cancel').onclick = function() { finish(false); };
    box.querySelector('#tm-auto-continue-now').onclick = function() { finish(true); };
    var timer = setInterval(function() {
      remaining--;
      var span = box.querySelector('#tm-auto-continue-seconds');
      if (span) span.textContent = String(Math.max(remaining, 0));
      if (remaining <= 0) finish(true);
    }, 1000);
  }

  // (v4.300) Abort an in-flight auto-continue countdown (the toggle-off path). Belt-and-
  // suspenders: even if the cancel handle was somehow lost, remove any orphaned overlay.
  function tmCancelAutoContinueCountdown() {
    try { if (tmAutoContinueCountdownCancel) tmAutoContinueCountdownCancel(); } catch (e) {}
    try { var ov = document.getElementById('tm-auto-continue-overlay'); if (ov && ov.parentNode) ov.parentNode.removeChild(ov); } catch (e2) {}
  }

  function tmProcessAutoContinueQueue() {
    if (tmAutoContinueActive || !tmAutoContinueQueue.length) return;
    var head = tmAutoContinueQueue[0];
    // (v4.288) Error-triggered resumes respect the session's backoff window; the modal only
    // appears once the window elapses. Non-error resumes (recovery, turn-limit, manual) never wait.
    if (tmAutoResumeIsErrorReason(head.reason)) {
      var delayMs = tmGetAutoResumeDelayMs(head.sessionId);
      if (delayMs > 250) {
        setTimeout(tmProcessAutoContinueQueue, delayMs);
        return;
      }
    }
    tmAutoContinueActive = tmAutoContinueQueue.shift();
    tmShowAutoContinueCountdown(tmAutoContinueActive);
  }

  // (v4.288) Per-session exponential backoff for ERROR-triggered resumes. Never caps attempts --
  // only spaces them: 15s, 30s, 60s, 120s, 240s, 480s, then clamp 600s, resetting on the first
  // healthy response for that session. In-memory by design (refresh = manual reset).
  var tmAutoResumeBackoff = {};
  function tmAutoResumeIsErrorReason(reason) {
    return /^(http_error_|stream_error_|stall_no_bytes|stream_aborted|fetch_dropped|empty_stream)/.test(String(reason || ''));
  }
  function tmGetAutoResumeDelayMs(sessionId) {
    try {
      var b = tmAutoResumeBackoff[String(sessionId)];
      if (!b || !b.nextTs) return 0;
      return Math.max(0, b.nextTs - Date.now());
    } catch (e) { return 0; }
  }
  function tmNoteAutoResumeAttempt(sessionId) {
    try {
      var k = String(sessionId);
      var b = tmAutoResumeBackoff[k] || { fails: 0, nextTs: 0 };
      b.fails++;
      var waitSec = Math.min(15 * Math.pow(2, b.fails - 1), 600);
      b.nextTs = Date.now() + waitSec * 1000;
      tmAutoResumeBackoff[k] = b;
    } catch (e) {}
  }
  function tmResetAutoResumeBackoff(sessionId) {
    try { delete tmAutoResumeBackoff[String(sessionId)]; } catch (e) {}
  }

  function tmQueueAutoContinue(sessionId, reason, detail) {
    // (v4.300) THE OFF SWITCH IS REAL. Every automatic resume path (15m silence watchdog,
    // stream abort/error/empty sensors, turn-limit observer, agent-management sweep, oversized
    // recovery) funnels through this ONE queue. Refuse when agent management is disabled -- the
    // v4.292 toggle had only gated the sweep, so the older v4.281 sensors kept firing the
    // actuator (10s modal + session switch + Continue) with the toggle OFF. The only exempt
    // reason is 'manual_debug' (an explicit human action, never autonomous monitoring).
    if (!tmAgentManagementEnabled() && reason !== 'manual_debug') return false;
    if (!sessionId) {
      console.warn('⚠️ [v' + EXT_VERSION + '] Auto-resume skipped: no explicit Session ID in request.');
      return false;
    }
    var key = String(sessionId) + '::' + String(reason || 'unknown') + '::' + String(detail || '');
    if (tmAutoContinueActive && tmAutoContinueActive.key === key) return false;
    for (var i = 0; i < tmAutoContinueQueue.length; i++) if (tmAutoContinueQueue[i].key === key) return false;
    tmAutoContinueQueue.push({ key: key, sessionId: String(sessionId), reason: String(reason || 'unknown'), detail: detail || null, ts: Date.now() });
    tmProcessAutoContinueQueue();
    return true;
  }

  function tmAppendContinuityText(state, text) {
    if (typeof text !== 'string' || !text) return;
    state.textTail = (state.textTail + text).slice(-2048);
  }

  function tmInspectContinuityObject(obj, state) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      for (var ai = 0; ai < obj.length; ai++) tmInspectContinuityObject(obj[ai], state);
      return;
    }
    state.sawAnyData = true;
    if (obj.error && typeof obj.error === 'object') {
      var code = Number(obj.error.code);
      // (v4.287) CODE-LESS provider errors: many endpoints (direct Moonshot confirmed live) ship
      // {error:{message, type:'engine_overloaded_error'}} with NO numeric code. Classify by
      // type/message heuristics into the same numeric buckets the retry logic already uses.
      if (isNaN(code)) {
        var etext = (String(obj.error.type || '') + ' ' + String(obj.error.message || '')).toLowerCase();
        if (/overload|overloaded|capacity|rate.?limit|too many|busy|throttl/.test(etext)) code = 429;
        else if (/timeout|timed.?out|deadline|idle/.test(etext)) code = 504;
        else if (/server|internal|unavailable|upstream|bad.?gateway|overload/.test(etext)) code = 503;
      }
      if (code === 429 || (code >= 500 && code < 600)) state.transientError = { code: code, message: String(obj.error.message || 'streamed provider error') };
    }
    if (Array.isArray(obj.choices)) obj.choices.forEach(function(choice) {
      if (!choice) return;
      var d = choice.delta || {};
      if (typeof d.content === 'string') tmAppendContinuityText(state, d.content);
      if (choice.message && typeof choice.message.content === 'string') tmAppendContinuityText(state, choice.message.content);
      if (Array.isArray(d.tool_calls) && d.tool_calls.length) state.sawToolCall = true;
      if (d.function_call) state.sawToolCall = true;
      if (choice.message && Array.isArray(choice.message.tool_calls) && choice.message.tool_calls.length) state.sawToolCall = true;
      if (choice.message && choice.message.function_call) state.sawToolCall = true;
      if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'function_call') state.sawToolCall = true;
      // Gemini native streamGenerateContent: tool turns usually finish with STOP, so the only
      // reliable signal is a functionCall part inside candidates[].content.parts[].
      var gp = choice.content && Array.isArray(choice.content.parts) ? choice.content.parts : [];
      for (var gpi = 0; gpi < gp.length; gpi++) if (gp[gpi] && gp[gpi].functionCall) state.sawToolCall = true;
    });
    if (Array.isArray(obj.candidates)) obj.candidates.forEach(function(candidate) {
      var parts = candidate && candidate.content && Array.isArray(candidate.content.parts) ? candidate.content.parts : [];
      for (var pi = 0; pi < parts.length; pi++) if (parts[pi] && parts[pi].functionCall) state.sawToolCall = true;
    });
    if (obj.type === 'content_block_delta' && obj.delta && typeof obj.delta.text === 'string') tmAppendContinuityText(state, obj.delta.text);
    if (obj.type === 'content_block_start' && obj.content_block && obj.content_block.type === 'tool_use') state.sawToolCall = true;
    if (obj.type === 'message_delta' && obj.delta && obj.delta.stop_reason === 'tool_use') state.sawToolCall = true;
    if (obj.stop_reason === 'tool_use') state.sawToolCall = true;
    if (obj.message && obj.message.stop_reason === 'tool_use') state.sawToolCall = true;
    var anthropicContent = Array.isArray(obj.content) ? obj.content : (obj.message && Array.isArray(obj.message.content) ? obj.message.content : []);
    for (var aci = 0; aci < anthropicContent.length; aci++) if (anthropicContent[aci] && anthropicContent[aci].type === 'tool_use') state.sawToolCall = true;
    if (obj.type === 'response.output_text.delta' && typeof obj.delta === 'string') tmAppendContinuityText(state, obj.delta);
    if ((obj.type === 'response.output_item.added' || obj.type === 'response.output_item.done') && obj.item && obj.item.type === 'function_call') state.sawToolCall = true;
    var responseOutput = obj.response && Array.isArray(obj.response.output) ? obj.response.output : (Array.isArray(obj.output) ? obj.output : []);
    for (var roi = 0; roi < responseOutput.length; roi++) if (responseOutput[roi] && responseOutput[roi].type === 'function_call') state.sawToolCall = true;
  }

  function tmTapContinuitySignals(response, sessionId, stubbedIds, hooks) {
    hooks = hooks || {};
    function petWatchdog() { try { if (hooks.pet) hooks.pet(); } catch (e) {} }
    function disarmWatchdog() { try { if (hooks.disarm) hooks.disarm(); } catch (e) {} }
    var ids = {};
    (stubbedIds || []).forEach(function(id) { ids[String(id)] = true; });
    if (!sessionId || !response || typeof response.clone !== 'function') { disarmWatchdog(); return response; }
    var clone;
    try { clone = response.clone(); } catch (e) { disarmWatchdog(); return response; }
    var state = { textTail: '', rawCarry: '', transientError: null, sawToolCall: false, sawAnyData: false, bytesReceived: 0 };
    var httpStatus = 0;
    try { httpStatus = Number(response.status) || 0; } catch (eStatus) {}
    function stampTrigger(reason) { try { if (hooks.stamp) hooks.stamp(reason); } catch (e) {} }
    function inspectLine(line) {
      var s = String(line || '').trim();
      if (!s) return;
      if (s.indexOf('data:') === 0) s = s.slice(5).trim();
      if (!s || s === tmDoneMarker()) return;
      state.sawAnyData = true;
      try {
        tmInspectContinuityObject(JSON.parse(s), state);
      } catch (e) {
        // Pretty-printed/non-SSE JSON can split one object across many lines. Preserve the four
        // protocol terminal-tool signals without buffering an unbounded full response merely to
        // reassemble it at close.
        if (/"functionCall"\s*:|"type"\s*:\s*"(?:tool_use|function_call)"|"finish_reason"\s*:\s*"(?:tool_calls|function_call)"/.test(s)) {
          state.sawToolCall = true;
        }
      }
    }
    function finish() {
      disarmWatchdog();
      if (state.rawCarry) inspectLine(state.rawCarry);
      var queuedReason = null;
      // (v4.287) HTTP STATUS sensor (authoritative, checked first). On OpenRouter this only fires
      // after the v4.202 retry engine has exhausted its own attempts; elsewhere it is first-line.
      if (httpStatus === 429 || (httpStatus >= 500 && httpStatus < 600)) {
        queuedReason = 'http_error_' + httpStatus;
      } else if (state.transientError) {
        queuedReason = 'stream_error_' + state.transientError.code;
      } else if (!state.sawAnyData && httpStatus < 400) {
        // (v4.286) EMPTY STREAM: clean close with NO parsed data events (2xx only).
        queuedReason = 'empty_stream';
      }
      if (queuedReason) {
        stampTrigger(queuedReason);
        tmQueueAutoContinue(sessionId, queuedReason,
          queuedReason === 'empty_stream' ? 'response closed with no data'
            : (state.transientError ? state.transientError.message : ('HTTP ' + httpStatus + ' response')));
        return;
      }
      // (v4.288) HEALTHY finish (no error sensor fired): clear this session's resume backoff.
      tmResetAutoResumeBackoff(sessionId);
      // (v4.292) This is the authoritative per-session handoff marker for agent management.
      // A later outbound payload clears it; until then the DOM liveness probe decides whether the
      // client is still executing the tool or TypingMind stopped at its 50-tool safety boundary.
      tmAgentManagementNoteResponse(sessionId, state.sawToolCall, hooks.captureId || null);
      if (state.sawToolCall || !Object.keys(ids).length) return;
      var text = state.textTail.trim();
      var m = text.match(/^Please restore tool result\s+([^\s]+)$/);
      if (m && ids[String(m[1])]) {
        stampTrigger('oversized_result_recovery');
        tmQueueAutoContinue(sessionId, 'oversized_result_recovery', String(m[1]));
      }
    }
    try {
      if (clone.body && typeof clone.body.getReader === 'function') {
        var reader = clone.body.getReader();
        var decoder = new TextDecoder();
        (function pump() {
          reader.read().then(function(r) {
            if (r.done) { state.rawCarry += decoder.decode(); finish(); return; }
            petWatchdog();
            state.bytesReceived += (r.value && r.value.length) || 0;
            state.rawCarry += decoder.decode(r.value, { stream: true });
            var nl;
            while ((nl = state.rawCarry.indexOf('\n')) !== -1) {
              var line = state.rawCarry.slice(0, nl);
              state.rawCarry = state.rawCarry.slice(nl + 1);
              inspectLine(line);
            }
            pump();
          }).catch(function() {
            // (v4.286) STREAM ABORTED: connection dropped mid-turn after bytes were flowing.
            if (state.bytesReceived > 0) {
              stampTrigger('stream_aborted');
              tmQueueAutoContinue(sessionId, 'stream_aborted', 'stream errored after ' + state.bytesReceived + ' bytes');
            }
            disarmWatchdog();
          });
        })();
      } else {
        clone.text().then(function(text) {
          petWatchdog();
          String(text || '').split(/\r?\n/).forEach(inspectLine);
          finish();
        }).catch(function() { disarmWatchdog(); });
      }
    } catch (e) { disarmWatchdog(); }
    return response;
  }

  // (Fix 17, v4.202) Minimal popup showing the full raw error JSON for the most-recent error.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmShowErrorPopup-blhe,
  //   role=__lambdao_1.tmShowErrorPopup,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Raw-JSON error popup opened from the widget's red error row.,
  // ]
  function tmShowErrorPopup() {
    if (typeof document === 'undefined' || !tmMostRecentError) return;
    var existing = document.getElementById('tm-error-popup-overlay');
    if (existing) { existing.parentNode.removeChild(existing); }
    var overlay = document.createElement('div');
    overlay.id = 'tm-error-popup-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;';
    var box = document.createElement('div');
    box.style.cssText = 'max-width:80vw;max-height:80vh;overflow:auto;background:#14141a;border:1px solid #444;border-radius:8px;padding:14px;box-shadow:0 8px 40px rgba(0,0,0,0.6);';
    var hdr = document.createElement('div');
    hdr.style.cssText = 'color:#ff6b6b;font-weight:bold;font-size:13px;margin-bottom:8px;font-family:monospace;';
    var e = tmMostRecentError;
    hdr.textContent = 'Error ' + (e.code != null ? e.code : '?') + (e.provider ? (' from ' + e.provider) : '') + (e.attempt > 0 ? (' (auto-retried x' + e.attempt + ')') : '');
    var pre = document.createElement('pre');
    pre.style.cssText = 'color:#d0d0d8;font-size:11px;font-family:monospace;white-space:pre-wrap;word-break:break-word;margin:0;';
    var jsonText = '';
    try { jsonText = JSON.stringify(e.full != null ? e.full : e, null, 2); } catch (x) { jsonText = String(e.raw || e.message || 'error'); }
    pre.textContent = jsonText;
    var hint = document.createElement('div');
    hint.style.cssText = 'color:#8ef0a0;font-size:11px;margin-top:8px;font-family:monospace;';
    hint.textContent = e.remedy_hint ? ('remedy: ' + e.remedy_hint) : '';
    var foot = document.createElement('div');
    foot.style.cssText = 'color:#888;font-size:10px;margin-top:10px;';
    foot.textContent = 'click anywhere or press Esc to close';
    box.appendChild(hdr); box.appendChild(pre);
    if (e.remedy_hint) box.appendChild(hint);
    box.appendChild(foot);
    overlay.appendChild(box);
    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener('keydown', onKey, true);
    }
    function onKey(ev) {
      // (v4.247) Self-uninstall a leaked copy: this modal is replaced (overlay removed, function
      // re-called) without its listener being detached, so one copy leaks per reopen.
      if (!overlay.parentNode) { document.removeEventListener('keydown', onKey, true); return; }
      if (ev.key === 'Escape' || ev.keyCode === 27) { ev.stopPropagation(); close(); }
    }
    overlay.addEventListener('click', function() { close(); });
    box.addEventListener('click', function(ev) { ev.stopPropagation(); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
  }

  // (v4.206) Shared builder for the provider-routing <select>, used by BOTH the persistent widget
  // model row AND the ring-buffer modal (most-recent entry per identity). Identical semantics.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmBuildProviderRoutingDropdown-f8x3,
  //   role=__lambdao_1.tmBuildProviderRoutingDropdown,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Shared LOCKED/AUTO/FLOAT/multi-select dropdown builder used by BOTH the widget model row and the modal's most-recent entry of each identity.,
  // ]
  function tmBuildProviderRoutingDropdown(idKey, model, providerLabel) {
    var lock = tmGetProviderLock(idKey);
    var seed = tmGetProviderEntries(model);
    var isFloat = lock && lock.slug === '__float';
    var isSet = lock && lock.mode === 'set';
    var lockGlyph = isSet ? '\uD83C\uDFAF' : (isFloat ? '\uD83C\uDF0A' : (lock ? '\uD83D\uDD12' : '\uD83D\uDD13'));
    var lockLabel = isSet ? ('Set(' + lock.slugs.length + ')') : (lock ? lock.label : (providerLabel || 'auto'));
    var opts = [];
    opts.push('<option value="__auto">' + (lock ? '\uD83D\uDD13 Auto-lock on first hit' : '\uD83D\uDD13 Auto (no lock yet)') + '</option>');
    opts.push('<option value="__float">\uD83C\uDF0A Float (never lock)</option>');
    opts.push('<option value="__set">\uD83C\uDFAF Multi-select set…</option>');
    if (lock && !isFloat && !isSet) {
      opts.push('<option value="' + escapeHtml(lock.slug) + '" selected>\uD83D\uDD12 Locked: ' + escapeHtml(lock.label) + '</option>');
    }
    if (isSet) {
      opts.push('<option value="__set" selected>\uD83C\uDFAF Set: ' + escapeHtml((lock.labels || lock.slugs).join('+')) + '</option>');
    }
    opts.push('<option value="" disabled>── switch (costs 1 cache write) ──</option>');
    for (var si = 0; si < seed.length; si++) {
      var se = seed[si];
      var badge = se.cache ? '\uD83D\uDFE2' : '\u26D4';
      var optLabel = badge + ' ' + escapeHtml(se.label) + ' \u00b7 ' + escapeHtml(se.note || '');
      if (lock && !isFloat && !isSet && lock.slug === se.slug) continue; // already shown above
      opts.push('<option value="' + escapeHtml(se.slug) + '">' + optLabel + '</option>');
    }
    return ' <select data-action="set-provider-routing" data-identity-key="' + escapeHtml(idKey) + '" title="Provider routing" style="font-size:9px;background:#222;color:#8ef0a0;border:1px solid #444;border-radius:3px;padding:0 2px;margin-left:4px;max-width:170px;">' +
      '<option value="" disabled selected>' + lockGlyph + ' ' + escapeHtml(lockLabel) + '</option>' +
      opts.join('') +
      '</select>';
  }

  // (v4.206) Shared change handler for any set-provider-routing <select> (widget OR ring modal).
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmHandleProviderRoutingChange-ane3,
  //   role=__lambdao_1.tmHandleProviderRoutingChange,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Dropdown change handler: writes/clears the identity's provider lock across lock/set/float modes.,
  // ]
  function tmHandleProviderRoutingChange(target) {
    if (!target || !target.dataset) return false;
    var routeVal = target.value;
    // Guard: the initial disabled placeholder <option> has value="" — a click open on a
    // <select> fires change with that empty value, and the downstream re-render destroys
    // the select DOM, closing the browser popup instantly. Only act on a real value change.
    if (!routeVal) return false;
    var routeIdKey = target.dataset.identityKey || '';
    var changed = false;
    if (routeVal === '__auto') {
      tmClearProviderLock(routeIdKey);
      console.log('🔓 [v' + EXT_VERSION + '] Provider lock cleared for ' + routeIdKey + ' — auto-lock on next hit');
      changed = true;
    } else if (routeVal === '__float') {
      tmSetProviderLock(routeIdKey, '__float', 'Float', true);
      console.log('🌊 [v' + EXT_VERSION + '] Provider set to FLOAT for ' + routeIdKey);
      changed = true;
    } else if (routeVal === '__set') {
      try { tmShowProviderSetModal(routeIdKey, (routeIdKey.split('::')[1]) || ''); } catch (e) {}
      changed = true;
    } else if (routeVal) {
      var routeModel = (routeIdKey.split('::')[1]) || '';
      var routeSeed = tmGetProviderEntries(routeModel);
      var routeLabel = routeVal;
      for (var ri = 0; ri < routeSeed.length; ri++) {
        if (routeSeed[ri].slug === routeVal) { routeLabel = routeSeed[ri].label; break; }
      }
      tmSetProviderLock(routeIdKey, routeVal, routeLabel, true);
      console.log('🔒 [v' + EXT_VERSION + '] Provider manually locked to ' + routeLabel + ' (' + routeVal + ') for ' + routeIdKey);
      changed = true;
    }
    if (changed) {
      try { renderGpt51UsageWidget(); } catch (e) {}
      try { if (typeof payloadCaptureModalEl !== 'undefined' && payloadCaptureModalEl && payloadCaptureModalEl.style.display !== 'none') renderPayloadCaptureModal(); } catch (e) {}
    }
    return changed;
  }

  // (Fix 18, v4.204) Multi-select modal: choose the curated set of providers OpenRouter may
  // route among for this session identity. Apply writes a set lock via tmSetProviderSetLock.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmShowProviderSetModal-y2t7,
  //   role=__lambdao_1.tmShowProviderSetModal,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Fix 18: multi-select allowed-provider SET modal (checkboxes with cache/toxic badges) writing provider.only locks.,
  // ]
  function tmShowProviderSetModal(idKey, model) {
    if (typeof document === 'undefined' || !idKey) return;
    var seed = tmGetProviderEntries(model);
    if (!seed.length) return;
    var lock = tmGetProviderLock(idKey);
    var cur = (lock && lock.mode === 'set' && Array.isArray(lock.slugs)) ? lock.slugs : [];
    var existing = document.getElementById('tm-provider-set-overlay');
    if (existing) existing.parentNode.removeChild(existing);
    var overlay = document.createElement('div');
    overlay.id = 'tm-provider-set-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;';
    var box = document.createElement('div');
    box.style.cssText = 'min-width:360px;max-width:90vw;max-height:80vh;overflow:auto;background:#14141a;border:1px solid #444;border-radius:8px;padding:14px;box-shadow:0 8px 40px rgba(0,0,0,0.6);font-family:monospace;';
    var title = document.createElement('div');
    title.style.cssText = 'color:#8ef0a0;font-weight:bold;font-size:13px;margin-bottom:6px;';
    title.textContent = '🎯 Allowed provider set';
    var sub = document.createElement('div');
    sub.style.cssText = 'color:#9aa4b2;font-size:11px;margin-bottom:10px;line-height:1.4;';
    sub.textContent = 'Only checked providers may serve this session. OpenRouter smart-balances within the set; each keeps its own prompt cache warm. 429s auto-retry with backoff.';
    box.appendChild(title);
    box.appendChild(sub);
    var listWrap = document.createElement('div');
    listWrap.style.cssText = 'margin-bottom:10px;';
    seed.forEach(function(se) {
      var row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;color:' + (se.toxic ? '#ff9d9d' : '#d0d0d8') + ';padding:3px 0;cursor:pointer;';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = se.slug;
      cb.checked = cur.indexOf(se.slug) !== -1;
      row.appendChild(cb);
      var txt = document.createElement('span');
      txt.textContent = (se.cache ? '🟢' : '⛔') + ' ' + se.label + (se.note ? (' · ' + se.note) : '');
      row.appendChild(txt);
      listWrap.appendChild(row);
    });
    box.appendChild(listWrap);
    var warn = document.createElement('div');
    warn.style.cssText = 'color:#ff6b6b;font-size:11px;margin-bottom:8px;display:none;';
    warn.textContent = 'Pick at least one provider.';
    box.appendChild(warn);
    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'background:#333;color:#ccc;border:none;border-radius:4px;padding:4px 12px;font-size:12px;cursor:pointer;';
    var okBtn = document.createElement('button');
    okBtn.textContent = 'Apply set';
    okBtn.style.cssText = 'background:#245f36;color:#fff;border:none;border-radius:4px;padding:4px 12px;font-size:12px;cursor:pointer;font-weight:bold;';
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(okBtn);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener('keydown', onKey, true);
    }
    function onKey(ev) {
      // (v4.247) Self-uninstall a leaked copy: this modal is replaced (overlay removed, function
      // re-called) without its listener being detached, so one copy leaks per reopen.
      if (!overlay.parentNode) { document.removeEventListener('keydown', onKey, true); return; }
      if (ev.key === 'Escape' || ev.keyCode === 27) { ev.stopPropagation(); close(); }
    }
    overlay.addEventListener('click', function() { close(); });
    box.addEventListener('click', function(ev) { ev.stopPropagation(); });
    cancelBtn.addEventListener('click', function(ev) { ev.stopPropagation(); close(); });
    okBtn.addEventListener('click', function(ev) {
      ev.stopPropagation();
      var checked = [];
      var labels = [];
      var boxes = listWrap.querySelectorAll('input[type=checkbox]');
      for (var i = 0; i < boxes.length; i++) {
        if (boxes[i].checked) {
          checked.push(boxes[i].value);
          for (var j = 0; j < seed.length; j++) { if (seed[j].slug === boxes[i].value) { labels.push(seed[j].label); break; } }
        }
      }
      if (!checked.length) { warn.style.display = 'block'; return; }
      tmSetProviderSetLock(idKey, checked, labels);
      console.log('🎯 [v' + EXT_VERSION + '] Provider SET locked to [' + checked.join(', ') + '] for ' + idKey);
      try { renderGpt51UsageWidget(); } catch (e) {}
      close();
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
  }

  // (v4.229) Format a comment for inline preview display: strip empty lines, join with " - ".
  function tmFormatCommentPreview(comment) {
    if (!comment) return '';
    var lines = comment.split(/\r?\n/).map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });
    return lines.join(' - ');
  }

  // (v4.229) Provider ratings modal: hierarchical model→provider list with
  // red/green counts with +/− buttons and free-text comments.
  function tmShowProviderRatingsModal(_isRerender) {
    if (typeof document === 'undefined') return;
    tmDiscoverAndMergeProviderRatings();
    var ratings = tmGetProviderRatings();
    if (!_isRerender) tmRatingsTreeExpanded = tmSeedTreeExpanded(tmReadTreePath(TM_RATINGS_TREE_PATH_KEY));
    var existing = document.getElementById('tm-provider-ratings-overlay');
    if (existing) existing.parentNode.removeChild(existing);

    var overlay = document.createElement('div');
    overlay.id = 'tm-provider-ratings-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;';

    var box = document.createElement('div');
    box.style.cssText = 'width:70vw;max-width:900px;height:80vh;background:#14141a;border:1px solid #444;border-radius:8px;padding:14px;box-shadow:0 8px 40px rgba(0,0,0,0.6);display:flex;flex-direction:column;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:12px;color:#fff;';

    // (v4.240) Count tombstoned (user-deleted) provider keys so the restore button can show a badge.
    var _tombCount = 0;
    try { if (ratings._deleted && typeof ratings._deleted === 'object') { for (var _dk in ratings._deleted) { if (ratings._deleted.hasOwnProperty(_dk)) _tombCount++; } } } catch (e) {}

    var hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;';
    hdr.innerHTML = '<span style="font-weight:bold;font-size:13px;color:#8ef0a0;">📊 Provider Ratings</span>' +
      '<span>' +
      '<button data-action="restore-deleted-providers" title="Restore rows you deleted (they were hidden, not lost). Re-runs discovery so deleted rows reappear." style="background:#2a3a4a;color:#a0c8ff;border:1px solid #3a5a7a;border-radius:3px;padding:2px 8px;font-size:11px;cursor:pointer;margin-right:6px;">♻ Restore deleted' + (_tombCount > 0 ? (' (' + _tombCount + ')') : '') + '</button>' +
      '<button data-action="close-provider-ratings" style="background:#444;color:#fff;border:none;border-radius:3px;padding:2px 8px;font-size:11px;cursor:pointer;">Close</button>' +
      '</span>';
    box.appendChild(hdr);

    var sub = document.createElement('div');
    sub.style.cssText = 'color:#9aa4b2;font-size:11px;margin-bottom:10px;line-height:1.4;';
    sub.textContent = 'Tree: broad family → specific model → route endpoint → serving provider. Leaves carry ratings/comments. The most recently used branch reopens automatically.';
    box.appendChild(sub);

    // (v4.273) Four-level tree: broad family → specific model → endpoint → provider leaf.
    // Persisted rating keys remain the original FULL model::provider strings.
    var routeCatalog = tmBuildProviderRouteCatalog();
    var ratingRecords = [];
    for (var key in ratings) {
      if (!ratings.hasOwnProperty(key)) continue;
      var parts = key.split('::');
      if (parts.length < 2) continue; // skips _deleted metadata
      ratingRecords.push({
        storageModel: parts[0],
        provider: parts.slice(1).join('::'),
        value: ratings[key]
      });
    }
    var ratingTree = tmBuildProviderCatalogTree(ratingRecords, routeCatalog, true);
    var broadKeys = Object.keys(ratingTree).sort(function(a, b) {
      return ratingTree[a].label.localeCompare(ratingTree[b].label);
    });

    if (!broadKeys.length) {
      var empty = document.createElement('div');
      empty.style.cssText = 'color:#777;font-size:12px;text-align:center;padding:40px 0;';
      empty.textContent = 'No provider data yet. Send some messages and providers will appear here automatically.';
      box.appendChild(empty);
    } else {
      var listWrap = document.createElement('div');
      listWrap.style.cssText = 'flex:1;overflow:auto;';

      function appendRatingTreeHeader(parent, path, label, count, level, viaProxy) {
        var palette = [
          { color:'#8ef0a0', bg:'rgba(30,80,45,0.28)', border:'#326040', pad:4, size:14 },
          { color:'#8fc4ff', bg:'rgba(30,55,85,0.28)', border:'#31536f', pad:18, size:13 },
          { color:'#ffd166', bg:'rgba(85,65,25,0.25)', border:'#665126', pad:34, size:12 }
        ][level];
        var isOpen = !!tmRatingsTreeExpanded[tmTreePathId(path)];
        var h = document.createElement('div');
        h.dataset.action = 'rating-tree-toggle';
        h.dataset.path = JSON.stringify(path);
        h.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:' + (level === 0 ? 6 : 2) + 'px;padding:5px 6px 5px ' + palette.pad + 'px;background:' + palette.bg + ';border-left:3px solid ' + palette.border + ';color:' + palette.color + ';font-size:' + palette.size + 'px;font-weight:700;cursor:pointer;user-select:none;';
        var arrow = document.createElement('span');
        arrow.style.cssText = 'display:inline-block;width:12px;flex-shrink:0;';
        arrow.textContent = isOpen ? '▾' : '▸';
        h.appendChild(arrow);
        var text = document.createElement('span');
        text.textContent = label;
        h.appendChild(text);
        if (viaProxy) {
          var proxy = document.createElement('span');
          proxy.style.cssText = 'color:#c8a8ff;font-size:9px;font-weight:600;border:1px solid #684b88;border-radius:8px;padding:0 5px;';
          proxy.textContent = 'via TypingMind proxy';
          h.appendChild(proxy);
        }
        var cnt = document.createElement('span');
        cnt.style.cssText = 'color:#8b93a3;font-size:10px;font-weight:normal;';
        cnt.textContent = '(' + count + ')';
        h.appendChild(cnt);
        parent.appendChild(h);
        return isOpen;
      }

      broadKeys.forEach(function(broadKey) {
        var broad = ratingTree[broadKey];
        var variantKeys = Object.keys(broad.variants).sort();
        var broadPath = [broad.key];
        if (!appendRatingTreeHeader(listWrap, broadPath, broad.label, variantKeys.length, 0, false)) return;

        variantKeys.forEach(function(variantKey) {
          var variant = broad.variants[variantKey];
          var endpointKeys = Object.keys(variant.endpoints).sort(function(a, b) {
            return variant.endpoints[a].label.localeCompare(variant.endpoints[b].label);
          });
          var variantPath = [broad.key, variant.key];
          if (!appendRatingTreeHeader(listWrap, variantPath, variant.label, endpointKeys.length, 1, false)) return;

          endpointKeys.forEach(function(endpointKey) {
            var endpoint = variant.endpoints[endpointKey];
            var leaves = Object.keys(endpoint.leaves).map(function(k) { return endpoint.leaves[k]; }).sort(function(a, b) {
              return a.leafDisplay.localeCompare(b.leafDisplay);
            });
            var endpointPath = [broad.key, variant.key, endpoint.key];
            if (!appendRatingTreeHeader(listWrap, endpointPath, endpoint.label, leaves.length, 2, endpoint.viaProxy)) return;

            leaves.forEach(function(leaf) {
              var storageModel = leaf.storageModel;
              var prov = leaf.provider;
              var r = leaf.value || { red:0, green:0, comment:'' };
              var ratingIdBase = (storageModel + '__' + prov).replace(/[^a-zA-Z0-9]/g, '_');

              var row = document.createElement('div');
              row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 8px 6px 52px;border-bottom:1px solid rgba(70,70,80,0.32);font-size:12px;min-width:0;';

              var labelWrap = document.createElement('span');
              labelWrap.style.cssText = 'display:flex;flex-direction:column;min-width:210px;max-width:340px;overflow:hidden;flex-shrink:0;';
              var label = document.createElement('span');
              label.style.cssText = 'color:#e6e6ee;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
              label.textContent = leaf.leafDisplay;
              label.title = prov;
              labelWrap.appendChild(label);
              var modelLine = document.createElement('span');
              modelLine.style.cssText = 'color:#7f8a9a;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
              modelLine.textContent = storageModel;
              modelLine.title = storageModel;
              labelWrap.appendChild(modelLine);

              try {
                var entries = tmGetProviderEntries(storageModel);
                var base = tmNormalizeProviderBaseSlug(prov);
                for (var ei = 0; ei < entries.length; ei++) {
                  if (tmNormalizeProviderBaseSlug(entries[ei].slug) === base && entries[ei].maxContext != null) {
                    var ctx = document.createElement('span');
                    ctx.style.cssText = 'color:#7fb3ff;font-size:9px;';
                    ctx.textContent = 'ctx ' + tmFmtCtx(entries[ei].maxContext);
                    labelWrap.appendChild(ctx);
                    break;
                  }
                }
              } catch (e) {}
              row.appendChild(labelWrap);

              function ratingButton(text, action, field, css) {
                var b = document.createElement('button');
                b.textContent = text;
                b.style.cssText = css;
                b.dataset.action = action;
                b.dataset.field = field;
                b.dataset.model = storageModel;
                b.dataset.provider = prov;
                return b;
              }
              var redCss = 'background:#3a1a1a;color:#ff6b6b;border:1px solid #5a2a2a;border-radius:3px;width:22px;height:20px;font-size:13px;cursor:pointer;flex-shrink:0;padding:0;line-height:1;';
              var greenCss = 'background:#1a3a1a;color:#7dd67d;border:1px solid #2a5a2a;border-radius:3px;width:22px;height:20px;font-size:13px;cursor:pointer;flex-shrink:0;padding:0;line-height:1;';
              row.appendChild(ratingButton('+', 'rating-increment', 'red', redCss));
              var redCount = document.createElement('span');
              redCount.textContent = String(r.red || 0);
              redCount.style.cssText = 'color:#ff6b6b;font-weight:bold;font-size:16px;min-width:28px;text-align:center;';
              redCount.id = 'tm-rating-red-' + ratingIdBase;
              row.appendChild(redCount);
              row.appendChild(ratingButton('−', 'rating-decrement', 'red', redCss));
              var sep = document.createElement('span'); sep.textContent = '|'; sep.style.cssText = 'color:#555;margin:0 4px;'; row.appendChild(sep);
              row.appendChild(ratingButton('−', 'rating-decrement', 'green', greenCss));
              var greenCount = document.createElement('span');
              greenCount.textContent = String(r.green || 0);
              greenCount.style.cssText = 'color:#7dd67d;font-weight:bold;font-size:16px;min-width:28px;text-align:center;';
              greenCount.id = 'tm-rating-green-' + ratingIdBase;
              row.appendChild(greenCount);
              row.appendChild(ratingButton('+', 'rating-increment', 'green', greenCss));

              var commentBtn = document.createElement('button');
              commentBtn.textContent = '📝';
              commentBtn.style.cssText = 'background:' + (r.comment ? '#4a4a1a' : '#333') + ';color:' + (r.comment ? '#ffe0a0' : '#fff') + ';border:1px solid ' + (r.comment ? '#6a6a2a' : '#555') + ';border-radius:3px;width:28px;height:20px;font-size:12px;cursor:pointer;margin-left:6px;flex-shrink:0;padding:0;line-height:1;';
              commentBtn.dataset.action = 'rating-comment'; commentBtn.dataset.model = storageModel; commentBtn.dataset.provider = prov;
              row.appendChild(commentBtn);
              var preview = document.createElement('span');
              preview.className = 'tm-rating-comment-preview';
              preview.style.cssText = 'color:#9aa4b2;font-size:11px;margin-left:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1 1 auto;min-width:0;';
              preview.textContent = tmFormatCommentPreview(r.comment);
              preview.title = preview.textContent;
              row.appendChild(preview);
              var del = document.createElement('button');
              del.textContent = '🗑'; del.style.cssText = 'background:#3a1a1a;color:#ff9b9b;border:1px solid #5a2a2a;border-radius:3px;width:26px;height:20px;font-size:12px;cursor:pointer;margin-left:6px;flex-shrink:0;padding:0;line-height:1;';
              del.dataset.action = 'rating-delete'; del.dataset.model = storageModel; del.dataset.provider = prov;
              row.appendChild(del);
              listWrap.appendChild(row);
            });
          });
        });
      });
      box.appendChild(listWrap);
    }

    overlay.appendChild(box);

    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener('keydown', onKey, true);
      tmPayloadCaptureSuppressEscapeUntil = Date.now() + 1500;
      setTimeout(function() { tmPromptActive = false; }, 100);
    }
    function onKey(ev) {
      // (v4.247) SELF-UNINSTALL. This modal re-renders by removing its overlay and calling itself
      // again (every family toggle, every rating +/-, every delete) WITHOUT removing this
      // listener -- so each toggle leaked a permanent copy. If our overlay is gone we are a leak:
      // detach and do nothing. (v4.246 already made the ring modal immune to what these leaked
      // copies did to its Escape guard; this stops the unbounded accumulation itself.)
      if (!overlay.parentNode) { document.removeEventListener('keydown', onKey, true); return; }
      if (ev.key === 'Escape' || ev.keyCode === 27) {
        ev.stopPropagation();
        if (ev.preventDefault) ev.preventDefault();
        close();
      }
    }
    overlay.addEventListener('click', function(ev) {
      var t = ev.target;
      if (t === overlay || (t.dataset && t.dataset.action === 'close-provider-ratings')) {
        close();
        return;
      }
      // (v4.240) Restore deleted (tombstoned) provider rows: clear the tombstone map and re-run
      // discovery so those rows reappear. Safety net in case a delete was a mistake or the row is
      // now valid again.
      if (t.dataset && t.dataset.action === 'restore-deleted-providers') {
        ev.stopPropagation();
        try {
          var _rs = tmGetProviderRatings();
          if (_rs && _rs._deleted) { delete _rs._deleted; tmSaveProviderRatings(_rs); }
        } catch (e) {}
        tmShowProviderRatingsModal(true); // re-render (runs discovery, preserves tree state)
        return;
      }
      if (t.dataset && (t.dataset.action === 'rating-increment' || t.dataset.action === 'rating-decrement')) {
        ev.stopPropagation();
        var fld = t.dataset.field;
        var rModel = t.dataset.model;
        var rProv = t.dataset.provider;
        var rEntry = tmGetProviderRatingEntry(rModel, rProv);
        var delta = (t.dataset.action === 'rating-increment') ? 1 : -1;
        var newVal = Math.max(0, (rEntry[fld] || 0) + delta);
        tmSetProviderRatingField(rModel, rProv, fld, newVal);
        var countId = 'tm-rating-' + fld + '-' + (rModel + '__' + rProv).replace(/[^a-zA-Z0-9]/g, '_');
        var countEl = document.getElementById(countId);
        if (countEl) countEl.textContent = String(newVal);
        return;
      }
      if (t.dataset && t.dataset.action === 'rating-comment') {
        ev.stopPropagation();
        var cModel = t.dataset.model;
        var cProv = t.dataset.provider;
        tmShowProviderRatingCommentModal(cModel, cProv, overlay);
        return;
      }
      // (v4.273) Nested tree disclosure. Resolve through closest() so arrow/text/count clicks work.
      var treeToggle = (t && t.closest) ? t.closest('[data-action="rating-tree-toggle"]') : null;
      if (treeToggle && treeToggle.dataset) {
        ev.stopPropagation();
        var treePath = [];
        try { treePath = JSON.parse(treeToggle.dataset.path || '[]'); } catch (e) {}
        if (treePath.length) tmToggleTreePath(tmRatingsTreeExpanded, treePath, TM_RATINGS_TREE_PATH_KEY);
        tmShowProviderRatingsModal(true);
        return;
      }
      // (v4.236) Delete a provider-rating row, then re-render.
      if (t.dataset && t.dataset.action === 'rating-delete') {
        ev.stopPropagation();
        tmDeleteProviderRating(t.dataset.model, t.dataset.provider);
        tmShowProviderRatingsModal(true); // re-render, preserving tree state
        return;
      }
    });
    document.addEventListener('keydown', onKey, true);
    tmPromptActive = true;
    document.body.appendChild(overlay);
  }

  // (v4.229) Nested modal for editing a provider rating comment.
  function tmShowProviderRatingCommentModal(model, provider, parentOverlay) {
    if (typeof document === 'undefined') return;
    var existing = document.getElementById('tm-rating-comment-overlay');
    if (existing) existing.parentNode.removeChild(existing);

    var entry = tmGetProviderRatingEntry(model, provider);

    var overlay = document.createElement('div');
    overlay.id = 'tm-rating-comment-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483648;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';

    var box = document.createElement('div');
    box.style.cssText = 'width:60vw;max-width:600px;background:#1a1a22;border:1px solid #555;border-radius:8px;padding:14px;box-shadow:0 8px 40px rgba(0,0,0,0.7);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:12px;color:#fff;';

    var hdr = document.createElement('div');
    hdr.style.cssText = 'font-weight:bold;font-size:13px;color:#8ef0a0;margin-bottom:8px;';
    hdr.textContent = '📝 ' + provider + ' (' + model + ')';
    box.appendChild(hdr);

    var ta = document.createElement('textarea');
    ta.style.cssText = 'width:100%;height:120px;background:#0d0d11;border:1px solid #333;border-radius:4px;color:#d0d0d8;font-size:12px;font-family:monospace;padding:8px;box-sizing:border-box;resize:vertical;';
    ta.value = entry.comment || '';
    ta.placeholder = 'Notes about this provider for this model...';
    box.appendChild(ta);

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:10px;';

    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'background:#333;color:#ccc;border:none;border-radius:4px;padding:4px 12px;font-size:12px;cursor:pointer;';

    var saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.style.cssText = 'background:#245f36;color:#fff;border:none;border-radius:4px;padding:4px 12px;font-size:12px;cursor:pointer;font-weight:bold;';

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(saveBtn);
    box.appendChild(btnRow);
    overlay.appendChild(box);

    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
    overlay.addEventListener('click', function(ev) {
      if (ev.target === overlay) close();
    });
    cancelBtn.addEventListener('click', function(ev) { ev.stopPropagation(); close(); });
    saveBtn.addEventListener('click', function(ev) {
      ev.stopPropagation();
      tmSetProviderRatingField(model, provider, 'comment', ta.value);
      close();
      // Update the comment button's appearance in place (no full re-render needed).
      if (parentOverlay) {
        var buttons = parentOverlay.querySelectorAll('button[data-action="rating-comment"]');
        for (var i = 0; i < buttons.length; i++) {
          if (buttons[i].dataset.model === model && buttons[i].dataset.provider === provider) {
            if (ta.value) {
              buttons[i].style.background = '#4a4a1a';
              buttons[i].style.color = '#ffe0a0';
              buttons[i].style.borderColor = '#6a6a2a';
              buttons[i].title = 'Edit comment: ' + ta.value.substring(0, 80);
            } else {
              buttons[i].style.background = '#333';
              buttons[i].style.color = '#fff';
              buttons[i].style.borderColor = '#555';
              buttons[i].title = 'Add comment';
            }
            // Update the inline comment preview
            var previewSpan = buttons[i].nextElementSibling;
            if (previewSpan && previewSpan.className === 'tm-rating-comment-preview') {
              var preview = tmFormatCommentPreview(ta.value);
              if (preview) {
                previewSpan.textContent = preview;
                previewSpan.title = preview;
                previewSpan.style.display = '';
              } else {
                previewSpan.style.display = 'none';
              }
            }
            break;
          }
        }
      }
    });
    box.addEventListener('click', function(ev) { ev.stopPropagation(); });
    document.body.appendChild(overlay);
    setTimeout(function() { ta.focus(); }, 50);
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmShowCostEditorModal-scem,
  //   role=__lambdao_1.tmShowCostEditorModal,
  //   slice_labels=tm-payload-cost-visibility,tm-payload-overview,
  //   kind=ast,
  //   comment=Set Costs modal: hierarchical model→provider list with per-million pricing inputs for client-side cost calculation.,
  // ]
  // (v4.233) Set Costs modal: hierarchical model→provider list with per-million pricing inputs.
  // (v4.273) _isRerender preserves the in-visit tree expansion map. A fresh open reconstructs the
  // most recently interacted full branch from tm_provider_costs_tree_path_v1.
  function tmShowCostEditorModal(_isRerender) {
    if (typeof document === 'undefined') return;
    tmDiscoverAndMergeProviderCosts();
    var costs = tmGetProviderCosts();
    if (!_isRerender) tmCostsTreeExpanded = tmSeedTreeExpanded(tmReadTreePath(TM_COSTS_TREE_PATH_KEY));
    var existing = document.getElementById('tm-cost-editor-overlay');
    if (existing) existing.parentNode.removeChild(existing);

    var overlay = document.createElement('div');
    overlay.id = 'tm-cost-editor-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;';

    var box = document.createElement('div');
    box.style.cssText = 'width:75vw;max-width:1000px;height:80vh;background:#14141a;border:1px solid #444;border-radius:8px;padding:14px;box-shadow:0 8px 40px rgba(0,0,0,0.6);display:flex;flex-direction:column;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:12px;color:#fff;';

    var hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;';
    hdr.innerHTML = '<span style="font-weight:bold;font-size:13px;color:#a0c0ff;">\uD83D\uDCB2 Provider Cost Table</span>' +
      '<button data-action="close-cost-editor" style="background:#444;color:#fff;border:none;border-radius:3px;padding:2px 8px;font-size:11px;cursor:pointer;">Close</button>';
    box.appendChild(hdr);

    var sub = document.createElement('div');
    sub.style.cssText = 'color:#9aa4b2;font-size:11px;margin-bottom:10px;line-height:1.4;';
    sub.textContent = 'Tree: broad family → specific model → route endpoint → serving provider. Leaves carry per-million pricing. The most recently used branch reopens automatically.';
    box.appendChild(sub);

    // (v4.273) The same four-level tree as Provider Ratings. Pricing records retain their
    // original FULL model::provider keys and remain independently editable.
    var routeCatalog = tmBuildProviderRouteCatalog();
    var costRecords = [];
    for (var key in costs) {
      if (!costs.hasOwnProperty(key)) continue;
      var parts = key.split('::');
      if (parts.length < 2) continue;
      costRecords.push({ storageModel: parts[0], provider: parts.slice(1).join('::'), value: costs[key] });
    }
    var costTree = tmBuildProviderCatalogTree(costRecords, routeCatalog, false);
    var broadKeys = Object.keys(costTree).sort(function(a, b) {
      return costTree[a].label.localeCompare(costTree[b].label);
    });

    if (!broadKeys.length) {
      var empty = document.createElement('div');
      empty.style.cssText = 'color:#777;font-size:12px;text-align:center;padding:40px 0;';
      empty.textContent = 'No cost entries yet. Send some messages and providers will appear here automatically.';
      box.appendChild(empty);
    } else {
      var listWrap = document.createElement('div');
      listWrap.style.cssText = 'flex:1;overflow:auto;';

      function appendCostTreeHeader(parent, path, label, count, level, viaProxy) {
        var palette = [
          { color:'#a0c0ff', bg:'rgba(35,55,90,0.32)', border:'#405d91', pad:4, size:14 },
          { color:'#8ed9d1', bg:'rgba(25,75,72,0.25)', border:'#346b67', pad:18, size:13 },
          { color:'#ffd166', bg:'rgba(85,65,25,0.25)', border:'#665126', pad:34, size:12 }
        ][level];
        var isOpen = !!tmCostsTreeExpanded[tmTreePathId(path)];
        var h = document.createElement('div');
        h.dataset.action = 'cost-tree-toggle';
        h.dataset.path = JSON.stringify(path);
        h.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:' + (level === 0 ? 6 : 2) + 'px;padding:5px 6px 5px ' + palette.pad + 'px;background:' + palette.bg + ';border-left:3px solid ' + palette.border + ';color:' + palette.color + ';font-size:' + palette.size + 'px;font-weight:700;cursor:pointer;user-select:none;';
        var arrow = document.createElement('span'); arrow.style.cssText = 'display:inline-block;width:12px;'; arrow.textContent = isOpen ? '▾' : '▸'; h.appendChild(arrow);
        var text = document.createElement('span'); text.textContent = label; h.appendChild(text);
        if (viaProxy) {
          var proxy = document.createElement('span'); proxy.style.cssText = 'color:#c8a8ff;font-size:9px;font-weight:600;border:1px solid #684b88;border-radius:8px;padding:0 5px;'; proxy.textContent = 'via TypingMind proxy'; h.appendChild(proxy);
        }
        var cnt = document.createElement('span'); cnt.style.cssText = 'color:#8b93a3;font-size:10px;font-weight:normal;'; cnt.textContent = '(' + count + ')'; h.appendChild(cnt);
        parent.appendChild(h);
        return isOpen;
      }

      broadKeys.forEach(function(broadKey) {
        var broad = costTree[broadKey];
        var variantKeys = Object.keys(broad.variants).sort();
        if (!appendCostTreeHeader(listWrap, [broad.key], broad.label, variantKeys.length, 0, false)) return;
        variantKeys.forEach(function(variantKey) {
          var variant = broad.variants[variantKey];
          var endpointKeys = Object.keys(variant.endpoints).sort(function(a, b) { return variant.endpoints[a].label.localeCompare(variant.endpoints[b].label); });
          if (!appendCostTreeHeader(listWrap, [broad.key, variant.key], variant.label, endpointKeys.length, 1, false)) return;
          endpointKeys.forEach(function(endpointKey) {
            var endpoint = variant.endpoints[endpointKey];
            var leaves = Object.keys(endpoint.leaves).map(function(k) { return endpoint.leaves[k]; }).sort(function(a, b) { return a.leafDisplay.localeCompare(b.leafDisplay); });
            if (!appendCostTreeHeader(listWrap, [broad.key, variant.key, endpoint.key], endpoint.label, leaves.length, 2, endpoint.viaProxy)) return;
            leaves.forEach(function(leaf) {
              var storageModel = leaf.storageModel;
              var prov = leaf.provider;
              var c = leaf.value || { input:0, output:0, cache_read:0, cache_write:null };
              var row = document.createElement('div');
              row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 8px 6px 52px;border-bottom:1px solid rgba(70,70,80,0.32);font-size:12px;flex-wrap:wrap;';
              var labelWrap = document.createElement('span');
              labelWrap.style.cssText = 'display:flex;flex-direction:column;min-width:210px;max-width:340px;overflow:hidden;flex-shrink:0;';
              var label = document.createElement('span'); label.style.cssText = 'color:#e6e6ee;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'; label.textContent = leaf.leafDisplay; label.title = prov; labelWrap.appendChild(label);
              var modelLine = document.createElement('span'); modelLine.style.cssText = 'color:#7f8a9a;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'; modelLine.textContent = storageModel; modelLine.title = storageModel; labelWrap.appendChild(modelLine);
              row.appendChild(labelWrap);

              var fields = [
                { key:'input', label:'In', color:'#ffccd5', val:c.input },
                { key:'output', label:'Out', color:'#ff9d9d', val:c.output },
                { key:'cache_read', label:'Cache↺', color:'#5ab0ff', val:c.cache_read },
                { key:'cache_write', label:'Cache+', color:'#9aa4b2', val:c.cache_write }
              ];
              fields.forEach(function(f) {
                var lbl = document.createElement('span'); lbl.style.cssText = 'color:' + f.color + ';font-size:10px;flex-shrink:0;'; lbl.textContent = f.label; row.appendChild(lbl);
                var inp = document.createElement('input'); inp.type = 'number'; inp.step = '0.01'; inp.min = '0'; inp.value = (f.val != null && f.val !== 0) ? f.val : ''; inp.placeholder = '0';
                inp.style.cssText = 'width:55px;background:#0d0d11;border:1px solid #333;border-radius:3px;color:' + f.color + ';font-size:11px;padding:1px 3px;flex-shrink:0;';
                inp.dataset.action = 'set-cost-field'; inp.dataset.model = storageModel; inp.dataset.provider = prov; inp.dataset.field = f.key; row.appendChild(inp);
              });
              listWrap.appendChild(row);
            });
          });
        });
      });
      box.appendChild(listWrap);
    }

    overlay.appendChild(box);

    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener('keydown', onKey, true);
      tmPayloadCaptureSuppressEscapeUntil = Date.now() + 1500;
      setTimeout(function() { tmPromptActive = false; }, 100);
    }
    function onKey(ev) {
      // (v4.246) SELF-UNINSTALL. This modal re-renders by removing its overlay and calling itself
      // again, which used to leave this listener attached forever; every leaked copy then fired on
      // every later Escape and set tmPayloadCaptureSuppressEscapeUntil, which is what killed the
      // ring modal's Escape. If our overlay is gone, we are a leak: detach and do nothing.
      if (!overlay.parentNode) { document.removeEventListener('keydown', onKey, true); return; }
      if (ev.key === 'Escape' || ev.keyCode === 27) {
        ev.stopPropagation();
        if (ev.preventDefault) ev.preventDefault();
        close();
      }
    }
    overlay.addEventListener('click', function(ev) {
      var t = ev.target;
      if (t === overlay) { close(); return; }
      // (v4.246) Resolve the action through closest() so clicks on a header's arrow/count child
      // spans still register (a bare t.dataset.action check misses them).
      var actionEl = (t && t.closest) ? t.closest('[data-action]') : null;
      var act = (actionEl && actionEl.dataset) ? actionEl.dataset.action : null;
      if (act === 'close-cost-editor') { close(); return; }
      if (act === 'cost-tree-toggle') {
        ev.stopPropagation();
        var treePath = [];
        try { treePath = JSON.parse(actionEl.dataset.path || '[]'); } catch (e) {}
        if (treePath.length) tmToggleTreePath(tmCostsTreeExpanded, treePath, TM_COSTS_TREE_PATH_KEY);
        tmShowCostEditorModal(true);
        return;
      }
    });
    overlay.addEventListener('change', function(ev) {
      var t = ev.target;
      if (t && t.dataset && t.dataset.action === 'set-cost-field') {
        var val = parseFloat(t.value);
        if (isNaN(val) || val < 0) val = 0;
        var mdl = t.dataset.model;
        var prov = t.dataset.provider;
        var fld = t.dataset.field;
        if (mdl && prov && fld) {
          tmSetProviderCostField(mdl, prov, fld, val);
          console.log('\uD83D\uDCB2 [v' + EXT_VERSION + '] Cost table updated: ' + mdl + '::' + prov + ' ' + fld + ' = ' + val);
        }
        ev.stopPropagation();
      }
    });
    document.addEventListener('keydown', onKey, true);
    tmPromptActive = true;
    document.body.appendChild(overlay);
  }

  function tmFnv1a32(str) {
    // Simple fast deterministic hash for debugging prefix stability.
    // Not cryptographic.
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      // h *= 16777619 (FNV prime) with 32-bit overflow
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmComputeSystemToolsPrefixHash-jpo5,
  //   role=__lambdao_1.tmComputeSystemToolsPrefixHash,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=FNV-1a 32-bit hash of JSON.stringify({tools, system}) - the stability proof that the cached prefix is byte-identical across turns (shown as h:XXXXXXXX).,
  // ]
  function tmComputeSystemToolsPrefixHash(reqBody) {
    try {
      if (!reqBody || typeof reqBody !== 'object') return null;
      const tools = Array.isArray(reqBody.tools) ? reqBody.tools : null;
      // For OpenAI chat-completions payloads, system is a message with role=system.
      let system = null;
      if (Array.isArray(reqBody.messages)) {
        const sys = reqBody.messages.find(m => m && m.role === 'system');
        system = sys ? sys.content : null;
      }
      const stableObj = { tools, system };
      const s = JSON.stringify(stableObj);
      return tmFnv1a32(s);
    } catch (e) {
      return null;
    }
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmCaptureModel-uh3f,
  //   role=__lambdao_1.tmCaptureModel,
  //   slice_labels=tm-payload-cost-visibility,tm-payload-overview,
  //   kind=ast,
  //   comment=Canonical model resolution for a capture: _model → body/skeleton → response body.model → response body.modelVersion → URL /models/<name> (the last two are the Gemini-native fallbacks, and they back-fill pre-v4.244 ring rows). Prefer cap._identity when available. An empty return silently disables cost discovery AND the client-side cost calculator.,
  // ]
  function tmCaptureModel(cap) {
    if (!cap) return '';
    if (cap._model) return String(cap._model);
    try {
      var reqBody = cap.stored_as_skeleton ? cap.body_skeleton : cap.body;
      if (reqBody && reqBody.model) return String(reqBody.model);
    } catch (e) {}
    try {
      if (cap.body_skeleton && cap.body_skeleton.model) return String(cap.body_skeleton.model);
      if (cap.body && cap.body.model) return String(cap.body.model);
    } catch (e2) {}
    try {
      if (cap.response_body && cap.response_body.model) return String(cap.response_body.model);
    } catch (e3) {}
    // (v4.244) GEMINI FALLBACKS. A native Gemini response reports `modelVersion`, not `model`, and
    // the request model lives only in the URL path — so these captures resolved to '' and were
    // dropped by BOTH cost discovery and the client-side cost calculator. Reading them here also
    // BACK-FILLS ring rows captured before v4.244 began stamping _model, so the Set Costs modal
    // populates from existing history instead of only from future turns.
    try {
      if (cap.response_body && cap.response_body.modelVersion) return String(cap.response_body.modelVersion);
    } catch (e4) {}
    try {
      if (cap.url) {
        var capUrlModel = String(cap.url).match(/\/models\/([^\/:?#]+)/i);
        if (capUrlModel && capUrlModel[1]) return decodeURIComponent(capUrlModel[1]);
      }
    } catch (e5) {}
    return '';
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmBuildCaptureSummary-h05z,
  //   role=__lambdao_1.tmBuildCaptureSummary,
  //   slice_labels=tm-payload-cost-visibility,tm-payload-overview,
  //   kind=ast,
  //   comment=Builds a diagnostic summary from a capture record for modal copy buttons. Uses tmCaptureModel for model identity.,
  // ]
  function tmBuildCaptureSummary(cap) {
    if (!cap) return null;
    const reqBody = cap.stored_as_skeleton ? cap.body_skeleton : cap.body;

    let model = tmCaptureModel(cap);
    let hasCacheControl = null;
    let cacheControlSummary = null;
    let system_tools_prefix_hash = null;
    let tools_canonical_hash = null;

    try {
      if (reqBody && typeof reqBody === 'object') {
        if (!model) model = reqBody.model || null;
        cacheControlSummary = tmSummarizeCacheControl(reqBody);
        hasCacheControl = !!(cacheControlSummary && cacheControlSummary.hasAny);
        system_tools_prefix_hash = tmComputeSystemToolsPrefixHash(reqBody);
        // v4.58: hash of the KEY-SORTED tools array. This should be STABLE across turns once
        // canonicalization is active (unless the tools genuinely change). Compare it turn-to-turn
        // to confirm the ordering fix: raw system_tools_prefix_hash reflects what was SENT (now
        // already canonicalized at send time), while this is an independent semantic check.
        try {
          if (Array.isArray(reqBody.tools) && reqBody.tools.length) {
            tools_canonical_hash = tmFnv1a32(JSON.stringify(tmCanonicalizeKeysDeep(reqBody.tools)));
          }
        } catch (e2) {}
      }
    } catch (e) {}

    return {
      ts: cap.ts,
      url: cap.url,
      method: cap.method,
      protocol: cap.protocol,
      vendorHint: cap.vendorHint,
      convIdHint: cap.convIdHint,
      repair_tally: cap.repair_tally || null,
      tool_id_repair_count: Number(cap._tool_id_repair_count || 0),
      tool_id_repair_last: cap._tool_id_repair_last || null,
      model,
      hasCacheControl,
      cacheControlSummary,
      system_tools_prefix_hash,
      tools_canonical_hash,
      response_status: cap.response_status,
      response_ok: cap.response_ok,
      response_content_type: cap.response_headers ? (cap.response_headers['content-type'] || cap.response_headers['Content-Type'] || null) : null,
      response_usage: cap.response_usage || null,
      response_anthropic_usage: cap.response_anthropic_usage || null,
      error: cap.error || null
    };
  }

  // (v4.220) Pretty-print helper for the JSON viewer: re-parse + re-indent when the text is
  // JSON; otherwise show the raw text verbatim (raw SSE heads, multi-segment joins).
  function tmPrettyPrintMaybeJson(text) {
    if (typeof text !== 'string') { try { return JSON.stringify(text, null, 2); } catch (e) { return String(text); } }
    var t = text.trim();
    if (!t) return text;
    if (t[0] === '{' || t[0] === '[') {
      try { return JSON.stringify(JSON.parse(t), null, 2); } catch (e) { return text; }
    }
    return text;
  }

  // (v4.220) Read-only JSON viewer modal, shown alongside every ring-buffer copy-button click.
  // The text is what was just copied; selectable (user-select:text) but read-only. Escape or
  // click-outside closes ONLY the viewer -- capture-phase keydown + tmPromptActive keep the ring
  // modal's own Escape handler from firing underneath (same pattern as tmShowErrorPopup).
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmShowJsonViewerModal-4cr5,
  //   role=__lambdao_1.tmShowJsonViewerModal,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Scrollable pretty-printed JSON viewer modal used by the error popup and raw-segment views.,
  // ]
  function tmShowJsonViewerModal(text, label) {
    if (typeof document === 'undefined') return;
    var existing = document.getElementById('tm-json-viewer-overlay');
    if (existing) { existing.parentNode.removeChild(existing); }
    var overlay = document.createElement('div');
    overlay.id = 'tm-json-viewer-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;';
    var box = document.createElement('div');
    box.style.cssText = 'width:85vw;max-width:1100px;height:85vh;background:#14141a;border:1px solid #444;border-radius:8px;padding:12px;box-shadow:0 8px 40px rgba(0,0,0,0.6);display:flex;flex-direction:column;';
    var hdr = document.createElement('div');
    hdr.style.cssText = 'color:#8ef0a0;font-weight:bold;font-size:12px;margin-bottom:8px;font-family:monospace;display:flex;justify-content:space-between;align-items:center;gap:12px;';
    hdr.innerHTML = '<span>' + escapeHtml(label || 'Payload') + ' \u2014 copied to clipboard</span>';

    // (v4.246) Explicit copy button. The contents are almost always destined for an agent, and
    // hand-selecting a long pretty-printed JSON blob is tedious/error-prone. Copies exactly what
    // is displayed (the pretty-printed text), with a textarea+execCommand fallback for contexts
    // where the async clipboard API is unavailable or permission-blocked.
    function tmViewerFallbackCopy(txt) {
      try {
        var ta = document.createElement('textarea');
        ta.value = txt;
        ta.setAttribute('readonly', 'readonly');
        ta.style.cssText = 'position:fixed;top:-2000px;left:-2000px;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return !!ok;
      } catch (e) { return false; }
    }
    var hdrRight = document.createElement('span');
    hdrRight.style.cssText = 'display:flex;align-items:center;gap:10px;font-weight:normal;';
    var copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = '\uD83D\uDCCB Copy';
    copyBtn.style.cssText = 'background:#2a3f5a;color:#cfe4ff;border:1px solid #46617f;border-radius:4px;padding:3px 10px;font-size:11px;font-family:monospace;cursor:pointer;flex-shrink:0;';
    copyBtn.addEventListener('click', function(ev) {
      ev.stopPropagation();
      var payload = (pre && pre.textContent) ? pre.textContent : '';
      function flash(ok) {
        copyBtn.textContent = ok ? '\u2713 Copied' : '\u26a0 Copy failed';
        copyBtn.style.background = ok ? '#1f4d2a' : '#5a2a2a';
        setTimeout(function() {
          copyBtn.textContent = '\uD83D\uDCCB Copy';
          copyBtn.style.background = '#2a3f5a';
        }, 1200);
      }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(payload).then(
            function() { flash(true); },
            function() { flash(tmViewerFallbackCopy(payload)); }
          );
          return;
        }
      } catch (e) {}
      flash(tmViewerFallbackCopy(payload));
    });
    var hdrHint = document.createElement('span');
    hdrHint.style.cssText = 'opacity:0.55;font-weight:normal;';
    hdrHint.textContent = 'read-only \u00b7 selectable \u00b7 Esc / click outside to close';
    hdrRight.appendChild(copyBtn);
    hdrRight.appendChild(hdrHint);
    hdr.appendChild(hdrRight);
    var pre = document.createElement('pre');
    pre.style.cssText = 'flex:1;overflow:auto;background:#0d0d11;border:1px solid #2a2a2a;border-radius:6px;color:#d0d0d8;font-size:11px;font-family:monospace;white-space:pre-wrap;word-break:break-word;margin:0;padding:10px;user-select:text;cursor:text;';
    pre.textContent = tmPrettyPrintMaybeJson(text);
    box.appendChild(hdr); box.appendChild(pre);
    overlay.appendChild(box);
    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('keyup', onKeyUp, true);
      // (v4.221) The ring modal closes on a window-CAPTURE **keyup** handler (registered long
      // before this viewer, so it always fires first). v4.220 reset tmPromptActive SYNCHRONOUSLY
      // here, so the trailing Escape keyup of the same keypress fell through and closed the ring
      // modal too. Mirror the rename-prompt's proven triple guard (line ~3877): 1500ms
      // tmPayloadCaptureSuppressEscapeUntil window + 100ms DELAYED tmPromptActive reset, so the
      // trailing keyup (and short held-key repeats) are eaten from every angle.
      tmPayloadCaptureSuppressEscapeUntil = Date.now() + 1500;
      setTimeout(function() { tmPromptActive = false; }, 100);
    }
    function onKey(ev) {
      // (v4.246) Self-uninstall if our overlay was replaced out from under us (opening a second
      // viewer removes the first WITHOUT calling its close()), so a leaked copy can never keep
      // setting the suppress window and eating the ring modal's Escape.
      if (!overlay.parentNode) {
        document.removeEventListener('keydown', onKey, true);
        document.removeEventListener('keyup', onKeyUp, true);
        return;
      }
      if (ev.key === 'Escape' || ev.keyCode === 27 || ev.code === 'Escape') {
        ev.stopPropagation();
        if (ev.preventDefault) ev.preventDefault();
        close();
      }
    }
    function onKeyUp(ev) {
      // (v4.246) Same self-uninstall guard: a leaked copy of this handler would otherwise eat
      // Escape keyups for the life of the page.
      if (!overlay.parentNode) {
        document.removeEventListener('keydown', onKey, true);
        document.removeEventListener('keyup', onKeyUp, true);
        return;
      }
      // While the viewer is open, eat Escape keyups outright -- a second wall in front of the
      // ring modal's window-capture keyup handler (tmPromptActive already guards it, but belt
      // and suspenders costs nothing here).
      if (ev.key === 'Escape' || ev.keyCode === 27 || ev.code === 'Escape') {
        ev.stopPropagation();
        if (ev.preventDefault) ev.preventDefault();
      }
    }
    overlay.addEventListener('click', function() { close(); });
    box.addEventListener('click', function(ev) { ev.stopPropagation(); });
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('keyup', onKeyUp, true);
    tmPromptActive = true;
    document.body.appendChild(overlay);
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.copyPayloadCapturePart-xdsa,
  //   role=__lambdao_1.copyPayloadCapturePart,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Per-part copy logic behind the modal buttons: Summary, Outbound/Response Headers/Body/Skeleton, Raw Seg.,
  // ]
  function copyPayloadCapturePart(captureId, part) {
    const cap = getCaptureById(captureId);
    if (!cap) return;

    const reqBody = cap.stored_as_skeleton ? cap.body_skeleton : cap.body;

    let obj = null;
    let label = part;

    if (part === 'out_headers') {
      obj = cap.headers;
      label = 'Outbound headers';
    } else if (part === 'out_payload') {
      obj = {
        url: cap.url,
        method: cap.method,
        protocol: cap.protocol,
        vendorHint: cap.vendorHint,
        convIdHint: cap.convIdHint,
        body: reqBody
      };
      label = 'Outbound payload';
    } else if (part === 'out_payload_skeleton') {
      // Always generate a skeleton on demand for easy sharing.
      let skeleton = null;
      try {
        skeleton = tmBuildHugeSkeleton(reqBody);
      } catch (e) {
        skeleton = { _tm_skeleton_error: String(e && e.message ? e.message : e) };
      }
      obj = {
        url: cap.url,
        method: cap.method,
        protocol: cap.protocol,
        vendorHint: cap.vendorHint,
        convIdHint: cap.convIdHint,
        body_skeleton: skeleton
      };
      label = 'Outbound payload (skeleton)';
    } else if (part === 'summary') {
      obj = tmBuildCaptureSummary(cap);
      label = 'Capture summary';
    } else if (part === 'error') {
      obj = cap.error;
      label = 'Provider error';
    } else if (part === 'guard') {
      // (v4.284) Oversized tool-result guard report: payload locations, tool names, ids, sizes,
      // plus the auto-resume snapshot -- formatted text in the shared viewer (with Copy).
      var gStub = Array.isArray(cap._tool_stubbed) ? cap._tool_stubbed : [];
      var gRec = Array.isArray(cap._tool_recovered) ? cap._tool_recovered : [];
      if (!gStub.length && !gRec.length) return;
      var gLines = ['OVERSIZED TOOL-RESULT GUARD REPORT', ''];
      if (gStub.length) {
        gLines.push('STUBBED (deterministic stub sent on this turn):');
        gStub.forEach(function(x) {
          gLines.push('  ' + String(x.at || '?') + '  ' + String(x.name || '?') + '  ' + String(x.id || '?') + '  ' + humanReadableSize(Number(x.bytes || 0)));
        });
        gLines.push('');
      }
      if (gRec.length) {
        gLines.push('RECOVERED (full result restored on this turn):');
        gRec.forEach(function(x) {
          gLines.push('  ' + String(x.at || '?') + '  ' + String(x.name || '?') + '  ' + String(x.id || '?') + '  ' + humanReadableSize(Number(x.bytes || 0)));
        });
        gLines.push('');
      }
      if (Number(cap._autoresume_total || 0) > 0) {
        gLines.push('Auto-resumes as of this turn: ' + cap._autoresume_total);
        var gBy = cap._autoresume_by_reason || {};
        Object.keys(gBy).forEach(function(k) { gLines.push('  ' + tmAutoResumeReasonLabel(k) + ': ' + gBy[k]); });
      }
      var gText = gLines.join('\n');
      copyTextToClipboard(gText, 'Guard report');
      tmShowJsonViewerModal(gText, 'Guard report');
      return;
    } else if (part === 'in_headers') {
      obj = cap.response_headers;
      label = 'Response headers';
    } else if (part === 'in_payload') {
      obj = {
        status: cap.response_status,
        ok: cap.response_ok,
        body: cap.response_body
      };
      label = 'Response payload';
    } else if (part === 'in_payload_skeleton') {
      // Response may be string or object. Skeleton == aggressively trimmed.
      let sk = null;
      try {
        sk = tmTruncateStringsDeep(cap.response_body, 200);
      } catch (e) {
        sk = { _tm_skeleton_error: String(e && e.message ? e.message : e) };
      }
      obj = {
        status: cap.response_status,
        ok: cap.response_ok,
        body_skeleton: sk
      };
      label = 'Response payload (skeleton)';
    } else if (part === 'in_usage_segments') {
      // Raw JSON blobs from SSE segments that carried usage/cost/error evidence.
      var segs = cap.response_usage_segments;
      if (!segs || !segs.length) return;
      var pretty = segs.map(function(s) {
        try { return JSON.stringify(JSON.parse(s), null, 2); } catch (e) { return s; }
      });
      var segText = pretty.join('\n');
      copyTextToClipboard(segText, 'Raw usage segments (' + segs.length + ')');
      tmShowJsonViewerModal(segText, 'Raw usage segments (' + segs.length + ')');
      return;
    } else if (part === 'in_raw_head') {
      // (v4.198) Fallback raw-response dump for FAILURE rows that produced neither a parsed
      // response_body nor any usage/error segment (e.g. a one-shot provider 400 whose single
      // chunk we couldn't classify). Emits whatever raw response text we preserved, so the
      // Raw Seg button is NEVER dead on a crashed turn.
      var rawHead = (typeof cap.response_body_head === 'string' && cap.response_body_head)
        ? cap.response_body_head
        : (cap.response_body != null ? (function(){ try { return JSON.stringify(cap.response_body, null, 2); } catch (e) { return String(cap.response_body); } })() : '');
      if (!rawHead) return;
      copyTextToClipboard(rawHead, 'Raw response head');
      tmShowJsonViewerModal(rawHead, 'Raw response head');
      return;
    }

    if (obj == null) return;
    var jsonText = JSON.stringify(obj, null, 2);
    copyTextToClipboard(jsonText, label);
    tmShowJsonViewerModal(jsonText, label);
  }

  // Persistent status banner shown at the TOP of the capture modal in EVERY state
  // (enabled/disabled, empty/populated). Always surfaces the click-to-copy console command
  // for the OPPOSITE action, so enabling and disabling are equally easy at all times.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmBuildCaptureStatusBanner-2rzn,
  //   role=__lambdao_1.tmBuildCaptureStatusBanner,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Builds the widget status/banner area from the most recent capture plus current error state.,
  // ]
  function tmBuildCaptureStatusBanner() {
    var enabled = tmCaptureEnabled();
    var enableCmd = "localStorage.setItem('" + TM_PAYLOAD_CAPTURE_ENABLED_KEY + "','true')";
    var disableCmd = "localStorage.setItem('" + TM_PAYLOAD_CAPTURE_ENABLED_KEY + "','false')";
    var cmd = enabled ? disableCmd : enableCmd;
    var cmdColor = enabled ? '#ff8c8c' : '#7CFC7C';
    var actionWord = enabled ? 'disable' : 'enable';
    var stateLabel = enabled
      ? '<b style="color:#7CFC7C;">ENABLED</b>'
      : '<b style="color:#ffb454;">DISABLED</b>';
    var cmdBoxStyle = 'display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:6px 8px;' +
                      'background:#111;color:' + cmdColor + ';border:1px solid #2a2a2a;border-radius:4px;' +
                      'font-family:monospace;font-size:11px;white-space:pre-wrap;word-break:break-all;cursor:pointer;';
    return '<div style="margin-bottom:10px;padding:8px;border-radius:6px;background:rgba(40,40,48,0.9);border:1px solid #333;">' +
           '<div style="font-size:12px;">Payload capture is currently ' + stateLabel + '. ' +
           'Click to copy the console command to <b>' + actionWord + '</b> it (read live per request \u2014 no refresh needed):</div>' +
           '<code data-action="copy-plain-text" data-copy-text="' + escapeHtml(cmd) + '" title="Click to copy" style="' + cmdBoxStyle + '">' + escapeHtml(cmd) + '</code>' +
           '</div>';
  }

  // v4.163: Modal sort/filter state — survives modal open/close, not persisted.
  var tmModalSortMode = 'chronological';  // 'chronological' | 'turn-cost' | 'session-cost'
  var tmModalFilterIdentity = null;        // null = no filter, or an identity key string
  var tmModalTimeFilter = 'all';            // (v4.224) 'all' | '12h' | '24h' — time-window filter for the ring modal

  // (v4.210) Ring-modal retry-visibility toggle. When ON (default), rows that are auto-retry
  // attempts (429s we fired, or any 429-bearing row) are HIDDEN so the modal isn't spammed with
  // backoff noise and the real turns stay visible. Persisted so it survives refresh.
  var TM_HIDE_RETRIES_KEY = 'tm_ring_hide_retries_v1';
  function tmGetHideRetries() {
    try { return localStorage.getItem(TM_HIDE_RETRIES_KEY) !== 'false'; } catch (e) { return true; }
  }
  function tmSetHideRetries(v) {
    try { localStorage.setItem(TM_HIDE_RETRIES_KEY, v ? 'true' : 'false'); } catch (e) {}
  }

  // True if this capture row is a 429/auto-retry row (vendor-tagged retry attempt, or its captured
  // response parses to an OpenRouter 429 error -- which also covers a 200-streamed 429).
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmIsRetryRow-yt0k,
  //   role=__lambdao_1.tmIsRetryRow,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Detects auto-retry/429 ring rows (vendor tag, HTTP 429, or a parsed 429 error body incl. 200-streamed 429s) for the retry-visibility filter.,
  // ]
  function tmIsRetryRow(cap) {
    try {
      if (!cap) return false;
      if (cap.vendorHint === 'openrouter-retry') return true;
      if (cap.response_status === 429) return true;
      var err = null;
      if (typeof cap.response_body_head === 'string' && cap.response_body_head) {
        err = tmParseOpenRouterError(cap.response_body_head);
      }
      if (!err && cap.response_body != null) {
        try { err = tmParseOpenRouterError(JSON.stringify(cap.response_body)); } catch (e) {}
      }
      if (err && Number(err.code) === 429) return true;
    } catch (e) {}
    return false;
  }

  // (v4.249) A DEAD PROXY PROBE row: TypingMind's DIRECT attempt at OpenRouter's Anthropic-skin
  // endpoint (/api/v1/messages), which the browser CORS-blocks. It is the exact call that makes
  // TypingMind pop its 'enable the proxy' prompt; that grant lasts 24h, so the probe reappears
  // whenever it lapses (observed live as ring entries precisely 24h apart). The fetch throws, so
  // tmCaptureResponse never runs and the row carries nothing at all: no status, no usage, no cost,
  // and a MISS computed purely from the absence of cache evidence.
  //
  // WHY THIS CANNOT HIDE A REAL CHARGE (read before loosening any clause): usage, cache and cost
  // are stamped ONLY inside tmCaptureResponse. A row that never received a response is therefore
  // STRUCTURALLY incapable of carrying billing data. Every clause below is required, so anything
  // that actually reached a provider -- any response status at all, any usage object, any usage
  // segment, any calculated cost -- fails the test and stays visible. The 30s age floor exists so
  // the CURRENT in-flight turn is never hidden while it waits for its response. And because this
  // feeds the (relabeled) 'Noise' toggle rather than deleting anything, matched rows remain counted
  // on the button and one click from view.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmIsDeadProxyProbeRow-dppr,
  //   role=__lambdao_1.tmIsDeadProxyProbeRow,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Detects the CORS-blocked direct OpenRouter Anthropic-skin probe (the 'enable the proxy' call, recurring per 24h grant lapse) for the Noise-visibility filter. Peer of tmIsRetryRow. Safe because usage/cost are stamped ONLY in tmCaptureResponse, so a row with no response at all cannot carry billing data; all clauses are required and a 30s age floor protects the in-flight turn.,
  // ]
  function tmIsDeadProxyProbeRow(cap) {
    try {
      if (!cap) return false;
      var u = String(cap.url || '').toLowerCase();
      // Direct OpenRouter Anthropic-skin ONLY -- never the cors-proxy, which carries real traffic.
      if (u.indexOf('/api/cors-proxy') !== -1) return false;
      if (u.indexOf('openrouter.ai') === -1 || u.indexOf('/v1/messages') === -1) return false;
      // No response was EVER recorded (the fetch threw). Compaction never nulls these two fields,
      // so this stays true for old rows -- it is not confused by a stripped body.
      if (cap.response_status != null || cap.response_ok != null) return false;
      // No usage/cost evidence of any kind.
      if (cap.response_usage || cap.response_anthropic_usage) return false;
      if (cap.response_usage_segments && cap.response_usage_segments.length) return false;
      if (cap._table_cost != null || cap._cost_calculated) return false;
      // Never hide a request that may still be in flight awaiting its response.
      var probeTs = Date.parse(cap.ts || '');
      if (!isFinite(probeTs) || (Date.now() - probeTs) < 30000) return false;
      return true;
    } catch (e) {}
    return false;
  }

  // v4.163: Extract the identity key for a capture, preferring stamped _identity.
  function tmCapIdentityKey(cap) {
    if (cap._identity) return cap._identity.key || '';
    var sid = cap.session_id || null;
    var model = '';
    var host = '';
    try { model = tmCaptureModel(cap); } catch (e) {}
    try { host = tmExtractEndpointHost(cap); } catch (e) {}
    var isProxy = false;
    try { isProxy = tmIsProxyCapture(cap); } catch (e) {}
    return tmBuildIdentityKey(sid, model, host, isProxy);
  }

  // v4.163: Extract per-turn cost for a capture.
  function tmCapTurnCost(cap) {
    var apiCost = tmExtractCostVal(cap.response_anthropic_usage, cap.response_usage);
    if (apiCost > 0) return apiCost;
    if (typeof cap._table_cost === 'number' && cap._table_cost > 0) return cap._table_cost;
    return 0;
  }

  // v4.163: Extract session/aggregate total cost for a capture.
  function tmCapSessionCost(cap) {
    if (cap.session_cost_total != null) return cap.session_cost_total;
    var sid = cap.session_id || null;
    var model = '';
    var host = '';
    try { model = tmCaptureModel(cap); } catch (e) {}
    try { host = tmExtractEndpointHost(cap); } catch (e) {}
    var isProxy = false;
    try { isProxy = tmIsProxyCapture(cap); } catch (e) {}
    return tmGetSessionCost(sid, model, host, isProxy);
  }

  // v4.163: Build identity display label for the filter dropdown.
  function tmCapIdentityLabel(cap) {
    var sid = '';
    var model = '';
    var host = '';
    var isProxy = false;
    if (cap._identity) {
      sid = cap._identity.sid || '';
      model = cap._identity.model || '';
      host = cap._identity.host || '';
      isProxy = !!cap._identity.proxy;
    } else {
      sid = cap.session_id || '';
      try { model = tmCaptureModel(cap); } catch (e) {}
      try { host = tmExtractEndpointHost(cap); } catch (e) {}
      try { isProxy = tmIsProxyCapture(cap); } catch (e) {}
    }
    var label = sid + ' — ' + model;
    // v4.165: Include the human-readable session name if available.
    var sessionName = '';
    try { sessionName = tmGetSessionName(sid) || ''; } catch (e) {}
    if (sessionName) label = sessionName + ' [' + sid + '] — ' + model;
    // Disambiguate if needed (same sid+model but different host or proxy)
    return { label: label, host: host, isProxy: isProxy, key: tmCapIdentityKey(cap), model: model, sid: sid };
  }

  // (v4.225) Compute aggregate cost for a session identity within a time window.
  // Walks the ring, summing per-turn costs for entries matching the identity
  // whose timestamp falls within [cutoffMs, now]. Called at response-stamp time to
  // snapshot the 12h and 24h block costs onto each capture record.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmComputeBlockCost-v0m5,
  //   role=__lambdao_1.tmComputeBlockCost,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Compute aggregate cost for a session identity within a time window (12h or 24h block). Walks the ring, matches identity, sums per-turn costs. Called at response-stamp time to snapshot block costs onto each capture record.,
  // ]
  function tmComputeBlockCost(identityKey, cutoffMs) {
    var ring = tmReadCaptureRing();
    var total = 0;
    if (!identityKey) return 0;
    for (var i = 0; i < ring.length; i++) {
      var cap = ring[i];
      if (!cap) continue;
      var capIdKey = tmCapIdentityKey(cap);
      if (capIdKey !== identityKey) continue;
      // Prefer ISO ts (always parseable). ts_local is display-only and locale-dependent.
      var ts = cap.ts || cap.ts_local;
      if (!ts) continue;
      var d = new Date(ts);
      if (isNaN(d.getTime())) continue;
      if (d.getTime() >= cutoffMs) {
        var cost = tmExtractCostVal(cap.response_anthropic_usage, cap.response_usage);
        if (cost == 0 && typeof cap._table_cost === 'number') cost = cap._table_cost;
        if (cost > 0) total += cost;
      }
    }
    return total;
  }

  // (v4.224) Time-window filter helpers for the ring modal.
  function tmGetCurrentBlockStart() {
    var now = new Date();
    var isPM = now.getHours() >= 12;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), isPM ? 12 : 0, 0, 0, 0).getTime();
  }
  function tmGetTimeFilterCutoff() {
    if (tmModalTimeFilter === 'all') return 0;
    var blockStart = tmGetCurrentBlockStart();
    if (tmModalTimeFilter === '12h') return blockStart;
    if (tmModalTimeFilter === '24h') return blockStart - (12 * 60 * 60 * 1000);
    return 0;
  }
  function tmApplyTimeFilter(items) {
    var cutoff = tmGetTimeFilterCutoff();
    if (!cutoff) return items;
    return items.filter(function(cap) {
      var ts = cap.ts_local || cap.ts;
      if (!ts) return false;
      var d = new Date(ts);
      if (isNaN(d.getTime())) return false;
      return d.getTime() >= cutoff;
    });
  }

  // v4.163: Sort items array in place according to tmModalSortMode.
  // items are initially most-recent-first (ring.slice().reverse()).
  // v4.166: In session-cost mode, collapse to one representative row per identity
  // (highest session cost; most recent on ties) before sorting.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmSortModalItems-oyh5,
  //   role=__lambdao_1.tmSortModalItems,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Ring-modal row ordering across the sort modes (identity filtering applied by the caller).,
  // ]
  function tmSortModalItems(items) {
    if (tmModalSortMode === 'chronological') return; // already in the right order
    // For cost sorts: zero/no-cost entries go to bottom, then descending by cost.
    // Within the same cost bucket, maintain chronological order (most recent first).
    items.forEach(function(cap, idx) { cap._tmpSortIdx = idx; });

    if (tmModalSortMode === 'turn-cost') {
      items.sort(function(a, b) {
        var ca = tmCapTurnCost(a);
        var cb = tmCapTurnCost(b);
        var aZero = (ca <= 0), bZero = (cb <= 0);
        if (aZero && !bZero) return 1;
        if (!aZero && bZero) return -1;
        if (aZero && bZero) return a._tmpSortIdx - b._tmpSortIdx;
        if (cb !== ca) return cb - ca;
        return a._tmpSortIdx - b._tmpSortIdx;
      });
    } else if (tmModalSortMode === 'session-cost') {
      // v4.166: Deduplicate to one row per identity — the row with the highest session cost,
      // most recent on tie. Then sort those representatives descending by cost.
      var bestPerKey = {};
      for (var di = 0; di < items.length; di++) {
        var dcap = items[di];
        if (!dcap) continue;
        var dkey = tmCapIdentityKey(dcap);
        var dcost = tmCapSessionCost(dcap);
        var existing = bestPerKey[dkey];
        if (!existing) {
          bestPerKey[dkey] = { cap: dcap, cost: dcost, idx: dcap._tmpSortIdx };
        } else {
          // Keep the one with higher cost; on tie keep the more recent (lower _tmpSortIdx = earlier in reversed array = more recent)
          if (dcost > existing.cost || (dcost === existing.cost && dcap._tmpSortIdx < existing.idx)) {
            bestPerKey[dkey] = { cap: dcap, cost: dcost, idx: dcap._tmpSortIdx };
          }
        }
      }
      // Rebuild items from the deduplicated set
      var deduped = [];
      var dkeys = Object.keys(bestPerKey);
      for (var dk = 0; dk < dkeys.length; dk++) {
        deduped.push(bestPerKey[dkeys[dk]].cap);
      }
      // Sort deduped items descending by cost, zero-cost to bottom, chronological tiebreak
      deduped.sort(function(a, b) {
        var ca = tmCapSessionCost(a);
        var cb = tmCapSessionCost(b);
        var aZero = (ca <= 0), bZero = (cb <= 0);
        if (aZero && !bZero) return 1;
        if (!aZero && bZero) return -1;
        if (aZero && bZero) return a._tmpSortIdx - b._tmpSortIdx;
        if (cb !== ca) return cb - ca;
        return a._tmpSortIdx - b._tmpSortIdx;
      });
      // Replace items contents with deduped
      items.length = 0;
      for (var ri = 0; ri < deduped.length; ri++) { items.push(deduped[ri]); }
    }
    // Clean up temp property
    items.forEach(function(cap) { delete cap._tmpSortIdx; });
  }

  // ── Timeline separator helpers (chronological sort mode only) ──────────────

  // Formats a Date as "Monday, June 23, 2026".
  function tmFormatTimelineDate(d) {
    var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmBuildTimelineSeparator-t1m3,
  //   role=__lambdao_1.tmBuildTimelineSeparator,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Timeline separator for the ring-buffer modal in chronological sort mode. Inserts a dim gray horizontal rule with a date label when the day changes or AM/PM crosses noon.,
  // ]
  function tmBuildTimelineSeparator(prevCap, curCap) {
    // Items are most-recent-first in chronological mode, so prevCap (above) is newer, curCap (below) is older.
    var prevTs = prevCap.ts_local || prevCap.ts;
    var curTs = curCap.ts_local || curCap.ts;
    if (!prevTs || !curTs) return null;

    var prevDate = new Date(prevTs);
    var curDate = new Date(curTs);
    if (isNaN(prevDate.getTime()) || isNaN(curDate.getTime())) return null;

    var prevDayKey = prevDate.getFullYear() + '-' + prevDate.getMonth() + '-' + prevDate.getDate();
    var curDayKey = curDate.getFullYear() + '-' + curDate.getMonth() + '-' + curDate.getDate();

    if (prevDayKey !== curDayKey) {
      // Day boundary crossed. Show chronologically: older date → newer date (forward-time arrow).
      var olderDate = curDate;   // below (older)
      var newerDate = prevDate;  // above (newer)
      var label = tmFormatTimelineDate(olderDate) + ' \u2192 ' + tmFormatTimelineDate(newerDate);
      return '<div style="margin:10px 0 10px 0;padding:0;">' +
        '<span style="font-size:11px;color:#888;font-weight:500;letter-spacing:0.3px;display:block;margin-bottom:3px;">' +
        escapeHtml(label) + '</span>' +
        '<hr style="border:none;border-top:1px solid #555;opacity:0.35;margin:0;">' +
        '</div>';
    }

    // Same day — check AM/PM boundary (noon crossing).
    var prevIsPM = prevDate.getHours() >= 12;
    var curIsPM = curDate.getHours() >= 12;
    if (prevIsPM !== curIsPM) {
      // In a newest-first list: prev (above) is PM, cur (below) is AM. The noon boundary is "AM → PM".
      var label = tmFormatTimelineDate(curDate) + '  AM \u2192 PM';
      return '<div style="margin:10px 0 10px 0;padding:0;">' +
        '<span style="font-size:11px;color:#888;font-weight:500;letter-spacing:0.3px;display:block;margin-bottom:3px;">' +
        escapeHtml(label) + '</span>' +
        '<hr style="border:none;border-top:1px solid #555;opacity:0.35;margin:0;">' +
        '</div>';
    }

    return null;
  }

  // @beacon[
  //   id=None,
  //   role=__lambdao_1.renderPayloadCaptureModal,
  //   slice_labels=tm-payload-cost-visibility,tm-payload-overview,
  //   kind=ast,
  //   comment=Payload Capture ring buffer modal. Shows 500-entry history with HIT/MISS/cost/session badges. MUST use cap._identity for hue+cost.,
  // ]
  function renderPayloadCaptureModal() {
    if (!payloadCaptureModalInnerEl) return;

    const ring = tmReadCaptureRing();
    var items = ring.slice().reverse(); // most recent first

    // (v4.229) Discover and merge any new model→provider combos from the ring buffer into the ratings store.
    try { tmDiscoverAndMergeProviderRatings(); } catch (e) {}
    // (v4.233) Discover and merge any new model→provider combos into the cost table.
    try { tmDiscoverAndMergeProviderCosts(); } catch (e) {}

    // (v4.210) Apply identity filter + retry-visibility filter BEFORE building any HTML, so
    // hiddenRetryCount is available to the toggle button in the control row below. (Moved ahead
    // of the banner; the sort call stays in its original spot further down.)
    if (tmModalFilterIdentity) {
      items = items.filter(function(cap) { return cap && tmCapIdentityKey(cap) === tmModalFilterIdentity; });
    }
    var hiddenRetryCount = 0;
    if (tmGetHideRetries()) {
      var beforeHide = items.length;
      // (v4.249) The toggle now hides BOTH noise categories -- 429/auto-retry rows and dead
      // CORS-blocked proxy probes -- so hiddenRetryCount reports the combined total.
      items = items.filter(function(cap) { return !tmIsRetryRow(cap) && !tmIsDeadProxyProbeRow(cap); });
      hiddenRetryCount = beforeHide - items.length;
    }

    // (v4.224) Time-window filter (12h / 24h / all) applied after identity + retry filters.
    items = tmApplyTimeFilter(items);

    // Status banner first, in ALL states.
    let html = tmBuildCaptureStatusBanner();

    // (v4.293) Management suspicion badges are shown only on each session's MOST RECENT visible
    // ring row. Compute that set before the render loop so badge state follows row order, sorting,
    // and the session filter naturally.
    var latestManagedCapIds = {};
    if (tmAgentManagementEnabled()) {
      for (var mli = 0; mli < items.length; mli++) {
        var mlCap = items[mli];
        var mlSid = mlCap && (mlCap.session_id || mlCap.pasted_session_id || '');
        if (!mlSid) continue;
        var mlKey = String(mlSid);
        if (!latestManagedCapIds[mlKey] && mlCap.id) latestManagedCapIds[mlKey] = mlCap.id;
      }
    }

    // v4.162: Sol reasoning effort dropdown + v4.163: sort pills + filter dropdown — on one row.
    var solEffort = tmGetSolReasoningEffort();
    var solOpts = ['medium', 'high', 'xhigh', 'max'];
    var solSelectHtml = '<span style="font-size:10px;opacity:0.85;">Sol Reasoning:&nbsp;</span>' +
      '<select data-action="set-sol-reasoning-effort" style="font-size:10px;background:#222;color:#fff;border:1px solid #555;border-radius:3px;padding:1px 4px;">';
    for (var si = 0; si < solOpts.length; si++) {
      var opt = solOpts[si];
      solSelectHtml += '<option value="' + opt + '"' + (opt === solEffort ? ' selected' : '') + '>' + opt + '</option>';
    }
    solSelectHtml += '</select>';

    // v4.163: Sort pills
    var sortPills = ['chronological', 'turn-cost', 'session-cost'];
    var sortLabels = { 'chronological': 'Chronological', 'turn-cost': 'Turn Cost', 'session-cost': 'Session Cost' };
    var pillsHtml = '';
    for (var sp = 0; sp < sortPills.length; sp++) {
      var mode = sortPills[sp];
      var isActive = (tmModalSortMode === mode);
      var pillStyle = isActive
        ? 'background:#5a3a8e;color:#fff;border:1px solid #7a5aae;'
        : 'background:#333;color:#aaa;border:1px solid #555;';
      pillsHtml += '<button data-action="set-modal-sort" data-sort-mode="' + mode + '" style="' + pillStyle + 'border-radius:10px;padding:1px 8px;font-size:10px;cursor:pointer;margin-left:4px;">' + sortLabels[mode] + '</button>';
    }

    // v4.271: CUSTOM session-Filter LISTBOX (replaces the native <select data-action="set-modal-filter">).
    // Native <option> elements are single-color plain text, so the miss count in the trailing
    // (misses / hits) parenthetical could never render in the MISS red. This div-based listbox
    // renders per-word spans: the label + ($total) + (misses / hits) all inherit the session hue,
    // EXCEPT the miss number which is #ff6b6b -- the system's one reserved red, matching the
    // persistent widget's v4.269 treatment. Open state is a module flag (tmModalFilterListboxOpen)
    // so the whole-modal re-render (every captured turn) SURVIVES an open listbox; Escape and
    // click-away dismiss it; it resets on modal close. Selection still writes tmModalFilterIdentity
    // then re-renders (identical semantics to the old change handler).
    var filterHtml = '<span style="font-size:10px;opacity:0.85;margin-left:8px;">Filter:&nbsp;</span>' +
      '<span style="position:relative;display:inline-block;vertical-align:top;">';
    // -- Collect unique identities from the ring (same source as the old <select> loop). --
    var idMap = {};
    var idEntries = [];
    if (ring.length > 0) {
      for (var ri = ring.length - 1; ri >= 0; ri--) {
        var rcap = ring[ri];
        if (!rcap) continue;
        var ikey = tmCapIdentityKey(rcap);
        if (idMap[ikey]) continue;
        idMap[ikey] = true;
        var idInfo = tmCapIdentityLabel(rcap);
        idEntries.push({ key: ikey, label: idInfo.label, host: idInfo.host, isProxy: idInfo.isProxy, model: idInfo.model, sid: idInfo.sid });
      }
    }
    // (v4.267) Hoist session-ledger read for the identity loop so labels carry the cumulative
    // cache ratio without a localStorage re-parse per identity.
    var idFilterCosts = {};
    try { idFilterCosts = tmGetSessionCosts() || {}; } catch (e) {}
    // Disambiguation: duplicate sid+model labels need a (proxy|direct @ host) suffix.
    var labelCounts = {};
    for (var ei = 0; ei < idEntries.length; ei++) { var lbl = idEntries[ei].label; labelCounts[lbl] = (labelCounts[lbl] || 0) + 1; }
    // Build a per-entry display spec: escaped label, ($total), (misses / hits) numbers, and hue.
    for (var ei2 = 0; ei2 < idEntries.length; ei2++) {
      var entry = idEntries[ei2];
      var displayLabel = entry.label;
      if (labelCounts[displayLabel] > 1) {
        // Disambiguate
        displayLabel += ' (' + (entry.isProxy ? 'proxy' : 'direct') + ' @ ' + (entry.host || 'unknown') + ')';
      }
      // v4.167: total session cost for this identity.
      var totalCost = tmGetSessionCost(entry.sid || '', entry.model || '', entry.host, entry.isProxy);
      entry.costLabel = (totalCost > 0) ? '($' + totalCost.toFixed(2) + ')' : '(—)';
      // v4.267: cumulative session cache ratio (misses / hits).
      var idfStats = idFilterCosts[entry.key];
      var idfHits = Number((idfStats && idfStats._cache_hits) || 0);
      var idfMisses = Number((idfStats && idfStats._cache_misses) || 0);
      entry.showLabel = displayLabel;
      entry.hits = idfHits;
      entry.misses = idfMisses;
      entry.hasRatio = (idfHits > 0 || idfMisses > 0);
      // v4.164: color the label with the identity's hue.
      entry.color = tmModelEndpointColor(entry.model || '', entry.host, entry.isProxy, entry.sid || '');
    }
    // (v4.301) Rollover feedback for the custom filter listbox rows (div-based, so :hover
    // needs a stylesheet rather than inline styles). Injected once, guarded by element id.
    try {
      if (typeof document !== 'undefined' && !document.getElementById('tm-filter-listbox-style')) {
        var fltStyle = document.createElement('style');
        fltStyle.id = 'tm-filter-listbox-style';
        fltStyle.textContent = '.tm-flt-row:hover{background:rgba(90,120,200,0.35)!important;}';
        document.head.appendChild(fltStyle);
      }
    } catch (eFltStyle) {}
    // -- Closed trigger: show the current selection (All, or the selected identity + hue). --
    var filterSelected = null;
    for (var es = 0; es < idEntries.length; es++) { if (tmModalFilterIdentity === idEntries[es].key) { filterSelected = idEntries[es]; break; } }
    var trigColor = '#fff';
    var trigLabel = 'All';
    if (filterSelected) {
      trigColor = filterSelected.color;
      trigLabel = filterSelected.showLabel + ' ' + filterSelected.costLabel +
        (filterSelected.hasRatio ? (' (' + filterSelected.misses + ' / ' + filterSelected.hits + ')') : '');
    }
    filterHtml += '<button type="button" data-action="toggle-modal-filter-listbox" title="Filter ring buffer to a single session" style="font-size:10px;background:#222;color:' + trigColor + ';border:1px solid #555;border-radius:3px;padding:1px 6px;cursor:pointer;white-space:nowrap;min-width:150px;text-align:left;max-width:240px;overflow:hidden;text-overflow:ellipsis;vertical-align:top;">' +
      '<span style="font-weight:bold;">' + escapeHtml(trigLabel) + '</span> <span style="opacity:0.7;">&#9660;</span>' +
      '</button>';
    // -- Listbox panel (rendered only while open). Absolutely positioned under the trigger; own
    //    max-height + overflow-y so long identity lists scroll WITHIN the panel (never breaking
    //    the modal's own scrolling); z-index keeps it above ring rows. --
    if (tmModalFilterListboxOpen) {
      filterHtml += '<div data-role="modal-filter-listbox" style="position:absolute;top:calc(100% + 2px);left:0;z-index:100;min-width:280px;max-width:520px;max-height:300px;overflow-y:auto;background:rgba(20,20,26,0.98);border:1px solid #555;border-radius:4px;box-shadow:0 4px 14px rgba(0,0,0,0.6);padding:2px;">';
      // All row
      var allSelected = !tmModalFilterIdentity;
      filterHtml += '<div class="tm-flt-row" data-action="set-modal-filter-listbox" data-identity-key="" style="padding:3px 6px;border-radius:3px;cursor:pointer;font-size:10px;white-space:nowrap;' + (allSelected ? 'background:rgba(90,58,142,0.5);' : '') + '"><span style="color:#fff;font-weight:bold;">All</span></div>';
      // Identity rows -- the miss number in #ff6b6b; everything else inherits the session hue.
      for (var eo = 0; eo < idEntries.length; eo++) {
        var e2 = idEntries[eo];
        var sel = (tmModalFilterIdentity === e2.key);
        filterHtml += '<div class="tm-flt-row" data-action="set-modal-filter-listbox" data-identity-key="' + escapeHtml(e2.key) + '" title="' + escapeHtml(e2.key) + '" style="padding:3px 6px;border-radius:3px;cursor:pointer;font-size:10px;white-space:nowrap;color:' + e2.color + ';' + (sel ? 'background:rgba(90,58,142,0.5);' : '') + '">' +
          '<span style="font-weight:bold;">' + escapeHtml(e2.showLabel) + '</span> ' +
          '<span>' + escapeHtml(e2.costLabel) + '</span>' +
          (e2.hasRatio
            ? ' (<span style="color:#ff6b6b;font-weight:bold;">' + e2.misses + '</span> / ' + e2.hits + ')'
            : '') +
          '</div>';
      }
      filterHtml += '</div>';
    }
    filterHtml += '</span>';

    // (v4.210) Retry-visibility toggle button. Default ON (hide retry/429 rows) to kill backoff
    // spam; click to reveal them. Shows a live count of hidden rows when hiding is active.
    var hideRetries = tmGetHideRetries();
    var retryBtnLabel = hideRetries
      ? ('⏳ Noise: hidden' + (hiddenRetryCount > 0 ? (' (' + hiddenRetryCount + ')') : ''))
      : '⏳ Noise: shown';
    var retryBtnStyle = hideRetries
      ? 'background:#3a3a3a;color:#bbb;border:1px solid #555;'
      : 'background:#5a3a6e;color:#fff;border:1px solid #7a5aae;';
    var retryToggleHtml = '<button data-action="toggle-hide-retries" title="Toggle visibility of auto-retry / 429 rows" style="' + retryBtnStyle + 'border-radius:10px;padding:1px 8px;font-size:10px;cursor:pointer;margin-left:8px;">' + retryBtnLabel + '</button>';

    // (v4.226) Model→Provider map row: two dropdowns. Left = model (aggregated from ring
    // buffer entries). Right = provider (dynamically populated from tmGetProviderEntries for the
    // selected model). Saving writes to localStorage[tm_model_provider_map_v1] = {model: slug}.
    var ringModels = tmCollectRingModels();
    var modelProviderMap = tmGetModelProviderMap();
    var initRowHtml = '<div style="margin-bottom:8px;padding:4px 8px;border-radius:4px;background:rgba(24,34,28,0.7);border:1px solid #2a3a2a;display:flex;align-items:center;flex-wrap:wrap;gap:4px;font-size:10px;">' +
      '<span style="opacity:0.85;">🌱 Model→Provider:</span>' +
      '<select id="tm-mpm-model-select" data-action="set-mpm-model" style="font-size:10px;background:#222;color:#8ef0a0;border:1px solid #444;border-radius:3px;padding:1px 4px;max-width:220px;">';
    if (!ringModels.length) {
      initRowHtml += '<option value="">(no models in ring yet)</option>';
    } else {
      initRowHtml += '<option value="">— select model —</option>';
      for (var mi = 0; mi < ringModels.length; mi++) {
        var ringModel = ringModels[mi];
        var mappedSlug = modelProviderMap[ringModel.toLowerCase().replace(/:(nitro|floor|free)$/i, '')] || '';
        // (v4.238) Append the mapped provider's max-context window (when known) to the model→provider
        // mapping label so the current mapping shows its ctx at a glance.
        var mappedCtx = '';
        if (mappedSlug) {
          try {
            var _miEntries = tmGetProviderEntries(ringModel);
            for (var _mii = 0; _mii < _miEntries.length; _mii++) {
              if (_miEntries[_mii].slug === mappedSlug && _miEntries[_mii].maxContext != null) { mappedCtx = ' (ctx: ' + tmFmtCtx(_miEntries[_mii].maxContext) + ')'; break; }
            }
          } catch (e) {}
        }
        var mpmLabel = ringModel + (mappedSlug ? (' → ' + mappedSlug + mappedCtx) : '');
        initRowHtml += '<option value="' + escapeHtml(ringModel) + '">' + escapeHtml(mpmLabel) + '</option>';
      }
    }
    initRowHtml += '</select>';
    // Provider dropdown — initially empty; populated dynamically when a model is selected.
    initRowHtml += '<select id="tm-mpm-provider-select" data-action="set-mpm-provider" style="font-size:10px;background:#222;color:#8ef0a0;border:1px solid #444;border-radius:3px;padding:1px 4px;max-width:200px;">';
    initRowHtml += '<option value="">(select model first)</option>';
    initRowHtml += '</select>';
    initRowHtml += '<button data-action="show-provider-ratings" title="Rate and track providers per model" style="font-size:10px;background:#3a3a1a;color:#ffe0a0;border:1px solid #5a5a2a;border-radius:3px;padding:1px 8px;cursor:pointer;margin-left:4px;">📊 Rate Providers</button>';
    initRowHtml += '<button data-action="show-cost-editor" title="Set per-million pricing for client-side cost calculation" style="font-size:10px;background:#1a2a3a;color:#a0c0ff;border:1px solid #2a4a5a;border-radius:3px;padding:1px 8px;cursor:pointer;margin-left:4px;">💲 Set Costs</button>';
    initRowHtml += '</div>';

    // (v4.224) Time-window filter dropdown — applies to ALL sort modes.
    var timeFilterHtml = '<span style="font-size:10px;opacity:0.85;margin-left:8px;">Time:&nbsp;</span>' +
      '<select data-action="set-modal-time-filter" style="font-size:10px;background:#222;color:#fff;border:1px solid #555;border-radius:3px;padding:1px 4px;">';
    timeFilterHtml += '<option value="all"' + (tmModalTimeFilter === 'all' ? ' selected' : '') + '>All</option>';
    timeFilterHtml += '<option value="12h"' + (tmModalTimeFilter === '12h' ? ' selected' : '') + '>Current 12h</option>';
    timeFilterHtml += '<option value="24h"' + (tmModalTimeFilter === '24h' ? ' selected' : '') + '>Current 24h</option>';
    timeFilterHtml += '</select>';

    // (v4.270) OpenRouter→Gemini hard-block toggle. Default ON (red/guarded); OFF is shown
    // alarm-orange because it re-enables the PROVEN silent large-tool-result drop route.
    var orGemBlockOn = tmShouldBlockOpenRouterGemini();
    var orGemBtnStyle = orGemBlockOn
      ? 'background:#3a0d0d;color:#ff8a8a;border:1px solid #8a2a2a;'
      : 'background:#3a2a00;color:#ffb84d;border:1px solid #8a6a1a;';
    var orGemBtnLabel = orGemBlockOn ? '\uD83D\uDEAB OR→Gemini: BLOCKED' : '\u26A0\uFE0F OR→Gemini: ALLOWED';
    var orGemToggleHtml = '<button data-action="toggle-or-gemini-block" title="Hard-block OpenRouter→Gemini requests (proven silent large-tool-result drop). Default ON. Click to allow for controlled testing." style="' + orGemBtnStyle + 'border-radius:10px;padding:1px 8px;font-size:10px;cursor:pointer;margin-left:8px;">' + orGemBtnLabel + '</button>';

    html += '<div style="margin-bottom:8px;padding:4px 8px;border-radius:4px;background:rgba(30,30,40,0.7);border:1px solid #2a2a2a;display:flex;align-items:center;flex-wrap:wrap;gap:2px;">' +
      solSelectHtml + pillsHtml + filterHtml + timeFilterHtml + retryToggleHtml + orGemToggleHtml +
      '</div>';
    html += initRowHtml;

    if (!items.length) {
      if (!tmCaptureEnabled()) {
        html += '<div style="opacity:0.9;line-height:1.5;">' +
                'No payloads are being recorded. This setting persists across reloads (it lives in ' +
                'localStorage key <code>' + escapeHtml(TM_PAYLOAD_CAPTURE_ENABLED_KEY) + '</code>). ' +
                'Enable it with the command above, then send a message to capture one.' +
                '</div>';
      } else {
        html += '<div style="opacity:0.85;">No captured payloads yet \u2014 send a message to record one.</div>';
      }
      payloadCaptureModalInnerEl.innerHTML = html;
      return;
    }

    html += '<div style="font-size:11px;opacity:0.85;margin-bottom:8px;">' +
            'Stored in localStorage key <code>' + escapeHtml(TM_PAYLOAD_CAPTURE_RING_KEY) + '</code>. ' +
            'Ring holds up to ' + TM_PAYLOAD_CAPTURE_MAX_ENTRIES + ' entries; each outbound record is capped at ' + TM_PAYLOAD_CAPTURE_MAX_OUTBOUND_CHARS + ' chars and each response at ' + TM_PAYLOAD_CAPTURE_MAX_RESPONSE_CHARS + ' chars. ' +
            'The Trunc control limits individual strings; oversized entries become compact diagnostic skeletons. ' +
            'Responses are best-effort (may be empty for streaming/opaque responses).' +
            '</div>';

    // v4.163: Apply identity filter first, then sort
    // (v4.210) identity + retry filters were moved up ahead of the banner so hiddenRetryCount is
    // available to the toggle button; only the sort remains here.
    tmSortModalItems(items);

    // (v4.265) Hoist session costs store read outside the row loop so we don't JSON.parse localStorage per row.
    var modalCostsStore = null;
    try { modalCostsStore = tmGetSessionCosts() || {}; } catch (e) { modalCostsStore = {}; }

    // (v4.145) Session costs are stamped onto each capture row at response receipt.
    // No live recomputation from ring entries here; avoids double-counting and preserves history.

    // (v4.206) Track which identities already got a provider-routing dropdown, so only the MOST
    // RECENT entry per identity (first occurrence in the current sort) carries the control.
    var seenRouteIdentities = {};

    items.forEach((cap, idx) => {
      if (!cap) return;

      // (v4.223) Timeline separator — only in chronological sort mode.
      if (tmModalSortMode === 'chronological' && idx > 0) {
        var prevCap = items[idx - 1];
        if (prevCap) {
          var sepHtml = tmBuildTimelineSeparator(prevCap, cap);
          if (sepHtml) html += sepHtml;
        }
      }

      const ts = escapeHtml(cap.ts_local || cap.ts || '');
      const url = escapeHtml(cap.url || '');
      const protocol = escapeHtml(cap.protocol || 'unknown');
      const capId = escapeHtml(cap.id || '');

      // Attempt to show model + prefix hash
      let model = '';
      let prefixHash = '';
      try {
        const sum = tmBuildCaptureSummary(cap);
        model = (sum && sum.model) ? String(sum.model) : '';
        prefixHash = (sum && sum.system_tools_prefix_hash) ? String(sum.system_tools_prefix_hash) : '';
      } catch (e) {}
      model = escapeHtml(model);
      prefixHash = escapeHtml(prefixHash);

      const outBtnStyle = 'background:#245f36;color:#fff;border:none;border-radius:3px;padding:1px 6px;font-size:10px;cursor:pointer;margin-left:4px;';
      const inBtnStyle  = 'background:#2a4b7c;color:#fff;border:none;border-radius:3px;padding:1px 6px;font-size:10px;cursor:pointer;margin-left:4px;';
      const isRich = idx < TM_PAYLOAD_CAPTURE_MAX_RICH_ENTRIES;
      const btnDisabled = isRich ? '' : 'opacity:0.35;cursor:not-allowed;pointer-events:none;';
      const disabledNote = isRich ? '' : ' <span style="font-size:9px;opacity:0.4;">(disabled)</span>';

      const hasResp = cap.response_status != null || cap.response_headers != null || cap.response_body != null;
      const inDisabled = hasResp ? '' : 'opacity:0.45;cursor:not-allowed;pointer-events:none;';

      // (v4.212) Compute the provider-routing dropdown HERE (before the button row) so it can be
      // appended inline to the right of the last button, instead of as a separate overlapping div.
      var capRouteDropdown = '';
      var capRouteIdKey = '';
      try { capRouteIdKey = tmCapIdentityKey(cap) || ''; } catch (e) {}
      if (capRouteIdKey && !seenRouteIdentities[capRouteIdKey]) {
        seenRouteIdentities[capRouteIdKey] = true;
        var capRouteModel = (capRouteIdKey.split('::')[1]) || capModel || '';
        if (tmIsMultiProviderModel(capRouteModel)) {
          try { tmMaybeFetchProviderEndpoints(capRouteModel); } catch (e) {}
          var capRouteProv = (typeof cap.response_provider === 'string' && cap.response_provider) ? cap.response_provider : (capHost || '');
          // (v4.214) Use the lock label for the dropdown's display text too.
          capRouteProv = tmResolveProviderLabel(capRouteIdKey, capRouteProv);
          // (v4.219) The dropdown controls FUTURE routing (it appears only on the most-recent row
          // per identity). A static label makes that explicit and visually decouples the control
          // from the historical provider badge each row now shows (stamped per-turn above).
          capRouteDropdown = '<span style="font-size:9px;opacity:0.7;margin-left:6px;white-space:nowrap;" title="The provider the NEXT call will use -- historical rows show what actually served each turn">Next call will use:</span>' + tmBuildProviderRoutingDropdown(capRouteIdKey, capRouteModel, capRouteProv);
        }
      }

      html += '<div style="margin-bottom:8px;padding:8px;border-radius:6px;background:rgba(30,30,36,0.85);">';

      // (v4.111) Button row at the very top of each entry.
      // (v4.212) Provider-routing dropdown appended to the RIGHT of the last button (inline).
      html += '<div style="margin-bottom:3px;display:flex;align-items:center;flex-wrap:wrap;gap:2px;">' +
              '<button data-action="copy-payload-capture" data-capture-id="' + capId + '" data-part="summary" style="background:#555;color:#fff;border:none;border-radius:3px;padding:1px 6px;font-size:10px;cursor:pointer;' + btnDisabled + '">Summary</button>' +
              '<button data-action="copy-payload-capture" data-capture-id="' + capId + '" data-part="out_headers" style="' + outBtnStyle + btnDisabled + '">Out Hdrs</button>' +
              '<button data-action="copy-payload-capture" data-capture-id="' + capId + '" data-part="out_payload" style="' + outBtnStyle + btnDisabled + '">Out Body</button>' +
              '<button data-action="copy-payload-capture" data-capture-id="' + capId + '" data-part="out_payload_skeleton" style="background:#1f4a2b;color:#fff;border:none;border-radius:3px;padding:1px 6px;font-size:10px;cursor:pointer;margin-left:4px;' + btnDisabled + '">Out Skel</button>' +
              '<button data-action="copy-payload-capture" data-capture-id="' + capId + '" data-part="in_headers" style="' + inBtnStyle + btnDisabled + '">In Hdrs</button>' +
              '<button data-action="copy-payload-capture" data-capture-id="' + capId + '" data-part="in_payload" style="' + inBtnStyle + btnDisabled + '">In Body</button>' +
              '<button data-action="copy-payload-capture" data-capture-id="' + capId + '" data-part="in_payload_skeleton" style="background:#2a4b7c;color:#fff;border:none;border-radius:3px;padding:1px 6px;font-size:10px;cursor:pointer;margin-left:4px;' + btnDisabled + '">In Skel</button>' +
              (function(){
                // (v4.198) Raw Seg button: show it for ANY row that has raw response evidence, not
                // just usage-bearing ones. Prefer the captured usage/error segments; otherwise fall
                // back to the raw response head/body (in_raw_head) so a crashed provider-400 turn is
                // NEVER left without a way to view its raw segment from the ring buffer.
                if (!isRich) return '';
                var hasSegs = cap.response_usage_segments && cap.response_usage_segments.length;
                var hasRawHead = (typeof cap.response_body_head === 'string' && cap.response_body_head) || cap.response_body != null;
                if (!hasSegs && !hasRawHead) return '';
                var segPart = hasSegs ? 'in_usage_segments' : 'in_raw_head';
                var segLabel = hasSegs
                  ? ('Raw Seg' + (cap.response_usage_segments.length > 1 ? (' (' + cap.response_usage_segments.length + ')') : ''))
                  : 'Raw Seg⚠';
                var segTitle = hasSegs ? 'Copy raw usage/error SSE segment(s)' : 'Copy raw response head (failure row — no parsed segment)';
                return '<button data-action="copy-payload-capture" data-capture-id="' + capId + '" data-part="' + segPart + '" title="' + segTitle + '" style="background:#5a3a6e;color:#fff;border:none;border-radius:3px;padding:1px 6px;font-size:10px;cursor:pointer;margin-left:4px;">' + segLabel + '</button>';
              })() +
              (function() {
                // (v4.284) Guard report button on rows that carry stub/recovery data.
                var hasGuardData = (Array.isArray(cap._tool_stubbed) && cap._tool_stubbed.length) ||
                                   (Array.isArray(cap._tool_recovered) && cap._tool_recovered.length);
                if (!hasGuardData) return '';
                return '<button data-action="copy-payload-capture" data-capture-id="' + capId + '" data-part="guard" title="Oversized tool-result guard report (payload locations, tool, id, size)" style="background:#4a3a10;color:#ffd166;border:none;border-radius:3px;padding:1px 6px;font-size:10px;cursor:pointer;margin-left:4px;">Guard</button>';
              })() +
              disabledNote +
              capRouteDropdown +
              '</div>';

      // (v4.111) Title row: #N (fixed-width, very left) + HIT/MISS + cost + model + hash.
      var isHit = tmIsSignificantCacheHit(cap);
      // (v4.265/4.267) Cumulative cache ratio (misses / hits) for this session identity.
      // v4.267: embedded INSIDE the HIT/MISS badge (one blank space after the word) instead of as
      // an independent sibling field, and brightened off the black point (misses #d07070,
      // parens/slash #d0d0d8, hits #82c882). Ratio stays 9px even on the 12px MISS badge.
      var capIdKey = '';
      try { capIdKey = tmCapIdentityKey(cap) || ''; } catch (e) {}
      var rowStats = (capIdKey && modalCostsStore) ? modalCostsStore[capIdKey] : null;
      var rowHits = Number((rowStats && rowStats._cache_hits) || 0);
      var rowMisses = Number((rowStats && rowStats._cache_misses) || 0);
      var hitRatioInner = '';
      if (rowHits > 0 || rowMisses > 0) {
        hitRatioInner = '&nbsp;<span title="session totals (misses / hits) — cumulative, this identity" ' +
          'style="font-size:9px;font-weight:600;white-space:nowrap;color:#d0d0d8;">' +
          '(' + '<span style="color:#d07070;">' + rowMisses + '</span>' +
          ' / ' +
          '<span style="color:#82c882;">' + rowHits + '</span>' + ')' +
          '</span>&nbsp;';
      }
      // v4.267: fixed 30px/58px badge widths REMOVED (would clip the merged ratio parenthetical);
      // nowrap keeps 'HIT (3 / 18)' / 'MISS (12 / 4)' on one line as a single field.
      var hitBadge = isHit
        ? '<span title="cache hit" style="display:inline-block;color:#7dd67d;font-size:9px;font-weight:bold;white-space:nowrap;">HIT' + hitRatioInner + '</span>'
        : '<span title="cache miss" style="display:inline-block;color:#ff6b6b;font-size:12px;font-weight:bold;white-space:nowrap;">MISS' + hitRatioInner + '</span>';
      // v4.261: permanent per-capture marker for a response whose Kimi tool-call ID was repaired.
      var capIdRepairCount = Number(cap._tool_id_repair_count || 0);
      var capIdRepairBadge = '';
      if (capIdRepairCount > 0) {
        var capIdRepairLast = cap._tool_id_repair_last || {};
        var capIdRepairTitle = 'Kimi tool-call ID repaired before TypingMind persistence';
        if (capIdRepairLast.from || capIdRepairLast.to) {
          capIdRepairTitle += ': ' + String(capIdRepairLast.from || '?') + ' → ' + String(capIdRepairLast.to || '?');
        }
        capIdRepairBadge = '<span title="' + escapeHtml(capIdRepairTitle) + '" ' +
          'style="display:inline-block;margin-right:6px;padding:1px 5px;border:1px solid #ffd166;' +
          'border-radius:8px;color:#ffd166;font-size:10px;font-weight:bold;white-space:nowrap;">ID↺' +
          (capIdRepairCount > 1 ? (' ' + capIdRepairCount) : '') + '</span>';
      }
      // (v4.282) Guard + auto-resume history badges: 🛡️ stubbed / ♻️ recovered THIS turn,
      // ▶️ cumulative auto-resumes as of this turn (tooltip = reason breakdown).
      var capGuardBadges = '';
      try {
        var capStubArr = Array.isArray(cap._tool_stubbed) ? cap._tool_stubbed : [];
        var capRecArr = Array.isArray(cap._tool_recovered) ? cap._tool_recovered : [];
        if (capStubArr.length) {
          var stubTip = 'Oversized tool result(s) withheld this turn (deterministic stub sent): ' +
            capStubArr.map(function(x) { return (x.at ? (String(x.at) + ' ') : '') + String(x.name || '?') + ' ' + String(x.id || '?') + ' (' + Math.round(Number(x.bytes || 0) / 1024) + 'KB)'; }).join('; ');
          capGuardBadges += '<span title="' + escapeHtml(stubTip) + '" ' +
            'style="display:inline-block;margin-right:4px;padding:0 4px;border:1px solid #e0b050;' +
            'border-radius:8px;color:#e0b050;font-size:9px;font-weight:bold;white-space:nowrap;">🛡️' + capStubArr.length + '</span>';
        }
        if (capRecArr.length) {
          var recTip = 'Oversized tool result(s) restored in full this turn (recovery phrase found): ' +
            capRecArr.map(function(x) { return (x.at ? (String(x.at) + ' ') : '') + String(x.name || '?') + ' ' + String(x.id || '?') + ' (' + Math.round(Number(x.bytes || 0) / 1024) + 'KB)'; }).join('; ');
          capGuardBadges += '<span title="' + escapeHtml(recTip) + '" ' +
            'style="display:inline-block;margin-right:4px;padding:0 4px;border:1px solid #7dd67d;' +
            'border-radius:8px;color:#7dd67d;font-size:9px;font-weight:bold;white-space:nowrap;">♻️' + capRecArr.length + '</span>';
        }
        var capArTotal = Number(cap._autoresume_total || 0);
        if (capArTotal > 0) {
          var arBy = cap._autoresume_by_reason || {};
          var arParts = [];
          Object.keys(arBy).forEach(function(k) { arParts.push(tmAutoResumeReasonLabel(k) + ': ' + arBy[k]); });
          var arTip = 'Auto-resumes (typed "Continue") as of this turn' + (arParts.length ? (' — ' + arParts.join(' | ')) : '');
          capGuardBadges += '<span title="' + escapeHtml(arTip) + '" ' +
            'style="display:inline-block;margin-right:4px;padding:0 4px;border:1px solid #6aa8ff;' +
            'border-radius:8px;color:#6aa8ff;font-size:9px;font-weight:bold;white-space:nowrap;">▶️' + capArTotal + '</span>';
        }
        // (v4.286) Per-turn trigger marker: THIS row is the dead turn that caused an auto-resume.
        var capArTrig = cap._auto_resume_triggered ? String(cap._auto_resume_triggered) : '';
        if (capArTrig) {
          var trigTip = 'Auto-resume was TRIGGERED on this turn: ' + tmAutoResumeReasonLabel(capArTrig);
          capGuardBadges += '<span title="' + escapeHtml(trigTip) + '" ' +
            'style="display:inline-block;margin-right:4px;padding:0 4px;border:1px solid #6aa8ff;' +
            'border-radius:8px;background:rgba(106,168,255,0.15);color:#9cc4ff;font-size:9px;font-weight:bold;white-space:nowrap;">⏱</span>';
        }
      } catch (eGuardBadge) {}
      var capSessionId = cap.session_id || null;
      var capPastedId = cap.pasted_session_id || null;
      var capIdentity = cap._identity || null;
      var capModel = capIdentity ? (capIdentity.model || '') : tmCaptureModel(cap);
      var capModelHtml = escapeHtml(capModel);
      var capHost = capIdentity ? (capIdentity.host || '') : '';
      if (!capIdentity) { try { capHost = tmExtractEndpointHost(cap); } catch (e) {} }
      var capIsProxy = capIdentity ? !!capIdentity.proxy : tmIsProxyCapture(cap);
      var sessionCost = (cap.session_cost_total != null) ? cap.session_cost_total : (capIdKey && modalCostsStore && modalCostsStore[capIdKey] && typeof modalCostsStore[capIdKey]._total === 'number' ? modalCostsStore[capIdKey]._total : tmGetSessionCost(capSessionId, capModel, capHost, capIsProxy));
      // (v4.248) A '(T)' tag disambiguates the row's two pink dollar amounts: THIS one is the
      // running SESSION total for the identity (smaller font, info row); the larger unlabeled one on
      // the cost row below is this single payload's own inference cost. Labeling one of the pair is
      // enough, so the per-payload cost stays clean.
      // (v4.251) The tag now HUGS the digits. Previously the amount had its own min-width:55px
      // inline-block and the tag followed in a second box, so a short value ('$0.04') left the tag
      // stranded at the 55px mark -- far enough right that it read as a separate field and did not
      // catch the eye. Now ONE inline-block carries both: the min-width still reserves the column
      // (identical alignment on '—' rows and '$x.xx (T)' rows, and for everything to the right),
      // while the tag sits immediately beside the digits inside that one box, so they read as a
      // single field. nowrap keeps them on the same line no matter how narrow the modal gets.
      // (v4.252) A NON-BREAKING space separates tag from digits (they were running together), and
      // the tag is near-white light gray rather than pink -- deliberately OUTSIDE the amount's color
      // family so it reads as a LABEL on the number, not a part of it. &nbsp; rather than a plain
      // space: the field is already nowrap, so a collapsible space buys nothing and risks nothing
      // being rendered at all.
      var sessionCostStr = '<span title="running SESSION total for this identity — NOT the cost of this single turn" style="display:inline-block;min-width:68px;padding-right:6px;color:#ffccd5;font-size:11px;white-space:nowrap;">' +
        (sessionCost > 0
          ? ('$' + sessionCost.toFixed(2) + '<span style="color:#eaeaf0;font-size:9px;font-weight:700;">&nbsp;(T)</span>')
          : '—') +
        '</span>';
      var cost12h = (typeof cap._cost_12h === 'number') ? cap._cost_12h : null;
      var cost24h = (typeof cap._cost_24h === 'number') ? cap._cost_24h : null;
      // (v4.230) Show whenever the field exists (including $0.00) — misses must not hide these.
      var cost12hStr = (cost12h != null)
        ? '<span title="cost in current 12h block" style="color:#a0d0ff;font-size:10px;white-space:nowrap;flex-shrink:0;">12h:$' + cost12h.toFixed(2) + '</span>'
        : '';
      var cost24hStr = (cost24h != null)
        ? '<span title="cost in current+prior 12h blocks" style="color:#c0b0ff;font-size:10px;white-space:nowrap;flex-shrink:0;">24h:$' + cost24h.toFixed(2) + '</span>'
        : '';

      var modelColor = tmModelEndpointColor(capModel, capHost, capIsProxy, capSessionId);
      var modelColorTooltip = escapeHtml((capIdentity ? capIdentity.key : tmBuildIdentityKey(capSessionId, capModel, capHost, capIsProxy)) + ' — ' + modelColor);
      var idxStyle = 'display:inline-block;width:32px;opacity:0.8;flex-shrink:0;' + (isHit ? 'font-size:9px;' : 'font-size:12px;color:#ff6b6b;');

      // (v4.230) Natural-width flex row — the old fixed 150px left box overflowed on MISS
      // (badge 58px vs HIT 30px) and painted over the 12h/24h chips.
      html += '<div style="font-weight:600;overflow:visible;display:flex;align-items:center;flex-wrap:wrap;gap:6px;min-height:18px;">' +
              '<span style="display:inline-flex;align-items:center;flex-shrink:0;white-space:nowrap;">' +
              '<span style="' + idxStyle + '">#' + (idx + 1) + '</span>' +
              hitBadge + capIdRepairBadge + capGuardBadges + sessionCostStr +
              '</span>' +
              (cost12hStr || cost24hStr
                ? ('<span style="display:inline-flex;align-items:center;gap:6px;flex-shrink:0;">' + cost12hStr + cost24hStr + '</span>')
                : '') +
              // (v4.251, v4.252) 13px -> 21px -> 23px (+77% overall). This is THE field being
              // scanned when scrolling the ring, yet the button row directly above it dominated
              // visually. line-height 1.1 -> 1.15 so the taller glyphs cannot clip; a slightly
              // taller row is an accepted cost.
              (capModelHtml ? ('<span title="' + modelColorTooltip + '" style="font-weight:bold;color:' + modelColor + ';font-size:23px;line-height:1.15;display:inline-block;">' + capModelHtml + '</span>') : '') +
              '</div>';

      // (v4.206) Provider-routing dropdown -- MOVED into the button row above (v4.212).
      // (Old standalone div removed; capRouteIdKey/seenRouteIdentities computed before the button row.)

      html += '<div style="font-size:10px;opacity:0.85;margin-top:3px;color:#8cf;">' + ts + '</div>';
      html += '<div style="font-size:11px;opacity:0.75;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + url + '</div>';

      // (v4.66) Per-row repair ribbon + (v4.69) cache report — scan down the modal to see repairs AND cache read/write per payload.
      // (v4.94) Cost pinned to the very left of the row, before repair blocks.
      // (v4.297) Per-row context dial: this turn's provider-reported total vs model max ctx
      // (computed before the ribbon line; appended after the provider badge).
      var ctxDialHtml = '';
      try { ctxDialHtml = tmRenderCtxDial(cap._ctx_snapshot, { size: 16, cap: cap, leadingSep: true }); } catch (eCtxRow) { ctxDialHtml = ''; }
      var costVal = tmExtractCostVal(cap.response_anthropic_usage, cap.response_usage);
      var costHtml = '';
      if (cap._cost_no_usage) {
        costHtml = '<span title="Cost table entry exists but token usage could not be determined from the response" style="color:#ff6b6b;font-size:14px;font-weight:bold;">\u26A0</span> <span style="opacity:0.4;">\u00b7</span> ';
      } else if (cap._cost_init_needed) {
        costHtml = '<span title="No pricing entry existed (or has all zeros) \u2014 auto-created. Open Set Costs to populate." style="font-size:14px;">\uD83C\uDF31</span> <span style="opacity:0.4;">\u00b7</span> ';
      } else if (costVal > 0) {
        costHtml = '<span title="inference cost" style="color:#ffaca2;font-size:14px;font-weight:600;">$' + costVal.toFixed(3) + '</span> <span style="opacity:0.4;">\u00b7</span> ';
      } else if (typeof cap._table_cost === 'number' && cap._table_cost > 0) {
        costHtml = '<span title="cost calculated from global pricing table" style="color:#ffaca2;font-size:14px;font-weight:600;">$' + cap._table_cost.toFixed(3) + '</span> <span title="calculated by extension (not from API)" style="color:#a0d0ff;font-size:10px;">\u25CB</span> <span style="opacity:0.4;">\u00b7</span> ';
      }

      // (v4.197) Inline provider badge (light green) at the right end of the cost/repair/cache row,
      // so the serving provider is visible at a glance without opening the raw segment JSON. Falls
      // back to the resolved endpoint host for captures taken before provider capture existed.
      // (v4.219) HISTORICAL badge: prefer the per-turn label stamped at capture time
      // (cap._provider_label) -- NOT the current lock. Resolving every row through the live lock
      // (v4.214) rewrote all historical rows' labels whenever the lock changed. Pre-v4.219 entries
      // (no stamp) fall back to the captured response_provider (honest history, minus variant).
      var capProvider = (typeof cap._provider_label === 'string' && cap._provider_label) ? cap._provider_label
        : ((typeof cap.response_provider === 'string' && cap.response_provider) ? cap.response_provider : (capHost || ''));
      var providerHtml = capProvider
        ? (' <span style="opacity:0.4;">·</span> <span title="serving provider" style="color:#8ef0a0;font-size:11px;font-weight:600;">' + escapeHtml(capProvider) + '</span>')
        : '';
      html += '<div style="font-size:10px;margin-top:1px;letter-spacing:0.3px;">' + costHtml + tmRenderRepairBlocks(cap.repair_tally) + ' <span style="opacity:0.4;">·</span> ' + tmRenderCacheReport(cap.response_anthropic_usage, cap.response_usage, '14px') + providerHtml + ctxDialHtml + '</div>';



      // (v4.270) Per-entry WARNINGS row — generic, first-class, persisted on the ring entry.
      // Rendered between the cost/repair/cache row and the bottom hash/session row. Shows every
      // warning object in cap._warnings (critical=red, warning=orange, info=blue). Survives the
      // rich→compact strip because _warnings is underscore-prefixed.
      try {
        if (Array.isArray(cap._warnings) && cap._warnings.length) {
          for (var cwi = 0; cwi < cap._warnings.length; cwi++) {
            var cwarn = cap._warnings[cwi];
            if (!cwarn) continue;
            var csev = String(cwarn.severity || 'info');
            var cBorder = csev === 'critical' ? '#ff3333' : (csev === 'warning' ? '#ff9500' : '#4a9eff');
            var cBg = csev === 'critical' ? 'rgba(58,0,0,0.6)' : (csev === 'warning' ? 'rgba(58,34,0,0.6)' : 'rgba(20,40,60,0.6)');
            var cColor = csev === 'critical' ? '#ff6666' : (csev === 'warning' ? '#ffb84d' : '#8fc4ff');
            var cIcon = csev === 'critical' ? '\uD83D\uDEA8' : (csev === 'warning' ? '\u26A0\uFE0F' : '\u2139\uFE0F');
            var cTitle = escapeHtml(String(cwarn.title || cwarn.code || 'warning'));
            var cMsg = escapeHtml(String(cwarn.message || ''));
            var cDetail = '';
            try {
              var cd = cwarn.details || {};
              var cdParts = [];
              if (cd.outbound_bytes != null) cdParts.push('out ' + Math.round(cd.outbound_bytes / 1024) + 'KB');
              if (cd.estimated_prompt_tokens != null) cdParts.push('~' + Math.round(cd.estimated_prompt_tokens / 1000) + 'K est');
              if (cd.reported_prompt_tokens != null) cdParts.push(Math.round(cd.reported_prompt_tokens / 1000) + 'K reported');
              if (cd.reported_to_estimated_ratio != null) cdParts.push(Math.round(cd.reported_to_estimated_ratio * 100) + '%');
              if (cd.model) cdParts.push(String(cd.model));
              if (cdParts.length) cDetail = ' <span style="opacity:0.75;">(' + escapeHtml(cdParts.join(' · ')) + ')</span>';
            } catch (eCD) {}
            html += '<div style="margin-top:3px;padding:3px 6px;background:' + cBg + ';border:1px solid ' + cBorder + ';border-radius:4px;font-size:10px;line-height:1.4;">' +
              '<span style="color:' + cColor + ';font-weight:bold;">' + cIcon + ' ' + cTitle + ':</span> ' +
              '<span style="color:' + cColor + ';">' + cMsg + '</span>' + cDetail +
              '</div>';
          }
        }
      } catch (eWarnRow) {}

      // (v4.275) Per-entry PROVIDER ERROR row. `error` is first-class compact metadata rather
      // than a view synthesized from response_body, so it remains clickable after rich payloads
      // and raw SSE segments have been stripped. Reuse the existing copy+JSON-viewer path.
      try {
        if (cap.error) {
          var capErrStatus = cap.error.status != null ? ('HTTP ' + String(cap.error.status) + ' · ') : '';
          var capErrSource = cap.error.source ? (' [' + String(cap.error.source) + ']') : '';
          var capErrMsg = String(cap.error.message || tmCapturedErrorMessage(cap.error.payload) || 'Unknown provider error');
          html += '<div data-action="copy-payload-capture" data-capture-id="' + capId + '" data-part="error" ' +
            'title="Click to copy and inspect the full persisted provider error" ' +
            'style="margin-top:3px;padding:4px 7px;background:rgba(70,0,0,0.72);border:1px solid #ff3333;border-radius:4px;' +
            'font-size:10px;line-height:1.45;color:#ff7777;cursor:pointer;white-space:pre-wrap;word-break:break-word;">' +
            '<span style="font-weight:bold;color:#ff4444;">\uD83D\uDEA8 ERROR · ' + escapeHtml(capErrStatus) + '</span>' +
            '<span>' + escapeHtml(capErrMsg) + '</span>' +
            '<span style="opacity:0.65;">' + escapeHtml(capErrSource) + ' · click for full JSON</span>' +
            '</div>';
        }
      } catch (eErrorRow) {}

      // (v4.118) Bottom row: prefix hash + session ID + pasted ID.
      // (v4.134) Bottom row: session name support.
      // (v4.135) Dim only the non-colored labels, not the session ID/name values.
      // (v4.293) The tool-suspicion badge belongs to the latest row per session only.
      var sessionName = (capSessionId || capPastedId) ? tmGetSessionName(capSessionId || capPastedId) : '';
      var managementBadge = ((capSessionId || capPastedId) && latestManagedCapIds[String(capSessionId || capPastedId)] === cap.id)
        ? tmAgentManagementBadge(capSessionId || capPastedId)
        : '';
      var bottomPartsHtml = [];
      if (prefixHash) bottomPartsHtml.push('<span style="opacity:0.5;">h:' + escapeHtml(prefixHash) + '</span>');
      if (capSessionId) bottomPartsHtml.push('<span style="opacity:0.5;">Session ID: </span><span data-action="set-session-name" data-session-id="' + escapeHtml(capSessionId) + '" title="Click to name this session" style="cursor:pointer;opacity:0.5;">' + escapeHtml(capSessionId) + '</span>');
      if (capPastedId) {
        bottomPartsHtml.push('<span style="opacity:0.5;">pasted: </span><span data-action="set-session-name" data-session-id="' + escapeHtml(capSessionId || capPastedId) + '" title="Click to name this session" style="cursor:pointer;color:' + modelColor + ';font-size:12px;">' + escapeHtml(capPastedId) + '</span>');
      }
      if (sessionName) {
        bottomPartsHtml.push('<span data-action="set-session-name" data-session-id="' + escapeHtml(capSessionId || capPastedId) + '" title="Click to rename this session" style="cursor:pointer;color:' + modelColor + ';font-size:18px;font-weight:bold;">' + escapeHtml(sessionName) + '</span>');
      }
      if (managementBadge) bottomPartsHtml.push(managementBadge);
      if (bottomPartsHtml.length > 0) {
        html += '<div style="font-size:10px;font-family:monospace;margin-top:2px;">' + bottomPartsHtml.join(' | ') + '</div>';
      } else {
        html += '<div style="font-size:8px;opacity:0.35;font-family:monospace;margin-top:2px;">Session ID: (not available for this capture)</div>';
      }

      html += '</div>';
    });

    payloadCaptureModalInnerEl.innerHTML = html;
  }

  function openPayloadCaptureModal() {
    if (typeof document === 'undefined') return;
    const overlay = ensurePayloadCaptureModal();
    overlay.style.display = 'block';
    renderPayloadCaptureModal();
    // Register escape handlers on every open (removed on close).
    // (v4.246) TWO listeners, both on window CAPTURE so they run before ANY document-level
    // listener -- crucially including listeners LEAKED by a child modal that re-rendered itself
    // (ratings/cost-editor re-render by removing their overlay and calling themselves again,
    // without removing their document keydown listener). Each leaked listener still calls its own
    // close(), which sets tmPayloadCaptureSuppressEscapeUntil = now+1500; the old single-keyup
    // handler therefore saw 'suppressed' on every later Escape and ate it, permanently. Snapshot
    // the guard state at KEYDOWN (before leaks can run), then decide on KEYUP from the snapshot.
    if (!tmPayloadCaptureModalEscapeKeydownSnapshotter) {
      tmPayloadCaptureModalEscapeKeydownSnapshotter = function(ev) {
        if (ev.code === 'Escape' || ev.key === 'Escape' || ev.keyCode === 27) {
          tmEscapeGuardSnapshot = {
            childOpen: tmAnyChildModalOpen(),
            promptActive: !!tmPromptActive,
            suppressed: (Date.now() < tmPayloadCaptureSuppressEscapeUntil)
          };
        }
      };
      window.addEventListener('keydown', tmPayloadCaptureModalEscapeKeydownSnapshotter, true);
    }
    if (!tmPayloadCaptureModalEscapeHandler) {
      tmPayloadCaptureModalEscapeHandler = function(ev) {
        if (!(ev.code === 'Escape' || ev.key === 'Escape' || ev.keyCode === 27)) return;
        // Prefer the keydown snapshot; fall back to live state for a keyup with no paired keydown
        // (e.g. focus arrived mid-keypress), which is the conservative choice.
        var snap = tmEscapeGuardSnapshot || {
          childOpen: tmAnyChildModalOpen(),
          promptActive: !!tmPromptActive,
          suppressed: (Date.now() < tmPayloadCaptureSuppressEscapeUntil)
        };
        tmEscapeGuardSnapshot = null;
        // A child modal was genuinely open when the key went down: it owns this Escape entirely.
        // Do NOT close the ring modal underneath it (and do not eat the event -- the child's own
        // handler already dealt with it on keydown).
        if (snap.childOpen) return;
        // A native prompt() was in flight, or this is a held-key repeat trailing a real child
        // close: swallow, exactly as v4.221 intended.
        if (snap.promptActive || snap.suppressed) {
          ev.stopPropagation();
          if (ev.preventDefault) ev.preventDefault();
          return;
        }
        // (v4.271) If the session-filter listbox is open, Escape closes ONLY it (re-render), not
        // the modal -- swallow so it cannot bubble anywhere. Decided here, inside the existing
        // DOM-authoritative keyup guard; no new per-render keydown listener is added.
        if (tmModalFilterListboxOpen) {
          tmModalFilterListboxOpen = false;
          renderPayloadCaptureModal();
          ev.stopPropagation();
          if (ev.preventDefault) ev.preventDefault();
          return;
        }
        closePayloadCaptureModal();
      };
      window.addEventListener('keyup', tmPayloadCaptureModalEscapeHandler, true);
    }
  }

  function closePayloadCaptureModal() {
    if (!payloadCaptureModalEl) return;
    payloadCaptureModalEl.style.display = 'none';
    if (tmPayloadCaptureModalEscapeHandler) {
      window.removeEventListener('keyup', tmPayloadCaptureModalEscapeHandler, true);
      tmPayloadCaptureModalEscapeHandler = null;
    }
    // (v4.246) Tear down the paired keydown snapshotter too.
    if (tmPayloadCaptureModalEscapeKeydownSnapshotter) {
      window.removeEventListener('keydown', tmPayloadCaptureModalEscapeKeydownSnapshotter, true);
      tmPayloadCaptureModalEscapeKeydownSnapshotter = null;
    }
    tmEscapeGuardSnapshot = null;
    // (v4.271) Reset the listbox open-flag so a fresh open starts closed.
    tmModalFilterListboxOpen = false;
  }

  // ==================== FETCH OVERRIDE ====================

  // @beacon[
  //   id=auto-beacon@__lambdao_1.repairHistoricAnthropicToolInputs-tubb,
  //   role=__lambdao_1.repairHistoricAnthropicToolInputs,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Repairs empty/invalid historic tool_use inputs in cross-model transcripts.,
  // ]
  function repairHistoricAnthropicToolInputs(body) {
    if (!Array.isArray(body.messages) || body.messages.length < 2) return 0;
    let changed = 0;
    const lastIndex = body.messages.length - 1;

    for (let i = 0; i < lastIndex; i++) {
      const msg = body.messages[i];
      if (!msg || msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;

      msg.content.forEach((block, blockIdx) => {
        if (!block || block.type !== 'tool_use') return;

        const input = block.input;
        const isEmpty =
          input == null ||
          (typeof input === 'string' && input.trim() === '') ||
          (Array.isArray(input) && input.length === 0) ||
          (typeof input === 'object' && !Array.isArray(input) && Object.keys(input).length === 0);

        if (isEmpty) {
          block.input = { __tm_repaired_empty_input: true };
          console.log(`🩹 [v${EXT_VERSION}] Repaired empty tool_use.input on historic message ${i}, block ${blockIdx}, tool: ${block.name}`);
          changed++;
        }
      });
    }

    return changed;
  }

  // @carto-group id=client-group-6 label="Client group 6"

  // @beacon[
  //   id=auto-beacon@__lambdao_1.repairAnthropicEmptyMessageContent-3tx3,
  //   role=__lambdao_1.repairAnthropicEmptyMessageContent,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Fix 2 (Anthropic path): stubs empty message content so the API never rejects the payload - the original crash-prevention fix.,
  // ]
  function repairAnthropicEmptyMessageContent(body) {
    if (!Array.isArray(body.messages) || body.messages.length === 0) return 0;
    let changed = 0;

    body.messages.forEach((msg, msgIdx) => {
      if (!msg) return;
      if (msg.role !== 'assistant' && msg.role !== 'user') return;

      const c = msg.content;

      // Case 1: string content that is empty/whitespace
      if (typeof c === 'string') {
        if (c.trim() === '') {
          msg.content = `[tm_repaired_empty_${msg.role}_message]`;
          console.log(`🩹 [v${EXT_VERSION}] Repaired empty ${msg.role} string content on message ${msgIdx}`);
          changed++;
        }
        return;
      }

      // Case 2: array content with no blocks (e.g. content: [])
      if (Array.isArray(c)) {
        if (c.length === 0) {
          msg.content = [{ type: 'text', text: `[tm_repaired_empty_${msg.role}_content]` }];
          console.log(`🩹 [v${EXT_VERSION}] Repaired empty ${msg.role} content array on message ${msgIdx}`);
          changed++;
        }
        return;
      }

      // Case 3: null/undefined content
      if (c == null) {
        msg.content = [{ type: 'text', text: `[tm_repaired_empty_${msg.role}_content]` }];
        console.log(`🩹 [v${EXT_VERSION}] Repaired missing ${msg.role} content on message ${msgIdx}`);
        changed++;
      }
    });

    return changed;
  }

  // v4.171: OpenAI-compatible chat-completions repair for providers like Kimi/Moonshot
  // that reject historic assistant messages with content:"". Keep shape conservative:
  // for chat-completions messages, replace empty/missing content with a simple text string.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.repairChatCompletionsEmptyMessageContent-ji4r,
  //   role=__lambdao_1.repairChatCompletionsEmptyMessageContent,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Fix 2 (OpenAI chat-completions path): stubs empty content fields.,
  // ]
  function repairChatCompletionsEmptyMessageContent(body, label) {
    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) return 0;
    let changed = 0;
    body.messages.forEach((msg, msgIdx) => {
      if (!msg) return;
      if (msg.role !== 'assistant' && msg.role !== 'user' && msg.role !== 'system' && msg.role !== 'tool') return;
      const c = msg.content;
      const empty =
        c == null ||
        (typeof c === 'string' && c.trim() === '') ||
        (Array.isArray(c) && c.length === 0);
      if (empty) {
        // v4.188: Skip replacement when a real tool call is the message content.
        // v4.274: An empty tool_calls:[] is not content and must not suppress this repair.
        if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) return;
        // Replace empty content (string or array) with placeholder.
        msg.content = `[tm_repaired_empty_${msg.role}_message]`;
        console.log(`🩹 [v${EXT_VERSION}] ${label || 'chat-completions'}: repaired empty ${msg.role} content on message ${msgIdx}`);
        changed++;
      }
    });
    return changed;
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.repairGeminiThoughtSignatures-c309,
  //   role=__lambdao_1.repairGeminiThoughtSignatures,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Gemini 3 repair: injects required thought signatures when a conversation started with another LLM is resumed with Gemini (the widget toggle).,
  // ]
  function repairGeminiThoughtSignatures(body) {
    if (!body || !Array.isArray(body.contents)) return false;

    let changed = false;
    // Start with any cached Gemini thoughtSignature seed so we can populate early
    // contents before the first in-conversation token appears.
    let lastThoughtSignature = getCachedGeminiThoughtSignature() || null;

    body.contents.forEach((entry, contentIdx) => {
      if (!entry || !Array.isArray(entry.parts)) return;

      // First pass: discover any existing signature for this content
      let contentSignature = null;
      entry.parts.forEach(part => {
        if (!part || typeof part !== 'object') return;
        if (typeof part.thoughtSignature === 'string' && part.thoughtSignature.trim() !== '') {
          const sig = part.thoughtSignature.trim();
          if (!contentSignature) {
            contentSignature = sig;
          } else if (contentSignature !== sig) {
            console.warn(
              `⚠️ [v${EXT_VERSION}] Mismatched Gemini thoughtSignature values in contents[${contentIdx}]; using first encountered.`
            );
          }
        }
      });

      // If this content has no signature but we have a prior one, propagate the last
      // signature forward to any content that actually carries text or functionCall parts
      // (user or model). This keeps the whole thinking exchange coherent.
      if (!contentSignature && lastThoughtSignature) {
        const hasToolOrText = entry.parts.some(
          p => p && (p.functionCall || typeof p.text === 'string')
        );
        if (hasToolOrText) {
          contentSignature = lastThoughtSignature;
        }
      }

      // Second pass: apply the contentSignature uniformly to all parts in this content.
      if (contentSignature) {
        cacheGeminiThoughtSignature(contentSignature);
        entry.parts.forEach((part, partIdx) => {
          if (!part || typeof part !== 'object') return;
          if (!part.thoughtSignature) {
            part.thoughtSignature = contentSignature;
            changed = true;
            console.log(
              `🩹 [v${EXT_VERSION}] Repaired missing Gemini thoughtSignature on part (contents[${contentIdx}].parts[${partIdx}])`
            );
          }
        });
        lastThoughtSignature = contentSignature;
      }
    });

    return changed;
  }

  function hasAnyGeminiThoughtSignature(body) {
    if (!body || !Array.isArray(body.contents)) return false;
    for (let i = 0; i < body.contents.length; i++) {
      const entry = body.contents[i];
      if (!entry || !Array.isArray(entry.parts)) continue;
      for (let j = 0; j < entry.parts.length; j++) {
        const part = entry.parts[j];
        if (!part || typeof part !== 'object') continue;
        if (typeof part.thoughtSignature === 'string' && part.thoughtSignature.trim() !== '') {
          return true;
        }
      }
    }
    return false;
  }

  const GEMINI_THOUGHT_SIGNATURE_CACHE_KEY = '__tmGeminiThoughtSignatureSeed_v1';

  function cacheGeminiThoughtSignature(sig) {
    try {
      if (!sig || typeof sig !== 'string') return;
      if (!sig.trim()) return;

      // Avoid caching our own synthetic values if any pre-v4.19 code still exists
      if (sig.startsWith('tm-init-')) return;

      if (window.__tmGeminiThoughtSignatureSeed !== sig) {
        window.__tmGeminiThoughtSignatureSeed = sig;
        console.log('💾 [v' + EXT_VERSION + '] Cached Gemini thoughtSignature seed (length: ' + sig.length + '):', sig.length < 100 ? sig : (sig.slice(0, 20) + '...' + sig.slice(-20)));
      }

      try {
        const existing = window.localStorage.getItem(GEMINI_THOUGHT_SIGNATURE_CACHE_KEY);
        if (existing !== sig) {
          window.localStorage.setItem(GEMINI_THOUGHT_SIGNATURE_CACHE_KEY, sig);
        }
      } catch (e) {
        console.warn('⚠️ [v' + EXT_VERSION + '] Could not persist Gemini thoughtSignature seed to localStorage:', e);
      }
    } catch (e) {
      console.warn('⚠️ [v' + EXT_VERSION + '] Error while caching Gemini thoughtSignature seed:', e);
    }
  }

  function getCachedGeminiThoughtSignature() {
    try {
      if (typeof window.__tmGeminiThoughtSignatureSeed === 'string' &&
          window.__tmGeminiThoughtSignatureSeed.trim()) {
        return window.__tmGeminiThoughtSignatureSeed;
      }

      try {
        const fromLS = window.localStorage.getItem(GEMINI_THOUGHT_SIGNATURE_CACHE_KEY);
        if (typeof fromLS === 'string' && fromLS.trim()) {
          window.__tmGeminiThoughtSignatureSeed = fromLS;
          console.log('💾 [v' + EXT_VERSION + '] Loaded Gemini thoughtSignature seed from localStorage (length: ' + fromLS.length + ')');
          return fromLS;
        }
      } catch (e) {
        console.warn('⚠️ [v' + EXT_VERSION + '] Could not read Gemini thoughtSignature seed from localStorage:', e);
      }
    } catch (e) {
      console.warn('⚠️ [v' + EXT_VERSION + '] Error while reading Gemini thoughtSignature seed:', e);
    }

    return null;
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.synthesizeGeminiThoughtSignature-59nd,
  //   role=__lambdao_1.synthesizeGeminiThoughtSignature,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Synthesizes and caches a bootstrap Gemini thought signature so the first bridged turns are accepted; Dan turns the toggle off once Gemini manages its own.,
  // ]
  function synthesizeGeminiThoughtSignature(body) {
    const synthetic = getCachedGeminiThoughtSignature();
    if (!synthetic) {
      console.warn('⚠️ [v' + EXT_VERSION + '] No cached Gemini thoughtSignature seed available; cannot synthesize. Request may fail with missing thought_signature.');
      return false;
    }

    if (!body || !Array.isArray(body.contents)) return false;

    let changed = false;

    body.contents.forEach((entry, contentIdx) => {
      if (!entry || !Array.isArray(entry.parts)) return;

      // Only bother with contents that actually carry text or functionCall parts.
      const hasToolOrText = entry.parts.some(
        p => p && (p.functionCall || typeof p.text === 'string')
      );
      if (!hasToolOrText) return;

      entry.parts.forEach((part, partIdx) => {
        if (!part || typeof part !== 'object') return;
        const hasSig = typeof part.thoughtSignature === 'string' && part.thoughtSignature.trim() !== '';
        if (!hasSig) {
          part.thoughtSignature = synthetic;
          changed = true;
          console.log(
            `🧪 [v${EXT_VERSION}] Applied cached Gemini thoughtSignature seed to part (contents[${contentIdx}].parts[${partIdx}])`
          );
        }
      });
    });

    if (changed) {
      console.log(
        '🧪 [v' + EXT_VERSION + '] Used cached Gemini thoughtSignature seed to supplement contents for this Gemini-3 request.'
      );
    }

    return changed;
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.repairAnthropicMissingToolResults-8u2z,
  //   role=__lambdao_1.repairAnthropicMissingToolResults,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Synthesizes missing tool_result blocks for orphaned tool_use calls (crash prevention).,
  // ]
  function repairAnthropicMissingToolResults(body) {
    if (!body || !Array.isArray(body.messages)) return 0;

    let changed = 0;
    const messages = body.messages;

    // (v4.67) GLOBAL guard: an id is only "missing" if it has NO tool_result ANYWHERE in the payload.
    // Checking only the immediately-following message (the old behavior) could inject a SECOND result
    // for an id whose result lived elsewhere (or was already present in a well-formed proxy payload),
    // which Anthropic rejects with "each tool_use must have a single result. Found multiple tool_result
    // blocks with id ...". Building this set up-front (and updating it as we inject) makes a duplicate
    // structurally impossible; on a valid payload nothing is truly missing, so this is a no-op.
    const globalResultIds = new Set();
    for (let gi = 0; gi < messages.length; gi++) {
      const gm = messages[gi];
      if (gm && Array.isArray(gm.content)) {
        gm.content.forEach(block => {
          if (block && block.type === 'tool_result' && block.tool_use_id) {
            globalResultIds.add(block.tool_use_id);
          }
        });
      }
    }

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (!msg || msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;

      // Collect all tool_use IDs in this assistant message
      const toolUseIds = [];
      msg.content.forEach(block => {
        if (block && block.type === 'tool_use' && block.id) {
          toolUseIds.push(block.id);
        }
      });

      if (toolUseIds.length === 0) continue;

      // Only ids with NO result anywhere are genuinely missing (deduped).
      const trulyMissing = [...new Set(toolUseIds)].filter(id => !globalResultIds.has(id));
      if (trulyMissing.length === 0) continue;

      // Check the next message for corresponding tool_results
      const nextMsg = messages[i + 1];
      if (!nextMsg || nextMsg.role !== 'user') {
        // No following user message at all - inject a stub message for the genuinely-missing tool_uses
        const stubContent = trulyMissing.map(id => ({
          type: 'tool_result',
          tool_use_id: id,
          content: [{ type: 'text', text: '✓' }]
        }));
        messages.splice(i + 1, 0, {
          role: 'user',
          content: stubContent
        });
        trulyMissing.forEach(id => globalResultIds.add(id));
        console.log(`🩹 [v${EXT_VERSION}] Injected missing tool_result message after assistant message ${i} for ${trulyMissing.length} tool_use(s)`);
        changed += trulyMissing.length;
        continue;
      }

      // Next message exists - append stubs ONLY for the genuinely-missing ids
      if (!Array.isArray(nextMsg.content)) {
        nextMsg.content = [];
      }

      trulyMissing.forEach(id => {
        nextMsg.content.push({
          type: 'tool_result',
          tool_use_id: id,
          content: [{ type: 'text', text: '✓' }]
        });
        globalResultIds.add(id);
        console.log(`🩹 [v${EXT_VERSION}] Injected missing tool_result for tool_use_id: ${id} in message ${i + 1}`);
        changed++;
      });
    }

    return changed;
  }

  // (v4.208) Cross-model transcript compatibility for Anthropic-native payloads.
  // Some non-Anthropic models serialize tool_use IDs such as "search_web:0". Direct Anthropic
  // rejects those because tool_use.id must match ^[a-zA-Z0-9_-]+$ (colon is illegal). The payload
  // history contains BOTH the assistant tool_use.id and the paired user tool_result.tool_use_id,
  // so we sanitize them consistently on outbound: any non [A-Za-z0-9_-] char becomes underscore.
  // This is intentionally limited to Anthropic-shaped bodies (messages[].content[] blocks), and is
  // applied before missing-tool-result repair so all later logic sees the canonical sanitized IDs.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.repairAnthropicToolUseIds-xqd6,
  //   role=__lambdao_1.repairAnthropicToolUseIds,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Sanitizes Anthropic tool_use IDs (colon -> underscore) for cross-model transcripts.,
  // ]
  function repairAnthropicToolUseIds(body) {
    if (!body || !Array.isArray(body.messages)) return 0;
    var changed = 0;
    function cleanId(v) {
      if (v == null) return v;
      return String(v).replace(/[^a-zA-Z0-9_-]/g, '_');
    }
    for (var i = 0; i < body.messages.length; i++) {
      var msg = body.messages[i];
      if (!msg || !Array.isArray(msg.content)) continue;
      for (var j = 0; j < msg.content.length; j++) {
        var block = msg.content[j];
        if (!block || typeof block !== 'object') continue;
        if (block.type === 'tool_use' && block.id != null) {
          var nextId = cleanId(block.id);
          if (nextId !== block.id) {
            console.log('🩹 [v' + EXT_VERSION + '] Sanitized Anthropic tool_use.id: ' + block.id + ' -> ' + nextId);
            block.id = nextId;
            changed++;
          }
        }
        if (block.type === 'tool_result' && block.tool_use_id != null) {
          var nextResultId = cleanId(block.tool_use_id);
          if (nextResultId !== block.tool_use_id) {
            console.log('🩹 [v' + EXT_VERSION + '] Sanitized Anthropic tool_result.tool_use_id: ' + block.tool_use_id + ' -> ' + nextResultId);
            block.tool_use_id = nextResultId;
            changed++;
          }
        }
      }
    }
    return changed;
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmInjectCacheControlOnMessage-qwbi,
  //   role=__lambdao_1.tmInjectCacheControlOnMessage,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Fix 1/5 helper: stamps cache_control {type:ephemeral, ttl:1h} onto a message's content blocks.,
  // ]
  function tmInjectCacheControlOnMessage(msg, label) {
    // Inject cache_control: {type:'ephemeral'} on a single message's content.
    // Handles string content (wraps to multipart) and array content (tags last text block).
    // Returns true if modified.
    if (!msg) return false;
    var cc = { type: 'ephemeral', ttl: '1h' };

    if (typeof msg.content === 'string') {
      var t = msg.content;
      msg.content = [{ type: 'text', text: t, cache_control: cc }];
      console.log('✅ [v' + EXT_VERSION + '] OpenRouter Claude: injected cache_control on ' + (label || 'message') + ' (wrapped string).');
      return true;
    }

    if (Array.isArray(msg.content)) {
      // Find last text block and tag/normalize it.
      for (var i = msg.content.length - 1; i >= 0; i--) {
        var b = msg.content[i];
        if (!b || typeof b !== 'object') continue;
        if (b.type === 'text' && typeof b.text === 'string') {
          if (!b.cache_control || typeof b.cache_control !== 'object') {
            b.cache_control = cc;
            console.log('✅ [v' + EXT_VERSION + '] OpenRouter Claude: injected cache_control on ' + (label || 'message') + '.');
            return true;
          }

          // Normalize existing cache_control to avoid TTL mismatch errors (e.g., 5m vs 1h).
          var prevType = b.cache_control.type;
          var prevTtl = b.cache_control.ttl;
          if (prevType !== 'ephemeral' || prevTtl !== '1h') {
            b.cache_control.type = 'ephemeral';
            b.cache_control.ttl = '1h';
            console.log('✅ [v' + EXT_VERSION + '] OpenRouter Claude: normalized existing cache_control on ' + (label || 'message') + ' to ttl:1h (was type:' + prevType + ', ttl:' + prevTtl + ').');
            return true;
          }

          return false; // already normalized
        }
      }
      // No text blocks: append minimal one.
      msg.content.push({ type: 'text', text: ' ', cache_control: cc });
      console.log('✅ [v' + EXT_VERSION + '] OpenRouter Claude: appended cache_control block on ' + (label || 'message') + '.');
      return true;
    }

    return false;
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.ensureOpenRouterClaudeCacheControl-6lz3,
  //   role=__lambdao_1.ensureOpenRouterClaudeCacheControl,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Fix 5: deep-strips existing per-block markers, normalizes top-level cache_control to ttl:1h, injects cap-safe breakpoints (system + 2 user) to avoid provider max-block errors.,
  // ]
  function ensureOpenRouterClaudeCacheControl(body) {
    // OpenRouter prompt caching for Claude requires cache_control breakpoints (max 4 per request).
    // cache_control markers are NOT part of the cache key hash (confirmed by Claude Code behavior
    // and Anthropic docs on prefix matching). So we can safely move/add them each turn.
    //
    // Strategy (v4.41):
    //   Breakpoint 1: system message (caches tools + system prefix)
    //   Breakpoints 2-4: user messages at offsets from the end of the messages array.
    //     - last user message (caches entire conversation up to current turn)
    //     - 2nd-to-last user message (supports deleting last 1-2 messages)
    //     - 5th-to-last user message (supports deleting up to ~5 messages)
    //   This uses all 4 breakpoints for maximum cache coverage + resilience to message deletion.
    if (!body || !Array.isArray(body.messages)) return false;

    var messages = body.messages;
    var changed = false;

    // IMPORTANT: Anthropic/OpenRouter enforces max 4 cache_control blocks.
    // To avoid drift/accumulation across turns, first strip ALL existing per-block
    // cache_control markers (deep, including nested tool_result content), then
    // re-inject exactly the desired breakpoints.
    function tmStripCacheControlDeep(x) {
      if (!x || typeof x !== 'object') return 0;
      var removed = 0;

      if (Array.isArray(x)) {
        for (var ai = 0; ai < x.length; ai++) {
          removed += tmStripCacheControlDeep(x[ai]);
        }
        return removed;
      }

      if (Object.prototype.hasOwnProperty.call(x, 'cache_control')) {
        delete x.cache_control;
        removed += 1;
      }

      for (var k in x) {
        if (!Object.prototype.hasOwnProperty.call(x, k)) continue;
        removed += tmStripCacheControlDeep(x[k]);
      }
      return removed;
    }

    var strippedCount = 0;
    for (var si = 0; si < messages.length; si++) {
      var sm = messages[si];
      if (!sm || !Array.isArray(sm.content)) continue;
      strippedCount += tmStripCacheControlDeep(sm.content);
    }
    if (strippedCount > 0) {
      console.log('✅ [v' + EXT_VERSION + '] OpenRouter Claude: stripped ' + strippedCount + ' existing per-block cache_control markers before re-injection.');
      changed = true;
    }

    // 1) System message breakpoint
    var sysIdx = messages.findIndex(function(m) { return m && m.role === 'system'; });
    if (sysIdx >= 0) {
      if (tmInjectCacheControlOnMessage(messages[sysIdx], 'system[' + sysIdx + ']')) {
        changed = true;
      }
    }

    // 2) Collect indices of all user messages (excluding system)
    var userIndices = [];
    for (var i = 0; i < messages.length; i++) {
      if (messages[i] && messages[i].role === 'user') {
        userIndices.push(i);
      }
    }

    // OpenRouter/Anthropic now appears to enforce an effective total cap that collides
    // with top-level cache_control + 4 block markers. To stay safely under limit, use
    // only TWO user breakpoints (plus system): total 3 block markers.
    // Priority: last (0), 2-back (2). Fallbacks: 10-back, then 5-back.
    var offsetsPrimary = [0, 2];
    var offsetsFallback = [10, 5];
    var placed = 0;
    var usedMsgIndices = new Set();

    for (var oi = 0; oi < offsetsPrimary.length && placed < 2; oi++) {
      var off = offsetsPrimary[oi];
      var uiPos = userIndices.length - 1 - off;
      if (uiPos < 0) continue;
      var msgIdx = userIndices[uiPos];
      if (usedMsgIndices.has(msgIdx)) continue; // don't double-tag same message
      usedMsgIndices.add(msgIdx);

      if (tmInjectCacheControlOnMessage(messages[msgIdx], 'user[' + msgIdx + '] (offset -' + off + ')')) {
        changed = true;
        placed++;
      }
    }

    // If we still have only one user marker, try wider-history fallback positions.
    for (var fi = 0; fi < offsetsFallback.length && placed < 2; fi++) {
      var foff = offsetsFallback[fi];
      var fuiPos = userIndices.length - 1 - foff;
      if (fuiPos < 0) continue;
      var fmsgIdx = userIndices[fuiPos];
      if (usedMsgIndices.has(fmsgIdx)) continue;
      usedMsgIndices.add(fmsgIdx);

      if (tmInjectCacheControlOnMessage(messages[fmsgIdx], 'user[' + fmsgIdx + '] (offset -' + foff + ' fallback)')) {
        changed = true;
        placed++;
      }
    }

    return changed;
  }

  // ==================== DIRECT-ANTHROPIC CACHE INJECTION (v4.264) ====================
  // Use Anthropic's top-level AUTOMATIC caching for the growing conversation: the server moves
  // the final breakpoint forward each request, reads the prior prefix, and writes only the new
  // suffix. Keep one explicit system marker as a stable fallback if message history diverges.
  // This consumes 2 of the 4 available breakpoint slots and avoids the v4.263 moving-explicit-
  // user-marker strategy that rewrote most of a tool-heavy conversation.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmEnsureDirectAnthropicCacheControl-da63,
  //   role=__lambdao_1.tmEnsureDirectAnthropicCacheControl,
  //   slice_labels=tm-payload-overview,tm-payload-cost-visibility,
  //   kind=ast,
  //   comment=v4.264: direct Anthropic cache policy -- top-level automatic conversation caching plus one explicit system fallback, both ttl 1h (2 of 4 breakpoint slots).,
  // ]
  function tmEnsureDirectAnthropicCacheControl(body) {
    if (!body || !Array.isArray(body.messages)) return false;
    var cc = { type: 'ephemeral', ttl: '1h' };
    var changed = false;

    // 1) Automatic conversation breakpoint. Anthropic advances this to the last cacheable block.
    if (!body.cache_control || typeof body.cache_control !== 'object') {
      body.cache_control = { type: 'ephemeral', ttl: '1h' };
      console.log('\u2705 [v' + EXT_VERSION + '] Direct Anthropic: enabled top-level automatic cache_control ttl:1h.');
      changed = true;
    }

    // 2) Explicit stable fallback at the end of the native top-level system field.
    if (typeof body.system === 'string' && body.system.length > 0) {
      body.system = [{ type: 'text', text: body.system, cache_control: cc }];
      console.log('\u2705 [v' + EXT_VERSION + '] Direct Anthropic: wrapped top-level system string into cached fallback block.');
      changed = true;
    } else if (Array.isArray(body.system)) {
      for (var sbi = body.system.length - 1; sbi >= 0; sbi--) {
        var sb = body.system[sbi];
        if (sb && sb.type === 'text' && typeof sb.text === 'string') {
          if (!sb.cache_control || typeof sb.cache_control !== 'object') {
            sb.cache_control = cc;
            console.log('\u2705 [v' + EXT_VERSION + '] Direct Anthropic: injected cache_control on system fallback block[' + sbi + '].');
            changed = true;
          }
          break;
        }
      }
    }
    return changed;
  }

  // ==================== TOOLS KEY CANONICALIZATION (v4.58) ====================
  // TypingMind emits semantically-IDENTICAL tool schemas with NON-DETERMINISTIC object key
  // ordering across turns (e.g. one turn serializes {path, dryRun}, the next {dryRun, path}).
  // Prompt caching keys off the EXACT serialized prefix, and providers (OpenAI-family in
  // particular) place the tool/function definitions near the FRONT of the cached prefix -- so a
  // reordered key busts the cache on EVERY turn even though the tools are unchanged. This was
  // the true root cause of GPT-5.x cached_tokens staying at 0 (and of Claude paying small but
  // needless per-turn cache re-writes).
  //
  // FIX: recursively rewrite every OBJECT with its keys in sorted order, so semantically-equal
  // tool schemas serialize BYTE-IDENTICALLY turn-to-turn. If a tool GENUINELY changes, the
  // sorted forms still differ -> the cache correctly misses. So this removes ONLY the spurious
  // ordering noise; it never masks a real change.
  //
  // CRITICAL: sort OBJECT KEYS only. NEVER reorder ARRAY elements -- array order is semantic
  // (enum value order, required[] order, and the tools list order itself must be preserved).
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmCanonicalizeKeysDeep-jii2,
  //   role=__lambdao_1.tmCanonicalizeKeysDeep,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Fix 6A primitive: recursive OBJECT-key sort (array order preserved - enum/required stay semantic) so semantically-equal tools serialize byte-identically every turn.,
  // ]
  function tmCanonicalizeKeysDeep(x) {
    if (Array.isArray(x)) {
      // Preserve array order; only canonicalize the contents of each element.
      var arr = new Array(x.length);
      for (var i = 0; i < x.length; i++) arr[i] = tmCanonicalizeKeysDeep(x[i]);
      return arr;
    }
    if (x && typeof x === 'object') {
      var out = {};
      var keys = Object.keys(x).sort();
      for (var j = 0; j < keys.length; j++) {
        out[keys[j]] = tmCanonicalizeKeysDeep(x[keys[j]]);
      }
      return out;
    }
    return x;
  }

  // ==================== TOOL SCHEMA TYPE REPAIR (Fix 15, v4.199) ====================
  // TypingMind's MCP->OpenAI tools conversion DROPS any JSON-Schema `type` whose value is an
  // ARRAY (e.g. a FastMCP Optional param served as `"type": ["string","null"]`), because
  // OpenAI's strict function-calling subset only allows a single-string type. It passes
  // `anyOf` unions through untouched, but a plain array-type is deleted outright — leaving a
  // property with `default`/`description`/`title` and NO type at all. Moonshot / OpenAI /
  // Anthropic tolerate the naked property; Fireworks' strict validator REJECTS the whole
  // request with a 400 ('JSON Schema not supported: could not understand the instance ...').
  // Confirmed live: lightning_rod.comment went out as {default:null,description,title} — the
  // ONLY typeless property in the tool — and crashed on Fireworks while every anyOf-shaped
  // sibling survived. This repair re-injects a single-string `type` into any property that
  // lost it, restoring portability across ALL providers. Semantic-preserving for the common
  // Optional[str] case; conservative single-string inference from `default` otherwise.
  //
  // Returns the number of properties repaired (0 = nothing changed).
  function tmInferSchemaType(propObj) {
    // Only called for a property that has NO type descriptor of any kind. Infer a single
    // JSON-Schema string type from the default value; fall back to 'string' (the dominant
    // FastMCP Optional[str] case, and the safest OpenAI-strict-compatible choice).
    if (propObj && Object.prototype.hasOwnProperty.call(propObj, 'default')) {
      var d = propObj.default;
      if (typeof d === 'boolean') return 'boolean';
      if (typeof d === 'number') return (Number.isInteger(d) ? 'integer' : 'number');
      if (typeof d === 'string') return 'string';
      // d === null (Optional[...] with no non-null default) or object/array default:
      // 'string' is the overwhelmingly-common Optional[str] intent and is strict-safe.
    }
    return 'string';
  }

  // ---- Moonshot strict-schema repair (Fix 15 extension, v4.242) ----
  // Moonshot AI's validator REJECTS a schema node that has an `anyOf` (or `oneOf`/`allOf`)
  // union sitting alongside a SIBLING keyword — `default`, `type`, `enum`, or `const` — on the
  // SAME node ('conflicting keywords found in anyOf with parent'). FastMCP Optional[...] params
  // serialize to exactly this: { anyOf: [ {type:'string', default:'x'}, {type:'null'} ],
  // default:'x', description:'...', title:'...' }. Lax providers (OpenAI/Anthropic/Fireworks)
  // ignore the redundancy; Moonshot 400s the whole request.
  //
  // Fix: collapse the union to a SINGLE concrete branch. Prefer the first non-null,
  // non-empty branch; merge the parent-level default/description/title back onto it; drop the
  // union keyword and the now-redundant sibling keywords. This preserves the practical
  // Optional[T] semantics (the argument is a T, and it's optional via `default`/not-in-required)
  // while producing a shape every provider accepts. Returns 1 if it flattened this node, else 0.
  function tmFlattenAnyOfForStrictSchema(prop, stripUnionDefaults) {
    if (!prop || typeof prop !== 'object' || Array.isArray(prop)) return 0;
    var unionKey = null;
    if (Array.isArray(prop.anyOf)) unionKey = 'anyOf';
    else if (Array.isArray(prop.oneOf)) unionKey = 'oneOf';
    else if (Array.isArray(prop.allOf)) unionKey = 'allOf';
    if (!unionKey) return 0;
    // Only act when a CONFLICTING sibling keyword co-exists with the union (the exact thing
    // Moonshot flags). If the union stands alone, leave it untouched (it's valid everywhere).
    var hasAnnotationConflict = Object.prototype.hasOwnProperty.call(prop, 'default');
    var hasConstraintConflict = Object.prototype.hasOwnProperty.call(prop, 'type')
      || Object.prototype.hasOwnProperty.call(prop, 'enum')
      || Object.prototype.hasOwnProperty.call(prop, 'const');
    if (!hasAnnotationConflict && !hasConstraintConflict) return 0;
    // (v4.253) PRESERVE THE UNION when the only conflict is the advisory `default`
    // annotation -- the universal FastMCP Optional shape: anyOf:[{X},{null}] + default:null.
    // The old collapse-to-first-concrete-branch DESTROYED the null arm (the model's
    // in-schema cue that a field is meant to be omitted/null) and any extra union arms
    // (e.g. render_spec's object form). Proven live 2026-08: Sol via OpenRouter, seeing the
    // de-nulled bare types, filled optionals with "" (output_file:"") and crashed the tool
    // call, while the untouched direct/Responses schema produced clean minimal calls.
    // Moonshot's strict validator objects to the UNION+SIBLING coexistence, NOT to a
    // standalone union (see comment above) -- so drop the sibling, keep the union.
    // `default` is advisory metadata: omission is governed by `required` (never touched),
    // the server-side defaults remain authoritative, and the tool descriptions restate
    // defaults in prose. Constraint siblings (type/enum/const) are REAL constraints --
    // deleting them would LOOSEN the schema -- so that rare shape falls through to the
    // old conservative flatten below.
    if (hasAnnotationConflict && !hasConstraintConflict) {
      // (v4.254) FULL-FIDELITY MODE (every non-Moonshot target): union+default is valid JSON
      // Schema and every non-Moonshot validator we have ever hit accepts it (OpenAI provably
      // does -- the /v1/responses path ships exactly this shape untouched). Pass it through
      // VERBATIM so the model keeps both the null arm AND the advisory default (the likely
      // omission cue -- H1). Only Moonshot-bound requests (see tmIsMoonshotBoundRequest) get
      // the v4.253 default-drop, which their validator requires.
      if (!stripUnionDefaults) return 0;
      delete prop.default;
      return 1;
    }
    var branches = prop[unionKey];
    // Choose the first branch that is a concrete (non-null) schema object.
    var chosen = null;
    for (var bi = 0; bi < branches.length; bi++) {
      var br = branches[bi];
      if (br && typeof br === 'object' && !Array.isArray(br)) {
        if (br.type === 'null') continue; // skip the Optional's null arm
        chosen = br;
        break;
      }
    }
    if (!chosen) return 0; // nothing concrete to collapse to; leave as-is (don't corrupt)
    // Preserve parent-level annotations the branch may lack.
    var carry = ['default', 'description', 'title'];
    for (var ci = 0; ci < carry.length; ci++) {
      var ck = carry[ci];
      if (Object.prototype.hasOwnProperty.call(prop, ck)
          && !Object.prototype.hasOwnProperty.call(chosen, ck)) {
        chosen[ck] = prop[ck];
      }
    }
    // Rewrite `prop` in place to be exactly the chosen branch: remove the union + any
    // now-conflicting parent siblings, then copy the branch's own keys over.
    delete prop[unionKey];
    var stripParent = ['type', 'enum', 'const', 'default', 'description', 'title'];
    for (var si = 0; si < stripParent.length; si++) delete prop[stripParent[si]];
    var bkeys = Object.keys(chosen);
    for (var kj = 0; kj < bkeys.length; kj++) prop[bkeys[kj]] = chosen[bkeys[kj]];
    return 1;
  }

  function tmRepairSchemaTypesDeep(node, stripUnionDefaults) {
    // Walk a JSON-Schema subtree. Repair each `properties` map: any property object that has
    // NO type indicator (no `type`, `anyOf`, `oneOf`, `allOf`, `$ref`, `enum`, or `const`)
    // gets a single inferred string `type`. Recurse into nested schemas so deep params
    // (items, nested object properties, anyOf branches) are covered too.
    // ALSO (v4.242): flatten any anyOf/oneOf/allOf that co-exists with a conflicting sibling
    // keyword, so Moonshot's strict validator accepts the schema.
    var repaired = 0;
    if (!node || typeof node !== 'object') return 0;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) repaired += tmRepairSchemaTypesDeep(node[i], stripUnionDefaults);
      return repaired;
    }
    if (node.properties && typeof node.properties === 'object') {
      var keys = Object.keys(node.properties);
      for (var k = 0; k < keys.length; k++) {
        var prop = node.properties[keys[k]];
        if (prop && typeof prop === 'object' && !Array.isArray(prop)) {
          // v4.242: Moonshot strict-schema fix FIRST — collapse a conflicting anyOf/oneOf/allOf
          // (union + sibling default/type/enum/const) to a single concrete branch before the
          // typeless-property check runs (flattening may turn it into a plain typed property).
          repaired += tmFlattenAnyOfForStrictSchema(prop, stripUnionDefaults);
          var hasType = Object.prototype.hasOwnProperty.call(prop, 'type')
            || Object.prototype.hasOwnProperty.call(prop, 'anyOf')
            || Object.prototype.hasOwnProperty.call(prop, 'oneOf')
            || Object.prototype.hasOwnProperty.call(prop, 'allOf')
            || Object.prototype.hasOwnProperty.call(prop, '$ref')
            || Object.prototype.hasOwnProperty.call(prop, 'enum')
            || Object.prototype.hasOwnProperty.call(prop, 'const');
          if (!hasType) {
            prop.type = tmInferSchemaType(prop);
            repaired++;
          }
          // Recurse regardless (nested object/array schemas may also have naked props).
          repaired += tmRepairSchemaTypesDeep(prop, stripUnionDefaults);
        }
      }
    }
    // Recurse into common nested-schema carriers.
    if (node.items) repaired += tmRepairSchemaTypesDeep(node.items, stripUnionDefaults);
    var branchKeys = ['anyOf', 'oneOf', 'allOf'];
    for (var b = 0; b < branchKeys.length; b++) {
      if (Array.isArray(node[branchKeys[b]])) repaired += tmRepairSchemaTypesDeep(node[branchKeys[b]], stripUnionDefaults);
    }
    return repaired;
  }

  // (v4.254) Is this request Moonshot-bound? Moonshot's validator is the ONLY one ever observed
  // to 400 on a union (anyOf/oneOf/allOf) co-existing with a sibling `default` (day-one Kimi-K3
  // turbulence, v4.242). The default-drop is therefore gated to: direct Moonshot URLs; any model
  // id containing 'moonshot' or 'kimi' (OpenRouter FLOAT mode may route moonshotai/* to Moonshot
  // unpredictably, and over-stripping for the Kimi family is provably harmless -- Kimi emits
  // minimal calls either way, per the v4.253 test matrix); or an already-present OpenRouter
  // provider pin naming a moonshot slug. The model-id check also covers cors-proxy traffic,
  // where the URL is TypingMind's proxy rather than the real target host.
  function tmIsMoonshotBoundRequest(url, body) {
    try {
      var u = String(url || '').toLowerCase();
      if (u.indexOf('moonshot') !== -1) return true;
      var m = (body && typeof body.model === 'string') ? body.model.toLowerCase() : '';
      if (m.indexOf('moonshot') !== -1 || m.indexOf('kimi') !== -1) return true;
      var p = body && body.provider;
      var slugs = [];
      if (p && Array.isArray(p.order)) slugs = slugs.concat(p.order);
      if (p && Array.isArray(p.only)) slugs = slugs.concat(p.only);
      for (var i = 0; i < slugs.length; i++) {
        if (String(slugs[i] || '').toLowerCase().indexOf('moonshot') !== -1) return true;
      }
    } catch (e) {}
    return false;
  }

  // Repair tool-parameter schemas in body.tools IN PLACE. Returns true if anything changed.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmRepairToolSchemas-82ue,
  //   role=__lambdao_1.tmRepairToolSchemas,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Fix 15: re-infers and re-injects a JSON-Schema type into tool properties TypingMind stripped (array-valued types), unblocking strict validators (Fireworks 400s); v4.253 preserved anyOf unions (null arms survive) by dropping the advisory default; v4.254 gates that default-drop to Moonshot-bound requests only (URL slash model slash provider-pin) -- everywhere else union+default passes through verbatim.,
  // ]
  function tmRepairToolSchemas(body, stripUnionDefaults) {
    try {
      if (!body || !Array.isArray(body.tools) || body.tools.length === 0) return false;
      var total = 0;
      for (var t = 0; t < body.tools.length; t++) {
        var tool = body.tools[t];
        var params = tool && tool.function && tool.function.parameters;
        if (params && typeof params === 'object') {
          total += tmRepairSchemaTypesDeep(params, stripUnionDefaults);
        }
      }
      if (total > 0) {
        console.log('✅ [v' + EXT_VERSION + '] Fix 15 (' + (stripUnionDefaults ? 'moonshot-strict mode' : 'full-fidelity mode') + '): repaired ' + total + ' tool-schema propert' + (total === 1 ? 'y' : 'ies') + ' (typeless→string restores; ' + (stripUnionDefaults ? 'dropped conflicting `default` siblings, unions + null arms preserved' : 'unions + advisory defaults passed through verbatim') + '; constraint-conflicted unions flattened).');
        return true;
      }
      return false;
    } catch (e) {
      console.warn('⚠️ [v' + EXT_VERSION + '] tmRepairToolSchemas failed (leaving tools untouched):', e);
      return false;
    }
  }

  // Canonicalize body.tools in place (key-sorted, array order preserved). Returns true if the
  // serialized form actually changed (i.e., TypingMind had emitted non-sorted keys this turn).
  // Applied UNIVERSALLY to all OpenRouter requests (both Claude and OpenAI-family) so the
  // outbound tools block is byte-stable across turns for every model.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmStabilizeToolsOrdering-cyrk,
  //   role=__lambdao_1.tmStabilizeToolsOrdering,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Fix 6A entry point: runs key canonicalization on body.tools for EVERY intercepted JSON request, before any endpoint-specific branch.,
  // ]
  // (v4.243) Strip reasoning.encrypted blocks that were minted by a DIFFERENT model than the one
  // now being targeted. Such blocks are cryptographically sealed to their origin endpoint and can
  // NEVER be replayed elsewhere — OpenRouter 404s with 'encrypted reasoning ... produced under a
  // different model' (seen live: a Grok 4.5 block poisoned a switch to MiniMax M3). reasoning.summary
  // is plain text and is KEPT. We only mutate the OUTBOUND payload; TypingMind's stored history keeps
  // the block, so switching back to the origin model still works (we re-strip each time it's needed).
  function tmStripForeignEncryptedReasoning(body, targetModel) {
    var removed = 0;
    try {
      if (!body || !Array.isArray(body.messages) || !targetModel) return 0;
      var tm = String(targetModel).toLowerCase();
      var tmModel = tm.indexOf('/') !== -1 ? tm.split('/').pop() : tm; // strip provider prefix
      for (var i = 0; i < body.messages.length; i++) {
        var msg = body.messages[i];
        if (!msg || !Array.isArray(msg.reasoning_details)) continue;
        var kept = [];
        for (var j = 0; j < msg.reasoning_details.length; j++) {
          var rd = msg.reasoning_details[j];
          if (!rd || rd.type !== 'reasoning.encrypted') { kept.push(rd); continue; }
          // Derive the origin endpoint slug embedded in the sealed blob (base64 JSON, e.g.
          // {"endpoint_slug":"x-ai/grok-4.5-20260708|xai"}). If the target IS the origin, keep it.
          var keep = false;
          try {
            var data = String(rd.data || '');
            var tail = data.split('.').pop();
            var pad = tail.length % 4; if (pad) tail += new Array(5 - pad).join('=');
            var json = (typeof atob === 'function') ? atob(tail) : '';
            var m = json.match(/"endpoint_slug"\s*:\s*"([^"]+)"/);
            if (m && m[1]) {
              var slug = String(m[1]).toLowerCase().split('|')[0]; // 'x-ai/grok-4.5-20260708'
              var slugModel = slug.indexOf('/') !== -1 ? slug.split('/').pop() : slug;
              if (tmModel === slugModel || tm === slug) keep = true;
            }
          } catch (e) {}
          if (keep) kept.push(rd); else removed++;
        }
        if (kept.length !== msg.reasoning_details.length) {
          if (kept.length) msg.reasoning_details = kept; else delete msg.reasoning_details;
        }
      }
    } catch (e) {}
    if (removed > 0) {
      try { console.log('🧹 [v' + EXT_VERSION + '] Stripped ' + removed + ' foreign reasoning.encrypted block(s) for target model ' + targetModel); } catch (e) {}
    }
    return removed;
  }

  function tmStabilizeToolsOrdering(body) {
    try {
      if (!body || !Array.isArray(body.tools) || body.tools.length === 0) return false;
      var before = JSON.stringify(body.tools);
      var canon = tmCanonicalizeKeysDeep(body.tools);
      var after = JSON.stringify(canon);
      if (after === before) return false; // already canonical this turn; no change needed
      body.tools = canon;
      console.log('\u2705 [v' + EXT_VERSION + '] Canonicalized tools key ordering for stable prompt-cache prefix (' + body.tools.length + ' tools).');
      return true;
    } catch (e) {
      console.warn('\u26a0\ufe0f [v' + EXT_VERSION + '] tmStabilizeToolsOrdering failed (leaving tools untouched):', e);
      return false;
    }
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmStabilizeAnthropicToolUseInputs-ati64,
  //   role=__lambdao_1.tmStabilizeAnthropicToolUseInputs,
  //   slice_labels=tm-payload-overview,tm-payload-cost-visibility,
  //   kind=ast,
  //   comment=v4.264: recursively key-canonicalizes historical assistant tool_use.input objects in Anthropic messages (array order preserved) so TypingMind reserialization cannot invalidate the conversation cache prefix.,
  // ]
  function tmStabilizeAnthropicToolUseInputs(body) {
    try {
      if (!body || !Array.isArray(body.messages)) return 0;
      var changed = 0;
      for (var mi = 0; mi < body.messages.length; mi++) {
        var msg = body.messages[mi];
        if (!msg || msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;
        for (var bi = 0; bi < msg.content.length; bi++) {
          var block = msg.content[bi];
          if (!block || block.type !== 'tool_use' || !block.input || typeof block.input !== 'object') continue;
          var before = JSON.stringify(block.input);
          var canon = tmCanonicalizeKeysDeep(block.input);
          var after = JSON.stringify(canon);
          if (after !== before) {
            block.input = canon;
            changed++;
          }
        }
      }
      if (changed > 0) {
        console.log('\u2705 [v' + EXT_VERSION + '] Canonicalized ' + changed + ' historical Anthropic tool_use.input object(s) for stable message-cache prefixes.');
      }
      return changed;
    } catch (e) {
      console.warn('\u26a0\ufe0f [v' + EXT_VERSION + '] tmStabilizeAnthropicToolUseInputs failed (leaving message inputs untouched):', e);
      return 0;
    }
  }

  // ==================== OPENROUTER STICKY-ROUTING SESSION ID (v4.55) ====================
  // OpenAI-family models (GPT-5.x) on OpenRouter cache AUTOMATICALLY on the OpenAI side,
  // but only if consecutive turns are routed to the SAME upstream provider endpoint.
  // Per OpenRouter docs: WITHOUT a session_id, sticky routing only activates AFTER a cache
  // hit is first observed -- a chicken-and-egg deadlock that can keep cached_tokens AND
  // cache_write_tokens pinned at 0 forever. Passing a stable top-level `session_id`
  // activates sticky routing on the FIRST successful request, breaking the deadlock.
  //
  // session_id is a ROUTING HINT ONLY: it is NOT part of the cache-key hash and does NOT
  // alter the prompt prefix, so it cannot destabilize system_tools_prefix_hash. Max 256 chars.
  //
  // Scope guard: the CALLER only invokes this for non-Claude OpenAI-family models, so Claude
  // (which shares the OpenRouter chat-completions branch) is never touched.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmDeriveStableSessionId-h7sh,
  //   role=__lambdao_1.tmDeriveStableSessionId,
  //   slice_labels=tm-payload-cost-visibility,tm-payload-overview,
  //   kind=ast,
  //   comment=Session identity tier 2: deterministic FNV-1a hash of first-system + first-user message as stable fallback when no pasted Session ID exists. Reads messages[] / input[] AND (v4.250) Gemini's contents[]+systemInstruction via tmNormalizeGeminiBodyToMessages; an empty seed returns null, which disables the session-cost ledger and makes every conversation on that model share one identity key.,
  // ]
  function tmDeriveStableSessionId(body) {
    // 1) Prefer the extension's existing conversation-id derivation when it yields something.
    try {
      var derived = deriveConversationIdFromBody(body);
      if (derived && typeof derived === 'string') {
        return ('tm-' + derived).slice(0, 256);
      }
    } catch (e) {}

    // 2) Fallback: hash the first system message + first user message. These do NOT change as
    //    a conversation grows (new turns append at the end), so the hash is STABLE across all
    //    turns of one conversation and naturally DISTINCT between conversations -- exactly the
    //    per-conversation stickiness OpenRouter wants. Mirrors OpenRouter's own internal
    //    'hash first system + first non-system message' conversation identification.
    try {
      // (v4.250) Gemini-native bodies fall back to the normalizer; without it msgs was [] and the
      // seed was empty, so this returned null for EVERY Gemini turn.
      var msgs = Array.isArray(body && body.messages) ? body.messages
               : (Array.isArray(body && body.input) ? body.input
               : (Array.isArray(body && body.contents) ? tmNormalizeGeminiBodyToMessages(body) : []));

      function firstText(role) {
        for (var i = 0; i < msgs.length; i++) {
          var m = msgs[i];
          if (!m || m.role !== role) continue;
          if (typeof m.content === 'string') return m.content;
          if (Array.isArray(m.content)) {
            var parts = [];
            for (var j = 0; j < m.content.length; j++) {
              var b = m.content[j];
              if (b && (b.type === 'text' || b.type === 'input_text') && typeof b.text === 'string') {
                parts.push(b.text);
              }
            }
            return parts.join(' ');
          }
          return '';
        }
        return '';
      }

      var sysText = firstText('system');
      var userText = firstText('user');
      // Use a bounded slice of each so a huge system prompt doesn't dominate cost of hashing;
      // stability only requires the SAME input each turn, which a fixed-length slice preserves.
      var seed = (sysText.slice(0, 4000)) + '\u0000' + (userText.slice(0, 4000));
      if (seed.replace(/\u0000/g, '').trim() === '') return null; // nothing stable to hash
      return ('tm-or-' + tmFnv1a32(seed)).slice(0, 256);
    } catch (e) {
      return null;
    }
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmEnsureOpenRouterAccountingAndSession-t849,
  //   role=__lambdao_1.tmEnsureOpenRouterAccountingAndSession,
  //   slice_labels=tm-payload-cost-visibility,tm-payload-overview,
  //   kind=ast,
  //   comment=OpenRouter injector: session_id for sticky routing + usage.{include:true} for streaming cost/cache evidence. Called on every OpenRouter path (direct or proxy).,
  // ]
  function tmEnsureOpenRouterAccountingAndSession(body, label, routingIdKey) {
    // (v4.104) Universal OpenRouter injection: session_id for sticky routing + usage.{include:true}
    // for streaming cost/cache tracking. Called on every OpenRouter path (direct or proxy).
    var changed = false;

    if (!body.session_id) {
      var sid = tmDeriveStableSessionId(body);
      if (sid) {
        body.session_id = sid;
        changed = true;
        console.log('✅ [v' + EXT_VERSION + '] ' + (label || 'OpenRouter') + ': injected session_id for sticky routing:', sid);
      } else {
        console.warn('⚠️ [v' + EXT_VERSION + '] ' + (label || 'OpenRouter') + ': could not derive a stable session_id; sticky routing not set.');
      }
    }

    if (!body.usage || !body.usage.include) {
      body.usage = { include: true };
      changed = true;
      console.log('✅ [v' + EXT_VERSION + '] ' + (label || 'OpenRouter') + ': injected usage.{include:true} for streaming cost/cache tracking');
    }

    // (Fix 16, v4.200) GENERIC provider routing. Replaces the hardcoded Fix 13 Kimi block.
    // Works for any multi-provider model. Checks the lock store; injects order/ignore/allow_fallbacks
    // accordingly. No-op for single-provider models (Claude, GPT, etc.).
    // (v4.201) routingIdKey comes from tmComputeRoutingIdentityKey at the call site (has url+options).
    if (tmApplyProviderRouting(body, label, routingIdKey)) {
      changed = true;
    }

    return changed;
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.repairOpenAIOrphanedToolCalls-la0a,
  //   role=__lambdao_1.repairOpenAIOrphanedToolCalls,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Drops or satisfies orphaned tool_calls lacking their tool responses (OpenAI-path crash prevention).,
  // ]
  function repairOpenAIOrphanedToolCalls(body) {
    if (!body || !Array.isArray(body.input)) return 0;

    let changed = 0;
    const messages = body.input;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (!msg || msg.role !== 'assistant') continue;

      // Check if this message has function_call content
      let hasFunctionCall = false;
      if (Array.isArray(msg.content)) {
        hasFunctionCall = msg.content.some(block => block && block.type === 'function_call');
      }

      if (!hasFunctionCall) continue;

      // Check if there's an output_text block in the same message
      const hasOutputText = Array.isArray(msg.content) &&
        msg.content.some(block => block && block.type === 'output_text');

      if (hasOutputText) continue; // Already has output_text, no repair needed

      // Need to inject a dummy output_text block before the function_call(s)
      if (Array.isArray(msg.content)) {
        // Find position of first function_call
        const firstToolIdx = msg.content.findIndex(block => block && block.type === 'function_call');
        if (firstToolIdx >= 0) {
          // Insert dummy output_text before first function_call
          msg.content.splice(firstToolIdx, 0, {
            type: 'output_text',
            text: 'ACK'
          });
          console.log(
            `🩹 [v${EXT_VERSION}] Repaired orphaned tool call in message ${i}: inserted dummy output_text before function_call`
          );
          changed++;
        }
      }
    }

    return changed;
  }

  // Read a single request header value from either a Headers instance or a plain object / array-of-pairs.
  function tmReadRequestHeader(options, name) {
    try {
      const h = options && options.headers;
      if (!h) return null;
      const want = String(name).toLowerCase();
      if (typeof h.get === 'function') {
        return h.get(name) || h.get(want) || null;
      }
      for (const k in h) {
        if (Object.prototype.hasOwnProperty.call(h, k) && String(k).toLowerCase() === want) {
          return h[k];
        }
      }
    } catch (e) {}
    return null;
  }

  // ==================== SOL PRO USAGE GUARD (v4.158) ====================
  // Sol Pro (gpt-5.6-sol-pro, etc.) bills hidden server-side reasoning tokens AS THOUGH
  // they are prompt input tokens — inflating the reported prompt_tokens to 1M+ per turn.
  // TypingMind's context-manager reads that value and triggers automatic summarization,
  // destroying the session every time Sol Pro responds. This guard rewrites the SSE usage
  // event BEFORE TypingMind sees it: prompt_tokens are capped at 25,000 and total_tokens
  // are adjusted to {capped_prompt + completion_tokens}. The original event is preserved
  // in the clone that tmCaptureResponse reads, so cost accounting stays correct.

  function tmIsSolProModel(model) {
    // Matches 'gpt-5.6-sol-pro', 'gpt-5.7-sol-pro', etc. but NOT plain 'sol'.
    if (!model) return false;
    var m = String(model).toLowerCase();
    return (/sol-pro/).test(m);
  }

  // v4.161: Detects plain Sol (not Sol Pro). Matches 'sol' as a model-name segment.
  function tmIsPlainSolModel(model) {
    if (!model) return false;
    var m = String(model).toLowerCase();
    if (tmIsSolProModel(m)) return false;
    // Recognize 'sol' as a distinct segment delimited by /, -, _, or string boundaries.
    return /(?:^|[\/_-])sol(?:$|[\/_-])/.test(m);
  }

  // ==================== KIMI PROVIDER PINNING (Fix 13, v4.197) ====================
  // OpenRouter serves Kimi K3 from 8+ providers with WILDLY different prompt-cache hit
  // rates (Moonshot ~92%, Fireworks ~82%, Together ~79%, Modal ~76% ... but Baseten ~41%,
  // Nebius 0.0%). Post open-weights release, the load balancer began landing long-idle
  // sessions on non-caching providers (Baseten confirmed live), producing full-price
  // misses on EVERY turn (~$1.50/turn at ~500K ctx). Setting provider.order DISABLES
  // OpenRouter load balancing and pins to the high-cache providers in preference order;
  // provider.ignore is a hard floor so a fallback can never land on a 0%/coin-flip host.
  // Scoped to Kimi/Moonshot models only — other models have different good-provider sets.
  function tmIsKimiModel(model) {
    if (!model) return false;
    var m = String(model).toLowerCase();
    return m.startsWith('moonshotai/') || m.includes('kimi') || m.includes('moonshot');
  }

  // ==================== GENERIC PROVIDER ROUTING (Fix 16, v4.200) ====================
  // Replaces the hardcoded Kimi-only Fix 13 block. Works for ANY multi-provider model.
  // Three modes, driven by the lock store:
  //   LOCKED  (manual or auto-stamped): order:[slug], allow_fallbacks:false -- hard-pin, same
  //           provider every turn. Cache works. A provider failure hard-fails (visible, free)
  //           instead of silently bouncing to a $0.65 miss. The human switches manually.
  //   AUTO    (no lock, multi-provider model): order = seed preference list, allow_fallbacks:true.
  //           First successful response auto-stamps a lock in tmCaptureResponse.
  //   FLOAT   (no lock, lock cleared): inject nothing at all -- OpenRouter load-balances freely.
  //           Escape hatch for when you want the old pre-Fix-16 behavior.
  // Non-multi-provider models (Claude, GPT, single-endpoint): always no-op.
  //
  // (v4.201 AUDIT FIX) Compute the routing identity key at REQUEST time, mirroring EXACTLY how
  // tmCaptureResponse builds it at RESPONSE time: sid::RAWmodel::host::proxy|direct, with host
  // from tmExtractEndpointHost(url+headers) and proxy from tmIsProxyCapture. GLM's v4.200 built
  // the request-side key with host='' (-> 'unknown') while the stamp used 'openrouter.ai', so
  // the stamped lock was INVISIBLE to the injector and AUTO mode never engaged the lock.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmComputeRoutingIdentityKey-l4ml,
  //   role=__lambdao_1.tmComputeRoutingIdentityKey,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=v4.201: THE shared request-time routing identity-key builder (sid::model::host::proxy) so auto-stamped locks are always findable later.,
  // ]
  function tmComputeRoutingIdentityKey(body, url, options) {
    try {
      if (!body || !body.model) return null;
      var model = String(body.model); // RAW model -- byte-for-byte identical to the capture-side key
      var sid = body.session_id || tmDeriveStableSessionId(body) || '';
      var hdrs = {};
      try { hdrs = tmNormalizeHeaders(options && options.headers); } catch (e) {}
      var capLike = { url: url, headers: hdrs };
      var host = '';
      try { host = tmExtractEndpointHost(capLike); } catch (e) {}
      var isProxy = false;
      try { isProxy = tmIsProxyCapture(capLike); } catch (e) {}
      return tmBuildIdentityKey(sid, model, host, isProxy);
    } catch (e) { return null; }
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmApplyProviderRouting-41e2,
  //   role=__lambdao_1.tmApplyProviderRouting,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Fix 16/18 injector: applies the identity's LOCKED order/ignore, SET provider.only, or AUTO seed preference (first success auto-stamps a lock); auto-locks from model→provider map when no lock exists and the session is new (v4.226).,
  // ]
  function tmApplyProviderRouting(body, label, idKeyOverride) {
    if (!body || !body.model) return false;
    var model = String(body.model).toLowerCase().replace(/:(nitro|floor|free)$/i, '');
    if (!tmIsMultiProviderModel(model)) return false;

    // The identity key MUST come from the shared request-time builder (or be passed in from a
    // call site that has url+options). Never reconstruct ad hoc -- that was BUG A.
    var idKey = idKeyOverride || tmComputeRoutingIdentityKey(body, null, null) || '';
    if (!idKey) return false;
    var lock = tmGetProviderLock(idKey);
    // (v4.226) Auto-lock from model→provider map: when NO lock exists for this identity,
    // check if this is a NEW session (not yet in tm_session_costs_v2). If so, look up the
    // model in the model→provider map and auto-lock the mapped provider.
    if (!lock) {
      var autoLockResult = tmMaybeAutoLockFromModelMap(body, idKey);
      if (autoLockResult) lock = autoLockResult;
    }
    var seed = tmGetProviderEntries(model);
    var changed = false;

    // FLOAT mode: the user explicitly chose Float. Inject nothing at all.
    if (lock && lock.slug === '__float') {
      return false;
    }

    // (Fix 18, v4.204) SET mode: lock.mode==='set' with slugs[]. Inject provider.only=[slugs] so
    // OpenRouter can ONLY route within the curated set -- NO order (let it smart-balance within
    // the set, which routes around hot pools and reduces 429s), allow_fallbacks:true (within set).
    // Each set member keeps its own prompt cache warm across interleaved turns (observed live:
    // Fireworks cached back several turns despite Together turns in between). And when a 429 does
    // slip through, the v4.203 backoff retry absorbs it inside the set.
    if (lock && lock.mode === 'set' && Array.isArray(lock.slugs) && lock.slugs.length) {
      if (!body.provider || typeof body.provider !== 'object') body.provider = {};
      body.provider.only = lock.slugs.slice();
      delete body.provider.order;
      delete body.provider.ignore;
      body.provider.allow_fallbacks = true;
      console.log('🎯 [v' + EXT_VERSION + '] ' + (label || 'OpenRouter') + ': provider SET [' + lock.slugs.join(', ') + '] for ' + model + ' (smart-balance within set)');
      return true;
    }

    if (lock && lock.slug && lock.slug !== '__float') {
      // LOCKED: hard-pin to the locked provider. allow_fallbacks:false = visible hard-fail, not
      // a silent bounce. This is the whole point: you NEVER get a surprise $0.65 miss.
      if (!body.provider || typeof body.provider !== 'object') body.provider = {};
      body.provider.order = [lock.slug];
      body.provider.allow_fallbacks = false;
      // Remove any stale ignore/only list -- we are pinning to exactly one provider.
      delete body.provider.ignore;
      delete body.provider.only;
      changed = true;
      console.log('🔒 [v' + EXT_VERSION + '] ' + (label || 'OpenRouter') + ': provider LOCKED to ' + lock.label + ' (' + lock.slug + ') for ' + model);
    } else {
      // AUTO: no lock. Inject preference order from seed (good providers first, toxic ignored).
      // allow_fallbacks:true so the FIRST turn can't spuriously fail -- it needs to succeed to
      // stamp the lock. Once stamped, subsequent turns switch to the hard-pin above.
      var goodOrder = [];
      var ignoreList = [];
      for (var i = 0; i < seed.length; i++) {
        if (seed[i].toxic) { ignoreList.push(seed[i].slug); }
        else { goodOrder.push(seed[i].slug); }
      }
      if (goodOrder.length > 0) {
        if (!body.provider || typeof body.provider !== 'object') body.provider = {};
        if (!Array.isArray(body.provider.order) || body.provider.order.length === 0) {
          body.provider.order = goodOrder;
          changed = true;
        }
        if (ignoreList.length > 0 && (!Array.isArray(body.provider.ignore) || body.provider.ignore.length === 0)) {
          body.provider.ignore = ignoreList;
          changed = true;
        }
        if (typeof body.provider.allow_fallbacks !== 'boolean') {
          body.provider.allow_fallbacks = true;
          changed = true;
        }
        if (changed) {
          console.log('🌊 [v' + EXT_VERSION + '] ' + (label || 'OpenRouter') + ': provider AUTO (no lock yet) for ' + model + ' ->', JSON.stringify(body.provider));
        }
      }
    }
    return changed;
  }

  // v4.161: Ensure plain-Sol requests carry reasoning.effort = 'high' at the top level.
  // Mutates body in place. Returns true if anything was changed.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmEnsurePlainSolReasoningHigh-z80e,
  //   role=__lambdao_1.tmEnsurePlainSolReasoningHigh,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=v4.161/4.162: plain-Sol requests carry reasoning.effort=high + summary=auto (restores streaming thinking).,
  // ]
  function tmEnsurePlainSolReasoningHigh(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
    if (!tmIsPlainSolModel(body.model)) return false;
    var changed = false;
    var level = tmGetSolReasoningEffort();
    // v4.162: always inject summary:auto alongside the effort level (restores streaming thinking).
    // v4.257: also pin context:'all_turns' (GPT-5.6's persisted-reasoning context mode). Default
    // is already all_turns on the direct/OpenRouter Responses paths, so pinning is a no-op there;
    // this matters only on any residual config where it might have defaulted to current_turn.
    if (!body.reasoning || typeof body.reasoning !== 'object' || Array.isArray(body.reasoning)) {
      body.reasoning = { effort: level, summary: 'auto', context: 'all_turns' };
      changed = true;
    } else {
      if (body.reasoning.effort !== level) {
        body.reasoning.effort = level;
        changed = true;
      }
      if (body.reasoning.summary !== 'auto') {
        body.reasoning.summary = 'auto';
        changed = true;
      }
      if (body.reasoning.context !== 'all_turns') {
        body.reasoning.context = 'all_turns';
        changed = true;
      }
    }
    if (changed) {
      console.log('✅ [v' + EXT_VERSION + '] Injected reasoning.effort=' + level + ' + summary=auto + context=all_turns for plain Sol model:', body.model);
    }
    return changed;
  }

  // Mutates usage in place. Returns true if anything was changed.
  function tmRewriteSolProUsage(usage, completionTokens, logPrefix) {
    if (!usage || typeof usage !== 'object') return false;
    var origPrompt = Number(usage.prompt_tokens);
    var origTotal = Number(usage.total_tokens);
    var compToks = (typeof completionTokens === 'number' && completionTokens >= 0)
      ? completionTokens
      : (Number(usage.completion_tokens) || 0);
    if (!(origPrompt > 25000)) return false;
    usage.prompt_tokens = 25000;
    usage.total_tokens = 25000 + compToks;
    if (logPrefix) {
      console.log(logPrefix + ': prompt_tokens ' + origPrompt + ' → 25000; total_tokens ' + origTotal + ' → ' + usage.total_tokens);
    }
    return true;
  }

  // Returns a TransformStream that rewrites SSE data: lines carrying usage.prompt_tokens
  // get prompt_tokens / total_tokens capped when the response model also identifies Sol Pro.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmCreateSolProUsageTransform-a9mp,
  //   role=__lambdao_1.tmCreateSolProUsageTransform,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=SSE TransformStream that rewrites Sol Pro usage fields on the fly.,
  // ]
  function tmCreateSolProUsageTransform() {
    var decoder = new TextDecoder('utf-8', { fatal: false });
    var encoder = new TextEncoder();
    var partial = '';
    var hadDecodeError = false;

    return new TransformStream({
      transform: function(chunk, controller) {
        // Decode the raw chunk. If decoding itself fails, reset buffered state and
        // emit the raw bytes so we don't duplicate text that is already in `partial`.
        var text;
        try {
          text = decoder.decode(chunk, { stream: true });
        } catch (decodeErr) {
          // Decoding failed — flush whatever we had and pass the raw chunk through.
          if (partial) {
            try { controller.enqueue(encoder.encode(partial)); } catch (e) {}
            partial = '';
          }
          hadDecodeError = true;
          controller.enqueue(chunk);
          return;
        }
        partial += text;
        // Emit complete lines; keep partial final line for the next chunk.
        var lines = partial.split('\n');
        partial = lines.pop(); // may be '' if the chunk ended with a newline
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          if (line.indexOf('"prompt_tokens"') >= 0 && (/"usage"/).test(line)) {
            try {
              var dataPrefix = '';
              var jsonStr = line;
              var m = line.match(/^(data:\s*)(.*)/);
              if (m) { dataPrefix = m[1]; jsonStr = m[2]; }
              if (jsonStr !== '[DONE]') {
                var obj = JSON.parse(jsonStr);
                // v4.160: trust the request-level gate (shouldSanitizeSolProUsage);
                // do NOT re-check respModel — usage chunks may omit the model field.
                if (obj.usage) {
                  var before = line;
                  tmRewriteSolProUsage(obj.usage, null, '🛡️ [Sol Pro guard]');
                  line = dataPrefix + JSON.stringify(obj);
                  if (line !== before) {
                    console.log('🛡️ [v' + EXT_VERSION + '] Sol Pro usage guard: transformed SSE usage line.');
                  }
                }
              }
            } catch (parseErr) {
              // Not valid JSON on this line — pass through unchanged (safe fallback).
            }
          }
          try {
            controller.enqueue(encoder.encode(line + '\n'));
          } catch (enqueueErr) {
            // Stream may be closed — stop emitting.
          }
        }
      },
      flush: function(controller) {
        try {
          // v4.159: drain any trailing bytes still held by the streaming decoder.
          if (!hadDecodeError) {
            try { partial += decoder.decode(); } catch (e) {}
          }
          if (partial) {
            controller.enqueue(encoder.encode(partial));
          }
        } catch (flushErr) {
          // Swallow.
        }
        decoder = null;
        encoder = null;
      }
    });
  }

  // Wrap a Response with a transformed body (Sol Pro usage guard).
  // Falls back to the original response if the body stream is unavailable.
  // @beacon[
  //   id=auto-beacon@__lambdao_1.tmWrapSolProResponse-5r8s,
  //   role=__lambdao_1.tmWrapSolProResponse,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Wraps a Response with the Sol Pro usage transform via pipeThrough (content-length deleted; falls back to the original on lock failures).,
  // ]
  function tmWrapSolProResponse(response) {
    // Validate that the response body is pipeable BEFORE we lock it.
    try {
      if (!response || !response.body || typeof response.body.pipeThrough !== 'function') {
        console.warn('⚠️ [v' + EXT_VERSION + '] Sol Pro guard: response body not pipeable — returning original.');
        return response;
      }
      var headers = new Headers(response.headers);
      headers.delete('content-length');
      var transformed = response.body.pipeThrough(tmCreateSolProUsageTransform());
      return new Response(transformed, {
        status: response.status,
        statusText: response.statusText,
        headers: headers
      });
    } catch (e) {
      // v4.159: if we get here AFTER pipeThrough, the original body is already locked.
      // We cannot safely return it. Log and rethrow so the caller can handle the broken pipe.
      console.warn('⚠️ [v' + EXT_VERSION + '] Sol Pro guard: failed to wrap response. Original body may be locked.', e);
      return response;
    }
  }

  // Kimi/Moonshot tool-call IDs are opaque correlation keys. `tool_calls[].index` is only
  // response-local and may legitimately restart at 0 every turn; the `id` must not collide with
  // any historical call carried in the next request. These small helpers collect the exact
  // outbound-history set and mint an Anthropic-safe / OpenAI-safe replacement when needed.
  function tmIsKimiToolIdGuardModel(model) {
    return /kimi|moonshot/i.test(String(model || ''));
  }

  function tmCollectChatCompletionToolIds(body) {
    var ids = new Set();
    if (!body || !Array.isArray(body.messages)) return ids;
    for (var mi = 0; mi < body.messages.length; mi++) {
      var msg = body.messages[mi];
      if (!msg) continue;

      // Collect BOTH halves of the normalized OpenAI correlation pair. A history conversion or
      // context-prune can retain the tool response even when its assistant tool_calls container is
      // absent; that surviving tool_call_id must still reserve the ID against reuse.
      if (msg.tool_call_id != null && String(msg.tool_call_id)) {
        ids.add(String(msg.tool_call_id));
      }

      if (!Array.isArray(msg.tool_calls)) continue;
      for (var ti = 0; ti < msg.tool_calls.length; ti++) {
        var tc = msg.tool_calls[ti];
        if (!tc || tc.id == null) continue;
        var id = String(tc.id);
        if (id) ids.add(id);
      }
    }
    return ids;
  }

  function tmFreshKimiToolCallId(occupied) {
    var token = '';
    try {
      if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') {
        token = crypto.randomUUID().replace(/-/g, '');
      }
    } catch (e) {}
    if (!token) {
      token = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) + '_' + Math.random().toString(36).slice(2);
    }
    var candidate = 'call_tm_' + token.replace(/[^a-zA-Z0-9_-]/g, '');
    while (occupied.has(candidate)) {
      candidate += '_' + Math.random().toString(36).slice(2, 8);
    }
    return candidate;
  }

  // Event-source one Kimi ID repair into the EXISTING capture row and the live widget state.
  // The ring itself is already localStorage-backed, so no parallel store/schema is needed.
  // @beacon[
  //   id=tm-payload@kimi-tool-id-repair-visibility,
  //   slice_labels=tm-payload-overview,tm-payload-cost-visibility,
  //   kind=ast,
  //   comment=Event-sources each dynamic Kimi tool-call-ID replacement onto the existing capture row and current widget status, then asynchronously repaints the persistent widget and any open ring modal.,
  // ]
  function tmRecordKimiToolIdRepair(captureId, detail) {
    var priorCount = 0;
    try {
      var prior = captureId ? getCaptureById(captureId) : null;
      priorCount = Number(prior && prior._tool_id_repair_count || 0);
    } catch (e) {}
    var nextCount = priorCount + 1;
    var stamp = {
      from: detail && detail.from != null ? String(detail.from) : '',
      to: detail && detail.to != null ? String(detail.to) : '',
      choice_index: detail && detail.choiceIndex != null ? String(detail.choiceIndex) : '',
      model: detail && detail.model != null ? String(detail.model) : '',
      ts: Date.now()
    };

    if (captureId) {
      try {
        tmUpdateCaptureRecord(captureId, {
          _tool_id_repair_count: nextCount,
          _tool_id_repair_last: stamp
        });
      } catch (e) {}
    }

    // Immediate current-turn signal. tmCaptureResponse also rebuilds these fields from the
    // capture record at stream completion, so either clone/consumer branch winning the race
    // converges on the same event-sourced count.
    try {
      tmMostRecentPayloadStatus = tmMostRecentPayloadStatus || {};
      tmMostRecentPayloadStatus.captureId = captureId || null;
      tmMostRecentPayloadStatus.toolIdRepairCount = nextCount;
      tmMostRecentPayloadStatus.toolIdRepairLast = stamp;
    } catch (e) {}

    // Paint outside the TransformStream callback so UI work never delays token delivery.
    try {
      setTimeout(function() {
        try { renderGpt51UsageWidget(); } catch (e) {}
        try {
          if (payloadCaptureModalInnerEl && payloadCaptureModalInnerEl.isConnected) {
            renderPayloadCaptureModal();
          }
        } catch (e) {}
      }, 0);
    } catch (e) {}
  }

  // @beacon[
  //   id=tm-payload@kimi-tool-id-guard,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Dynamic Kimi response-boundary guard: preserves healthy unique tool-call IDs but replaces missing/history-duplicate/current-response-duplicate IDs before TypingMind persists them; SSE fragments and parallel calls stay paired by choice+local-index.,
  // ]
  function tmWrapKimiToolIdResponse(response, historicalIds, modelLabel, onRepair) {
    if (!response || !response.body) return response;

    var occupied = new Set();
    try {
      if (historicalIds && typeof historicalIds.forEach === 'function') {
        historicalIds.forEach(function(id) {
          if (id != null && String(id)) occupied.add(String(id));
        });
      }
    } catch (e) {}

    // One fetch response == one assistant turn. Streaming deltas identify parallel calls by their
    // response-local index; once an index is assigned a canonical ID, every later fragment reuses it.
    var responseIdsByIndex = new Map();

    function rewriteToolCallList(toolCalls, choiceKey) {
      if (!Array.isArray(toolCalls)) return false;
      var changed = false;
      for (var ti = 0; ti < toolCalls.length; ti++) {
        var tc = toolCalls[ti];
        if (!tc || typeof tc !== 'object') continue;
        var localIndex = (tc.index != null) ? tc.index : ti;
        var mapKey = String(choiceKey) + ':' + String(localIndex);

        if (responseIdsByIndex.has(mapKey)) {
          // Later streamed fragments normally omit id. If a provider repeats/changes it, force the
          // already-chosen canonical value so TypingMind never sees two identities for one call.
          if (tc.id != null && String(tc.id) !== responseIdsByIndex.get(mapKey)) {
            tc.id = responseIdsByIndex.get(mapKey);
            changed = true;
          }
          continue;
        }

        var providerId = (tc.id == null) ? '' : String(tc.id);
        var duplicateOrMissing = !providerId || occupied.has(providerId);
        var canonicalId = duplicateOrMissing ? tmFreshKimiToolCallId(occupied) : providerId;
        responseIdsByIndex.set(mapKey, canonicalId);
        occupied.add(canonicalId);

        if (providerId !== canonicalId) {
          tc.id = canonicalId;
          changed = true;
          console.error(
            '🚨 [v' + EXT_VERSION + '] Kimi tool-call id repaired BEFORE TypingMind persistence: ' +
            (providerId || '<missing>') + ' -> ' + canonicalId +
            ' (model=' + String(modelLabel || 'kimi') + ', choice/index=' + mapKey + ')'
          );
          try {
            if (typeof onRepair === 'function') {
              onRepair({
                from: providerId || '<missing>',
                to: canonicalId,
                choiceIndex: mapKey,
                model: String(modelLabel || 'kimi')
              });
            }
          } catch (e) {}
        }
      }
      return changed;
    }

    function rewriteResponseObject(obj) {
      if (!obj || typeof obj !== 'object') return false;
      var changed = false;
      if (Array.isArray(obj.choices)) {
        for (var ci = 0; ci < obj.choices.length; ci++) {
          var choice = obj.choices[ci];
          if (!choice || typeof choice !== 'object') continue;
          var choiceKey = (choice.index != null) ? choice.index : ci;
          if (choice.delta && rewriteToolCallList(choice.delta.tool_calls, choiceKey)) changed = true;
          if (choice.message && rewriteToolCallList(choice.message.tool_calls, choiceKey)) changed = true;
        }
      }
      // Defensive compatibility for adapters that return tool_calls at the response root.
      if (rewriteToolCallList(obj.tool_calls, 'root')) changed = true;
      return changed;
    }

    var contentType = '';
    try { contentType = String(response.headers.get('content-type') || '').toLowerCase(); } catch (e) {}

    if (contentType.indexOf('text/event-stream') !== -1 &&
        typeof TransformStream !== 'undefined' &&
        typeof TextDecoder !== 'undefined' &&
        typeof TextEncoder !== 'undefined' &&
        response.body && typeof response.body.pipeThrough === 'function') {
      var decoder = new TextDecoder();
      var encoder = new TextEncoder();
      var carry = '';

      function rewriteSseLine(line) {
        var ending = '';
        var bare = line;
        if (bare.slice(-2) === '\r\n') {
          ending = '\r\n';
          bare = bare.slice(0, -2);
        } else if (bare.slice(-1) === '\n') {
          ending = '\n';
          bare = bare.slice(0, -1);
        }
        var match = bare.match(/^(\s*data:\s*)(.*)$/);
        if (!match || !match[2] || match[2].trim() === '[DONE]') return line;
        try {
          var parsed = JSON.parse(match[2]);
          if (!rewriteResponseObject(parsed)) return line; // healthy line stays byte-identical
          return match[1] + JSON.stringify(parsed) + ending;
        } catch (e) {
          return line;
        }
      }

      var transform = new TransformStream({
        transform: function(chunk, controller) {
          carry += decoder.decode(chunk, { stream: true });
          var newlineAt;
          while ((newlineAt = carry.indexOf('\n')) !== -1) {
            var line = carry.slice(0, newlineAt + 1);
            carry = carry.slice(newlineAt + 1);
            controller.enqueue(encoder.encode(rewriteSseLine(line)));
          }
        },
        flush: function(controller) {
          carry += decoder.decode();
          if (carry) controller.enqueue(encoder.encode(rewriteSseLine(carry)));
        }
      });

      try {
        var headers = new Headers(response.headers);
        headers.delete('content-length');
        var transformedBody = response.body.pipeThrough(transform);
        return new Response(transformedBody, {
          status: response.status,
          statusText: response.statusText,
          headers: headers
        });
      } catch (e) {
        console.warn('⚠️ [v' + EXT_VERSION + '] Kimi tool-id SSE guard could not wrap response:', e);
        return response;
      }
    }

    // Non-streaming OpenAI-compatible response. Consume only a CLONE; if there is no repair (or
    // parsing fails), return the untouched original response.
    var clone;
    try { clone = response.clone(); } catch (e) { return response; }
    return clone.text().then(function(text) {
      try {
        var parsed = JSON.parse(text);
        if (!rewriteResponseObject(parsed)) return response;
        var headers = new Headers(response.headers);
        headers.delete('content-length');
        return new Response(JSON.stringify(parsed), {
          status: response.status,
          statusText: response.statusText,
          headers: headers
        });
      } catch (e) {
        return response;
      }
    }).catch(function() { return response; });
  }

  // @beacon[
  //   id=auto-beacon@__lambdao_1.originalFetch@1-rkgc,
  //   role=__lambdao_1.originalFetch@1,
  //   slice_labels=tm-payload-overview,
  //   kind=ast,
  //   comment=Anchors the central window.fetch override (immediately below): passthrough guard -> universal repairs -> per-protocol branches -> capture -> response handling. Every request flows through here.,
  // ]
  const originalFetch = window.fetch;

  window.fetch = function(...args) {
    const [url, options = {}] = args;
    let convIdForThisCall = null;
    let vendorForThisCall = null;
    let repairTallyForThisCall = null;
    let oversizedGuardReportForThisCall = null;
    let continuitySessionIdForThisCall = null;

    // ==================== PASSTHROUGH GUARD (cooperate with sibling extensions) ====================
    // Some of Dan's OTHER extensions (e.g. the Whisper Transcription widget's "✨ Refine" feature)
    // make their OWN direct calls to api.anthropic.com / openrouter.ai that are NOT TypingMind
    // conversation payloads. This interceptor's repairs + prompt-caching header injection + payload
    // capture are meant ONLY for TypingMind's conversation traffic; applying them to a sibling
    // extension's request corrupts it (broke Refine with a CORS/network error). Any such request
    // opts OUT via a STATELESS URL SENTINEL  tm_passthrough=1  in the request URL, OR the legacy
    // marker header  x-tm-passthrough: 1 . When either is present we call the ORIGINAL fetch verbatim:
    // no body parse, no repairs, no header changes, no capture.
    // NOTE: the URL-sentinel path is PREFERRED for two reasons: (1) a custom request HEADER trips
    // OpenRouter's CORS preflight (the header must be in Access-Control-Allow-Headers, which OpenRouter
    // does not grant), whereas a query param does not; and (2) the marker rides on the request itself,
    // so — unlike a shared global flag — it is immune to races across parallel streaming sessions. The
    // header check is retained only as a harmless fallback.
    try {
      if (typeof url === 'string' && url.indexOf('tm_passthrough=1') !== -1) {
        return originalFetch.apply(this, args);
      }
      const h = options && options.headers;
      let passthrough = false;
      if (h) {
        if (typeof h.get === 'function') {
          // Headers instance
          passthrough = !!(h.get('x-tm-passthrough') || h.get('X-TM-Passthrough'));
        } else if (typeof h === 'object') {
          // plain object / array-of-pairs
          for (const k in h) {
            if (Object.prototype.hasOwnProperty.call(h, k) && String(k).toLowerCase() === 'x-tm-passthrough') {
              if (h[k]) { passthrough = true; }
              break;
            }
          }
        }
      }
      if (passthrough) {
        return originalFetch.apply(this, args);
      }
    } catch (e) {
      // If anything goes wrong detecting the marker, fall through to normal handling (fail-safe).
    }

    // ==================== GLOBAL MALFORMED-JSON SANITIZER (v4.102) ====================
    // Must happen before any JSON.parse in universal canonicalization or endpoint branches.
    try {
      if (options && typeof options.body === 'string') {
        const beforeSanitize = options.body;
        const afterSanitize = tmSanitizeMalformedEmptyNoteValues(beforeSanitize, String(url || 'request'));
        if (afterSanitize !== beforeSanitize) options.body = afterSanitize;
      }
    } catch (e) {}

    // ==================== UNIVERSAL OUTBOUND INJECTION (v4.84 tools + v4.161 Sol reasoning) ====================
    // Run the proven v4.58 OpenRouter fix for EVERY endpoint, before endpoint-specific branches.
    // This is semantic-preserving: object keys are recursively sorted; array order is NEVER changed.
    // It prevents TypingMind's nondeterministic tool-schema key ordering from busting exact-prefix
    // prompt caches on providers beyond OpenRouter (notably DeepInfra GLM-5.2).
    // v4.161: Also injects reasoning.effort=high for plain Sol (not Sol Pro) on this same parse pass.
    try {
      if (options && typeof options.body === 'string') {
        var tmUniversalBody = JSON.parse(options.body);
        var tmUniversalChanged = false;
        // (Fix 15, v4.199) Repair typeless tool-schema properties BEFORE canonicalization, so the
        // key-sort then runs over the completed schema and the cache-stable ordering still holds.
        // Universal (every endpoint) since a naked schema is a portability bug, not OpenRouter-only.
        // (v4.254) The union+default strip inside is GATED to Moonshot-bound requests only; every
        // other target now gets full-fidelity schemas (unions + advisory defaults untouched).
        if (tmRepairToolSchemas(tmUniversalBody, tmIsMoonshotBoundRequest(url, tmUniversalBody))) {
          tmUniversalChanged = true;
        }
        if (tmStabilizeToolsOrdering(tmUniversalBody)) {
          tmUniversalChanged = true;
        }
        if (tmEnsurePlainSolReasoningHigh(tmUniversalBody)) {
          tmUniversalChanged = true;
        }
        if (tmUniversalChanged) {
          options.body = JSON.stringify(tmUniversalBody);
          console.log('✅ [v' + EXT_VERSION + '] Universal outbound pass: tools canonicalized and/or Sol reasoning injected before endpoint-specific handling.');
        }
      }
    } catch (e) {
      // Non-JSON bodies or parse failures are ignored here; endpoint branches retain their own handling.
    }

    // ==================== ANTHROPIC BRANCH ====================
    if (url.includes('api.anthropic.com')) {
      vendorForThisCall = 'anthropic';
      try {
        if (options.body) {
          const body = JSON.parse(options.body);
          let modified = false;
          const tally = { family: 'anthropic', toolResultName: 0, historicToolInputs: 0, emptyMessageContent: 0, missingToolResults: 0, orphanedToolCalls: 0 };

          // Capture latest Anthropic body for export tooling (deep clone)
          try {
            lastAnthropicBodyForExport = JSON.parse(JSON.stringify(body));
          } catch (e) {
            lastAnthropicBodyForExport = null;
            console.warn('⚠️ [v' + EXT_VERSION + '] Failed to clone Anthropic body for export:', e);
          }

          const debugTrigger = checkForDebugTrigger(body);
          if (debugTrigger) {
            console.log('🔎 [DEBUG] Trigger detected:', debugTrigger);
            if (debugTrigger.command === 'compare-tools') {
              analyzeToolComparison(body, debugTrigger.fileId);
              console.log('🎯 [DEBUG] compare-tools analysis complete');
            }
          }

          options.headers = options.headers || {};
          const currentBeta = options.headers['anthropic-beta'] || '';
          if (!currentBeta.includes('prompt-caching-2024-07-31')) {
            if (currentBeta) {
              options.headers['anthropic-beta'] = currentBeta + ',prompt-caching-2024-07-31';
              console.log('✅ [v3.0] Appended prompt-caching-2024-07-31 to beta header:', currentBeta);
            } else {
              options.headers['anthropic-beta'] = 'prompt-caching-2024-07-31';
              console.log('✅ [v3.0] Set prompt-caching-2024-07-31 beta header (was empty)');
            }
            console.log('📤 [v3.0] Final header:', options.headers['anthropic-beta']);
            modified = true;
          }

          if (body.messages) {
            body.messages.forEach((msg, msgIdx) => {
              if (msg.content && Array.isArray(msg.content)) {
                msg.content.forEach((block, blockIdx) => {
                  if (block.type === 'tool_result' && block.content && Array.isArray(block.content)) {
                    block.content.forEach((resultContent, contentIdx) => {
                      if (resultContent.type === 'text' && resultContent.name !== undefined) {
                        console.log(`🔧 [v3.0] Removing "name":"${resultContent.name}" from tool_result (msg ${msgIdx}, block ${blockIdx}, content ${contentIdx})`);
                        delete resultContent.name;
                        tally.toolResultName++;
                        modified = true;
                      }
                    });
                  }
                });
              }
            });
          }

          var directToolIdSanitized = repairAnthropicToolUseIds(body) || 0;
          if (directToolIdSanitized) modified = true;
          tally.historicToolInputs  = repairHistoricAnthropicToolInputs(body) || 0;
          if (tally.historicToolInputs) modified = true;
          var directToolInputOrderStabilized = tmStabilizeAnthropicToolUseInputs(body) || 0;
          if (directToolInputOrderStabilized) modified = true;
          tally.emptyMessageContent = repairAnthropicEmptyMessageContent(body) || 0;
          if (tally.emptyMessageContent) modified = true;
          // 🩹 FIX: Inject missing tool_result blocks (v4.28)
          tally.missingToolResults  = repairAnthropicMissingToolResults(body) || 0;
          if (tally.missingToolResults) modified = true;

          // ==================== DIRECT-ANTHROPIC PROMPT CACHING (v4.264) ====================
          // Use Anthropic's current top-level AUTOMATIC cache control so the server advances the
          // conversation breakpoint itself. One explicit system marker remains as a stable fallback.
          // This replaces v4.263's moving explicit user markers, which reused only the 18.7K
          // tools/system prefix and rewrote ~157K message tokens in a live Fable 5 follow-up.
          try {
            var directCacheSummary = tmSummarizeCacheControl(body);
            if (!(directCacheSummary && directCacheSummary.hasAny)) {
              if (tmEnsureDirectAnthropicCacheControl(body)) {
                modified = true;
                // ttl:'1h' on the direct API requires the extended-cache-ttl beta.
                var directBeta = options.headers['anthropic-beta'] || '';
                if (!directBeta.includes('extended-cache-ttl-2025-04-11')) {
                  options.headers['anthropic-beta'] = directBeta ? directBeta + ',extended-cache-ttl-2025-04-11' : 'extended-cache-ttl-2025-04-11';
                  console.log('\u2705 [v' + EXT_VERSION + '] Direct Anthropic: appended extended-cache-ttl-2025-04-11 beta header for ttl:1h.');
                }
                console.log('\u2705 [v' + EXT_VERSION + '] Direct Anthropic: enabled automatic conversation caching + explicit system fallback (2 breakpoint slots, ttl:1h).');
                try { tmResetOpenRouterCacheTimer(); } catch (e) {}
              }
            } else {
              console.log('\u2705 [v' + EXT_VERSION + '] Direct Anthropic: body already carries ' + directCacheSummary.count + ' cache_control marker(s) \u2014 leaving caching untouched (native injection active).');
            }
          } catch (cacheErr) {
            console.warn('\u26a0\ufe0f [v' + EXT_VERSION + '] Direct Anthropic cache injection failed:', cacheErr);
          }

          repairTallyForThisCall = tally;

          const convId = deriveConversationIdFromBody(body);
          if (convId && vendorForThisCall) {
            convIdForThisCall = convId;
            notePayloadConversation(vendorForThisCall, convId, body.model);
            if (vendorForThisCall === 'anthropic') {
              if (applyAnthropicToolFilters(body, vendorForThisCall, convIdForThisCall)) {
                modified = true;
              }
            }
          }

          if (modified) {
            options.body = JSON.stringify(body);
            console.log('✅ [v3.0] Anthropic request body sanitized and ready');
          }
        }
      } catch (e) {
        console.warn('⚠️ [v3.0] Failed to parse/modify Anthropic request:', e);
      }
    }

  // ==================== GEMINI (GOOGLE GENERATIVE LANGUAGE) BRANCH ====================
    else if (url.includes('generativelanguage.googleapis.com')) {
      vendorForThisCall = 'gemini';
      try {
        if (options.body) {
          const body = JSON.parse(options.body);
          let modified = false;

          // Capture latest Gemini body for export tooling (deep clone so we preserve pre-repair state).
          try {
            lastGeminiBodyForExport = JSON.parse(JSON.stringify(body));
          } catch (e) {
            lastGeminiBodyForExport = null;
            console.warn('⚠️ [v' + EXT_VERSION + '] Failed to clone Gemini body for export:', e);
          }

          // 🩹 Primary repair: ensure all parts in each content share a thoughtSignature,
          // and propagate the most recent signature forward across model turns.
          
          const repairEnabled = localStorage.getItem('tm_gemini_repair_enabled') !== 'false';
          
          if (repairEnabled) {
             if (repairGeminiThoughtSignatures(body)) {
               modified = true;
             }
          } else {
             // PASSIVE MODE: Scan for tokens to cache, but DO NOT modify body.
             if (body && Array.isArray(body.contents)) {
               body.contents.forEach(entry => {
                 if (entry && Array.isArray(entry.parts)) {
                   entry.parts.forEach(part => {
                     if (part && typeof part.thoughtSignature === 'string' && part.thoughtSignature.trim()) {
                        cacheGeminiThoughtSignature(part.thoughtSignature.trim());
                     }
                   });
                 }
               });
             }
          }

          // 🧪 Fallback: if there is STILL no thoughtSignature anywhere...
          const isGemini3Thinking = typeof url === 'string' && url.includes('/models/gemini-3');

          if (repairEnabled && isGemini3Thinking && !hasAnyGeminiThoughtSignature(body)) {
            if (synthesizeGeminiThoughtSignature(body)) {
              modified = true;
            }
          }

          if (modified) {
            options.body = JSON.stringify(body);
            console.log('✅ [v' + EXT_VERSION + '] Gemini request body repaired/supplemented (thoughtSignature present on all model contents)');
          }
        }
      } catch (e) {
        console.warn('⚠️ [v' + EXT_VERSION + '] Failed to parse/modify Gemini request body:', e);
      }
    }

    // ==================== GROK (xAI) BRANCH ====================
    else if (url.includes('api.x.ai')) {
      vendorForThisCall = 'grok';
      try {
        if (options.body) {
          const body = JSON.parse(options.body);
          let modified = false;

          // Capture latest Grok body for export tooling
          try {
            lastGrokBodyForExport = JSON.parse(JSON.stringify(body));
          } catch (e) {
            lastGrokBodyForExport = null;
            console.warn('⚠️ [v' + EXT_VERSION + '] Failed to clone Grok body for export:', e);
          }

          // If Grok needs prompt caching or other repairs in future, add here.
          // For now, just capture.

          if (modified) {
            options.body = JSON.stringify(body);
            console.log('✅ [v' + EXT_VERSION + '] Grok request body processed');
          }
        }
      } catch (e) {
        console.warn('⚠️ [v' + EXT_VERSION + '] Failed to parse/modify Grok request:', e);
      }
    }

    // ==================== OPENROUTER ANTHROPIC SKIN (native Anthropic protocol) BRANCH ====================
    // Matches: openrouter.ai/api/v1/messages (Claude Messages API via OpenRouter)
    // Strategy: inject ONLY top-level cache_control with ttl:'1h' — NO per-message breakpoints.
    // The native Anthropic protocol supports automatic caching via top-level cache_control.
    //
    // ⚠️ CORS BLOCKED IN TYPINGMIND (Feb 2026): This branch currently does NOT fire from TypingMind
    // because OpenRouter's /api/v1/messages endpoint does not set CORS headers for browser requests,
    // and TypingMind's proxy does not support this endpoint either. This branch is preserved for
    // future use if CORS is resolved (e.g., OpenRouter adds CORS, or a local proxy is used).
    // Until then, all OpenRouter+Claude traffic goes through the OpenAI-compat branch below.
    else if (url.includes('openrouter.ai') && url.includes('/v1/messages')) {
      vendorForThisCall = 'openrouter-anthropic';
      try {
        if (options.body) {
          const body = JSON.parse(options.body);
          let modified = false;
          const tally = { family: 'anthropic', toolResultName: 0, historicToolInputs: 0, emptyMessageContent: 0, missingToolResults: 0, orphanedToolCalls: 0 };

          // Inject top-level automatic cache_control with 1h TTL
          if (!body.cache_control) {
            body.cache_control = { type: 'ephemeral', ttl: '1h' };
            console.log('✅ [v' + EXT_VERSION + '] OpenRouter Anthropic Skin: injected top-level cache_control with ttl:1h');
            modified = true;
          }

          // Ensure anthropic-beta header includes prompt-caching
          options.headers = options.headers || {};
          const currentBeta = options.headers['anthropic-beta'] || '';
          if (!currentBeta.includes('prompt-caching-2024-07-31')) {
            options.headers['anthropic-beta'] = currentBeta ? currentBeta + ',prompt-caching-2024-07-31' : 'prompt-caching-2024-07-31';
            console.log('✅ [v' + EXT_VERSION + '] OpenRouter Anthropic Skin: injected prompt-caching beta header');
            modified = true;
          }

          // (v4.98/v4.104) Inject usage accounting + session_id for all OpenRouter traffic.
          if (tmEnsureOpenRouterAccountingAndSession(body, 'OpenRouter Anthropic Skin', tmComputeRoutingIdentityKey(body, url, options))) {
            modified = true;
          }

          // Repair tools/content issues (same as direct Anthropic)
          var toolIdSanitized = repairAnthropicToolUseIds(body) || 0;
          tally.historicToolInputs  = repairHistoricAnthropicToolInputs(body) || 0;
          tally.emptyMessageContent = repairAnthropicEmptyMessageContent(body) || 0;
          tally.missingToolResults  = repairAnthropicMissingToolResults(body) || 0;
          if (toolIdSanitized || tally.historicToolInputs || tally.emptyMessageContent || tally.missingToolResults) modified = true;
          // (v4.243) Also strip foreign reasoning.encrypted blocks on the Anthropic-skin path.
          if (tmStripForeignEncryptedReasoning(body, body && body.model)) modified = true;
          repairTallyForThisCall = tally;

          if (modified) {
            options.body = JSON.stringify(body);
            console.log('✅ [v' + EXT_VERSION + '] OpenRouter Anthropic Skin request body updated');
          }
        }
      } catch (e) {
        console.warn('⚠️ [v' + EXT_VERSION + '] Failed to parse/modify OpenRouter Anthropic Skin request:', e);
      }
    }

    // ==================== OPENROUTER (OpenAI-compatible) BRANCH ====================
    else if (url.includes('openrouter.ai') && url.includes('/api/v1/chat/completions')) {
      vendorForThisCall = 'openrouter';
      try {
        if (options.body) {
          const body = JSON.parse(options.body);
          let modified = false;

          const model = (body && typeof body.model === 'string') ? body.model : '';
          const isClaude = model.startsWith('anthropic/') || model.toLowerCase().includes('claude');
          const isOpenAIFamily = model.startsWith('openai/') || /(^|\/)gpt-/.test(model.toLowerCase());

          // v4.58: UNIVERSAL tools key canonicalization (all OpenRouter models). Must run BEFORE
          // any per-model caching logic so the outbound tools block is byte-stable across turns
          // regardless of TypingMind's non-deterministic key ordering. Root-cause fix for the
          // GPT-5.x cache misses; also removes needless per-turn cache re-writes on Claude.
          if (tmStabilizeToolsOrdering(body)) {
            modified = true;
          }

          // (v4.243) Strip reasoning.encrypted blocks minted by a DIFFERENT model than this target
          // (e.g. a Grok block poisoning a switch to MiniMax). Generic — compares the target to the
          // origin endpoint slug embedded in each sealed block; keeps same-origin blocks (resumption).
          if (tmStripForeignEncryptedReasoning(body, model)) {
            modified = true;
          }

          // (v4.65) Tag the FAMILY for the header badge. OpenAI-compatible providers can reject
          // historic empty message content (e.g. Kimi/Moonshot: assistant content:""), so repair
          // that conservatively with string placeholders on this chat-completions path.
          repairTallyForThisCall = { family: (isClaude ? 'anthropic' : (isOpenAIFamily ? 'openai' : null)), toolResultName: 0, historicToolInputs: 0, emptyMessageContent: 0, missingToolResults: 0, orphanedToolCalls: 0 };
          var emptyChatContentCount = repairChatCompletionsEmptyMessageContent(body, 'OpenRouter chat-completions');
          if (emptyChatContentCount) {
            repairTallyForThisCall.emptyMessageContent = emptyChatContentCount;
            modified = true;
          }

          if (isClaude) {
            // Normalize top-level cache_control to ttl:1h.
            // OpenRouter/Anthropic now rejects mixed TTLs between top-level and block-level
            // cache_control (e.g., top-level 5m vs message block 1h).
            if (!body.cache_control || typeof body.cache_control !== 'object') {
              body.cache_control = { type: 'ephemeral', ttl: '1h' };
              console.log('✅ [v' + EXT_VERSION + '] OpenRouter Claude: injected TOP-LEVEL cache_control ttl:1h');
              modified = true;
            } else {
              var topPrevType = body.cache_control.type;
              var topPrevTtl = body.cache_control.ttl;
              if (topPrevType !== 'ephemeral' || topPrevTtl !== '1h') {
                body.cache_control.type = 'ephemeral';
                body.cache_control.ttl = '1h';
                console.log('✅ [v' + EXT_VERSION + '] OpenRouter Claude: normalized TOP-LEVEL cache_control to ttl:1h (was type:' + topPrevType + ', ttl:' + topPrevTtl + ')');
                modified = true;
              }
            }

            // Keep block-level breakpoints; normalize any existing breakpoint cache_control to ttl:1h.
            if (ensureOpenRouterClaudeCacheControl(body)) {
              modified = true;
            }

            // Reset cache TTL warning timer on every OpenRouter+Claude request
            tmResetOpenRouterCacheTimer();
          }

          // (v4.104) Universal session_id + usage accounting for ALL OpenRouter models on this path.
          if (tmEnsureOpenRouterAccountingAndSession(body, 'OpenRouter', tmComputeRoutingIdentityKey(body, url, options))) {
            modified = true;
          }

          if (modified) {
            options.body = JSON.stringify(body);
            console.log('✅ [v' + EXT_VERSION + '] OpenRouter request body updated');
          }
        }
      } catch (e) {
        console.warn('⚠️ [v' + EXT_VERSION + '] Failed to parse/modify OpenRouter request:', e);
      }
    }

    // ==================== OPENAI RESPONSES BRANCH (GPT-5.1 prompt caching + usage) ====================
    else if (url.includes('api.openai.com') && url.includes('/v1/responses')) {
      vendorForThisCall = 'openai';
      try {
        if (options.body) {
          const body = JSON.parse(options.body);
          let modified = false;

          const convId = deriveConversationIdFromBody(body);
          if (convId) {
            convIdForThisCall = convId;
          }

          const model = body.model || '';

          try {
            lastGpt51BodyForExport = JSON.parse(JSON.stringify(body));
          } catch (e) {
            lastGpt51BodyForExport = null;
            console.warn('⚠️ [v' + EXT_VERSION + '] Failed to clone OpenAI Responses body for export:', e);
          }

          if (typeof model === 'string' && model.startsWith('gpt-5.1')) {
            if (!body.prompt_cache_key) {
              body.prompt_cache_key = 'dan-dagger-gpt5.1-v1';
              modified = true;
              console.log('✅ [v4.2] Injected prompt_cache_key for GPT-5.1 Responses:', body.prompt_cache_key);
            }
            if (body.prompt_cache_retention == null) {
              body.prompt_cache_retention = '24h';
              modified = true;
              console.log('✅ [v4.2] Injected prompt_cache_retention for GPT-5.1 Responses:', body.prompt_cache_retention);
            }
          }

          // 🩹 FIX: Ensure every function_call has a preceding output_text (v4.27)
          var orphanedCount = repairOpenAIOrphanedToolCalls(body) || 0;
          if (orphanedCount) modified = true;
          repairTallyForThisCall = { family: 'openai', toolResultName: 0, historicToolInputs: 0, emptyMessageContent: 0, missingToolResults: 0, orphanedToolCalls: orphanedCount };

          if (modified) {
            options.body = JSON.stringify(body);
            console.log('✅ [v4.27] OpenAI Responses request body updated (prompt caching + orphaned tool call repair)');
          }
        }
      } catch (e) {
        console.warn('⚠️ [v4.27] Failed to parse/modify OpenAI Responses request:', e);
      }
    }

    // ==================== TYPINGMIND CORS-PROXY BRANCH (crash-prevention repairs ONLY; NO prompt-caching) ====================
    // TypingMind routes some providers (notably OpenRouter's native Anthropic /v1/messages endpoint) through
    // its own CORS proxy: the fetch URL is https://www.typingmind.com/api/cors-proxy and the REAL upstream
    // endpoint is carried in the request header  x-target-endpoint . None of the URL-keyed branches above can
    // see that traffic, so on the proxied path the extension was fully dormant.
    //
    // ⚠️ DELIBERATELY NO PROMPT-CACHING HERE. Caching on this path ALREADY works without us (TypingMind + the
    // native /v1/messages endpoint set cache_control themselves — confirmed live via cache_read_input_tokens
    // ~184K on a warm turn). Injecting our own cache_control/anthropic-beta would be redundant and risks the
    // provider 'too many cache_control blocks' cap. We ONLY apply the crash-prevention body repairs, which had
    // no coverage on this (primary, daily-driver) path.
    else if (typeof url === 'string' && url.includes('typingmind.com/api/cors-proxy')) {
      const tmProxyTarget = tmReadRequestHeader(options, 'x-target-endpoint');
      const tgtLower = String(tmProxyTarget || '').toLowerCase();
      // Anthropic-native "messages" shape (OpenRouter Anthropic skin OR direct Anthropic), routed via proxy.
      const proxyIsAnthropicMessages = tgtLower.includes('/v1/messages') || tgtLower.includes('api.anthropic.com');
      if (proxyIsAnthropicMessages) {
        vendorForThisCall = 'tm-proxy-anthropic';
        try {
          if (options.body) {
            const body = JSON.parse(options.body);
            let modified = false;
            const tally = { family: 'anthropic', toolResultName: 0, historicToolInputs: 0, emptyMessageContent: 0, missingToolResults: 0, orphanedToolCalls: 0 };

            // Strip stray tool_result.name (MCP adds name:"STDOUT"; Anthropic rejects it).
            if (Array.isArray(body.messages)) {
              body.messages.forEach((msg) => {
                if (msg && Array.isArray(msg.content)) {
                  msg.content.forEach((block) => {
                    if (block && block.type === 'tool_result' && Array.isArray(block.content)) {
                      block.content.forEach((rc) => {
                        if (rc && rc.type === 'text' && rc.name !== undefined) {
                          delete rc.name;
                          tally.toolResultName++;
                          modified = true;
                        }
                      });
                    }
                  });
                }
              });
            }

            // Crash-prevention repairs (each returns a COUNT of items repaired as of v4.62).
            var proxyToolIdSanitized = repairAnthropicToolUseIds(body) || 0;
            tally.historicToolInputs  = repairHistoricAnthropicToolInputs(body) || 0;
            tally.emptyMessageContent = repairAnthropicEmptyMessageContent(body) || 0;
            tally.missingToolResults  = repairAnthropicMissingToolResults(body) || 0;
            if (proxyToolIdSanitized || tally.historicToolInputs || tally.emptyMessageContent || tally.missingToolResults) modified = true;

            // Prompt caching on the proxy path (v4.70).
            // ...
            // (existing caching logic remains)

            // (v4.104) Universal session_id + usage accounting when proxy target is OpenRouter.
            if (tgtLower.includes('openrouter.ai')) {
              var emptyProxyChatContentCount = repairChatCompletionsEmptyMessageContent(body, 'TM Proxy → OpenRouter chat-completions');
            if (emptyProxyChatContentCount) {
              modified = true;
            }

            if (tmEnsureOpenRouterAccountingAndSession(body, 'TM Proxy → OpenRouter', tmComputeRoutingIdentityKey(body, url, options))) {
                modified = true;
              }
            }

            // ==================== PROMPT CACHING ON THE PROXY PATH (v4.70) ====================
            // REGRESSION FIX: v4.62 deliberately skipped caching here on the assumption that TypingMind +
            // the native /v1/messages endpoint injected cache_control themselves. That assumption is now
            // FALSE — live captures on the proxy path show cache_read_input_tokens == 0 (nothing is being
            // cached), which re-bills the full ~350K-token prefix at full price EVERY turn ($10-30 sessions).
            //
            // This proxied traffic is the Anthropic-native "messages" shape (same as the OpenRouter Anthropic
            // Skin branch), so we mirror that branch's cap-safe treatment: top-level cache_control {ephemeral,
            // 1h} + the prompt-caching beta header. We inject ONLY when the body doesn't already carry
            // cache_control markers, so if TypingMind ever resumes native injection we neither fight it nor
            // risk the provider 'too many cache_control blocks' cap. Self-healing either way.
            var proxyHasCacheControl = !!(body && body.cache_control);
            if (!proxyHasCacheControl && Array.isArray(body.messages)) {
              body.cache_control = { type: 'ephemeral', ttl: '1h' };
              modified = true;
              console.log('✅ [v' + EXT_VERSION + '] TypingMind proxy → Anthropic: injected TOP-LEVEL cache_control ttl:1h (proxy-path caching regression fix)');

              options.headers = options.headers || {};
              var proxyBeta = (typeof options.headers['anthropic-beta'] === 'string') ? options.headers['anthropic-beta'] : '';
              if (!proxyBeta.includes('prompt-caching-2024-07-31')) {
                options.headers['anthropic-beta'] = proxyBeta ? proxyBeta + ',prompt-caching-2024-07-31' : 'prompt-caching-2024-07-31';
                console.log('✅ [v' + EXT_VERSION + '] TypingMind proxy → Anthropic: injected prompt-caching beta header');
              }

              // Reset the OpenRouter/Claude cache TTL warning timer so the widget reflects the warm window.
              try { tmResetOpenRouterCacheTimer(); } catch (e) {}
            } else if (proxyHasCacheControl) {
              console.log('✅ [v' + EXT_VERSION + '] TypingMind proxy → Anthropic: body already carries cache_control — leaving caching untouched (native injection active).');
            }

            const convId = deriveConversationIdFromBody(body);
            if (convId) {
              convIdForThisCall = convId;
              notePayloadConversation(vendorForThisCall, convId, body.model);
            }

            repairTallyForThisCall = tally;

            if (modified) {
              options.body = JSON.stringify(body);
              console.log('✅ [v' + EXT_VERSION + '] TypingMind proxy → ' + tmProxyTarget + ': applied crash-prevention repairs only (no cache changes):', tally);
            }
          }
        } catch (e) {
          console.warn('⚠️ [v' + EXT_VERSION + '] Failed to parse/modify TypingMind proxy request:', e);
        }
      } else if (tgtLower.includes('openrouter.ai')) {
        // (v4.104) Proxy target is OpenRouter but not Anthropic-messages (e.g. OpenAI-compat
        // chat completions). Inject session_id + usage accounting without Anthropic-specific repairs.
        vendorForThisCall = 'tm-proxy-openrouter';
        try {
          if (options.body) {
            const body = JSON.parse(options.body);
            let modified = false;

            if (tmEnsureOpenRouterAccountingAndSession(body, 'TM Proxy → OpenRouter', tmComputeRoutingIdentityKey(body, url, options))) {
              modified = true;
            }

            if (modified) {
              options.body = JSON.stringify(body);
              console.log('✅ [v' + EXT_VERSION + '] TypingMind proxy → OpenRouter: injected session_id + usage accounting');
            }
          }
        } catch (e) {
          console.warn('⚠️ [v' + EXT_VERSION + '] Failed to parse/modify TypingMind proxy OpenRouter request:', e);
        }
      }
    }

    // ==================== DEEPINFRA BRANCH (v4.78) ====================
    // DeepInfra (api.deepinfra.com) hosts GLM-5.2 and other models on an OpenAI-compatible
    // /v1/openai/chat/completions endpoint. Prompt caching is automatic (KV-cache prefix reuse)
    // but the serverless fleet load-balances across GPU workers, so ~25% of turns land on a
    // different instance and miss the cache entirely — full-price re-process of the entire prefix.
    // The fix (v4.79): inject a top-level `prompt_cache_key` parameter, which DeepInfra's docs
    // describe as making requests with the same key + model share a KV cache even across instances.
    // No body repairs or cache_control injection needed — just the cache key.
    else if (typeof url === 'string' && url.includes('api.deepinfra.com')) {
      vendorForThisCall = 'deepinfra';
      try {
        if (options.body) {
          const body = JSON.parse(options.body);
          let modified = false;

          // (v4.79) Inject prompt_cache_key for cross-instance cache pinning.
          // Uses the same stable per-conversation derivation as OpenRouter's session_id.
          // Only inject when not already present (self-healing).
          if (!body.prompt_cache_key) {
            var diCacheKey = tmDeriveStableSessionId(body);
            if (diCacheKey) {
              body.prompt_cache_key = diCacheKey;
              modified = true;
              console.log('✅ [v' + EXT_VERSION + '] DeepInfra: injected prompt_cache_key for cross-instance cache pinning:', diCacheKey);
            } else {
              console.warn('⚠️ [v' + EXT_VERSION + '] DeepInfra: could not derive a stable prompt_cache_key; cache pinning not set.');
            }
          }

          // Derive conversation ID for notePayloadConversation + payload filters
          const convId = deriveConversationIdFromBody(body);
          if (convId) {
            convIdForThisCall = convId;
            notePayloadConversation(vendorForThisCall, convId, body.model);
          }

          if (modified) {
            options.body = JSON.stringify(body);
            console.log('✅ [v' + EXT_VERSION + '] DeepInfra request body updated (prompt_cache_key injected)');
          }
          // No repairs, no cache_control injection — passthrough with capture only.
        }
      } catch (e) {
        console.warn('⚠️ [v' + EXT_VERSION + '] Failed to parse DeepInfra request:', e);
      }
    }


    // ==================== MOONSHOT AI BRANCH (v4.232) ====================
    // Moonshot AI (api.moonshot.ai) hosts Kimi K3 and other models on an OpenAI-compatible
    // /v1/chat/completions endpoint. The API supports a top-level `prompt_cache_key` parameter
    // (confirmed in Kimi API Platform docs) which improves cross-instance KV cache hit rate
    // on their serverless fleet. Uses the same stable per-conversation derivation as DeepInfra's
    // prompt_cache_key and OpenRouter's session_id. Direct Moonshot also gets the shared
    // OpenAI-compatible empty-message repair: Moonshot rejects historic assistant content:"".
    // No cache_control injection is performed.
    // NOTE: Moonshot's API returns usage with cached_tokens but NO cost/dollar field; cost must
    // be calculated client-side from published pricing (see v4.233 Set Costs modal).
    else if (typeof url === 'string' && url.includes('api.moonshot.ai')) {
      vendorForThisCall = 'moonshot';
      try {
        if (options.body) {
          const body = JSON.parse(options.body);
          let modified = false;
          const tally = { family: null, toolResultName: 0, historicToolInputs: 0, emptyMessageContent: 0, missingToolResults: 0, orphanedToolCalls: 0 };

          // (v4.274) Direct Moonshot uses OpenAI-compatible chat-completions and rejects empty
          // historic messages (observed: assistant content:"" at messages[95]). Reuse the same
          // conservative string-placeholder repair already proven on OpenRouter Kimi traffic.
          tally.emptyMessageContent = repairChatCompletionsEmptyMessageContent(body, 'Moonshot chat-completions') || 0;
          if (tally.emptyMessageContent) modified = true;
          repairTallyForThisCall = tally;

          // (v4.232) Inject prompt_cache_key for cross-instance cache pinning.
          // Uses the same stable per-conversation derivation as DeepInfra's prompt_cache_key
          // and OpenRouter's session_id. Only inject when not already present (self-healing).
          if (!body.prompt_cache_key) {
            var msCacheKey = tmDeriveStableSessionId(body);
            if (msCacheKey) {
              body.prompt_cache_key = msCacheKey;
              modified = true;
              console.log('✅ [v' + EXT_VERSION + '] Moonshot: injected prompt_cache_key for cross-instance cache pinning:', msCacheKey);
            } else {
              console.warn('⚠️ [v' + EXT_VERSION + '] Moonshot: could not derive a stable prompt_cache_key; cache pinning not set.');
            }
          }

          // Derive conversation ID for notePayloadConversation + payload filters
          const convId = deriveConversationIdFromBody(body);
          if (convId) {
            convIdForThisCall = convId;
            notePayloadConversation(vendorForThisCall, convId, body.model);
          }

          if (modified) {
            options.body = JSON.stringify(body);
            console.log('✅ [v' + EXT_VERSION + '] Moonshot request body updated (prompt_cache_key and/or chat-completions repairs)');
          }
          // No cache_control injection; the final repaired body is captured below.
        }
      } catch (e) {
        console.warn('⚠️ [v' + EXT_VERSION + '] Failed to parse Moonshot request:', e);
      }
    }


    // ==================== OVERSIZED TOOL-RESULT GUARD (v4.280) ====================
    // Run once on the FINAL repaired payload so every supported provider shape receives identical
    // policy. This is deliberately before capture: the ring shows exactly what the model received.
    try {
      if (options && typeof options.body === 'string') {
        var tmGuardBody = JSON.parse(options.body);
        var tmGuardReport = tmApplyOversizedToolResultGuard(tmGuardBody);
        oversizedGuardReportForThisCall = tmGuardReport;
        if (tmGuardReport && tmGuardReport.changed) options.body = JSON.stringify(tmGuardBody);
      }
    } catch (tmGuardErr) {
      console.warn('⚠️ [v' + EXT_VERSION + '] Oversized tool-result guard failed open:', tmGuardErr);
    }


    // ==================== PAYLOAD CAPTURE (always-on, ring buffer) ====================
    // Captures the FINAL outbound request payload (after any modifications above).
    // This makes it easy to debug provider URLs (OpenRouter vs direct), request protocol,
    // and prompt caching markers without using the Network tab.
    let captureId = null;
    try {
      captureId = tmCaptureFetchCall(url, options, convIdForThisCall, vendorForThisCall, repairTallyForThisCall);
    } catch (e) {
      // Never break requests due to capture
    }

    // (v4.282) Stamp guard outcome + auto-resume snapshot onto the ring record for history badges.
    try {
      if (captureId) {
        var tmStampStubbed = (oversizedGuardReportForThisCall && Array.isArray(oversizedGuardReportForThisCall.stubbed)) ? oversizedGuardReportForThisCall.stubbed : [];
        var tmStampRecovered = (oversizedGuardReportForThisCall && Array.isArray(oversizedGuardReportForThisCall.recovered)) ? oversizedGuardReportForThisCall.recovered : [];
        var tmStampAr = tmGetAutoResumeStats();
        if (tmStampStubbed.length || tmStampRecovered.length || tmStampAr.total > 0) {
          tmUpdateCaptureRecord(captureId, {
            _tool_stubbed: tmStampStubbed,
            _tool_recovered: tmStampRecovered,
            _autoresume_total: tmStampAr.total,
            _autoresume_by_reason: tmStampAr.by_reason
          });
        }
      }
    } catch (eStampGuard) {}

    // ==================== (v4.270) OPENROUTER→GEMINI HARD BLOCK (default ON) ====================
    // PROVEN silent-data-loss route: OpenRouter's OpenAI→Gemini translation empties/drops large
    // tool-result content before Google's tokenizer ever sees it (measured: ~43K prompt tokens
    // billed for a ~350K-token conversation; direct Google billed 253K for the same). The request
    // SUCCEEDS and Gemini confidently answers from a corrupted view -- the worst failure class.
    // Block ALL OpenRouter→Gemini requests by default (size-agnostic: the drop threshold is not
    // externally predictable). The capture above already recorded the final outbound payload; we
    // stamp a permanent 'openrouter_gemini_blocked' warning onto that ring entry, refresh the
    // widget (banner recomputed from ring), and return a synthetic non-retryable 422 so TypingMind
    // surfaces a real error instead of silently sending. NO network request reaches OpenRouter.
    try {
      var orGemBlockBody = null;
      if (options && typeof options.body === 'string') { try { orGemBlockBody = JSON.parse(options.body); } catch (eP) {} }
      var orGemRoute = tmDetectOpenRouterGeminiRoute(url, options, orGemBlockBody);
      if (orGemRoute && tmShouldBlockOpenRouterGemini()) {
        try {
          if (captureId) {
            var blCap = getCaptureById(captureId);
            var blArr = (blCap && Array.isArray(blCap._warnings)) ? blCap._warnings.slice() : [];
            var blId = 'openrouter_gemini_blocked:' + captureId;
            var blDup = false;
            for (var bli = 0; bli < blArr.length; bli++) { if (blArr[bli] && blArr[bli].id === blId) { blDup = true; break; } }
            if (!blDup) {
              blArr.push({
                id: blId,
                code: 'openrouter_gemini_blocked',
                severity: 'critical',
                title: 'OpenRouter→Gemini blocked',
                message: 'This route silently discards large tool-result history. Use the direct Google endpoint (generativelanguage.googleapis.com). Disable only for controlled testing via the ring-buffer modal 🚫 toggle.',
                ts: Date.now(),
                details: { model: orGemRoute.model, effective_target_url: orGemRoute.effective_target_url }
              });
              tmUpdateCaptureRecord(captureId, { _warnings: blArr });
            }
          }
        } catch (eW) {}
        console.error('\uD83D\uDEAB [v' + EXT_VERSION + '] BLOCKED OpenRouter→Gemini request (' + orGemRoute.model + '): silent large-tool-result drop risk. Route direct to Google. Disable via ring-buffer modal 🚫 toggle.');
        try { renderGpt51UsageWidget(); } catch (eR) {}
        var orGemErrBody = JSON.stringify({
          error: {
            message: 'Blocked by Payload Extension (v' + EXT_VERSION + '): OpenRouter→Gemini silently discards large tool-result history before it reaches the model. Use the direct Google endpoint instead. To override (testing only): localStorage.setItem(\'' + TM_BLOCK_OR_GEMINI_KEY + '\',\'false\') or the ring-buffer modal 🚫 toggle.',
            type: 'extension_blocked',
            code: 'openrouter_gemini_payload_drop'
          }
        });
        var orGemResp;
        try {
          orGemResp = new Response(orGemErrBody, { status: 422, statusText: 'Unprocessable Entity', headers: { 'Content-Type': 'application/json' } });
        } catch (eResp) {
          orGemResp = { ok: false, status: 422, clone: function() { return this; }, text: function() { return Promise.resolve(orGemErrBody); }, json: function() { return Promise.resolve(JSON.parse(orGemErrBody)); }, headers: { get: function() { return null; } } };
        }
        try { if (captureId && orGemResp) tmCaptureResponse(captureId, orGemResp); } catch (eCap) {}
        return Promise.resolve(orGemResp);
      }
    } catch (eBlock) {}

    // Derive response-transform policy from the FINAL outbound body before the network call.
    // For Kimi, the exact historical id set is the collision oracle for the incoming turn.
    var shouldSanitizeSolProUsage = false;
    var shouldGuardKimiToolIds = false;
    var kimiHistoricalToolIds = null;
    var kimiToolIdModel = '';
    try {
      if (options && typeof options.body === 'string') {
        var finalBody = JSON.parse(options.body);
        continuitySessionIdForThisCall = deriveConversationIdFromBody(finalBody);
        // (v4.292) Any outbound request proves TypingMind advanced beyond the prior assistant
        // tool-call response for this session, so clear that in-memory suspicion immediately.
        tmAgentManagementNoteOutbound(continuitySessionIdForThisCall, captureId);
        if (finalBody && tmIsSolProModel(finalBody.model)) {
          shouldSanitizeSolProUsage = true;
        }
        if (finalBody && tmIsKimiToolIdGuardModel(finalBody.model) && Array.isArray(finalBody.messages)) {
          shouldGuardKimiToolIds = true;
          kimiToolIdModel = String(finalBody.model || 'kimi');
          kimiHistoricalToolIds = tmCollectChatCompletionToolIds(finalBody);
        }
      }
    } catch (e) {}

    // (v4.285) SILENCE WATCHDOG: if NO response bytes arrive for N minutes (default 15) on a
    // session-identified request, queue the auto-resume actuator. Covers direct-endpoint silent
    // hangs (e.g. Moonshot direct accepting a tool-result payload then going silent), where no SSE
    // error chunk ever exists for the continuity tap to inspect. Reset per chunk; cancelled on
    // completion/rejection. Generous by design: Fable can think >5 min before its first byte.
    var stallWatchdog = null;
    var fetchStartTs = Date.now();
    try {
      if (continuitySessionIdForThisCall) {
        var tmStallWaitMs = tmGetStallWatchdogMs();
        stallWatchdog = {
          fired: false,
          timer: null,
          cancel: function() { if (this.timer) { try { clearTimeout(this.timer); } catch (e) {} this.timer = null; } },
          pet: function() {
            if (this.fired) return;
            this.cancel();
            var self = this;
            this.timer = setTimeout(function() {
              self.fired = true;
              console.warn('⏱️ [v' + EXT_VERSION + '] Silence watchdog: no response bytes for ' + Math.round(tmStallWaitMs / 60000) + 'm on session ' + continuitySessionIdForThisCall + ' — queueing auto-resume.');
              tmQueueAutoContinue(continuitySessionIdForThisCall, 'stall_no_bytes', 'silence>' + Math.round(tmStallWaitMs / 60000) + 'm');
              try { if (captureId) tmUpdateCaptureRecord(captureId, { _auto_resume_triggered: 'stall_no_bytes' }); } catch (eS) {}
            }, tmStallWaitMs);
          }
        };
        stallWatchdog.pet();
      }
    } catch (eWD) {}

    const fetchPromise = originalFetch(...args);

    // Capture response headers/body (best-effort, does not affect the original response stream)
    var fetchPromiseCaptured = fetchPromise.then(function(response) {
      if (captureId) {
        try { tmCaptureResponse(captureId, response); } catch (e) {}
      }
      // (Fix 17, v4.202) Detect an OpenRouter error in the response and, if it is a transient
      // 429 carrying retry_after_seconds, AUTO-RETRY the SAME modified request up to a cap. This
      // runs ONLY for OpenRouter URLs and ONLY when the response body is small (errors are tiny),
      // so successful streaming responses are never buffered or delayed. Returns a promise that
      // resolves to either a fresh (retried) response or the original error response.
      try {
        if (typeof url === 'string' && url.indexOf('openrouter.ai') !== -1) {
          return tmMaybeAutoRetry(response, args, captureId, shouldSanitizeSolProUsage);
        }
      } catch (e) {}
      // v4.158: Sol Pro usage guard — rewrite the SSE usage event before TypingMind sees it.
      if (shouldSanitizeSolProUsage) {
        return tmWrapSolProResponse(response);
      }
      return response;
    }, function(fetchErr) {
      // (v4.275) A rejected fetch has no Response object, but it is still a permanent failure of
      // this captured turn. Stamp it without swallowing/changing the rejection seen by TypingMind.
      try { if (stallWatchdog) stallWatchdog.cancel(); } catch (eWD2) {}
      // (v4.286) FETCH DROPPED: a request that survived >=30s in flight and then rejected is a
      // dropped connection (the 'connection closed, nothing received' case) -> auto-resume.
      // Fast failures (<30s: CORS/DNS/refused/cert) are hard errors TypingMind surfaces; we must
      // NEVER auto-resume those -- an instant-fail continue loop would spam the modal forever.
      try {
        var tmDropElapsed = Date.now() - fetchStartTs;
        if (continuitySessionIdForThisCall && tmDropElapsed >= 30000) {
          console.warn('🔌 [v' + EXT_VERSION + '] Fetch dropped after ' + Math.round(tmDropElapsed / 1000) + 's in flight — queueing auto-resume.');
          tmQueueAutoContinue(continuitySessionIdForThisCall, 'fetch_dropped', 'rejected after ' + Math.round(tmDropElapsed / 1000) + 's in flight');
          if (captureId) tmUpdateCaptureRecord(captureId, { _auto_resume_triggered: 'fetch_dropped' });
        }
      } catch (eDrop) {}
      try {
        if (captureId) {
          var fetchPayload = {
            name: fetchErr && fetchErr.name ? String(fetchErr.name) : 'FetchError',
            message: fetchErr && fetchErr.message ? String(fetchErr.message) : String(fetchErr),
            stack: fetchErr && fetchErr.stack ? String(fetchErr.stack) : null
          };
          tmUpdateCaptureRecord(captureId, {
            response_ok: false,
            error: tmBuildCapturedProviderError(fetchPayload, null, 'fetch')
          });
          try {
            if (payloadCaptureModalInnerEl && payloadCaptureModalInnerEl.isConnected) renderPayloadCaptureModal();
          } catch (eRender) {}
        }
      } catch (eStamp) {}
      throw fetchErr;
    });

    // Kimi response-boundary guard runs AFTER OpenRouter retry/error handling, so a retried final
    // response is guarded exactly once. Promise adoption handles the non-streaming async branch.
    var fetchPromiseToolIdGuarded = fetchPromiseCaptured.then(function(response) {
      if (!shouldGuardKimiToolIds) return response;
      try {
        return tmWrapKimiToolIdResponse(
          response,
          kimiHistoricalToolIds,
          kimiToolIdModel,
          function(detail) { tmRecordKimiToolIdRepair(captureId, detail); }
        );
      } catch (e) {
        console.warn('⚠️ [v' + EXT_VERSION + '] Kimi tool-id guard failed open:', e);
        return response;
      }
    });

    var fetchPromiseContinuityTapped = fetchPromiseToolIdGuarded.then(function(response) {
      try {
        var stubbedIds = [];
        if (oversizedGuardReportForThisCall && Array.isArray(oversizedGuardReportForThisCall.stubbed)) {
          stubbedIds = oversizedGuardReportForThisCall.stubbed.map(function(x) { return x && x.id; }).filter(Boolean);
        }
        return tmTapContinuitySignals(response, continuitySessionIdForThisCall, stubbedIds, {
          pet: function() { try { if (stallWatchdog) stallWatchdog.pet(); } catch (e) {} },
          disarm: function() { try { if (stallWatchdog) stallWatchdog.cancel(); } catch (e) {} },
          stamp: function(reason) { try { if (captureId) tmUpdateCaptureRecord(captureId, { _auto_resume_triggered: reason }); } catch (e) {} },
          captureId: captureId
        });
      } catch (e) { return response; }
    });

    if (url.includes('api.openai.com') && url.includes('/v1/responses')) {
      return fetchPromiseContinuityTapped.then(function(response) {
        try {
          const clone = response.clone();
          clone.text().then(function(text) {
            try {
              const lines = text.split('\n');
              let currentEvent = null;
              let lastDataLine = null;

              for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                if (line.startsWith('event: ')) {
                  currentEvent = line.slice(7).trim();
                } else if (line.startsWith('data: ') && currentEvent === 'response.completed') {
                  lastDataLine = line.slice(6);
                }
              }

              if (lastDataLine) {
                const data = JSON.parse(lastDataLine);
                const usage = data && data.response && data.response.usage;
                if (usage && convIdForThisCall) {
                  updateGpt51Usage(convIdForThisCall, usage);
                  console.log('📈 [v' + EXT_VERSION + '] Updated GPT-5.1 usage for conversation:', convIdForThisCall, usage);
                }
              }
            } catch (e) {
              console.warn('⚠️ [v' + EXT_VERSION + '] Failed to parse SSE usage from OpenAI Responses:', e);
            }
          }).catch(function(e) {
            console.warn('⚠️ [v' + EXT_VERSION + '] Failed to read OpenAI Responses clone body:', e);
          });
        } catch (e) {
          console.warn('⚠️ [v' + EXT_VERSION + '] Failed to clone OpenAI Responses response:', e);
        }
        return response;
      });
    }

    return fetchPromiseContinuityTapped;
  };

  // Initial render from any persisted usage in localStorage so widget appears on load
  try {
    if (typeof document !== 'undefined') {
      try { tmRepairLockLabelsFromEntries(); } catch (e) {}  // (v4.216) repair stale lock labels once on load
      try { tmInitTurnLimitWatcher(); } catch (eW) {}  // (v4.291) visible turn-count stop sensor
      try { tmInitAgentManagement(); } catch (eM) {}  // (v4.292) background tool-swarm manager
      try {
        var backfilledErrors = tmBackfillCapturedErrorsFromRing();
        if (backfilledErrors) console.log('\uD83D\uDEA8 [v' + EXT_VERSION + '] Backfilled persistent errors onto ' + backfilledErrors + ' older capture row(s).');
      } catch (e) {}
      renderGpt51UsageWidget();
    }
  } catch (e) {
    console.warn('⚠️ [v' + EXT_VERSION + '] Failed initial GPT-5.1 widget render:', e);
  }

  console.log('✅ Prompt Caching & Tool Result Fix & Payload Analysis v' + EXT_VERSION + ' - Active and monitoring');
  console.log('📊 Will inject prompt-caching-2024-07-31 flag into all Anthropic API requests');
  console.log('🔧 Will strip "name" field from tool_result content blocks');
  console.log('🔎 Will analyze payloads when [DEBUG-command-fileId] trigger detected');
  console.log('💰 Expected result: 80-90% cost reduction (Anthropic + OpenAI GPT-5.1) + run_command working + payload debugging + GPT-5.1 usage widget');
})();
