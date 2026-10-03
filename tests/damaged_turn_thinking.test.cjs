'use strict';
// Offline regression for v4.463: the damaged-turn thinking repair and the ring fingerprints.
// Synthetic fixtures only (the reported conversation is not committed).
// node tests/damaged_turn_thinking.test.cjs <extension.js>
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const { test } = require('node:test');
const source = fs.readFileSync(process.argv[2], 'utf8');
function extract(name) {
  const m = source.match(new RegExp('^  function ' + name + '\\([^\\n]*\\) \\{[\\s\\S]*?^  \\}', 'm'));
  assert.ok(m, 'Missing production function: ' + name);
  return m[0];
}
const ctx = vm.createContext({ EXT_VERSION: 'test', console: { log() {}, warn() {}, error() {} } });
vm.runInContext(['tmRepairDamagedTurnThinking', 'tmRepairIncompleteToolHistory', 'repairAnthropicEmptyMessageContent',
  'repairAnthropicMissingToolResults', 'tmFpWords', 'tmFingerprintRequest', 'tmFpIsResend', 'tmFpFeedEvent',
  'tmFpSummarize', 'tmRenderFingerprintRowHtml', 'escapeHtml', 'tmFnv1a32'].map(extract).join('\n'), ctx);

const clone = x => JSON.parse(JSON.stringify(x));
const plain = x => JSON.parse(JSON.stringify(x));   // strip the vm realm's prototypes for deepEqual
const txt = text => ({ type: 'text', text });
const think = t => ({ type: 'thinking', thinking: t + '\n\n', signature: 'sig-' + t.replace(/\W/g, '') });
const use = (id, name = 'node') => ({ type: 'tool_use', id, name, input: { q: id } });
const res = id => ({ type: 'tool_result', tool_use_id: id, content: [txt('result ' + id)] });
const A = content => ({ role: 'assistant', content });
const U = content => ({ role: 'user', content });
const effort = { role: 'system', content: [], output_config: { effort: 'medium' } };
const noThinkingAnywhere = msgs => msgs.every(m => !Array.isArray(m.content) || m.content.every(b => b.type !== 'thinking'));
const noAssistantPairs = msgs => {
  const real = msgs.filter(m => m.role !== 'system');
  for (let i = 0; i < real.length - 1; i++) if (real[i].role === 'assistant' && real[i + 1].role === 'assistant') return false;
  return true;
};

// The Manager-Session-114-a shape: one long tool loop whose saved history lost a tool call's result,
// so the call was left out and its thought stands alone right before the next response.
function shape114a() {
  return { messages: [
    effort,
    U([txt('Load GLIMPSE\n\nSession ID: 50f280f8')]),
    A([use('g1', 'glimpse')]), U([res('g1')]), A([txt('System loaded')]),
    U([txt('Initialize sub-session 114-a; compare the Qwen models')]),
    A([use('n1')]), U([res('n1')]),
    A([think('plan'), use('a1', 'anchor'), use('a2', 'anchor'), use('r1', 'run_command')]), U([res('a1')]), U([res('a2')]), U([res('r1')]),
    A([think('research'), use('w1', 'search_web')]), U([res('w1')]),
    A([think('I should check OpenRouter blog')]),                          // [14] the gap
    A([think('I will capture one artifact'), use('c1', 'anchor')]), U([res('c1')]),
    A([think('read the page first'), use('p1', 'node')]), U([res('p1')]),
    A([use('e1', 'node')]), U([res('e1')]),
    A([think('report'), txt('final report')]),
    U([txt('please close out the sub-session')]),
  ] };
}

test('reported 114-a shape: the gap message goes, the rest of that turn loses its thoughts, nothing else changes', () => {
  const original = shape114a(), body = clone(original);
  const r = ctx.tmRepairDamagedTurnThinking(body);
  assert.deepEqual(plain(r), { changed: 5, gaps: 1, strippedThinking: 4, droppedMessages: 1 });
  assert.ok(noAssistantPairs(body.messages), 'no assistant message may follow another');
  assert.equal(body.messages.length, original.messages.length - 1);
  // Everything before the gap is byte-identical, thoughts included.
  assert.deepEqual(body.messages.slice(0, 14), original.messages.slice(0, 14));
  // After the gap: no thoughts in the rest of that turn; calls, results and text survive in order.
  assert.ok(noThinkingAnywhere(body.messages.slice(14)));
  assert.deepEqual(body.messages[14].content, [use('c1', 'anchor')]);
  assert.deepEqual(body.messages[15], original.messages[16]);
  assert.deepEqual(body.messages[20].content, [txt('final report')]);
  // The human message that follows is untouched.
  assert.deepEqual(body.messages[21], original.messages[22]);
  // Idempotent: a second pass changes nothing.
  const once = JSON.stringify(body);
  assert.equal(ctx.tmRepairDamagedTurnThinking(body).changed, 0);
  assert.equal(JSON.stringify(body), once);
  // The later repairs see a valid body: no missing results, no empty messages.
  assert.equal(ctx.repairAnthropicMissingToolResults(body), 0);
  assert.equal(ctx.repairAnthropicEmptyMessageContent(body), 0);
});

test('loop still in progress: the message that made the pending calls keeps its thinking', () => {
  const body = { messages: shape114a().messages.slice(0, 17) };   // ends with the capture call's result
  const r = ctx.tmRepairDamagedTurnThinking(body);
  assert.equal(r.droppedMessages, 1);
  const pending = body.messages[body.messages.length - 2];
  assert.equal(pending.content[0].type, 'thinking');
  assert.ok(noAssistantPairs(body.messages));
});

test('a healthy conversation is untouched, byte for byte', () => {
  const body = shape114a();
  body.messages.splice(14, 1);   // no gap
  const before = JSON.stringify(body);
  assert.equal(ctx.tmRepairDamagedTurnThinking(body).changed, 0);
  assert.equal(JSON.stringify(body), before);
});

test('an earlier message with text but no call keeps its text and loses its thought', () => {
  const body = { messages: [U([txt('q')]), A([think('t1'), txt('partial answer')]), A([think('t2'), txt('answer')]), U([txt('next')])] };
  const r = ctx.tmRepairDamagedTurnThinking(body);
  assert.equal(r.droppedMessages, 0);
  assert.deepEqual(body.messages[1].content, [txt('partial answer')]);
  assert.deepEqual(body.messages[2].content, [txt('answer')]);
});

test('an earlier message that holds a tool call is not a gap (its result must follow it; other repairs own that)', () => {
  const body = { messages: [U([txt('q')]), A([think('t1'), use('x')]), A([think('t2'), txt('answer')]), U([txt('next')])] };
  const before = JSON.stringify(body);
  assert.equal(ctx.tmRepairDamagedTurnThinking(body).changed, 0);
  assert.equal(JSON.stringify(body), before);
});

test('only the damaged turn is touched; later turns keep their thoughts', () => {
  const body = { messages: [
    U([txt('first')]), A([think('a')]), A([think('b'), use('c')]), U([res('c')]), A([think('d'), txt('done')]),
    U([txt('second')]), A([think('e'), use('f')]), U([res('f')]), A([think('g'), txt('done again')]), U([txt('third')]),
  ] };
  const later = clone(body.messages.slice(5));
  const r = ctx.tmRepairDamagedTurnThinking(body);
  assert.equal(r.gaps, 1);
  assert.deepEqual(body.messages.slice(4), later);
});

test('system messages between the two assistant messages are transparent', () => {
  const body = { messages: [U([txt('q')]), A([think('a')]), effort, A([think('b'), use('c')]), U([res('c')]), A([think('d'), txt('e')]), U([txt('f')])] };
  const r = ctx.tmRepairDamagedTurnThinking(body);
  assert.equal(r.gaps, 1); assert.equal(r.droppedMessages, 1);
  assert.ok(noThinkingAnywhere(body.messages)); assert.ok(noAssistantPairs(body.messages));
});

test('no thinking blocks (Chat Completions, string content): untouched', () => {
  const body = { messages: [{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }] };
  const before = JSON.stringify(body);
  assert.equal(ctx.tmRepairDamagedTurnThinking(body).changed, 0);
  assert.equal(JSON.stringify(body), before);
});

test('request fingerprint: Anthropic human message and tool results, Chat Completions, Responses, Gemini', () => {
  const b = shape114a();
  const fp = ctx.tmFingerprintRequest(b);
  assert.equal(fp.n, 23);
  assert.equal(fp.last, 'user: “please close out the sub-session”');
  assert.match(fp.h, /^[0-9a-f]{8}$/);
  assert.equal(ctx.tmFingerprintRequest({ messages: b.messages.slice(0, 12) }).last, '🔧 results: run_command');
  const chat = { messages: [{ role: 'user', content: 'hi' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'x', type: 'function', function: { name: 'search_web', arguments: '{}' } }, { id: 'y', type: 'function', function: { name: 'search_web', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'x', content: 'r' }, { role: 'tool', tool_call_id: 'y', content: 'r' }] };
  assert.equal(ctx.tmFingerprintRequest(chat).last, '🔧 results: search_web ×2');
  const responses = { input: [{ role: 'user', content: [{ type: 'input_text', text: 'hello there' }] }, { type: 'function_call', call_id: 'k', name: 'node', arguments: '{}' }, { type: 'function_call_output', call_id: 'k', output: 'x' }] };
  assert.equal(ctx.tmFingerprintRequest(responses).last, '🔧 results: node');
  const gemini = { contents: [{ role: 'user', parts: [{ text: 'hi' }] }, { role: 'model', parts: [{ functionCall: { name: 'glimpse', args: {} } }] }, { role: 'user', parts: [{ functionResponse: { name: 'glimpse', response: {} } }] }] };
  assert.equal(ctx.tmFingerprintRequest(gemini).last, '🔧 results: glimpse');
  assert.equal(ctx.tmFingerprintRequest({ messages: [U([txt('one two three four five six seven eight nine ten')])] }).last, 'user: “one two three four five six seven eight…”');
});

test('response fingerprint: Anthropic stream with a thought, a tool call and a stop; a cut stream has no stop', () => {
  const events = [
    { type: 'message_start', message: { usage: { output_tokens: 1 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: "I'll capture one appropriately-scoped research artifact rather than overdoing it" } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'abc' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 't', name: 'anchor', input: {} } },
    { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"verb"' } },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 10 } },
    { type: 'message_stop' },
  ];
  const acc = {};
  events.forEach(ev => ctx.tmFpFeedEvent(acc, ev));
  assert.deepEqual(plain(ctx.tmFpSummarize(acc)), { b: [['think', "I'll capture one appropriately-scoped research…"], ['tool', 'anchor']], stop: 'tool_use', done: true });
  const cut = {};
  events.slice(0, 3).forEach(ev => ctx.tmFpFeedEvent(cut, ev));
  const s = plain(ctx.tmFpSummarize(cut));
  assert.equal(s.done, false); assert.equal(s.stop, undefined);
});

test('response fingerprint: Chat Completions deltas, Responses events, Gemini chunks', () => {
  const chat = {};
  [{ choices: [{ index: 0, delta: { reasoning_content: 'thinking about the plan' } }] },
   { choices: [{ index: 0, delta: { content: 'Here is the answer' } }] },
   { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'x', function: { name: 'search_web', arguments: '' } }] } }] },
   { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{}' } }] }, finish_reason: 'tool_calls' }] }].forEach(ev => ctx.tmFpFeedEvent(chat, ev));
  assert.deepEqual(plain(ctx.tmFpSummarize(chat)), { b: [['think', 'thinking about the plan'], ['text', 'Here is the answer'], ['tool', 'search_web']], stop: 'tool_calls', done: true });
  const resp = {};
  [{ type: 'response.output_item.added', output_index: 0, item: { id: 'rs1', type: 'reasoning' } },
   { type: 'response.reasoning_summary_text.delta', item_id: 'rs1', delta: 'Considering options' },
   { type: 'response.output_item.added', output_index: 1, item: { id: 'fc1', type: 'function_call', name: 'node' } },
   { type: 'response.completed', response: { status: 'completed' } }].forEach(ev => ctx.tmFpFeedEvent(resp, ev));
  assert.deepEqual(plain(ctx.tmFpSummarize(resp)), { b: [['think', 'Considering options'], ['tool', 'node']], stop: 'completed', done: true });
  const gem = {};
  [{ candidates: [{ content: { parts: [{ text: 'Weighing ', thought: true }] } }] },
   { candidates: [{ content: { parts: [{ text: 'the choices', thought: true }] } }] },
   { candidates: [{ content: { parts: [{ functionCall: { name: 'glimpse', args: {} } }] }, finishReason: 'STOP' }] }].forEach(ev => ctx.tmFpFeedEvent(gem, ev));
  assert.deepEqual(plain(ctx.tmFpSummarize(gem)), { b: [['think', 'Weighing the choices'], ['tool', 'glimpse']], stop: 'STOP', done: true });
});

test('RESEND: same conversation, model, count and final message as the newest earlier capture', () => {
  const body = shape114a();
  const fp = ctx.tmFingerprintRequest(body);
  const prev = { pasted_session_id: '50f280f8', _model: 'claude-opus-5-5', _fp_out: fp };
  const other = { pasted_session_id: 'e741d0a1', _model: 'claude-opus-5-5', _fp_out: { n: 1, h: 'x' } };
  const rec = { pasted_session_id: '50f280f8', _model: 'claude-opus-5-5', _fp_out: ctx.tmFingerprintRequest(clone(body)) };
  assert.equal(ctx.tmFpIsResend([prev, other], rec), true);
  const grown = clone(body); grown.messages.push(A([txt('reply')]), U([txt('more')]));
  assert.equal(ctx.tmFpIsResend([prev, other], { pasted_session_id: '50f280f8', _model: 'claude-opus-5-5', _fp_out: ctx.tmFingerprintRequest(grown) }), false);
  assert.equal(ctx.tmFpIsResend([prev], { pasted_session_id: '50f280f8', _model: 'other-model', _fp_out: rec._fp_out }), false);
});

test('row lines: badges first, escaped text, stop or a no-stop warning', () => {
  const html = ctx.tmRenderFingerprintRowHtml({
    _fp_out: { n: 39, last: 'user: “<close out>”', h: 'abcd0123' }, _fp_resend: true,
    _damaged_turn: { changed: 5, gaps: 1, strippedThinking: 4, droppedMessages: 1 },
    _fp_in: { b: [['think', 'I will capture…'], ['tool', 'anchor']], stop: 'tool_use', done: true } });
  assert.match(html, /↻ RESEND/); assert.match(html, /🩹 gap repaired/); assert.match(html, /⏹ tool_use/);
  assert.match(html, /&lt;close out&gt;/); assert.doesNotMatch(html, /<close out>/);
  const cut = ctx.tmRenderFingerprintRowHtml({ _fp_in: { b: [['think', 'partial']], done: false } });
  assert.match(cut, /⚠ no stop/);
});
