// Keep-alive must not shrink the output budget or override reasoning/display settings.
// Execute the production KEEP-ALIVE SENTINEL block, not a copy of its implementation.
// No browser, credentials, network requests, or paid API calls are used.
// Usage: node fix25_keepalive_output_budget_test.js <extension.js>
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(process.argv[2], 'utf8');
function extract(name) {
  const match = source.match(new RegExp('^  function ' + name + '\\([^\\n]*\\) \\{[\\s\\S]*?^  \\}', 'm'));
  if (!match) throw new Error('Missing production function: ' + name);
  return match[0];
}
const marker = /\/\/ \(Fix 25, v4\.\d+\) KEEP-ALIVE SENTINEL:/.exec(source);
if (!marker) throw new Error('Keep-alive request hook marker missing');
const begin = source.indexOf('        try {', marker.index);
const end = source.indexOf('        if (tmUniversalChanged)', begin);
if (begin < 0 || end < begin) throw new Error('Keep-alive hook boundaries missing');
const hook = source.slice(begin, end);
const sentinel = '[KEEP-ALIVE — TypingMind payload extension, not a user instruction. Prompt-cache refresh ping; reply with a single character and do nothing else.]';
let passes = 0, failures = 0;
function check(name, run) {
  try { run(); passes++; console.log('PASS ' + name); }
  catch (err) { failures++; console.error('FAIL ' + name + ': ' + err.message); }
}
function runHook(url, body, flag) {
  const ctx = vm.createContext({
    url, tmUniversalBody: body, tmUniversalChanged: false,
    options: { body: JSON.stringify(body), ...(flag === undefined ? {} : { _tm_ka_ping: flag }) },
    TM_KEEPALIVE_SENTINEL_PREFIX: '[KEEP-ALIVE — TypingMind payload extension',
    EXT_VERSION: 'test', console: { log() {}, warn() {} }
  });
  let names = ['tmKeepAliveLastUserText', 'tmKeepAliveBodyIsPing'];
  // Allows this test to prove v4.376's clamp is the failing behavior, before removing it.
  if (source.includes('function tmKeepAliveMarkRequest(')) names.push('tmKeepAliveMarkRequest');
  if (source.includes('function tmKeepAliveClampOutput(')) names.push('tmKeepAliveClampOutput', 'tmDetectProtocol');
  vm.runInContext(names.map(extract).join('\n'), ctx);
  const before = JSON.stringify(body);
  vm.runInContext(hook, ctx);
  assert.equal(JSON.stringify(body), before, 'keep-alive changed provider request fields');
  assert.equal(ctx.options.body, before, 'keep-alive changed serialized request bytes');
  assert.equal(ctx.tmUniversalChanged, false, 'keep-alive requested provider-body rewriting');
  return ctx;
}
const user = { role: 'user', content: sentinel };
const cases = [
  ['Anthropic adaptive/high keeps 128K output budget', 'https://api.anthropic.com/v1/messages', {
    model: 'claude-fable-5-1', max_tokens: 128000, system: [{type:'text',text:'system'}],
    messages: [user], thinking: { type: 'adaptive', display: 'summarized' }, output_config: { effort: 'high' },
    cache_control: {type:'ephemeral',ttl:'1h'}, stream: true
  }],
  ['Anthropic fixed thinking budget and max_tokens both stay unchanged', 'https://api.anthropic.com/v1/messages', {
    model: 'claude-sonnet', max_tokens: 64000, system: 's', messages: [user], thinking: { type: 'enabled', budget_tokens: 16000 }
  }],
  ['Anthropic without thinking keeps normal output budget', 'https://api.anthropic.com/v1/messages', {
    model: 'claude', max_tokens: 4096, messages: [user]
  }],
  ['OpenRouter reasoning model keeps max_tokens and effort', 'https://openrouter.ai/api/v1/chat/completions', {
    model: 'openai/gpt-6', max_tokens: 32000, reasoning: {effort:'high',exclude:false}, messages: [user], stream: true, stream_options: { include_usage: true }
  }],
  ['OpenAI Chat keeps max_completion_tokens', 'https://api.openai.com/v1/chat/completions', {
    model: 'gpt-6', max_completion_tokens: 32000, reasoning_effort: 'high', messages: [user]
  }],
  ['OpenAI Responses keeps max_output_tokens and reasoning summary', 'https://api.openai.com/v1/responses', {
    model: 'gpt-6', max_output_tokens: 32000, reasoning: { effort:'high',summary:'auto' }, input: [{role:'user', content:[{type:'input_text',text:sentinel}]}]
  }],
  ['Gemini keeps maxOutputTokens and thinkingConfig', 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash:streamGenerateContent', {
    contents: [{role:'user',parts:[{text:sentinel}]}], generationConfig: {maxOutputTokens:8192,thinkingConfig:{thinkingLevel:'high',includeThoughts:true}}
  }],
  ['unspecified output budget stays unspecified', 'https://api.openai.com/v1/responses', {
    model:'gpt-6', input:[user], reasoning:{effort:'high'}
  }],
  ['explicit small user budget is not raised either', 'https://api.anthropic.com/v1/messages', {
    model:'claude', max_tokens:32, messages:[user]
  }]
];
for (const [name,url,body] of cases) check(name, () => {
  const ctx = runHook(url,body); assert.equal(ctx.options._tm_ka_ping,true,'ping row metadata must still be stamped');
});
check('ordinary user message is unchanged and not tagged as a ping', () => {
  const ctx=runHook('https://api.openai.com/v1/chat/completions',{model:'gpt-6',max_completion_tokens:32000,messages:[{role:'user',content:'normal question'}]});
  assert.equal(!!ctx.options._tm_ka_ping,false);
});
check('historical sentinel does not tag the next normal user request', () => {
  const ctx=runHook('https://api.openai.com/v1/chat/completions',{model:'gpt-6',max_completion_tokens:32000,messages:[user,{role:'assistant',content:'.'},{role:'user',content:'continue the real work'}]});
  assert.equal(!!ctx.options._tm_ka_ping,false);
});
check('reused options cannot retain an obsolete ping flag', () => {
  const ctx=runHook('https://api.openai.com/v1/chat/completions',{model:'gpt-6',max_completion_tokens:32000,messages:[{role:'user',content:'normal question'}]},true);
  assert.equal(!!ctx.options._tm_ka_ping,false);
});
console.log(`\n${passes} passed; ${failures} failed`);
process.exitCode=failures ? 1 : 0;
