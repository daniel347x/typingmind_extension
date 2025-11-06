// TypingMind Ollama Context Length Fix Extension
// Version: 1.0
// Purpose: Inject num_ctx parameter into Ollama API requests to enable full 262K context
// Issue: Ollama defaults to 4096 context even though model supports 262K
// Impact: Enables full context window for local LLM models

(function() {
  'use strict';
  
  console.log('🔧 Ollama Context Fix v1.0 - Initializing...');
  
  // Store original fetch function
  const originalFetch = window.fetch;
  
  // Override fetch to intercept Ollama API calls
  window.fetch = function(...args) {
    const [url, options = {}] = args;
    
    // Check if this is an Ollama API call (localhost:11434)
    if (url.includes('localhost:11434') || url.includes('127.0.0.1:11434')) {
      try {
        // Parse request body if it exists
        if (options.body) {
          const body = JSON.parse(options.body);
          let modified = false;
          
          // Inject num_ctx parameter if not present
          if (body.model && !body.num_ctx) {
            body.num_ctx = 262144; // 256K context for Qwen3-Coder
            console.log(`✅ [Ollama Context Fix] Injected num_ctx: 262144 for model: ${body.model}`);
            modified = true;
          }
          
          // Re-serialize with fix if modified
          if (modified) {
            options.body = JSON.stringify(body);
            console.log('📤 [Ollama Context Fix] Request body updated with full context length');
          }
        }
      } catch (e) {
        console.warn('⚠️ [Ollama Context Fix] Failed to parse/modify request:', e);
      }
    }
    
    // Call original fetch with modified options
    return originalFetch(...args);
  };
  
  console.log('✅ Ollama Context Fix v1.0 - Active and monitoring');
  console.log('📊 Will inject num_ctx: 262144 into all Ollama API requests');
  console.log('💡 Expected result: Full 256K context window available');
})();
