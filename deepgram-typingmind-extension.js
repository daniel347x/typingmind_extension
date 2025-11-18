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
 * v3.114 Changes:
 * - NEW: Add global 375px left shift to tool-call popup (on top of Chat margin) for final visual alignment
 * 
 * v3.110 Changes:
 * - NEW: Tie TypingMind tool-call Input/Output popup modal width to Chat pane width (layout controls in this widget)
 * 
 * v3.109 Changes:
 * - NEW: Shift+F4 handler for toggle recording (Shift+F3 has browser conflict)
 * - AutoHotkey intercepts Shift+F3 → sends Shift+F4 to widget
 * - Updated mapping: Shift+F4=Toggle, Shift+F5=Paragraph, Shift+F6=Cancel, Shift+F11=Submit
 * 
 * v3.107 Changes:
 * - FIXED: AutoHotkey now uses passthrough logic (Shift+F3 → Shift+F3, no transformation)
 * - Confirms correct mapping: Shift+F3=Toggle, Shift+F5=Paragraph, Shift+F6=Cancel, Shift+F11=Submit
 * 
 * v3.106 Changes:
 * - FIXED: Restored correct function key mapping (Shift+F6 = Cancel, not Toggle)
 * - Removed orphaned plain F6 handler (Chrome intercepts it anyway)
 * 
 * v3.105 Changes:
 * - CHANGED: Shift+F6 now toggles recording (was cancel) - fixes Chrome F6 navigation conflict
 * - AutoHotkey sends Shift+F6 instead of plain F6 (Chrome intercepts plain F6)
 * 
 * v3.104 Changes:
 * - REVERTED: Recording duration gradient back to 30s (60s causes Whisper hallucination loops)
 * 
 * v3.103 Changes:
 * - FIXED: F6 handler timeout removed (was breaking toggle - now synchronous)
 * - CHANGED: Recording duration gradient 30s → 60s (more time before red warning)
 * 
 * v3.102 Changes:
 * - NEW: F6 key handler for remote toggle recording (smart blur + timeout)
 *   - AutoHotkey sends plain F6 (not Shift+F3)
 *   - Widget blurs transcript if focused, waits 300ms, then toggles
 *   - Fixes: Escape key canceling recording instead of toggling
 * 
 * v3.101 Changes:
 * - CHANGED: Switch Shift+F9→F5, Shift+F10→F6 (F9/F10 also blocked by browser)
 *   - Shift+F3: Toggle recording (WORKING)
 *   - Shift+F5: Add paragraph break (was F9)
 *   - Shift+F6: Cancel recording (was F10)
 *   - Shift+F11: ULTIMATE ULTIMATE (WORKING)
 * 
 * v3.100 Changes:
 * - CHANGED: Switched to Shift+F3/F9/F10/F11 (F1/F2/F4 have browser conflicts even with Shift)
 *   - Shift+F3: Toggle recording
 *   - Shift+F9: Add paragraph break
 *   - Shift+F10: Cancel recording
 *   - Shift+F11: ULTIMATE ULTIMATE - Insert & Submit
 * 
 * v3.99 Changes:
 * - CHANGED: F-keys now require Shift modifier (Shift+F1, Shift+F2, etc.)
 *   - Prevents conflicts with browser/system F-key functions
 *   - Update SpeechControl to map buttons to Shift+F1/F2/F3/F4
 * 
 * v3.98 Changes:
 * - ENHANCED: F-keys now blur transcript box before executing (remote control UX)
 *   - Prevents Space/ArrowDown from typing in transcript when focus is inside
 *   - All F1-F4 keys blur first, then execute their function
 *   - Enables reliable remote control regardless of focus state
 * 
 * v3.97 Changes:
 * - NEW: F-key support for Philips SpeechOne remote control
 *   - F1: Toggle recording (same as Space)
 *   - F2: Add paragraph break (same as ArrowDown)
 *   - F3: Cancel recording (same as Escape)
 *   - F4: ULTIMATE ULTIMATE - Insert & Submit (same as Ctrl+Alt+Shift+Enter)
 * 
 * v3.96 Changes:
 * - CLEANUP: Removed noisy console logs related to sidebar and layout width application.
 * 
 * v3.95 Changes:
 * - FIXED: Orange background on the 'Click to add paragraph' bar now correctly resets when new transcription is received.
 * 
 * v3.94 Changes:
 * - FIXED: "Click to add paragraph" bar logic. Removed `.trimEnd()` from the check, which now correctly prevents adding duplicate newlines.
 * 
 * v3.93 Changes:
 * - DOCS: Workflowy documentation validation test. No code changes.
 * 
 * v3.92 Changes:
 * - FIXED: Removed 100ms delay from ArrowDown shortcut to prevent missed recordings.
 * - FIXED: "Click to add paragraph" bar now correctly checks for existing newlines and won't add duplicates.
 * 
 * v3.91 Changes:
 * - NEW: MutationObserver detects sidebar view switches (auto-applies/removes CSS)
 * - Fixes sidebar clickability by removing width overrides when switching to Models/Settings/etc.
 * - Sidebar CSS now dynamically responds to view changes
 * 
 * v3.90 Changes:
 * - NEW: Widget width control (customize transcription panel width)
 * - NEW: Transcript textarea height control (independent from panel resize)
 * - REMOVED: Widget height control (conflicted with resizable textarea)
 * - Font size reduced on all controls (11px → 9px for better overflow handling)
 * - Default transcript height: 525px → 480px
 * - FIXED: Sidebar CSS only applies in Chat view (restored clickability in Settings/Agents/etc.)
 * - FIXED: Sidebar styles actively removed when Chat not active (restores defaults)
 * - FIXED: Keyboard shortcuts (Ctrl+Shift+Enter, Ctrl+Alt+Shift+Enter) now blocked when Chat not active (prevents text loss)
 * 
 * v3.86 Changes:
 * - FIXED: ESC key cancellation now properly prevents audio submission
 * - Added cancellation flag check in 'stop' event handlers (prevents race condition)
 * - Flag checked in both initial recording and segment continuation 'stop' handlers
 * 
 * v3.85 Changes:
 * - NEW: ESC key cancels active recording without submitting audio (BUGGY - fixed in 3.86)
 * - Priority system: ESC cancels recording FIRST (if active), then closes popovers (if visible)
 * - Works in both Deepgram and Whisper modes
 * - Handles edge cases: pop-up widgets, doc annotation popover
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
  
  // ==================== TIMESTAMP HELPER ====================
  function ts() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return `[${hours}:${minutes}:${seconds}.${ms}]`;
  }
  
  console.log(ts(), '🎙️ Deepgram Extension: Initializing...');
  
  // ==================== CONFIGURATION ====================
  const CONFIG = {
  VERSION: '3.114',
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
    DEFAULT_WHISPER_PROMPT: 'Technical terms: Databricks, LlamaIndex, MLOps, QC automation, HITL, Francesco, Jim Kane, Rob Smith, Constantine Cannon',
    
    // Teams message break settings
    TEAMS_SPEAKERS_STORAGE: 'teams_message_speakers',
    TEAMS_ACTIVE_STORAGE: 'teams_message_active_speakers',
    TEAMS_DATE_STORAGE: 'teams_message_date',
    TEAMS_LAST_SPEAKER_STORAGE: 'teams_message_last_speaker_index',
    TEAMS_KNOWN_SPEAKERS_STORAGE: 'teams_message_known_speakers',
    
    // Document annotation settings
    DOC_ANNOTATION_TYPES_STORAGE: 'doc_annotation_types',
    DOC_ANNOTATION_LAST_TYPE_STORAGE: 'doc_annotation_last_type',
    DOC_ANNOTATION_LAST_PERSON_STORAGE: 'doc_annotation_last_person',
    
    // Layout width settings
    LAYOUT_CHAT_WIDTH_STORAGE: 'layout_chat_width',
    LAYOUT_CHAT_MARGIN_STORAGE: 'layout_chat_margin',
    LAYOUT_SIDEBAR_WIDTH_STORAGE: 'layout_sidebar_width',
    DEFAULT_CHAT_WIDTH: 1200,
    DEFAULT_CHAT_MARGIN: 640,
    DEFAULT_SIDEBAR_WIDTH: 800,
    
    // Widget dimension settings
    WIDGET_WIDTH_STORAGE: 'widget_panel_width',
    DEFAULT_WIDGET_WIDTH: 1155,
    TRANSCRIPT_HEIGHT_STORAGE: 'transcript_textarea_height',
    DEFAULT_TRANSCRIPT_HEIGHT: 480
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
  
  // Paragraph break queueing (boolean flag with warning on double-press)
  let pendingParagraphBreak = false;
  
  // Insert/Submit queueing
  let pendingInsert = false;
  let pendingInsertAndSubmit = false;
  
  // Teams message break state
  let teamsPopoverVisible = false;
  let teamsSavedCursorPosition = null;
  
  // Document annotation state
  let docAnnotationPopoverVisible = false;
  let docAnnotationSavedSelection = null;
  
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
        resize: both; /* Allow manual resize via drag handle */
      }
      
      #deepgram-panel.open {
        display: flex;
      }
      
      /* Content Container (left side - original width) */
      #deepgram-content-container {
        width: 700px; /* Original panel width */
        max-width: 1155px; /* Allow expansion to full panel width */
        min-width: 250px; /* Mobile-friendly minimum (was 500px) */
        display: flex;
        flex-direction: column;
        overflow-y: scroll; /* Always show scrollbar */
        overflow-x: hidden; /* Prevent horizontal scroll */
        flex-shrink: 0;
        height: 100%;
        max-height: 100%; /* Constrain to panel height */
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
        margin-top: -16px;
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
      
      /* Keyboard Event Indicator Bells */
      #keyboard-indicators {
        display: flex;
        gap: 6px;
        justify-content: flex-end;
        margin-bottom: 4px;
      }
      
      .keyboard-bell {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 2px solid transparent;
        opacity: 0.3;
        transition: all 0.1s ease;
      }
      
      .keyboard-bell.flash {
        opacity: 1;
        border-color: white;
        box-shadow: 0 0 8px currentColor;
        transform: scale(1.3);
      }
      
      .keyboard-bell.space { background: #28a745; }
      .keyboard-bell.ctrl-space { background: #ffc107; }
      .keyboard-bell.ultimate { background: #17a2b8; }
      .keyboard-bell.ultimate-ultimate { background: #9b59b6; }
      
      /* Transcript Area */
      .deepgram-transcript {
        width: 100%;
        min-height: 150px;
        height: 480px;
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
      
      .deepgram-btn-send {
        background: #20c997;
        color: white;
      }
      
      .deepgram-btn-send:hover {
        background: #1aa179;
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
      
      /* Teams Message Popover */
      #teams-message-popover {
        position: fixed;
        background: transparent;
        border: none;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        padding: 0;
        z-index: 1000000;
        display: none;
        min-width: 500px;
        max-width: 600px;
      }
      
      .teams-popover-inner {
        background: white;
        border: 2px solid #667eea;
        border-radius: 12px;
        padding: 20px;
      }
      
      [data-theme="dark"] .teams-popover-inner {
        background: #2d3548 !important;
        border-color: #667eea;
      }
      
      #teams-message-popover.visible {
        display: block;
      }
      
      .teams-popover-header {
        font-size: 16px;
        font-weight: 600;
        color: #333;
        margin-bottom: 15px;
        border-bottom: 2px solid #e2e8f0;
        padding-bottom: 10px;
      }
      
      .teams-popover-section {
        margin-bottom: 15px;
      }
      
      .teams-popover-section label {
        display: block;
        font-weight: 600;
        color: #333;
        margin-bottom: 8px;
        font-size: 13px;
      }
      
      .teams-date-input {
        width: 100%;
        padding: 8px 12px;
        border: 2px solid #e2e8f0;
        border-radius: 6px;
        font-size: 14px;
        box-sizing: border-box;
        background: white;
        color: #1a202c;
      }
      
      .teams-date-input:focus {
        outline: none;
        border-color: #667eea;
      }
      
      .teams-speakers-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
        margin-bottom: 15px;
      }
      
      .teams-speaker-slot {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .teams-speaker-checkbox {
        width: 18px;
        height: 18px;
        cursor: pointer;
      }
      
      .teams-speaker-dropdown {
        flex: 1;
        padding: 6px 8px;
        border: 2px solid #e2e8f0;
        border-radius: 6px;
        font-size: 13px;
        background: white;
        color: #1a202c;
      }
      
      .teams-speaker-dropdown:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        background: #f8f9fa;
      }
      
      .teams-speaker-dropdown:focus {
        outline: none;
        border-color: #667eea;
      }
      
      .teams-radio-section {
        margin-top: 15px;
        padding-top: 15px;
        border-top: 2px solid #e2e8f0;
      }
      
      .teams-radio-section label {
        margin-bottom: 12px;
      }
      
      .teams-radio-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 10px;
      }
      
      .teams-radio-button {
        padding: 15px 10px;
        border: 3px solid #e2e8f0;
        border-radius: 8px;
        text-align: center;
        cursor: pointer;
        transition: all 0.2s;
        font-weight: 600;
        color: #333;
        background: #f8f9fa;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .teams-radio-button:hover {
        border-color: #667eea;
        background: #f0f4ff;
      }
      
      .teams-radio-button.selected {
        border-color: #667eea;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        box-shadow: 0 0 15px rgba(102, 126, 234, 0.5);
      }
      
      .teams-radio-button.inactive {
        opacity: 0.4;
        cursor: default;
      }
      
      .teams-radio-button.teams-add-new {
        border-color: #28a745;
        color: #28a745;
        font-weight: 700;
      }
      
      .teams-radio-button.teams-add-new:hover {
        background: #e8f5e9;
        border-color: #28a745;
      }
      
      .teams-radio-name {
        flex: 1;
      }
      
      .teams-radio-delete {
        margin-left: 8px;
        font-size: 20px;
        font-weight: 700;
        color: #dc3545;
        cursor: pointer;
        padding: 0 4px;
        border-radius: 4px;
      }
      
      .teams-radio-delete:hover {
        background: #ffebee;
      }
      
      .teams-popover-buttons {
        display: flex;
        gap: 10px;
        margin-top: 15px;
      }
      
      .teams-popover-button {
        flex: 1;
        padding: 10px;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .teams-popover-button.primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }
      
      .teams-popover-button.primary:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
      }
      
      .teams-popover-button.secondary {
        background: #6c757d;
        color: white;
      }
      
      .teams-popover-button.secondary:hover {
        background: #5a6268;
      }
      
      /* Dark mode for Teams popover */
      [data-theme="dark"] #teams-message-popover {
        background: #2d3548;
        border-color: #667eea;
        color: #f3f4f6;
      }
      
      [data-theme="dark"] .teams-popover-header {
        color: #f3f4f6;
        border-bottom-color: #4b5563;
      }
      
      [data-theme="dark"] .teams-popover-section label {
        color: #f3f4f6;
      }
      
      [data-theme="dark"] .teams-popover-section small {
        color: #9ca3af;
      }
      
      [data-theme="dark"] .teams-date-input,
      [data-theme="dark"] .teams-speaker-dropdown {
        background-color: #2d3548;
        color: #f3f4f6;
        border-color: #374151;
      }
      
      [data-theme="dark"] .teams-radio-button {
        background: #2d3548;
        color: #e4e4e7;
        border-color: #374151;
      }
      
      [data-theme="dark"] .teams-radio-button:hover {
        background: #3d4463;
        border-color: #667eea;
      }
      
      [data-theme="dark"] .teams-radio-button.selected {
        border-color: #667eea;
        color: white;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        box-shadow: 0 0 15px rgba(102, 126, 234, 0.6);
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
      
      .teams-auto-info {
        font-size: 12px;
        color: #666;
        font-style: italic;
        margin-top: 5px;
      }
      
      [data-theme="dark"] .teams-auto-info {
        color: #9ca3af;
      }
      
      /* Document Annotation Popover */
      #doc-annotation-popover {
        position: fixed;
        background: transparent;
        border: none;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        padding: 0;
        z-index: 1000000;
        display: none;
        min-width: 500px;
        max-width: 600px;
      }
      
      .doc-annotation-popover-inner {
        background: white;
        border: 2px solid #667eea;
        border-radius: 12px;
        padding: 20px;
      }
      
      [data-theme="dark"] .doc-annotation-popover-inner {
        background: #2d3548 !important;
        border-color: #667eea;
      }
      
      #doc-annotation-popover.visible {
        display: block;
      }
      
      .doc-annotation-popover-header {
        font-size: 16px;
        font-weight: 600;
        color: #333;
        margin-bottom: 15px;
        border-bottom: 2px solid #e2e8f0;
        padding-bottom: 10px;
      }
      
      .doc-annotation-popover-section {
        margin-bottom: 15px;
      }
      
      .doc-annotation-popover-section label {
        display: block;
        font-weight: 600;
        color: #333;
        margin-bottom: 8px;
        font-size: 13px;
      }
      
      .doc-annotation-comment-input {
        width: 100%;
        padding: 8px 12px;
        border: 2px solid #e2e8f0;
        border-radius: 6px;
        font-size: 14px;
        box-sizing: border-box;
        background: white;
        color: #1a202c;
      }
      
      .doc-annotation-comment-input:focus {
        outline: none;
        border-color: #667eea;
      }
      
      .doc-annotation-selected-text {
        width: 100%;
        padding: 12px;
        border: 2px solid #667eea;
        border-radius: 6px;
        font-size: 14px;
        line-height: 1.6;
        box-sizing: border-box;
        background: #f8f9fa;
        color: #1a202c;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        resize: vertical;
        min-height: 80px;
      }
      
      .doc-annotation-radio-section {
        margin-top: 15px;
        padding-top: 15px;
        border-top: 2px solid #e2e8f0;
      }
      
      .doc-annotation-radio-section label {
        margin-bottom: 12px;
      }
      
      .doc-annotation-radio-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 10px;
      }
      
      .doc-annotation-radio-button {
        padding: 15px 10px;
        border: 3px solid #e2e8f0;
        border-radius: 8px;
        text-align: center;
        cursor: pointer;
        transition: all 0.2s;
        font-weight: 600;
        color: #333;
        background: #f8f9fa;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .doc-annotation-radio-button:hover {
        border-color: #667eea;
        background: #f0f4ff;
      }
      
      .doc-annotation-radio-button.selected {
        border-color: #667eea;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        box-shadow: 0 0 15px rgba(102, 126, 234, 0.5);
      }
      
      .doc-annotation-radio-button.doc-add-new {
        border-color: #28a745;
        color: #28a745;
        font-weight: 700;
      }
      
      .doc-annotation-radio-button.doc-add-new:hover {
        background: #e8f5e9;
        border-color: #28a745;
      }
      
      .doc-annotation-radio-name {
        flex: 1;
      }
      
      .doc-annotation-radio-delete {
        margin-left: 8px;
        font-size: 20px;
        font-weight: 700;
        color: #dc3545;
        cursor: pointer;
        padding: 0 4px;
        border-radius: 4px;
      }
      
      .doc-annotation-radio-delete:hover {
        background: #ffebee;
      }
      
      .doc-annotation-popover-buttons {
        display: flex;
        gap: 10px;
        margin-top: 15px;
      }
      
      .doc-annotation-popover-button {
        flex: 1;
        padding: 10px;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .doc-annotation-popover-button.primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }
      
      .doc-annotation-popover-button.primary:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
      }
      
      .doc-annotation-popover-button.secondary {
        background: #6c757d;
        color: white;
      }
      
      .doc-annotation-popover-button.secondary:hover {
        background: #5a6268;
      }
      
      [data-theme="dark"] .doc-annotation-popover-header {
        color: #f3f4f6;
        border-bottom-color: #4b5563;
      }
      
      [data-theme="dark"] .doc-annotation-popover-section label {
        color: #f3f4f6;
      }
      
      [data-theme="dark"] .doc-annotation-popover-section small {
        color: #9ca3af;
      }
      
      [data-theme="dark"] .doc-annotation-comment-input {
        background-color: #2d3548;
        color: #f3f4f6;
        border-color: #374151;
      }
      
      [data-theme="dark"] .doc-annotation-selected-text {
        background-color: #1e293b;
        color: #f3f4f6;
        border-color: #667eea;
      }
      
      [data-theme="dark"] .doc-annotation-radio-button {
        background: #2d3548;
        color: #e4e4e7;
        border-color: #374151;
      }
      
      [data-theme="dark"] .doc-annotation-radio-button:hover {
        background: #3d4463;
        border-color: #667eea;
      }
      
      [data-theme="dark"] .doc-annotation-radio-button.selected {
        border-color: #667eea;
        color: white;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        box-shadow: 0 0 15px rgba(102, 126, 234, 0.6);
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
          <div style="display: flex; gap: 10px; align-items: center;">
            <button class="deepgram-edit-btn" onclick="window.clearAllState()" title="Reset all state flags" style="font-size: 11px; padding: 3px 8px;">🔄 Reset</button>
            <button class="deepgram-close" onclick="document.getElementById('deepgram-panel').classList.remove('open')">×</button>
          </div>
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
          </label>
          
          <!-- Keyboard Event Indicators -->
          <div id="keyboard-indicators">
            <div class="keyboard-bell space" title="Space" id="bell-space"></div>
            <div class="keyboard-bell ctrl-space" title="Shift+Space" id="bell-ctrl-space"></div>
            <div class="keyboard-bell ultimate" title="Ctrl+Shift+Enter" id="bell-ultimate"></div>
            <div class="keyboard-bell ultimate-ultimate" title="Ctrl+Alt+Shift+Enter" id="bell-ultimate-ultimate"></div>
          </div>
          
          <!-- Paragraph Warning (hidden by default) -->
          <div id="paragraph-warning" style="display: none; background: #ff4444; color: white; padding: 6px 10px; border-radius: 6px; font-size: 12px; margin-bottom: 8px; text-align: center; font-weight: 600;">
            ⚠️ Paragraph already queued
          </div>
          
          <label style="margin-top: 0;">
            <div style="display: flex; gap: 8px; align-items: center;">
              <button class="deepgram-collapse-btn" id="deepgram-darkmode-btn" onclick="window.toggleDarkMode()" title="Toggle dark mode">🌙 Dark</button>
              <label style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: #666;">
                <span>Copy timer (s):</span>
                <input type="number" id="deepgram-autoclipboard-input" min="0" max="300" step="1" value="0" style="width: 50px; padding: 2px 4px; border: 1px solid #cbd5e0; border-radius: 4px; font-size: 11px;" title="Auto-copy to clipboard every N seconds (0 = disabled)" />
              </label>
              <button class="deepgram-collapse-btn" id="deepgram-autoscroll-btn" onclick="window.toggleAutoScroll()" title="Toggle auto-scroll when transcribing">Auto-Scroll: ON</button>
              <label style="display: flex; align-items: center; gap: 4px; font-size: 9px; color: #666;" title="Chat message max width">
                <span>Chat:</span>
                <input type="number" id="layout-chat-width-input" min="800" max="2000" step="50" value="1200" style="width: 55px; padding: 2px 4px; border: 1px solid #cbd5e0; border-radius: 4px; font-size: 9px;" />
              </label>
              <label style="display: flex; align-items: center; gap: 4px; font-size: 9px; color: #666;" title="Chat left margin">
                <span>Margin:</span>
                <input type="number" id="layout-chat-margin-input" min="0" max="1000" step="20" value="640" style="width: 55px; padding: 2px 4px; border: 1px solid #cbd5e0; border-radius: 4px; font-size: 9px;" />
              </label>
              <label style="display: flex; align-items: center; gap: 4px; font-size: 9px; color: #666;" title="Sidebar total width">
                <span>Sidebar:</span>
                <input type="number" id="layout-sidebar-width-input" min="300" max="1000" step="50" value="800" style="width: 55px; padding: 2px 4px; border: 1px solid #cbd5e0; border-radius: 4px; font-size: 9px;" />
              </label>
              <label style="display: flex; align-items: center; gap: 4px; font-size: 9px; color: #666;" title="Widget panel width">
                <span>Widget W:</span>
                <input type="number" id="widget-width-input" min="600" max="2000" step="50" value="1155" style="width: 60px; padding: 2px 4px; border: 1px solid #cbd5e0; border-radius: 4px; font-size: 9px;" />
              </label>
              <label style="display: flex; align-items: center; gap: 4px; font-size: 9px; color: #666;" title="Transcript textarea height">
                <span>Text H:</span>
                <input type="number" id="transcript-height-input" min="150" max="800" step="50" value="480" style="width: 55px; padding: 2px 4px; border: 1px solid #cbd5e0; border-radius: 4px; font-size: 9px;" />
              </label>
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
          <button id="deepgram-send-btn" class="deepgram-btn deepgram-btn-send" disabled>
            ⚡ Send
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
            <strong>ESC: Cancel recording (audio NOT submitted)</strong><br>
            ArrowDown: Add paragraph break (queues if chunks pending, immediate otherwise)<br>
            Ctrl+Shift+Enter: ULTIMATE - Stop recording (if active) + Insert to Chat<br>
            Ctrl+Alt+Shift+Enter: ULTIMATE ULTIMATE - Stop recording (if active) + Insert & Submit<br>
            Ctrl+Shift+M: Insert Teams Message Break (popover)<br>
            <br>
            <strong>🎮 Philips SpeechOne Remote Control:</strong><br>
            Shift+F3: Toggle recording ✅<br>
            Shift+F5: Add paragraph break<br>
            Shift+F6: Cancel recording<br>
            Shift+F11: ULTIMATE ULTIMATE - Insert & Submit ✅<br>
            <em>(Map remote buttons to these shortcuts in SpeechControl - F5/F6 avoid browser conflicts)</em><br>
            <br>
            <strong>Teams Message Annotation:</strong>
            Use Ctrl+Shift+M to insert speaker/date delimiters for bulk Teams messages. Configure active speakers in popover (persists across sessions). Auto-toggles between 2 speakers.<br>
            <br>
            <strong>Paste Support:</strong>
            <em>Paste MD:</em> Copy formatted text (bullets, bold, italic) from TypingMind → converts to plain text with ASCII formatting (-, **, *)<br>
            <em>Paste Email:</em> Copy email content from Gmail → normalizes excessive paragraph spacing<br>
            <br>
            <strong>Auto-Clipboard:</strong>
            Timer (default 60s) automatically copies transcript to clipboard. Resets on any edit (bounce effect) to prevent overwriting while you're working.
          </div>
        </details>
        </div>
      </div>
      
      <div id="deepgram-resize-handle"></div>
      
      <div id="deepgram-filler"></div>
    `;
    
    // Create Teams message popover
    const teamsPopover = document.createElement('div');
    teamsPopover.id = 'teams-message-popover';
    teamsPopover.innerHTML = `
      <div class="teams-popover-inner">
      <div class="teams-popover-header">
        Insert Teams Message Break
        <div class="teams-auto-info" id="teams-auto-info"></div>
      </div>
      
      <div class="teams-popover-section">
        <label>Date:</label>
        <input type="text" id="teams-date-input" class="teams-date-input" placeholder="e.g., 2025-11-07" />
      </div>
      
      <div class="teams-popover-section">
        <label>Comment (optional):</label>
        <textarea id="teams-comment-input" class="teams-date-input" rows="3" placeholder="Optional annotation for this message..."></textarea>
        <small style="font-size: 11px; color: #999;">Brief note about this message (always starts empty)</small>
      </div>
      
      <div class="teams-popover-section">
        <label>Active Speakers (check to enable):</label>
        <div class="teams-speakers-grid" id="teams-speakers-grid">
          <!-- Will be populated by JavaScript -->
        </div>
      </div>
      
      <div class="teams-radio-section">
        <label>Select Speaker for This Message:</label>
        <div class="teams-radio-grid" id="teams-radio-grid">
          <!-- Will be populated by JavaScript based on active speakers -->
        </div>
      </div>
      
      <div class="teams-popover-buttons">
        <button class="teams-popover-button primary" id="teams-insert-break-btn">Insert Break</button>
        <button class="teams-popover-button secondary" id="teams-cancel-btn">Cancel</button>
      </div>
      </div>
    `;
    
    // Create Document Annotation popover
    const docAnnotationPopover = document.createElement('div');
    docAnnotationPopover.id = 'doc-annotation-popover';
    docAnnotationPopover.innerHTML = `
      <div class="doc-annotation-popover-inner">
      <div class="doc-annotation-popover-header">
        Document Edit Annotation
      </div>
      
      <div class="doc-annotation-popover-section">
        <label>Selected Text:</label>
        <textarea id="doc-annotation-selected-text" class="doc-annotation-selected-text" readonly rows="4" placeholder="(No text selected)"></textarea>
      </div>
      
      <div class="doc-annotation-popover-section">
        <label>Annotation Type:</label>
        <div class="doc-annotation-radio-grid" id="doc-annotation-types-grid">
          <!-- Will be populated by JavaScript -->
        </div>
      </div>
      
      <div class="doc-annotation-popover-section">
        <label>Person:</label>
        <div class="doc-annotation-radio-grid" id="doc-annotation-people-grid">
          <!-- Will be populated by JavaScript (shares Teams speaker list) -->
        </div>
      </div>
      
      <div class="doc-annotation-popover-section">
        <label>Comment (optional):</label>
        <input type="text" id="doc-annotation-comment-input" class="doc-annotation-comment-input" placeholder="Optional comment..." />
        <small style="font-size: 11px; color: #999;">Added as attribute in XML tag</small>
      </div>
      
      <div class="doc-annotation-popover-buttons">
        <button class="doc-annotation-popover-button primary" id="doc-annotation-insert-btn">Insert Annotation</button>
        <button class="doc-annotation-popover-button secondary" id="doc-annotation-cancel-btn">Cancel</button>
      </div>
      </div>
    `;
    
    document.body.appendChild(toggleBtn);
    document.body.appendChild(panel);
    document.body.appendChild(teamsPopover);
    document.body.appendChild(docAnnotationPopover);
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
    } else {
      // Default to 60 seconds if not set
      autoClipboardDelay = 60;
      document.getElementById('deepgram-autoclipboard-input').value = 60;
      localStorage.setItem(CONFIG.AUTOCLIPBOARD_DELAY_STORAGE, '60');
      startAutoClipboard();
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
    
    // Load saved layout widths
    const savedChatWidth = localStorage.getItem(CONFIG.LAYOUT_CHAT_WIDTH_STORAGE);
    const savedChatMargin = localStorage.getItem(CONFIG.LAYOUT_CHAT_MARGIN_STORAGE);
    const savedSidebarWidth = localStorage.getItem(CONFIG.LAYOUT_SIDEBAR_WIDTH_STORAGE);
    
    if (savedChatWidth) {
      document.getElementById('layout-chat-width-input').value = savedChatWidth;
    }
    if (savedChatMargin) {
      document.getElementById('layout-chat-margin-input').value = savedChatMargin;
    }
    if (savedSidebarWidth) {
      document.getElementById('layout-sidebar-width-input').value = savedSidebarWidth;
    }
    
    // Load saved widget dimensions
    const savedWidgetWidth = localStorage.getItem(CONFIG.WIDGET_WIDTH_STORAGE);
    const savedTranscriptHeight = localStorage.getItem(CONFIG.TRANSCRIPT_HEIGHT_STORAGE);
    
    if (savedWidgetWidth) {
      document.getElementById('widget-width-input').value = savedWidgetWidth;
    }
    if (savedTranscriptHeight) {
      document.getElementById('transcript-height-input').value = savedTranscriptHeight;
    }
    
    // Apply layout widths immediately on page load
    setTimeout(() => {
      applyLayoutWidths();
      applyWidgetWidth();
      applyTranscriptHeight();
    }, 500);
    
    // Attach event listeners
    document.getElementById('deepgram-api-input').addEventListener('change', saveApiKey);
    document.getElementById('deepgram-keyterms-input').addEventListener('input', debounce(saveKeyterms, 1000));
    document.getElementById('deepgram-record-btn').addEventListener('click', () => {
      console.log(ts(), '🖱️ RECORD BUTTON CLICKED (mouse or programmatic)');
      toggleRecording();
    });
    document.getElementById('deepgram-insert-btn').addEventListener('click', insertToChat);
    document.getElementById('deepgram-send-btn').addEventListener('click', insertAndSubmit);
    document.getElementById('deepgram-copy-btn').addEventListener('click', copyTranscript);
    document.getElementById('deepgram-paste-btn').addEventListener('click', pasteMarkdown);
    document.getElementById('deepgram-paste-email-btn').addEventListener('click', pasteEmail);
    document.getElementById('deepgram-clear-btn').addEventListener('click', clearTranscript);
    
    // Make cancel functions globally accessible (for debugging)
    window.cancelWhisperRecording = cancelWhisperRecording;
    window.cancelDeepgramRecording = cancelDeepgramRecording;
    
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
  
  // Reset auto-clipboard timer on any edit (bounce effect)
  document.getElementById('deepgram-transcript').addEventListener('input', resetAutoClipboardTimer);
    
    // Auto-clipboard timer input
    document.getElementById('deepgram-autoclipboard-input').addEventListener('change', onAutoClipboardDelayChange);
    
    // Layout width controls
    document.getElementById('layout-chat-width-input')?.addEventListener('change', onLayoutWidthChange);
    document.getElementById('layout-chat-margin-input')?.addEventListener('change', onLayoutWidthChange);
    document.getElementById('layout-sidebar-width-input')?.addEventListener('change', onLayoutWidthChange);
    
    // Widget dimension controls
    document.getElementById('widget-width-input')?.addEventListener('change', onWidgetWidthChange);
    document.getElementById('transcript-height-input')?.addEventListener('change', onTranscriptHeightChange);
    
    // Initialize resize functionality
    initializeResize();
    
    // Display version number
    document.getElementById('deepgram-version').textContent = `v${CONFIG.VERSION}`;
    
    // Update UI based on current mode
    updateModeUI();
    
    // Initialize Teams message break feature
    initializeTeamsMessageBreak();
    
    // Initialize Document Annotation feature
    initializeDocAnnotation();
    
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
    window.clearAllState = clearAllState;
    window.showParagraphWarning = showParagraphWarning;
    // Cancel functions (already exposed above for debugging, but also here for completeness)
    window.cancelWhisperRecording = cancelWhisperRecording;
    window.cancelDeepgramRecording = cancelDeepgramRecording;
    
    console.log('✓ Widget initialized');
    console.log('📌 Version:', CONFIG.VERSION);
    console.log('📌 Mode:', transcriptionMode);
    
    // Watch for sidebar view changes and reapply layout widths
    initializeSidebarWatcher();
  }
  
  // ==================== SIDEBAR VIEW WATCHER ====================
  function initializeSidebarWatcher() {
    // Watch for changes to sidebar content (detect view switches)
    const targetNode = document.body;
    
    const observer = new MutationObserver((mutations) => {
      // Debounce - only check once per batch of mutations
      clearTimeout(observer.debounceTimer);
      observer.debounceTimer = setTimeout(() => {
        // Reapply layout widths (will apply or remove sidebar CSS based on Chat view active)
        applyLayoutWidths();
      }, 100);
    });
    
    observer.observe(targetNode, {
      childList: true,
      subtree: true,
      attributes: false // Don't watch attributes to reduce noise
    });
    
    console.log('✓ Sidebar view watcher initialized');
  }
  
  // ==================== PARAGRAPH WARNING ====================
  function showParagraphWarning() {
    const warning = document.getElementById('paragraph-warning');
    if (warning) {
      warning.style.display = 'block';
      
      setTimeout(() => {
        warning.style.display = 'none';
      }, 1000);
    }
  }
  
  // ==================== KEYBOARD INDICATOR BELLS ====================
  function flashBell(bellId) {
    const bell = document.getElementById(bellId);
    if (!bell) return;
    
    bell.classList.add('flash');
    setTimeout(() => {
      bell.classList.remove('flash');
    }, 250);
  }
  
  // ==================== CLEAR STATE ====================
  function clearAllState() {
    pendingParagraphBreak = false;
    pendingInsert = false;
    pendingInsertAndSubmit = false;
    
    console.log('🔄 All state flags cleared');
    console.log('  pendingParagraphBreak:', pendingParagraphBreak);
    console.log('  pendingInsert:', pendingInsert);
    console.log('  pendingInsertAndSubmit:', pendingInsertAndSubmit);
    
    // Visual feedback
    const statusEl = document.getElementById('deepgram-status');
    if (statusEl) {
      const originalBg = statusEl.style.background;
      statusEl.style.background = '#ffc107';
      setTimeout(() => {
        statusEl.style.background = originalBg;
      }, 500);
    }
  }
  
  // ==================== UTILITY FUNCTIONS ====================
  function togglePanel() {
    const panel = document.getElementById('deepgram-panel');
    panel.classList.toggle('open');
    isPanelOpen = panel.classList.contains('open');
  }
  
  // ==================== LAYOUT WIDTH CONTROLS ====================
  
  function applyLayoutWidths() {
    const chatWidth = parseInt(document.getElementById('layout-chat-width-input')?.value) || CONFIG.DEFAULT_CHAT_WIDTH;
    const chatMargin = parseInt(document.getElementById('layout-chat-margin-input')?.value) || CONFIG.DEFAULT_CHAT_MARGIN;
    const sidebarWidth = parseInt(document.getElementById('layout-sidebar-width-input')?.value) || CONFIG.DEFAULT_SIDEBAR_WIDTH;
    
    // Remove old layout styles if they exist
    const oldStyle = document.getElementById('typingmind-layout-styles');
    if (oldStyle) {
      oldStyle.remove();
    }
    
    // Inject new layout styles
    const layoutStyle = document.createElement('style');
    layoutStyle.id = 'typingmind-layout-styles';
    layoutStyle.textContent = `
      /* CONTROL 1: Chat message width */
      .response-block {
        max-width: ${chatWidth}px !important;
        margin-left: ${chatMargin}px !important;
        margin-right: auto !important;
      }

      /* CONTROL 2: Tool-call popup modal width (align with chat width & margin, with global left shift) */
      [data-element-id="pop-up-modal"] {
        max-width: ${chatWidth}px !important;
        width: 100% !important;
        margin-left: ${chatMargin - 375}px !important;
        margin-right: auto !important;
      }
    `;
    document.head.appendChild(layoutStyle);
    
    // Chat input box alignment (bottom text entry) - use JavaScript walking approach
    // Retry logic since textarea might not exist immediately on page load
    function alignChatInput() {
      const textarea = document.getElementById('chat-input-textbox');
      if (textarea) {
        let container = textarea;
        while (container && !container.classList.contains('mx-auto')) {
          container = container.parentElement;
        }
        if (container) {
          container.style.maxWidth = chatWidth + 'px';
          container.style.marginLeft = chatMargin + 'px';
          container.style.marginRight = 'auto';
          return true;  // Success
        }
      }
      return false;  // Not found yet
    }
    
    // Try immediately, retry after 1 second if not found
    if (!alignChatInput()) {
      setTimeout(alignChatInput, 1000);
    }
    
    // Apply sidebar width ONLY when Chat view is active (sidebar-middle-part exists)
    const sidebarContent = document.querySelector('[data-element-id="sidebar-middle-part"]');
    if (sidebarContent) {
      // Chat view active - apply sidebar width customizations
      document.documentElement.style.setProperty('--sidebar-width', sidebarWidth + 'px');
      document.documentElement.style.setProperty('--workspace-width', '0px');
      
      const navContainer = document.querySelector('[data-element-id="nav-container"]');
      if (navContainer) {
        navContainer.style.width = sidebarWidth + 'px';
      }
      
      // Widen sidebar inner content
      const contentDiv = sidebarContent.querySelector('div > div > div > div');
      if (contentDiv) {
        const innerWidth = sidebarWidth - 20; // 20px padding
        contentDiv.style.minWidth = 'auto';
        contentDiv.style.maxWidth = innerWidth + 'px';
        contentDiv.style.width = innerWidth + 'px';
      }
      
      // Widen projects container
      const projectsContainer = document.querySelector('[data-element-id="sidebar-middle-part"] .p-2.space-y-2');
      if (projectsContainer) {
        const projectsWidth = sidebarWidth - 60; // 60px total padding (prevents icon overflow)
        projectsContainer.style.maxWidth = projectsWidth + 'px';
        projectsContainer.style.width = projectsWidth + 'px';
      }
      
      // console.log('✓ Sidebar widths applied (Chat view active)');
    } else {
      // Chat view NOT active - remove sidebar width overrides to restore default behavior
      document.documentElement.style.removeProperty('--sidebar-width');
      document.documentElement.style.removeProperty('--workspace-width');
      
      const navContainer = document.querySelector('[data-element-id="nav-container"]');
      if (navContainer) {
        navContainer.style.width = '';
      }
      
      // console.log('⊘ Sidebar widths removed (Chat view not active - restoring defaults)');
    }
    
    // console.log('✓ Layout widths applied:', { chatWidth, chatMargin, sidebarWidth });
  }
  
  function applyWidgetWidth() {
    const widgetWidth = parseInt(document.getElementById('widget-width-input')?.value) || CONFIG.DEFAULT_WIDGET_WIDTH;
    
    const panel = document.getElementById('deepgram-panel');
    if (panel) {
      panel.style.width = widgetWidth + 'px';
    }
    
    console.log('✓ Widget width applied:', widgetWidth);
  }
  
  function onWidgetWidthChange() {
    const widgetWidth = parseInt(document.getElementById('widget-width-input')?.value) || CONFIG.DEFAULT_WIDGET_WIDTH;
    
    // Save to localStorage
    localStorage.setItem(CONFIG.WIDGET_WIDTH_STORAGE, widgetWidth);
    
    // Apply changes immediately
    applyWidgetWidth();
  }
  
  function applyTranscriptHeight() {
    const transcriptHeight = parseInt(document.getElementById('transcript-height-input')?.value) || CONFIG.DEFAULT_TRANSCRIPT_HEIGHT;
    
    const transcript = document.getElementById('deepgram-transcript');
    if (transcript) {
      transcript.style.height = transcriptHeight + 'px';
    }
    
    console.log('✓ Transcript height applied:', transcriptHeight);
  }
  
  function onTranscriptHeightChange() {
    const transcriptHeight = parseInt(document.getElementById('transcript-height-input')?.value) || CONFIG.DEFAULT_TRANSCRIPT_HEIGHT;
    
    // Save to localStorage
    localStorage.setItem(CONFIG.TRANSCRIPT_HEIGHT_STORAGE, transcriptHeight);
    
    // Apply changes immediately
    applyTranscriptHeight();
  }
  
  function onLayoutWidthChange() {
    const chatWidth = parseInt(document.getElementById('layout-chat-width-input')?.value) || CONFIG.DEFAULT_CHAT_WIDTH;
    const chatMargin = parseInt(document.getElementById('layout-chat-margin-input')?.value) || CONFIG.DEFAULT_CHAT_MARGIN;
    const sidebarWidth = parseInt(document.getElementById('layout-sidebar-width-input')?.value) || CONFIG.DEFAULT_SIDEBAR_WIDTH;
    
    // Save to localStorage
    localStorage.setItem(CONFIG.LAYOUT_CHAT_WIDTH_STORAGE, chatWidth);
    localStorage.setItem(CONFIG.LAYOUT_CHAT_MARGIN_STORAGE, chatMargin);
    localStorage.setItem(CONFIG.LAYOUT_SIDEBAR_WIDTH_STORAGE, sidebarWidth);
    
    // Apply changes immediately
    applyLayoutWidths();
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
    const sendBtn = document.getElementById('deepgram-send-btn');
    const copyBtn = document.getElementById('deepgram-copy-btn');
    
    // Enable if there's any text, disable if empty
    insertBtn.disabled = !transcript;
    sendBtn.disabled = !transcript;
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
  
  function cancelDeepgramRecording() {
    // Stop the flash immediately
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
    updateStatus('🚫 Recording canceled', 'disconnected');
    isRecording = false;
    updateRecordButton(false);
    document.getElementById('deepgram-toggle').classList.remove('recording');
    
    // Close WebSocket immediately WITHOUT sending Finalize (discard audio)
    if (deepgramSocket && deepgramSocket.readyState === 1) {
      deepgramSocket.close();
      console.log('🚫 WebSocket closed (audio discarded)');
    }
    
    // Stop microphone immediately
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
      console.log('🎤 Microphone stopped');
    }
    
    // Reset status after brief delay
    setTimeout(() => {
      updateStatus('Ready to Record', 'disconnected');
    }, 2000);
    
    console.log(ts(), '🚫 Deepgram recording CANCELED (audio not submitted)');
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
      
      console.log(ts(), '🎰 Microphone access granted (Whisper mode)');
      
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
        // Check if recording was canceled (ESC key)
        if (window.__whisperRecordingCanceled) {
          console.log(ts(), '🚫 Stop event: Recording was canceled - NOT submitting audio');
          window.__whisperRecordingCanceled = false; // Reset flag
          return; // Don't submit
        }
        
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
      
      console.log(ts(), '✅ Whisper recording started');
      
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
      
      console.log(ts(), '⏹️ Whisper recording stopped');
    }
  }
  
  function cancelWhisperRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      // Clear audio chunks FIRST
      audioChunks = [];
      
      // Remove ALL event listeners to prevent 'stop' event from submitting
      const oldRecorder = mediaRecorder;
      mediaRecorder = null; // Clear global reference
      
      // Clone the recorder to strip event listeners (nuclear option)
      // Actually, we can't clone MediaRecorder, so instead:
      // Set a flag that the 'stop' handler will check
      window.__whisperRecordingCanceled = true;
      
      oldRecorder.stop();
      oldRecorder.stream.getTracks().forEach(track => track.stop());
      
      isRecording = false;
      
      updateStatus('🚫 Recording canceled', 'disconnected');
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
      
      // Reset status after brief delay
      setTimeout(() => {
        updateStatus('Ready to Record', 'disconnected');
      }, 2000);
      
      console.log(ts(), '🚫 Whisper recording CANCELED (audio not submitted)');
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
        // Check if recording was canceled (ESC key)
        if (window.__whisperRecordingCanceled) {
          console.log(ts(), '🚫 Stop event (segment): Recording was canceled - NOT submitting audio');
          window.__whisperRecordingCanceled = false; // Reset flag
          return; // Don't submit
        }
        
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
      
      console.log(ts(), `📤 Sending chunk to Whisper (${audioBlob.size} bytes, endpoint: ${endpoint})`);
      
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
      
      console.log(ts(), '📥 Response status:', response.status);
      console.log('📥 Response headers:', [...response.headers.entries()]);
      
      const responseText = await response.text();
      console.log('📥 Raw response body:', responseText);
      
      const result = JSON.parse(responseText);
      console.log('📥 Parsed JSON:', result);
      
      const transcription = result.text;
      console.log('📥 Extracted transcription:', transcription);
      
      console.log(ts(), '✅ Transcription received:', transcription);
      
      // Append to transcript
      appendTranscript(transcription);
      
      // Check if paragraph break was queued
      if (pendingParagraphBreak) {
        addParagraphBreak();
        pendingParagraphBreak = false;
        console.log('✅ Queued paragraph break inserted');
      }
      
      // Ensure buttons are enabled
      updateInsertButtonState();
      
    } catch (error) {
      console.error('❌ Whisper API error:', error);
      updateStatus(`Error: ${error.message}`, 'disconnected');
      alert(`Whisper transcription failed: ${error.message}`);
    } finally {
      console.log(ts(), '📊 sendToWhisper finally block START');
      console.log('  pendingTranscriptions BEFORE decrement:', pendingTranscriptions);
      console.log('  pendingInsert:', pendingInsert);
      console.log('  pendingInsertAndSubmit:', pendingInsertAndSubmit);
      console.log('  pendingParagraphBreak:', pendingParagraphBreak);
      
      // Decrement pending counter
      pendingTranscriptions--;
      
      console.log('  pendingTranscriptions AFTER decrement:', pendingTranscriptions);
      
      updateQueueStatus();
      
      // Update status if no more pending
      if (pendingTranscriptions === 0 && !isRecording) {
        updateStatus('Ready to Record', 'disconnected');
        console.log('✅ All chunks complete - status updated');
      }
      
      // Check if insert/submit was queued (execute when ALL chunks complete)
      if (pendingTranscriptions === 0) {
        console.log('✅ All chunks complete - checking for queued actions...');
        
        if (pendingInsertAndSubmit) {
          console.log('🎯 Executing queued insertAndSubmit');
          setTimeout(() => {
            insertAndSubmit();
            pendingInsertAndSubmit = false;
            console.log('✅ Queued Insert+Submit EXECUTED');
          }, 100); // Brief delay to ensure UI updates complete
        } else if (pendingInsert) {
          console.log('🎯 Executing queued insertToChat');
          setTimeout(() => {
            insertToChat();
            pendingInsert = false;
            console.log('✅ Queued Insert EXECUTED');
          }, 100);
        } else {
          console.log('⚪ No queued insert/submit actions');
        }
      } else {
        console.log('⏳ Chunks still pending:', pendingTranscriptions);
      }
      
      console.log(ts(), '📊 sendToWhisper finally block END');
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
    console.log(ts(), '✅ Whisper flash started (continuous while recording)');
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
    
    console.log(ts(), '⏹️ Whisper flash stopped');
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
    
    console.log(ts(), '⏱️ Recording duration warning started');
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
    
    console.log(ts(), '⏹️ Recording duration warning stopped');
  }
  
  // ==================== END WHISPER FUNCTIONS ====================
  
  // ==================== CLICK BAR ====================
  
  function clickBarAction() {
    const transcriptEl = document.getElementById('deepgram-transcript');
    const currentText = transcriptEl.value;

    // GUARD: Don't add a paragraph break if one already exists at the end
    if (currentText.endsWith('\n\n') || currentText.trim() === '') {
      console.log('⚪️ clickBarAction: Paragraph break already exists or content is empty. No action taken.');
      // Optional: Add a visual indicator that it was ignored, e.g., flash the bar red
      const clickBar = document.getElementById('deepgram-click-bar');
      if (clickBar) {
        const originalBg = clickBar.style.background;
        clickBar.style.background = 'linear-gradient(to bottom, #f8d7da 0%, #f5c6cb 100%)';
        setTimeout(() => {
          clickBar.style.background = originalBg;
        }, 400);
      }
      return;
    }

    if (pendingTranscriptions > 0) {
      // Chunk pending - queue the paragraph break
      if (pendingParagraphBreak) {
        showParagraphWarning();
        console.log('⚠️ Paragraph break already queued - double-click detected');
      } else {
        pendingParagraphBreak = true;
        console.log('⏳ Paragraph break queued');
      }
      
      // Visual feedback - flash the click bar green
      const clickBar = document.getElementById('deepgram-click-bar');
      if (clickBar) {
        const originalBg = clickBar.style.background;
        clickBar.style.background = 'linear-gradient(to bottom, #d4edda 0%, #c3e6cb 100%)';
        setTimeout(() => {
          clickBar.style.background = originalBg;
        }, 400);
      }
    } else {
      // No pending chunks - add paragraph immediately
      addParagraphBreak();
    }
  }
  
  function setPendingParagraphFlag() {
    console.log(ts(), '🏴 setPendingParagraphFlag called');
    console.log('  pendingParagraphBreak BEFORE:', pendingParagraphBreak);
    
    if (pendingParagraphBreak) {
      showParagraphWarning();
      console.log(ts(), '⚠️ Pending paragraph flag already set - warning shown');
    }
    
    pendingParagraphBreak = true;
    console.log('  pendingParagraphBreak AFTER:', pendingParagraphBreak);
  }
  
  function insertNewlineAtEnd() {
    console.log(ts(), '📝 insertNewlineAtEnd called');
    const transcriptEl = document.getElementById('deepgram-transcript');
    const currentText = transcriptEl.value;
    
    // Check if already ends with \n\n
    if (!currentText.endsWith('\n\n')) {
      transcriptEl.value += '\n\n';
      console.log(ts(), '✅ Newline appended at end');
    } else {
      console.log(ts(), '⚪ Text already ends with newline - skipped');
    }
    
    // Clear pending flag (just in case)
    pendingParagraphBreak = false;
    
    // Move cursor to end and scroll
    const endPosition = transcriptEl.value.length;
    transcriptEl.setSelectionRange(endPosition, endPosition);
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
  }
  
  function addParagraphBreak() {
    const transcriptEl = document.getElementById('deepgram-transcript');
    
    // Move cursor to end
    const endPosition = transcriptEl.value.length;
    transcriptEl.setSelectionRange(endPosition, endPosition);
    
    // Add two newlines (paragraph break)
    transcriptEl.value += '\n\n';
    
    // Update cursor position after newlines
    const newPosition = transcriptEl.value.length;
    transcriptEl.setSelectionRange(newPosition, newPosition);
    
    // FOCUS to show cursor (visual feedback)
    transcriptEl.focus();
    
    // Scroll to bottom
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
    
    // Immediately blur to return focus for Spacebar toggle
    transcriptEl.blur();
    
    console.log(ts(), '✅ Paragraph break added');
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
    // Reset click bar background in case it was left in a warning state
    const clickBar = document.getElementById('deepgram-click-bar');
    if (clickBar) {
      clickBar.style.background = ''; // Resets to CSS default
    }
    // If Doc Annotation popup is visible, append to comment field instead
    if (docAnnotationPopoverVisible) {
      const commentField = document.getElementById('doc-annotation-comment-input');
      if (commentField) {
        const currentComment = commentField.value;
        commentField.value = currentComment ? currentComment + ' ' + text : text;
        
        // Scroll to end to show newly appended text
        commentField.scrollLeft = commentField.scrollWidth;
        
        // Also set cursor to end
        commentField.setSelectionRange(commentField.value.length, commentField.value.length);
        
        return; // Don't append to main transcript
      }
    }
    
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
      
      // console.log('✓ Auto-clipboard timer started:', autoClipboardDelay, 'seconds');
    }
  }
  
  function stopAutoClipboard() {
    if (autoClipboardTimer) {
      clearInterval(autoClipboardTimer);
      autoClipboardTimer = null;
      // console.log('✓ Auto-clipboard timer stopped');
    }
  }
  
  function resetAutoClipboardTimer() {
    // Stop existing timer
    stopAutoClipboard();
    
    // Restart with current delay setting (if enabled)
    if (autoClipboardDelay > 0) {
      startAutoClipboard();
      // console.log('🔄 Auto-clipboard timer reset (bounce effect)');
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
  
  function insertAndSubmit() {
    const text = document.getElementById('deepgram-transcript').value.trim();
    if (!text) {
      alert('No transcript to insert!');
      return;
    }
    
    // First, insert to chat
    insertToChat();
    
    // Wait briefly for React/TypingMind to process the insertion
    setTimeout(() => {
      // Find the chat input again
      const selectors = [
        '#chat-input-textbox',
        '[data-element-id="chat-input-textbox"]',
        'textarea[placeholder*="Press"]',
        'textarea.main-chat-input',
        'textarea[placeholder*="Message"]',
        'textarea'
      ];
      
      let chatInput = null;
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          if (element.offsetParent !== null && 
              !element.closest('#deepgram-panel') &&
              !element.id.includes('deepgram')) {
            chatInput = element;
            break;
          }
        }
        if (chatInput) break;
      }
      
      if (chatInput) {
        // Dispatch Ctrl+Enter event to trigger TypingMind submit
        const enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          ctrlKey: true,
          bubbles: true,
          cancelable: true
        });
        
        chatInput.dispatchEvent(enterEvent);
        
        // Also try keyup for good measure
        const enterEventUp = new KeyboardEvent('keyup', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          ctrlKey: true,
          bubbles: true,
          cancelable: true
        });
        
        chatInput.dispatchEvent(enterEventUp);
        
        console.log('✓ Ctrl+Enter event dispatched to chat input');
        
        // Blur chat input after submit so Space key is ready for recording toggle
        setTimeout(() => {
          if (chatInput && document.activeElement === chatInput) {
            chatInput.blur();
            console.log('✓ Chat input blurred after submit - Space key ready for recording toggle');
          }
        }, 500);
        
      } else {
        console.warn('⚠️ Could not find chat input for submit event');
      }
    }, 200); // 200ms delay should be enough for insertion to complete
  }
  
  function insertToChat() {
    const text = document.getElementById('deepgram-transcript').value.trim();
    if (!text) {
      alert('No transcript to insert!');
      return;
    }

    // ALWAYS copy transcript text to clipboard on insert attempt (success or failure)
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => {
          lastCopiedText = text;
          console.log('📋 Transcript copied to clipboard on insertToChat');
        })
        .catch(err => {
          console.error('❌ Clipboard copy on insertToChat failed:', err);
        });
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
        
        // Blur chat input so Space key returns focus for recording toggle
        setTimeout(() => {
          if (chatInput && document.activeElement === chatInput) {
            chatInput.blur();
            console.log('✓ Chat input blurred - Space key ready for recording toggle');
          }
        }, 100);
        
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
      alert('Could not find chat input. Transcript has been copied to your clipboard; please paste it manually into the chat box.');
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
  
  // ==================== TEAMS MESSAGE BREAK ====================
  
  function initializeTeamsMessageBreak() {
    // Load saved settings from localStorage
    const savedSpeakers = localStorage.getItem(CONFIG.TEAMS_SPEAKERS_STORAGE);
    const savedActive = localStorage.getItem(CONFIG.TEAMS_ACTIVE_STORAGE);
    const savedDate = localStorage.getItem(CONFIG.TEAMS_DATE_STORAGE);
    
    // Initialize speaker slots (10 slots)
    const speakersGrid = document.getElementById('teams-speakers-grid');
    for (let i = 0; i < 10; i++) {
      const slot = document.createElement('div');
      slot.className = 'teams-speaker-slot';
      slot.innerHTML = `
        <input type="checkbox" class="teams-speaker-checkbox" id="teams-speaker-check-${i}" data-index="${i}" />
        <select class="teams-speaker-dropdown" id="teams-speaker-dropdown-${i}" data-index="${i}">
          <option value="">Select or add new...</option>
        </select>
      `;
      speakersGrid.appendChild(slot);
      
      // Attach event listeners
      document.getElementById(`teams-speaker-check-${i}`).addEventListener('change', onSpeakerCheckboxChange);
      document.getElementById(`teams-speaker-dropdown-${i}`).addEventListener('change', onSpeakerDropdownChange);
    }
    
    // Populate known speakers in dropdowns
    updateKnownSpeakersList();
    
    // Restore saved speakers (text inputs now)
    if (savedSpeakers) {
      const speakers = JSON.parse(savedSpeakers);
      speakers.forEach((name, i) => {
        if (name) {
          const input = document.getElementById(`teams-speaker-dropdown-${i}`);
          if (input) {
            input.value = name;
          }
        }
      });
    }
    
    // Restore active checkboxes
    if (savedActive) {
      const active = JSON.parse(savedActive);
      active.forEach((isActive, i) => {
        document.getElementById(`teams-speaker-check-${i}`).checked = isActive;
      });
    }
    
    // Restore date
    if (savedDate) {
      document.getElementById('teams-date-input').value = savedDate;
    } else {
      // Default to today's date (YYYY-MM-DD format)
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      document.getElementById('teams-date-input').value = dateStr;
    }
    
    // Update radio buttons based on active speakers
    updateTeamsRadioButtons();
    
    // Attach button event listeners
    document.getElementById('teams-insert-break-btn').addEventListener('click', insertTeamsMessageBreak);
    document.getElementById('teams-cancel-btn').addEventListener('click', hideTeamsPopover);
    
    // Attach keyboard listener for date input (save on change)
    document.getElementById('teams-date-input').addEventListener('change', saveTeamsSettings);
    
    console.log('✓ Teams message break initialized');
  }
  
  function updateKnownSpeakersList() {
    const knownSpeakers = JSON.parse(localStorage.getItem(CONFIG.TEAMS_KNOWN_SPEAKERS_STORAGE) || '[]');
    
    // Update all select dropdowns
    for (let i = 0; i < 10; i++) {
      const select = document.getElementById(`teams-speaker-dropdown-${i}`);
      if (!select) continue;
      
      const currentValue = select.value;
      
      // Clear and rebuild options
      select.innerHTML = '<option value="">Select or add new...</option>';
      
      knownSpeakers.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
      });
      
      // Restore previous value
      if (currentValue && knownSpeakers.includes(currentValue)) {
        select.value = currentValue;
      }
    }
  }
  
  function onSpeakerCheckboxChange(e) {
    saveTeamsSettings();
    updateTeamsRadioButtons();
  }
  
  function onSpeakerDropdownChange(e) {
    // Simple select dropdown - just save and update
    saveTeamsSettings();
    updateTeamsRadioButtons();
  }
  
  function deleteSpeaker(speakerName) {
    if (!confirm(`Delete "${speakerName}" from saved names?`)) {
      return;
    }
    
    const knownSpeakers = JSON.parse(localStorage.getItem(CONFIG.TEAMS_KNOWN_SPEAKERS_STORAGE) || '[]');
    const index = knownSpeakers.indexOf(speakerName);
    
    if (index > -1) {
      knownSpeakers.splice(index, 1);
      localStorage.setItem(CONFIG.TEAMS_KNOWN_SPEAKERS_STORAGE, JSON.stringify(knownSpeakers));
      
      // Update dropdowns and radio buttons
      updateKnownSpeakersList();
      updateTeamsRadioButtons();
      
      console.log('✓ Deleted speaker:', speakerName);
    }
  }
  
  function addNewSpeaker() {
    const newName = prompt('Enter new speaker name:');
    if (!newName || !newName.trim()) {
      return;
    }
    
    const trimmedName = newName.trim();
    const knownSpeakers = JSON.parse(localStorage.getItem(CONFIG.TEAMS_KNOWN_SPEAKERS_STORAGE) || '[]');
    
    if (knownSpeakers.includes(trimmedName)) {
      alert('Speaker already exists!');
      return;
    }
    
    knownSpeakers.push(trimmedName);
    localStorage.setItem(CONFIG.TEAMS_KNOWN_SPEAKERS_STORAGE, JSON.stringify(knownSpeakers));
    
    // Update dropdowns and radio buttons
    updateKnownSpeakersList();
    updateTeamsRadioButtons();
    
    console.log('✓ Added new speaker:', trimmedName);
  }
  
  function saveTeamsSettings() {
    // Save speaker names (from text inputs now, not selects)
    const speakers = [];
    for (let i = 0; i < 10; i++) {
      speakers.push(document.getElementById(`teams-speaker-dropdown-${i}`).value.trim());
    }
    localStorage.setItem(CONFIG.TEAMS_SPEAKERS_STORAGE, JSON.stringify(speakers));
    
    // Save active checkboxes
    const active = [];
    for (let i = 0; i < 10; i++) {
      active.push(document.getElementById(`teams-speaker-check-${i}`).checked);
    }
    localStorage.setItem(CONFIG.TEAMS_ACTIVE_STORAGE, JSON.stringify(active));
    
    // Save date
    const date = document.getElementById('teams-date-input').value;
    localStorage.setItem(CONFIG.TEAMS_DATE_STORAGE, date);
    
    console.log('✓ Teams settings saved');
  }
  
  function updateTeamsRadioButtons() {
    const radioGrid = document.getElementById('teams-radio-grid');
    radioGrid.innerHTML = '';
    
    // Get ALL known speakers (not just active)
    const knownSpeakers = JSON.parse(localStorage.getItem(CONFIG.TEAMS_KNOWN_SPEAKERS_STORAGE) || '[]');
    
    // Get active speakers (checkbox checked)
    const activeSpeakers = [];
    for (let i = 0; i < 10; i++) {
      const checkbox = document.getElementById(`teams-speaker-check-${i}`);
      const select = document.getElementById(`teams-speaker-dropdown-${i}`);
      if (checkbox && checkbox.checked && select && select.value.trim()) {
        activeSpeakers.push({ index: i, name: select.value.trim() });
      }
    }
    
    // Create buttons for ALL known speakers
    knownSpeakers.forEach((name, idx) => {
      const isActive = activeSpeakers.some(s => s.name === name);
      const speakerData = activeSpeakers.find(s => s.name === name);
      
      const radioBtn = document.createElement('div');
      radioBtn.className = 'teams-radio-button';
      if (!isActive) {
        radioBtn.classList.add('inactive'); // Gray out inactive speakers
      }
      
      // Button text: name + delete X
      radioBtn.innerHTML = `
        <span class="teams-radio-name">${name}</span>
        <span class="teams-radio-delete" data-name="${name}">×</span>
      `;
      
      // Store name in dataset for easy retrieval
      radioBtn.dataset.name = name;
      
      if (isActive && speakerData) {
        radioBtn.dataset.index = speakerData.index;
        radioBtn.addEventListener('click', (e) => {
          // Check if delete button clicked (check target AND parent)
          const deleteBtn = e.target.closest('.teams-radio-delete');
          if (deleteBtn) {
            e.stopPropagation();
            deleteSpeaker(deleteBtn.dataset.name);
          } else {
            // Click anywhere else on button = select it
            selectTeamsSpeaker(e);
          }
        });
      } else {
        // Inactive speaker - only allow delete
        radioBtn.style.cursor = 'default';
        radioBtn.addEventListener('click', (e) => {
          const deleteBtn = e.target.closest('.teams-radio-delete');
          if (deleteBtn) {
            e.stopPropagation();
            deleteSpeaker(deleteBtn.dataset.name);
          }
        });
      }
      
      radioGrid.appendChild(radioBtn);
    });
    
    // Add "Add New" button
    const addBtn = document.createElement('div');
    addBtn.className = 'teams-radio-button teams-add-new';
    addBtn.innerHTML = '<span>✚ Add New</span>';
    addBtn.addEventListener('click', addNewSpeaker);
    radioGrid.appendChild(addBtn);
    
    // Auto-select based on toggle logic (only among active speakers)
    autoSelectSpeaker(activeSpeakers);
    
    // Update auto-info text
    updateAutoInfo(activeSpeakers);
  }
  
  function autoSelectSpeaker(activeSpeakers) {
    if (activeSpeakers.length === 0) return;
    
    let selectedIndex = 0;
    
    if (activeSpeakers.length === 2) {
      // Two-person conversation: toggle between them
      const lastSpeakerIndex = parseInt(localStorage.getItem(CONFIG.TEAMS_LAST_SPEAKER_STORAGE) || '-1');
      const lastActiveIndex = activeSpeakers.findIndex(s => s.index === lastSpeakerIndex);
      
      if (lastActiveIndex !== -1) {
        // Toggle to the other speaker
        selectedIndex = (lastActiveIndex + 1) % 2;
      }
    } else if (activeSpeakers.length >= 3) {
      // 3+ speakers: default to first active (or Dan if present)
      const danIndex = activeSpeakers.findIndex(s => s.name.toLowerCase().includes('dan'));
      selectedIndex = danIndex !== -1 ? danIndex : 0;
    }
    
    // Select the radio button
    const radioButtons = document.querySelectorAll('.teams-radio-button');
    if (radioButtons[selectedIndex]) {
      radioButtons[selectedIndex].classList.add('selected');
    }
  }
  
  function updateAutoInfo(activeSpeakers) {
    const autoInfo = document.getElementById('teams-auto-info');
    
    if (activeSpeakers.length === 2) {
      autoInfo.textContent = '(Auto-toggling between 2 speakers)';
    } else if (activeSpeakers.length >= 3) {
      const selected = document.querySelector('.teams-radio-button.selected');
      if (selected) {
        autoInfo.textContent = `(Auto-selected: ${selected.textContent})`;
      }
    } else {
      autoInfo.textContent = '';
    }
  }
  
  function selectTeamsSpeaker(e) {
    // Deselect all
    document.querySelectorAll('.teams-radio-button').forEach(btn => btn.classList.remove('selected'));
    
    // Select clicked button (handle clicks on child spans)
    const button = e.target.closest('.teams-radio-button');
    if (button) {
      button.classList.add('selected');
    }
  }
  
  function showTeamsPopover() {
    const transcriptEl = document.getElementById('deepgram-transcript');
    teamsSavedCursorPosition = transcriptEl.selectionStart;
    
    // Position popover over transcription widget (top-center of panel)
    const popover = document.getElementById('teams-message-popover');
    const panel = document.getElementById('deepgram-panel');
    
    if (panel) {
      const panelRect = panel.getBoundingClientRect();
      const popoverWidth = 500; // Min width from CSS
      
      // Center horizontally over left pane, near top
      popover.style.left = (panelRect.left + 350) + 'px'; // Center of ~700px left pane
      popover.style.top = (panelRect.top + 50) + 'px'; // 50px from top of panel
      popover.style.transform = 'translateX(-50%)'; // Center on that position
    } else {
      // Fallback to screen center
      popover.style.left = '50%';
      popover.style.top = '20%';
      popover.style.transform = 'translate(-50%, 0)';
    }
    
    popover.classList.add('visible');
    teamsPopoverVisible = true;
    
    // Clear comment field (always starts empty)
    document.getElementById('teams-comment-input').value = '';
    
    // Apply dark mode via inline styles (nuclear option - CSS wasn't working)
    const panelTheme = document.getElementById('deepgram-panel').getAttribute('data-theme');
    const popoverInner = popover.querySelector('.teams-popover-inner');
    
    if (panelTheme === 'dark' && popoverInner) {
      // Force dark mode via inline styles on wrapper
      popoverInner.style.backgroundColor = '#2d3548';
      popoverInner.style.color = '#f3f4f6';
      
      // Update header
      popover.querySelectorAll('.teams-popover-header').forEach(el => {
        el.style.color = '#f3f4f6';
        el.style.borderBottomColor = '#4b5563';
      });
      
      // Update labels
      popover.querySelectorAll('.teams-popover-section label').forEach(el => {
        el.style.color = '#f3f4f6';
      });
      
      // Update small text
      popover.querySelectorAll('.teams-popover-section small').forEach(el => {
        el.style.color = '#9ca3af';
      });
    } else if (popoverInner) {
      // Light mode - clear inline styles
      popoverInner.style.backgroundColor = '';
      popoverInner.style.color = '';
      
      popover.querySelectorAll('.teams-popover-header').forEach(el => {
        el.style.color = '';
        el.style.borderBottomColor = '';
      });
      
      popover.querySelectorAll('.teams-popover-section label').forEach(el => {
        el.style.color = '';
      });
      
      popover.querySelectorAll('.teams-popover-section small').forEach(el => {
        el.style.color = '';
      });
    }
    
    // Focus first radio button or date field
    const firstRadio = document.querySelector('.teams-radio-button');
    if (firstRadio) {
      firstRadio.focus();
    } else {
      document.getElementById('teams-date-input').focus();
    }
    
    console.log('✓ Teams popover shown');
  }
  
  function hideTeamsPopover() {
    const popover = document.getElementById('teams-message-popover');
    popover.classList.remove('visible');
    teamsPopoverVisible = false;
    
    // Return focus to textarea
    document.getElementById('deepgram-transcript').focus();
    
    console.log('✓ Teams popover hidden');
  }
  
  function insertTeamsMessageBreak() {
    // Get selected speaker
    const selectedBtn = document.querySelector('.teams-radio-button.selected');
    if (!selectedBtn) {
      alert('Please select a speaker');
      return;
    }
    
    const speakerIndex = parseInt(selectedBtn.dataset.index);
    const speakerName = selectedBtn.dataset.name; // Use dataset, not textContent (avoids × char)
    const date = document.getElementById('teams-date-input').value.trim();
    const comment = document.getElementById('teams-comment-input').value.trim();
    
    // Save last speaker index for toggle logic
    localStorage.setItem(CONFIG.TEAMS_LAST_SPEAKER_STORAGE, speakerIndex.toString());
    
    // Format delimiter (no leading/trailing newlines - user handles spacing)
    let delimiter = `===MESSAGE_BREAK===\nSpeaker: ${speakerName}\nDate: ${date}`;
    
    // Add comment if present
    if (comment) {
      // Check if multi-line
      const lines = comment.split('\n');
      if (lines.length > 1) {
        // Multi-line format with 4-space indent
        const indentedLines = lines.map(line => '    ' + line).join('\n');
        delimiter += `\nComment:\n${indentedLines}`;
      } else {
        // Single-line format
        delimiter += `\nComment: ${comment}`;
      }
    }
    
    delimiter += `\n===END_BREAK===`;
    
    // Insert at saved cursor position
    const transcriptEl = document.getElementById('deepgram-transcript');
    const text = transcriptEl.value;
    const before = text.substring(0, teamsSavedCursorPosition);
    const after = text.substring(teamsSavedCursorPosition);
    
    transcriptEl.value = before + delimiter + after;
    
    // Move cursor after delimiter
    const newPos = teamsSavedCursorPosition + delimiter.length;
    transcriptEl.setSelectionRange(newPos, newPos);
    
    // Hide popover
    hideTeamsPopover();
    
    // Update radio buttons for next invocation (auto-toggle)
    updateTeamsRadioButtons();
    
    console.log('✓ Teams message break inserted:', speakerName, date);
  }
  
  // ==================== DOCUMENT ANNOTATION ====================
  
  function initializeDocAnnotation() {
    // Load or initialize default annotation types
    let annotationTypes = JSON.parse(localStorage.getItem(CONFIG.DOC_ANNOTATION_TYPES_STORAGE) || '[]');
    if (annotationTypes.length === 0) {
      // Default types
      annotationTypes = ['added', 'removed', 'modified', 'commented'];
      localStorage.setItem(CONFIG.DOC_ANNOTATION_TYPES_STORAGE, JSON.stringify(annotationTypes));
    }
    
    // Build annotation types radio grid
    updateDocAnnotationTypesGrid();
    
    // Build people radio grid (shares Teams speaker list)
    updateDocAnnotationPeopleGrid();
    
    // Attach button event listeners
    document.getElementById('doc-annotation-insert-btn').addEventListener('click', insertDocAnnotation);
    document.getElementById('doc-annotation-cancel-btn').addEventListener('click', hideDocAnnotationPopover);
    
    console.log('✓ Document annotation initialized');
  }
  
  function updateDocAnnotationTypesGrid() {
    const typesGrid = document.getElementById('doc-annotation-types-grid');
    typesGrid.innerHTML = '';
    
    const annotationTypes = JSON.parse(localStorage.getItem(CONFIG.DOC_ANNOTATION_TYPES_STORAGE) || '[]');
    const lastType = localStorage.getItem(CONFIG.DOC_ANNOTATION_LAST_TYPE_STORAGE);
    
    // Create buttons for each type
    annotationTypes.forEach((type) => {
      const radioBtn = document.createElement('div');
      radioBtn.className = 'doc-annotation-radio-button';
      radioBtn.innerHTML = `
        <span class="doc-annotation-radio-name">${type}</span>
        <span class="doc-annotation-radio-delete" data-type="${type}">×</span>
      `;
      radioBtn.dataset.type = type;
      
      // Auto-select last used type
      if (type === lastType) {
        radioBtn.classList.add('selected');
      }
      
      radioBtn.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.doc-annotation-radio-delete');
        if (deleteBtn) {
          e.stopPropagation();
          deleteDocAnnotationType(deleteBtn.dataset.type);
        } else {
          selectDocAnnotationType(e);
        }
      });
      
      typesGrid.appendChild(radioBtn);
    });
    
    // Add "Add New" button
    const addBtn = document.createElement('div');
    addBtn.className = 'doc-annotation-radio-button doc-add-new';
    addBtn.innerHTML = '<span>✚ Add New</span>';
    addBtn.addEventListener('click', addNewDocAnnotationType);
    typesGrid.appendChild(addBtn);
    
    // Auto-select first if none selected
    if (!lastType && annotationTypes.length > 0) {
      typesGrid.firstElementChild?.classList.add('selected');
    }
  }
  
  function updateDocAnnotationPeopleGrid() {
    const peopleGrid = document.getElementById('doc-annotation-people-grid');
    peopleGrid.innerHTML = '';
    
    // Use Teams known speakers list (shared infrastructure)
    const knownSpeakers = JSON.parse(localStorage.getItem(CONFIG.TEAMS_KNOWN_SPEAKERS_STORAGE) || '[]');
    const lastPerson = localStorage.getItem(CONFIG.DOC_ANNOTATION_LAST_PERSON_STORAGE);
    
    // Create buttons for each person
    knownSpeakers.forEach((name) => {
      const radioBtn = document.createElement('div');
      radioBtn.className = 'doc-annotation-radio-button';
      radioBtn.innerHTML = `
        <span class="doc-annotation-radio-name">${name}</span>
        <span class="doc-annotation-radio-delete" data-name="${name}">×</span>
      `;
      radioBtn.dataset.name = name;
      
      // Auto-select last used person
      if (name === lastPerson) {
        radioBtn.classList.add('selected');
      }
      
      radioBtn.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.doc-annotation-radio-delete');
        if (deleteBtn) {
          e.stopPropagation();
          deleteDocAnnotationPerson(deleteBtn.dataset.name);
        } else {
          selectDocAnnotationPerson(e);
        }
      });
      
      peopleGrid.appendChild(radioBtn);
    });
    
    // Add "Add New" button
    const addBtn = document.createElement('div');
    addBtn.className = 'doc-annotation-radio-button doc-add-new';
    addBtn.innerHTML = '<span>✚ Add New</span>';
    addBtn.addEventListener('click', addNewDocAnnotationPerson);
    peopleGrid.appendChild(addBtn);
    
    // Auto-select first if none selected and we have people
    if (!lastPerson && knownSpeakers.length > 0) {
      peopleGrid.firstElementChild?.classList.add('selected');
    }
  }
  
  function selectDocAnnotationType(e) {
    document.querySelectorAll('#doc-annotation-types-grid .doc-annotation-radio-button').forEach(btn => btn.classList.remove('selected'));
    const button = e.target.closest('.doc-annotation-radio-button');
    if (button) {
      button.classList.add('selected');
    }
  }
  
  function selectDocAnnotationPerson(e) {
    document.querySelectorAll('#doc-annotation-people-grid .doc-annotation-radio-button').forEach(btn => btn.classList.remove('selected'));
    const button = e.target.closest('.doc-annotation-radio-button');
    if (button) {
      button.classList.add('selected');
    }
  }
  
  function deleteDocAnnotationType(typeName) {
    if (!confirm(`Delete annotation type "${typeName}"?`)) {
      return;
    }
    
    const types = JSON.parse(localStorage.getItem(CONFIG.DOC_ANNOTATION_TYPES_STORAGE) || '[]');
    const index = types.indexOf(typeName);
    
    if (index > -1) {
      types.splice(index, 1);
      localStorage.setItem(CONFIG.DOC_ANNOTATION_TYPES_STORAGE, JSON.stringify(types));
      updateDocAnnotationTypesGrid();
      console.log('✓ Deleted annotation type:', typeName);
    }
  }
  
  function addNewDocAnnotationType() {
    const newType = prompt('Enter new annotation type:');
    if (!newType || !newType.trim()) {
      return;
    }
    
    const trimmedType = newType.trim().toLowerCase();
    const types = JSON.parse(localStorage.getItem(CONFIG.DOC_ANNOTATION_TYPES_STORAGE) || '[]');
    
    if (types.includes(trimmedType)) {
      alert('Annotation type already exists!');
      return;
    }
    
    types.push(trimmedType);
    localStorage.setItem(CONFIG.DOC_ANNOTATION_TYPES_STORAGE, JSON.stringify(types));
    updateDocAnnotationTypesGrid();
    console.log('✓ Added new annotation type:', trimmedType);
  }
  
  function deleteDocAnnotationPerson(personName) {
    // This deletes from TEAMS speaker list (shared infrastructure)
    deleteSpeaker(personName);
    // Refresh people grid
    updateDocAnnotationPeopleGrid();
  }
  
  function addNewDocAnnotationPerson() {
    // This adds to TEAMS speaker list (shared infrastructure)
    addNewSpeaker();
    // Refresh people grid
    updateDocAnnotationPeopleGrid();
  }
  
  function showDocAnnotationPopover() {
    const transcriptEl = document.getElementById('deepgram-transcript');
    
    // Save current selection (start and end)
    docAnnotationSavedSelection = {
      start: transcriptEl.selectionStart,
      end: transcriptEl.selectionEnd,
      text: transcriptEl.value.substring(transcriptEl.selectionStart, transcriptEl.selectionEnd)
    };
    
    // Position popover over transcription widget
    const popover = document.getElementById('doc-annotation-popover');
    const panel = document.getElementById('deepgram-panel');
    
    if (panel) {
      const panelRect = panel.getBoundingClientRect();
      popover.style.left = (panelRect.left + 350 - 640) + 'px'; // Shifted 640px left to uncover document
      popover.style.top = (panelRect.top + 50) + 'px';
      popover.style.transform = 'translateX(-50%)';
    } else {
      popover.style.left = '50%';
      popover.style.top = '20%';
      popover.style.transform = 'translate(-50%, 0)';
    }
    
    popover.classList.add('visible');
    docAnnotationPopoverVisible = true;
    
    // Clear comment field
    document.getElementById('doc-annotation-comment-input').value = '';
    
    // Apply dark mode via inline styles (nuclear option)
    const panelTheme = document.getElementById('deepgram-panel').getAttribute('data-theme');
    const popoverInner = popover.querySelector('.doc-annotation-popover-inner');
    
    if (panelTheme === 'dark' && popoverInner) {
      popoverInner.style.backgroundColor = '#2d3548';
      popoverInner.style.color = '#f3f4f6';
      
      popover.querySelectorAll('.doc-annotation-popover-header').forEach(el => {
        el.style.color = '#f3f4f6';
        el.style.borderBottomColor = '#4b5563';
      });
      
      popover.querySelectorAll('.doc-annotation-popover-section label').forEach(el => {
        el.style.color = '#f3f4f6';
      });
      
      popover.querySelectorAll('.doc-annotation-popover-section small').forEach(el => {
        el.style.color = '#9ca3af';
      });
    } else if (popoverInner) {
      popoverInner.style.backgroundColor = '';
      popoverInner.style.color = '';
      
      popover.querySelectorAll('.doc-annotation-popover-header').forEach(el => {
        el.style.color = '';
        el.style.borderBottomColor = '';
      });
      
      popover.querySelectorAll('.doc-annotation-popover-section label').forEach(el => {
        el.style.color = '';
      });
      
      popover.querySelectorAll('.doc-annotation-popover-section small').forEach(el => {
        el.style.color = '';
      });
    }
    
    // Populate selected text display
    const selectedTextDisplay = document.getElementById('doc-annotation-selected-text');
    if (selectedTextDisplay) {
      selectedTextDisplay.value = docAnnotationSavedSelection.text || '';
    }
    
    // Refresh grids
    updateDocAnnotationTypesGrid();
    updateDocAnnotationPeopleGrid();
    
    // Focus comment field for immediate typing
    setTimeout(() => {
      document.getElementById('doc-annotation-comment-input').focus();
    }, 100);
    
    console.log('✓ Doc annotation popover shown', docAnnotationSavedSelection);
  }
  
  function hideDocAnnotationPopover() {
    const popover = document.getElementById('doc-annotation-popover');
    popover.classList.remove('visible');
    docAnnotationPopoverVisible = false;
    
    // Return focus to textarea
    document.getElementById('deepgram-transcript').focus();
    
    console.log('✓ Doc annotation popover hidden');
  }
  
  function escapeXmlAttribute(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  
  function insertDocAnnotation() {
    // Get selected type
    const selectedTypeBtn = document.querySelector('#doc-annotation-types-grid .doc-annotation-radio-button.selected');
    if (!selectedTypeBtn) {
      alert('Please select an annotation type');
      return;
    }
    const annotationType = selectedTypeBtn.dataset.type;
    
    // Get selected person
    const selectedPersonBtn = document.querySelector('#doc-annotation-people-grid .doc-annotation-radio-button.selected');
    if (!selectedPersonBtn) {
      alert('Please select a person');
      return;
    }
    const personName = selectedPersonBtn.dataset.name;
    
    // Get comment (optional)
    const comment = document.getElementById('doc-annotation-comment-input').value.trim();
    
    // Save last selections for next time
    localStorage.setItem(CONFIG.DOC_ANNOTATION_LAST_TYPE_STORAGE, annotationType);
    localStorage.setItem(CONFIG.DOC_ANNOTATION_LAST_PERSON_STORAGE, personName);
    
    // Generate XML tag
    let xmlTag;
    
    if (docAnnotationSavedSelection.text) {
      // Has selected text - wrapping tag
      const escapedComment = comment ? ` comment="${escapeXmlAttribute(comment)}"` : '';
      xmlTag = `<${annotationType} by="${escapeXmlAttribute(personName)}"${escapedComment}>${docAnnotationSavedSelection.text}</${annotationType}>`;
    } else {
      // No selected text - self-closing tag
      const escapedComment = comment ? ` comment="${escapeXmlAttribute(comment)}"` : '';
      xmlTag = `<${annotationType} by="${escapeXmlAttribute(personName)}"${escapedComment} />`;
    }
    
    // Insert XML tag into textarea with paragraph breaks
    const transcriptEl = document.getElementById('deepgram-transcript');
    const text = transcriptEl.value;
    const before = text.substring(0, docAnnotationSavedSelection.start);
    const after = text.substring(docAnnotationSavedSelection.end);
    
    // Add newlines before and after for visual distinction
    const xmlWithBreaks = '\n\n' + xmlTag + '\n\n';
    
    transcriptEl.value = before + xmlWithBreaks + after;
    
    // Move cursor after inserted tag (including newlines)
    const newPos = docAnnotationSavedSelection.start + xmlWithBreaks.length;
    transcriptEl.setSelectionRange(newPos, newPos);
    
    // Hide popover
    hideDocAnnotationPopover();
    
    console.log('✓ Document annotation inserted:', annotationType, personName, comment || '(no comment)');
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
      if (e.code === 'Space' && !isInputFocused && !e.ctrlKey && !e.shiftKey) {
        console.log(ts(), '🟢 SPACE HANDLER ENTERED:', {
          ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, code: e.code
        });
        const apiKey = localStorage.getItem(CONFIG.DEEPGRAM_API_KEY_STORAGE);
        if (apiKey) {
          e.preventDefault();
          flashBell('bell-space'); // Visual indicator
          toggleRecording();
        }
      }
      
      // F-KEYS: Philips SpeechOne Remote Control Support
      // Shift+F3 = Toggle recording (same as Space) - WORKING
      // Shift+F5 = Add paragraph (same as ArrowDown)
      // Shift+F6 = Cancel recording (same as Escape)
      // Shift+F11 = ULTIMATE ULTIMATE (same as Ctrl+Alt+Shift+Enter) - WORKING
      // Note: F1/F2/F4/F9/F10 have browser conflicts even with Shift
      
      // Shift+F3: Toggle recording (mirrors Space key behavior)
      // ALWAYS works, even if transcript focused (blurs first for remote UX)
      if (e.key === 'F3' && e.shiftKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        
        // Blur transcript if focused (remote control should always work)
        const transcriptEl = document.getElementById('deepgram-transcript');
        if (document.activeElement === transcriptEl) {
          transcriptEl.blur();
          console.log(ts(), '🎮 Shift+F3: Blurred transcript for remote control');
          }
          
          console.log(ts(), '🎮 Shift+F3: Toggle recording (remote control)');
        toggleRecording();
        return;
      
      // Shift+F4: Toggle recording (remote control - alternate for Shift+F3 browser conflict)
      // ALWAYS works (blurs transcript first for remote UX)
      if (e.key === 'F4' && e.shiftKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        
        // Blur transcript if focused (remote control should always work)
        const transcriptEl = document.getElementById('deepgram-transcript');
        if (document.activeElement === transcriptEl) {
          transcriptEl.blur();
          console.log(ts(), '🎮 Shift+F4: Blurred transcript for remote control');
        }
        
        console.log(ts(), '🎮 Shift+F4: Toggle recording (remote control)');
        toggleRecording();
        return;
      }

      
      // F6: Remote toggle recording (smart blur + timeout)
      // Called by AutoHotkey (plain F6, not Shift+F6)
      // Blurs transcript if focused, waits 300ms, then toggles
      if (e.key === 'F6' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        
        const transcriptEl = document.getElementById('deepgram-transcript');
        
        // Check if transcript has focus
        if (document.activeElement === transcriptEl) {
          // Blur first
          transcriptEl.blur();
          console.log(ts(), '🎤 F6: Transcript focused - blurring, waiting 300ms before toggle');
          
          // Wait 300ms then toggle
          setTimeout(() => {
            console.log(ts(), '🎤 F6: Timeout complete - toggling recording');
            toggleRecording();
          }, 300);
        } else {
          // Not focused - toggle immediately
          console.log(ts(), '🎤 F6: Transcript not focused - toggling immediately');
          toggleRecording();
        }
        
        return;
      }
      
      }
      
      // Shift+F5: Add paragraph break (mirrors ArrowDown behavior)
      // ALWAYS works (blurs transcript first for remote UX)
      if (e.key === 'F5' && e.shiftKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        
        // Blur transcript if focused (remote control should always work)
        const transcriptEl = document.getElementById('deepgram-transcript');
        if (document.activeElement === transcriptEl) {
          transcriptEl.blur();
          console.log(ts(), '🎮 Shift+F5: Blurred transcript for remote control');
        }
        
        console.log(ts(), '🎮 Shift+F5: Add paragraph break (remote control)');
        
        if (isRecording) {
          console.log(ts(), '🎮 Shift+F5: Recording ON - stopping to submit chunk');
          toggleRecording();
          setPendingParagraphFlag();
          toggleRecording();
          console.log(ts(), '🎮 Shift+F5: Recording resumed after chunk submission');
        } else {
          if (pendingTranscriptions > 0) {
            console.log(ts(), '🎮 Shift+F5: Chunks pending - setting flag');
            setPendingParagraphFlag();
          } else {
            console.log(ts(), '🎮 Shift+F5: No chunks pending - inserting newline now');
            insertNewlineAtEnd();
          }
        }
        return;
      }
      
      // Shift+F6: Cancel recording (mirrors Escape key behavior)
      // ALWAYS works (blurs transcript first for remote UX)
      if (e.key === 'F6' && e.shiftKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        
        // Blur transcript if focused (remote control should always work)
        const transcriptEl = document.getElementById('deepgram-transcript');
        if (document.activeElement === transcriptEl) {
          transcriptEl.blur();
          console.log(ts(), '🎮 Shift+F6: Blurred transcript for remote control');
        }
        
        if (isRecording) {
          console.log(ts(), '🎮 Shift+F6: Canceling active recording (remote control)');
          
          if (transcriptionMode === 'whisper') {
            cancelWhisperRecording();
          } else {
            cancelDeepgramRecording();
          }
        }
        return;
      }
      
      // Shift+F11: ULTIMATE ULTIMATE - Insert & Submit (mirrors Ctrl+Alt+Shift+Enter)
      // ALWAYS works (blurs transcript first for remote UX)
      if (e.key === 'F11' && e.shiftKey && !e.ctrlKey && !e.altKey) {
        // GUARD: Only execute if Chat view is active
        const sidebarId = document.querySelector('[data-sidebar-id]')?.getAttribute('data-sidebar-id');
        if (sidebarId !== 'chat') {
          console.log(ts(), '🎮 Shift+F11: Blocked - Chat view not active (sidebar:', sidebarId, ')');
          return;
        }
        
        e.preventDefault();
        
        // Blur transcript if focused (remote control should always work)
        const transcriptEl = document.getElementById('deepgram-transcript');
        if (document.activeElement === transcriptEl) {
          transcriptEl.blur();
          console.log(ts(), '🎮 Shift+F11: Blurred transcript for remote control');
        }
        
        console.log(ts(), '🎮 Shift+F11: ULTIMATE ULTIMATE triggered (remote control)');
        
        if (isRecording) {
          console.log(ts(), '🎮 Shift+F11: Recording active - stopping first');
          toggleRecording();
        }
        
        if (pendingTranscriptions > 0) {
          console.log(ts(), '🎮 Shift+F11: Chunks pending - queueing submit after completion');
          queuedAction = 'insertAndSubmit';
        } else {
          const text = document.getElementById('deepgram-transcript').value.trim();
          if (text) {
            console.log(ts(), '🎮 Shift+F11: No chunks pending - executing submit now');
            insertAndSubmit();
          } else {
            console.log(ts(), '🎮 Shift+F11: No text to submit');
          }
        }
        return;
      }
      
      // ArrowDown: Add paragraph break (queue or immediate)
      // BUT: Only if NOT typing in an input field AND (not in transcript OR at end of transcript)
      if (e.code === 'ArrowDown' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        // Check if typing in any input/textarea (including date, comment, etc.)
        if (isInputFocused && activeElement.id !== 'deepgram-transcript') {
          // Typing in non-transcript input - let ArrowDown work normally
          return;
        }
        
        // Check if in transcript and NOT at end
        const transcriptEl = document.getElementById('deepgram-transcript');
        if (activeElement === transcriptEl) {
          const cursorPos = transcriptEl.selectionStart;
          const textLength = transcriptEl.value.length;
          if (cursorPos < textLength) {
            // Cursor not at end - let ArrowDown move cursor normally
            return;
          }
        }
        
        // Safe to trigger paragraph break logic
        console.log(ts(), '🟡 ARROW DOWN HANDLER ENTERED:', {
          isRecording: isRecording,
          pendingTranscriptions: pendingTranscriptions,
          pendingParagraphBreak: pendingParagraphBreak
        });
        e.preventDefault();
        flashBell('bell-ctrl-space'); // Visual indicator (yellow bell)
        
        if (isRecording) {
          // Recording ON → Stop, submit chunk, set pending flag, resume
          console.log(ts(), '⏸️ ArrowDown: Recording ON - stopping to submit chunk');
          toggleRecording(); // Stop recording (submits chunk, increments pendingTranscriptions)
          setPendingParagraphFlag(); // Set flag for when chunk returns
          toggleRecording(); // Resume recording immediately
          console.log(ts(), '▶️ ArrowDown: Recording resumed after chunk submission');
        } else {
          // Recording OFF → Check if chunks pending
          if (pendingTranscriptions > 0) {
            // Chunks pending - set flag
            console.log(ts(), '⏳ ArrowDown: Chunks pending - setting flag');
            setPendingParagraphFlag();
          } else {
            // No chunks pending - insert newline immediately
            console.log(ts(), '✅ ArrowDown: No chunks pending - inserting newline now');
            insertNewlineAtEnd();
          }
        }
      }
      
      // Ctrl+Shift+Enter: Insert to Chat (works globally, even when TypingMind chat is focused)
      // Special behavior: If recording active, stops recording first, then queues insert
      if (e.ctrlKey && e.shiftKey && e.key === 'Enter' && !e.altKey) {
        // GUARD: Only execute if Chat view is active (prevent text loss in other sidebars)
        const chatViewActive = document.querySelector('[data-element-id="sidebar-middle-part"]') || document.querySelectorAll('.response-block').length > 0;
        if (!chatViewActive) {
          console.log(ts(), '⚠️ ULTIMATE blocked - Chat view not active (preventing text loss)');
          return; // Don't clear transcript when chat not visible
        }
        
        flashBell('bell-ultimate'); // Visual indicator
        const transcriptEl = document.getElementById('deepgram-transcript');
        const text = transcriptEl ? transcriptEl.value.trim() : '';
        
        console.log(ts(), '🔥 ULTIMATE triggered');
        console.log('  isRecording:', isRecording);
        console.log('  pendingTranscriptions:', pendingTranscriptions);
        console.log('  activeElement:', document.activeElement?.tagName, document.activeElement?.id);
        console.log('  transcript length:', transcriptEl?.value.length);
        console.log('  text to insert:', text?.substring(0, 50) + '...');
        
        e.preventDefault();
        
        // If recording active, stop it first and FORCE queue (don't check text yet)
        if (isRecording) {
          toggleRecording(); // Stops recording, submits current chunk (async)
          pendingInsert = true; // Force queue - text is coming from chunk
          console.log('⏸️ ULTIMATE: Recording stopped + insert queued (text pending)');
          
          // Visual feedback
          const btn = document.getElementById('deepgram-insert-btn');
          if (btn) {
            btn.textContent = '⏳ Queued...';
            setTimeout(() => {
              btn.textContent = '💬 Insert';
            }, 1000);
          }
          return; // Exit - let chunk completion handle execution
        }
        
        // Recording already stopped - check for pending chunks FIRST (before text check)
        if (pendingTranscriptions > 0) {
          // Chunks pending - queue regardless of current text (text may be coming)
          pendingInsert = true;
          console.log('⏳ ULTIMATE: Insert queued (chunks pending, text may be empty now)');
          
          // Visual feedback
          const btn = document.getElementById('deepgram-insert-btn');
          if (btn) {
            btn.textContent = '⏳ Queued...';
            setTimeout(() => {
              btn.textContent = '💬 Insert';
            }, 1000);
          }
          return; // Exit - let chunk completion handle execution
        }
        
        // No recording, no chunks pending - NOW check if text exists
        if (!text) {
          console.log('⚠️ ULTIMATE: No text to insert (transcript empty, no chunks pending)');
          return;
        }
        
        // Safe to execute immediately
        insertToChat();
        console.log('✓ ULTIMATE: Insert executed immediately (no chunks pending)');
      }
      
      // Ctrl+Alt+Shift+Enter: Insert to Chat AND Submit (works globally)
      // Special behavior: If recording active, stops recording first, then queues submit
      if (e.ctrlKey && e.altKey && e.shiftKey && e.key === 'Enter') {
        // GUARD: Only execute if Chat view is active (prevent text loss in other sidebars)
        const chatViewActive = document.querySelector('[data-element-id="sidebar-middle-part"]') || document.querySelectorAll('.response-block').length > 0;
        if (!chatViewActive) {
          console.log(ts(), '⚠️ ULTIMATE ULTIMATE blocked - Chat view not active (preventing text loss)');
          return; // Don't clear transcript when chat not visible
        }
        
        flashBell('bell-ultimate-ultimate'); // Visual indicator
        const transcriptEl = document.getElementById('deepgram-transcript');
        const text = transcriptEl ? transcriptEl.value.trim() : '';
        
        console.log(ts(), '🔥 ULTIMATE ULTIMATE triggered');
        console.log('  isRecording:', isRecording);
        console.log('  pendingTranscriptions:', pendingTranscriptions);
        console.log('  pendingInsert:', pendingInsert);
        console.log('  pendingInsertAndSubmit:', pendingInsertAndSubmit);
        console.log('  activeElement:', document.activeElement?.tagName, document.activeElement?.id);
        console.log('  transcript length:', transcriptEl?.value.length);
        console.log('  text to submit:', text?.substring(0, 50) + '...');
        
        e.preventDefault();
        
        // If recording active, stop it first and FORCE queue (don't check text yet)
        if (isRecording) {
          toggleRecording(); // Stops recording, submits current chunk (async)
          pendingInsertAndSubmit = true; // Force queue - text is coming from chunk
          console.log('⏸️ ULTIMATE ULTIMATE: Recording stopped + submit queued (text pending)');
          
          // Visual feedback
          const btn = document.getElementById('deepgram-send-btn');
          if (btn) {
            btn.textContent = '⏳ Queued...';
            setTimeout(() => {
              btn.textContent = '⚡ Send';
            }, 1000);
          }
          return; // Exit - let chunk completion handle execution
        }
        
        // Recording already stopped - check for pending chunks FIRST (before text check)
        if (pendingTranscriptions > 0) {
          // Chunks pending - queue regardless of current text (text may be coming)
          pendingInsertAndSubmit = true;
          console.log('⏳ ULTIMATE ULTIMATE: Submit queued (chunks pending, text may be empty now)');
          
          // Visual feedback
          const btn = document.getElementById('deepgram-send-btn');
          if (btn) {
            btn.textContent = '⏳ Queued...';
            setTimeout(() => {
              btn.textContent = '⚡ Send';
            }, 1000);
          }
          return; // Exit - let chunk completion handle execution
        }
        
        // No recording, no chunks pending - NOW check if text exists
        if (!text) {
          console.log('⚠️ ULTIMATE ULTIMATE: No text to submit (transcript empty, no chunks pending)');
          return;
        }
        
        // Safe to execute immediately
        insertAndSubmit();
        console.log('✓ ULTIMATE ULTIMATE: Submit executed immediately (no chunks pending)');
      }
      
      // Ctrl+M: Show Teams message break popover (when textarea focused)
      if (e.ctrlKey && !e.shiftKey && e.key === 'm') {
        console.log(ts(), '🔍 CTRL+SHIFT+M DETECTED:', {
          ctrl: e.ctrlKey,
          shift: e.shiftKey,
          key: e.key,
          activeElement: document.activeElement?.id || document.activeElement?.tagName,
          transcriptEl: 'deepgram-transcript'
        });
        const transcriptEl = document.getElementById('deepgram-transcript');
        if (document.activeElement === transcriptEl) {
          e.preventDefault();
          showTeamsPopover();
          console.log(ts(), '✓ Ctrl+Shift+M: Teams popover triggered');
        } else {
          console.log(ts(), '⚠️ Ctrl+Shift+M: Focus not in transcript - popover NOT shown');
        }
      }
      
      // Ctrl+U: Show Document Annotation popover (when textarea focused)
      if (e.ctrlKey && !e.shiftKey && e.key === 'u') {
        const transcriptEl = document.getElementById('deepgram-transcript');
        if (document.activeElement === transcriptEl) {
          e.preventDefault();
          showDocAnnotationPopover();
          console.log(ts(), '✓ Ctrl+U: Document annotation popover triggered');
        }
      }
      
      // Enter: Insert break and close popover (when popover visible)
      // BUT: Allow Enter in comment textarea for multi-line input (unless Ctrl+Enter)
      if (e.key === 'Enter' && teamsPopoverVisible) {
        const commentTextarea = document.getElementById('teams-comment-input');
        if (document.activeElement === commentTextarea && !e.ctrlKey) {
          // Let Enter work normally in comment field (new line)
          // Ctrl+Enter still submits even from comment field
          return;
        }
        e.preventDefault();
        insertTeamsMessageBreak();
      }
      
      // Escape: Cancel recording FIRST if active, then handle popover close
      if (e.key === 'Escape') {
        // Priority 1: Cancel active recording (both modes)
        if (isRecording) {
          console.log(ts(), '⚠️ ESC: Canceling active recording (audio NOT submitted)');
          e.preventDefault();
          
          // Stop recording WITHOUT submitting audio
          if (transcriptionMode === 'whisper') {
            cancelWhisperRecording();
          } else {
            cancelDeepgramRecording();
          }
          return; // Don't proceed to popover close
        }
        
        // Priority 2: Close Teams popover if visible (only if not recording)
        if (teamsPopoverVisible) {
          e.preventDefault();
          hideTeamsPopover();
          return;
        }
      }
      
      // Document Annotation popover shortcuts
      if (docAnnotationPopoverVisible) {
        // Enter: Insert annotation and close
        if (e.key === 'Enter') {
          e.preventDefault();
          insertDocAnnotation();
        }
        
        // Escape: Cancel recording FIRST if active, then close popover
        if (e.key === 'Escape') {
          // Priority 1: Cancel active recording
          if (isRecording) {
            console.log(ts(), '⚠️ ESC (Doc Annotation): Canceling active recording');
            e.preventDefault();
            
            if (transcriptionMode === 'whisper') {
              cancelWhisperRecording();
            } else {
              cancelDeepgramRecording();
            }
            return;
          }
          
          // Priority 2: Close popover (only if not recording)
          e.preventDefault();
          hideDocAnnotationPopover();
        }
        
        // Number keys 1-9: Quick select annotation type or person
        // Types in first row, people in second row (shift for people)
        if (e.key >= '1' && e.key <= '9' && !isInputFocused) {
          const index = parseInt(e.key) - 1;
          
          if (e.shiftKey) {
            // Shift+Number: Select person
            const peopleButtons = document.querySelectorAll('#doc-annotation-people-grid .doc-annotation-radio-button:not(.doc-add-new)');
            if (peopleButtons[index]) {
              e.preventDefault();
              peopleButtons.forEach(btn => btn.classList.remove('selected'));
              peopleButtons[index].classList.add('selected');
            }
          } else {
            // Number: Select annotation type
            const typeButtons = document.querySelectorAll('#doc-annotation-types-grid .doc-annotation-radio-button:not(.doc-add-new)');
            if (typeButtons[index]) {
              e.preventDefault();
              typeButtons.forEach(btn => btn.classList.remove('selected'));
              typeButtons[index].classList.add('selected');
            }
          }
        }
      }
      
      // Number keys 1-9: Select corresponding radio button (when popover visible)
      // BUT: Only if NOT typing in an input field
      if (teamsPopoverVisible && e.key >= '1' && e.key <= '9' && !isInputFocused) {
        const radioButtons = document.querySelectorAll('.teams-radio-button');
        const index = parseInt(e.key) - 1;
        if (radioButtons[index]) {
          e.preventDefault();
          // Deselect all
          radioButtons.forEach(btn => btn.classList.remove('selected'));
          // Select target
          radioButtons[index].classList.add('selected');
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
