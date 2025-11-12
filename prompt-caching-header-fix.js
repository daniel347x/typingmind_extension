// TypingMind Prompt Caching & Tool Result Fix & Payload Analysis Extension
// Version: 4.1
// Purpose: 
//   1. Inject missing prompt-caching-2024-07-31 beta flag into Anthropic API requests
//   2. Strip non-standard "name" field from tool_result content blocks
//   3. Intercept and analyze payloads when [DEBUG-command-fileId] trigger detected
// Issues Fixed:
//   - v4.1 (Nov 12, 2025): No-op test for documentation validation. Updated welcome message.
//   - v1.0: TypingMind sends extended-cache-ttl but not base prompt-caching flag
//   - v2.0: (planned) Strip non-standard ttl field from cache_control objects
//   - v3.0: Strip "name" field from tool results (MCP adds "name":"STDOUT" but Anthropic rejects it)
//   - v4.0: Payload analysis for debugging tool call patterns
// Impact: Enables 80-90% cost savings via prompt caching + fixes run_command crashes + payload debugging

(function() {
  'use strict';
  
  console.log('🔧 UPDATED WELCOME (Nov 12, 2025) - Prompt Caching & Tool Result Fix & Payload Analysis v4.1 - Initializing...');
  
  // ==================== PAYLOAD ANALYSIS HELPERS ====================
  
  function analyzeToolComparison(body, fileId) {
    const report = [];
    report.push('PAYLOAD ANALYSIS - Tool Call Comparison');
    report.push('Generated: ' + new Date().toISOString());
    report.push('File ID: ' + fileId);
    report.push('');
    report.push('=== TOOL CALL SUMMARY (Last 10 Messages) ===');
    report.push('');
    
    // Get last 10 messages
    const messages = body.messages || [];
    const last10 = messages.slice(-10);
    
    let editFileCalls = [];
    let workflowyCalls = [];
    
    // Parse each message for tool use blocks
    last10.forEach((msg, idx) => {
      if (msg.role === 'assistant' && msg.content && Array.isArray(msg.content)) {
        msg.content.forEach(block => {
          if (block.type === 'tool_use') {
            if (block.name === 'edit_file') {
              // Count edits in the edits array
              const editCount = block.input?.edits?.length || 0;
              editFileCalls.push({ messageIndex: idx, editCount });
            } else if (block.name === 'workflowy_create_node') {
              workflowyCalls.push({ messageIndex: idx });
            }
          }
        });
      }
    });
    
    // Report edit_file calls
    report.push('edit_file calls: ' + editFileCalls.length + ' total');
    if (editFileCalls.length > 0) {
      editFileCalls.forEach((call, i) => {
        report.push(`  - Call ${i + 1}: ${call.editCount} edit${call.editCount !== 1 ? 's' : ''} in array`);
      });
      const totalEdits = editFileCalls.reduce((sum, call) => sum + call.editCount, 0);
      report.push(`  Total edit operations: ${totalEdits}`);
    }
    report.push('');
    
    // Report workflowy calls
    report.push('workflowy_create_node calls: ' + workflowyCalls.length + ' total');
    report.push('');
    
    // Comparison analysis
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
    
    // Write to file
    const reportText = report.join('\n');
    const filename = `payload-analysis-compare-tools-${fileId}.txt`;
    
    // Use localStorage as intermediate (can't write files directly from browser)
    localStorage.setItem('debug_payload_analysis_' + fileId, reportText);
    
    console.log('📊 [DEBUG] Analysis complete - saved to localStorage with key:', 'debug_payload_analysis_' + fileId);
    console.log('📋 Report preview:');
    console.log(reportText);
    
    // Also log the full report for immediate viewing
    return reportText;
  }
  
  function checkForDebugTrigger(body) {
    if (!body.messages || body.messages.length === 0) return null;
    
    // Get most recent user message
    const lastMessage = body.messages[body.messages.length - 1];
    if (lastMessage.role !== 'user') return null;
    
    // Extract text content
    let userText = '';
    if (typeof lastMessage.content === 'string') {
      userText = lastMessage.content;
    } else if (Array.isArray(lastMessage.content)) {
      const textBlocks = lastMessage.content.filter(block => block.type === 'text');
      userText = textBlocks.map(block => block.text).join(' ');
    }
    
    // Check for @[DEBUG-command-fileId] pattern (@ prefix prevents accidental triggers in discussion)
    // Regex: Greedy capture for command (supports multi-word like "compare-tools"), then last dash separator, then fileId
    const triggerMatch = userText.match(/@\[DEBUG-(.+)-([^-\]]+)\]/);
    if (triggerMatch) {
      return {
        command: triggerMatch[1],
        fileId: triggerMatch[2]
      };
    }
    
    return null;
  }
  
  // Store original fetch function
  const originalFetch = window.fetch;
  
  // Override fetch to intercept Anthropic API calls
  window.fetch = function(...args) {
    const [url, options = {}] = args;
    
    // Check if this is an Anthropic API call
    if (url.includes('api.anthropic.com')) {
      try {
        // Parse request body if it exists
        if (options.body) {
          const body = JSON.parse(options.body);
          let modified = false;
          
          // CHECK FOR DEBUG TRIGGER FIRST
          const debugTrigger = checkForDebugTrigger(body);
          if (debugTrigger) {
            console.log('🔎 [DEBUG] Trigger detected:', debugTrigger);
            
            if (debugTrigger.command === 'compare-tools') {
              const report = analyzeToolComparison(body, debugTrigger.fileId);
              console.log('🎯 [DEBUG] compare-tools analysis complete');
            }
          }
          
          // FIX 1: Inject missing prompt-caching header flag
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
          
          // FIX 2: Strip "name" field from tool_result content blocks
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
          
          // Re-serialize with fixes if any modifications made
          if (modified) {
            options.body = JSON.stringify(body);
            console.log('✅ [v3.0] Request body sanitized and ready');
          }
        }
      } catch (e) {
        console.warn('⚠️ [v3.0] Failed to parse/modify request:', e);
      }
    }
    
    // Call original fetch with modified options
    return originalFetch(...args);
  };
  
  console.log('✅ Prompt Caching & Tool Result Fix & Payload Analysis v4.0 - Active and monitoring');
  console.log('📊 Will inject prompt-caching-2024-07-31 flag into all Anthropic API requests');
  console.log('🔧 Will strip "name" field from tool_result content blocks');
  console.log('🔎 Will analyze payloads when [DEBUG-command-fileId] trigger detected');
  console.log('💰 Expected result: 80-90% cost reduction + run_command working + payload debugging');
})();
