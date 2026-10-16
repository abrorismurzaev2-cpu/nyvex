/**
 * NYVEX — chat/controls.js
 */
import { $, isMobile } from '../core/utils.js';
import { toast } from '../core/toast.js';
import { getCurrentChat, addMessageToCurrent } from './history.js';
import { appendMessage, showTyping, removeTyping, appendMessageStream } from './messages.js';
import { generateReply } from '../ai/chat.js';
import {
  canSendMessage,
  showPaymentModal,
  getCachedState,
  refreshTrialCache,
} from '../core/trial.js';
import { notifyResponseReady, ensureNotificationPermission } from '../ui/notifications.js';

let isGenerating = false;
let deepThinking = false;
const THINK_KEY = 'nyvex_think_mode';

function loadThinkMode() {
  try {
    return localStorage.getItem(THINK_KEY) === '1';
  } catch {
    return false;
  }
}

function saveThinkMode(on) {
  try {
    localStorage.setItem(THINK_KEY, on ? '1' : '0');
  } catch {}
}

export function isDeepThinking() {
  return deepThinking;
}

export function setDeepThinking(on) {
  deepThinking = !!on;
  saveThinkMode(deepThinking);
  applyThinkUI();
}

function applyThinkUI() {
  const thinkToggle = document.getElementById('thinkToggle');
  if (!thinkToggle) return;
  thinkToggle.classList.toggle('on', deepThinking);
  thinkToggle.setAttribute('aria-pressed', deepThinking ? 'true' : 'false');
  thinkToggle.title = deepThinking
    ? 'Deep Thinking включён — нажмите чтобы выключить'
    : 'Deep Thinking — глубокое размышление';
}

function toggleThink(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  deepThinking = !deepThinking;
  saveThinkMode(deepThinking);
  applyThinkUI();
  try {
    toast(deepThinking ? 'Deep Thinking включён' : 'Deep Thinking выключен');
  } catch {}
  console.log('[nyvex] think mode', deepThinking);
}

export function initControls() {
  const composerInput = $('composerInput');
  const sendBtn = $('sendBtn');
  const thinkToggle = document.getElementById('thinkToggle');

  deepThinking = loadThinkMode();
  applyThinkUI();

  // Multiple event types for stubborn WebViews / APK
  if (thinkToggle) {
    thinkToggle.type = 'button';
    thinkToggle.addEventListener('click', toggleThink, true);
    thinkToggle.addEventListener('touchend', (e) => {
      e.preventDefault();
      toggleThink(e);
    }, { passive: false });
  }

  // Event delegation backup (captures clicks even if node replaced)
  document.addEventListener(
    'click',
    (e) => {
      const btn = e.target && e.target.closest && e.target.closest('#thinkToggle');
      if (!btn) return;
      // only if direct handler somehow missed
    },
    false
  );

  composerInput?.addEventListener('input', () => {
    autoResize();
    updateSendBtn();
  });

  composerInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isMobile()) {
      e.preventDefault();
      if (sendBtn?.classList.contains('enabled') && !isGenerating) sendMessage();
    }
  });

  composerInput?.addEventListener('click', async () => {
    const state = getCachedState() || (await refreshTrialCache());
    if (!canSendMessage(state)) showPaymentModal();
  });

  
  // Keep input visible above soft keyboard (Android / iOS)
  composerInput?.addEventListener('focus', () => {
    setTimeout(() => {
      try {
        composerInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {}
    }, 300);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      if (document.activeElement === composerInput) {
        try {
          composerInput.scrollIntoView({ block: 'center' });
        } catch {}
      }
    });
  }

  sendBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isGenerating) sendMessage();
  });

  $('chatInner')?.addEventListener('click', onMsgAction);
}

function autoResize() {
  const el = $('composerInput');
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}

function updateSendBtn() {
  const sendBtn = $('sendBtn');
  const composerInput = $('composerInput');
  if (!sendBtn || !composerInput) return;
  const state = getCachedState();
  const allowed = !state || canSendMessage(state);
  const ok = allowed && composerInput.value.trim().length > 0 && !isGenerating;
  sendBtn.classList.toggle('enabled', ok);
  sendBtn.disabled = isGenerating || !allowed;
}

async function sendMessage() {
  if (isGenerating) return;

  const state = getCachedState() || (await refreshTrialCache());
  if (!canSendMessage(state)) {
    showPaymentModal();
    toast('Оформите подписку чтобы продолжить');
    return;
  }

  const input = $('composerInput');
  const text = input?.value?.trim();
  if (!text) return;

  const chat = getCurrentChat();
  if (!chat) return;

  // Snapshot think mode at send time
  const useThink = deepThinking;

  addMessageToCurrent('user', text);
  appendMessage('user', text);
  if (input) {
    input.value = '';
    autoResize();
  }

  isGenerating = true;
  updateSendBtn();
  showTyping(useThink ? 'Думает глубоко…' : 'Думает…');
  ensureNotificationPermission().catch(() => {});

  try {
    const history = (chat.messages || []).slice(0, -1);
    const result = await generateReply(text, history, { deepThinking: useThink });
    removeTyping();
    const answer = typeof result === 'string' ? result : result.answer;
    const thinking = typeof result === 'object' ? result.thinking : null;
    const ms = typeof result === 'object' ? result.ms : 0;
    addMessageToCurrent('ai', answer, { thinking, thinkingMs: ms });
    if (answer && answer.length > 40) {
      await appendMessageStream(answer, { thinking, thinkingMs: ms });
    } else {
      appendMessage('ai', answer, true, { thinking, thinkingMs: ms });
    }
    notifyResponseReady();
  } catch (e) {
    console.error('sendMessage', e);
    removeTyping();
    const err = 'Не удалось получить ответ. Попробуйте ещё раз.';
    addMessageToCurrent('ai', err);
    appendMessage('ai', err);
  } finally {
    isGenerating = false;
    updateSendBtn();
  }
}

function onMsgAction(e) {
  const thinkBtn = e.target.closest('[data-think-toggle]');
  if (thinkBtn) {
    e.preventDefault();
    e.stopPropagation();
    thinkBtn.closest('.think-block')?.classList.toggle('collapsed');
    return;
  }

  const btn = e.target.closest('.msg-act');
  if (!btn) return;
  const act = btn.dataset.act;
  const msg = btn.closest('.msg');
  const text = msg?.dataset.msgText || '';

  if (act === 'copy') {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => toast('Скопировано')).catch(() => toast('Ошибка'));
    }
  } else if (act === 'like') {
    msg.querySelector('[data-act="dislike"]')?.classList.remove('active');
    btn.classList.toggle('active');
  } else if (act === 'dislike') {
    msg.querySelector('[data-act="like"]')?.classList.remove('active');
    btn.classList.toggle('active');
  }
}
