// Regression: (v4.422) KEEP-ALIVE IS A SINGLETON PER CONVERSATION.
// The store has always been keyed per identity (sid::model::host::proxy). The v4.394 toggle armed
// EVERY sibling of a session; v4.422 narrows that -- arming affects only the clicked row, disarming
// still disarms the whole conversation, and every REAL (non-ping) outbound turn stands down the
// older siblings, because the DOM actuator can only submit to the model TypingMind has SELECTED.
// Left armed, a stale sibling could win the sweep's per-sid dedupe and impose ITS interval on the
// active model (a 4-minute Kimi entry pinging an active Claude every 4 minutes).
// Also covers the v4.411 arm-from-real-activity clock and per-model::host interval inheritance.
// Runs extracted production functions against a fake store; makes NO network calls.
// Usage: node ka_singleton.test.cjs <prompt-caching-header-fix.js>
const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(process.argv[2], 'utf8');

// Brace-BALANCED extraction (see global_reasoning_analytics.test.cjs for why the regex fails).
function extract(name) {
  const i = source.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('Function not found: ' + name);
  const from = source.lastIndexOf('\n', i) + 1;
  const open = source.indexOf('{', i);
  if (open < 0) throw new Error('Body not found: ' + name);
  let depth = 0;
  for (let j = open; j < source.length; j++) {
    const ch = source[j];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return source.slice(from, j + 1); }
  }
  throw new Error('Unbalanced braces: ' + name);
}

const FUNCS = [
  'tmGetKeepAliveStore', 'tmSaveKeepAliveStore', 'tmGetKeepAliveEntry', 'tmSetKeepAliveEntry',
  'tmKeepAliveNormSid', 'tmKeepAliveSameIdentity', 'tmKeepAliveSidOfEntry', 'tmKeepAliveSidOfKey',
  'tmKeepAliveSameSid', 'tmKeepAliveInheritInterval', 'tmKeepAliveNoteRealTurn',
  'tmKeepAliveHandleToggle'
];

let pass = 0, fail = 0;
function test(name, run) {
  try { run(); pass++; console.log('PASS ' + name); }
  catch (e) { fail++; console.error('FAIL ' + name + ': ' + e.message); }
}

const SID = '9b771fe5';
const KIMI = 'tm-' + SID + '::moonshotai/kimi-k3::api.moonshot.ai::direct';
const CLAUDE = 'tm-' + SID + '::claude-fable-5-1::api.anthropic.com::direct';
const OTHER = 'tm-aaaaaaaa::claude-fable-5-1::api.anthropic.com::direct';

// opts.activityTs feeds the arm-from-real-activity clock; opts.store seeds the KA store.
function env(opts) {
  opts = opts || {};
  const data = {};
  const statuses = [];
  const logs = [];
  const sandbox = {
    console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push('WARN ' + a.join(' ')) },
    EXT_VERSION: 'test',
    TM_KEEPALIVE_KEY: 'tm_keepalive_v1',
    localStorage: { getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: k => { delete data[k]; } },
    tmSessionCtxHoverIdentities: opts.identities || {},
    // The arm path reads real activity through this; the test drives it explicitly.
    tmKeepAliveRecentActivityTs: () => (opts.activityTs || 0),
    tmKeepAliveSetStatus: (key, st) => { statuses.push({ key, text: st && st.text, tone: st && st.tone }); },
    tmKeepAliveEnsureSweeper: () => {},
    tmKeepAliveRefreshUI: () => {},
    tmKeepAliveSkipLogged: {}
  };
  if (opts.store) data[sandbox.TM_KEEPALIVE_KEY] = JSON.stringify(opts.store);
  const ctx = vm.createContext(sandbox);
  vm.runInContext(FUNCS.map(extract).join('\n'), ctx);
  sandbox.store = () => JSON.parse(data[sandbox.TM_KEEPALIVE_KEY] || '{}');
  sandbox.statuses = statuses;
  sandbox.logs = logs;
  return sandbox;
}

// ---- the toggle: arm is per-entry, disarm is per-conversation ------------------------------
test('ARM affects ONLY the clicked entry (v4.394 arm-all is retired)', () => {
  const s = env({ identities: { [KIMI]: { sid: SID, model: 'moonshotai/kimi-k3', host: 'api.moonshot.ai', isProxy: false } } });
  s.tmKeepAliveHandleToggle(KIMI);
  const st = s.store();
  assert.equal(st[KIMI].enabled, true);
  assert.equal(st[CLAUDE], undefined, 'a sibling must NOT be created or armed by arming another row');
});

test('DISARM is still conversation-scoped (the overnight-burn fix stands)', () => {
  const s = env({
    store: {
      [KIMI]: { enabled: true, sid: SID, model: 'moonshotai/kimi-k3', host: 'api.moonshot.ai', interval_min: 4, _ts: 2 },
      [CLAUDE]: { enabled: true, sid: SID, model: 'claude-fable-5-1', host: 'api.anthropic.com', interval_min: 50, _ts: 1 }
    }
  });
  s.tmKeepAliveHandleToggle(KIMI); // Kimi is ON, so this is a DISARM
  const st = s.store();
  assert.equal(st[KIMI].enabled, false);
  assert.equal(st[CLAUDE].enabled, false, 'disarming one row must disarm every sibling of the session');
  assert.match(st[CLAUDE].stopped_reason, /sibling of/);
});

test('disarming one conversation never touches a DIFFERENT conversation', () => {
  const s = env({
    store: {
      [KIMI]: { enabled: true, sid: SID, interval_min: 4, _ts: 2 },
      [OTHER]: { enabled: true, sid: 'aaaaaaaa', interval_min: 50, _ts: 1 }
    }
  });
  s.tmKeepAliveHandleToggle(KIMI);
  const st = s.store();
  assert.equal(st[KIMI].enabled, false);
  assert.equal(st[OTHER].enabled, true, 'a different session id must stay armed');
});

// ---- the pruning rule on a real turn -------------------------------------------------------
test('a REAL outbound turn stands down the armed older sibling of that session', () => {
  const s = env({
    store: {
      [KIMI]: { enabled: true, sid: SID, model: 'moonshotai/kimi-k3', host: 'api.moonshot.ai', interval_min: 4, _ts: 1 },
      [CLAUDE]: { enabled: false, sid: SID, model: 'claude-fable-5-1', host: 'api.anthropic.com', _ts: 1 }
    }
  });
  // Claude is the model that just sent: it is now the active one.
  s.tmKeepAliveNoteRealTurn(CLAUDE, SID, false);
  const st = s.store();
  assert.equal(st[KIMI].enabled, false, 'the unreachable older sibling must be disarmed');
  assert.match(st[KIMI].stopped_reason, /^auto-off: superseded/);
  assert.match(st[KIMI].stopped_reason, /kimi-k3/, 'the reason names the model that was stood down');
  assert.match(s.logs.join('\n'), /auto-off for 1 superseded sibling/, 'the disarm is logged, never silent');
});

test('a real turn still advances the idle clock on EVERY entry of the session', () => {
  const s = env({ store: { [KIMI]: { enabled: true, sid: SID, last_turn_ts: 1, _ts: 1 }, [CLAUDE]: { enabled: false, sid: SID, _ts: 1 } } });
  const before = Date.now();
  s.tmKeepAliveNoteRealTurn(CLAUDE, SID, false);
  const st = s.store();
  assert.ok(st[KIMI].last_turn_ts >= before, 'the armed sibling keeps an accurate idle clock');
  assert.ok(st[CLAUDE].last_turn_ts >= before, 'and so does the active entry');
});

test('a PING turn never prunes (a ping key IS the armed entry)', () => {
  const s = env({
    store: {
      [KIMI]: { enabled: true, sid: SID, interval_min: 4, _ts: 1 },
      [CLAUDE]: { enabled: true, sid: SID, interval_min: 50, _ts: 1 }
    }
  });
  s.tmKeepAliveNoteRealTurn(KIMI, SID, true);
  const st = s.store();
  assert.equal(st[KIMI].enabled, true);
  assert.equal(st[CLAUDE].enabled, true, 'a ping must not disarm the sibling');
  // pending_ping is SESSION-WIDE by design (v4.374): marking every entry of the session is what
  // stops the sweeper from double-firing while one ping is in flight. It carries the FIRING key, so
  // tmKeepAliveRecordPingResult can pair the response exact-first, then fall back to any pending
  // entry of the same session.
  assert.ok(st[KIMI].pending_ping, 'the firing entry is flagged');
  assert.equal(st[KIMI].pending_ping.key, KIMI);
  assert.ok(st[CLAUDE].pending_ping, 'siblings are flagged too, to block a second fire');
  assert.equal(st[CLAUDE].pending_ping.key, KIMI, 'but the flag names the entry that actually fired');
  assert.equal(st[CLAUDE].last_turn_ts, undefined, 'a ping does NOT advance the idle clock');
});

test('a real turn on an UNRELATED session prunes nothing', () => {
  const s = env({ store: { [KIMI]: { enabled: true, sid: SID, _ts: 1 }, [OTHER]: { enabled: true, sid: 'aaaaaaaa', _ts: 1 } } });
  s.tmKeepAliveNoteRealTurn(OTHER, 'aaaaaaaa', false);
  const st = s.store();
  assert.equal(st[KIMI].enabled, true, 'a different conversation is untouched');
  assert.equal(st[OTHER].enabled, true);
});

// ---- identity comparison -------------------------------------------------------------------
test('tmKeepAliveSameIdentity is tm- alias tolerant but exact on model/host/proxy', () => {
  const s = env();
  assert.equal(s.tmKeepAliveSameIdentity(KIMI, KIMI), true);
  assert.equal(s.tmKeepAliveSameIdentity(KIMI, KIMI.replace('tm-' + SID, SID)), true, 'raw vs tm- sid are the same identity');
  assert.equal(s.tmKeepAliveSameIdentity(KIMI, CLAUDE), false, 'same conversation, different model');
  assert.equal(s.tmKeepAliveSameIdentity(KIMI, KIMI.replace('::direct', '::proxy')), false, 'proxy is part of the identity');
  assert.equal(s.tmKeepAliveSameIdentity(KIMI, OTHER), false, 'different conversation');
});

// ---- the two v4.411 behaviors this path also owns ------------------------------------------
test('arming 45 min into a 50-min interval shows ~5 min, not a full 50', () => {
  const s = env({
    activityTs: Date.now() - 45 * 60000,
    identities: { [CLAUDE]: { sid: SID, model: 'claude-fable-5-1', host: 'api.anthropic.com', isProxy: false } }
  });
  s.tmKeepAliveHandleToggle(CLAUDE);
  const armed = s.statuses.find(x => /armed/.test(x.text || ''));
  assert.ok(armed, 'arming reports a status');
  assert.match(armed.text, /next ping in 5m/, armed.text);
});

test('idle past the interval resets the clock with a visible lapsed-cache warning', () => {
  const s = env({
    activityTs: Date.now() - 90 * 60000,
    identities: { [CLAUDE]: { sid: SID, model: 'claude-fable-5-1', host: 'api.anthropic.com', isProxy: false } }
  });
  s.tmKeepAliveHandleToggle(CLAUDE);
  const armed = s.statuses.find(x => /armed/.test(x.text || ''));
  assert.match(armed.text, /idle past the 50m interval/);
  assert.equal(armed.tone, 'warn');
});

test('a new identity inherits the interval of the same model::host (no more 4-min default)', () => {
  const freshSid = 'tm-bbbbbbbb::claude-fable-5-1::api.anthropic.com::direct';
  const s = env({
    store: { [CLAUDE]: { enabled: false, sid: SID, model: 'claude-fable-5-1', host: 'api.anthropic.com', interval_min: 45, _ts: 99 } },
    identities: { [freshSid]: { sid: 'bbbbbbbb', model: 'claude-fable-5-1', host: 'api.anthropic.com', isProxy: false } }
  });
  s.tmKeepAliveHandleToggle(freshSid);
  assert.equal(s.store()[freshSid].interval_min, 45, 'inherits the last interval set for this model::host');
});

test('a non-Claude identity with no sibling still falls back to the 4-min default', () => {
  const k = 'tm-cccccccc::glm-5.3::api.z.ai::direct';
  const s = env({ identities: { [k]: { sid: 'cccccccc', model: 'glm-5.3', host: 'api.z.ai', isProxy: false } } });
  s.tmKeepAliveHandleToggle(k);
  assert.equal(s.store()[k].interval_min, 4);
});

console.log('\n' + pass + ' passed; ' + fail + ' failed');
process.exit(fail ? 1 : 0);
