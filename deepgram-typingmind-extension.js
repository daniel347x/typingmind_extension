/**
 * Deepgram Live Transcription Extension for TypingMind
 * 
 * This extension adds a floating transcription widget to TypingMind
 * Features:
 * - Real-time Deepgram Nova-3 transcription
 * - Space bar toggle (when not in input fields)
 * - Insert transcribed text into TypingMind chat
 * - Persistent API key and keyterms
 * - Optimized for deliberate speech with long pauses
 * - Resizable widget with draggable divider
 * - Rich text clipboard support (paste markdown, copy as HTML)
 * 
 * v3.4 Changes:
 * - FIXED: Paragraph breaks now properly preserved when manually added during recording pause
 * - Solution: Use current cursor position (selectionStart) instead of saved position
 * - Allows user to add newlines/edit text while paused, transcription respects cursor location
 * 
 * v3.3 Changes:
 * - Dynamic widget title (shows "Whisper" or "Deepgram" based on mode)
 * - Fixed unreadable dropdown text in dark mode (Whisper endpoint select)
 * - Hide OpenAI API key field when Local endpoint selected
 * - Hide Deepgram "API Key Saved" box when in Whisper mode
 * - Made Keyboard Shortcuts section collapsible (<details> element)
 * 
 * v2.23 Changes:
 * - Added visual flash to status indicator ("Connected - Listening..." badge)
 * - Flashes bright lime green for 5 seconds on each Deepgram response
 * - Rhythm: 333ms on/off, stops when recording stops
 * - No layout issues (status badge is centered, small, won't jump)
 * 
 * v2.22 Changes:
 * - CRITICAL FIX: Event listener leak causing transcription to fail after multiple toggles
 * - MediaRecorder now properly cleaned up between sessions
 * - WebSocket cleanup improved
 * 
 * v2.13 Changes:
 * - Fixed exessive whitespace when pasting emails from Gmail
 * - Added new "Paste from Gmail" button
 * - Consolidated buttons onto single row
 * 
 * v2.12 Changes:
 * - Fixed code block backtick stripping (removes TypingMind's embedded backticks)
 * - Added blank line after code blocks
 * 
 * v2.11 Changes:
 * - Fixed double backtick bug in code blocks
 * - Fixed paragraph spacing (now adds blank lines between paragraphs)
 * - Added inline code support (single backticks)
 * 
 * v2.10 Changes:
 * - Added code block support (converts to triple backtick syntax)
 * - Added blank line after bullet lists (better paragraph separation)
 * 
 * v2.9 Changes:
 * - Removed "Copy Rich" button (TypingMind doesn't support HTML paste)
 * - Fixed nested bullet handling (preserves 4-space indentation)
 * 
 * v2.8 Changes:
 * - Added "Paste Markdown" button - reads clipboard HTML and converts to plain text with formatting
 * - Supports bullets, bold, italic conversion
 * - All existing functionality preserved (resize, auto-scroll, collapse, etc.)
 * 
 * v1.4 Changes:
 * - Made panel 65% wider (700px → 1155px) for better positioning
 * - Added draggable resize handle to adjust content width (500-900px)
 * - Content stays at optimal size with white filler on the right
 * - Width preference saved to localStorage
 * 
 * v1.3 Changes:
 * - Fixed chat input detection using TypingMind's specific selectors
 * - Added #chat-input-textbox and [data-element-id="chat-input-textbox"] as priority selectors
 * - Improved React event dispatching for better compatibility
 */

(function() {
  'use strict';
  
  console.log('🎙️ Deepgram Extension: Initializing...');
  
  // ==================== CONFIGURATION ====================
  const CONFIG = {
    VERSION: '3.24',
    DEFAULT_CONTENT_WIDTH: 700,
    
    // Transcription mode
    TRANSCRIPTION_MODE_STORAGE: 'transcription_mode',
    
    // Deepgram settings
    DEEPGRAM_API_KEY_STORAGE: 'deepgram_extension_api_key',
    KEYTERMS_STORAGE: 'deepgram_extension_keyterms',
    AUTOCLIPBOARD_DELAY_STORAGE: 'deepgram_autoclipboard_delay',
    WEBSOCKET_BASE: 'wss://api.deepgram.com/v1/listen',
    WEBSOCKET_PARAMS: 'model=nova-3&punctuate=true&smart_format=true&endpointing=10000&interim_results=true&utterance_end_ms=5000',
    
    // Whisper settings
    WHISPER_API_KEY_STORAGE: 'whisper_extension_api_key',
    WHISPER_ENDPOINT_STORAGE: 'whisper_extension_endpoint',
    WHISPER_PROMPT_STORAGE: 'whisper_extension_prompt',
    DEFAULT_OPENAI_ENDPOINT: 'https://api.openai.com/v1/audio/transcriptions',
    DEFAULT_LOCAL_ENDPOINT: 'http://localhost:8001/v1/audio/transcriptions',
    DEFAULT_WHISPER_PROMPT: 'Technical terms: Databricks, LlamaIndex, MLOps, QC automation, HITL, Francesco, Jim Kane, Rob Smith, Constantine Cannon'
  };
  
  // ==================== STATE ====================
  // Transcription mode
  let transcriptionMode = 'deepgram';  // 'deepgram' or 'whisper'
  
  // Common state
  let mediaRecorder = null;
  let isRecording = false;
  let isPanelOpen = false;
  let savedCursorPosition = null;
  let autoScrollEnabled = true;
  let autoClipboardTimer = null;
  let lastCopiedText = '';
  let autoClipboardDelay = 0;
  
  // Deepgram-specific state
  let deepgramSocket = null;
  let flashTimer = null;
  let shouldFlash = false;
  
  // Whisper-specific state
  let audioChunks = [];
  let pendingTranscriptions = 0;
  let recordingStartTime = null;
  let recordingDurationTimer = null;
  
  // ==================== RICH TEXT CONVERSION ====================
  
  /**
   * Convert HTML from clipboard to plain text with markdown-style formatting
   * Handles: bullets (including nested), bold, italic, paragraphs, line breaks, emojis
   */
  function htmlToMarkdownText(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    
    let result = '';
    
    function processNode(node, indentLevel = 0) {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent;
      }
      
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName.toLowerCase();
        let text = '';
        
        // Apply formatting based on tag
        switch (tag) {
          case 'strong':
          case 'b':
            // Process children and wrap in bold
            for (const child of node.childNodes) {
              text += processNode(child, indentLevel);
            }
            return `**${text}**`;
            
          case 'em':
          case 'i':
            // Process children and wrap in italic
            for (const child of node.childNodes) {
              text += processNode(child, indentLevel);
            }
            return `*${text}*`;
            
          case 'li':
            // Process children first (might contain nested lists)
            let liContent = '';
            for (const child of node.childNodes) {
              if (child.nodeType === Node.TEXT_NODE) {
                liContent += child.textContent;
              } else if (child.tagName && (child.tagName.toLowerCase() === 'ul' || child.tagName.toLowerCase() === 'ol')) {
                // Nested list - process with increased indent
                liContent += '\n' + processNode(child, indentLevel + 1);
              } else {
                liContent += processNode(child, indentLevel);
              }
            }
            
            // Add indentation (4 spaces per level)
            const indent = '    '.repeat(indentLevel);
            return `${indent}- ${liContent.trim()}\n`;
            
          case 'ul':
          case 'ol':
            // Process all list items
            for (const child of node.childNodes) {
              text += processNode(child, indentLevel);
            }
            // Add blank line after list (only at top level)
            return indentLevel === 0 ? text + '\n' : text;
            
          case 'p':
          case 'div':
            // Process children
            for (const child of node.childNodes) {
              text += processNode(child, indentLevel);
            }
            // Add double newline for paragraph spacing
            return `${text}\n\n`;
            
          case 'br':
            return '\n';
            
          case 'pre':
            // Code block - preserve contents with triple backticks
            let codeContent = '';
            for (const child of node.childNodes) {
              if (child.nodeType === Node.TEXT_NODE) {
                codeContent += child.textContent;
              } else if (child.tagName && child.tagName.toLowerCase() === 'code') {
                // <pre><code>...</code></pre> pattern - extract text directly
                codeContent += child.textContent;
              } else {
                codeContent += processNode(child, indentLevel);
              }
            }
            // Clean the code content
            codeContent = codeContent.trim();
            // Remove leading/trailing backticks if TypingMind included them
            codeContent = codeContent.replace(/^```\n?/, '').replace(/\n?```$/, '');
            return '\n```\n' + codeContent.trim() + '\n```\n\n';
            
          case 'code':
            // Inline code or code inside pre
            if (node.parentNode && node.parentNode.tagName && node.parentNode.tagName.toLowerCase() === 'pre') {
              // Inside <pre> - don't wrap, parent handles it
              return node.textContent;
            }
            // Inline code - wrap with backticks
            return '`' + node.textContent + '`';
            
          default:
            // Process children for unknown tags
            for (const child of node.childNodes) {
              text += processNode(child, indentLevel);
            }
            return text;
        }
      }
      
      return '';
    }
    
    result = processNode(div);
    
    // Clean up extra newlines (max 2 consecutive)
    result = result.replace(/\n{3,}/g, '\n\n');
    
    // Trim whitespace from end of each line (but preserve indentation at start)
    result = result.split('\n').map(line => line.trimEnd()).join('\n');
    
    // Final trim
    result = result.trim();
    
    return result;
  }
  
  /**
   * Convert plain text with markdown-style formatting to HTML
   * Handles: bullets, bold, italic, line breaks
   */
  function markdownTextToHtml(text) {
    let html = '';
    const lines = text.split('\n');
    let inList = false;
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      
      if (!line) {
        // Empty line - close list if needed, add <br>
        if (inList) {
          html += '</ul>';
          inList = false;
        }
        html += '<br>';
        continue;
      }
      
      // Check if this is a bullet point
      const bulletMatch = line.match(/^[-•]\s+(.+)$/);
      
      if (bulletMatch) {
        // Bullet point
        if (!inList) {
          html += '<ul>';
          inList = true;
        }
        
        let bulletText = bulletMatch[1];
        
        // Process inline formatting (bold, italic)
        bulletText = processInlineFormatting(bulletText);
        
        html += `<li>${bulletText}</li>`;
      } else {
        // Regular text line
        if (inList) {
          html += '</ul>';
          inList = false;
        }
        
        // Process inline formatting
        line = processInlineFormatting(line);
        
        html += line + '<br>';
      }
    }
    
    // Close list if still open
    if (inList) {
      html += '</ul>';
    }
    
    return html;
  }
  
  /**
   * Process inline formatting (bold, italic) in text
   */
  function processInlineFormatting(text) {
    // Bold: **text** → <strong>text</strong>
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    
    // Italic: *text* → <em>text</em> (but not if part of **)
    text = text.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');
    
    return text;
  }
  
  // ==================== CLIPBOARD OPERATIONS ====================
  
  /**
   * Paste email content from clipboard and normalize paragraph spacing
   * Handles Gmail copy-paste which often has excessive newlines
   */
  async function pasteEmail() {
    try {
      const clipboardItems = await navigator.clipboard.read();
      
      for (const item of clipboardItems) {
        let textContent = '';
        
        // Try HTML first, then fallback to plain text
        if (item.types.includes('text/html')) {
          const htmlBlob = await item.getType('text/html');
          const html = await htmlBlob.text();
          
          // Convert HTML to plain text (strip all tags)
          const div = document.createElement('div');
          div.innerHTML = html;
          textContent = div.textContent || div.innerText || '';
          
          console.log('📧 Clipboard HTML converted to text:', textContent);
        } else if (item.types.includes('text/plain')) {
          const textBlob = await item.getType('text/plain');
          textContent = await textBlob.text();
          
          console.log('📧 Clipboard plain text:', textContent);
        }
        
        if (textContent) {
          // Normalize whitespace between paragraphs
          // Step 1: Replace all variations of line breaks (CRLF, LF, CR) with \n
          textContent = textContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
          
          // Step 2: Replace 3+ consecutive newlines with exactly 2 newlines (= 1 empty line)
          textContent = textContent.replace(/\n{3,}/g, '\n\n');
          
          // Step 3: Ensure paragraphs have at least one empty line between them
          // Split by double newline (paragraph breaks), filter empty, rejoin with double newline
          const paragraphs = textContent.split(/\n\n+/).filter(p => p.trim());
          textContent = paragraphs.join('\n\n');
          
          // Step 4: Trim leading/trailing whitespace
          textContent = textContent.trim();
          
          console.log('✓ Normalized email text:', textContent);
          
          // Insert into textarea at cursor position
          const transcriptEl = document.getElementById('deepgram-transcript');
          const currentText = transcriptEl.value;
          const cursorPos = transcriptEl.selectionStart;
          
          const beforeCursor = currentText.substring(0, cursorPos);
          const afterCursor = currentText.substring(cursorPos);
          
          transcriptEl.value = beforeCursor + textContent + afterCursor;
          
          const newCursorPos = cursorPos + textContent.length;
          transcriptEl.setSelectionRange(newCursorPos, newCursorPos);
          transcriptEl.focus();
          
          // Visual feedback
          const btn = document.getElementById('deepgram-paste-email-btn');
          const originalText = btn.textContent;
          btn.textContent = '✓ Pasted!';
          
          setTimeout(() => {
            btn.textContent = originalText;
          }, 2000);
          
          console.log('✅ Email pasted and normalized');
          return;
        }
      }
      
      console.warn('⚠️ No suitable clipboard data found');
      alert('No text found in clipboard');
      
    } catch (err) {
      console.error('❌ Paste email failed:', err);
      alert('Failed to paste from clipboard. Make sure you have text copied.');
    }
  }
  
  /**
   * Paste rich text from clipboard and convert to markdown-style plain text
   */
  async function pasteMarkdown() {
    try {
      const clipboardItems = await navigator.clipboard.read();
      
      for (const item of clipboardItems) {
        // Try to read HTML first (most formatted copy operations include this)
        if (item.types.includes('text/html')) {
          const htmlBlob = await item.getType('text/html');
          const html = await htmlBlob.text();
          
          console.log('📋 Clipboard HTML:', html);
          
          const markdown = htmlToMarkdownText(html);
          
          console.log('✓ Converted to markdown:', markdown);
          
          // Insert into textarea at cursor position
          const transcriptEl = document.getElementById('deepgram-transcript');
          const currentText = transcriptEl.value;
          const cursorPos = transcriptEl.selectionStart;
          
          const beforeCursor = currentText.substring(0, cursorPos);
          const afterCursor = currentText.substring(cursorPos);
          
          transcriptEl.value = beforeCursor + markdown + afterCursor;
          
          const newCursorPos = cursorPos + markdown.length;
          transcriptEl.setSelectionRange(newCursorPos, newCursorPos);
          transcriptEl.focus();
          
          // Visual feedback
          const btn = document.getElementById('deepgram-paste-btn');
          const originalText = btn.textContent;
          btn.textContent = '✓ Pasted!';
          
          setTimeout(() => {
            btn.textContent = originalText;
          }, 2000);
          
          console.log('✅ Pasted and converted to markdown');
          return;
        }
        
        // Fallback to plain text if no HTML available
        if (item.types.includes('text/plain')) {
          const textBlob = await item.getType('text/plain');
          const text = await textBlob.text();
          
          console.log('📋 Clipboard plain text:', text);
          
          // Insert plain text as-is
          const transcriptEl = document.getElementById('deepgram-transcript');
          const currentText = transcriptEl.value;
          const cursorPos = transcriptEl.selectionStart;
          
          const beforeCursor = currentText.substring(0, cursorPos);
          const afterCursor = currentText.substring(cursorPos);
          
          transcriptEl.value = beforeCursor + text + afterCursor;
          
          const newCursorPos = cursorPos + text.length;
          transcriptEl.setSelectionRange(newCursorPos, newCursorPos);
          transcriptEl.focus();
          
          console.log('✅ Pasted plain text');
          return;
        }
      }
      
      console.warn('⚠️ No suitable clipboard data found');
      alert('No text found in clipboard');
      
    } catch (err) {
      console.error('❌ Paste failed:', err);
      alert('Failed to paste from clipboard. Make sure you have text copied.');
    }
  }
  
  /**
   * Copy transcript as rich text (HTML) to clipboard
   */
  async function copyRichText() {
    const text = document.getElementById('deepgram-transcript').value.trim();
    if (!text) {
      alert('No transcript to copy!');
      return;
    }
    
    try {
      const html = markdownTextToHtml(text);
      
      console.log('📋 Copying as HTML:', html);
      
      // Write both plain text and HTML to clipboard
      const clipboardItem = new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' })
      });
      
      await navigator.clipboard.write([clipboardItem]);
      
      // Visual feedback
      const btn = document.getElementById('deepgram-copy-rich-btn');
      const originalText = btn.textContent;
      btn.textContent = '✓ Copied!';
      
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
      
      console.log('✅ Copied as rich text (HTML + plain text)');
      
    } catch (err) {
      console.error('❌ Copy as rich text failed:', err);
      alert('Failed to copy rich text. Falling back to plain text copy.');
      
      // Fallback to plain text copy
      await copyTranscript();
    }
  }
  
  // ==================== STYLES ====================
  function injectStyles() {
    const style = document.createElement('style');
    style.id = 'deepgram-extension-styles';
    style.textContent = `
      /* Floating Toggle Button */
      #deepgram-toggle {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        cursor: pointer;
        font-size: 28px;
        box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
        z-index: 999999;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      #deepgram-toggle:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 25px rgba(102, 126, 234, 0.6);
      }
      
      #deepgram-toggle.recording {
        background: linear-gradient(135deg, #c75b5b 0%, #b54a4a 100%);
        animation: deepgram-pulse 1.5s ease-in-out infinite;
      }
      
      @keyframes deepgram-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.8; transform: scale(1.05); }
      }
      
      /* Main Panel */
      #deepgram-panel {
        position: fixed;
        bottom: 90px;
        right: 20px;
        width: 1155px; /* 700px * 1.65 = 1155px */
        max-height: 95vh;
        background: white;
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
        z-index: 999998;
        display: none;
        flex-direction: row; /* Changed from column to row for side-by-side layout */
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      
      #deepgram-panel.open {
        display: flex;
      }
      
      /* Content Container (left side - original width) */
      #deepgram-content-container {
        width: 700px; /* Original panel width */
        max-width: 1155px; /* Allow expansion to full panel width */
        min-width: 500px; /* Prevent shrinking too small */
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        flex-shrink: 0;
        height: 100%;
      }
      
      /* Resize Handle */
      #deepgram-resize-handle {
        width: 5px;
        background: #e2e8f0;
        cursor: col-resize;
        position: relative;
        flex-shrink: 0;
        transition: background 0.2s;
      }
      
      #deepgram-resize-handle:hover {
        background: #667eea;
      }
      
      #deepgram-resize-handle::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 20px;
        height: 60px;
        border-radius: 4px;
        background: transparent;
      }
      
      /* Filler Area (right side - empty white space) */
      #deepgram-filler {
        flex: 1;
        background: white;
        min-width: 0;
      }
      
      /* Panel Header */
      .deepgram-header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-shrink: 0;
      }
      
      .deepgram-header h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
      }
      
      .deepgram-version {
        font-size: 10px;
        opacity: 0.7;
        font-weight: 400;
      }
      
      .deepgram-close {
        background: rgba(255, 255, 255, 0.2);
        border: none;
        color: white;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      }
      
      .deepgram-close:hover {
        background: rgba(255, 255, 255, 0.3);
      }
      
      /* Panel Content */
      .deepgram-content {
        padding: 20px;
        overflow-y: auto;
        flex: none;
        height: auto;
      }
      
      .deepgram-section {
        margin-bottom: 20px;
      }
      
      .deepgram-section label {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-weight: 600;
        margin-bottom: 8px;
        color: #333;
        font-size: 14px;
      }
      
      .deepgram-collapse-btn {
        background: #e2e8f0;
        border: none;
        color: #667eea;
        padding: 2px 8px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 10px;
        font-weight: 600;
        transition: all 0.2s;
      }
      
      .deepgram-collapse-btn:hover {
        background: #cbd5e0;
      }
      
      .deepgram-section input,
      .deepgram-section textarea {
        width: 100%;
        padding: 10px 12px;
        border: 2px solid #e2e8f0;
        border-radius: 8px;
        font-size: 14px;
        font-family: inherit;
        transition: border-color 0.2s;
        box-sizing: border-box;
        color: #1a202c;
        background-color: #ffffff;
      }
      
      .deepgram-section input:focus,
      .deepgram-section textarea:focus {
        outline: none;
        border-color: #667eea;
      }
      
      .deepgram-section textarea {
        resize: vertical;
        min-height: 60px;
        line-height: 1.5;
      }
      
      .deepgram-section input.monospace {
        font-family: 'Monaco', 'Courier New', monospace;
        font-size: 12px;
      }
      
      .deepgram-section small {
        display: block;
        margin-top: 5px;
        color: #666;
        font-size: 12px;
      }
      
      /* API Key Status */
      .deepgram-api-status {
        padding: 12px;
        border-radius: 8px;
        background: #d4edda;
        border: 1px solid #c3e6cb;
        color: #155724;
        font-size: 14px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .deepgram-api-status.error {
        background: #f8d7da;
        border-color: #f5c6cb;
        color: #721c24;
      }
      
      .deepgram-edit-btn {
        background: transparent;
        border: 1px solid currentColor;
        color: inherit;
        padding: 4px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s;
      }
      
      .deepgram-edit-btn:hover {
        background: rgba(0, 0, 0, 0.05);
      }
      
      /* Status Indicator */
      .deepgram-status {
        padding: 10px 12px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        text-align: center;
        margin-bottom: 15px;
      }
      
      .deepgram-status.connected {
        background: #d4edda;
        color: #155724;
        border: 1px solid #c3e6cb;
        transition: all 0.1s ease;
      }
      
      /* Flash effect for status indicator */
      .deepgram-status.connected.flash {
        background: var(--flash-color, #ccff66) !important;
        color: #ffffff !important;
        border: 3px solid var(--flash-color, #a0ff00) !important;
        box-shadow: 0 0 20px rgba(160, 255, 0, 0.9);
        font-weight: 700;
        text-shadow: 0 0 4px rgba(255, 255, 255, 0.8);
      }
      
      /* Waiting effect for status indicator (Whisper transcription pending) */
      .deepgram-status.waiting {
        border: 4px solid #ff9800 !important;
        box-shadow: 0 0 20px rgba(255, 152, 0, 0.8);
        animation: deepgram-waiting-pulse 0.5s ease-in-out infinite;
      }
      
      /* When BOTH recording (flash) and waiting: orange border wins, green background stays */
      .deepgram-status.connected.flash.waiting {
        border: 4px solid #ff9800 !important;
        box-shadow: 0 0 30px rgba(255, 183, 77, 1) !important;
        /* Keep green background from flash, but orange border overrides */
      }
      
      @keyframes deepgram-waiting-pulse {
        0%, 100% { 
          border-color: #ff9800;
          box-shadow: 0 0 20px rgba(255, 152, 0, 0.8);
        }
        50% { 
          border-color: #ffb74d;
          box-shadow: 0 0 30px rgba(255, 183, 77, 1);
        }
      }
      
      .deepgram-status.connecting {
        background: #d1ecf1;
        color: #0c5460;
        border: 1px solid #bee5eb;
      }
      
      .deepgram-status.disconnected {
        background: #e2e8f0;
        color: #4a5568;
        border: 1px solid #cbd5e0;
      }
      
      /* Queue Status - Always Visible Above Record Button */
      #deepgram-queue-status {
        font-size: 12px;
        margin-top: 0px;
        margin-bottom: 8px;
        padding: 6px 16px;
        border-radius: 6px;
        text-align: center;
        background: rgba(200, 200, 200, 0.1);
        color: #999;
        font-weight: 500;
        transition: all 0.3s ease;
      }
      
      #deepgram-queue-status.active {
        animation: whisper-queue-pulse 0.5s ease-in-out infinite;
        color: #ff9800 !important;
        font-weight: 700 !important;
      }
      
      @keyframes whisper-queue-pulse {
        0%, 100% { 
          opacity: 1;
          background: rgba(255, 152, 0, 0.2);
        }
        50% { 
          opacity: 0.8;
          background: rgba(255, 152, 0, 0.35);
        }
      }
      
      [data-theme="dark"] #deepgram-queue-status {
        background: rgba(100, 100, 100, 0.1);
        color: #666;
      }
      
      /* Clickable Bottom Bar */
      #deepgram-click-bar {
        height: 75px;
        background: linear-gradient(to bottom, #f0f4ff 0%, #e8edff 100%);
        border-top: 2px solid #c7d2fe;
        border-bottom: 1px solid #e2e8f0;
        cursor: pointer;
        transition: all 0.15s ease;
        display: flex;
        align-items: flex-start;
        padding: 6px 12px;
        flex-shrink: 0;
      }
      
      #deepgram-click-bar:hover {
        background: linear-gradient(to bottom, #e8edff 0%, #dde4ff 100%);
        border-top-color: #a5b4fc;
      }
      
      #deepgram-click-bar:active {
        background: linear-gradient(to bottom, #dde4ff 0%, #d4dbff 100%);
      }
      
      #deepgram-click-bar-label {
        font-size: 12px;
        color: #ffffff;
        user-select: none;
      }
      
      [data-theme="dark"] #deepgram-click-bar {
        background: linear-gradient(to bottom, #3d4463 0%, #353a52 100%);
        border-top-color: #4f5672;
      }
      
      [data-theme="dark"] #deepgram-click-bar:hover {
        background: linear-gradient(to bottom, #434968 0%, #3a405a 100%);
        border-top-color: #5a6080;
      }
      
      [data-theme="dark"] #deepgram-click-bar:active {
        background: linear-gradient(to bottom, #383d58 0%, #30364a 100%);
      }
      
      [data-theme="dark"] #deepgram-click-bar-label {
        color: #6b7280;
      }
      
      /* Transcript Area */
      .deepgram-transcript {
        width: 100%;
        min-height: 150px;
        height: 525px;
        padding: 12px;
        border: 2px solid #e2e8f0;
        border-radius: 8px;
        font-size: 14px;
        line-height: 1.6;
        resize: vertical;
        font-family: inherit;
        box-sizing: border-box;
        color: #1a202c;
        background-color: #ffffff;
      }
      
      .deepgram-transcript:focus {
        outline: none;
        border-color: #667eea;
      }
      
      /* Buttons */
      .deepgram-buttons {
        display: flex;
        gap: 10px;
        margin-top: 15px;
      }
      
      .deepgram-btn {
        flex: 1;
        padding: 6px 16px;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }
      
      .deepgram-btn-primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }
      
      .deepgram-btn-primary:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
      }
      
      .deepgram-btn-primary.recording {
        background: linear-gradient(135deg, #c75b5b 0%, #b54a4a 100%);
      }
      
      .deepgram-btn-success {
        background: #28a745;
        color: white;
      }
      
      .deepgram-btn-success:hover {
        background: #218838;
        transform: translateY(-1px);
      }
      
      .deepgram-btn-info {
        background: #17a2b8;
        color: white;
      }
      
      .deepgram-btn-info:hover {
        background: #138496;
        transform: translateY(-1px);
      }
      
      .deepgram-btn-secondary {
        background: #6c757d;
        color: white;
      }
      
      .deepgram-btn-secondary:hover {
        background: #5a6268;
      }
      
      .deepgram-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      .deepgram-btn:disabled:hover {
        transform: none;
      }
      
      /* Info Section */
      .deepgram-info-details {
        margin-top: 15px;
      }
      
      .deepgram-info-summary {
        background: #e7f3ff;
        border: 1px solid #b8daff;
        border-radius: 8px;
        padding: 10px 12px;
        font-size: 13px;
        color: #004085;
        cursor: pointer;
        font-weight: 600;
        user-select: none;
        list-style: none;
      }
      
      .deepgram-info-summary::-webkit-details-marker {
        display: none;
      }
      
      .deepgram-info-summary::before {
        content: '▶ ';
        display: inline-block;
        transition: transform 0.2s;
      }
      
      details[open] .deepgram-info-summary::before {
        transform: rotate(90deg);
      }
      
      .deepgram-info-summary:hover {
        background: #d6ebff;
      }
      
      .deepgram-info {
        background: #f8fcff;
        border: 1px solid #b8daff;
        border-top: none;
        border-radius: 0 0 8px 8px;
        padding: 12px;
        font-size: 12px;
        color: #004085;
        margin-top: 0;
      }
      
      .deepgram-info strong {
        display: block;
        margin-bottom: 5px;
      }
      
      /* Whisper Endpoint Dropdown Dark Mode Fix */
      .whisper-endpoint-dropdown {
        background-color: #ffffff;
        color: #1a202c;
      }
      
      [data-theme="dark"] .whisper-endpoint-dropdown {
        background-color: #2d3548;
        color: #f3f4f6;
        border-color: #374151;
      }
      
      [data-theme="dark"] .whisper-endpoint-dropdown option {
        background-color: #2d3548;
        color: #f3f4f6;
      }
      
      /* Dark Mode Styles */
      [data-theme="dark"] #deepgram-panel {
        background: #1a1d2e;
        color: #e4e4e7;
      }
      
      [data-theme="dark"] #deepgram-content-container {
        background: #1a1d2e;
      }
      
      [data-theme="dark"] #deepgram-filler {
        background: #1a1d2e;
      }
      
      [data-theme="dark"] .deepgram-content {
        background: #1a1d2e;
      }
      
      [data-theme="dark"] .deepgram-section label {
        color: #e4e4e7;
      }
      
      [data-theme="dark"] .deepgram-section input,
      [data-theme="dark"] .deepgram-section textarea,
      [data-theme="dark"] .deepgram-transcript {
        background-color: #2d3548;
        color: #f3f4f6;
        border-color: #374151;
      }
      
      [data-theme="dark"] .deepgram-section input:focus,
      [data-theme="dark"] .deepgram-section textarea:focus,
      [data-theme="dark"] .deepgram-transcript:focus {
        border-color: #667eea;
      }
      
      [data-theme="dark"] .deepgram-section small {
        color: #9ca3af;
      }
      
      [data-theme="dark"] .deepgram-api-status {
        background: #1e3a2e;
        border-color: #2d5a43;
        color: #86efac;
      }
      
      [data-theme="dark"] .deepgram-api-status.error {
        background: #3a1e1e;
        border-color: #5a2d2d;
        color: #fca5a5;
      }
      
      [data-theme="dark"] .deepgram-status.connected {
        background: #1e3a2e;
        color: #86efac;
        border-color: #2d5a43;
      }
      
      [data-theme="dark"] .deepgram-status.connecting {
        background: #1e3440;
        color: #7dd3fc;
        border-color: #2d4a5a;
      }
      
      [data-theme="dark"] .deepgram-status.disconnected {
        background: #2d3548;
        color: #9ca3af;
        border-color: #374151;
      }
      
      [data-theme="dark"] .deepgram-info-summary {
        background: #1e3440;
        border-color: #2d4a5a;
        color: #7dd3fc;
      }
      
      [data-theme="dark"] .deepgram-info-summary:hover {
        background: #2a4a5c;
      }
      
      [data-theme="dark"] .deepgram-info {
        background: #1a2f3e;
        border-color: #2d4a5a;
        color: #7dd3fc;
      }
      
      [data-theme="dark"] .deepgram-collapse-btn {
        background: #374151;
        color: #a78bfa;
      }
      
      [data-theme="dark"] .deepgram-collapse-btn:hover {
        background: #4b5563;
      }
      
      [data-theme="dark"] #deepgram-autoclipboard-input {
        background: #2d3548;
        color: #f3f4f6;
        border-color: #374151;
      }
      
      [data-theme="dark"] label[for="deepgram-autoclipboard-input"],
      [data-theme="dark"] label:has(#deepgram-autoclipboard-input) {
        color: #9ca3af;
      }
      
      [data-theme="dark"] #deepgram-resize-handle {
        background: #374151;
      }
      
      [data-theme="dark"] #deepgram-resize-handle:hover {
        background: #667eea;
      }
      
      [data-theme="dark"] .deepgram-btn-secondary {
        background: #4b5563;
        color: #e4e4e7;
      }
      
      [data-theme="dark"] .deepgram-btn-secondary:hover {
        background: #6b7280;
      }
      
      /* Responsive adjustments */
      @media (max-width: 1200px) {
        #deepgram-panel {
          width: calc(100vw - 40px);
          max-width: 1155px;
        }
        
        #deepgram-content-container {
          width: 100%;
          max-width: 700px;
        }
      }
      
      @media (max-width: 600px) {
        #deepgram-panel {
          width: calc(100vw - 40px);
          right: 20px;
          left: 20px;
          flex-direction: column;
        }
        
        #deepgram-content-container {
          width: 100%;
          min-width: auto;
        }
        
        #deepgram-resize-handle {
          display: none;
        }
        
        #deepgram-filler {
          display: none;
        }
      }
    `;
    document.head.appendChild(style);
    console.log('✓ Styles injected');
  }
  
  // ==================== HTML STRUCTURE ====================
  function createWidget() {
    // Create toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'deepgram-toggle';
    toggleBtn.innerHTML = '🎤';
    toggleBtn.title = 'Toggle Deepgram Transcription (Space)';
    toggleBtn.onclick = togglePanel;
    
    // Create panel
    const panel = document.createElement('div');
    panel.id = 'deepgram-panel';
    panel.innerHTML = `
      <div id="deepgram-content-container">
        <div class="deepgram-header">
          <h2 id="deepgram-header-title">🎙️ Deepgram Transcription <span class="deepgram-version" id="deepgram-version"></span></h2>
          <button class="deepgram-close" onclick="document.getElementById('deepgram-panel').classList.remove('open')">×</button>
        </div>
        
        <div class="deepgram-content">
        <!-- API Key Section -->
        <div class="deepgram-section" id="deepgram-api-section">
          <label>Deepgram API Key</label>
          <input type="password" id="deepgram-api-input" class="monospace" placeholder="Enter your API key">
          <small>Get your free API key at <a href="https://console.deepgram.com/signup?jump=keys" target="_blank">console.deepgram.com</a></small>
        </div>
        
        <div id="deepgram-api-saved" style="display: none;">
          <div class="deepgram-api-status">
            <span>✓ API Key Saved</span>
            <button class="deepgram-edit-btn" onclick="window.deepgramEditApiKey()">Edit</button>
          </div>
        </div>
        
        <!-- Keyterms Section -->
        <div class="deepgram-section" id="deepgram-keyterms-section" style="display: none;">
          <label>Keyterms (Optional)</label>
          <textarea id="deepgram-keyterms-input" rows="2" placeholder="LlamaIndex, TypingMind, Obsidian"></textarea>
          <small>Add technical terms to improve accuracy (comma-separated)</small>
        </div>
        
        <!-- Mode Toggle -->
        <div class="deepgram-section" id="deepgram-mode-section" style="display: none;">
          <label>
            <span>Transcription Engine</span>
            <button class="deepgram-collapse-btn" id="deepgram-mode-toggle-btn" onclick="window.toggleTranscriptionMode()">
              <span id="deepgram-mode-label">Deepgram</span>
            </button>
          </label>
          <small id="deepgram-mode-description">Using Deepgram (streaming real-time transcription)</small>
        </div>
        
        <!-- Whisper Settings Section -->
        <div class="deepgram-section" id="whisper-settings-section" style="display: none;">
          <label>Whisper Endpoint</label>
          <select id="whisper-endpoint-select" class="whisper-endpoint-dropdown" style="width: 100%; padding: 8px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 14px; margin-bottom: 8px;">
            <option value="local">Local (faster-whisper-server)</option>
            <option value="openai">OpenAI API</option>
            <option value="custom">Custom...</option>
          </select>
          <input type="text" id="whisper-custom-endpoint" class="monospace" placeholder="http://localhost:8000/v1/audio/transcriptions" style="display: none; margin-bottom: 8px;">
          <small>Local: http://localhost:8000 | OpenAI: Requires API key below</small>
        </div>
        
        <div class="deepgram-section" id="whisper-api-section" style="display: none;">
          <label>OpenAI API Key (optional for local)</label>
          <input type="password" id="whisper-api-input" class="monospace" placeholder="sk-...">
          <small>Only required for OpenAI endpoint</small>
        </div>
        
        <div class="deepgram-section" id="whisper-prompt-section" style="display: none;">
          <label>Vocabulary Prompt (Optional)</label>
          <textarea id="whisper-prompt-input" rows="3" placeholder="Technical terms: Databricks, LlamaIndex..."></textarea>
          <small>Helps Whisper recognize technical vocabulary (up to 244 tokens)</small>
        </div>
        
        <!-- Segment Button (Whisper mode only) -->
        <div id="deepgram-segment-btn-container" style="display: none;">
          <div class="deepgram-buttons">
            <button id="deepgram-segment-btn" class="deepgram-btn deepgram-btn-primary">
              <span>⏭️</span>
              <span>End Segment & Continue (Space)</span>
            </button>
          </div>
        </div>
        
        <!-- Status -->
        <!-- Keyterms Section -->
        <div class="deepgram-section" id="deepgram-keyterms-section" style="display: none;">
          <label>Keyterms (Optional)</label>
          <textarea id="deepgram-keyterms-input" rows="2" placeholder="LlamaIndex, TypingMind, Obsidian"></textarea>
          <small>Add technical terms to improve accuracy (comma-separated)</small>
        </div>
        
        <!-- Status -->
        <div id="deepgram-status" class="deepgram-status disconnected">Ready to Record</div>
        
        <!-- Queue Status (Always Visible) -->
        <div id="deepgram-queue-status">Whisper Standing By</div>
        
        <!-- Transcript -->
        <div class="deepgram-section" style="margin-bottom: 0;">
          <label>
            <span>Transcript</span>
            <div style="display: flex; gap: 8px; align-items: center;">
              <button class="deepgram-collapse-btn" id="deepgram-darkmode-btn" onclick="window.toggleDarkMode()" title="Toggle dark mode">🌙 Dark</button>
              <label style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: #666;">
                <span>Copy timer (s):</span>
                <input type="number" id="deepgram-autoclipboard-input" min="0" max="300" step="1" value="0" style="width: 50px; padding: 2px 4px; border: 1px solid #cbd5e0; border-radius: 4px; font-size: 11px;" title="Auto-copy to clipboard every N seconds (0 = disabled)" />
              </label>
              <button class="deepgram-collapse-btn" id="deepgram-autoscroll-btn" onclick="window.toggleAutoScroll()" title="Toggle auto-scroll when transcribing">Auto-Scroll: ON</button>
              <button class="deepgram-collapse-btn" id="deepgram-reset-width-btn" onclick="window.resetPanelWidth()" title="Reset panel width to default">↔ Reset</button>
              <button class="deepgram-collapse-btn" id="deepgram-collapse-btn" onclick="window.toggleTranscriptHeight()">Collapse</button>
            </div>
          </label>
          <textarea id="deepgram-transcript" class="deepgram-transcript" placeholder="Your transcription will appear here..."></textarea>
          <div id="deepgram-click-bar" onclick="window.clickBarAction()">
            <span id="deepgram-click-bar-label">Click to add paragraph</span>
          </div>
        </div>
        
        <!-- Buttons -->
        <div class="deepgram-buttons">
          <button id="deepgram-record-btn" class="deepgram-btn deepgram-btn-primary" disabled>
            <span id="deepgram-record-icon">🎤</span>
            <span id="deepgram-record-text">Start Recording</span>
          </button>
        </div>
        
        <div class="deepgram-buttons">
          <button id="deepgram-insert-btn" class="deepgram-btn deepgram-btn-success" disabled>
            💬 Insert
          </button>
          <button id="deepgram-copy-btn" class="deepgram-btn deepgram-btn-success" disabled>
            📋 Copy
          </button>
          <button id="deepgram-paste-btn" class="deepgram-btn deepgram-btn-info">
            📄 Paste MD
          </button>
          <button id="deepgram-paste-email-btn" class="deepgram-btn deepgram-btn-info">
            📧 Paste Email
          </button>
          <button id="deepgram-clear-btn" class="deepgram-btn deepgram-btn-secondary">
            🗑️ Clear
          </button>
        </div>
        
        <!-- Info -->
        <details class="deepgram-info-details">
          <summary class="deepgram-info-summary">Keyboard Shortcuts & Features</summary>
          <div class="deepgram-info">
            <strong>Keyboard Shortcuts:</strong>
            Space: Toggle recording (when not typing)<br>
            Ctrl+Shift+Enter: Insert to Chat<br>
            <br>
            <strong>Paste Support:</strong>
            <em>Paste MD:</em> Copy formatted text (bullets, bold, italic) from TypingMind → converts to plain text with ASCII formatting (-, **, *)<br>
            <em>Paste Email:</em> Copy email content from Gmail → normalizes excessive paragraph spacing
          </div>
        </details>
        </div>
      </div>
      
      <div id="deepgram-resize-handle"></div>
      
      <div id="deepgram-filler"></div>
    `;
    
    document.body.appendChild(toggleBtn);
    document.body.appendChild(panel);
    console.log('✓ Widget created');
  }
  
  // ==================== INITIALIZATION ====================
  function initializeWidget() {
    // Load saved transcription mode
    const savedMode = localStorage.getItem(CONFIG.TRANSCRIPTION_MODE_STORAGE);
    if (savedMode) {
      transcriptionMode = savedMode;
    }
    
    // Load saved API key (Deepgram)
    const savedApiKey = localStorage.getItem(CONFIG.DEEPGRAM_API_KEY_STORAGE);
    if (savedApiKey) {
      document.getElementById('deepgram-api-input').value = savedApiKey;
      showApiKeySaved();
    }
    
    // Load saved keyterms (Deepgram)
    const savedKeyterms = localStorage.getItem(CONFIG.KEYTERMS_STORAGE);
    if (savedKeyterms) {
      document.getElementById('deepgram-keyterms-input').value = savedKeyterms;
    }
    
    // Load Whisper settings
    const whisperApiKey = localStorage.getItem(CONFIG.WHISPER_API_KEY_STORAGE);
    if (whisperApiKey) {
      document.getElementById('whisper-api-input').value = whisperApiKey;
    }
    
    const whisperEndpoint = localStorage.getItem(CONFIG.WHISPER_ENDPOINT_STORAGE);
    const endpointSelect = document.getElementById('whisper-endpoint-select');
    if (whisperEndpoint) {
      if (whisperEndpoint === CONFIG.DEFAULT_LOCAL_ENDPOINT) {
        endpointSelect.value = 'local';
      } else if (whisperEndpoint === CONFIG.DEFAULT_OPENAI_ENDPOINT) {
        endpointSelect.value = 'openai';
      } else {
        endpointSelect.value = 'custom';
        document.getElementById('whisper-custom-endpoint').value = whisperEndpoint;
        document.getElementById('whisper-custom-endpoint').style.display = 'block';
      }
    }
    
    const whisperPrompt = localStorage.getItem(CONFIG.WHISPER_PROMPT_STORAGE);
    if (whisperPrompt) {
      document.getElementById('whisper-prompt-input').value = whisperPrompt;
    } else {
      document.getElementById('whisper-prompt-input').value = CONFIG.DEFAULT_WHISPER_PROMPT;
    }
    
    // Load saved content width
    const savedWidth = localStorage.getItem('deepgram_content_width');
    if (savedWidth) {
      document.getElementById('deepgram-content-container').style.width = savedWidth + 'px';
    }
    
    // Load saved auto-scroll preference
    const savedAutoScroll = localStorage.getItem('deepgram_autoscroll_enabled');
    if (savedAutoScroll !== null) {
      autoScrollEnabled = savedAutoScroll === 'true';
      updateAutoScrollButton();
    }
    
    // Load saved auto-clipboard delay
    const savedDelay = localStorage.getItem(CONFIG.AUTOCLIPBOARD_DELAY_STORAGE);
    if (savedDelay !== null) {
      autoClipboardDelay = parseInt(savedDelay, 10) || 0;
      document.getElementById('deepgram-autoclipboard-input').value = autoClipboardDelay;
      if (autoClipboardDelay > 0) {
        startAutoClipboard();
      }
    }
    
    // Load saved dark mode preference
    const savedTheme = localStorage.getItem('deepgram_theme');
    const panel = document.getElementById('deepgram-panel');
    if (savedTheme) {
      panel.setAttribute('data-theme', savedTheme);
    } else {
      panel.setAttribute('data-theme', 'light');
    }
    updateDarkModeButton();
    
    // Attach event listeners
    document.getElementById('deepgram-api-input').addEventListener('change', saveApiKey);
    document.getElementById('deepgram-keyterms-input').addEventListener('input', debounce(saveKeyterms, 1000));
    document.getElementById('deepgram-record-btn').addEventListener('click', toggleRecording);
    document.getElementById('deepgram-insert-btn').addEventListener('click', insertToChat);
    document.getElementById('deepgram-copy-btn').addEventListener('click', copyTranscript);
    document.getElementById('deepgram-paste-btn').addEventListener('click', pasteMarkdown);
    document.getElementById('deepgram-paste-email-btn').addEventListener('click', pasteEmail);
    document.getElementById('deepgram-clear-btn').addEventListener('click', clearTranscript);
    
    // Whisper event listeners
    const segmentBtn = document.getElementById('deepgram-segment-btn');
    if (segmentBtn) {
      segmentBtn.addEventListener('click', endSegmentAndContinue);
    }
    
    document.getElementById('whisper-endpoint-select').addEventListener('change', onWhisperEndpointChange);
    document.getElementById('whisper-api-input').addEventListener('change', saveWhisperSettings);
    document.getElementById('whisper-prompt-input').addEventListener('change', saveWhisperSettings);
    document.getElementById('whisper-custom-endpoint').addEventListener('change', saveWhisperSettings);
    
    // Enable/disable buttons based on transcript content
    document.getElementById('deepgram-transcript').addEventListener('input', updateInsertButtonState);
    
    // Auto-clipboard timer input
    document.getElementById('deepgram-autoclipboard-input').addEventListener('change', onAutoClipboardDelayChange);
    
    // Initialize resize functionality
    initializeResize();
    
    // Display version number
    document.getElementById('deepgram-version').textContent = `v${CONFIG.VERSION}`;
    
    // Update UI based on current mode
    updateModeUI();
    
    // Make functions global
    window.deepgramEditApiKey = editApiKey;
    window.toggleTranscriptHeight = toggleTranscriptHeight;
    window.resetPanelWidth = resetPanelWidth;
    window.toggleAutoScroll = toggleAutoScroll;
    window.toggleDarkMode = toggleDarkMode;
    window.onAutoClipboardDelayChange = onAutoClipboardDelayChange;
    window.toggleTranscriptionMode = toggleTranscriptionMode;
    window.onWhisperEndpointChange = onWhisperEndpointChange;
    window.saveWhisperSettings = saveWhisperSettings;
    window.clickBarAction = clickBarAction;
    
    console.log('✓ Widget initialized');
    console.log('📌 Version:', CONFIG.VERSION);
    console.log('📌 Mode:', transcriptionMode);
  }
  
  // ==================== UTILITY FUNCTIONS ====================
  function togglePanel() {
    const panel = document.getElementById('deepgram-panel');
    panel.classList.toggle('open');
    isPanelOpen = panel.classList.contains('open');
  }
  
  function toggleTranscriptHeight() {
    const transcript = document.getElementById('deepgram-transcript');
    const keyterms = document.getElementById('deepgram-keyterms-input');
    const btn = document.getElementById('deepgram-collapse-btn');
    
    // Get current height from computed style
    const computedStyle = window.getComputedStyle(transcript);
    const currentHeight = parseInt(computedStyle.height);
    
    if (currentHeight > 150) {
      // Collapse to 150px
      transcript.style.height = '150px';
      btn.textContent = 'Expand';
    } else {
      // Expand back to 600px default AND reset keyterms to 60px
      transcript.style.height = '600px';
      keyterms.style.height = '60px';
      btn.textContent = 'Collapse';
    }
  }
  
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }
  
  function updateStatus(message, className) {
    const statusEl = document.getElementById('deepgram-status');
    statusEl.textContent = message;
    statusEl.className = `deepgram-status ${className}`;
  }
  
  // ==================== API KEY MANAGEMENT ====================
  function saveApiKey() {
    const apiKey = document.getElementById('deepgram-api-input').value.trim();
    if (!apiKey) {
      alert('Please enter a valid API key');
      return;
    }
    
    localStorage.setItem(CONFIG.DEEPGRAM_API_KEY_STORAGE, apiKey);
    showApiKeySaved();
    console.log('✓ API key saved');
  }
  
  function showApiKeySaved() {
    document.getElementById('deepgram-api-section').style.display = 'none';
    document.getElementById('deepgram-api-saved').style.display = 'block';
    document.getElementById('deepgram-keyterms-section').style.display = 'block';
    document.getElementById('deepgram-mode-section').style.display = 'block';  // Show mode toggle
    document.getElementById('deepgram-record-btn').disabled = false;
    updateInsertButtonState(); // Check if there's text to enable buttons
  }
  
  function updateInsertButtonState() {
    const transcript = document.getElementById('deepgram-transcript').value.trim();
    const insertBtn = document.getElementById('deepgram-insert-btn');
    const copyBtn = document.getElementById('deepgram-copy-btn');
    
    // Enable if there's any text, disable if empty
    insertBtn.disabled = !transcript;
    copyBtn.disabled = !transcript;
  }
  
  function editApiKey() {
    document.getElementById('deepgram-api-section').style.display = 'block';
    document.getElementById('deepgram-api-saved').style.display = 'none';
    document.getElementById('deepgram-api-input').focus();
  }
  
  function saveKeyterms() {
    const keyterms = document.getElementById('deepgram-keyterms-input').value.trim();
    localStorage.setItem(CONFIG.KEYTERMS_STORAGE, keyterms);
    console.log('✓ Keyterms saved');
  }
  
  // ==================== WEBSOCKET URL BUILDER ====================
  function buildWebSocketUrl() {
    let url = `${CONFIG.WEBSOCKET_BASE}?${CONFIG.WEBSOCKET_PARAMS}`;
    
    // Add keyterms if any
    const keytermsInput = document.getElementById('deepgram-keyterms-input').value.trim();
    if (keytermsInput) {
      const keyterms = keytermsInput.split(',').map(k => k.trim()).filter(k => k);
      if (keyterms.length > 0) {
        const keytermParams = keyterms.map(k => `keyterm=${encodeURIComponent(k)}`).join('&');
        url += `&${keytermParams}`;
      }
    }
    
    console.log('WebSocket URL:', url);
    return url;
  }
  
  // ==================== RECORDING CONTROLS ====================
  function toggleRecording() {
    if (isRecording) {
      // Stop based on current mode
      if (transcriptionMode === 'whisper') {
        stopWhisperRecording();
      } else {
        stopDeepgramRecording();
      }
    } else {
      // Start based on current mode
      if (transcriptionMode === 'whisper') {
        startWhisperRecording();
      } else {
        startDeepgramRecording();
      }
    }
  }
  
  function startDeepgramRecording() {
    const apiKey = localStorage.getItem(CONFIG.DEEPGRAM_API_KEY_STORAGE);
    if (!apiKey) {
      alert('Please enter your Deepgram API key first');
      return;
    }
    
    // Clean up any existing MediaRecorder or WebSocket from previous session
    if (mediaRecorder) {
      if (mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
      if (mediaRecorder.stream) {
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
      }
      mediaRecorder = null;
    }
    
    if (deepgramSocket) {
      if (deepgramSocket.readyState === 1 || deepgramSocket.readyState === 0) {
        deepgramSocket.close();
      }
      deepgramSocket = null;
    }
    
    // Save cursor position
    const transcriptEl = document.getElementById('deepgram-transcript');
    savedCursorPosition = transcriptEl.selectionStart;
    
    updateStatus('Connecting...', 'connecting');
    
    // Request microphone access
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        console.log('✓ Microphone access granted');
        
        // Create MediaRecorder
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        
        // Build WebSocket URL
        const wsUrl = buildWebSocketUrl();
        
        // Establish WebSocket connection
        deepgramSocket = new WebSocket(wsUrl, ['token', apiKey]);
        
        deepgramSocket.onopen = () => {
          console.log('✓ WebSocket connected');
          updateStatus('🟢 Connected - Listening...', 'connected');
          isRecording = true;
          updateRecordButton(true);
          document.getElementById('deepgram-insert-btn').disabled = false;
          
          // Update toggle button
          document.getElementById('deepgram-toggle').classList.add('recording');
          
          // Start recording
          mediaRecorder.addEventListener('dataavailable', event => {
            if (event.data.size > 0 && deepgramSocket.readyState === 1) {
              deepgramSocket.send(event.data);
            }
          });
          
          mediaRecorder.start(250);
        };
        
        deepgramSocket.onmessage = (message) => {
        try {
        const received = JSON.parse(message.data);
        
        if (received.channel?.alternatives?.[0]) {
        const transcript = received.channel.alternatives[0].transcript;
        
        // Only append final transcripts
        if (transcript && received.is_final) {
        console.log('Final transcript:', transcript);
        appendTranscript(transcript);
        
        // Flash status indicator to show activity
        flashStatusIndicator();
          
            // Ensure buttons are enabled
              updateInsertButtonState();
          }
          }
          } catch (error) {
          console.error('Error processing message:', error);
        }
      };
        
        deepgramSocket.onclose = () => {
          console.log('WebSocket closed');
          updateStatus('Ready to Record', 'disconnected');
        };
        
        deepgramSocket.onerror = (error) => {
          console.error('WebSocket error:', error);
          updateStatus('Error: Connection failed', 'disconnected');
          alert('Connection error. Please check your API key and try again.');
        };
      })
      .catch(error => {
        console.error('Microphone access error:', error);
        updateStatus('Error: Microphone access denied', 'disconnected');
        alert('Microphone access denied. Please allow microphone access and try again.');
      });
  }
  
  function stopDeepgramRecording() {
    // Stop the flash immediately when recording stops
    shouldFlash = false;
    if (flashTimer) {
      clearTimeout(flashTimer);
      flashTimer = null;
    }
    const statusEl = document.getElementById('deepgram-status');
    if (statusEl) {
      statusEl.classList.remove('flash');
    }
    
    // Update UI immediately
    updateStatus('Finishing transcription...', 'connecting');
    isRecording = false;
    updateRecordButton(false);
    document.getElementById('deepgram-toggle').classList.remove('recording');
    
    // Send Finalize message to Deepgram to flush remaining audio
    if (deepgramSocket && deepgramSocket.readyState === 1) {
      console.log('📤 Sending Finalize message to Deepgram...');
      deepgramSocket.send(JSON.stringify({ type: 'Finalize' }));
      
      // Keep WebSocket open briefly to receive final transcription
      // Then stop microphone and close connection
      setTimeout(() => {
        // Stop microphone
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
          mediaRecorder.stream.getTracks().forEach(track => track.stop());
          console.log('🎤 Microphone stopped');
        }
        
        // Close WebSocket
        if (deepgramSocket && deepgramSocket.readyState === 1) {
          deepgramSocket.close();
          console.log('✅ WebSocket closed');
        }
        
        updateStatus('Ready to Record', 'disconnected');
      }, 2000); // 2 seconds should be enough for Finalize response
    } else {
      // WebSocket already closed - stop microphone immediately
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
      }
      updateStatus('Ready to Record', 'disconnected');
    }
  }

  // ==================== WHISPER RECORDING FUNCTIONS ====================
  
  async function startWhisperRecording() {
    const endpoint = localStorage.getItem(CONFIG.WHISPER_ENDPOINT_STORAGE) || CONFIG.DEFAULT_LOCAL_ENDPOINT;
    const apiKey = localStorage.getItem(CONFIG.WHISPER_API_KEY_STORAGE);
    
    // For local server, API key is optional
    if (!apiKey && endpoint.includes('api.openai.com')) {
      updateStatus('Error: OpenAI API key required', 'disconnected');
      alert('Please enter your OpenAI API key in settings');
      return;
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      console.log('🎤 Microphone access granted (Whisper mode)');
      
      // Create MediaRecorder
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunks = [];
      
      // Collect audio chunks
      mediaRecorder.addEventListener('dataavailable', event => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      });
      
      // When recording stops, send to Whisper
      mediaRecorder.addEventListener('stop', async () => {
        if (audioChunks.length > 0) {
          const chunks = [...audioChunks];
          audioChunks = [];
          await sendToWhisper(chunks);
        }
      });
      
      // Start recording
      mediaRecorder.start();
      isRecording = true;
      
      updateStatus('🔴 Recording...', 'connected');
      updateRecordButton(true);
      document.getElementById('deepgram-toggle').classList.add('recording');
      
      // Show segment button in Whisper mode
      const segmentBtn = document.getElementById('deepgram-segment-btn');
      if (segmentBtn) {
        segmentBtn.style.display = 'block';
      }
      
      // WHISPER FLASH: Start continuous flash while recording
      startWhisperFlash();
      
      // Start recording duration timer (for red gradient warning)
      startRecordingDurationWarning();
      
      console.log('✅ Whisper recording started');
      
    } catch (error) {
      console.error('❌ Microphone access error:', error);
      updateStatus('Error: Microphone access denied', 'disconnected');
      alert('Microphone access denied. Please allow microphone access and try again.');
    }
  }
  
  function stopWhisperRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
      isRecording = false;
      
      updateStatus('⏸️ Processing final segment...', 'connecting');
      updateRecordButton(false);
      document.getElementById('deepgram-toggle').classList.remove('recording');
      
      // Hide segment button
      const segmentBtn = document.getElementById('deepgram-segment-btn');
      if (segmentBtn) {
        segmentBtn.style.display = 'none';
      }
      
      // WHISPER FLASH: Stop continuous flash immediately
      stopWhisperFlash();
      
      // Stop recording duration timer
      stopRecordingDurationWarning();
      
      console.log('⏹️ Whisper recording stopped');
    }
  }
  
  async function endSegmentAndContinue() {
    if (!isRecording) {
      // If not recording, start recording
      startWhisperRecording();
      return;
    }
    
    console.log('🔄 Ending segment and continuing...');
    
    // Stop current recording to trigger chunk submission
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
    
    // Wait briefly for 'stop' event to fire and chunk to be queued
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Immediately start new recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunks = [];
      
      mediaRecorder.addEventListener('dataavailable', event => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      });
      
      mediaRecorder.addEventListener('stop', async () => {
        if (audioChunks.length > 0) {
          const chunks = [...audioChunks];
          audioChunks = [];
          await sendToWhisper(chunks);
        }
      });
      
      mediaRecorder.start();
      
      console.log('✅ New segment started');
      
    } catch (error) {
      console.error('❌ Failed to restart recording:', error);
      updateStatus('Error: Failed to continue recording', 'disconnected');
    }
  }
  
  async function sendToWhisper(chunks) {
    const apiKey = localStorage.getItem(CONFIG.WHISPER_API_KEY_STORAGE);
    const endpoint = localStorage.getItem(CONFIG.WHISPER_ENDPOINT_STORAGE) || CONFIG.DEFAULT_LOCAL_ENDPOINT;
    const prompt = localStorage.getItem(CONFIG.WHISPER_PROMPT_STORAGE) || CONFIG.DEFAULT_WHISPER_PROMPT;
    
    // Increment pending counter
    pendingTranscriptions++;
    updateQueueStatus();
    
    try {
      // Create audio blob
      const audioBlob = new Blob(chunks, { type: 'audio/webm' });
      
      console.log(`📤 Sending chunk to Whisper (${audioBlob.size} bytes, endpoint: ${endpoint})`);
      
      // Prepare form data
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', 'whisper-1');
      
      if (prompt) {
        formData.append('prompt', prompt);
      }
      
      // Send to Whisper
      const headers = {};
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: formData
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Whisper API error: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      console.log('📥 Response status:', response.status);
      console.log('📥 Response headers:', [...response.headers.entries()]);
      
      const responseText = await response.text();
      console.log('📥 Raw response body:', responseText);
      
      const result = JSON.parse(responseText);
      console.log('📥 Parsed JSON:', result);
      
      const transcription = result.text;
      console.log('📥 Extracted transcription:', transcription);
      
      console.log('✅ Transcription received:', transcription);
      
      // Append to transcript
      appendTranscript(transcription);
      
      // Ensure buttons are enabled
      updateInsertButtonState();
      
    } catch (error) {
      console.error('❌ Whisper API error:', error);
      updateStatus(`Error: ${error.message}`, 'disconnected');
      alert(`Whisper transcription failed: ${error.message}`);
    } finally {
      // Decrement pending counter
      pendingTranscriptions--;
      updateQueueStatus();
      
      // Update status if no more pending
      if (pendingTranscriptions === 0 && !isRecording) {
        updateStatus('Ready to Record', 'disconnected');
      }
    }
  }
  
  function updateQueueStatus() {
    const queueEl = document.getElementById('deepgram-queue-status');
    if (!queueEl) return;
    
    if (pendingTranscriptions > 0) {
      queueEl.textContent = `⏳ Processing ${pendingTranscriptions} chunk${pendingTranscriptions > 1 ? 's' : ''}...`;
      queueEl.classList.add('active');
    } else {
      queueEl.textContent = 'Whisper Standing By';
      queueEl.classList.remove('active');
    }
  }
  
  // ==================== WHISPER FLASH CONTROL ====================
  
  function startWhisperFlash() {
    const statusEl = document.getElementById('deepgram-status');
    if (!statusEl) return;
    
    // Cancel any existing flash
    shouldFlash = false;
    if (flashTimer) {
      clearTimeout(flashTimer);
      flashTimer = null;
    }
    
    // Enable continuous flashing
    shouldFlash = true;
    
    const flashDuration = 333;
    const pauseDuration = 333;
    let isFlashing = false;
    
    function doFlash() {
      // Stop if recording ended
      if (!shouldFlash || !isRecording) {
        statusEl.classList.remove('flash');
        flashTimer = null;
        shouldFlash = false;
        return;
      }
      
      if (!isFlashing) {
        // Turn flash ON
        statusEl.classList.add('flash');
        isFlashing = true;
        flashTimer = setTimeout(doFlash, flashDuration);
      } else {
        // Turn flash OFF
        statusEl.classList.remove('flash');
        isFlashing = false;
        flashTimer = setTimeout(doFlash, pauseDuration);
      }
    }
    
    // Start the continuous flash
    doFlash();
    console.log('✅ Whisper flash started (continuous while recording)');
  }
  
  function stopWhisperFlash() {
    const statusEl = document.getElementById('deepgram-status');
    if (!statusEl) return;
    
    // Stop flashing immediately
    shouldFlash = false;
    if (flashTimer) {
      clearTimeout(flashTimer);
      flashTimer = null;
    }
    statusEl.classList.remove('flash');
    
    console.log('⏹️ Whisper flash stopped');
  }

  
  // ==================== RECORDING DURATION WARNING ====================
  
  function startRecordingDurationWarning() {
    recordingStartTime = Date.now();
    
    // Update color every 500ms
    recordingDurationTimer = setInterval(() => {
      const elapsed = (Date.now() - recordingStartTime) / 1000; // seconds
      const statusEl = document.getElementById('deepgram-status');
      if (!statusEl || !isRecording) {
        stopRecordingDurationWarning();
        return;
      }
      
      // Gradient from green to red over 30 seconds
      // 0s: green (#ccff66)
      // 30s: red (#ff0000)
      const progress = Math.min(elapsed / 30, 1); // 0 to 1
      
      // Interpolate between green and red
      const startR = 204, startG = 255, startB = 102; // #ccff66
      const endR = 255, endG = 0, endB = 0; // #ff0000
      
      const r = Math.round(startR + (endR - startR) * progress);
      const g = Math.round(startG + (endG - startG) * progress);
      const b = Math.round(startB + (endB - startB) * progress);
      
      const color = `rgb(${r}, ${g}, ${b})`;
      
      // Update the flash background color dynamically
      statusEl.style.setProperty('--flash-color', color);
      
    }, 500);
    
    console.log('⏱️ Recording duration warning started');
  }
  
  function stopRecordingDurationWarning() {
    if (recordingDurationTimer) {
      clearInterval(recordingDurationTimer);
      recordingDurationTimer = null;
    }
    recordingStartTime = null;
    
    // Reset flash color
    const statusEl = document.getElementById('deepgram-status');
    if (statusEl) {
      statusEl.style.removeProperty('--flash-color');
    }
    
    console.log('⏹️ Recording duration warning stopped');
  }
  
  // ==================== END WHISPER FUNCTIONS ====================
  
  // ==================== CLICK BAR ====================
  
  function clickBarAction() {
    const transcriptEl = document.getElementById('deepgram-transcript');
    
    // Move cursor to end
    const endPosition = transcriptEl.value.length;
    transcriptEl.setSelectionRange(endPosition, endPosition);
    
    // Add two newlines (paragraph break)
    transcriptEl.value += '\n\n';
    
    // Update cursor position after newlines
    const newPosition = transcriptEl.value.length;
    transcriptEl.setSelectionRange(newPosition, newPosition);
    
    // Scroll to bottom
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
    
    // Delay blur by 1000ms to show visual feedback (cursor moved + newlines added)
    setTimeout(() => {
      transcriptEl.blur();
    }, 1000);
    
    console.log('✅ Click bar: Added paragraph break and focused');
  }

  function updateRecordButton(recording) {
    const btn = document.getElementById('deepgram-record-btn');
    const icon = document.getElementById('deepgram-record-icon');
    const text = document.getElementById('deepgram-record-text');
    
    if (recording) {
      icon.textContent = '⏹️';
      text.textContent = 'Stop Recording';
      btn.classList.add('recording');
    } else {
      icon.textContent = '🎤';
      text.textContent = 'Start Recording';
      btn.classList.remove('recording');
    }
  }
  
  // ==================== TRANSCRIPT MANAGEMENT ====================
  
  function appendTranscript(text) {
    const transcriptEl = document.getElementById('deepgram-transcript');
    
    // Clear placeholder
    if (transcriptEl.value === '' || transcriptEl.value === 'Your transcription will appear here...') {
      transcriptEl.value = '';
    }
    
    // SIMPLIFIED: Always append to the end
    const currentText = transcriptEl.value;
    
    // Add space before text if there's existing content (to separate words)
    const newText = currentText ? text + ' ' : text + ' ';
    transcriptEl.value = currentText + newText;
    
    // Update saved cursor position to end
    savedCursorPosition = transcriptEl.value.length;
    transcriptEl.setSelectionRange(savedCursorPosition, savedCursorPosition);
    
    // Auto-scroll to bottom (since we're always appending)
    if (autoScrollEnabled) {
      transcriptEl.scrollTop = transcriptEl.scrollHeight;
    }
    
    // Update button states (enable Insert/Copy if there's text)
    updateInsertButtonState();
  }
  
  function scrollToCursorPosition(element, cursorPos) {
    // Use a more reliable method: Let the browser handle cursor visibility
    // by temporarily blurring and refocusing, which triggers native scroll-to-cursor
    
    // Store current focus state
    const hadFocus = document.activeElement === element;
    
    // Force a small delay to ensure DOM has updated with new text
    requestAnimationFrame(() => {
      // Focus the element to make cursor visible
      element.focus();
      
      // Set selection range - browser will auto-scroll to show cursor
      element.setSelectionRange(cursorPos, cursorPos);
      
      // Additional manual scroll adjustment for better visibility
      // This provides the 2-line padding below cursor as requested
      const style = window.getComputedStyle(element);
      const lineHeight = parseInt(style.lineHeight) || parseInt(style.fontSize) * 1.6;
      const padding = lineHeight * 2;
      
      // Get current scroll position after browser auto-scroll
      const currentScroll = element.scrollTop;
      const elementHeight = element.clientHeight;
      
      // Calculate where cursor likely is (approximate)
      const textUpToCursor = element.value.substring(0, cursorPos);
      const linesBeforeCursor = textUpToCursor.split('\n').length;
      const approximateCursorY = linesBeforeCursor * lineHeight;
      
      // Check if cursor is near the bottom of visible area
      const cursorDistanceFromBottom = (currentScroll + elementHeight) - approximateCursorY;
      
      // If cursor is too close to bottom (less than 2 lines of padding), scroll down a bit
      if (cursorDistanceFromBottom < padding) {
        element.scrollTop = currentScroll + (padding - cursorDistanceFromBottom);
      }
      
      // If element didn't have focus before, blur it to restore previous state
      if (!hadFocus) {
        element.blur();
      }
    });
  }
  
  function flashStatusIndicator() {
    const statusEl = document.getElementById('deepgram-status');
    if (!statusEl) return;
    
    // WHISPER MODE: Flash continuously while recording (ignore this function call)
    if (transcriptionMode === 'whisper') {
      // Whisper flashing is controlled by startWhisperRecording/stopWhisperRecording
      // This function (triggered by transcription arrival) does nothing in Whisper mode
      return;
    }
    
    // DEEPGRAM MODE: Flash on transcription arrival (original behavior)
    // Cancel any existing flash sequence
    shouldFlash = false;
    if (flashTimer) {
      clearTimeout(flashTimer);
      flashTimer = null;
    }
    
    // Remove any existing flash class to reset state
    statusEl.classList.remove('flash');
    
    // Enable flashing
    shouldFlash = true;
    
    // Start new 5-second continuous flash sequence
    // Rhythm: 333ms on, 333ms off
    const flashDuration = 333;
    const pauseDuration = 333;
    const totalDuration = 5000; // 5 seconds to match Deepgram timeout
    
    let elapsed = 0;
    let isFlashing = false;
    
    function doFlash() {
      // Check if we should stop (recording stopped or sequence complete)
      if (!shouldFlash || elapsed >= totalDuration) {
        // End of sequence - ensure flash is off
        statusEl.classList.remove('flash');
        flashTimer = null;
        shouldFlash = false;
        return;
      }
      
      if (!isFlashing) {
        // Turn flash ON
        statusEl.classList.add('flash');
        isFlashing = true;
        elapsed += flashDuration;
        flashTimer = setTimeout(doFlash, flashDuration);
      } else {
        // Turn flash OFF
        statusEl.classList.remove('flash');
        isFlashing = false;
        elapsed += pauseDuration;
        flashTimer = setTimeout(doFlash, pauseDuration);
      }
    }
    
    // Start the sequence
    doFlash();
  }
  
  function toggleAutoScroll() {
    autoScrollEnabled = !autoScrollEnabled;
    localStorage.setItem('deepgram_autoscroll_enabled', autoScrollEnabled);
    updateAutoScrollButton();
    console.log('✓ Auto-scroll:', autoScrollEnabled ? 'enabled' : 'disabled');
  }
  
  // ==================== AUTO-CLIPBOARD TIMER ====================
  function onAutoClipboardDelayChange() {
    const input = document.getElementById('deepgram-autoclipboard-input');
    const value = parseInt(input.value, 10) || 0;
    
    // Enforce valid range
    if (value < 0) {
      input.value = 0;
      autoClipboardDelay = 0;
    } else if (value > 300) {
      input.value = 300;
      autoClipboardDelay = 300;
    } else {
      autoClipboardDelay = value;
    }
    
    // Save to localStorage
    localStorage.setItem(CONFIG.AUTOCLIPBOARD_DELAY_STORAGE, autoClipboardDelay);
    
    // Stop existing timer
    stopAutoClipboard();
    
    // Start new timer if value > 0
    if (autoClipboardDelay > 0) {
      startAutoClipboard();
      console.log('✓ Auto-clipboard enabled:', autoClipboardDelay, 'seconds');
    } else {
      console.log('✓ Auto-clipboard disabled');
    }
  }
  
  function startAutoClipboard() {
    if (autoClipboardTimer) {
      clearInterval(autoClipboardTimer);
    }
    
    if (autoClipboardDelay > 0) {
      autoClipboardTimer = setInterval(async () => {
        const transcriptEl = document.getElementById('deepgram-transcript');
        if (!transcriptEl) return;
        
        const currentText = transcriptEl.value.trim();
        
        // Only copy if:
        // 1. There is text
        // 2. Text is different from last copied text
        if (currentText && currentText !== lastCopiedText) {
          try {
            await navigator.clipboard.writeText(currentText);
            lastCopiedText = currentText;
            console.log('🔄 Auto-copied to clipboard (' + currentText.length + ' chars)');
          } catch (err) {
            console.error('Auto-clipboard copy failed:', err);
          }
        }
      }, autoClipboardDelay * 1000);
      
      console.log('✓ Auto-clipboard timer started:', autoClipboardDelay, 'seconds');
    }
  }
  
  function stopAutoClipboard() {
    if (autoClipboardTimer) {
      clearInterval(autoClipboardTimer);
      autoClipboardTimer = null;
      console.log('✓ Auto-clipboard timer stopped');
    }
  }
  
  function updateAutoScrollButton() {
    const btn = document.getElementById('deepgram-autoscroll-btn');
    if (btn) {
      btn.textContent = autoScrollEnabled ? 'Auto-Scroll: ON' : 'Auto-Scroll: OFF';
      btn.style.opacity = autoScrollEnabled ? '1' : '0.6';
    }
  }
  
  function toggleDarkMode() {
    const panel = document.getElementById('deepgram-panel');
    const currentTheme = panel.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    panel.setAttribute('data-theme', newTheme);
    localStorage.setItem('deepgram_theme', newTheme);
    updateDarkModeButton();
    console.log('✓ Dark mode:', newTheme === 'dark' ? 'enabled' : 'disabled');
  }
  
  function updateDarkModeButton() {
    const panel = document.getElementById('deepgram-panel');
    const btn = document.getElementById('deepgram-darkmode-btn');
    if (btn && panel) {
      const isDark = panel.getAttribute('data-theme') === 'dark';
      btn.innerHTML = isDark ? '☀️ Light' : '🌙 Dark';
      btn.style.opacity = '1';
    }
  }
  
  function clearTranscript() {
    document.getElementById('deepgram-transcript').value = '';
    savedCursorPosition = null;
  }
  
  async function copyTranscript() {
    const text = document.getElementById('deepgram-transcript').value.trim();
    if (!text) {
      alert('No transcript to copy!');
      return;
    }
    
    try {
      await navigator.clipboard.writeText(text);
      
      const btn = document.getElementById('deepgram-copy-btn');
      const originalText = btn.textContent;
      btn.textContent = '✓ Copied!';
      
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    } catch (err) {
      console.error('Copy failed:', err);
      alert('Failed to copy. Please select and copy manually.');
    }
  }
  
  // ==================== TYPINGMIND INTEGRATION ====================
  function insertToChat() {
    const text = document.getElementById('deepgram-transcript').value.trim();
    if (!text) {
      alert('No transcript to insert!');
      return;
    }
    
    console.log('🔍 Searching for TypingMind chat input...');
    
    // Extended list of selectors to try (in priority order)
    const selectors = [
      // PRIORITY 1: TypingMind-specific selectors (verified working)
      '#chat-input-textbox',
      '[data-element-id="chat-input-textbox"]',
      'textarea[placeholder*="Press"]',
      'textarea.main-chat-input',
      
      // PRIORITY 2: Common textarea selectors
      'textarea[placeholder*="Message"]',
      'textarea[placeholder*="Type"]',
      'textarea[placeholder*="message"]',
      'textarea[placeholder*="type"]',
      'textarea[id*="chat"]',
      'textarea[id*="message"]',
      'textarea[id*="input"]',
      'textarea.chat-input',
      'textarea[class*="chat"]',
      'textarea[class*="message"]',
      'textarea[class*="input"]',
      '#chat-input',
      '#message-input',
      
      // PRIORITY 3: Contenteditable divs
      'div[contenteditable="true"]',
      '[contenteditable="true"]',
      'div[role="textbox"]',
      
      // PRIORITY 4: Any textarea as last resort
      'textarea'
    ];
    
    let chatInput = null;
    let foundSelector = null;
    
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      console.log(`Trying selector: ${selector}, found ${elements.length} elements`);
      
      for (const element of elements) {
        // Check if visible and not part of our extension
        if (element.offsetParent !== null && 
            !element.closest('#deepgram-panel') &&
            !element.id.includes('deepgram')) {
          chatInput = element;
          foundSelector = selector;
          console.log(`✓ Found visible input with selector: ${selector}`);
          break;
        }
      }
      
      if (chatInput) break;
    }
    
    if (chatInput) {
      console.log('✓ Found chat input:', chatInput);
      console.log('  Tag:', chatInput.tagName);
      console.log('  Type:', chatInput.type);
      console.log('  ContentEditable:', chatInput.contentEditable);
      console.log('  Placeholder:', chatInput.placeholder);
      
      try {
        // Insert text based on element type
        if (chatInput.tagName === 'TEXTAREA' || chatInput.tagName === 'INPUT') {
          const currentValue = chatInput.value;
          const newValue = currentValue ? currentValue + '\n\n' + text : text;
          
          // METHOD 1: React-compatible way (use native property setter)
          const nativeValueSetter = Object.getOwnPropertyDescriptor(
            chatInput.tagName === 'TEXTAREA' 
              ? window.HTMLTextAreaElement.prototype 
              : window.HTMLInputElement.prototype,
            'value'
          ).set;
          
          nativeValueSetter.call(chatInput, newValue);
          
          // Trigger input event (React listens to this)
          const inputEvent = new Event('input', { bubbles: true });
          chatInput.dispatchEvent(inputEvent);
          
          // Also try change event for non-React frameworks
          const changeEvent = new Event('change', { bubbles: true });
          chatInput.dispatchEvent(changeEvent);
          
          console.log('✓ Value set via native property setter');
          console.log('✓ Events dispatched: input, change');
          
        } else if (chatInput.contentEditable === 'true') {
          const currentText = chatInput.textContent || chatInput.innerText || '';
          const newText = currentText ? currentText + '\n\n' + text : text;
          
          // For contenteditable divs
          chatInput.textContent = newText;
          
          // Trigger events
          chatInput.dispatchEvent(new Event('input', { bubbles: true }));
          chatInput.dispatchEvent(new Event('change', { bubbles: true }));
          
          // Also try execCommand as alternative
          chatInput.focus();
          document.execCommand('selectAll', false, null);
          document.execCommand('insertText', false, newText);
          
          console.log('✓ ContentEditable div updated');
        }
        
        // Focus and move cursor to end
        chatInput.focus();
        
        if (chatInput.setSelectionRange) {
          const length = chatInput.value.length;
          chatInput.setSelectionRange(length, length);
        }
        
        // Clear transcript after successful insert
        clearTranscript();
        
        // Visual feedback
        const btn = document.getElementById('deepgram-insert-btn');
        const originalText = btn.textContent;
        btn.textContent = '✓ Inserted!';
        
        setTimeout(() => {
          btn.textContent = originalText;
        }, 2000);
        
        console.log('✅ Text inserted successfully!');
        
      } catch (error) {
        console.error('❌ Error inserting text:', error);
        alert('Error inserting text. Please copy and paste manually.');
      }
      
    } else {
      console.error('❌ Could not find chat input element');
      console.log('💡 Available textareas:', document.querySelectorAll('textarea'));
      console.log('💡 Available contenteditable:', document.querySelectorAll('[contenteditable="true"]'));
      alert('Could not find chat input. Opening browser console for debugging.\n\nPlease use the Copy button and paste manually.');
      
      // Auto-copy as fallback
      copyTranscript();
    }
  }
  
  // ==================== PANEL WIDTH RESET ====================
  function resetPanelWidth() {
    const contentContainer = document.getElementById('deepgram-content-container');
    contentContainer.style.width = CONFIG.DEFAULT_CONTENT_WIDTH + 'px';
    localStorage.setItem('deepgram_content_width', CONFIG.DEFAULT_CONTENT_WIDTH);
    console.log('✓ Panel width reset to default:', CONFIG.DEFAULT_CONTENT_WIDTH + 'px');
    
    // Visual feedback
    const btn = document.getElementById('deepgram-reset-width-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '✓ Reset';
    
    setTimeout(() => {
      btn.innerHTML = originalText;
    }, 1500);
  }
  
  // ==================== RESIZE FUNCTIONALITY ====================
  function initializeResize() {
    const resizeHandle = document.getElementById('deepgram-resize-handle');
    const contentContainer = document.getElementById('deepgram-content-container');
    const panel = document.getElementById('deepgram-panel');
    
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    
    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = contentContainer.offsetWidth;
      
      // Add visual feedback
      resizeHandle.style.background = '#667eea';
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      
      e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      
      const deltaX = e.clientX - startX;
      let newWidth = startWidth + deltaX;
      
      // Enforce min/max constraints
      const minWidth = 500;
      const maxWidth = 1155; // Full panel width (can expand all the way to the right)
      newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      
      contentContainer.style.width = newWidth + 'px';
    });
    
    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        resizeHandle.style.background = '';
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        
        // Save width to localStorage
        const currentWidth = contentContainer.offsetWidth;
        localStorage.setItem('deepgram_content_width', currentWidth);
        console.log('✓ Content width saved:', currentWidth + 'px');
      }
    });
    
    console.log('✓ Resize functionality initialized');
  }
  
  // ==================== MODE SWITCHING ====================
  
  function toggleTranscriptionMode() {
    // Toggle between modes
    transcriptionMode = transcriptionMode === 'deepgram' ? 'whisper' : 'deepgram';
    
    // Save preference
    localStorage.setItem(CONFIG.TRANSCRIPTION_MODE_STORAGE, transcriptionMode);
    
    // Update UI
    updateModeUI();
    
    console.log('✓ Transcription mode switched to:', transcriptionMode);
  }
  
  function updateModeUI() {
    const modeLabel = document.getElementById('deepgram-mode-label');
    const modeDescription = document.getElementById('deepgram-mode-description');
    const headerTitle = document.getElementById('deepgram-header-title');
    const whisperSettings = document.getElementById('whisper-settings-section');
    const whisperApi = document.getElementById('whisper-api-section');
    const whisperPrompt = document.getElementById('whisper-prompt-section');
    const deepgramKeyterms = document.getElementById('deepgram-keyterms-section');
    const deepgramApiSaved = document.getElementById('deepgram-api-saved');
    const segmentBtnContainer = document.getElementById('deepgram-segment-btn-container');
    const endpointSelect = document.getElementById('whisper-endpoint-select');
    
    if (transcriptionMode === 'whisper') {
      // Whisper mode
      modeLabel.textContent = 'Whisper';
      modeDescription.textContent = 'Using Whisper (chunked transcription with higher accuracy)';
      
      // Update header title
      if (headerTitle) {
        const versionSpan = headerTitle.querySelector('.deepgram-version');
        headerTitle.innerHTML = `🎙️ Whisper Transcription <span class="deepgram-version">${versionSpan ? versionSpan.textContent : ''}</span>`;
      }
      
      // Show Whisper settings, hide Deepgram keyterms and API saved box
      whisperSettings.style.display = 'block';
      whisperPrompt.style.display = 'block';
      deepgramKeyterms.style.display = 'none';
      deepgramApiSaved.style.display = 'none';
      
      // Show/hide OpenAI API key field based on endpoint
      updateWhisperApiVisibility();
      
      console.log('🎙️ UI updated for Whisper mode');
      
    } else {
      // Deepgram mode
      modeLabel.textContent = 'Deepgram';
      modeDescription.textContent = 'Using Deepgram (streaming real-time transcription)';
      
      // Update header title
      if (headerTitle) {
        const versionSpan = headerTitle.querySelector('.deepgram-version');
        headerTitle.innerHTML = `🎙️ Deepgram Transcription <span class="deepgram-version">${versionSpan ? versionSpan.textContent : ''}</span>`;
      }
      
      // Show Deepgram keyterms and API saved box, hide Whisper settings
      whisperSettings.style.display = 'none';
      whisperApi.style.display = 'none';
      whisperPrompt.style.display = 'none';
      deepgramKeyterms.style.display = 'block';
      
      // Show Deepgram API saved box if API key exists
      const apiKey = localStorage.getItem(CONFIG.DEEPGRAM_API_KEY_STORAGE);
      if (apiKey) {
        deepgramApiSaved.style.display = 'block';
      }
      
      // Hide segment button in Deepgram mode
      if (segmentBtnContainer) {
        segmentBtnContainer.style.display = 'none';
      }
      
      console.log('🎙️ UI updated for Deepgram mode');
    }
  }
  
  function updateWhisperApiVisibility() {
    const endpointSelect = document.getElementById('whisper-endpoint-select');
    const whisperApi = document.getElementById('whisper-api-section');
    
    if (endpointSelect && whisperApi) {
      // Hide OpenAI API key field when Local endpoint is selected
      if (endpointSelect.value === 'local') {
        whisperApi.style.display = 'none';
      } else {
        whisperApi.style.display = 'block';
      }
    }
  }
  
  function saveWhisperSettings() {
    const apiKey = document.getElementById('whisper-api-input').value.trim();
    const prompt = document.getElementById('whisper-prompt-input').value.trim();
    
    // Save API key
    localStorage.setItem(CONFIG.WHISPER_API_KEY_STORAGE, apiKey);
    
    // Save prompt
    localStorage.setItem(CONFIG.WHISPER_PROMPT_STORAGE, prompt || CONFIG.DEFAULT_WHISPER_PROMPT);
    
    // Save endpoint (handled by onWhisperEndpointChange)
    onWhisperEndpointChange();
    
    console.log('✓ Whisper settings saved');
  }
  
  function onWhisperEndpointChange() {
    const select = document.getElementById('whisper-endpoint-select');
    const customInput = document.getElementById('whisper-custom-endpoint');
    
    let endpoint;
    
    if (select.value === 'local') {
      endpoint = CONFIG.DEFAULT_LOCAL_ENDPOINT;
      customInput.style.display = 'none';
    } else if (select.value === 'openai') {
      endpoint = CONFIG.DEFAULT_OPENAI_ENDPOINT;
      customInput.style.display = 'none';
    } else {
      // Custom endpoint
      endpoint = customInput.value.trim() || CONFIG.DEFAULT_LOCAL_ENDPOINT;
      customInput.style.display = 'block';
    }
    
    localStorage.setItem(CONFIG.WHISPER_ENDPOINT_STORAGE, endpoint);
    
    // Update API key field visibility
    updateWhisperApiVisibility();
    
    console.log('✓ Whisper endpoint saved:', endpoint);
  }
  
  // ==================== KEYBOARD SHORTCUTS ====================
  function initializeKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      const activeElement = document.activeElement;
      const isInputFocused = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.contentEditable === 'true'
      );
      
      // Space: Toggle recording (when not in input)
      if (e.code === 'Space' && !isInputFocused) {
        const apiKey = localStorage.getItem(CONFIG.DEEPGRAM_API_KEY_STORAGE);
        if (apiKey) {
          e.preventDefault();
          toggleRecording();
        }
      }
      
      // Ctrl+Shift+Enter: Insert to Chat (works globally, even when TypingMind chat is focused)
      if (e.ctrlKey && e.shiftKey && e.key === 'Enter') {
        const transcriptEl = document.getElementById('deepgram-transcript');
        const text = transcriptEl ? transcriptEl.value.trim() : '';
        if (text) {
          e.preventDefault();
          insertToChat();
          console.log('✓ Ctrl+Shift+Enter: Insert to Chat triggered');
        }
      }
    });
    
    console.log('✓ Keyboard shortcuts initialized');
    console.log('  - Space: Toggle recording (when not typing)');
    console.log('  - Ctrl+Shift+Enter: Insert to Chat (global)');
  }
  
  // ==================== CLEANUP ====================
  function cleanup() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    if (deepgramSocket && deepgramSocket.readyState === 1) {
      deepgramSocket.close();
    }
    stopAutoClipboard();
  }
  
  window.addEventListener('beforeunload', cleanup);
  
  // ==================== MAIN INITIALIZATION ====================
  function init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }
    
    try {
      injectStyles();
      createWidget();
      initializeWidget();
      initializeKeyboardShortcuts();
      
      console.log('✅ Deepgram Extension: Successfully loaded!');
      console.log('💡 Press Space (when not typing) to toggle recording');
      console.log('💡 Click the 🎤 button in bottom-right to open the panel');
      console.log('💡 Paste Markdown: Copy formatted text from TypingMind → Paste Markdown button → Edit with bullets/bold preserved');
    } catch (error) {
      console.error('❌ Deepgram Extension: Failed to initialize', error);
    }
  }
  
  // Start initialization
  init();
  
})();
