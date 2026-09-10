'use strict';
// Execute production functions, not a second implementation of the shield.
// node --test tests/sse_done_marker_guard.test.cjs is also supported with env paths.
// node tests/sse_done_marker_guard.test.cjs <extension.js> [private-response.txt]
// All checks are offline: no browser, credentials, provider calls, or tool execution.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const source = fs.readFileSync(process.env.TM_PAYLOAD_SOURCE || process.argv[2] || path.join(__dirname, '..', 'prompt-caching-header-fix.js'), 'utf8');
function extract(name) {
  const m = source.match(new RegExp('^  function ' + name + '\\([^\\n]*\\) \\{[\\s\\S]*?^  \\}', 'm'));
  if (!m) throw new Error('Missing production function: ' + name);
  return m[0];
}
function context(extra = {}) {
  const c = vm.createContext({ TransformStream, ReadableStream, Response, Headers, TextDecoder, TextEncoder, Uint8Array,
    console: { log() {}, warn() {} }, EXT_VERSION: 'test',
    localStorage: { getItem() { return null; } }, tmUpdateCaptureRecord() {}, ...extra });
  vm.runInContext(extract('tmCreateSseDoneMarkerGuard') + '\n' + extract('tmWrapSseDoneMarkerResponse'), c);
  return c;
}
const ctx = context();
const DONE = '[DONE]';
const escaped = '\\u005bDONE\\u005d';
const frame = obj => 'data: ' + JSON.stringify(obj) + '\n\n';
const terminal = 'data: ' + DONE + '\n\n';
function stream(chunks, onCancel) {
  let i = 0;
  return new ReadableStream({ pull(c) { if (i < chunks.length) c.enqueue(chunks[i++]); else c.close(); }, cancel: onCancel });
}
async function collect(readable) {
  const chunks = []; const reader = readable.getReader();
  while (true) { const r = await reader.read(); if (r.done) break; chunks.push(Buffer.from(r.value)); }
  return Buffer.concat(chunks);
}
function chop(bytes, count) {
  const chunks = [];
  for (let i = 0; i < bytes.length; i += count) chunks.push(bytes.subarray(i, i + count));
  return chunks;
}
async function shield(value, chunkSize = 17, limit) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const diagnostics = [];
  const result = await collect(stream(chop(bytes, chunkSize)).pipeThrough(ctx.tmCreateSseDoneMarkerGuard(x => diagnostics.push(x), limit)));
  return { bytes: result, text: result.toString('utf8'), diagnostics };
}
// Independent test-side SSE interpretation, with multiline data and all newline forms.
function payloads(text) {
  return text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/).reduce((s, line) => {
    if (line === '') { if (s.data.length) s.out.push(s.data.join('\n')); s.data = []; }
    else if (line === 'data') s.data.push('');
    else if (line.startsWith('data:')) s.data.push(line.slice(5).replace(/^ /, ''));
    return s;
  }, { out: [], data: [] }).out;
}
function events(text) { return payloads(text).filter(p => p.trim() !== DONE).map(p => JSON.parse(p)); }
function argsFromEvents(list) {
  return list.flatMap(e => e.choices || []).flatMap(c => (c.delta?.tool_calls || [])
    .filter(t => (t.index || 0) === 0).map(t => t.function?.arguments || '')).join('');
}
function brokenConsumer(text) {
  const got = [];
  for (const p of payloads(text)) { if (p.includes(DONE)) break; got.push(JSON.parse(p)); }
  return argsFromEvents(got);
}
function toolDelta(argumentsPart) {
  return { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: argumentsPart } }] }, finish_reason: null }] };
}
const request = JSON.stringify({ verb: 'etch', params: JSON.stringify({ parent_handle: 'scratch', nodes: [{ name: 'probe', note: 'BEFORE\n' + 'b"data: ' + DONE + '\\n\\n"\nAFTER' }] }) });
const markerAt = request.indexOf(DONE);
const fixture = ': processing\n\n' + frame(toolDelta(request.slice(0, markerAt))) + frame(toolDelta(request.slice(markerAt, markerAt + 8))) +
  frame(toolDelta(request.slice(markerAt + 8))) + frame({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }) + terminal;

test('valid nested tool JSON survives a broad premature-DONE detector after shielding', async () => {
  assert.throws(() => JSON.parse(brokenConsumer(fixture)));
  const r = await shield(fixture, 1);
  assert.equal(brokenConsumer(r.text), request);
  assert.deepEqual(events(r.text), events(fixture));
  assert.equal(JSON.parse(JSON.parse(brokenConsumer(r.text)).params).nodes[0].note, 'BEFORE\nb"data: [DONE]\\n\\n"\nAFTER');
  assert.equal(r.diagnostics.filter(d => d.replacements).length, 1);
});

test('content, reasoning, reasoning_details, and tool arguments are all covered', async () => {
  const f = frame({ choices: [{ delta: { content: DONE, reasoning: DONE, reasoning_details: [{ text: DONE }],
    tool_calls: [{ function: { arguments: DONE } }] } }] }) + terminal;
  const r = await shield(f);
  assert.deepEqual(events(r.text), events(f));
  assert.equal(r.diagnostics[0].replacements, 4);
  assert.equal(payloads(r.text).filter(p => p.includes(DONE)).length, 1);
});

test('every two-chunk byte split handles marker, UTF-8 and CRLF boundaries', async () => {
  const f = '\uFEFF: note\r\ndata: ' + JSON.stringify({ text: '前🙂' + DONE + 'é後' }) + '\r\n\r\n' + 'data: [DONE]\r\n\r\n';
  const bytes = Buffer.from(f);
  const expected = (await shield(bytes, bytes.length)).bytes;
  for (let i = 0; i <= bytes.length; i++) {
    const actual = await collect(stream([bytes.subarray(0, i), bytes.subarray(i)]).pipeThrough(ctx.tmCreateSseDoneMarkerGuard()));
    assert.deepEqual(actual, expected, 'split=' + i);
  }
  assert.deepEqual(events(expected.toString('utf8')), events(f));
  assert.deepEqual(expected.subarray(0, 3), Buffer.from([0xef, 0xbb, 0xbf]));
});

for (const nl of ['\n', '\r\n', '\r']) {
  test('single-byte chunks preserve newline framing ' + JSON.stringify(nl), async () => {
    const f = ': comment' + nl + nl + 'event: chunk' + nl + 'id: 123' + nl + 'data:{"v":"[DONE]"}' + nl + nl + 'data: [DONE]' + nl + nl;
    const r = await shield(f, 1);
    assert.equal(r.text, f.replace('{"v":"[DONE]"}', '{"v":"' + escaped + '"}'));
    assert.deepEqual(events(r.text), events(f));
  });
}

test('multiline JSON data is validated as one event; non-data fields stay exact', async () => {
  const f = 'event: chunk\r\nid: abc\r\nretry: 3000\r\n: keep\r\ndata: {\r\ndata: "x": "[DONE]"\r\ndata: }\r\n\r\n' + terminal;
  const r = await shield(f, 2);
  assert.equal(r.text, f.replace('"[DONE]"', '"' + escaped + '"'));
  assert.deepEqual(events(r.text), events(f));
});

test('bare data field, tabs, CRLF and mixed endings follow SSE field rules', async () => {
  const f = 'data\r\ndata:\t{\ndata: "x":"[DONE]"\rdata: }\r\n\n';
  const r = await shield(f, 1);
  assert.deepEqual(events(r.text), events(f));
  assert.equal(r.diagnostics[0].replacements, 1);
});

test('genuine terminators are byte-identical, with optional field space and whitespace', async () => {
  for (const f of [terminal, 'data:[DONE]\r\n\r\n', 'data:  [DONE] \t\n\n', 'data: [DONE]']) {
    const r = await shield(f, 1);
    assert.equal(r.text, f);
    assert.equal(r.diagnostics.length, 0);
  }
});

test('marker-free events, comment/id markers, and already-escaped strings are untouched', async () => {
  for (const f of [frame({ x: 'ordinary 🙂 text' }), ': [DONE]\n\nid: [DONE]\ndata: {"x":1}\n\n',
    'data: {"x":"\\u005bDONE\\u005d"}\n\n']) {
    const r = await shield(f, 1);
    assert.equal(r.text, f);
    assert.equal(r.diagnostics.length, 0);
  }
});

test('pre-existing slashes, quotes, JSON string roots and keys preserve semantics', async () => {
  const values = [DONE, { [DONE]: DONE }, ['x', DONE], { text: '"' + DONE + '"' }];
  for (let n = 0; n < 8; n++) values.push({ text: '\\'.repeat(n) + DONE + '\\u005b' });
  for (const value of values) {
    const f = frame(value);
    const r = await shield(f, 3);
    assert.deepEqual(events(r.text), [value]);
    assert.equal(r.text.includes(DONE), false);
  }
});

test('malformed/non-JSON data passes through with a bypass diagnostic', async () => {
  const f = 'data: {"x":"[DONE]"\n\n' + 'data: plain [DONE] text\n\n' + frame({ x: DONE });
  const r = await shield(f, 3);
  assert.equal(r.text, f.replace(frame({ x: DONE }), frame({ x: DONE }).replace(DONE, escaped)));
  assert.equal(r.diagnostics.filter(x => x.bypass === 'non_json_data').length, 2);
});

test('invalid UTF-8 passes through exactly and does not poison the following event', async () => {
  const invalid = Buffer.concat([Buffer.from('data: {"x":"'), Buffer.from([0xff]), Buffer.from('[DONE]"}\n\n')]);
  const r = await shield(Buffer.concat([invalid, Buffer.from(frame({ x: DONE }))]), 1);
  assert.deepEqual(r.bytes.subarray(0, invalid.length), invalid);
  assert.equal(r.diagnostics[0].bypass, 'invalid_utf8');
  assert.equal(r.diagnostics[1].replacements, 1);
});

test('EOF tails flush without loss, including incomplete UTF-8 and trailing CR', async () => {
  for (const tail of [Buffer.from('data: {"x":"unfinished [DONE]'), Buffer.from('data: [DONE]\r'), Buffer.from([0xe2, 0x82])]) {
    const r = await shield(tail, 1);
    assert.deepEqual(r.bytes, tail);
  }
  const validTail = 'data: {"x":"[DONE]"}';
  assert.equal((await shield(validTail, 1)).text, validTail.replace(DONE, escaped));
});

test('oversized event is streamed verbatim once; shielding resumes at next event', async () => {
  const big = frame({ text: 'x'.repeat(160) + DONE });
  const small = frame({ text: DONE });
  const r = await shield(big + small + terminal, 7, 64);
  assert.equal(r.text, big + small.replace(DONE, escaped) + terminal);
  assert.equal(r.diagnostics.filter(d => d.bypass === 'event_too_large').length, 1);
  assert.equal(r.diagnostics.filter(d => d.replacements).length, 1);
});

test('oversize fallback emits bytes BEFORE upstream closes', async () => {
  let input;
  const upstream = new ReadableStream({ start(c) { input = c; } });
  const reader = upstream.pipeThrough(ctx.tmCreateSseDoneMarkerGuard(null, 32)).getReader();
  input.enqueue(Buffer.from('data: ' + 'x'.repeat(40)));
  const first = await reader.read();
  assert.equal(first.value.length, 46);
  input.close();
  assert.equal((await reader.read()).done, true);
});

test('a complete event is delivered without waiting for response EOF', async () => {
  let input;
  const upstream = new ReadableStream({ start(c) { input = c; } });
  const reader = upstream.pipeThrough(ctx.tmCreateSseDoneMarkerGuard()).getReader();
  input.enqueue(Buffer.from(frame({ text: DONE })));
  const first = await reader.read();
  assert.equal(Buffer.from(first.value).toString(), frame({ text: DONE }).replace(DONE, escaped));
  input.close();
  assert.equal((await reader.read()).done, true);
});

test('downstream cancellation propagates to original stream', async () => {
  let reason;
  const upstream = new ReadableStream({ pull(c) { c.enqueue(Buffer.from(frame({ x: DONE }))); }, cancel(r) { reason = r; } });
  const reader = upstream.pipeThrough(ctx.tmCreateSseDoneMarkerGuard()).getReader();
  await reader.read();
  await reader.cancel('operator-stop');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reason, 'operator-stop');
});

test('upstream stream errors propagate; no fabricated completion', async () => {
  const upstream = new ReadableStream({ start(c) { c.error(new Error('upstream-broken')); } });
  await assert.rejects(collect(upstream.pipeThrough(ctx.tmCreateSseDoneMarkerGuard())), /upstream-broken/);
});

test('diagnostic exceptions cannot damage output', async () => {
  const out = await collect(stream([Buffer.from(frame({ x: DONE }))]).pipeThrough(ctx.tmCreateSseDoneMarkerGuard(() => { throw Error('observer'); })));
  assert.deepEqual(events(out.toString()), [{ x: DONE }]);
});

test('response wrapper preserves metadata, drops content-length, stamps counts, and raw clone is unchanged', async () => {
  const patches = [];
  const c = context({ tmUpdateCaptureRecord: (id, p) => patches.push({ id, p }) });
  const original = new Response(stream(chop(Buffer.from(fixture), 11)), { status: 200, statusText: 'OK', headers: {
    'Content-Type': 'text/event-stream; charset=utf-8', 'Content-Length': Buffer.byteLength(fixture).toString(), 'X-Probe': 'kept' } });
  const rawCapture = original.clone().text();
  const result = c.tmWrapSseDoneMarkerResponse(original, 'cap-test');
  assert.equal(result.status, 200);
  assert.equal(result.statusText, 'OK');
  assert.equal(result.headers.get('x-probe'), 'kept');
  assert.equal(result.headers.has('content-length'), false);
  assert.equal(brokenConsumer(await result.text()), request);
  assert.equal(await rawCapture, fixture);
  assert.equal(patches[0].id, 'cap-test');
  assert.equal(patches.at(-1).p._sse_done_guard.replacements, 1);
});

test('non-SSE, null body, locked body, and opt-out retain original Response identity', async () => {
  for (const r of [new Response('{}', { headers: { 'Content-Type': 'application/json' } }), new Response(null)]) {
    assert.equal(ctx.tmWrapSseDoneMarkerResponse(r, 'cap'), r);
  }
  const r = new Response(fixture, { headers: { 'Content-Type': 'text/event-stream' } });
  const reader = r.body.getReader();
  assert.equal(ctx.tmWrapSseDoneMarkerResponse(r, 'cap'), r);
  await reader.cancel();
  const disabled = context({ localStorage: { getItem(k) { assert.equal(k, 'tm_sse_done_guard_enabled'); return 'false'; } } });
  const untouched = new Response(fixture, { headers: { 'Content-Type': 'text/event-stream' } });
  assert.equal(disabled.tmWrapSseDoneMarkerResponse(untouched, 'cap'), untouched);
  assert.equal(await untouched.text(), fixture);
});

test('capture disabled or inaccessible localStorage does not disable shielding', async () => {
  const c = context({ localStorage: { getItem() { throw Error('storage disabled'); } } });
  const r = c.tmWrapSseDoneMarkerResponse(new Response(fixture, { headers: { 'Content-Type': 'text/event-stream' } }), null);
  assert.equal(brokenConsumer(await r.text()), request);
});

test('actual response-chain fragment preserves raw capture and shields final retried response', async () => {
  const begin = source.indexOf('    var fetchPromiseCaptured = fetchPromise.then(function(response) {');
  const end = source.indexOf("    if (url.includes('api.openai.com')", begin);
  assert.ok(begin > 0 && end > begin);
  const fragment = source.slice(begin, end);
  const observations = [];
  const response = new Response(fixture, { headers: { 'Content-Type': 'text/event-stream' } });
  const c = context({ fetchPromise: Promise.resolve(response), captureId: 'cap-chain',
    url: 'https://openrouter.ai/api/v1/chat/completions', args: [], shouldSanitizeSolProUsage: false,
    shouldGuardKimiToolIds: false, oversizedGuardReportForThisCall: null, continuitySessionIdForThisCall: 'session',
    tmCaptureResponse: (id, r) => observations.push(r.clone().text()),
    tmMaybeAutoRetry: async () => new Response(fixture, { headers: { 'Content-Type': 'text/event-stream' } }),
    tmTapContinuitySignals: r => r });
  const result = await vm.runInContext('(async function(){\n' + fragment + '\nreturn fetchPromiseContinuityTapped;})()', c);
  assert.equal(brokenConsumer(await result.text()), request);
  assert.equal(await observations[0], fixture);
  // Raw capture stays ahead of retry; shield is after tool-ID guard and before the observer.
  assert.ok(fragment.indexOf('tmCaptureResponse(') < fragment.indexOf('tmMaybeAutoRetry('));
  assert.ok(fragment.indexOf('tmWrapKimiToolIdResponse(') < fragment.indexOf('tmWrapSseDoneMarkerResponse('));
  assert.ok(fragment.indexOf('tmWrapSseDoneMarkerResponse(') < fragment.indexOf('tmTapContinuitySignals('));
});

test('version markers agree', () => {
  const header = source.match(/^\/\/ Version: (\S+)/m)[1];
  const runtime = source.match(/const EXT_VERSION = '([^']+)'/)[1];
  assert.equal(runtime, header);
});

test('shielding is idempotent and capture Summary exposes counts without changing stored observations', async () => {
  const first = await shield(fixture, 13);
  const second = await shield(first.bytes, 1);
  assert.deepEqual(second.bytes, first.bytes);
  assert.equal(second.diagnostics.length, 0);
  const c = context({ tmCaptureModel: () => 'model' });
  vm.runInContext(extract('tmBuildCaptureSummary'), c);
  const cap = { _sse_done_guard: { events: 1, replacements: 1, bypassed: 0 }, _think_obs: { visible_chars: 77 } };
  const before = JSON.stringify(cap);
  const summary = c.tmBuildCaptureSummary(cap);
  assert.equal(summary.sse_done_guard.replacements, 1);
  assert.equal(summary.think_obs.visible_chars, 77);
  assert.equal(JSON.stringify(cap), before);
  assert.equal(c.tmBuildCaptureSummary({}).sse_done_guard, null);
});

test('deterministic randomized event/chunk composition preserves bytes and semantic events', async () => {
  let seed = 123456789;
  const next = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  for (let trial = 0; trial < 40; trial++) {
    let f = '', expected = '';
    for (let i = 0; i < 20; i++) {
      const nl = ['\n', '\r\n', '\r'][next(3)];
      const obj = { value: '🙂-' + i + '-' + (next(2) ? DONE : 'ordinary') + '\\'.repeat(next(4)) };
      const json = JSON.stringify(obj);
      const prefix = ': comment' + nl + 'data: ';
      f += prefix + json + nl + nl;
      expected += prefix + json.replaceAll(DONE, escaped) + nl + nl;
    }
    f += terminal; expected += terminal;
    const bytes = Buffer.from(f), pieces = [];
    for (let i = 0; i < bytes.length;) { const n = 1 + next(97); pieces.push(bytes.subarray(i, i + n)); i += n; }
    const out = await collect(stream(pieces).pipeThrough(ctx.tmCreateSseDoneMarkerGuard()));
    assert.equal(out.toString(), expected);
    assert.deepEqual(events(out.toString()), events(f));
  }
});

const privateFixture = process.env.TM_SSE_RECORDED_RESPONSE || process.argv[3];
test('private recorded failure: valid 259-char arguments; faulty consumer stops at 217; shield restores exact call', { skip: !privateFixture }, async () => {
  const f = fs.readFileSync(privateFixture, 'utf8');
  const originalArgs = argsFromEvents(events(f));
  assert.equal(originalArgs.length, 259);
  assert.equal(brokenConsumer(f).length, 217);
  const outer = JSON.parse(originalArgs);
  const inner = JSON.parse(outer.params);
  assert.equal(outer.verb, 'etch');
  assert.ok(inner.nodes[0].note.endsWith('PROBE_AFTER'));
  for (const n of [1, 7, 64, 1024, Buffer.byteLength(f)]) {
    const r = await shield(f, n);
    assert.equal(brokenConsumer(r.text), originalArgs);
    assert.deepEqual(events(r.text), events(f));
    assert.equal(payloads(r.text).filter(p => p.trim() === DONE).length, 1);
    assert.equal(r.diagnostics.filter(d => d.replacements).length, 1);
  }
});
