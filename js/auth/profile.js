/**
 * NYVEX — auth/profile.js
 */

import { storage } from '../core/storage.js';
import { $, escapeHtml } from '../core/utils.js';
import { toast } from '../core/toast.js';
import { LIMITS } from '../core/config.js';

export function loadUserUI() {
  const u = storage.getUser() || {};
  const name = u.name || (u.email ? u.email.split('@')[0] : 'Гость');
  const av = u.avatar;

  const userName = $('userName');
  if (userName) userName.textContent = name;

  const avEl = $('userAv');
  if (avEl) {
    if (av) avEl.innerHTML = `<img src="${av}" alt="">`;
    else avEl.textContent = (name[0] || '?').toUpperCase();
  }

  const userPlan = $('userPlan');
  if (userPlan) {
    userPlan.innerHTML = `<span class="pro-dot"></span> Pro`;
  }

  const profileName = $('profileName');
  if (profileName) {
    profileName.innerHTML = `${escapeHtml(name)} <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  }

  const profileEmail = $('profileEmail');
  if (profileEmail) profileEmail.textContent = u.email || 'guest@nyvex';

  const pAv = $('profileAv');
  if (pAv) {
    if (av) pAv.innerHTML = `<img src="${av}" alt="">`;
    else pAv.textContent = (name[0] || '?').toUpperCase();
  }
}

export function initProfileEdit() {
  const block = $('profileBlock');
  block?.addEventListener('click', () => {
    const u = storage.getUser() || {};
    const next = prompt('Новое имя:', u.name || '');
    if (next === null) return;
    const t = next.trim().slice(0, LIMITS.nameMax);
    if (t.length < LIMITS.nameMin) {
      toast('Имя слишком короткое');
      return;
    }
    u.name = t;
    storage.setUser(u);
    loadUserUI();
    toast('Профиль обновлён');
  });
}

export function getDisplayName() {
  const u = storage.getUser() || {};
  return u.name || (u.email ? u.email.split('@')[0] : 'друг');
}

export function getAvatar() {
  return (storage.getUser() || {}).avatar || null;
}
