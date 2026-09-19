'use strict';
// Offline regression: execute production repair + real pre-branch fetch hook.
// Never executes tool arguments, contacts a provider, or edits a saved conversation.
// node incomplete_tool_history.test.cjs <extension.js>
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const { test } = require('node:test');
const source = fs.readFileSync(process.argv[2], 'utf8');
function extract(name) {
  const m = source.match(new RegExp('^  function ' + name + '\\([^\\n]*\\) \\{[\\s\\S]*?^  \\}', 'm'));
  assert.ok(m, 'Missing production function: ' + name);
  return m[0];
}
const ctx = vm.createContext({ EXT_VERSION: 'test', console: { log() {}, warn() {}, error() {} } });
vm.runInContext(['tmRepairIncompleteToolHistory', 'repairAnthropicToolUseIds', 'repairAnthropicEmptyMessageContent',
  'repairAnthropicMissingToolResults', 'repairChatCompletionsEmptyMessageContent', 'repairChatCompletionsToolCallPairs',
  'repairOpenAIOrphanedToolCalls'].map(extract).join('\n'), ctx);
const clone = x => JSON.parse(JSON.stringify(x));
const txt = text => ({ type: 'text', text });
const use = (id, name = 'read_file') => ({ type: 'tool_use', id, name, input: { path: 'fixture-only' } });
const result = id => ({ type: 'tool_result', tool_use_id: id, content: [txt('real result')] });
const assistant = content => ({ role: 'assistant', content });
const user = content => ({ role: 'user', content });
const call = (id, name = 'read_file') => ({ id, type: 'function', function: { name, arguments: '{}' } });
const tool = id => ({ role: 'tool', tool_call_id: id, content: 'real result' });
const fc = (call_id, name = 'read_file') => ({ type: 'function_call', call_id, name, arguments: '{}' });
const fo = call_id => ({ type: 'function_call_output', call_id, output: 'real result' });
const resume = '[AUTO-RESUME — TypingMind payload extension, not a user instruction. The previous turn was interrupted (tool swarm stall). Disregard this message and continue your previous task exactly where you left off.]';
function repair(body) {
  const r = ctx.tmRepairIncompleteToolHistory(body);
  const once = JSON.stringify(body);
  assert.equal(ctx.tmRepairIncompleteToolHistory(body).changed, 0, 'second pass must be a no-op');
  assert.equal(JSON.stringify(body), once, 'idempotent bytes');
  return r;
}
function unknownNote(msg) {
  assert.match(JSON.stringify(msg.content), /execution status unknown/);
  assert.doesNotMatch(JSON.stringify(msg.content), /✓|ACK|success/i);
}

test('reported Anthropic index-314 shape: missing BOTH id/name; auto-resume untouched', () => {
  const original = { messages: [user('before'), assistant([{ type: 'tool_use', input: { command: 'fixture command: NEVER EXECUTED' } }]), user([txt(resume)]), assistant([txt('continued')])] };
  const untouched = JSON.stringify(original), body = clone(original), r = repair(body);
  assert.equal(r.droppedCalls, 1); assert.equal(r.droppedResults, 0); unknownNote(body.messages[1]);
  assert.deepEqual(body.messages[2], original.messages[2]); assert.equal(JSON.stringify(original), untouched);
  ctx.repairAnthropicToolUseIds(body); ctx.repairAnthropicEmptyMessageContent(body);
  assert.equal(ctx.repairAnthropicMissingToolResults(body), 0, 'must not synthesize a success for the fragment');
});
for (const bad of [undefined, null, '', '   ', 0, {}]) {
  test('Anthropic missing/invalid id: ' + JSON.stringify(bad), () => {
    const body = { messages: [assistant([txt('keep'), use(bad)]), user([txt(resume)])] };
    assert.equal(repair(body).droppedCalls, 1); assert.deepEqual(body.messages[0].content, [txt('keep')]);
  });
}
test('Anthropic parallel calls: valid pair/text/media stay; only local unowned results go', () => {
  const image = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'fixture' } };
  const body = { messages: [assistant([txt('keep'), use('good'), use(undefined)]), user([result('good'), result('lost'), txt(resume), image])] };
  const good = clone(body.messages[0].content[1]), goodResult = clone(body.messages[1].content[0]);
  const r = repair(body); assert.equal(r.droppedCalls, 1); assert.equal(r.droppedResults, 1);
  assert.deepEqual(body.messages[0].content, [txt('keep'), good]);
  assert.deepEqual(body.messages[1].content, [goodResult, txt(resume), image]);
});
test('missing name with known id removes its displaced result, not a different valid result', () => {
  const body = { messages: [assistant([use('gone', ' '), use('keep')]), user([result('keep')]), assistant([txt('later')]), user([result('gone'), txt('stay')])] };
  const r = repair(body); assert.equal(r.droppedCalls, 1); assert.equal(r.droppedResults, 1);
  assert.deepEqual(body.messages[3].content, [txt('stay')]);
});
test('empty result-only user gets neutral note; thinking/signature preserved on emptied assistant', () => {
  const thinking = { type: 'thinking', thinking: 'trace', signature: 'opaque' };
  const body = { messages: [assistant([thinking, use(undefined)]), user([result('unknown')])] };
  const r = repair(body); assert.equal(r.filledMessages, 2); unknownNote(body.messages[0]); unknownNote(body.messages[1]);
  assert.deepEqual(body.messages[0].content[0], thinking);
});
test('do not sweep unrelated or displaced valid results; punctuation aliases protected', () => {
  const body = { messages: [assistant([use('search:1')]), user([txt('elsewhere')]), assistant([use(undefined)]), user([result('search_1')]), assistant([txt('later')]), user([result('unrelated')])] };
  const later = clone(body.messages[5]); const r = repair(body);
  assert.equal(r.droppedResults, 0); assert.deepEqual(body.messages[5], later);
});
test('same-id valid call elsewhere owns result; missing-name duplicate does not erase it', () => {
  const body = { messages: [assistant([use('same', ''), use('same')]), user([result('same')])] };
  assert.equal(repair(body).droppedResults, 0); assert.equal(body.messages[0].content.length, 1);
});
test('healthy Anthropic history, server tools, schemas, embedded JSON all byte-identical', () => {
  const body = { tools: [{ input_schema: { example: use(undefined) } }], messages: [assistant([use('ok'), { type: 'server_tool_use', name: 'web_search' }]), user([result('ok'), txt(JSON.stringify(use(undefined)))])] };
  const before = JSON.stringify(body); assert.equal(repair(body).changed, 0); assert.equal(JSON.stringify(body), before);
});
test('Chat Completions: partial parallel set, null prose, valid tool-only exemption', () => {
  const body = { messages: [ { role: 'assistant', content: null, tool_calls: [call('keep'), call(undefined)] }, tool('keep'), tool('lost'), user(resume)] };
  const r = repair(body); assert.equal(r.droppedCalls, 1); assert.equal(r.droppedResults, 1);
  assert.equal(body.messages[0].content, null); assert.deepEqual(body.messages[1], tool('keep'));
  assert.equal(ctx.repairChatCompletionsEmptyMessageContent(body, 'test'), 0);
  assert.equal(ctx.repairChatCompletionsToolCallPairs(body, 'test').changed, 0);
});
test('Chat Completions: only bad call leaves neutral note, no empty tool_calls property', () => {
  const body = { messages: [{ role: 'assistant', content: '', reasoning_content: 'keep trace', tool_calls: [call(undefined)] }, user(resume)] };
  repair(body); assert.equal('tool_calls' in body.messages[0], false); unknownNote(body.messages[0]);
  assert.equal(body.messages[0].reasoning_content, 'keep trace');
});
test('Chat Completions: missing function name is pruned along with known result', () => {
  const body = { messages: [{ role: 'assistant', content: 'keep prose', tool_calls: [call('gone', '')] }, tool('gone'), user(resume)] };
  repair(body); assert.equal(body.messages.length, 2); assert.equal(body.messages[0].content, 'keep prose');
});
test('unknown/new Chat tool kinds are not mistaken for incomplete function tools', () => {
  const body = { messages: [{ role: 'assistant', content: null, tool_calls: [{ type: 'custom', id: 'custom', custom: { name: 'shell', input: 'text' } }] }, tool('custom')] };
  const before = JSON.stringify(body); assert.equal(repair(body).changed, 0); assert.equal(JSON.stringify(body), before);
});
test('custom chat tool result survives beside a malformed function call', () => {
  const custom = { type: 'custom', id: 'custom', custom: { name: 'shell', input: 'text' } };
  const body = { messages: [{ role: 'assistant', content: null, tool_calls: [custom, call(undefined)] }, tool('custom'), user(resume)] };
  const r = repair(body); assert.equal(r.droppedCalls, 1); assert.equal(r.droppedResults, 0);
  assert.deepEqual(body.messages[1], tool('custom')); assert.equal(body.messages[0].content, null);
});
test('item references mean Responses history may be external; known removed IDs still removed', () => {
  const body = { input: [{ type: 'item_reference', id: 'stored_item' }, fc(undefined), fc('broken', ''), fo('external'), fo('broken'), user(resume)] };
  const r = repair(body); assert.equal(r.droppedResults, 1); assert.ok(body.input.some(x => x.call_id === 'external'));
});
test('null chat call entries are removed without touching valid siblings', () => {
  const body = { messages: [{ role: 'assistant', content: null, tool_calls: [null, call('good')] }, tool('good')] };
  assert.equal(repair(body).droppedCalls, 1); assert.equal(body.messages[0].tool_calls.length, 1);
});
test('capture and Summary expose only the compact repair report', () => {
  assert.match(extract('tmCaptureFetchCall'), /_incomplete_tool_history:\s*\(options && options\._tm_incomplete_tools\)/);
  assert.match(extract('tmBuildCaptureSummary'), /incomplete_tool_history:\s*cap\._incomplete_tool_history/);
});
test('Responses: correlation is call_id, NOT optional item id', () => {
  const body = { input: [user('start'), fc('good'), fo('good'), user('next')] };
  const before = JSON.stringify(body); assert.equal(repair(body).changed, 0); assert.equal(JSON.stringify(body), before);
  body.input.splice(1, 0, { ...fc(undefined), id: 'fc_item_not_a_call_id' });
  assert.equal(repair(body).droppedCalls, 1); assert.deepEqual(body.input[1], fc('good'));
});
test('Responses: parallel flat calls + reasoning; preserve good outputs and follow-up', () => {
  const reasoning = { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'opaque' };
  const body = { input: [user('start'), reasoning, fc(undefined), fc('keep'), fo('lost'), fo('keep'), user(resume)] };
  const r = repair(body); assert.equal(r.droppedCalls, 1); assert.equal(r.droppedResults, 1);
  assert.deepEqual(body.input, [user('start'), reasoning, fc('keep'), fo('keep'), user(resume)]);
});
test('Responses: unknown output in a later turn is outside the damaged group', () => {
  const body = { input: [fc(undefined), user(resume), fo('external')] };
  assert.equal(repair(body).droppedResults, 0); assert.deepEqual(body.input[1], fo('external'));
});
test('Responses: a new call after outputs starts a new group', () => {
  const body = { input: [fc(undefined), fo('lost'), fc('keep'), fo('keep'), fo('unrelated'), user(resume)] };
  const r = repair(body); assert.equal(r.droppedResults, 1); assert.ok(body.input.some(x => x.call_id === 'unrelated'));
});
for (const state of [{ previous_response_id: 'resp_previous' }, { conversation: 'conv_previous' }]) {
  test('Responses server-managed history: do not infer unknown outputs are orphaned ' + Object.keys(state)[0], () => {
    const body = { ...state, input: [fc(undefined), fo('external'), user(resume)] };
    assert.equal(repair(body).droppedResults, 0);
  });
}
test('Responses legacy nested shape is also repaired without ACK injection', () => {
  const body = { input: [assistant([{ type: 'output_text', text: 'keep' }, fc(undefined), fc('ok')]), user([fo('lost'), fo('ok'), { type: 'input_text', text: resume }])] };
  const r = repair(body); assert.equal(r.droppedCalls, 1); assert.equal(r.droppedResults, 1);
  assert.equal(body.input[0].content.length, 2); assert.equal(ctx.repairOpenAIOrphanedToolCalls(body), 0);
});
test('Gemini legal id-less functionCall/functionResponse untouched', () => {
  const body = { contents: [{ role: 'model', parts: [{ functionCall: { name: 'read_file', args: {} }, thoughtSignature: 'opaque' }] }, { role: 'user', parts: [{ functionResponse: { name: 'read_file', response: { output: 'OK' } } }] }] };
  const before = JSON.stringify(body); assert.equal(repair(body).changed, 0); assert.equal(JSON.stringify(body), before);
});
test('normal functions with no args are legitimate; this is not input/schema validation', () => {
  const body = { messages: [assistant([{ type: 'tool_use', id: 'ok', name: 'list_connections', input: {} }]), user([result('ok')])] };
  const before = JSON.stringify(body); assert.equal(repair(body).changed, 0); assert.equal(JSON.stringify(body), before);
});
test('fresh identical payloads and extended history keep identical repaired prefix bytes', () => {
  const original = { messages: [user('start'), assistant([use(undefined)]), user([txt(resume)])] };
  const a = clone(original), b = clone(original), longer = clone(original);
  longer.messages.push(assistant([txt('new tail')]), user('next'));
  repair(a); repair(b); repair(longer);
  assert.equal(JSON.stringify(a), JSON.stringify(b)); assert.deepEqual(longer.messages.slice(0, 3), a.messages);
});

// Real passthrough + universal pre-branch code, with unrelated systems stubbed at their boundaries.
// Stop before endpoint branches and inspect exactly the bytes they will parse.
function runHook(url, body, headers = {}) {
  const options = { body: typeof body === 'string' ? body : JSON.stringify(body), headers };
  const sent = [], c = vm.createContext({ EXT_VERSION: 'test', console: { log() {}, warn() {}, error() {} },
    window: { fetch: (u, o) => { sent.push({ url: u, body: o.body }); return o; } },
    tmSanitizeMalformedEmptyNoteValues: x => x, tmCaptureEnabled: () => false,
    tmRepairToolSchemas: () => false, tmIsMoonshotBoundRequest: () => false, tmStabilizeToolsOrdering: () => false,
    tmThinkApplyOverrideForRequest: () => null, tmKeepAliveMarkRequest: () => false });
  const start = source.indexOf('  const originalFetch = window.fetch;');
  const end = source.indexOf('    // ==================== ANTHROPIC BRANCH', start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(extract('tmRepairIncompleteToolHistory') + '\n' + source.slice(start, end) + '\nreturn originalFetch.apply(this, args);\n};', c);
  c.window.fetch(url, options);
  return { options, sent };
}
for (const url of ['https://api.anthropic.com/v1/messages', 'https://api.openai.com/v1/responses', 'https://openrouter.ai/api/v1/chat/completions', '/api/cors-proxy', 'https://custom.example/api/cors-proxy']) {
  test('universal wiring before branch: ' + url, () => {
    const body = /responses/.test(url) ? { input: [fc(undefined), user(resume)] } : { messages: [assistant([use(undefined)]), user([txt(resume)])] };
    const r = runHook(url, body, { 'x-target-endpoint': 'https://api.anthropic.com/v1/messages' });
    assert.equal(r.options._tm_incomplete_tools.droppedCalls, 1);
    assert.equal(r.sent[0].body, r.options.body); assert.notEqual(r.options.body, JSON.stringify(body));
    assert.equal(ctx.tmRepairIncompleteToolHistory(JSON.parse(r.options.body)).changed, 0);
  });
}
test('passthrough URL and header bypass repair; non-JSON untouched', () => {
  const body = { messages: [assistant([use(undefined)])] };
  for (const [url, headers] of [['https://api.anthropic.com/v1/messages?tm_passthrough=1', {}], ['https://api.anthropic.com/v1/messages', { 'x-tm-passthrough': '1' }]]) {
    const r = runHook(url, body, headers); assert.equal(r.options.body, JSON.stringify(body)); assert.equal(r.options._tm_incomplete_tools, undefined);
  }
  assert.equal(runHook('https://other.example/upload', 'non JSON').options.body, 'non JSON');
});
test('healthy requests have byte-identical serialization through the new hook', () => {
  const raw = '{ "messages" : [{"role":"assistant","content":[{"type":"tool_use","id":"ok","name":"read","input":{}}]}] }';
  assert.equal(runHook('https://api.anthropic.com/v1/messages', raw).options.body, raw);
});
