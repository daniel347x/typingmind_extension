// TypingMind Prompt Caching & Tool Result Fix & Payload Analysis Extension
// Version: 4.11
// Purpose: 
//   1. Inject missing prompt-caching-2024-07-31 beta flag into Anthropic API requests
//   2. Strip non-standard "name" field from tool_result content blocks
//   3. Intercept and analyze payloads when [DEBUG-command-fileId] trigger detected
//   4. Inject OpenAI Responses API prompt caching parameters (prompt_cache_key, prompt_cache_retention) for GPT-5.1
//   5. Track GPT-5.1 per-conversation usage and cached_tokens based on "load files <keyword>" first user message
// Issues Fixed:
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

  const EXT_VERSION = '4.11';

  const GPT51_PRICING = {
    INPUT_NONCACHED_PER_TOKEN: 1.25 / 1e6,   // $1.25 per 1M non-cached input tokens
    INPUT_CACHED_PER_TOKEN:   0.125 / 1e6,   // $0.125 per 1M cached input tokens
    OUTPUT_PER_TOKEN:         10 / 1e6       // $10 per 1M output tokens
  };

  const GPT51_CONTEXT_LIMIT = 400000;        // 400k token context window for GPT-5.1

  // Last Anthropic request body (for export of user+assistant-only JSON)
  let lastAnthropicBodyForExport = null;

  // Last Gemini request body (for export of user+assistant-only JSON)
  let lastGeminiBodyForExport = null;

  // Last GPT-5.1 request body (for export of user+assistant-only JSON)
  let lastGpt51BodyForExport = null;

  console.log('🔧 UPDATED WELCOME (Nov 16, 2025) - Prompt Caching & Tool Result Fix & Payload Analysis v' + EXT_VERSION + ' - Initializing...');

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

    // 1) Primary: look for "load files <keyword>" in the FIRST user message
    (function() {
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
      if (idx !== -1) {
        let after = text.slice(idx + prefix.length).trim();
        if (after) {
          if (after.length > 128) after = after.slice(0, 128);
          return after;
        }
      }
      return null;
    })();

    const primaryId = (function() {
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
    })();

    if (primaryId) return primaryId;

    // 2) Safety: if no load-files keyword, scan the next few user messages
    //    for a line starting with "CONVERSATION IDENTITY: <keyword>".
    const maxToScan = Math.min(userMessages.length, 10);
    const idPrefix = 'conversation identity:';

    for (let i = 1; i < maxToScan; i++) {
      const msg = userMessages[i];
      let text = '';
      if (typeof msg.content === 'string') {
        text = msg.content;
      } else if (Array.isArray(msg.content)) {
        const textBlocks = msg.content.filter(
          block => block && (block.type === 'text' || block.type === 'input_text')
        );
        text = textBlocks.map(block => block.text || '').join(' ');
      }
      const trimmed = text.trim();
      const lower = trimmed.toLowerCase();
      if (lower.startsWith(idPrefix)) {
        let after = trimmed.slice(idPrefix.length).trim();
        if (!after) continue;
        if (after.length > 128) after = after.slice(0, 128);
        return after;
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

    store[convId] = stats;
    saveGpt51UsageStore(store);
    renderGpt51UsageWidget();
  }

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

  function ensureGpt51UsageWidget() {
    let el = document.getElementById('gpt51-usage-widget');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gpt51-usage-widget';
      el.style.position = 'fixed';
      el.style.top = '12px';
      // Move widget ~250px left from original right edge position
      el.style.right = '262px';
      el.style.zIndex = '99999';
      el.style.background = 'rgba(0,0,0,0.80)';
      el.style.color = '#fff';
      el.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      // Bump base font size one notch
      el.style.fontSize = '12px';
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
        if (target && target.dataset) {
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
        }
      });
    }
    return el;
  }

  function renderGpt51UsageWidget() {
    if (typeof document === 'undefined') return;
    const el = ensureGpt51UsageWidget();
    const store = getGpt51UsageStore();
    const convIds = Object.keys(store).filter(id => !store[id].hidden);
    if (!convIds.length) {
      el.textContent = 'GPT-5.1 usage: (no tracked conversations)';
      return;
    }

    const lines = [];
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

    lines.push('<div style="font-size:10px;opacity:0.9;margin-top:4px;cursor:pointer;text-decoration:underline;" data-action="export-anthropic-conversation">Export Anthropic convo (user+assistant JSON)</div>');
    lines.push('<div style="font-size:10px;opacity:0.9;margin-top:2px;cursor:pointer;text-decoration:underline;" data-action="export-gemini-conversation">Export Gemini convo (user+assistant JSON)</div>');
    lines.push('<div style="font-size:10px;opacity:0.9;margin-top:2px;cursor:pointer;text-decoration:underline;" data-action="export-gpt51-conversation">Export GPT-5.1 convo (user+assistant JSON)</div>');

    el.innerHTML = lines.join('');
  }

  // ==================== FETCH OVERRIDE ====================

  function repairHistoricAnthropicToolInputs(body) {
    if (!Array.isArray(body.messages) || body.messages.length < 2) return false;
    let changed = false;
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
          changed = true;
        }
      });
    }

    return changed;
  }

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

          // Capture latest Anthropic body for export tooling
          lastAnthropicBodyForExport = body;

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

          if (repairHistoricAnthropicToolInputs(body)) {
            modified = true;
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
      try {
        if (options.body) {
          const body = JSON.parse(options.body);
          // Capture latest Gemini body for export tooling (no mutation)
          lastGeminiBodyForExport = body;
        }
      } catch (e) {
        console.warn('⚠️ [v' + EXT_VERSION + '] Failed to parse Gemini request body for export capture:', e);
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
            lastGpt51BodyForExport = body;
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

    return fetchPromise;
  };

  // Initial render from any persisted usage in localStorage so widget appears on load
  try {
    if (typeof document !== 'undefined') {
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
