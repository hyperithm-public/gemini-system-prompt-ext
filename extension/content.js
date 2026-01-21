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
    maxInstructionLength: 20000,
    maxInstructionsCount: 20
  };

  // Debug mode - set to true for development logging
  const DEBUG = false;

  function log(...args) {
    if (DEBUG) console.log('[GSP]', ...args);
  }

  function logError(...args) {
    if (DEBUG) console.error('[GSP]', ...args);
  }

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
      instructionTooLong: 'Instruction too long (max 20000 characters)',
      tooManyInstructions: 'Too many instructions (max 20)',
      unknownError: 'An unexpected error occurred',
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
      instructionTooLong: '지침이 너무 깁니다 (최대 20000자)',
      tooManyInstructions: '지침이 너무 많습니다 (최대 20개)',
      unknownError: '예기치 않은 오류가 발생했습니다',
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
      log('Page script injected');
    };
    script.onerror = function() {
      this.remove();
      logError('Failed to inject page script - CSP may be blocking');
      showErrorToast(getLanguage() === 'ko'
        ? '스크립트 로드 실패 - 페이지를 새로고침해 주세요'
        : 'Script load failed - please refresh the page');
    };
    (document.head || document.documentElement).appendChild(script);
  }

  async function syncSettingsToPage() {
    const settings = await getSettingsSync();
    document.documentElement.dataset.gspSettings = JSON.stringify(settings);
    document.documentElement.dataset.gspReady = 'true';
    log('Settings synced:', { enabled: settings.enabled, count: settings.instructions.length });
  }

  // ============================================
  // Settings Menu Integration
  // ============================================

  function injectSettingsMenuItem() {
    const observer = new MutationObserver(() => {
      const menu = document.querySelector(SELECTORS.settingsMenu);
      const menuContent = menu?.querySelector(SELECTORS.settingsMenuContent);

      if (menuContent && !menuContent.querySelector('#gsp-menu-item')) {
        log('Injecting menu item...');

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
        log('Menu item injected');
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

  /**
   * Create settings page structure using DOM APIs (XSS-safe)
   */
  function createSettingsPageContent(enabled) {
    const page = document.createElement('div');
    page.className = 'gsp-page';

    // Back button
    const backBtn = document.createElement('button');
    backBtn.className = 'gsp-back-btn';
    backBtn.id = 'gsp-back';
    const backIcon = document.createElement('span');
    backIcon.className = 'google-symbols';
    backIcon.textContent = 'arrow_back';
    backBtn.appendChild(backIcon);

    // Page content container
    const pageContent = document.createElement('div');
    pageContent.className = 'gsp-page-content';

    // Header
    const header = document.createElement('div');
    header.className = 'gsp-page-header';

    const title = document.createElement('h1');
    title.className = 'gsp-page-title';
    title.textContent = t('title');

    const switchLabel = document.createElement('label');
    switchLabel.className = 'gsp-switch';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'gsp-enabled';
    checkbox.checked = enabled;

    const slider = document.createElement('span');
    slider.className = 'gsp-slider';

    switchLabel.appendChild(checkbox);
    switchLabel.appendChild(slider);
    header.appendChild(title);
    header.appendChild(switchLabel);

    // Description
    const description = document.createElement('p');
    description.className = 'gsp-page-description';
    description.textContent = t('description');

    // Actions
    const actions = document.createElement('div');
    actions.className = 'gsp-actions';

    const addBtn = document.createElement('button');
    addBtn.className = 'gsp-action-btn gsp-add-btn';
    addBtn.id = 'gsp-add';
    const addIcon = document.createElement('span');
    addIcon.className = 'google-symbols';
    addIcon.textContent = 'add';
    addBtn.appendChild(addIcon);
    addBtn.appendChild(document.createTextNode(t('addBtn')));

    const examplesBtn = document.createElement('button');
    examplesBtn.className = 'gsp-action-btn gsp-examples-btn';
    examplesBtn.id = 'gsp-examples';
    examplesBtn.textContent = t('showExamples');

    actions.appendChild(addBtn);
    actions.appendChild(examplesBtn);

    // Instructions list container
    const instructionsList = document.createElement('div');
    instructionsList.className = 'gsp-instructions-list';
    instructionsList.id = 'gsp-instructions-list';

    // Assemble page content
    pageContent.appendChild(header);
    pageContent.appendChild(description);
    pageContent.appendChild(actions);
    pageContent.appendChild(instructionsList);

    page.appendChild(backBtn);
    page.appendChild(pageContent);

    return page;
  }

  async function openSettingsPage() {
    if (document.getElementById('gsp-page')) return;

    currentSettings = await getSettingsSync();

    const overlay = document.createElement('div');
    overlay.id = 'gsp-page';
    overlay.className = 'gsp-page-overlay';

    const page = createSettingsPageContent(currentSettings.enabled);

    overlay.appendChild(page);
    document.body.appendChild(overlay);

    // Populate instructions list using DOM manipulation
    const instructionsList = document.getElementById('gsp-instructions-list');
    instructionsList.appendChild(createInstructionElements());

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

  function createInstructionElements() {
    const fragment = document.createDocumentFragment();

    if (currentSettings.instructions.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'gsp-empty-state';
      emptyState.textContent = t('emptyState');
      fragment.appendChild(emptyState);
      return fragment;
    }

    currentSettings.instructions.forEach((instruction, index) => {
      const item = document.createElement('div');
      item.className = 'gsp-instruction-item';
      item.dataset.index = index;

      const text = document.createElement('span');
      text.className = 'gsp-instruction-text';
      text.textContent = instruction;

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'gsp-delete-btn';
      deleteBtn.dataset.index = index;

      const deleteIcon = document.createElement('span');
      deleteIcon.className = 'google-symbols';
      deleteIcon.textContent = 'delete';
      deleteBtn.appendChild(deleteIcon);

      item.appendChild(text);
      item.appendChild(deleteBtn);
      fragment.appendChild(item);
    });

    return fragment;
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
      // Clear existing content using DOM manipulation
      while (list.firstChild) {
        list.removeChild(list.firstChild);
      }
      list.appendChild(createInstructionElements());
      attachDeleteListeners();
    }
  }

  /**
   * Create add dialog structure using DOM APIs (XSS-safe)
   */
  function createAddDialogContent() {
    const dialogBox = document.createElement('div');
    dialogBox.className = 'gsp-dialog';

    const textarea = document.createElement('textarea');
    textarea.className = 'gsp-dialog-input';
    textarea.id = 'gsp-new-instruction';
    textarea.placeholder = t('placeholder');
    textarea.rows = 4;

    const actions = document.createElement('div');
    actions.className = 'gsp-dialog-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'gsp-dialog-btn gsp-dialog-cancel';
    cancelBtn.id = 'gsp-dialog-cancel';
    cancelBtn.textContent = getLanguage() === 'ko' ? '취소' : 'Cancel';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'gsp-dialog-btn gsp-dialog-save';
    saveBtn.id = 'gsp-dialog-save';
    saveBtn.textContent = t('addBtn');

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);

    dialogBox.appendChild(textarea);
    dialogBox.appendChild(actions);

    return dialogBox;
  }

  function showAddDialog() {
    if (document.getElementById('gsp-dialog')) return;

    const dialog = document.createElement('div');
    dialog.id = 'gsp-dialog';
    dialog.className = 'gsp-dialog-overlay';

    dialog.appendChild(createAddDialogContent());

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

  /**
   * Create examples dialog structure using DOM APIs (XSS-safe)
   */
  function createExamplesDialogContent(examples) {
    const dialogBox = document.createElement('div');
    dialogBox.className = 'gsp-dialog gsp-examples-dialog';

    const title = document.createElement('h3');
    title.className = 'gsp-dialog-title';
    title.textContent = t('exampleTitle');

    const examplesList = document.createElement('div');
    examplesList.className = 'gsp-examples-list';

    examples.forEach(ex => {
      const btn = document.createElement('button');
      btn.className = 'gsp-example-item';

      const textSpan = document.createElement('span');
      textSpan.textContent = ex;

      const iconSpan = document.createElement('span');
      iconSpan.className = 'google-symbols';
      iconSpan.textContent = 'add';

      btn.appendChild(textSpan);
      btn.appendChild(iconSpan);
      examplesList.appendChild(btn);
    });

    const actions = document.createElement('div');
    actions.className = 'gsp-dialog-actions';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'gsp-dialog-btn gsp-dialog-close';
    closeBtn.id = 'gsp-dialog-close';
    closeBtn.textContent = t('exampleClose');

    actions.appendChild(closeBtn);

    dialogBox.appendChild(title);
    dialogBox.appendChild(examplesList);
    dialogBox.appendChild(actions);

    return dialogBox;
  }

  function showExamplesDialog() {
    if (document.getElementById('gsp-dialog')) return;

    const examples = t('examples');
    const dialog = document.createElement('div');
    dialog.id = 'gsp-dialog';
    dialog.className = 'gsp-dialog-overlay';

    dialog.appendChild(createExamplesDialogContent(examples));

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

  /**
   * Sanitize error messages to prevent leaking implementation details
   */
  function sanitizeErrorMessage(errorCode) {
    // Only show translated messages for known error types
    const knownErrors = {
      'api_format_changed': 'apiFormatChanged'
    };

    if (knownErrors[errorCode]) {
      return t(knownErrors[errorCode]);
    }
    // Generic fallback for unknown errors - don't expose raw error messages
    return t('unknownError');
  }

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
      const errorCode = e.detail?.error;
      showErrorToast(sanitizeErrorMessage(errorCode));
    });
  }

  // ============================================
  // Initialization
  // ============================================

  async function init() {
    log('Content script initializing...');

    await syncSettingsToPage();
    injectPageScript();
    injectSettingsMenuItem();
    listenForInjectionErrors();

    chrome.storage.onChanged.addListener(async () => {
      await syncSettingsToPage();
    });

    log('Content script initialized');
  }

  init();
})();
