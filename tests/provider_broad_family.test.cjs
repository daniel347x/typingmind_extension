// Regression: tmProviderBroadFamily -- the level-1 grouping key shared by Rate Providers, Set Costs
// and the Global Reasoning modal.
// (v4.418) The broad family is the LEADING ALPHABETIC RUN of the model's last slash segment, not its
// first hyphen token. Qwen is the only vendor whose name is glued to its version with no hyphen
// ('qwen3.8-max-0902'), so the hyphen rule produced a 'qwen3.8' family and Qwen 3.9 would have split
// into a SECOND family -- making 'Qwen as a whole' unviewable. A single leading letter (the o-series)
// falls back to the hyphen token so 'o1' / 'o3' / 'o4' survive; everything else already split on a
// hyphen before any digit and is unchanged. No storage key depends on this: ratings, comments,
// prices and tombstones are keyed model::provider.
// Runs extracted production functions in a vm; makes NO network calls.
// Usage: node provider_broad_family.test.cjs <prompt-caching-header-fix.js>
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(process.argv[2], 'utf8');
function extract(name) {
  const start = source.indexOf('\n  function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  const from = start + 1, open = source.indexOf('{', from);
  let depth = 0;
  for (let j = open; j < source.length; j++) {
    if (source[j] === '{') depth++;
    else if (source[j] === '}') { depth--; if (depth === 0) return source.slice(from, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}
const ctx = vm.createContext({ console });
vm.runInContext([extract('tmProviderModelFamily'), extract('tmProviderBroadFamily')].join('\n'), ctx);

const cases = [
  ['qwen/qwen3.8-max-0902', 'qwen', 'Qwen'],
  ['qwen3.8-max-0902', 'qwen', 'Qwen'],
  ['qwen/qwen3.9-max-1120', 'qwen', 'Qwen'],
  ['alibaba/qwen3.8-max', 'qwen', 'Qwen'],
  ['moonshotai/kimi-k3', 'kimi', 'Kimi'],
  ['kimi-k2.5', 'kimi', 'Kimi'],
  ['anthropic/claude-fable-5-1-20260101', 'claude', 'Claude'],
  ['claude-opus-4.8', 'claude', 'Claude'],
  ['openai/gpt-5.6-sol', 'gpt', 'GPT'],
  ['gpt-6-astra', 'gpt', 'GPT'],
  ['google/gemini-3.8-flash', 'gemini', 'Gemini'],
  ['deepseek/deepseek-v4-pro-0813', 'deepseek', 'DeepSeek'],
  ['z-ai/glm-5.3', 'glm', 'GLM'],
  ['x-ai/grok-4.5-20260708', 'grok', 'Grok'],
  ['minimax-m3', 'minimax', 'MiniMax'],
  ['o1-preview', 'o1', 'O1'],
  ['o3-mini', 'o3', 'O3'],
  ['o4-mini', 'o4', 'O4'],
  // The family derives from the LAST slash segment, so a vendor prefix never becomes the family.
  // Unchanged by the v4.418 edit (the hyphen rule gave 'some' here too).
  ['user/some-custom-model', 'some', 'Some'],
  // labels.user still reachable when the specific name itself starts with 'user'.
  ['user-llama-3', 'user', 'Other'],
  // A digit-leading name has no alphabetic run: falls back to the hyphen token, never crashes.
  ['7b-llama', '7b', '7b']
];
let pass = 0, fail = 0;
for (const [model, wantKey, wantLabel] of cases) {
  const got = ctx.tmProviderBroadFamily(model);
  const ok = got.key === wantKey && got.label === wantLabel;
  if (ok) { pass++; console.log('PASS ' + model + ' -> ' + got.key + ' / ' + got.label); }
  else { fail++; console.error('FAIL ' + model + ' -> ' + got.key + ' / ' + got.label + '  (wanted ' + wantKey + ' / ' + wantLabel + ')'); }
}
console.log('\n' + pass + ' passed; ' + fail + ' failed');
process.exit(fail ? 1 : 0);
