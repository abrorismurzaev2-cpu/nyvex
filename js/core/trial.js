/**
 * NYVEX — trial 7d + paid 30d, device-bound
 */
import { getDeviceId } from './device.js';
import { PRICE_RUB } from './config.js';
import { $ } from './utils.js';
import { toast } from './toast.js';

export const TRIAL_MS = 7 * 24 * 60 * 60 * 1000;
export const PAID_MS = 30 * 24 * 60 * 60 * 1000;

function saveTrialState(state) {
  try {
    localStorage.setItem('nyvex_trial_state', JSON.stringify(state));
  } catch (e) {
    console.error('saveTrialState', e);
  }
}

export async function getTrialState() {
  const deviceId = await getDeviceId();
  let state = null;
  try {
    state = JSON.parse(localStorage.getItem('nyvex_trial_state') || 'null');
  } catch {
    state = null;
  }

  if (!state || state.deviceId !== deviceId) {
    state = {
      deviceId,
      startedAt: Date.now(),
      expiresAt: Date.now() + TRIAL_MS,
      plan: 'trial',
      paidUntil: null,
      paidAt: null,
      payments: [],
    };
    saveTrialState(state);
  }

  const now = Date.now();
  if (state.plan === 'trial' && now >= state.expiresAt) {
    state.plan = 'expired';
    saveTrialState(state);
  }
  if (state.plan === 'paid' && state.paidUntil && now >= state.paidUntil) {
    state.plan = 'expired';
    saveTrialState(state);
  }
  return state;
}

export function getTimeLeft(state) {
  if (!state) return 0;
  if (state.plan === 'trial') return Math.max(0, state.expiresAt - Date.now());
  if (state.plan === 'paid' && state.paidUntil) return Math.max(0, state.paidUntil - Date.now());
  return 0;
}

export function canSendMessage(state) {
  if (!state || state.plan === 'expired') return false;
  return getTimeLeft(state) > 0;
}

export function formatRemaining(ms) {
  if (!ms || ms <= 0) return '0 сек';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d} дн ${h} ч ${m} мин ${sec} сек`;
  if (h > 0) return `${h} ч ${m} мин ${sec} сек`;
  if (m > 0) return `${m} мин ${sec} сек`;
  return `${sec} сек`;
}

export function formatBadge(state) {
  const ms = getTimeLeft(state);
  if (state.plan === 'expired' || ms <= 0) return { text: 'Оплатить', cls: 'danger', title: 'Подписка истекла' };
  const days = ms / 86400000;
  if (state.plan === 'paid') {
    if (days < 1) return { text: 'Pro · ' + Math.ceil(ms / 3600000) + ' ч', cls: 'danger', title: formatRemaining(ms) };
    return { text: 'Pro · ' + Math.ceil(days) + ' дн', cls: 'pro', title: formatRemaining(ms) };
  }
  // trial
  if (days < 1) return { text: Math.ceil(ms / 3600000) + ' ч', cls: 'danger', title: formatRemaining(ms) };
  if (days < 3) return { text: Math.ceil(days) + ' дн', cls: 'warn', title: formatRemaining(ms) };
  return { text: Math.ceil(days) + ' дн', cls: '', title: formatRemaining(ms) };
}

/** Demo / after YooKassa success */
export function activatePaidSubscription(state) {
  const s = state || {};
  s.plan = 'paid';
  s.paidAt = Date.now();
  s.paidUntil = Date.now() + PAID_MS;
  if (!Array.isArray(s.payments)) s.payments = [];
  s.payments.push({ amount: PRICE_RUB, paidAt: s.paidAt, expiresAt: s.paidUntil });
  saveTrialState(s);
  return s;
}

export function cancelPaidSubscription(state) {
  const s = state || {};
  // keep access until paidUntil, but mark no auto-renew conceptually
  s.autoRenew = false;
  saveTrialState(s);
  return s;
}

let badgeTimer = null;
let cachedState = null;

export async function refreshTrialCache() {
  cachedState = await getTrialState();
  return cachedState;
}

export function getCachedState() {
  return cachedState;
}

export function startTrialBadge() {
  stopTrialBadge();
  const tick = async () => {
    try {
      cachedState = await getTrialState();
      updateTrialBadge(cachedState);
      updateComposerLock(cachedState);
      refreshSubUI(cachedState);
    } catch (e) {
      console.error(e);
    }
  };
  tick();
  badgeTimer = setInterval(tick, 1000);
}

export function stopTrialBadge() {
  if (badgeTimer) {
    clearInterval(badgeTimer);
    badgeTimer = null;
  }
}

export function updateTrialBadge(state) {
  const badge = $('trialBadge');
  if (!badge || !state) return;
  const b = formatBadge(state);
  badge.textContent = b.text;
  badge.classList.remove('warn', 'danger', 'pro');
  if (b.cls) badge.classList.add(b.cls);
  badge.title = b.title;
}

export function updateComposerLock(state) {
  const input = $('composerInput');
  const sendBtn = $('sendBtn');
  const ok = canSendMessage(state);
  if (input) {
    input.disabled = !ok;
    input.placeholder = ok ? 'Напишите сообщение…' : 'Оформите подписку чтобы продолжить';
  }
  if (sendBtn) {
    sendBtn.disabled = !ok;
    if (!ok) sendBtn.classList.remove('enabled');
  }
}

export function showPaymentModal() {
  $('trialModal')?.classList.add('show');
}

export function hidePaymentModal() {
  $('trialModal')?.classList.remove('show');
}

export function refreshSubUI(state) {
  if (!state) return;
  const label = $('trialStatusLabel');
  const bar = $('trialProgress');
  const endEl = $('trialEndDate');
  const ms = getTimeLeft(state);
  if (label) {
    if (state.plan === 'paid') label.textContent = 'Pro · ' + formatRemaining(ms);
    else if (state.plan === 'trial') label.textContent = 'Пробный · ' + formatRemaining(ms);
    else label.textContent = 'Подписка истекла';
  }
  if (bar) {
    const total = state.plan === 'paid' ? PAID_MS : TRIAL_MS;
    const pct = total ? Math.min(100, (ms / total) * 100) : 0;
    bar.style.width = (state.plan === 'expired' ? 0 : pct) + '%';
  }
  if (endEl) {
    if (state.plan === 'paid' && state.paidUntil)
      endEl.textContent = 'До ' + new Date(state.paidUntil).toLocaleString('ru-RU');
    else if (state.plan === 'trial')
      endEl.textContent = 'До ' + new Date(state.expiresAt).toLocaleString('ru-RU');
    else endEl.textContent = 'Нужна оплата';
  }
  const hist = $('paymentHistory');
  if (hist) {
    const list = state.payments || [];
    hist.innerHTML = list.length
      ? list
          .slice()
          .reverse()
          .map(
            (p) =>
              `<div class="pay-row">${new Date(p.paidAt).toLocaleDateString('ru-RU')} · ${p.amount} ₽ · до ${new Date(p.expiresAt).toLocaleDateString('ru-RU')}</div>`
          )
          .join('')
      : '<div class="pay-row dim">Пока нет оплат</div>';
  }
}

/** Legacy aliases used by older imports */
export function ensureTrialOnUser(u) {
  return u;
}
export function getTrialInfo() {
  const s = cachedState;
  if (!s) return { plan: 'trial', active: true, expired: false, remainingMs: TRIAL_MS, daysLeft: 7 };
  const ms = getTimeLeft(s);
  return {
    plan: s.plan === 'paid' ? 'pro' : s.plan,
    active: canSendMessage(s),
    expired: s.plan === 'expired',
    remainingMs: ms,
    daysLeft: ms / 86400000,
    trialEnd: s.expiresAt,
  };
}
export function showTrialModal() {
  showPaymentModal();
}
export function hideTrialModal() {
  hidePaymentModal();
}
export async function activatePro() {
  const s = await getTrialState();
  activatePaidSubscription(s);
  cachedState = s;
  updateTrialBadge(s);
  updateComposerLock(s);
  refreshSubUI(s);
  hidePaymentModal();
  toast('Подписка на 30 дней активирована');
}
export async function cancelPro() {
  const s = await getTrialState();
  cancelPaidSubscription(s);
  toast('Автопродление отключено (доступ до конца оплаченного периода)');
  refreshSubUI(s);
}
