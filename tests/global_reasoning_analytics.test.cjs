// Regression: the v4.415 GLOBAL REASONING ANALYTICS pure builders.
// Verifies bucket merging, path filtering, cascading facets, the level split and the level filter
// against a synthetic lifetime archive. Makes NO network calls and touches NO real localStorage.
// Usage: node global_reasoning_analytics.test.cjs <prompt-caching-header-fix.js>
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(process.argv[2], 'utf8');

// Brace-BALANCED extraction. The naive '^  function NAME...^  }' regex used by the older suites
// truncates any function whose inner block closes at two-space indent (tmThinkMergeBins does),
// which is exactly why sessions_delta_history.test.cjs fails on pristine HEAD. Balance braces from
// the body's opening '{' instead; none of these functions carry a brace inside a string or comment.
function extract(name) {
  const start = source.indexOf('\n  function ' + name + '(');
  if (start < 0) throw new Error('Function not found: ' + name);
  const from = start + 1;
  const open = source.indexOf('{', from);
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
  'tmNewBucket', 'tmProviderModelFamily', 'tmProviderBroadFamily',
  'tmThinkMergeBins', 'tmThinkBinsAscii',
  'tmAnalyticsReadLifetime', 'tmAnalyticsMergeBuckets', 'tmAnalyticsLifetimePaths',
  'tmAnalyticsLifetimeFacets', 'tmAnalyticsBucketLine', 'tmBuildGlobalReasoningReport'
];

let pass = 0, fail = 0;
function test(name, run) {
  try { run(); pass++; console.log('PASS ' + name); }
  catch (e) { fail++; console.error('FAIL ' + name + ': ' + e.message); }
}

// ---- synthetic environment -------------------------------------------------------------
// Two models x two endpoints x two providers x two levels, plus a proxy path, so every filter
// axis has something to discriminate on.
function bucket(turns, zero, nonzero, unknown, total, src, bins, overflow) {
  return {
    turns, zero, nonzero, unknown, reasoning_total: total, overflow: overflow || 0,
    source: { reported: src[0], bytes_estimate: src[1], heuristic: src[2], unknown: src[3] },
    bins: bins || {}
  };
}
function path(model, host, isProxy, protocol, provKey, provLabel, all, byLevel) {
  return { model, host, isProxy, protocol, provider: { key: provKey, label: provLabel }, since: 1700000000000, all, by_level: byLevel };
}

function env(lifetime) {
  const sandbox = {
    console,
    TM_ANALYTICS_LIFETIME_KEY: '__tm_reasoning_lifetime_v1',
    TM_ANALYTICS_VERSION: 1,
    // 101 increasing bounds; only monotonicity matters for the merge/split assertions.
    TM_ANALYTICS_BIN_BOUNDS: Array.from({ length: 101 }, (_, i) => Math.pow(2, i / 10)),
    tmGlobalReasoningFilter: { family: '', model: '', host: '', route: '', protocol: '', provider: '', level: '' },
    tmThinkFmtK: (n) => (n == null ? '?' : (Number(n) >= 10000 ? Math.round(Number(n) / 1000) + 'K' : String(Math.round(Number(n))))),
    __ledger: {}
  };
  sandbox.tmGetSessionCosts = () => sandbox.__ledger;
  if (lifetime) sandbox.__ledger[sandbox.TM_ANALYTICS_LIFETIME_KEY] = lifetime;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(FUNCS.map(extract).join('\n'), ctx);
  return sandbox;
}

const QWEN = 'qwen/qwen3.8-max-0902';
const K3 = 'moonshotai/kimi-k3';
function archive() {
  return {
    kind: 'reasoning-lifetime', v: 1, since: 1700000000000, ka_pings_excluded: 3,
    all: bucket(100, 10, 90, 0, 900000, [80, 20, 0, 0], { 5: 30 }, 0),
    gap: { count: 0, first_at: null, last_at: null, reasons: {} },
    by_path: {
      a: path(QWEN, 'dashscope.aliyuncs.com', false, 'openai-chat-completions', 'dashscope.aliyuncs.com', 'Alibaba DashScope',
        bucket(40, 4, 36, 0, 400000, [40, 0, 0, 0], { 5: 20 }, 0),
        { 'xhigh': bucket(30, 0, 30, 0, 360000, [30, 0, 0, 0], { 5: 20 }, 0), 'low': bucket(10, 4, 6, 0, 40000, [10, 0, 0, 0], {}, 0) }),
      b: path(QWEN, 'openrouter.ai', false, 'openai-chat-completions', 'openrouter.ai/fireworks', 'Fireworks',
        bucket(20, 2, 16, 2, 120000, [10, 8, 0, 2], { 3: 9 }, 1),
        { 'high': bucket(20, 2, 16, 2, 120000, [10, 8, 0, 2], { 3: 9 }, 1) }),
      c: path(K3, 'api.moonshot.ai', false, 'openai-chat-completions', 'api.moonshot.ai', 'Moonshot',
        bucket(30, 3, 27, 0, 300000, [0, 30, 0, 0], { 7: 12 }, 0),
        { 'max': bucket(30, 3, 27, 0, 300000, [0, 30, 0, 0], { 7: 12 }, 0) }),
      d: path(K3, 'openrouter.ai', true, 'anthropic-messages', 'openrouter.ai/baseten', 'Baseten',
        bucket(10, 1, 9, 0, 80000, [9, 0, 0, 0], {}, 0),
        { 'max': bucket(10, 1, 9, 0, 80000, [9, 0, 0, 0], {}, 0) })
    }
  };
}

// ---- assertions ------------------------------------------------------------------------
// Objects/arrays built INSIDE the vm context are cross-realm, so deepStrictEqual rejects them on
// prototype identity even when the structure matches. Copy to local values before comparing.
const loc = (x) => JSON.parse(JSON.stringify(x));
const sortedEntries = (o) => Object.entries(loc(o || {})).sort();
// The broad family key is the first HYPHEN token of the model's final slash segment, so
// 'qwen/qwen3.8-max-0902' families as 'qwen3.8' (label 'Qwen3.8'), not 'qwen'. Derive the keys
// from the real implementation rather than assuming them -- this is shared with Rate Providers.
const famKey = (s, m) => s.tmProviderBroadFamily(m).key;
const famLabel = (s, m) => s.tmProviderBroadFamily(m).label;

test('archive absent -> empty, not an error', () => {
  const s = env(null);
  const R = s.tmBuildGlobalReasoningReport({});
  assert.equal(R.empty, true);
  assert.equal(R.ok, false);
});

test('a foreign analytics version is refused, never interpreted', () => {
  const a = archive(); a.v = 99;
  const s = env(a);
  const R = s.tmBuildGlobalReasoningReport({});
  assert.equal(R.stale, true);
  assert.match(R.text, /analytics version 99/);
});

test('unfiltered merge equals the sum of every path, bins included', () => {
  const s = env(archive());
  const R = s.tmBuildGlobalReasoningReport({});
  assert.equal(R.ok, true);
  assert.equal(R.rows.length, 4);
  assert.equal(R.pathCountAll, 4);
  assert.equal(R.all.turns, 100);
  assert.equal(R.all.zero, 10);
  assert.equal(R.all.nonzero, 88);
  assert.equal(R.all.unknown, 2);
  assert.equal(R.all.reasoning_total, 900000);
  assert.equal(R.all.overflow, 1);
  assert.equal(R.all.source.reported, 59);
  assert.equal(R.all.source.bytes_estimate, 38);
  assert.deepEqual(sortedEntries(R.all.bins), [['3', 9], ['5', 20], ['7', 12]]);
});

test('unknown never folds into zero, and zero stays its own count', () => {
  const s = env(archive());
  const R = s.tmBuildGlobalReasoningReport({ model: QWEN, host: 'openrouter.ai' });
  assert.equal(R.all.turns, 20);
  assert.equal(R.all.unknown, 2);
  assert.equal(R.all.zero, 2);
  assert.equal(R.all.nonzero, 16);
  assert.equal(R.all.zero + R.all.nonzero + R.all.unknown, 20);
});

test('every filter axis discriminates, and axes compose', () => {
  const s = env(archive());
  const fq = famKey(s, QWEN), fk = famKey(s, K3);
  assert.equal(s.tmBuildGlobalReasoningReport({ family: fq }).rows.length, 2);
  assert.equal(s.tmBuildGlobalReasoningReport({ family: fk }).rows.length, 2);
  assert.equal(s.tmBuildGlobalReasoningReport({ host: 'openrouter.ai' }).rows.length, 2);
  assert.equal(s.tmBuildGlobalReasoningReport({ route: 'proxy' }).rows.length, 1);
  assert.equal(s.tmBuildGlobalReasoningReport({ route: 'direct' }).rows.length, 3);
  assert.equal(s.tmBuildGlobalReasoningReport({ protocol: 'anthropic-messages' }).rows.length, 1);
  assert.equal(s.tmBuildGlobalReasoningReport({ provider: 'openrouter.ai/fireworks' }).rows.length, 1);
  // a family key that exists in the app's own taxonomy but not in this archive matches nothing
  assert.equal(s.tmBuildGlobalReasoningReport({ family: 'claude' }).rows.length, 0);
  // composed: Qwen + OpenRouter + Fireworks = exactly one path, Kimi's max never leaks in
  const R = s.tmBuildGlobalReasoningReport({ family: fq, host: 'openrouter.ai', provider: 'openrouter.ai/fireworks' });
  assert.equal(R.rows.length, 1);
  assert.equal(R.rows[0].model, QWEN);
  assert.equal(R.all.turns, 20);
});

test('by_level splits the matched turns exactly, with no double counting', () => {
  const s = env(archive());
  const R = s.tmBuildGlobalReasoningReport({});
  const levels = loc(Object.fromEntries(R.byLevel.map(r => [r.level, r.bucket.turns])));
  assert.deepEqual(levels, { xhigh: 30, low: 10, high: 20, max: 40 });
  const sum = R.byLevel.reduce((n, r) => n + r.bucket.turns, 0);
  assert.equal(sum, R.all.turns);
  // sorted by turns desc
  assert.equal(R.byLevel[0].level, 'max');
});

test('a level filter reads the by_level buckets, not the path totals', () => {
  const s = env(archive());
  const R = s.tmBuildGlobalReasoningReport({ level: 'max' });
  assert.equal(R.all.turns, 40);            // K3 direct 30 + K3 proxy 10
  assert.equal(R.all.reasoning_total, 380000);
  assert.equal(R.byLevel.length, 1);
  assert.equal(R.byLevel[0].level, 'max');
  assert.equal(R.rows.length, 2);
  // a level no Qwen path ever used excludes Qwen entirely
  assert.equal(s.tmBuildGlobalReasoningReport({ family: famKey(s, QWEN), level: 'max' }).all.turns, 0);
});

test('facets cascade: each axis offers only what the OTHER filters still allow', () => {
  const s = env(archive());
  const all = s.tmBuildGlobalReasoningReport({}).facets;
  assert.deepEqual(loc(all.models).sort(), [K3, QWEN]);
  assert.deepEqual(loc(all.levels).sort(), ['high', 'low', 'max', 'xhigh']);
  assert.deepEqual(loc(all.routes).sort(), ['direct', 'proxy']);
  assert.deepEqual(loc(all.families.map(x => x.label)).sort(), [famLabel(s, K3), famLabel(s, QWEN)].sort());
  // pin Kimi: Qwen's provider and level drop out of the offer lists
  s.tmGlobalReasoningFilter.family = famKey(s, K3);
  const k = s.tmBuildGlobalReasoningReport(s.tmGlobalReasoningFilter).facets;
  assert.deepEqual(loc(k.providers.map(p => p.value)).sort(), ['api.moonshot.ai', 'openrouter.ai/baseten']);
  assert.deepEqual(loc(k.levels), ['max']);
  assert.deepEqual(loc(k.models), [K3]);
  // the family list itself still shows BOTH families (its own axis is unconstrained)
  assert.deepEqual(loc(k.families.map(x => x.value)).sort(), [famKey(s, K3), famKey(s, QWEN)].sort());
  s.tmGlobalReasoningFilter.family = '';
});

test('rows are grouped-ready: sorted by family, model, endpoint, provider', () => {
  const s = env(archive());
  const R = s.tmBuildGlobalReasoningReport({});
  const order = loc(R.rows.map(r => r.family + '/' + r.model + '/' + r.host + '/' + r.provider));
  const FK = famLabel(s, K3), FQ = famLabel(s, QWEN);
  assert.deepEqual(order, [
    FK + '/' + K3 + '/api.moonshot.ai/Moonshot',
    FK + '/' + K3 + '/openrouter.ai/Baseten',
    FQ + '/' + QWEN + '/dashscope.aliyuncs.com/Alibaba DashScope',
    FQ + '/' + QWEN + '/openrouter.ai/Fireworks'
  ]);
});

test('the text report carries the filter, the merged line, levels and paths', () => {
  const s = env(archive());
  const R = s.tmBuildGlobalReasoningReport({ family: famKey(s, QWEN), level: 'xhigh' });
  assert.match(R.text, /GLOBAL REASONING ANALYTICS/);
  assert.match(R.text, /family=/);
  assert.match(R.text, /level=xhigh/);
  assert.match(R.text, /BY THINKING LEVEL/);
  assert.match(R.text, /BY PATH/);
  assert.match(R.text, /xhigh: 30 turns/);
  // a path with no turns at that level is excluded rather than shown as zero
  assert.equal(R.rows.length, 1);
  assert.doesNotMatch(R.text, /Fireworks/);
});

test('the builder is read-only: it never mutates the stored archive', () => {
  const a = archive();
  const before = JSON.stringify(a);
  const s = env(a);
  s.tmBuildGlobalReasoningReport({ family: famKey(s, K3) });
  s.tmBuildGlobalReasoningReport({});
  s.tmBuildGlobalReasoningReport({ level: 'max' });
  assert.equal(JSON.stringify(s.__ledger[s.TM_ANALYTICS_LIFETIME_KEY]), before);
});

console.log('\n' + pass + ' passed; ' + fail + ' failed');
process.exit(fail ? 1 : 0);
