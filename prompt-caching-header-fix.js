// TypingMind Prompt Caching & Tool Result Fix Extension
// Version: 3.0
// Purpose: 
//   1. Inject missing prompt-caching-2024-07-31 beta flag into Anthropic API requests
//   2. Strip non-standard "name" field from tool_result content blocks
// Issues Fixed:
//   - v1.0: TypingMind sends extended-cache-ttl but not base prompt-caching flag
//   - v2.0: (planned) Strip non-standard ttl field from cache_control objects
//   - v3.0: Strip "name" field from tool results (MCP adds "name":"STDOUT" but Anthropic rejects it)
// Impact: Enables 80-90% cost savings via prompt caching + fixes run_command crashes

(function() {
  'use strict';
  
  console.log('🔧 Prompt Caching & Tool Result Fix v3.0 - Initializing...');
  
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
  
  console.log('✅ Prompt Caching & Tool Result Fix v3.0 - Active and monitoring');
  console.log('📊 Will inject prompt-caching-2024-07-31 flag into all Anthropic API requests');
  console.log('🔧 Will strip "name" field from tool_result content blocks');
  console.log('💰 Expected result: 80-90% cost reduction + run_command tool working again');
})();
