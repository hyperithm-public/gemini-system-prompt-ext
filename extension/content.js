/**
 * Gemini System Prompt Injector - Content Script
 *
 * Injects XHR interceptor and manages settings UI
 */

(function() {
  'use strict';

  // ============================================
  // Constants & Selectors
  // ============================================
  const SELECTORS = {
    settingsMenu: '.desktop-settings-menu',
    settingsMenuContent: '.mat-mdc-menu-content'
  };

  const STORAGE_KEYS = {
    enabled: 'gsp_enabled',
    instructions: 'gsp_instructions'
  };

  const LIMITS = {
    maxInstructionLength: 5000,
    maxInstructionsCount: 20
  };

  // ============================================
  // Translations
  // ============================================
  const TRANSLATIONS = {
    en: {
      menuLabel: 'Instructions for Gemini',
      title: 'Instructions for Gemini',
      description: 'Share info about your life and preferences to get more helpful responses. Add new info here or ask Gemini to remember something during a chat.',
      addBtn: 'Add',
      showExamples: 'Show examples',
      emptyState: "You haven't added any instructions yet",
      placeholder: 'Enter an instruction...',
      exampleTitle: 'Example Instructions',
      exampleClose: 'Close',
      injectionError: 'Injection failed',
      apiFormatChanged: 'Gemini API format may have changed. Extension update needed.',
      instructionTooLong: 'Instruction too long (max 5000 characters)',
      tooManyInstructions: 'Too many instructions (max 20)',
      examples: [
        'Always respond in a friendly, conversational tone',
        'I prefer concise answers without unnecessary explanations',
        'When writing code, always include comments',
        'I am a software developer working with Python and JavaScript'
      ]
    },
    ko: {
      menuLabel: 'Gemini 지침',
      title: 'Gemini 지침',
      description: '더 유용한 응답을 받기 위해 당신의 정보와 선호도를 공유하세요. 여기에 새 정보를 추가하거나 채팅 중 Gemini에게 기억해달라고 요청하세요.',
      addBtn: '추가',
      showExamples: '예시 보기',
      emptyState: '아직 추가한 지침이 없습니다',
      placeholder: '지침을 입력하세요...',
      exampleTitle: '예시 지침',
      exampleClose: '닫기',
      injectionError: '주입 실패',
      apiFormatChanged: 'Gemini API 형식이 변경되었을 수 있습니다. 확장 프로그램 업데이트가 필요합니다.',
      instructionTooLong: '지침이 너무 깁니다 (최대 5000자)',
      tooManyInstructions: '지침이 너무 많습니다 (최대 20개)',
      examples: [
        '항상 친근하고 대화하는 톤으로 응답해주세요',
        '불필요한 설명 없이 간결한 답변을 선호합니다',
        '코드를 작성할 때 항상 주석을 포함해주세요',
        '저는 Python과 JavaScript로 작업하는 소프트웨어 개발자입니다'
      ]
    }
  };

  function getLanguage() {
    const lang = document.documentElement.lang || 'en';
    return lang.startsWith('ko') ? 'ko' : 'en';
  }

  function t(key) {
    const lang = getLanguage();
    return TRANSLATIONS[lang]?.[key] || TRANSLATIONS.en[key];
  }

  // ============================================
  // Settings Storage
  // ============================================

  function getSettingsSync() {
    return new Promise((resolve) => {
      chrome.storage.sync.get([STORAGE_KEYS.enabled, STORAGE_KEYS.instructions], (result) => {
        resolve({
          enabled: result[STORAGE_KEYS.enabled] ?? true,
          instructions: result[STORAGE_KEYS.instructions] || []
        });
      });
    });
  }

  async function saveSettings(enabled, instructions) {
    return new Promise((resolve) => {
      chrome.storage.sync.set({
        [STORAGE_KEYS.enabled]: enabled,
        [STORAGE_KEYS.instructions]: instructions
      }, resolve);
    });
  }

  // ============================================
  // Page Script Injection
  // ============================================

  function injectPageScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = function() {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
    console.log('[GSP] Page script injected');
  }

  async function syncSettingsToPage() {
    const settings = await getSettingsSync();
    document.documentElement.dataset.gspSettings = JSON.stringify(settings);
    document.documentElement.dataset.gspReady = 'true';
    console.log('[GSP] Settings synced:', { enabled: settings.enabled, count: settings.instructions.length });
  }

  // ============================================
  // Settings Menu Integration
  // ============================================

  function injectSettingsMenuItem() {
    const observer = new MutationObserver(() => {
      const menu = document.querySelector(SELECTORS.settingsMenu);
      const menuContent = menu?.querySelector(SELECTORS.settingsMenuContent);

      if (menuContent && !menuContent.querySelector('#gsp-menu-item')) {
        console.log('[GSP] Injecting menu item...');

        const menuItem = document.createElement('button');
        menuItem.id = 'gsp-menu-item';
        menuItem.className = 'mat-mdc-menu-item mat-focus-indicator';
        menuItem.setAttribute('mat-menu-item', '');
        menuItem.setAttribute('role', 'menuitem');
        menuItem.setAttribute('tabindex', '0');
        menuItem.setAttribute('aria-disabled', 'false');

        const icon = document.createElement('mat-icon');
        icon.className = 'mat-icon notranslate gds-icon-l google-symbols mat-ligature-font mat-icon-no-color';
        icon.setAttribute('role', 'img');
        icon.setAttribute('aria-hidden', 'true');
        icon.setAttribute('fonticon', 'tune');
        icon.setAttribute('data-mat-icon-type', 'font');
        icon.setAttribute('data-mat-icon-name', 'tune');

        const labelContainer = document.createElement('span');
        labelContainer.className = 'mat-mdc-menu-item-text';

        const label = document.createElement('span');
        label.className = 'gds-label-l';
        label.textContent = t('menuLabel');
        labelContainer.appendChild(label);

        const ripple = document.createElement('div');
        ripple.setAttribute('matripple', '');
        ripple.className = 'mat-ripple mat-mdc-menu-ripple';

        menuItem.appendChild(icon);
        menuItem.appendChild(labelContainer);
        menuItem.appendChild(ripple);

        menuItem.addEventListener('click', (e) => {
          e.stopPropagation();
          openSettingsPage();
          const backdrop = document.querySelector('.cdk-overlay-backdrop');
          if (backdrop) backdrop.click();
        });

        menuContent.appendChild(menuItem);
        console.log('[GSP] Menu item injected');
      }
    });

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      const bodyObserver = new MutationObserver(() => {
        if (document.body) {
          bodyObserver.disconnect();
          observer.observe(document.body, { childList: true, subtree: true });
        }
      });
      bodyObserver.observe(document.documentElement, { childList: true });
    }
  }

  // ============================================
  // Settings Page UI
  // ============================================

  let currentSettings = { enabled: true, instructions: [] };

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async function openSettingsPage() {
    if (document.getElementById('gsp-page')) return;

    currentSettings = await getSettingsSync();

    const overlay = document.createElement('div');
    overlay.id = 'gsp-page';
    overlay.className = 'gsp-page-overlay';

    const page = document.createElement('div');
    page.className = 'gsp-page';

    page.innerHTML = `
      <button class="gsp-back-btn" id="gsp-back">
        <span class="google-symbols">arrow_back</span>
      </button>
      <div class="gsp-page-content">
        <div class="gsp-page-header">
          <h1 class="gsp-page-title">${t('title')}</h1>
          <label class="gsp-switch">
            <input type="checkbox" id="gsp-enabled" ${currentSettings.enabled ? 'checked' : ''}>
            <span class="gsp-slider"></span>
          </label>
        </div>
        <p class="gsp-page-description">${t('description')}</p>
        <div class="gsp-actions">
          <button class="gsp-action-btn gsp-add-btn" id="gsp-add">
            <span class="google-symbols">add</span>
            ${t('addBtn')}
          </button>
          <button class="gsp-action-btn gsp-examples-btn" id="gsp-examples">
            ${t('showExamples')}
          </button>
        </div>
        <div class="gsp-instructions-list" id="gsp-instructions-list">
          ${renderInstructionsList()}
        </div>
      </div>
    `;

    overlay.appendChild(page);
    document.body.appendChild(overlay);

    // Event listeners
    document.getElementById('gsp-back').addEventListener('click', closeSettingsPage);
    document.getElementById('gsp-add').addEventListener('click', showAddDialog);
    document.getElementById('gsp-examples').addEventListener('click', showExamplesDialog);
    document.getElementById('gsp-enabled').addEventListener('change', handleToggleChange);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSettingsPage();
    });

    document.addEventListener('keydown', handleEscKey);

    // Add delete button listeners
    attachDeleteListeners();
  }

  function renderInstructionsList() {
    if (currentSettings.instructions.length === 0) {
      return `<div class="gsp-empty-state">${t('emptyState')}</div>`;
    }

    return currentSettings.instructions.map((instruction, index) => `
      <div class="gsp-instruction-item" data-index="${index}">
        <span class="gsp-instruction-text">${escapeHtml(instruction)}</span>
        <button class="gsp-delete-btn" data-index="${index}">
          <span class="google-symbols">delete</span>
        </button>
      </div>
    `).join('');
  }

  function attachDeleteListeners() {
    document.querySelectorAll('.gsp-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        currentSettings.instructions.splice(index, 1);
        await saveAndRefresh();
      });
    });
  }

  async function handleToggleChange(e) {
    currentSettings.enabled = e.target.checked;
    await saveSettings(currentSettings.enabled, currentSettings.instructions);
    await syncSettingsToPage();
  }

  async function saveAndRefresh() {
    await saveSettings(currentSettings.enabled, currentSettings.instructions);
    await syncSettingsToPage();

    const list = document.getElementById('gsp-instructions-list');
    if (list) {
      list.innerHTML = renderInstructionsList();
      attachDeleteListeners();
    }
  }

  function showAddDialog() {
    if (document.getElementById('gsp-dialog')) return;

    const dialog = document.createElement('div');
    dialog.id = 'gsp-dialog';
    dialog.className = 'gsp-dialog-overlay';

    dialog.innerHTML = `
      <div class="gsp-dialog">
        <textarea class="gsp-dialog-input" id="gsp-new-instruction" placeholder="${t('placeholder')}" rows="4"></textarea>
        <div class="gsp-dialog-actions">
          <button class="gsp-dialog-btn gsp-dialog-cancel" id="gsp-dialog-cancel">${getLanguage() === 'ko' ? '취소' : 'Cancel'}</button>
          <button class="gsp-dialog-btn gsp-dialog-save" id="gsp-dialog-save">${t('addBtn')}</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    const input = document.getElementById('gsp-new-instruction');
    input.focus();

    document.getElementById('gsp-dialog-cancel').addEventListener('click', closeDialog);
    document.getElementById('gsp-dialog-save').addEventListener('click', async () => {
      const value = input.value.trim();
      if (value) {
        // Validate input length
        if (value.length > LIMITS.maxInstructionLength) {
          showErrorToast(t('instructionTooLong'));
          return;
        }
        // Validate instruction count
        if (currentSettings.instructions.length >= LIMITS.maxInstructionsCount) {
          showErrorToast(t('tooManyInstructions'));
          return;
        }
        currentSettings.instructions.push(value);
        await saveAndRefresh();
      }
      closeDialog();
    });

    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) closeDialog();
    });

    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const value = input.value.trim();
        if (value) {
          // Validate input length
          if (value.length > LIMITS.maxInstructionLength) {
            showErrorToast(t('instructionTooLong'));
            return;
          }
          // Validate instruction count
          if (currentSettings.instructions.length >= LIMITS.maxInstructionsCount) {
            showErrorToast(t('tooManyInstructions'));
            return;
          }
          currentSettings.instructions.push(value);
          await saveAndRefresh();
        }
        closeDialog();
      }
    });
  }

  function showExamplesDialog() {
    if (document.getElementById('gsp-dialog')) return;

    const examples = t('examples');
    const dialog = document.createElement('div');
    dialog.id = 'gsp-dialog';
    dialog.className = 'gsp-dialog-overlay';

    dialog.innerHTML = `
      <div class="gsp-dialog gsp-examples-dialog">
        <h3 class="gsp-dialog-title">${t('exampleTitle')}</h3>
        <div class="gsp-examples-list">
          ${examples.map(ex => `
            <button class="gsp-example-item">
              <span>${escapeHtml(ex)}</span>
              <span class="google-symbols">add</span>
            </button>
          `).join('')}
        </div>
        <div class="gsp-dialog-actions">
          <button class="gsp-dialog-btn gsp-dialog-close" id="gsp-dialog-close">${t('exampleClose')}</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    document.getElementById('gsp-dialog-close').addEventListener('click', closeDialog);

    dialog.querySelectorAll('.gsp-example-item').forEach((item, index) => {
      item.addEventListener('click', async () => {
        // Validate instruction count
        if (currentSettings.instructions.length >= LIMITS.maxInstructionsCount) {
          showErrorToast(t('tooManyInstructions'));
          return;
        }
        currentSettings.instructions.push(examples[index]);
        await saveAndRefresh();
        closeDialog();
      });
    });

    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) closeDialog();
    });
  }

  function closeDialog() {
    const dialog = document.getElementById('gsp-dialog');
    if (dialog) dialog.remove();
  }

  function handleEscKey(e) {
    if (e.key === 'Escape') {
      const dialog = document.getElementById('gsp-dialog');
      if (dialog) {
        closeDialog();
      } else {
        closeSettingsPage();
      }
    }
  }

  function closeSettingsPage() {
    const page = document.getElementById('gsp-page');
    if (page) {
      page.remove();
      document.removeEventListener('keydown', handleEscKey);
    }
  }

  // ============================================
  // Error Toast Notification
  // ============================================

  function showErrorToast(message) {
    const existingToast = document.getElementById('gsp-error-toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.id = 'gsp-error-toast';
    toast.className = 'gsp-error-toast';
    toast.textContent = `${t('injectionError')}: ${message}`;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('gsp-toast-fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }

  function listenForInjectionErrors() {
    window.addEventListener('gsp-injection-failed', (e) => {
      const error = e.detail?.error;
      if (error === 'api_format_changed') {
        showErrorToast(t('apiFormatChanged'));
      } else {
        showErrorToast(error || 'Unknown error');
      }
    });
  }

  // ============================================
  // Initialization
  // ============================================

  async function init() {
    console.log('[GSP] Content script initializing...');

    await syncSettingsToPage();
    injectPageScript();
    injectSettingsMenuItem();
    listenForInjectionErrors();

    chrome.storage.onChanged.addListener(async () => {
      await syncSettingsToPage();
    });

    console.log('[GSP] Content script initialized');
  }

  init();
})();
