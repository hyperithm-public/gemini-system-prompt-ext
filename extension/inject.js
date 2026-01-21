/**
 * Gemini System Prompt Injector - Page Context Script
 *
 * 이 스크립트는 페이지의 JavaScript 컨텍스트에서 실행되어
 * XHR 요청을 인터셉트하고 시스템 프롬프트를 주입합니다.
 */

(function() {
  'use strict';

  const DEFAULT_INSTRUCTIONS = [];
  const MAX_TRACKED_CONVERSATIONS = 100;

  // Debug mode - set to true for development logging
  const DEBUG = false;

  function log(...args) {
    if (DEBUG) console.log('[GSP]', ...args);
  }

  function logError(...args) {
    if (DEBUG) console.error('[GSP]', ...args);
  }

  // 주입된 대화 추적
  const injectedConversations = new Set();

  /**
   * 현재 URL에서 대화 ID 추출
   */
  function getConversationIdFromUrl() {
    const match = window.location.href.match(/\/app\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }

  /**
   * 주입 여부 확인
   */
  function shouldInject() {
    const url = window.location.href;

    // Gems 기능 제외 (자체 시스템 지침 있음)
    if (url.includes('/gem/')) return false;

    // 새 대화 페이지
    if (url.endsWith('/app') || url.endsWith('/app/')) return true;

    const convId = getConversationIdFromUrl();
    if (!convId) return true;

    // 이미 주입한 대화인지 확인
    return !injectedConversations.has(convId);
  }

  /**
   * 주입 완료 표시
   */
  function markInjected() {
    const convId = getConversationIdFromUrl();
    if (convId) {
      // Cleanup oldest entry if at capacity (LRU-style)
      if (injectedConversations.size >= MAX_TRACKED_CONVERSATIONS) {
        const oldest = injectedConversations.values().next().value;
        injectedConversations.delete(oldest);
      }
      injectedConversations.add(convId);
    }
  }

  /**
   * 설정 가져오기 (content script에서 동기화됨)
   */
  function getSettings() {
    // Check if settings are ready
    if (document.documentElement.dataset.gspReady !== 'true') {
      return null; // Settings not yet synced
    }

    // data attribute에서 설정 읽기
    try {
      const settingsAttr = document.documentElement.dataset.gspSettings;
      if (settingsAttr) {
        return JSON.parse(settingsAttr);
      }
    } catch (e) {
      logError('Settings parse error:', e);
    }
    return { enabled: true, instructions: DEFAULT_INSTRUCTIONS };
  }

  /**
   * Validate Gemini API request structure
   */
  function validateApiStructure(parsed) {
    if (!parsed || !Array.isArray(parsed)) return false;
    if (!parsed[1] || typeof parsed[1] !== 'string') return false;
    try {
      const inner = JSON.parse(parsed[1]);
      return inner && Array.isArray(inner[0]) && typeof inner[0][0] === 'string';
    } catch {
      return false;
    }
  }

  // ============================================
  // XHR Interception
  // ============================================

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  // Store references to prevent tampering
  const _apply = Function.prototype.apply;
  const _call = Function.prototype.call;

  function patchedOpen(method, url, ...args) {
    this._gspUrl = url;
    return _apply.call(originalOpen, this, [method, url, ...args]);
  }

  function patchedSend(body) {
    // StreamGenerate 요청만 인터셉트
    if (this._gspUrl?.includes('StreamGenerate') && body && typeof body === 'string') {
      const settings = getSettings();

      // Skip if settings not ready yet (race condition protection)
      if (!settings) {
        log('Settings not ready, skipping injection');
        return _call.call(originalSend, this, body);
      }

      // Check injection conditions
      const instructions = settings.instructions || [];
      if (settings.enabled && instructions.length > 0 && shouldInject()) {
        try {
          // Extract f.req parameter
          const bodyParams = new URLSearchParams(body);
          const fReq = bodyParams.get('f.req');

          if (fReq) {
            const parsed = JSON.parse(fReq);

            // Validate API structure before attempting modification
            if (!validateApiStructure(parsed)) {
              logError('API structure validation failed - format may have changed');
              window.dispatchEvent(new CustomEvent('gsp-injection-failed', {
                detail: { error: 'api_format_changed' }
              }));
              return _call.call(originalSend, this, body);
            }

            // Parse double JSON structure
            const innerArray = JSON.parse(parsed[1]);
            const userPrompt = innerArray[0][0];

            // Concatenate all instructions with annotation tag
            const systemPrompt = instructions.join('\n\n');
            const annotatedPrompt = `<system_instructions>\n${systemPrompt}\n</system_instructions>`;

            // Prepend annotated system prompt
            innerArray[0][0] = annotatedPrompt + '\n\n' + userPrompt;

            // Re-encode
            parsed[1] = JSON.stringify(innerArray);
            bodyParams.set('f.req', JSON.stringify(parsed));
            body = bodyParams.toString();

            // Mark as injected
            markInjected();
            log('Instructions injected:', instructions.length);
          }
        } catch (e) {
          logError('XHR injection error:', e);
          window.dispatchEvent(new CustomEvent('gsp-injection-failed', {
            detail: { error: e.message }
          }));
        }
      }
    }

    return _call.call(originalSend, this, body);
  }

  // Apply patches with tamper protection
  Object.defineProperty(XMLHttpRequest.prototype, 'open', {
    value: patchedOpen,
    writable: false,
    configurable: false
  });

  Object.defineProperty(XMLHttpRequest.prototype, 'send', {
    value: patchedSend,
    writable: false,
    configurable: false
  });

  log('Page context injector loaded');
})();
