/**
 * NYVEX — chat/controls.js
 * Копирование, лайк/дизлайк, composer
 */

import { $, isMobile } from '../core/utils.js';
import { toast } from '../core/toast.js';
import { getCurrentChat, addMessageToCurrent } from './history.js';
import { appendMessage, showTyping, removeTyping } from './messages.js';
import { generateReply } from '../ai/chat.js';

let isGenerating = false;

export function initControls() {
  const composerInput = $('composerInput');
  const sendBtn = $('sendBtn');

  composerInput?.addEventListener('input', () => {
    autoResize();
    updateSendBtn();
  });

  composerInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isMobile()) {
      e.preventDefault();
      if (sendBtn?.classList.contains('enabled')) sendMessage();
    }
  });

  sendBtn?.addEventListener('click', sendMessage);

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
  sendBtn.classList.toggle('enabled', composerInput.value.trim().length > 0);
}

async function sendMessage() {
  if (isGenerating) return;
  const input = $('composerInput');
  const text = input?.value?.trim();
  if (!text) return;

  const chat = getCurrentChat();
  if (!chat) return;

  addMessageToCurrent('user', text);
  appendMessage('user', text);
  if (input) {
    input.value = '';
    autoResize();
    updateSendBtn();
  }

  isGenerating = true;
  showTyping();

  try {
    const history = (chat.messages || []).slice(0, -1);
    const reply = await generateReply(text, history);
    removeTyping();
    addMessageToCurrent('ai', reply);
    appendMessage('ai', reply);
  } catch (e) {
    removeTyping();
    const err = 'Ошибка: ' + String(e?.message || '').slice(0, 100);
    addMessageToCurrent('ai', err);
    appendMessage('ai', err);
  } finally {
    isGenerating = false;
  }
}

function onMsgAction(e) {
  const btn = e.target.closest('.msg-act');
  if (!btn) return;
  const act = btn.dataset.act;
  const msg = btn.closest('.msg');
  const text = msg?.dataset.msgText || '';

  if (act === 'copy') {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          btn.classList.add('active');
          toast('Скопировано');
          setTimeout(() => btn.classList.remove('active'), 900);
        })
        .catch(() => toast('Ошибка копирования'));
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        toast('Скопировано');
      } catch {
        toast('Ошибка');
      }
      ta.remove();
    }
  } else if (act === 'like') {
    const d = msg.querySelector('[data-act="dislike"]');
    d?.classList.remove('active');
    btn.classList.toggle('active');
    toast(btn.classList.contains('active') ? 'Спасибо!' : 'Снято');
  } else if (act === 'dislike') {
    const l = msg.querySelector('[data-act="like"]');
    l?.classList.remove('active');
    btn.classList.toggle('active');
    toast(btn.classList.contains('active') ? 'Учтём!' : 'Снято');
  }
}
