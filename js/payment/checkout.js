/**
 * NYVEX — YooKassa checkout (frontend)
 * Secrets never leave the server.
 */
import { getDeviceId } from '../core/device.js';
import { getApiBase } from '../core/config.js';
import { toast } from '../core/toast.js';
import {
  getTrialState,
  activatePaidSubscription,
  refreshTrialCache,
  updateTrialBadge,
  updateComposerLock,
  refreshSubUI,
  hidePaymentModal,
} from '../core/trial.js';

export async function startPayment() {
  try {
    const deviceId = await getDeviceId();
    const base = getApiBase();
    if (!base) {
      toast('Оплата временно недоступна (API не настроен)');
      return;
    }

    toast('Переход к оплате…');
    const res = await fetch(`${base}/api/create-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, plan: 'monthly' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.confirmationUrl) {
      console.error('create-payment', res.status, data?.error);
      toast(data?.error === 'Payment is not configured' ? 'Оплата не настроена' : 'Не удалось создать платёж');
      return;
    }
    if (data.paymentId) {
      try {
        sessionStorage.setItem('nyvex_last_payment_id', data.paymentId);
      } catch {}
    }
    window.location.href = data.confirmationUrl;
  } catch (e) {
    console.error(e);
    toast('Ошибка сети при оплате');
  }
}

export async function syncSubscriptionFromServer(paymentId) {
  try {
    const deviceId = await getDeviceId();
    const base = getApiBase();
    if (!base) return false;
    const q = new URLSearchParams({ deviceId });
    if (paymentId) q.set('paymentId', paymentId);
    const res = await fetch(`${base}/api/check-subscription?${q}`);
    const data = await res.json().catch(() => ({}));
    if (data.active && data.expiresAt) {
      const s = await getTrialState();
      s.plan = 'paid';
      s.paidAt = data.paidAt || Date.now();
      s.paidUntil = data.expiresAt;
      if (!Array.isArray(s.payments)) s.payments = [];
      s.payments.push({
        amount: 290,
        paidAt: s.paidAt,
        expiresAt: s.paidUntil,
      });
      activatePaidSubscription(s);
      // force exact server expiry
      s.paidUntil = data.expiresAt;
      try {
        localStorage.setItem('nyvex_trial_state', JSON.stringify(s));
      } catch {}
      await refreshTrialCache();
      updateTrialBadge(s);
      updateComposerLock(s);
      refreshSubUI(s);
      hidePaymentModal();
      toast('Подписка активирована');
      return true;
    }
    return false;
  } catch (e) {
    console.error(e);
    return false;
  }
}
