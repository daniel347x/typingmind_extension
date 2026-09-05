// Regression: keep-alive must hand the DOM actuator the sidebar's raw Session ID,
// while retaining the original sid::model::host::route storage key.
// Runs extracted production functions against a small fake DOM; makes NO network calls.
// Usage: node fix25_keepalive_dom_identity_test.js <prompt-caching-header-fix.js>
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(process.argv[2], 'utf8');
function extract(name) {
  // These production functions are multiline declarations indented two spaces.
  // Their closing brace has the same indentation (nested blocks are deeper).
  const match = source.match(new RegExp('^  function ' + name + '\\([^\\n]*\\) \\{[\\s\\S]*?^  \\}', 'm'));
  if (!match) throw new Error('Function not found: ' + name);
  return match[0];
}
const funcs = [
  'tmKeepAliveNormSid', 'tmKeepAliveFirePing', 'tmQueueAutoContinue',
  'tmVisibleConversationHasSessionId', 'tmFindSidebarConversation',
  'tmActiveSidebarConversationHasSessionId', 'tmConversationVerified',
  'tmExecuteAutoContinue', 'tmWaitForConversationAndResume',
  'tmActiveSidebarSessionHash', 'tmNoteAutoResumeReturnBookmark'
];
let passed = 0, failed = 0;
function check(name, run) {
  try { run(); passed++; console.log('PASS ' + name); }
  catch (err) { failed++; console.error('FAIL ' + name + ': ' + err.message); }
}
function row(title) {
  const element = { textContent: title };
  return { offsetParent: {}, querySelector: () => element };
}
const title = '9b771fe5 - [Payload REDUX - 004]';
const rawSid = '9b771fe5';
const identity = 'tm-9b771fe5::claude-fable-5-1::api.anthropic.com::direct';
function createHarness({ sid = 'tm-9b771fe5', key = identity, selected = [title], all = [title], messages = [], management = true } = {}) {
  const store = { [key]: { enabled: true, sid, model: 'claude-fable-5-1', host: 'api.anthropic.com', interval_min: 2 } };
  const sent = [], queued = [], finishes = [], scrolled = [], navigated = [], bookmarks = [];
  const selectedRows = selected.map(row), allRows = all.map(row);
  const users = messages.map(text => ({ innerText: text, textContent: text }));
  const container = { querySelectorAll: () => users };
  let ctx;
  const sandbox = {
    console: { log() {}, warn() {} }, EXT_VERSION: 'test',
    TM_KEEPALIVE_SENTINEL: '[KEEP-ALIVE — TypingMind payload extension, not a user instruction. Test ping.]',
    tmKeepAliveStatus: {}, tmKeepAliveSkipLogged: {},
    tmAutoContinueActive: null, tmAutoContinueQueue: [],
    tmAutoResumeReturnBookmark: null,
    tmGetKeepAliveStore: () => JSON.parse(JSON.stringify(store)),
    tmSaveKeepAliveStore(s) { for (const k of Object.keys(store)) delete store[k]; Object.assign(store, JSON.parse(JSON.stringify(s))); },
    tmGetKeepAliveEntry: k => store[k] ? JSON.parse(JSON.stringify(store[k])) : null,
    tmSetKeepAliveEntry(k, e) { store[k] = JSON.parse(JSON.stringify(e)); },
    tmKeepAliveRefreshUI() {},
    tmKeepAliveHandlePingFailure(k, e, reason) { throw new Error('Unexpected ping failure: ' + reason); },
    tmAgentManagementEnabled: () => management,
    tmIsAutoResumeCancelled: () => false,
    tmFindVisibleChatContainer: () => container,
    document: {
      querySelectorAll(selector) {
        if (selector === '[data-element-id="selected-chat-item"]') return selectedRows;
        if (selector === '[data-element-id="custom-chat-item"], [data-element-id="selected-chat-item"]') return allRows;
        throw new Error('Unexpected DOM query: ' + selector);
      }
    },
    tmCaptureTranscriptFocusSnapshot() { bookmarks.push('focus saved'); },
    tmScrollSidebarForMatch(s, callback) { scrolled.push(s); callback([]); },
    tmClickSidebarMatch(item, match) {
      navigated.push(match.title);
      selectedRows.splice(0, selectedRows.length, match.row);
      ctx.tmWaitForConversationAndResume(item, match);
    },
    tmClickVisibleContinueButton: () => false,
    tmSubmitContinueIntoVisibleConversation(callback, text) { sent.push(text); callback(null); },
    tmRecordAutoResumeSuccess() { throw new Error('Keep-alive must not count as auto-resume'); },
    tmAutoResumeIsErrorReason: () => false,
    tmBuildAutoResumeText: () => '[AUTO-RESUME]',
    tmFinishAutoContinue(ok, error) { finishes.push({ ok, error }); ctx.tmAutoContinueActive = null; },
    // The live countdown already passed. Exercise its real downstream execute/verify/send path.
    tmProcessAutoContinueQueue() {
      if (ctx.tmAutoContinueActive || !ctx.tmAutoContinueQueue.length) return;
      const item = ctx.tmAutoContinueQueue.shift();
      queued.push({ sessionId: item.sessionId, reason: item.reason, text: item.text });
      ctx.tmAutoContinueActive = item;
      ctx.tmExecuteAutoContinue(item);
    },
    setTimeout() { throw new Error('Unexpected verification wait in test'); }
  };
  ctx = vm.createContext(sandbox);
  vm.runInContext(funcs.map(extract).join('\n'), ctx);
  return { ctx, store, key, sent, queued, finishes, scrolled, navigated, bookmarks, selectedRows };
}

check('reported title + internal tm- alias reaches the existing visible conversation', () => {
  const h = createHarness(); h.ctx.tmKeepAliveFirePing(h.key);
  assert.equal(h.queued[0].sessionId, rawSid);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0], h.ctx.TM_KEEPALIVE_SENTINEL);
  assert.equal(h.finishes[0].ok, true);
  assert.equal(h.scrolled.length, 0, 'must not search a sidebar for the already-active conversation');
});
check('alias translation does not rename persisted identity keys or entry.sid', () => {
  const h = createHarness(); h.ctx.tmKeepAliveFirePing(h.key);
  assert.deepEqual(Object.keys(h.store), [identity]);
  assert.equal(h.store[identity].sid, 'tm-9b771fe5');
  assert.equal(h.store[identity].pending_ping.key, identity);
});
check('already-raw ID still works', () => {
  const h = createHarness({ sid: rawSid }); h.ctx.tmKeepAliveFirePing(h.key);
  assert.equal(h.sent.length, 1); assert.equal(h.queued[0].sessionId, rawSid);
});
check('missing entry.sid falls back to the identity key and removes one tm- prefix', () => {
  const h = createHarness({ sid: null }); h.ctx.tmKeepAliveFirePing(h.key);
  assert.equal(h.sent.length, 1); assert.equal(h.queued[0].sessionId, rawSid);
});
check('whitespace and uppercase internal alias normalize correctly', () => {
  const h = createHarness({ sid: '  TM-9B771FE5  ' }); h.ctx.tmKeepAliveFirePing(h.key);
  assert.equal(h.sent.length, 1); assert.equal(h.queued[0].sessionId, rawSid);
});
check('visible Session ID line verifies when the first sidebar row is not mounted', () => {
  const h = createHarness({ selected: [], all: [], messages: ['Load GLIMPSE\nSession ID: 9b771fe5 - [Payload REDUX - 004]'] });
  h.ctx.tmKeepAliveFirePing(h.key);
  assert.equal(h.sent.length, 1); assert.equal(h.scrolled.length, 0);
});
check('background target navigates and verifies using the raw title prefix', () => {
  const h = createHarness({ selected: ['aaaaaaaa - [Other session]'], all: ['aaaaaaaa - [Other session]', title] });
  h.ctx.tmKeepAliveFirePing(h.key);
  assert.equal(h.sent.length, 1); assert.deepEqual(h.navigated, [title]);
  assert.equal(h.ctx.tmAutoResumeReturnBookmark.sid, 'aaaaaaaa');
});
check('active target is not mistakenly bookmarked as somewhere else', () => {
  const h = createHarness(); h.ctx.tmKeepAliveFirePing(h.key);
  assert.equal(h.ctx.tmAutoResumeReturnBookmark, null);
  assert.equal(h.bookmarks.length, 0);
});
check('nonmatching conversation remains a refusal, not a loose substring match', () => {
  const h = createHarness({ selected: ['aaaaaaaa - [Other session]'], all: ['aaaaaaaa - [mentions 9b771fe5 here]'] });
  h.ctx.tmKeepAliveFirePing(h.key);
  assert.equal(h.sent.length, 0); assert.equal(h.finishes[0].ok, false);
  assert.match(h.finishes[0].error, /sidebar conversation not found/);
});
check('two matching sidebar rows still fail closed as ambiguous', () => {
  const h = createHarness({ selected: ['aaaaaaaa - [Other session]'], all: [title, '9b771fe5 - [Duplicate title]'] });
  h.ctx.tmKeepAliveFirePing(h.key);
  assert.equal(h.sent.length, 0); assert.match(h.finishes[0].error, /ambiguous/);
});
check('normalized-empty alias refuses to queue or send', () => {
  const h = createHarness({ sid: 'tm-' }); h.ctx.tmKeepAliveFirePing(h.key);
  assert.equal(h.queued.length, 0); assert.equal(h.sent.length, 0);
  assert.match(h.ctx.tmKeepAliveStatus[h.key].text, /no Session ID/);
});
check('KA still works independently of the agent-management toggle', () => {
  const h = createHarness({ management: false }); h.ctx.tmKeepAliveFirePing(h.key);
  assert.equal(h.sent.length, 1); assert.equal(h.finishes[0].ok, true);
});
console.log(`\n${passed} passed; ${failed} failed`);
process.exitCode = failed ? 1 : 0;
