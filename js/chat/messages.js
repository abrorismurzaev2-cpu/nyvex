/**
 * NYVEX — chat/messages.js
 * Рендер сообщений и welcome
 */

import { $, escapeHtml, renderMarkdown, scrollBottom } from '../core/utils.js';
import { getDisplayName, getAvatar } from '../auth/profile.js';
import { isModelReady } from '../ai/loader.js';

const LOGO_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="12" rx="10" ry="3.5" transform="rotate(-28 12 12)"/><path d="M12 3 L12 21"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/></svg>`;

export function renderWelcome() {
  const inner = $('chatInner');
  if (!inner) return;
  const name = getDisplayName();
  const ready = isModelReady();
  inner.innerHTML = `
    <div class="welcome">
      <div class="welcome-logo">${LOGO_SVG}</div>
      <div class="welcome-brand">NYVEX</div>
      <div class="welcome-title">Привет, ${escapeHtml(name)}! <span>Чем помочь?</span></div>
      <div class="welcome-sub">Локальный AI-чат. Ответы генерируются на устройстве — без серверов.</div>
      <div class="welcome-status ${ready ? '' : 'loading'}">
        <span class="st-dot"></span>
        <span>${ready ? 'Модель готова' : 'Модель загружается…'}</span>
      </div>
    </div>`;
}

export function appendMessage(role, text, animate = true) {
  const inner = $('chatInner');
  if (!inner) return null;

  const welcome = inner.querySelector('.welcome');
  if (welcome) welcome.remove();

  const userName = getDisplayName() === 'друг' ? 'Вы' : getDisplayName();
  const userAv = getAvatar();

  const msg = document.createElement('div');
  msg.className = 'msg ' + role;
  if (!animate) msg.style.animation = 'none';

  let avatar;
  if (role === 'ai') {
    avatar = LOGO_SVG;
  } else if (userAv) {
    avatar = `<img src="${userAv}" alt="">`;
  } else {
    avatar = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>`;
  }

  const name =
    role === 'ai'
      ? `NYVEX <span class="tag">nyvex</span>`
      : escapeHtml(userName);

  msg.innerHTML = `
    <div class="msg-av">${avatar}</div>
    <div class="msg-body">
      <div class="msg-name">${name}</div>
      <div class="msg-text" data-text></div>
      ${
        role === 'ai'
          ? `
        <div class="msg-actions">
          <button type="button" class="msg-act" data-act="copy" title="Копировать">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <button type="button" class="msg-act" data-act="like" title="Хороший ответ">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88z"/></svg>
          </button>
          <button type="button" class="msg-act" data-act="dislike" title="Плохой ответ">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14V2M9 18.12L10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88z"/></svg>
          </button>
        </div>`
          : ''
      }
    </div>`;

  msg.dataset.msgText = text || '';
  const textEl = msg.querySelector('[data-text]');
  if (textEl) {
    textEl.innerHTML = renderMarkdown(text || '');
    if (!text) textEl.style.display = 'none';
  }

  inner.appendChild(msg);
  if (animate) scrollBottom($('chatScroll'));
  return msg;
}

export function showTyping() {
  const inner = $('chatInner');
  if (!inner) return null;
  const typing = document.createElement('div');
  typing.className = 'msg ai';
  typing.id = 'typingIndicator';
  typing.innerHTML = `
    <div class="msg-av">${LOGO_SVG}</div>
    <div class="msg-body">
      <div class="msg-name">NYVEX <span class="tag">nyvex</span></div>
      <div class="typing"><span></span><span></span><span></span></div>
    </div>`;
  inner.appendChild(typing);
  scrollBottom($('chatScroll'));
  return typing;
}

export function removeTyping() {
  $('typingIndicator')?.remove();
}
