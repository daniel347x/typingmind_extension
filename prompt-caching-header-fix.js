// TypingMind Prompt Caching & Tool Result Fix & Payload Analysis Extension
// Version: 4.3
// Purpose: 
//   1. Inject missing prompt-caching-2024-07-31 beta flag into Anthropic API requests
//   2. Strip non-standard "name" field from tool_result content blocks
//   3. Intercept and analyze payloads when [DEBUG-command-fileId] trigger detected
//   4. Inject OpenAI Responses API prompt caching parameters (prompt_cache_key, prompt_cache_retention) for GPT-5.1
//   5. Track GPT-5.1 per-conversation usage and cached_tokens based on "load files <keyword>" first user message
// Issues Fixed:
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

  const GPT51_PRICING = {
    INPUT_NONCACHED_PER_TOKEN: 1.25 / 1e6,   // $1.25 per 1M non-cached input tokens
    INPUT_CACHED_PER_TOKEN:   0.125 / 1e6,   // $0.125 per 1M cached input tokens
    OUTPUT_PER_TOKEN:         10 / 1e6       // $10 per 1M output tokens
  };

  console.log('🔧 UPDATED WELCOME (Nov 16, 2025) - Prompt Caching & Tool Result Fix & Payload Analysis v4.3 - Initializing...');

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

  function deriveConversationIdFromBody(body) {
    let userMessages = [];
    if (Array.isArray(body.messages)) {
      userMessages = body.messages.filter(m => m && m.role === 'user');
    } else if (Array.isArray(body.input)) {
      userMessages = body.input.filter(m => m && m.role === 'user');
    }
    if (!userMessages.length) return null;

    const first = userMessages[0];
    let text = '';
    if (typeof first.content === 'string') {
      text = first.content;
    } else if (Array.isArray(first.content)) {
      const textBlocks = first.content.filter(
        block => block && (block.type === 'text' || block.type === 'input_text')
      );
      text = textBlocks.map(block => block.text || '').join(' ');
    }

    const lower = text.toLowerCase();
    const prefix = 'load files';
    const idx = lower.indexOf(prefix);
    if (idx === -1) return null;

    let after = text.slice(idx + prefix.length).trim();
    if (!after) return null;
    if (after.length > 128) after = after.slice(0, 128);
    return after;
  }

  function getGpt51UsageStore() {
    try {
      const raw = localStorage.getItem('gpt51_conv_usage');
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.warn('⚠️ [v4.3] Failed to parse gpt51_conv_usage from localStorage:', e);
      return {};
    }
  }

  function saveGpt51UsageStore(store) {
    try {
      localStorage.setItem('gpt51_conv_usage', JSON.stringify(store));
    } catch (e) {
      console.warn('⚠️ [v4.3] Failed to save gpt51_conv_usage to localStorage:', e);
    }
  }

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

    stats.input += input;
    stats.cached += cached;
    stats.output += output;
    stats.total += total;
    stats.cost = (stats.cost || 0) + turnCost;

    store[convId] = stats;
    saveGpt51UsageStore(store);
    renderGpt51UsageWidget();
  }

  function ensureGpt51UsageWidget() {
    let el = document.getElementById('gpt51-usage-widget');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gpt51-usage-widget';
      el.style.position = 'fixed';
      el.style.top = '12px';
      el.style.right = '12px';
      el.style.zIndex = '99999';
      el.style.background = 'rgba(0,0,0,0.80)';
      el.style.color = '#fff';
      el.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      el.style.fontSize = '11px';
      el.style.padding = '6px 8px';
      el.style.borderRadius = '4px';
      el.style.maxWidth = '260px';
      el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.35)';
      el.style.pointerEvents = 'auto';
      el.style.cursor = 'default';
      el.style.whiteSpace = 'normal';
      el.style.lineHeight = '1.3';
      document.body.appendChild(el);

      el.addEventListener('click', function(ev) {
        const target = ev.target;
        if (target && target.dataset && target.dataset.convId) {
          const convId = target.dataset.convId;
          const store = getGpt51UsageStore();
          delete store[convId];
          saveGpt51UsageStore(store);
          renderGpt51UsageWidget();
          ev.stopPropagation();
        }
      });
    }
    return el;
  }

  function renderGpt51UsageWidget() {
    if (typeof document === 'undefined') return;
    const el = ensureGpt51UsageWidget();
    const store = getGpt51UsageStore();
    const convIds = Object.keys(store);
    if (!convIds.length) {
      el.textContent = 'GPT-5.1 usage: (no tracked conversations)';
      return;
    }

    const lines = [];
    let totalCost = 0;
    const convLines = [];

    convIds.slice(-5).reverse().forEach(convId => {
      const s = store[convId];
      const cachedPct = s.input > 0 ? ((s.cached / s.input) * 100).toFixed(1) : '0.0';
      const safeId = convId.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const cost = s.cost || 0;
      totalCost += cost;
      convLines.push(
        '<div style="margin-bottom:3px;">'
          + '<span style="float:right;cursor:pointer;color:#ffaaaa;margin-left:6px;" data-conv-id="' + safeId + '">×</span>'
          + '<div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px;">'
          + safeId + '</div>'
          + '<div style="font-size:10px;opacity:0.85;">in:' + s.input + ' cached:' + s.cached + ' (' + cachedPct + '%) out:' + s.output + ' · $' + cost.toFixed(4) + '</div>'
        + '</div>'
      );
    });

    lines.push('<div style="font-weight:bold;margin-bottom:2px;">GPT-5.1 Conversations</div>');
    lines.push('<div style="font-size:10px;opacity:0.9;margin-bottom:4px;">≈ Total cost: $' + totalCost.toFixed(4) + '</div>');
    convLines.forEach(line => lines.push(line));

    el.innerHTML = lines.join('');
  }

  // ==================== FETCH OVERRIDE ====================

  const originalFetch = window.fetch;

  window.fetch = function(...args) {
    const [url, options = {}] = args;
    let convIdForThisCall = null;

    // ==================== ANTHROPIC BRANCH ====================
    if (url.includes('api.anthropic.com')) {
      try {
        if (options.body) {
          const body = JSON.parse(options.body);
          let modified = false;

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
                        modified = true;
                      }
                    });
                  }
                });
              }
            });
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

    // ==================== OPENAI RESPONSES BRANCH (GPT-5.1 prompt caching + usage) ====================
    else if (url.includes('api.openai.com') && url.includes('/v1/responses')) {
      try {
        if (options.body) {
          const body = JSON.parse(options.body);
          let modified = false;

          const convId = deriveConversationIdFromBody(body);
          if (convId) {
            convIdForThisCall = convId;
          }

          const model = body.model || '';
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

          if (modified) {
            options.body = JSON.stringify(body);
            console.log('✅ [v4.2] OpenAI Responses request body updated for prompt caching');
          }
        }
      } catch (e) {
        console.warn('⚠️ [v4.2] Failed to parse/modify OpenAI Responses request:', e);
      }
    }

    const fetchPromise = originalFetch(...args);

    if (url.includes('api.openai.com') && url.includes('/v1/responses')) {
      return fetchPromise.then(function(response) {
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
                  console.log('📈 [v4.3] Updated GPT-5.1 usage for conversation:', convIdForThisCall, usage);
                }
              }
            } catch (e) {
              console.warn('⚠️ [v4.3] Failed to parse SSE usage from OpenAI Responses:', e);
            }
          }).catch(function(e) {
            console.warn('⚠️ [v4.3] Failed to read OpenAI Responses clone body:', e);
          });
        } catch (e) {
          console.warn('⚠️ [v4.3] Failed to clone OpenAI Responses response:', e);
        }
        return response;
      });
    }

    return fetchPromise;
  };

  console.log('✅ Prompt Caching & Tool Result Fix & Payload Analysis v4.3 - Active and monitoring');
  console.log('📊 Will inject prompt-caching-2024-07-31 flag into all Anthropic API requests');
  console.log('🔧 Will strip "name" field from tool_result content blocks');
  console.log('🔎 Will analyze payloads when [DEBUG-command-fileId] trigger detected');
  console.log('💰 Expected result: 80-90% cost reduction (Anthropic + OpenAI GPT-5.1) + run_command working + payload debugging + GPT-5.1 usage widget');
})();
