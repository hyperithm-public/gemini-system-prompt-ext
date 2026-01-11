/**
 * Gemini System Prompt Injector - Page Context Script
 *
 * 이 스크립트는 페이지의 JavaScript 컨텍스트에서 실행되어
 * XHR 요청을 인터셉트하고 시스템 프롬프트를 주입합니다.
 */

(function() {
  'use strict';

  const DEFAULT_INSTRUCTIONS = [];

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
      injectedConversations.add(convId);
    }
  }

  /**
   * 설정 가져오기 (content script에서 동기화됨)
   */
  function getSettings() {
    // data attribute에서 설정 읽기
    try {
      const settingsAttr = document.documentElement.dataset.gspSettings;
      if (settingsAttr) {
        return JSON.parse(settingsAttr);
      }
    } catch (e) {
      console.error('[GSP] Settings parse error:', e);
    }
    return { enabled: true, instructions: DEFAULT_INSTRUCTIONS };
  }

  // ============================================
  // XHR Interception
  // ============================================

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    this._gspUrl = url;
    return originalOpen.apply(this, [method, url, ...args]);
  };

  XMLHttpRequest.prototype.send = function(body) {
    // StreamGenerate 요청만 인터셉트
    if (this._gspUrl?.includes('StreamGenerate') && body && typeof body === 'string') {
      const settings = getSettings();

      // Check injection conditions
      const instructions = settings.instructions || [];
      if (settings.enabled && instructions.length > 0 && shouldInject()) {
        try {
          // Extract f.req parameter
          const bodyParams = new URLSearchParams(body);
          const fReq = bodyParams.get('f.req');

          if (fReq) {
            const parsed = JSON.parse(fReq);

            // Parse double JSON structure
            if (parsed[1] && typeof parsed[1] === 'string') {
              const innerArray = JSON.parse(parsed[1]);

              // Modify user prompt
              if (innerArray[0] && innerArray[0][0]) {
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
                console.log('[GSP] Instructions injected:', instructions.length);
              }
            }
          }
        } catch (e) {
          console.error('[GSP] XHR injection error:', e);
          window.dispatchEvent(new CustomEvent('gsp-injection-failed', {
            detail: { error: e.message }
          }));
        }
      }
    }

    return originalSend.call(this, body);
  };

  console.log('[GSP] Page context injector loaded');
})();
