/**
 * TypingMind Prompt Caching Header Fix Extension
 * 
 * Purpose: Inject missing prompt-caching-2024-07-31 beta flag into Anthropic API requests
 * Author: Dan (danielabbott347x)
 * Date: 2025-11-01
 * Version: 1.0
 * 
 * Issue: TypingMind sends extended-cache-ttl but not base prompt-caching flag
 * Impact: Enables 80-90% cost savings via Anthropic prompt caching
 * 
 * This extension:
 * - Intercepts all fetch() calls to Anthropic API
 * - Checks if prompt-caching-2024-07-31 flag is present
 * - Appends it if missing (preserving any existing beta flags)
 * - Logs injection activity to console for verification
 * 
 * Installation:
 * 1. Add this extension URL to TypingMind Settings → Extensions
 * 2. Enable the extension
 * 3. Restart TypingMind
 * 4. Check DevTools console for confirmation messages
 * 5. Verify cache hits in Anthropic console after 2-3 conversation turns
 * 
 * Removal:
 * - Can be disabled once TypingMind officially fixes the bug
 * - No side effects - simply stops intercepting when disabled
 */

(function() {
  'use strict';
  
  console.log('🔧 Prompt Caching Header Fix v1.0 - Initializing...');
  
  // Store original fetch function
  const originalFetch = window.fetch;
  
  // Counter for tracking injections
  let injectionsCount = 0;
  
  // Override fetch to intercept Anthropic API calls
  window.fetch = function(...args) {
    const [url, options = {}] = args;
    
    // Check if this is an Anthropic API call
    if (typeof url === 'string' && url.includes('api.anthropic.com')) {
      // Ensure headers object exists
      options.headers = options.headers || {};
      
      // Get current beta header value (if any)
      const currentBeta = options.headers['anthropic-beta'] || options.headers['Anthropic-Beta'] || '';
      
      // Check if prompt-caching flag is missing
      if (!currentBeta.includes('prompt-caching-2024-07-31')) {
        // If there's already a beta header, append to it
        if (currentBeta) {
          options.headers['anthropic-beta'] = currentBeta + ',prompt-caching-2024-07-31';
          injectionsCount++;
          console.log(`✅ [${injectionsCount}] Appended prompt-caching-2024-07-31 to existing beta header: "${currentBeta}"`);
        } else {
          // Otherwise, set it fresh
          options.headers['anthropic-beta'] = 'prompt-caching-2024-07-31';
          injectionsCount++;
          console.log(`✅ [${injectionsCount}] Set prompt-caching-2024-07-31 beta header (was empty)`);
        }
        
        console.log(`📤 [${injectionsCount}] Final header: "${options.headers['anthropic-beta']}"`);
      } else {
        console.log('ℹ️ Prompt caching header already present, no injection needed');
      }
    }
    
    // Call original fetch with modified options
    return originalFetch(...args);
  };
  
  console.log('✅ Prompt Caching Header Fix v1.0 - Active and monitoring');
  console.log('📊 Will inject prompt-caching-2024-07-31 flag into all Anthropic API requests');
  console.log('💡 Check console for injection confirmations during conversation');
  console.log('💰 Expected result: 80-90% cost reduction via prompt caching');
})();
