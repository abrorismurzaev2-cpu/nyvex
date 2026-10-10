/**
 * NYVEX — core/trial.js
 * 7-day trial + subscription gate
 */
import { TRIAL_DAYS, PRICE_RUB } from './config.js';
import { storage } from './storage.js';
import { toast } from './toast.js';
import { $ } from './utils.js';

export function ensureTrialOnUser(user) {
  if (!user) return user;
  const now = Date.now();
  if (!user.trialStart) {
    user.trialStart = now;
    user.trialEnd = now + TRIAL_DAYS * 24 * 60 * 60 * 1000;
  }
  if (!user.plan) user.plan = 'trial';
  if (user.plan === 'pro' || user.plan === 'paid') {
    user.plan = 'pro';
  }
  return user;
}

export function getTrialInfo() {
  const u = storage.getUser();
  if (!u) return { active: false, expired: true, remainingMs: 0, daysLeft: 0, plan: 'none' };
  const user = ensureTrialOnUser({ ...u });
  if (user.plan === 'pro') {
    return { active: true, expired: false, remainingMs: Infinity, daysLeft: 999, plan: 'pro' };
  }
  const end = user.trialEnd || Date.now();
  const remainingMs = Math.max(0, end - Date.now());
  const daysLeft = remainingMs / (24 * 60 * 60 * 1000);
  return {
    active: remainingMs > 0,
    expired: remainingMs <= 0,
    remainingMs,
    daysLeft,
    plan: 'trial',
    trialEnd: end,
  };
}

export function formatRemaining(ms) {
  if (!isFinite(ms)) return 'Pro';
  if (ms <= 0) return '0 дн';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d} дн ${h} ч ${m} мин ${sec} сек`;
  if (h > 0) return `${h} ч ${m} мин ${sec} сек`;
  return `${m} мин ${sec} сек`;
}

export function canSendMessages() {
  const info = getTrialInfo();
  return info.plan === 'pro' || info.active;
}

let trialTimer = null;

export function startTrialBadge() {
  stopTrialBadge();
  updateTrialBadge();
  trialTimer = setInterval(updateTrialBadge, 1000);
}

export function stopTrialBadge() {
  if (trialTimer) {
    clearInterval(trialTimer);
    trialTimer = null;
  }
}

export function updateTrialBadge() {
  const badge = $('trialBadge');
  const info = getTrialInfo();
  if (!badge) return;

  if (info.plan === 'pro') {
    badge.textContent = 'Pro';
    badge.classList.remove('warn', 'danger');
    badge.classList.add('pro');
    badge.title = 'Подписка активна';
    return;
  }

  if (info.expired) {
    badge.textContent = 'Истёк';
    badge.classList.add('danger');
    badge.classList.remove('warn', 'pro');
    badge.title = 'Пробный период закончился';
    return;
  }

  const d = Math.ceil(info.daysLeft);
  badge.textContent = d <= 1 ? '1 день' : `${d} дн`;
  badge.title = 'Осталось: ' + formatRemaining(info.remainingMs);
  badge.classList.toggle('warn', info.daysLeft < 3);
  badge.classList.toggle('danger', info.daysLeft < 1);
  badge.classList.remove('pro');
}

export function checkTrialWarnings() {
  const info = getTrialInfo();
  if (info.plan === 'pro' || info.expired) return;

  if (info.daysLeft < 3 && info.daysLeft >= 1) {
    toast(`Осталось ${Math.ceil(info.daysLeft)} дн. Продлить за ${PRICE_RUB} ₽?`);
  }
  if (info.daysLeft < 1) {
    const dayKey = new Date().toISOString().slice(0, 10);
    if (storage.getTrialNoticeDay() !== dayKey) {
      storage.setTrialNoticeDay(dayKey);
      showTrialModal('soon');
    }
  }
}

export function showTrialModal(kind = 'expired') {
  const panel = $('trialModal');
  if (!panel) return;
  const title = $('trialModalTitle');
  const text = $('trialModalText');
  if (kind === 'soon') {
    if (title) title.textContent = 'Завтра закончится пробный период';
    if (text)
      text.textContent = `Оформите подписку за ${PRICE_RUB} ₽/мес, чтобы продолжить общение с NYVEX.`;
  } else {
    if (title) title.textContent = 'Пробный период закончился';
    if (text)
      text.textContent = `Оформите подписку за ${PRICE_RUB} ₽/мес, чтобы продолжить. Историю можно читать.`;
  }
  panel.classList.add('show');
}

export function hideTrialModal() {
  $('trialModal')?.classList.remove('show');
}

export function activatePro() {
  const u = storage.getUser() || {};
  u.plan = 'pro';
  u.subscribedAt = Date.now();
  storage.setUser(u);
  hideTrialModal();
  updateTrialBadge();
  toast('Подписка Pro активирована (демо)');
}

export function cancelPro() {
  const u = storage.getUser() || {};
  u.plan = 'trial';
  // keep trialEnd as-is
  storage.setUser(u);
  updateTrialBadge();
  toast('Подписка отменена');
}
