// TypingMind Prompt Caching & Tool Result Fix & Payload Analysis Extension
// Version: 4.40
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

  const EXT_VERSION = '4.40';

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

  // Last Grok request body (for export of user+assistant-only JSON)
  let lastGrokBodyForExport = null;

  // Last GPT-5.1 request body (for export of user+assistant-only JSON)
  let lastGpt51BodyForExport = null;

  console.log('🔧 Prompt Caching & Tool Result Fix & Payload Analysis v' + EXT_VERSION + ' - Initializing...');
  
  // DEBUG: Expose conversation state for console inspection
  // NOTE: These are best-effort debugging utilities, not part of TypingMind itself.
  //       They exist so a human can quickly export the latest payload(s) for agent analysis.

  const TM_PAYLOAD_CAPTURE_RING_KEY = 'tm_payload_captures_v1';
  const TM_PAYLOAD_CAPTURE_EXPORT_KEY = 'tm_payload_captures_last_export';
  const TM_PAYLOAD_CAPTURE_ENABLED_KEY = 'tm_payload_capture_enabled';
  const TM_PAYLOAD_CAPTURE_REDACT_AUTH_KEY = 'tm_payload_capture_redact_auth';

  const TM_PAYLOAD_CAPTURE_MAX_ENTRIES = 20;
  const TM_PAYLOAD_CAPTURE_TRUNCATION_KEY = 'tm_payload_capture_truncation';
  const TM_PAYLOAD_CAPTURE_MAX_STRING_CHARS_DEFAULT = 1000;

  function tmGetTruncationLimit() {
    try {
      const v = parseInt(localStorage.getItem(TM_PAYLOAD_CAPTURE_TRUNCATION_KEY), 10);
      return (!isNaN(v) && v >= 100) ? v : TM_PAYLOAD_CAPTURE_MAX_STRING_CHARS_DEFAULT;
    } catch (e) {
      return TM_PAYLOAD_CAPTURE_MAX_STRING_CHARS_DEFAULT;
    }
  }

  function tmSetTruncationLimit(val) {
    try {
      const n = parseInt(val, 10);
      if (!isNaN(n) && n >= 100) {
        localStorage.setItem(TM_PAYLOAD_CAPTURE_TRUNCATION_KEY, String(n));
        return n;
      }
    } catch (e) {}
    return tmGetTruncationLimit();
  }

  // Backwards-compat alias (used in pre-4.37 code paths that reference the const directly)
  const TM_PAYLOAD_CAPTURE_MAX_STRING_CHARS = TM_PAYLOAD_CAPTURE_MAX_STRING_CHARS_DEFAULT;


  // "Truly huge" fallback threshold (after truncation). If a capture exceeds this,
  // we store a skeleton that preserves protocol-critical fields (model, cache_control,
  // tool_use ids, etc.) while stripping large text.
  const TM_PAYLOAD_CAPTURE_TRULY_HUGE_CHARS = 2_000_000;

  function tmCaptureEnabled() {
    try {
      // Default: ON unless explicitly disabled.
      return localStorage.getItem(TM_PAYLOAD_CAPTURE_ENABLED_KEY) !== 'false';
    } catch (e) {
      return true;
    }
  }

  function tmNormalizeHeaders(h) {
    const out = {};
    if (!h) return out;
    try {
      if (typeof Headers !== 'undefined' && h instanceof Headers) {
        h.forEach((v, k) => { out[k] = v; });
        return out;
      }
    } catch (e) {}

    if (Array.isArray(h)) {
      h.forEach(pair => {
        if (!pair || pair.length < 2) return;
        out[String(pair[0])] = String(pair[1]);
      });
      return out;
    }

    if (typeof h === 'object') {
      Object.keys(h).forEach(k => { out[k] = String(h[k]); });
    }

    return out;
  }

  function tmMaybeRedactHeaders(headersObj) {
    try {
      const redact = localStorage.getItem(TM_PAYLOAD_CAPTURE_REDACT_AUTH_KEY) === 'true';
      if (!redact) return headersObj;
    } catch (e) {
      return headersObj;
    }

    const out = { ...headersObj };
    Object.keys(out).forEach(k => {
      const lower = String(k).toLowerCase();
      if (lower === 'authorization' || lower === 'cookie' || lower === 'x-api-key') {
        out[k] = '[REDACTED]';
      }
    });
    return out;
  }

  function tmTruncateStringsDeep(x, maxChars, seen) {
    if (x == null) return x;

    const t = typeof x;
    if (t === 'string') {
      if (x.length <= maxChars) return x;
      const extra = x.length - maxChars;
      return x.slice(0, maxChars) + `… [tm_truncated +${extra} chars]`;
    }
    if (t === 'number' || t === 'boolean') return x;

    if (!seen) seen = new WeakSet();
    if (t === 'object') {
      // Avoid circular refs
      try {
        if (seen.has(x)) return '[tm_circular_ref]';
        seen.add(x);
      } catch (e) {}

      if (Array.isArray(x)) {
        // NO array truncation (per Dan request)
        return x.map(v => tmTruncateStringsDeep(v, maxChars, seen));
      }

      const out = {};
      Object.keys(x).forEach(k => {
        out[k] = tmTruncateStringsDeep(x[k], maxChars, seen);
      });
      return out;
    }

    return `[tm_unhandled_type:${t}]`;
  }

  function tmDetectProtocol(url, bodyObj) {
    const u = String(url || '');
    if (u.includes('/v1/responses')) return 'openai-responses';
    if (u.includes('/v1/chat/completions')) return 'openai-chat-completions';
    if (u.includes('api.anthropic.com') || (bodyObj && Array.isArray(bodyObj.messages) && !Array.isArray(bodyObj.input))) {
      return 'anthropic-messages';
    }
    if (bodyObj && Array.isArray(bodyObj.contents)) return 'gemini-generatecontent';
    return 'unknown';
  }

  function tmBuildHugeSkeleton(bodyObj) {
    // Preserve enough structure to debug cache_control placement + tool use + protocol.
    // Intentionally strips large text.
    if (!bodyObj || typeof bodyObj !== 'object') return bodyObj;

    // Anthropic/OpenAI chat-style
    if (Array.isArray(bodyObj.messages)) {
      return {
        _tm_skeleton: true,
        model: bodyObj.model || null,
        cache_control: bodyObj.cache_control || undefined,
        tools: Array.isArray(bodyObj.tools) ? { count: bodyObj.tools.length } : undefined,
        system: bodyObj.system ? '[tm_system_present]' : undefined,
        messages: bodyObj.messages.map(m => {
          const msg = { role: m && m.role ? m.role : null };
          const c = m && m.content;
          if (typeof c === 'string') {
            msg.content = tmTruncateStringsDeep(c, 200);
          } else if (Array.isArray(c)) {
            msg.content = c.map(block => {
              if (!block || typeof block !== 'object') return block;
              const b = { type: block.type || null };
              // Keep the cache_control object if present
              if (block.cache_control) b.cache_control = block.cache_control;
              // Keep tool wiring
              if (block.id) b.id = block.id;
              if (block.tool_use_id) b.tool_use_id = block.tool_use_id;
              if (block.name) b.name = block.name;
              // Keep short previews of text
              if (typeof block.text === 'string') b.text = tmTruncateStringsDeep(block.text, 200);
              // Keep input/output shapes but truncate deep strings
              if (block.input !== undefined) b.input = tmTruncateStringsDeep(block.input, 200);
              if (block.content !== undefined) b.content = tmTruncateStringsDeep(block.content, 200);
              return b;
            });
          } else {
            msg.content = '[tm_content_unhandled]';
          }
          return msg;
        })
      };
    }

    // OpenAI Responses API style
    if (Array.isArray(bodyObj.input)) {
      return {
        _tm_skeleton: true,
        model: bodyObj.model || null,
        prompt_cache_key: bodyObj.prompt_cache_key,
        prompt_cache_retention: bodyObj.prompt_cache_retention,
        input: bodyObj.input.map(m => {
          const msg = { role: m && m.role ? m.role : null };
          const c = m && m.content;
          msg.content = tmTruncateStringsDeep(c, 200);
          return msg;
        })
      };
    }

    return {
      _tm_skeleton: true,
      keys: Object.keys(bodyObj)
    };
  }

  function tmReadCaptureRing() {
    try {
      const raw = localStorage.getItem(TM_PAYLOAD_CAPTURE_RING_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function tmWriteCaptureRing(arr) {
    try {
      localStorage.setItem(TM_PAYLOAD_CAPTURE_RING_KEY, JSON.stringify(arr));
    } catch (e) {
      // If localStorage is full or blocked, do not break fetch.
      console.warn('⚠️ [v' + EXT_VERSION + '] Failed to persist payload capture ring buffer:', e);
    }
  }

  function tmUpdateCaptureRecord(captureId, patch) {
    if (!captureId || !patch) return;
    const ring = tmReadCaptureRing();
    const idx = ring.findIndex(r => r && r.id === captureId);
    if (idx < 0) return;
    ring[idx] = { ...ring[idx], ...patch };
    tmWriteCaptureRing(ring);
  }

  function tmCaptureFetchCall(url, options, convIdForThisCall, vendorForThisCall) {
    if (!tmCaptureEnabled()) return null;

    // Ignore TypingMind internal sync/telemetry calls and localhost traffic (noise)
    try {
      const u = String(url || '').toLowerCase();
      if (u.includes('typingmind') || u.includes('localhost') || u.includes('127.0.0.1') || u.includes('127.') || u.includes('_vercel')) {
        return null;
      }
    } catch (e) {}

    const id = 'cap_' + Date.now() + '_' + Math.random().toString(16).slice(2);
    const headersNorm = tmMaybeRedactHeaders(tmNormalizeHeaders(options && options.headers));

    const now = new Date();
    const record = {
      id,
      ts: now.toISOString(),
      ts_local: now.toLocaleString('en-US', { hour12: false, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' }),
      url: String(url || ''),
      method: (options && options.method) ? String(options.method) : 'POST',
      vendorHint: vendorForThisCall || null,
      convIdHint: convIdForThisCall || null,
      headers: headersNorm,
      body_parse_error: null,
      protocol: 'unknown',
      body: null,
      body_skeleton: null,
      body_chars_estimate: null,
      stored_as_skeleton: false,

      // Response capture (filled in later, best-effort)
      response_status: null,
      response_ok: null,
      response_headers: null,
      response_body_parse_error: null,
      response_body: null,
      response_body_chars: null
    };

    try {
      const bodyRaw = options && options.body;
      if (typeof bodyRaw === 'string') {
        record.body_chars_estimate = bodyRaw.length;
        const parsed = JSON.parse(bodyRaw);
        record.protocol = tmDetectProtocol(url, parsed);

        // Always try skeleton first (compact); fall back to truncated if small enough.
        // This prevents localStorage quota overflow for huge payloads.
        var skeleton = tmBuildHugeSkeleton(parsed);
        var skeletonStr = JSON.stringify(skeleton);

        // If skeleton is under 50KB, store it as body for richer debugging.
        // Otherwise store just the skeleton.
        if (skeletonStr.length < 50000) {
          var truncated = tmTruncateStringsDeep(parsed, tmGetTruncationLimit());
          var truncatedStr = JSON.stringify(truncated);
          // Cap per-entry body at 200KB to keep ring buffer under localStorage limits
          if (truncatedStr.length < 200000) {
            record.body = truncated;
          } else {
            record.body_skeleton = skeleton;
            record.stored_as_skeleton = true;
          }
        } else {
          record.body_skeleton = skeleton;
          record.stored_as_skeleton = true;
        }
      } else if (bodyRaw != null) {
        // Non-string body (rare in TypingMind LLM calls, but possible).
        record.body = { _tm_non_string_body: true, type: typeof bodyRaw };
      }
    } catch (e) {
      record.body_parse_error = String(e && e.message ? e.message : e);
    }

    const ring = tmReadCaptureRing();
    ring.push(record);
    while (ring.length > TM_PAYLOAD_CAPTURE_MAX_ENTRIES) {
      ring.shift();
    }

    // Guard against localStorage quota overflow: if write fails, evict oldest entries and retry
    var writeOk = false;
    for (var attempt = 0; attempt < 5 && !writeOk; attempt++) {
      try {
        localStorage.setItem(TM_PAYLOAD_CAPTURE_RING_KEY, JSON.stringify(ring));
        writeOk = true;
      } catch (quotaErr) {
        // Evict oldest entry and retry
        if (ring.length > 1) {
          ring.shift();
          console.warn('\u26a0\ufe0f [v' + EXT_VERSION + '] Payload capture ring exceeded localStorage quota; evicted oldest entry (attempt ' + (attempt + 1) + ')');
        } else {
          // Even a single entry is too large; store a minimal stub
          ring[0] = { id: record.id, ts: record.ts, ts_local: record.ts_local, url: record.url, protocol: record.protocol, _tm_oversized: true };
          try { localStorage.setItem(TM_PAYLOAD_CAPTURE_RING_KEY, JSON.stringify(ring)); } catch (e2) {}
          console.warn('\u26a0\ufe0f [v' + EXT_VERSION + '] Payload capture: even single entry too large for localStorage; stored stub.');
          writeOk = true;
        }
      }
    }

    return id;
  }

  function tmCaptureResponse(captureId, response) {
    if (!tmCaptureEnabled() || !captureId || !response) return;

    try {
      const hdrs = tmMaybeRedactHeaders(tmNormalizeHeaders(response.headers));
      tmUpdateCaptureRecord(captureId, {
        response_status: response.status,
        response_ok: response.ok,
        response_headers: hdrs
      });
    } catch (e) {
      // ignore
    }

    // Best-effort response body capture (can be large / streaming)
    try {
      const clone = response.clone();
      clone.text().then(
        function(text) {
          const patch = { response_body_chars: (typeof text === 'string' ? text.length : null) };
          try {
            // Try JSON parse first (non-streaming responses)
            const parsed = JSON.parse(text);
            patch.response_body = tmTruncateStringsDeep(parsed, tmGetTruncationLimit());
          } catch (e) {
            // SSE/streaming: store head for context
            var s = String(text || '');
            var headLimit = tmGetTruncationLimit();
            patch.response_body_head = s.slice(0, headLimit) +
              (s.length > headLimit ? ('... [tm_truncated +' + (s.length - headLimit) + ' chars]') : '');

            // Extract usage from SSE stream by scanning all data: lines
            try {
              var lines = s.split('\n');
              var lastUsage = null;
              var anthropicUsage = null;
              for (var li = 0; li < lines.length; li++) {
                var line = lines[li].trim();
                if (!line.startsWith('data: ')) continue;
                var jsonStr = line.slice(6).trim();
                if (jsonStr === '[DONE]') continue;
                try {
                  var parsed2 = JSON.parse(jsonStr);
                  // OpenRouter-style: usage in root of chunk
                  if (parsed2 && parsed2.usage) { lastUsage = parsed2.usage; }
                  // Anthropic-style: usage in message_start
                  if (parsed2 && parsed2.type === 'message_start' && parsed2.message && parsed2.message.usage) {
                    anthropicUsage = parsed2.message.usage;
                  }
                  // Anthropic-style: additional usage in message_delta
                  if (parsed2 && parsed2.type === 'message_delta' && parsed2.usage) {
                    anthropicUsage = anthropicUsage || {};
                    var du = parsed2.usage;
                    for (var k in du) { if (Object.prototype.hasOwnProperty.call(du, k)) { anthropicUsage[k] = du[k]; } }
                  }
                } catch (parseErr) {}
              }
              if (lastUsage) { patch.response_usage = lastUsage; }
              if (anthropicUsage) { patch.response_anthropic_usage = anthropicUsage; }
            } catch (usageErr) {}
          }
          tmUpdateCaptureRecord(captureId, patch);
        },
        function(err) {
          tmUpdateCaptureRecord(captureId, { response_body_parse_error: String(err && err.message ? err.message : err) });
        }
      );
    } catch (e) {
      tmUpdateCaptureRecord(captureId, { response_body_parse_error: String(e && e.message ? e.message : e) });
    }
  }

  function tmExportPayloadCapturesToClipboard() {
    const ring = tmReadCaptureRing();
    const json = JSON.stringify(ring, null, 2);

    try {
      localStorage.setItem(TM_PAYLOAD_CAPTURE_EXPORT_KEY, json);
    } catch (e) {
      console.warn('⚠️ [v' + EXT_VERSION + '] Failed to save payload capture export to localStorage:', e);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(json).then(
        function() {
          console.log('✅ [v' + EXT_VERSION + '] Copied payload captures to clipboard (' + ring.length + ' entries).');
        },
        function(err) {
          console.warn('⚠️ [v' + EXT_VERSION + '] Clipboard write failed for payload captures:', err);
        }
      );
    }

    console.warn('⚠️ [v' + EXT_VERSION + '] Clipboard API not available. Read from localStorage key: ' + TM_PAYLOAD_CAPTURE_EXPORT_KEY);
  }

  function tmClearPayloadCaptures() {
    try {
      localStorage.removeItem(TM_PAYLOAD_CAPTURE_RING_KEY);
    } catch (e) {}
  }

  window._payloadExtDebug = {
    // Existing
    getLastSeenConv: () => lastSeenConversation,
    getAnthropicBody: () => lastAnthropicBodyForExport,
    getGeminiBody: () => lastGeminiBodyForExport,
    getGrokBody: () => lastGrokBodyForExport,
    getGpt51Body: () => lastGpt51BodyForExport,

    // NEW: always-on payload capture ring buffer
    getCaptures: () => tmReadCaptureRing(),
    exportCapturesToClipboard: () => tmExportPayloadCapturesToClipboard(),
    clearCaptures: () => tmClearPayloadCaptures()
  };

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
      // Extract only the keyword (first word/token), not the entire rest of the message
      const keyword = after.split(/[\s\n]/)[0];
      if (keyword && keyword.length > 0) {
        return keyword.length > 128 ? keyword.slice(0, 128) : keyword;
      }
      return null;
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

  function exportGrokConversationToClipboard() {
    if (!lastGrokBodyForExport || !Array.isArray(lastGrokBodyForExport.messages)) {
      alert('No Grok conversation available to export yet.');
      return;
    }

    const src = lastGrokBodyForExport.messages;
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
      alert('No user/assistant messages found to export for Grok.');
      return;
    }

    const exportObj = {
      model: lastGrokBodyForExport.model || null,
      created_at: new Date().toISOString(),
      messages: filtered,
    };

    const json = JSON.stringify(exportObj, null, 2);

    try {
      localStorage.setItem('tm_export_grok_conversation_last', json);
    } catch (e) {
      console.warn('⚠️ [v' + EXT_VERSION + '] Failed to save tm_export_grok_conversation_last to localStorage:', e);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json).then(
        function() {
          alert('Exported Grok conversation (user+assistant only) to clipboard.');
        },
        function(err) {
          console.warn('⚠️ [v' + EXT_VERSION + '] Clipboard write failed for Grok export:', err);
          alert('Grok export prepared (user+assistant only), but clipboard write failed. See console/localStorage.');
        }
      );
    } else {
      alert('Grok export prepared (user+assistant only). Retrieve from localStorage key: tm_export_grok_conversation_last.');
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
      const storedCollapsed = localStorage.getItem('gpt51_widget_collapsed');
      if (storedCollapsed === 'true' || storedCollapsed === 'false') {
        el.dataset.collapsed = storedCollapsed;
      }
      document.body.appendChild(el);

      el.addEventListener('click', function(ev) {
        const target = ev.target;
        if (target && target.dataset) {
          // Toggle entire widget collapsed/expanded
          if (target.dataset.action === 'toggle-widget') {
            const widget = ensureGpt51UsageWidget();
            const currentlyCollapsed = widget.dataset.collapsed === 'true';
            const nextState = !currentlyCollapsed;
            widget.dataset.collapsed = String(nextState);
            try {
              localStorage.setItem('gpt51_widget_collapsed', widget.dataset.collapsed);
            } catch (e) {
              console.warn('⚠️ [v' + EXT_VERSION + '] Failed to save gpt51_widget_collapsed to localStorage:', e);
            }
            renderGpt51UsageWidget();
            ev.stopPropagation();
            return;
          }

          // Open payload tool filter modal
          if (target.dataset.action === 'open-payload-modal') {
            openPayloadModal();
            ev.stopPropagation();
            return;
          }

          // Open payload capture modal (ring buffer summary + per-entry copy)
          if (target.dataset.action === 'open-payload-capture-modal') {
            openPayloadCaptureModal();
            ev.stopPropagation();
            return;
          }

          // Truncation limit change
          if (target.dataset.action === 'set-truncation-limit') {
            const newVal = target.value;
            tmSetTruncationLimit(newVal);
            ev.stopPropagation();
            return;
          }

          // Clear ALL GPT-5.1 tracked conversations
          if (target.dataset.action === 'clear-gpt51-conversations') {
            const ok = confirm('Clear ALL tracked GPT-5.1 conversations from this widget?');
            if (ok) {
              try { localStorage.removeItem('gpt51_conv_usage'); } catch (e) {}
              renderGpt51UsageWidget();
            }
            ev.stopPropagation();
            return;
          }
          
          // TOGGLE GEMINI REPAIR (v4.24)
          if (target.dataset.action === 'toggle-gemini-repair') {
            const enabled = localStorage.getItem('tm_gemini_repair_enabled') !== 'false';
            localStorage.setItem('tm_gemini_repair_enabled', String(!enabled));
            alert('Gemini Repair is now: ' + (!enabled ? 'ENABLED' : 'DISABLED'));
            ev.stopPropagation();
            return;
          }
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
          // Export Grok conversation (user+assistant-only JSON)
          if (target.dataset.action === 'export-grok-conversation') {
            exportGrokConversationToClipboard();
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
    const hasGpt51Convs = convIds.length > 0;

    // Widget-level collapse state (persisted in localStorage)
    const collapsed = el.dataset.collapsed === 'true' ||
      (!el.dataset.collapsed && localStorage.getItem('gpt51_widget_collapsed') === 'true');

    const lines = [];
    const toggleIcon = collapsed ? '▸' : '▾';
    lines.push(
      '<div style="display:flex;justify-content:space-between;align-items:center;font-weight:bold;font-size:10px;margin-bottom:2px;">' +
        '<span>GPT-5.1 Conversations (v' + EXT_VERSION + ')</span>' +
        '<span data-action="toggle-widget" style="cursor:pointer;font-size:10px;opacity:0.8;margin-left:6px;">' + toggleIcon + '</span>' +
      '</div>'
    );

    if (collapsed) {
      lines.push('<div style="font-size:10px;opacity:0.85;">(collapsed – click ▸ to expand)</div>');
      el.innerHTML = lines.join('');
      return;
    }

    // Always show export/modal links (work for all vendors), even if no GPT-5.1 convs
    if (!hasGpt51Convs) {
      // No GPT-5.1 conversations, but still render universal controls
      lines.push('<div style="font-size:12px;opacity:0.9;margin-bottom:4px;">GPT-5.1 usage: (no tracked conversations)</div>');
      lines.push('<div style="font-size:10px;opacity:0.9;margin-top:4px;cursor:pointer;text-decoration:underline;" data-action="export-anthropic-conversation">Export Anthropic convo (user+assistant JSON)</div>');
      lines.push('<div style="font-size:10px;opacity:0.9;margin-top:2px;cursor:pointer;text-decoration:underline;" data-action="export-gemini-conversation">Export Gemini convo (user+assistant JSON)</div>');
      lines.push('<div style="font-size:10px;opacity:0.9;margin-top:2px;cursor:pointer;text-decoration:underline;" data-action="export-grok-conversation">Export Grok convo (user+assistant JSON)</div>');
      lines.push('<div style="font-size:10px;opacity:0.9;margin-top:2px;cursor:pointer;text-decoration:underline;" data-action="export-gpt51-conversation">Export GPT-5.1 convo (user+assistant JSON)</div>');
      lines.push('<div style="font-size:10px;opacity:0.9;margin-top:2px;cursor:pointer;text-decoration:underline;" data-action="open-payload-modal">Manage tool payloads…</div>');
      lines.push('<div style="font-size:10px;opacity:0.9;margin-top:2px;cursor:pointer;text-decoration:underline;" data-action="open-payload-capture-modal">Copy payload…</div>');
      lines.push('<div style="font-size:10px;opacity:0.9;margin-top:2px;cursor:pointer;text-decoration:underline;color:#ffaaaa;" data-action="clear-gpt51-conversations">Clear ALL GPT-5.1 conversations</div>');
      lines.push('<div style="font-size:10px;opacity:0.9;margin-top:4px;display:flex;align-items:center;gap:4px;">Trunc:<input id="tm-trunc-input" type="number" min="100" step="500" value="' + tmGetTruncationLimit() + '" data-action="set-truncation-limit" style="width:52px;font-size:10px;background:#222;color:#fff;border:1px solid #555;border-radius:3px;padding:0 2px;" /></div>');

      const repairEnabled = localStorage.getItem('tm_gemini_repair_enabled') !== 'false';
      const repairColor = repairEnabled ? '#a0ffa0' : '#ffaaaa';
      const repairText = repairEnabled ? 'Gemini Repair: ON' : 'Gemini Repair: OFF';
      lines.push('<div style="font-size:10px;opacity:0.9;margin-top:4px;cursor:pointer;text-decoration:underline;color:' + repairColor + ';" data-action="toggle-gemini-repair">' + repairText + '</div>');

      el.innerHTML = lines.join('');

      // Wire up truncation input (needs change event, not click)
      var truncInput = el.querySelector('#tm-trunc-input');
      if (truncInput) {
        truncInput.addEventListener('change', function() { tmSetTruncationLimit(this.value); });
        truncInput.addEventListener('click', function(e) { e.stopPropagation(); });
      }
      return;
    }

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
    lines.push('<div style="font-size:10px;opacity:0.9;margin-top:2px;cursor:pointer;text-decoration:underline;" data-action="export-grok-conversation">Export Grok convo (user+assistant JSON)</div>');
    lines.push('<div style="font-size:10px;opacity:0.9;margin-top:2px;cursor:pointer;text-decoration:underline;" data-action="export-gpt51-conversation">Export GPT-5.1 convo (user+assistant JSON)</div>');
    lines.push('<div style="font-size:10px;opacity:0.9;margin-top:2px;cursor:pointer;text-decoration:underline;" data-action="open-payload-modal">Manage tool payloads…</div>');
    lines.push('<div style="font-size:10px;opacity:0.9;margin-top:2px;cursor:pointer;text-decoration:underline;" data-action="open-payload-capture-modal">Copy payload…</div>');
    lines.push('<div style="font-size:10px;opacity:0.9;margin-top:2px;cursor:pointer;text-decoration:underline;color:#ffaaaa;" data-action="clear-gpt51-conversations">Clear ALL GPT-5.1 conversations</div>');
    lines.push('<div style="font-size:10px;opacity:0.9;margin-top:4px;display:flex;align-items:center;gap:4px;">Trunc:<input id="tm-trunc-input" type="number" min="100" step="500" value="' + tmGetTruncationLimit() + '" data-action="set-truncation-limit" style="width:52px;font-size:10px;background:#222;color:#fff;border:1px solid #555;border-radius:3px;padding:0 2px;" /></div>');

    const repairEnabled = localStorage.getItem('tm_gemini_repair_enabled') !== 'false';
    const repairColor = repairEnabled ? '#a0ffa0' : '#ffaaaa';
    const repairText = repairEnabled ? 'Gemini Repair: ON' : 'Gemini Repair: OFF';
    lines.push('<div style="font-size:10px;opacity:0.9;margin-top:4px;cursor:pointer;text-decoration:underline;color:' + repairColor + ';" data-action="toggle-gemini-repair">' + repairText + '</div>');

    el.innerHTML = lines.join('');

    // Wire up truncation input (needs change event, not click)
    var truncInput2 = el.querySelector('#tm-trunc-input');
    if (truncInput2) {
      truncInput2.addEventListener('change', function() { tmSetTruncationLimit(this.value); });
      truncInput2.addEventListener('click', function(e) { e.stopPropagation(); });
    }
  }

  // ==================== PAYLOAD TOOL FILTERS & MODAL ====================

  let lastSeenConversation = null;

  function getPayloadFilterStore() {
    try {
      const raw = localStorage.getItem('tm_payload_tool_filters');
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.warn('⚠️ [v' + EXT_VERSION + '] Failed to parse tm_payload_tool_filters from localStorage:', e);
      return {};
    }
  }

  function savePayloadFilterStore(store) {
    try {
      localStorage.setItem('tm_payload_tool_filters', JSON.stringify(store));
    } catch (e) {
      console.warn('⚠️ [v' + EXT_VERSION + '] Failed to save tm_payload_tool_filters to localStorage:', e);
    }
  }

  function conversationKey(vendor, convId) {
    return vendor + '::' + convId;
  }

  function getFilterForConversation(vendor, convId) {
    if (!vendor || !convId) {
      return { convId: null, vendor: null, toolEntries: {} };
    }
    const store = getPayloadFilterStore();
    const key = conversationKey(vendor, convId);
    return store[key] || { convId, vendor, toolEntries: {} };
  }

  function saveFilterForConversation(cfg) {
    if (!cfg || !cfg.vendor || !cfg.convId) return;
    const store = getPayloadFilterStore();
    const key = conversationKey(cfg.vendor, cfg.convId);
    store[key] = cfg;
    savePayloadFilterStore(store);
  }

  function deleteFilterConversation(convKey) {
    const store = getPayloadFilterStore();
    if (store[convKey]) {
      delete store[convKey];
      savePayloadFilterStore(store);
    }
  }

  function notePayloadConversation(vendor, convId, model) {
    if (!vendor || !convId) return;
    lastSeenConversation = { vendor, convId, model: model || null };
  }

  const TOOL_INPUT_STUB = { _tm_excluded: true, _tm_stub: true };
  const TOOL_OUTPUT_STUB = [{ type: 'text', text: '[tm_excluded_tool_output]' }];

  function collectAnthropicToolGroups(body) {
    const groups = {};
    if (!body || !Array.isArray(body.messages)) return groups;
    const messages = body.messages;

    messages.forEach((msg, msgIndex) => {
      if (!msg || !Array.isArray(msg.content)) return;
      msg.content.forEach((block, blockIndex) => {
        if (!block || !block.type) return;
        if (block.type === 'tool_use') {
          const id = block.id || ('m' + msgIndex + '_b' + blockIndex);
          const g = groups[id] || (groups[id] = {
            id,
            name: block.name || 'tool',
            toolUseBlocks: [],
            toolResultBlocks: [],
            inputSize: 0,
            outputSize: 0
          });
          g.toolUseBlocks.push({ msgIndex, blockIndex, blockRef: block });
          if (block.input !== undefined) {
            try { g.inputSize += JSON.stringify(block.input).length; } catch (e) {}
          }
        } else if (block.type === 'tool_result' && block.tool_use_id) {
          const id = block.tool_use_id;
          const g = groups[id] || (groups[id] = {
            id,
            name: block.name || 'tool',
            toolUseBlocks: [],
            toolResultBlocks: [],
            inputSize: 0,
            outputSize: 0
          });
          g.toolResultBlocks.push({ msgIndex, blockIndex, blockRef: block });
          if (block.content !== undefined) {
            try { g.outputSize += JSON.stringify(block.content).length; } catch (e) {}
          }
        }
      });
    });

    return groups;
  }

  function applyAnthropicToolFilters(body, vendor, convId) {
    if (!body || !Array.isArray(body.messages) || !vendor || !convId) return false;
    const groups = collectAnthropicToolGroups(body);
    const keys = Object.keys(groups);
    if (!keys.length) return false;

    const cfg = getFilterForConversation(vendor, convId);
    let changed = false;

    keys.forEach(id => {
      const g = groups[id];
      const entry = cfg.toolEntries[id] || { includeInput: true, includeOutput: true };

      if (!entry.includeInput) {
        g.toolUseBlocks.forEach(info => {
          const block = info.blockRef;
          if (block && block.input !== undefined && block.input !== TOOL_INPUT_STUB) {
            block.input = TOOL_INPUT_STUB;
            changed = true;
          }
        });
      }

      if (!entry.includeOutput) {
        g.toolResultBlocks.forEach(info => {
          const block = info.blockRef;
          if (block && block.content !== undefined && block.content !== TOOL_OUTPUT_STUB) {
            block.content = TOOL_OUTPUT_STUB;
            changed = true;
          }
        });
      }

      cfg.toolEntries[id] = entry;
    });

    if (changed) {
      saveFilterForConversation(cfg);
    }

    return changed;
  }

  function humanReadableSize(bytes) {
    if (!bytes || isNaN(bytes)) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    const kb = bytes / 1024;
    if (kb < 1024) return kb.toFixed(1) + ' KB';
    const mb = kb / 1024;
    return mb.toFixed(2) + ' MB';
  }

  let payloadModalEl = null;
  let payloadModalInnerEl = null;

  function ensurePayloadModal() {
    if (payloadModalEl) return payloadModalEl;

    const overlay = document.createElement('div');
    overlay.id = 'tm-payload-modal-overlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '100000';
    overlay.style.background = 'rgba(0,0,0,0.55)';
    overlay.style.display = 'none';

    const panel = document.createElement('div');
    panel.id = 'tm-payload-modal';
    panel.style.position = 'absolute';
    panel.style.top = '50%';
    panel.style.left = '50%';
    panel.style.transform = 'translate(-50%, -50%)';
    panel.style.width = '80vw';
    panel.style.height = '80vh';
    panel.style.background = 'rgba(15,15,20,0.96)';
    panel.style.color = '#fff';
    panel.style.borderRadius = '6px';
    panel.style.boxShadow = '0 4px 16px rgba(0,0,0,0.6)';
    panel.style.padding = '10px 12px';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    panel.style.fontSize = '12px';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.marginBottom = '6px';
    header.innerHTML =
      '<div style="font-weight:600;">Payload Tool Filters</div>' +
      '<div style="font-size:11px;opacity:0.8;">' +
      'Use this to exclude large tool inputs/outputs from future payloads while keeping prompt caching viable.' +
      '</div>' +
      '<button data-action="close-payload-modal" ' +
      'style="margin-left:8px;background:#444;color:#fff;border:none;border-radius:3px;padding:2px 6px;font-size:11px;cursor:pointer;">Close</button>';

    const body = document.createElement('div');
    body.id = 'tm-payload-modal-body';
    body.style.flex = '1';
    body.style.overflow = 'auto';
    body.style.marginTop = '4px';

    panel.appendChild(header);
    panel.appendChild(body);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function(ev) {
      const t = ev.target;
      if (t.dataset && t.dataset.action === 'close-payload-modal') {
        closePayloadModal();
        ev.stopPropagation();
        return;
      }
      if (t === overlay) {
        closePayloadModal();
        return;
      }
      if (t.dataset && t.dataset.action === 'delete-payload-conv') {
        const convKey = t.dataset.convKey;
        deleteFilterConversation(convKey);
        renderPayloadModal();
        ev.stopPropagation();
        return;
      }
      if (t.dataset && t.dataset.part && t.dataset.groupId) {
        const part = t.dataset.part; // "input" or "output"
        const groupId = t.dataset.groupId;
        if (!lastSeenConversation || !lastSeenConversation.vendor || !lastSeenConversation.convId) {
          return;
        }
        const cfg = getFilterForConversation(lastSeenConversation.vendor, lastSeenConversation.convId);
        const entry = cfg.toolEntries[groupId] || { includeInput: true, includeOutput: true };
        if (part === 'input') {
          entry.includeInput = !entry.includeInput;
        } else if (part === 'output') {
          entry.includeOutput = !entry.includeOutput;
        }
        cfg.toolEntries[groupId] = entry;
        saveFilterForConversation(cfg);
        renderPayloadModal();
        ev.stopPropagation();
        return;
      }
    });

    payloadModalEl = overlay;
    payloadModalInnerEl = body;
    return overlay;
  }

  function renderPayloadModal() {
    if (typeof document === 'undefined') return;
    const overlay = ensurePayloadModal();
    const bodyEl = payloadModalInnerEl;
    if (!bodyEl) return;

    const store = getPayloadFilterStore();
    const convKeys = Object.keys(store);

    let html = '';

    // Global conversation list
    html += '<div style="margin-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.15);padding-bottom:4px;">';
    html += '<div style="font-weight:600;margin-bottom:2px;">Tracked conversations</div>';
    if (!convKeys.length) {
      html += '<div style="font-size:11px;opacity:0.8;">No payload filter state yet. Open a conversation and toggle tool filters to create entries.</div>';
    } else {
      convKeys.forEach(key => {
        const cfg = store[key] || {};
        const safeLabel = ((cfg.vendor || '?') + ' :: ' + (cfg.convId || key)).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html += '<div style="font-size:11px;margin-bottom:2px;display:flex;align-items:center;justify-content:space-between;">' +
          '<span style="max-width:80%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + safeLabel + '</span>' +
          '<button data-action="delete-payload-conv" data-conv-key="' + key + '" ' +
          'style="margin-left:6px;background:#552222;color:#fff;border:none;border-radius:3px;padding:1px 4px;font-size:10px;cursor:pointer;">Delete</button>' +
          '</div>';
      });
    }
    html += '</div>';

    // Current conversation section
    html += '<div>';
    html += '<div style="font-weight:600;margin-bottom:2px;">Current conversation</div>';

    if (!lastSeenConversation || !lastSeenConversation.vendor || !lastSeenConversation.convId) {
      html += '<div style="font-size:11px;opacity:0.8;">No active conversation detected yet. Send a message (with your usual "load files &lt;id&gt;" pattern) and try again.</div>';
      html += '</div>';
      bodyEl.innerHTML = html;
      return;
    }

    const vendor = lastSeenConversation.vendor;
    const convId = lastSeenConversation.convId;
    const model = lastSeenConversation.model || '';
    const headerLine = '[' + vendor + '] ' + convId + (model ? (' · ' + model) : '');
    html += '<div style="font-size:11px;opacity:0.9;margin-bottom:4px;">' + headerLine + '</div>';

    if (vendor !== 'anthropic') {
      html += '<div style="font-size:11px;opacity:0.8;">Tool payload filtering is currently implemented for Anthropic. This conversation is ' + vendor + ', so only global management applies for now.</div>';
      html += '</div>';
      bodyEl.innerHTML = html;
      return;
    }

    if (!lastAnthropicBodyForExport || !Array.isArray(lastAnthropicBodyForExport.messages)) {
      html += '<div style="font-size:11px;opacity:0.8;">No cached Anthropic payload for this conversation yet. Send a message and try again.</div>';
      html += '</div>';
      bodyEl.innerHTML = html;
      return;
    }

    const groups = collectAnthropicToolGroups(lastAnthropicBodyForExport);
    const ids = Object.keys(groups);
    if (!ids.length) {
      html += '<div style="font-size:11px;opacity:0.8;">No tool calls found in the latest Anthropic payload for this conversation.</div>';
      html += '</div>';
      bodyEl.innerHTML = html;
      return;
    }

    const cfg = getFilterForConversation(vendor, convId);

    html += '<div style="font-size:11px;opacity:0.9;margin-bottom:2px;">Tool calls in latest Anthropic payload</div>';
    html += '<div style="font-size:10px;opacity:0.8;margin-bottom:4px;">Toggle input/output to exclude large arguments from future payloads. Excluded parts will be replaced with small constant stubs to preserve prompt caching.</div>';

    ids.forEach(id => {
      const g = groups[id];
      const entry = cfg.toolEntries[id] || { includeInput: true, includeOutput: true };
      const safeId = id.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const name = (g.name || 'tool').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const inSize = humanReadableSize(g.inputSize);
      const outSize = humanReadableSize(g.outputSize);

      const bothIncluded = entry.includeInput && entry.includeOutput;
      const bothExcluded = !entry.includeInput && !entry.includeOutput;

      let rowBg = 'rgba(20,40,24,0.85)'; // both included
      if (bothExcluded) {
        rowBg = 'rgba(40,40,40,0.85)';
      } else if (!entry.includeInput || !entry.includeOutput) {
        rowBg = 'rgba(32,32,32,0.85)';
      }

      const inputBg = entry.includeInput ? '#245f36' : '#444444';
      const outputBg = entry.includeOutput ? '#245f36' : '#444444';

      html += '<div style="margin-bottom:4px;padding:4px;border-radius:4px;background:' + rowBg + ';">';
      html += '<div style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
              name + ' <span style="opacity:0.7;font-weight:400;">[' + safeId + ']</span></div>';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:2px;font-size:11px;">';
      html += '<div>in: ' + inSize + ' · out: ' + outSize + '</div>';
      html += '<div>';
      html += '<button data-group-id="' + id + '" data-part="input" ' +
              'style="margin-left:4px;background:' + inputBg + ';color:#fff;border:none;border-radius:3px;padding:1px 6px;font-size:10px;cursor:pointer;">In</button>';
      html += '<button data-group-id="' + id + '" data-part="output" ' +
              'style="margin-left:4px;background:' + outputBg + ';color:#fff;border:none;border-radius:3px;padding:1px 6px;font-size:10px;cursor:pointer;">Out</button>';
      html += '</div>';
      html += '</div>';
      html += '</div>';
    });

    html += '</div>';
    bodyEl.innerHTML = html;
  }

  function openPayloadModal() {
    if (typeof document === 'undefined') return;
    const overlay = ensurePayloadModal();
    overlay.style.display = 'block';
    renderPayloadModal();
  }

  function closePayloadModal() {
    if (!payloadModalEl) return;
    payloadModalEl.style.display = 'none';
  }

  // ==================== PAYLOAD CAPTURE MODAL (RING BUFFER) ====================

  let payloadCaptureModalEl = null;
  let payloadCaptureModalInnerEl = null;

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function ensurePayloadCaptureModal() {
    if (payloadCaptureModalEl) return payloadCaptureModalEl;

    const overlay = document.createElement('div');
    overlay.id = 'tm-payload-capture-modal-overlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '100001';
    overlay.style.background = 'rgba(0,0,0,0.55)';
    overlay.style.display = 'none';

    const panel = document.createElement('div');
    panel.id = 'tm-payload-capture-modal';
    panel.style.position = 'absolute';
    panel.style.top = '50%';
    panel.style.left = '50%';
    panel.style.transform = 'translate(-50%, -50%)';
    panel.style.width = '86vw';
    panel.style.height = '86vh';
    panel.style.background = 'rgba(15,15,20,0.96)';
    panel.style.color = '#fff';
    panel.style.borderRadius = '6px';
    panel.style.boxShadow = '0 4px 16px rgba(0,0,0,0.6)';
    panel.style.padding = '10px 12px';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    panel.style.fontSize = '12px';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.marginBottom = '6px';
    header.innerHTML =
      '<div style="font-weight:600;">Payload Capture Ring Buffer</div>' +
      '<div style="font-size:11px;opacity:0.8;">' +
      'Most recent first. Copy outbound/request + inbound/response pieces for debugging.' +
      '</div>' +
      '<button data-action="close-payload-capture-modal" ' +
      'style="margin-left:8px;background:#444;color:#fff;border:none;border-radius:3px;padding:2px 6px;font-size:11px;cursor:pointer;">Close</button>';

    const body = document.createElement('div');
    body.id = 'tm-payload-capture-modal-body';
    body.style.flex = '1';
    body.style.overflow = 'auto';
    body.style.marginTop = '4px';

    panel.appendChild(header);
    panel.appendChild(body);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    payloadCaptureModalEl = overlay;
    payloadCaptureModalInnerEl = body;

    overlay.addEventListener('click', function(ev) {
      const t = ev.target;
      if (!t) return;

      // Click outside panel closes
      if (t === overlay) {
        closePayloadCaptureModal();
        return;
      }

      if (t.dataset && t.dataset.action === 'close-payload-capture-modal') {
        closePayloadCaptureModal();
        return;
      }

      if (t.dataset && t.dataset.action === 'copy-payload-capture') {
        const capId = t.dataset.captureId;
        const part = t.dataset.part;
        if (!capId || !part) return;
        copyPayloadCapturePart(capId, part);
        return;
      }
    });

    return overlay;
  }

  function getCaptureById(captureId) {
    const ring = tmReadCaptureRing();
    return ring.find(r => r && r.id === captureId) || null;
  }

  function copyTextToClipboard(text, label) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function() {
          console.log('✅ [v' + EXT_VERSION + '] Copied: ' + (label || 'payload'));
        },
        function(err) {
          console.warn('⚠️ [v' + EXT_VERSION + '] Clipboard write failed:', err);
          alert('Clipboard write failed; see console.');
        }
      );
      return;
    }
    alert('Clipboard API not available.');
  }

  function tmSummarizeCacheControl(bodyObj) {
    // Returns {count, ttls: {...}, hasAny, paths_sample:[...]} for quick debugging.
    const out = { count: 0, hasAny: false, ttls: {}, paths_sample: [] };
    const maxPaths = 20;

    function walk(x, path) {
      if (x == null) return;
      if (typeof x !== 'object') return;
      if (Array.isArray(x)) {
        for (let i = 0; i < x.length; i++) {
          walk(x[i], path + '[' + i + ']');
        }
        return;
      }
      // object
      if (Object.prototype.hasOwnProperty.call(x, 'cache_control')) {
        out.count += 1;
        out.hasAny = true;
        if (out.paths_sample.length < maxPaths) out.paths_sample.push(path + '.cache_control');
        try {
          const cc = x.cache_control;
          if (cc && typeof cc === 'object' && typeof cc.ttl === 'string') {
            out.ttls[cc.ttl] = (out.ttls[cc.ttl] || 0) + 1;
          } else {
            out.ttls['(none)'] = (out.ttls['(none)'] || 0) + 1;
          }
        } catch (e) {}
      }
      Object.keys(x).forEach(k => {
        walk(x[k], path ? (path + '.' + k) : k);
      });
    }

    walk(bodyObj, 'body');
    return out;
  }

  function tmFnv1a32(str) {
    // Simple fast deterministic hash for debugging prefix stability.
    // Not cryptographic.
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      // h *= 16777619 (FNV prime) with 32-bit overflow
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  function tmComputeSystemToolsPrefixHash(reqBody) {
    try {
      if (!reqBody || typeof reqBody !== 'object') return null;
      const tools = Array.isArray(reqBody.tools) ? reqBody.tools : null;
      // For OpenAI chat-completions payloads, system is a message with role=system.
      let system = null;
      if (Array.isArray(reqBody.messages)) {
        const sys = reqBody.messages.find(m => m && m.role === 'system');
        system = sys ? sys.content : null;
      }
      const stableObj = { tools, system };
      const s = JSON.stringify(stableObj);
      return tmFnv1a32(s);
    } catch (e) {
      return null;
    }
  }

  function tmBuildCaptureSummary(cap) {
    if (!cap) return null;
    const reqBody = cap.stored_as_skeleton ? cap.body_skeleton : cap.body;

    let model = null;
    let hasCacheControl = null;
    let cacheControlSummary = null;
    let system_tools_prefix_hash = null;

    try {
      if (reqBody && typeof reqBody === 'object') {
        model = reqBody.model || null;
        cacheControlSummary = tmSummarizeCacheControl(reqBody);
        hasCacheControl = !!(cacheControlSummary && cacheControlSummary.hasAny);
        system_tools_prefix_hash = tmComputeSystemToolsPrefixHash(reqBody);
      }
    } catch (e) {}

    return {
      ts: cap.ts,
      url: cap.url,
      method: cap.method,
      protocol: cap.protocol,
      vendorHint: cap.vendorHint,
      convIdHint: cap.convIdHint,
      model,
      hasCacheControl,
      cacheControlSummary,
      system_tools_prefix_hash,
      response_status: cap.response_status,
      response_ok: cap.response_ok,
      response_content_type: cap.response_headers ? (cap.response_headers['content-type'] || cap.response_headers['Content-Type'] || null) : null,
      response_usage: cap.response_usage || null,
      response_anthropic_usage: cap.response_anthropic_usage || null
    };
  }

  function copyPayloadCapturePart(captureId, part) {
    const cap = getCaptureById(captureId);
    if (!cap) return;

    const reqBody = cap.stored_as_skeleton ? cap.body_skeleton : cap.body;

    let obj = null;
    let label = part;

    if (part === 'out_headers') {
      obj = cap.headers;
      label = 'Outbound headers';
    } else if (part === 'out_payload') {
      obj = {
        url: cap.url,
        method: cap.method,
        protocol: cap.protocol,
        vendorHint: cap.vendorHint,
        convIdHint: cap.convIdHint,
        body: reqBody
      };
      label = 'Outbound payload';
    } else if (part === 'out_payload_skeleton') {
      // Always generate a skeleton on demand for easy sharing.
      let skeleton = null;
      try {
        skeleton = tmBuildHugeSkeleton(reqBody);
      } catch (e) {
        skeleton = { _tm_skeleton_error: String(e && e.message ? e.message : e) };
      }
      obj = {
        url: cap.url,
        method: cap.method,
        protocol: cap.protocol,
        vendorHint: cap.vendorHint,
        convIdHint: cap.convIdHint,
        body_skeleton: skeleton
      };
      label = 'Outbound payload (skeleton)';
    } else if (part === 'summary') {
      obj = tmBuildCaptureSummary(cap);
      label = 'Capture summary';
    } else if (part === 'in_headers') {
      obj = cap.response_headers;
      label = 'Response headers';
    } else if (part === 'in_payload') {
      obj = {
        status: cap.response_status,
        ok: cap.response_ok,
        body: cap.response_body
      };
      label = 'Response payload';
    } else if (part === 'in_payload_skeleton') {
      // Response may be string or object. Skeleton == aggressively trimmed.
      let sk = null;
      try {
        sk = tmTruncateStringsDeep(cap.response_body, 200);
      } catch (e) {
        sk = { _tm_skeleton_error: String(e && e.message ? e.message : e) };
      }
      obj = {
        status: cap.response_status,
        ok: cap.response_ok,
        body_skeleton: sk
      };
      label = 'Response payload (skeleton)';
    }

    if (obj == null) return;
    copyTextToClipboard(JSON.stringify(obj, null, 2), label);
  }

  function renderPayloadCaptureModal() {
    if (!payloadCaptureModalInnerEl) return;

    const ring = tmReadCaptureRing();
    const items = ring.slice().reverse(); // most recent first

    let html = '';

    if (!items.length) {
      html = '<div style="opacity:0.85;">No captured payloads yet.</div>';
      payloadCaptureModalInnerEl.innerHTML = html;
      return;
    }

    html += '<div style="font-size:11px;opacity:0.85;margin-bottom:8px;">' +
            'Stored in localStorage key <code>' + escapeHtml(TM_PAYLOAD_CAPTURE_RING_KEY) + '</code>. ' +
            'Each string is truncated to ' + TM_PAYLOAD_CAPTURE_MAX_STRING_CHARS + ' chars. ' +
            'Responses are best-effort (may be empty for streaming/opaque responses).' +
            '</div>';

    items.forEach((cap, idx) => {
      if (!cap) return;
      const ts = escapeHtml(cap.ts_local || cap.ts || '');
      const url = escapeHtml(cap.url || '');
      const protocol = escapeHtml(cap.protocol || 'unknown');
      const capId = escapeHtml(cap.id || '');

      // Attempt to show model + prefix hash
      let model = '';
      let prefixHash = '';
      try {
        const sum = tmBuildCaptureSummary(cap);
        model = (sum && sum.model) ? String(sum.model) : '';
        prefixHash = (sum && sum.system_tools_prefix_hash) ? String(sum.system_tools_prefix_hash) : '';
      } catch (e) {}
      model = escapeHtml(model);
      prefixHash = escapeHtml(prefixHash);

      const outBtnStyle = 'background:#245f36;color:#fff;border:none;border-radius:3px;padding:1px 6px;font-size:10px;cursor:pointer;margin-left:4px;';
      const inBtnStyle  = 'background:#2a4b7c;color:#fff;border:none;border-radius:3px;padding:1px 6px;font-size:10px;cursor:pointer;margin-left:4px;';

      const hasResp = cap.response_status != null || cap.response_headers != null || cap.response_body != null;
      const inDisabled = hasResp ? '' : 'opacity:0.45;cursor:not-allowed;pointer-events:none;';

      html += '<div style="margin-bottom:8px;padding:8px;border-radius:6px;background:rgba(30,30,36,0.85);">';
      html += '<div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
              '<span style="opacity:0.8;">#' + (idx + 1) + '</span> ' + protocol +
              (model ? (' <span style="opacity:0.75;">(' + model + ')</span>') : '') +
              (prefixHash ? (' <span style="opacity:0.65;">h:' + prefixHash + '</span>') : '') +
              '</div>';
      html += '<div style="font-size:10px;opacity:0.85;margin-top:2px;color:#8cf;">' + ts + '</div>';
      html += '<div style="font-size:11px;opacity:0.9;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + url + '</div>';

      html += '<div style="margin-top:6px;font-size:10px;opacity:0.9;">Copy:</div>';
      html += '<div style="margin-top:2px;">' +
              '<button data-action="copy-payload-capture" data-capture-id="' + capId + '" data-part="summary" style="background:#555;color:#fff;border:none;border-radius:3px;padding:1px 6px;font-size:10px;cursor:pointer;margin-left:0;">Summary</button>' +
              '<button data-action="copy-payload-capture" data-capture-id="' + capId + '" data-part="out_headers" style="' + outBtnStyle + '">Outbound Headers</button>' +
              '<button data-action="copy-payload-capture" data-capture-id="' + capId + '" data-part="out_payload" style="' + outBtnStyle + '">Outbound Payload</button>' +
              '<button data-action="copy-payload-capture" data-capture-id="' + capId + '" data-part="out_payload_skeleton" style="background:#1f4a2b;color:#fff;border:none;border-radius:3px;padding:1px 6px;font-size:10px;cursor:pointer;margin-left:4px;">Outbound Skeleton</button>' +
              '<button data-action="copy-payload-capture" data-capture-id="' + capId + '" data-part="in_headers" style="' + inBtnStyle + inDisabled + '">Response Headers</button>' +
              '<button data-action="copy-payload-capture" data-capture-id="' + capId + '" data-part="in_payload" style="' + inBtnStyle + inDisabled + '">Response Payload</button>' +
              '<button data-action="copy-payload-capture" data-capture-id="' + capId + '" data-part="in_payload_skeleton" style="background:#2a4b7c;color:#fff;border:none;border-radius:3px;padding:1px 6px;font-size:10px;cursor:pointer;margin-left:4px;' + (hasResp ? '' : 'opacity:0.45;cursor:not-allowed;pointer-events:none;') + '">Response Skeleton</button>' +
              '</div>';

      html += '<div style="font-size:10px;opacity:0.7;margin-top:6px;">capId: ' + capId + '</div>';
      html += '</div>';
    });

    payloadCaptureModalInnerEl.innerHTML = html;
  }

  function openPayloadCaptureModal() {
    if (typeof document === 'undefined') return;
    const overlay = ensurePayloadCaptureModal();
    overlay.style.display = 'block';
    renderPayloadCaptureModal();
  }

  function closePayloadCaptureModal() {
    if (!payloadCaptureModalEl) return;
    payloadCaptureModalEl.style.display = 'none';
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

  function repairAnthropicEmptyMessageContent(body) {
    if (!Array.isArray(body.messages) || body.messages.length === 0) return false;
    let changed = false;

    body.messages.forEach((msg, msgIdx) => {
      if (!msg) return;
      if (msg.role !== 'assistant' && msg.role !== 'user') return;

      const c = msg.content;

      // Case 1: string content that is empty/whitespace
      if (typeof c === 'string') {
        if (c.trim() === '') {
          msg.content = `[tm_repaired_empty_${msg.role}_message]`;
          console.log(`🩹 [v${EXT_VERSION}] Repaired empty ${msg.role} string content on message ${msgIdx}`);
          changed = true;
        }
        return;
      }

      // Case 2: array content with no blocks (e.g. content: [])
      if (Array.isArray(c)) {
        if (c.length === 0) {
          msg.content = [{ type: 'text', text: `[tm_repaired_empty_${msg.role}_content]` }];
          console.log(`🩹 [v${EXT_VERSION}] Repaired empty ${msg.role} content array on message ${msgIdx}`);
          changed = true;
        }
        return;
      }

      // Case 3: null/undefined content
      if (c == null) {
        msg.content = [{ type: 'text', text: `[tm_repaired_empty_${msg.role}_content]` }];
        console.log(`🩹 [v${EXT_VERSION}] Repaired missing ${msg.role} content on message ${msgIdx}`);
        changed = true;
      }
    });

    return changed;
  }

  function repairGeminiThoughtSignatures(body) {
    if (!body || !Array.isArray(body.contents)) return false;

    let changed = false;
    // Start with any cached Gemini thoughtSignature seed so we can populate early
    // contents before the first in-conversation token appears.
    let lastThoughtSignature = getCachedGeminiThoughtSignature() || null;

    body.contents.forEach((entry, contentIdx) => {
      if (!entry || !Array.isArray(entry.parts)) return;

      // First pass: discover any existing signature for this content
      let contentSignature = null;
      entry.parts.forEach(part => {
        if (!part || typeof part !== 'object') return;
        if (typeof part.thoughtSignature === 'string' && part.thoughtSignature.trim() !== '') {
          const sig = part.thoughtSignature.trim();
          if (!contentSignature) {
            contentSignature = sig;
          } else if (contentSignature !== sig) {
            console.warn(
              `⚠️ [v${EXT_VERSION}] Mismatched Gemini thoughtSignature values in contents[${contentIdx}]; using first encountered.`
            );
          }
        }
      });

      // If this content has no signature but we have a prior one, propagate the last
      // signature forward to any content that actually carries text or functionCall parts
      // (user or model). This keeps the whole thinking exchange coherent.
      if (!contentSignature && lastThoughtSignature) {
        const hasToolOrText = entry.parts.some(
          p => p && (p.functionCall || typeof p.text === 'string')
        );
        if (hasToolOrText) {
          contentSignature = lastThoughtSignature;
        }
      }

      // Second pass: apply the contentSignature uniformly to all parts in this content.
      if (contentSignature) {
        cacheGeminiThoughtSignature(contentSignature);
        entry.parts.forEach((part, partIdx) => {
          if (!part || typeof part !== 'object') return;
          if (!part.thoughtSignature) {
            part.thoughtSignature = contentSignature;
            changed = true;
            console.log(
              `🩹 [v${EXT_VERSION}] Repaired missing Gemini thoughtSignature on part (contents[${contentIdx}].parts[${partIdx}])`
            );
          }
        });
        lastThoughtSignature = contentSignature;
      }
    });

    return changed;
  }

  function hasAnyGeminiThoughtSignature(body) {
    if (!body || !Array.isArray(body.contents)) return false;
    for (let i = 0; i < body.contents.length; i++) {
      const entry = body.contents[i];
      if (!entry || !Array.isArray(entry.parts)) continue;
      for (let j = 0; j < entry.parts.length; j++) {
        const part = entry.parts[j];
        if (!part || typeof part !== 'object') continue;
        if (typeof part.thoughtSignature === 'string' && part.thoughtSignature.trim() !== '') {
          return true;
        }
      }
    }
    return false;
  }

  const GEMINI_THOUGHT_SIGNATURE_CACHE_KEY = '__tmGeminiThoughtSignatureSeed_v1';

  function cacheGeminiThoughtSignature(sig) {
    try {
      if (!sig || typeof sig !== 'string') return;
      if (!sig.trim()) return;

      // Avoid caching our own synthetic values if any pre-v4.19 code still exists
      if (sig.startsWith('tm-init-')) return;

      if (window.__tmGeminiThoughtSignatureSeed !== sig) {
        window.__tmGeminiThoughtSignatureSeed = sig;
        console.log('💾 [v' + EXT_VERSION + '] Cached Gemini thoughtSignature seed (length: ' + sig.length + '):', sig.length < 100 ? sig : (sig.slice(0, 20) + '...' + sig.slice(-20)));
      }

      try {
        const existing = window.localStorage.getItem(GEMINI_THOUGHT_SIGNATURE_CACHE_KEY);
        if (existing !== sig) {
          window.localStorage.setItem(GEMINI_THOUGHT_SIGNATURE_CACHE_KEY, sig);
        }
      } catch (e) {
        console.warn('⚠️ [v' + EXT_VERSION + '] Could not persist Gemini thoughtSignature seed to localStorage:', e);
      }
    } catch (e) {
      console.warn('⚠️ [v' + EXT_VERSION + '] Error while caching Gemini thoughtSignature seed:', e);
    }
  }

  function getCachedGeminiThoughtSignature() {
    try {
      if (typeof window.__tmGeminiThoughtSignatureSeed === 'string' &&
          window.__tmGeminiThoughtSignatureSeed.trim()) {
        return window.__tmGeminiThoughtSignatureSeed;
      }

      try {
        const fromLS = window.localStorage.getItem(GEMINI_THOUGHT_SIGNATURE_CACHE_KEY);
        if (typeof fromLS === 'string' && fromLS.trim()) {
          window.__tmGeminiThoughtSignatureSeed = fromLS;
          console.log('💾 [v' + EXT_VERSION + '] Loaded Gemini thoughtSignature seed from localStorage (length: ' + fromLS.length + ')');
          return fromLS;
        }
      } catch (e) {
        console.warn('⚠️ [v' + EXT_VERSION + '] Could not read Gemini thoughtSignature seed from localStorage:', e);
      }
    } catch (e) {
      console.warn('⚠️ [v' + EXT_VERSION + '] Error while reading Gemini thoughtSignature seed:', e);
    }

    return null;
  }

  function synthesizeGeminiThoughtSignature(body) {
    const synthetic = getCachedGeminiThoughtSignature();
    if (!synthetic) {
      console.warn('⚠️ [v' + EXT_VERSION + '] No cached Gemini thoughtSignature seed available; cannot synthesize. Request may fail with missing thought_signature.');
      return false;
    }

    if (!body || !Array.isArray(body.contents)) return false;

    let changed = false;

    body.contents.forEach((entry, contentIdx) => {
      if (!entry || !Array.isArray(entry.parts)) return;

      // Only bother with contents that actually carry text or functionCall parts.
      const hasToolOrText = entry.parts.some(
        p => p && (p.functionCall || typeof p.text === 'string')
      );
      if (!hasToolOrText) return;

      entry.parts.forEach((part, partIdx) => {
        if (!part || typeof part !== 'object') return;
        const hasSig = typeof part.thoughtSignature === 'string' && part.thoughtSignature.trim() !== '';
        if (!hasSig) {
          part.thoughtSignature = synthetic;
          changed = true;
          console.log(
            `🧪 [v${EXT_VERSION}] Applied cached Gemini thoughtSignature seed to part (contents[${contentIdx}].parts[${partIdx}])`
          );
        }
      });
    });

    if (changed) {
      console.log(
        '🧪 [v' + EXT_VERSION + '] Used cached Gemini thoughtSignature seed to supplement contents for this Gemini-3 request.'
      );
    }

    return changed;
  }

  function repairAnthropicMissingToolResults(body) {
    if (!body || !Array.isArray(body.messages)) return false;

    let changed = false;
    const messages = body.messages;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (!msg || msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;

      // Collect all tool_use IDs in this assistant message
      const toolUseIds = [];
      msg.content.forEach(block => {
        if (block && block.type === 'tool_use' && block.id) {
          toolUseIds.push(block.id);
        }
      });

      if (toolUseIds.length === 0) continue;

      // Check the next message for corresponding tool_results
      const nextMsg = messages[i + 1];
      if (!nextMsg || nextMsg.role !== 'user') {
        // No following user message at all - inject stub for all tool_uses
        const stubContent = toolUseIds.map(id => ({
          type: 'tool_result',
          tool_use_id: id,
          content: [{ type: 'text', text: '✓' }]
        }));
        messages.splice(i + 1, 0, {
          role: 'user',
          content: stubContent
        });
        console.log(`🩹 [v${EXT_VERSION}] Injected missing tool_result message after assistant message ${i} for ${toolUseIds.length} tool_use(s)`);
        changed = true;
        continue;
      }

      // Next message exists - check which tool_results are present
      if (!Array.isArray(nextMsg.content)) {
        nextMsg.content = [];
      }

      const existingResultIds = new Set();
      nextMsg.content.forEach(block => {
        if (block && block.type === 'tool_result' && block.tool_use_id) {
          existingResultIds.add(block.tool_use_id);
        }
      });

      // Inject stubs for missing tool_results
      toolUseIds.forEach(id => {
        if (!existingResultIds.has(id)) {
          nextMsg.content.push({
            type: 'tool_result',
            tool_use_id: id,
            content: [{ type: 'text', text: '✓' }]
          });
          console.log(`🩹 [v${EXT_VERSION}] Injected missing tool_result for tool_use_id: ${id} in message ${i + 1}`);
          changed = true;
        }
      });
    }

    return changed;
  }

  function ensureOpenRouterClaudeCacheControl(body) {
    // OpenRouter prompt caching for Claude requires cache_control breakpoints.
    // OpenAI-compatible /chat/completions payloads can represent message.content as an
    // array of {type:'text', text:'...'} blocks; cache_control must be attached to a text block.
    //
    // Strategy (minimal + safe): ensure the FIRST system message has cache_control on its
    // text block. This should cache tools + that system prefix across turns.
    if (!body || !Array.isArray(body.messages)) return false;

    const messages = body.messages;
    const sysIdx = messages.findIndex(m => m && m.role === 'system');
    if (sysIdx < 0) return false;

    const msg = messages[sysIdx];
    if (!msg) return false;

    const cc = { type: 'ephemeral' }; // default 5-minute TTL; can be upgraded later

    // If content is a string, wrap it as a multipart text block with cache_control.
    if (typeof msg.content === 'string') {
      const t = msg.content;
      msg.content = [{ type: 'text', text: t, cache_control: cc }];
      console.log('✅ [v' + EXT_VERSION + '] OpenRouter Claude: injected cache_control into system message (wrapped string → multipart).');
      return true;
    }

    // If content is already an array, add cache_control to the last text block.
    if (Array.isArray(msg.content)) {
      // Prefer the last block that looks like a text block.
      for (let i = msg.content.length - 1; i >= 0; i--) {
        const b = msg.content[i];
        if (!b || typeof b !== 'object') continue;
        if (b.type === 'text' && typeof b.text === 'string') {
          if (!b.cache_control) {
            b.cache_control = cc;
            console.log('✅ [v' + EXT_VERSION + '] OpenRouter Claude: injected cache_control into existing system text block.');
            return true;
          }
          return false; // already has cache_control
        }
      }

      // No text blocks found → append a minimal text block with cache_control.
      msg.content.push({ type: 'text', text: ' ', cache_control: cc });
      console.log('✅ [v' + EXT_VERSION + '] OpenRouter Claude: appended text block with cache_control to system message.');
      return true;
    }

    return false;
  }

  function repairOpenAIOrphanedToolCalls(body) {
    if (!body || !Array.isArray(body.input)) return false;

    let changed = false;
    const messages = body.input;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (!msg || msg.role !== 'assistant') continue;

      // Check if this message has function_call content
      let hasFunctionCall = false;
      if (Array.isArray(msg.content)) {
        hasFunctionCall = msg.content.some(block => block && block.type === 'function_call');
      }

      if (!hasFunctionCall) continue;

      // Check if there's an output_text block in the same message
      const hasOutputText = Array.isArray(msg.content) &&
        msg.content.some(block => block && block.type === 'output_text');

      if (hasOutputText) continue; // Already has output_text, no repair needed

      // Need to inject a dummy output_text block before the function_call(s)
      if (Array.isArray(msg.content)) {
        // Find position of first function_call
        const firstToolIdx = msg.content.findIndex(block => block && block.type === 'function_call');
        if (firstToolIdx >= 0) {
          // Insert dummy output_text before first function_call
          msg.content.splice(firstToolIdx, 0, {
            type: 'output_text',
            text: 'ACK'
          });
          console.log(
            `🩹 [v${EXT_VERSION}] Repaired orphaned tool call in message ${i}: inserted dummy output_text before function_call`
          );
          changed = true;
        }
      }
    }

    return changed;
  }

  const originalFetch = window.fetch;

  window.fetch = function(...args) {
    const [url, options = {}] = args;
    let convIdForThisCall = null;
    let vendorForThisCall = null;

    // ==================== ANTHROPIC BRANCH ====================
    if (url.includes('api.anthropic.com')) {
      vendorForThisCall = 'anthropic';
      try {
        if (options.body) {
          const body = JSON.parse(options.body);
          let modified = false;

          // Capture latest Anthropic body for export tooling (deep clone)
          try {
            lastAnthropicBodyForExport = JSON.parse(JSON.stringify(body));
          } catch (e) {
            lastAnthropicBodyForExport = null;
            console.warn('⚠️ [v' + EXT_VERSION + '] Failed to clone Anthropic body for export:', e);
          }

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
          if (repairAnthropicEmptyMessageContent(body)) {
            modified = true;
          }
          // 🩹 FIX: Inject missing tool_result blocks (v4.28)
          if (repairAnthropicMissingToolResults(body)) {
            modified = true;
          }

          const convId = deriveConversationIdFromBody(body);
          if (convId && vendorForThisCall) {
            convIdForThisCall = convId;
            notePayloadConversation(vendorForThisCall, convId, body.model);
            if (vendorForThisCall === 'anthropic') {
              if (applyAnthropicToolFilters(body, vendorForThisCall, convIdForThisCall)) {
                modified = true;
              }
            }
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
      vendorForThisCall = 'gemini';
      try {
        if (options.body) {
          const body = JSON.parse(options.body);
          let modified = false;

          // Capture latest Gemini body for export tooling (deep clone so we preserve pre-repair state).
          try {
            lastGeminiBodyForExport = JSON.parse(JSON.stringify(body));
          } catch (e) {
            lastGeminiBodyForExport = null;
            console.warn('⚠️ [v' + EXT_VERSION + '] Failed to clone Gemini body for export:', e);
          }

          // 🩹 Primary repair: ensure all parts in each content share a thoughtSignature,
          // and propagate the most recent signature forward across model turns.
          
          const repairEnabled = localStorage.getItem('tm_gemini_repair_enabled') !== 'false';
          
          if (repairEnabled) {
             if (repairGeminiThoughtSignatures(body)) {
               modified = true;
             }
          } else {
             // PASSIVE MODE: Scan for tokens to cache, but DO NOT modify body.
             if (body && Array.isArray(body.contents)) {
               body.contents.forEach(entry => {
                 if (entry && Array.isArray(entry.parts)) {
                   entry.parts.forEach(part => {
                     if (part && typeof part.thoughtSignature === 'string' && part.thoughtSignature.trim()) {
                        cacheGeminiThoughtSignature(part.thoughtSignature.trim());
                     }
                   });
                 }
               });
             }
          }

          // 🧪 Fallback: if there is STILL no thoughtSignature anywhere...
          const isGemini3Thinking = typeof url === 'string' && url.includes('/models/gemini-3');

          if (repairEnabled && isGemini3Thinking && !hasAnyGeminiThoughtSignature(body)) {
            if (synthesizeGeminiThoughtSignature(body)) {
              modified = true;
            }
          }

          if (modified) {
            options.body = JSON.stringify(body);
            console.log('✅ [v' + EXT_VERSION + '] Gemini request body repaired/supplemented (thoughtSignature present on all model contents)');
          }
        }
      } catch (e) {
        console.warn('⚠️ [v' + EXT_VERSION + '] Failed to parse/modify Gemini request body:', e);
      }
    }

    // ==================== GROK (xAI) BRANCH ====================
    else if (url.includes('api.x.ai')) {
      vendorForThisCall = 'grok';
      try {
        if (options.body) {
          const body = JSON.parse(options.body);
          let modified = false;

          // Capture latest Grok body for export tooling
          try {
            lastGrokBodyForExport = JSON.parse(JSON.stringify(body));
          } catch (e) {
            lastGrokBodyForExport = null;
            console.warn('⚠️ [v' + EXT_VERSION + '] Failed to clone Grok body for export:', e);
          }

          // If Grok needs prompt caching or other repairs in future, add here.
          // For now, just capture.

          if (modified) {
            options.body = JSON.stringify(body);
            console.log('✅ [v' + EXT_VERSION + '] Grok request body processed');
          }
        }
      } catch (e) {
        console.warn('⚠️ [v' + EXT_VERSION + '] Failed to parse/modify Grok request:', e);
      }
    }

    // ==================== OPENROUTER (OpenAI-compatible) BRANCH ====================
    else if (url.includes('openrouter.ai') && url.includes('/api/v1/chat/completions')) {
      vendorForThisCall = 'openrouter';
      try {
        if (options.body) {
          const body = JSON.parse(options.body);
          let modified = false;

          const model = (body && typeof body.model === 'string') ? body.model : '';
          const isClaude = model.startsWith('anthropic/') || model.toLowerCase().includes('claude');

          if (isClaude) {
            // TEST (v4.34): Try top-level automatic cache_control first.
            // If OpenRouter's /chat/completions rejects this for Claude, we'll see a 400 error
            // and can fall back to block-level injection.
            if (!body.cache_control) {
              body.cache_control = { type: 'ephemeral' };
              console.log('✅ [v' + EXT_VERSION + '] OpenRouter Claude: injected TOP-LEVEL cache_control (automatic caching test)');
              modified = true;
            }

            // Also keep block-level injection as backup (in case top-level is ignored but accepted).
            // This ensures at least tools+system are cached even if automatic doesn't work.
            if (ensureOpenRouterClaudeCacheControl(body)) {
              modified = true;
            }
          }

          if (modified) {
            options.body = JSON.stringify(body);
            console.log('✅ [v' + EXT_VERSION + '] OpenRouter request body updated');
          }
        }
      } catch (e) {
        console.warn('⚠️ [v' + EXT_VERSION + '] Failed to parse/modify OpenRouter request:', e);
      }
    }

    // ==================== OPENAI RESPONSES BRANCH (GPT-5.1 prompt caching + usage) ====================
    else if (url.includes('api.openai.com') && url.includes('/v1/responses')) {
      vendorForThisCall = 'openai';
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
            try {
              lastGpt51BodyForExport = JSON.parse(JSON.stringify(body));
            } catch (e) {
              lastGpt51BodyForExport = null;
              console.warn('⚠️ [v' + EXT_VERSION + '] Failed to clone GPT-5.1 body for export:', e);
            }
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

          // 🩹 FIX: Ensure every function_call has a preceding output_text (v4.27)
          if (repairOpenAIOrphanedToolCalls(body)) {
            modified = true;
          }

          if (modified) {
            options.body = JSON.stringify(body);
            console.log('✅ [v4.27] OpenAI Responses request body updated (prompt caching + orphaned tool call repair)');
          }
        }
      } catch (e) {
        console.warn('⚠️ [v4.27] Failed to parse/modify OpenAI Responses request:', e);
      }
    }


    // ==================== PAYLOAD CAPTURE (always-on, ring buffer) ====================
    // Captures the FINAL outbound request payload (after any modifications above).
    // This makes it easy to debug provider URLs (OpenRouter vs direct), request protocol,
    // and prompt caching markers without using the Network tab.
    let captureId = null;
    try {
      captureId = tmCaptureFetchCall(url, options, convIdForThisCall, vendorForThisCall);
    } catch (e) {
      // Never break requests due to capture
    }

    const fetchPromise = originalFetch(...args);

    // Capture response headers/body (best-effort, does not affect the original response stream)
    const fetchPromiseCaptured = captureId
      ? fetchPromise.then(function(response) {
          try { tmCaptureResponse(captureId, response); } catch (e) {}
          return response;
        })
      : fetchPromise;

    if (url.includes('api.openai.com') && url.includes('/v1/responses')) {
      return fetchPromiseCaptured.then(function(response) {
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

    return fetchPromiseCaptured;
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
