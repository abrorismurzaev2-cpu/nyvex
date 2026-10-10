/**
 * NYVEX — chat/history.js
 */

import { storage } from '../core/storage.js';
import { $, escapeHtml, uid } from '../core/utils.js';
import { toast } from '../core/toast.js';
import { LIMITS } from '../core/config.js';
import { appendMessage, renderWelcome } from './messages.js';
import { closeSidebar } from '../ui/sidebar.js';

let currentChatId = null;
const chats = {};

export function getCurrentChatId() {
  return currentChatId;
}

export function getChats() {
  return chats;
}

export function loadHistory() {
  try {
    const stored = storage.getChats();
    Object.keys(chats).forEach((k) => delete chats[k]);
    Object.assign(chats, stored || {});
  } catch {
    /* ignore */
  }
  renderHistory();
}

export function saveHistory() {
  const settings = storage.getSettings();
  if (settings && settings.history === false) return;
  storage.setChats(chats);
}

export function renderHistory() {
  const list = $('sbList');
  if (!list) return;

  const ids = Object.keys(chats).sort((a, b) => (chats[b].createdAt || 0) - (chats[a].createdAt || 0));
  if (!ids.length) {
    list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--dim-2);font-size:12.5px;font-weight:500;">Нет сохранённых чатов</div>`;
    return;
  }

  list.innerHTML = '';
  ids.forEach((id) => {
    const c = chats[id];
    const el = document.createElement('div');
    el.className = 'sb-chat' + (id === currentChatId ? ' active' : '');
    el.dataset.id = id;
    el.innerHTML = `
      <svg class="sb-icn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <div class="sb-chat-title">${escapeHtml(c.title || 'Новый чат')}</div>
      <button type="button" class="sb-chat-more" data-more="${id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="6" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="18" r="1"/></svg>
      </button>`;
    el.addEventListener('click', (e) => {
      if (e.target.closest('.sb-chat-more')) return;
      openChat(id);
    });
    el.querySelector('.sb-chat-more')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openChatMenu(id, e.currentTarget);
    });
    list.appendChild(el);
  });
}

export function newChat() {
  const id = uid('chat');
  chats[id] = { id, title: 'Новый чат', messages: [], createdAt: Date.now() };
  currentChatId = id;
  saveHistory();
  renderHistory();
  renderWelcome();
  const titleEl = $('chatTitle');
  if (titleEl) titleEl.textContent = 'Новый чат';
  closeSidebar();
}

export function openChat(id) {
  if (!chats[id]) return;
  currentChatId = id;
  renderHistory();
  const c = chats[id];
  const titleEl = $('chatTitle');
  if (titleEl) titleEl.textContent = c.title || 'Новый чат';
  const inner = $('chatInner');
  if (inner) inner.innerHTML = '';
  if (!c.messages || c.messages.length === 0) {
    renderWelcome();
  } else {
    c.messages.forEach((m) => appendMessage(m.role, m.text, false, m.thinking ? { thinking: m.thinking, thinkingMs: m.thinkingMs } : null));
  }
  const sc = $('chatScroll');
  if (sc) sc.scrollTop = sc.scrollHeight;
  closeSidebar();
}

export function getCurrentChat() {
  return chats[currentChatId] || null;
}

export function addMessageToCurrent(role, text, meta = null) {
  const chat = getCurrentChat();
  if (!chat) return;
  if (!chat.messages) chat.messages = [];
  if (chat.messages.length === 0 && role === 'user') {
    chat.title = text.slice(0, LIMITS.chatTitleMax) + (text.length > LIMITS.chatTitleMax ? '…' : '');
    const titleEl = $('chatTitle');
    if (titleEl) titleEl.textContent = chat.title;
  }
  const msg = { role, text };
  if (meta?.thinking) msg.thinking = meta.thinking;
  if (meta?.thinkingMs != null) msg.thinkingMs = meta.thinkingMs;
  chat.messages.push(msg);
  saveHistory();
  renderHistory();
}

export function clearAllHistory() {
  Object.keys(chats).forEach((k) => delete chats[k]);
  saveHistory();
  newChat();
  toast('История очищена');
}

/* Context menu */
let ctxChatId = null;

export function openChatMenu(id, anchor) {
  const ctxMenu = $('ctxMenu');
  if (!ctxMenu || !anchor) return;
  ctxChatId = id;
  const r = anchor.getBoundingClientRect();
  ctxMenu.style.left = Math.min(r.left, window.innerWidth - 210) + 'px';
  ctxMenu.style.top = r.bottom + 4 + 'px';
  ctxMenu.classList.add('show');
  requestAnimationFrame(() => {
    const mr = ctxMenu.getBoundingClientRect();
    if (mr.bottom > window.innerHeight - 10) {
      ctxMenu.style.top = r.top - mr.height - 4 + 'px';
    }
  });
}

export function closeChatMenu() {
  $('ctxMenu')?.classList.remove('show');
  ctxChatId = null;
}

export function initChatMenu() {
  const ctxMenu = $('ctxMenu');
  document.addEventListener(
    'click',
    (e) => {
      if (!e.target.closest('.ctx-menu') && !e.target.closest('.sb-chat-more')) {
        closeChatMenu();
      }
    },
    { passive: true }
  );

  ctxMenu?.querySelectorAll('.ctx-item').forEach((item) => {
    item.addEventListener('click', () => {
      const act = item.dataset.act;
      const id = ctxChatId;
      closeChatMenu();
      if (!id || !chats[id]) return;

      if (act === 'rename') {
        const next = prompt('Новое имя чата:', chats[id].title || 'Новый чат');
        if (next === null) return;
        const t = next.trim().slice(0, LIMITS.chatTitleMax);
        if (!t) {
          toast('Имя не может быть пустым');
          return;
        }
        chats[id].title = t;
        saveHistory();
        renderHistory();
        if (currentChatId === id) {
          const titleEl = $('chatTitle');
          if (titleEl) titleEl.textContent = t;
        }
        toast('Чат переименован');
      } else if (act === 'duplicate') {
        const c = chats[id];
        const nid = uid('chat');
        chats[nid] = {
          id: nid,
          title: (c.title || 'Чат') + ' (копия)',
          messages: JSON.parse(JSON.stringify(c.messages || [])),
          createdAt: Date.now(),
        };
        saveHistory();
        renderHistory();
        toast('Чат дублирован');
      } else if (act === 'delete') {
        if (!confirm('Удалить чат «' + (chats[id].title || 'Новый чат') + '»?')) return;
        delete chats[id];
        saveHistory();
        if (currentChatId === id) newChat();
        else renderHistory();
        toast('Чат удалён');
      }
    });
  });
}
