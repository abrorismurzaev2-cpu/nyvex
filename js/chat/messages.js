/**
 * NYVEX — chat/messages.js
 */
import { $, escapeHtml, renderMarkdown, scrollBottom } from '../core/utils.js';
import { isModelReady } from '../ai/loader.js';
import { LOGO_SVG } from '../core/config.js';

export function renderWelcome() {
  const inner = $('chatInner');
  if (!inner) return;
  const ready = isModelReady();
  inner.innerHTML = `
    <div class="welcome">
      <div class="welcome-logo">${LOGO_SVG}</div>
      <div class="welcome-brand">NYVEX</div>
      <div class="welcome-title">Привет! <span>Чем помочь?</span></div>
      <div class="welcome-sub">7 дней бесплатно · без регистрации · AI на устройстве</div>
      <div class="welcome-status ${ready ? '' : 'loading'}">
        <span class="st-dot"></span>
        <span>${ready ? 'AI готов' : 'Загрузка AI…'}</span>
      </div>
    </div>`;
}

export function appendMessage(role, text, animate = true, meta = null) {
  const inner = $('chatInner');
  if (!inner) return null;
  inner.querySelector('.welcome')?.remove();

  const msg = document.createElement('div');
  msg.className = 'msg ' + role;
  if (!animate) msg.style.animation = 'none';

  const avatar =
    role === 'ai'
      ? LOGO_SVG
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>`;

  const name = role === 'ai' ? `NYVEX <span class="tag">ai</span>` : 'Вы';

  let thinkingHtml = '';
  if (role === 'ai' && meta?.thinking) {
    const sec = meta.thinkingMs != null ? (meta.thinkingMs / 1000).toFixed(1) : '';
    thinkingHtml = `
      <div class="think-block collapsed">
        <button type="button" class="think-head" data-think-toggle>
          <div class="think-icn">${LOGO_SVG}</div>
          <span class="think-label">Размышления</span>
          <span class="think-time">${sec ? 'Думал ' + sec + ' сек' : ''}</span>
          <span class="think-caret"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6"/></svg></span>
        </button>
        <div class="think-body">${escapeHtml(meta.thinking)}</div>
      </div>`;
  }

  msg.innerHTML = `
    <div class="msg-av">${avatar}</div>
    <div class="msg-body">
      <div class="msg-name">${name}</div>
      ${thinkingHtml}
      <div class="msg-text" data-text></div>
      ${
        role === 'ai'
          ? `<div class="msg-actions">
          <button type="button" class="msg-act" data-act="copy" title="Копировать">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <button type="button" class="msg-act" data-act="like" title="Нравится"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 10v12M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88z"/></svg></button>
          <button type="button" class="msg-act" data-act="dislike" title="Не нравится"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 14V2M9 18.12L10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88z"/></svg></button>
        </div>`
          : ''
      }
    </div>`;

  msg.dataset.msgText = text || '';
  const textEl = msg.querySelector('[data-text]');
  if (textEl) textEl.innerHTML = renderMarkdown(text || '');

  msg.querySelector('[data-think-toggle]')?.addEventListener('click', (e) => {
    e.preventDefault();
    msg.querySelector('.think-block')?.classList.toggle('collapsed');
  });

  inner.appendChild(msg);
  if (animate) scrollBottom($('chatScroll'));
  return msg;
}

export function showTyping(label) {
  removeTyping();
  const inner = $('chatInner');
  if (!inner) return null;
  const typing = document.createElement('div');
  typing.className = 'msg ai';
  typing.id = 'typingIndicator';
  const lbl = label || 'Думает…';
  typing.innerHTML = `
    <div class="msg-av">${LOGO_SVG}</div>
    <div class="msg-body">
      <div class="msg-name">NYVEX <span class="tag">ai</span></div>
      <div class="typing"><span></span><span></span><span></span></div>
      <div class="typing-label" id="typingLabel">${lbl}</div>
    </div>`;
  inner.appendChild(typing);
  scrollBottom($('chatScroll'));
  setTimeout(() => {
    const el = document.getElementById('typingLabel');
    if (el) el.textContent = 'Печатает…';
  }, 2000);
  return typing;
}

export function removeTyping() {
  $('typingIndicator')?.remove();
}

/** Progressive reveal of AI answer */
export async function appendMessageStream(text, meta = null) {
  const msg = appendMessage('ai', '', true, meta);
  const textEl = msg?.querySelector('[data-text]');
  if (!textEl) return msg;
  const full = String(text || '');
  const parts = full.split(/(\s+)/);
  let acc = '';
  const step = Math.max(1, Math.ceil(parts.length / 36));
  for (let i = 0; i < parts.length; i += step) {
    acc += parts.slice(i, i + step).join('');
    textEl.innerHTML = renderMarkdown(acc) + '<span class="stream-caret"></span>';
    scrollBottom($('chatScroll'));
    await new Promise((r) => setTimeout(r, 24));
  }
  textEl.innerHTML = renderMarkdown(full);
  if (msg) msg.dataset.msgText = full;
  scrollBottom($('chatScroll'));
  return msg;
}
