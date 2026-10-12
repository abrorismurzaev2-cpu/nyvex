/**
 * NYVEX — YooKassa checkout (web + Capacitor APK)
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

function isNativeApp() {
  try {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  } catch {
    return false;
  }
}

function mapPaymentError(data, status) {
  if (!data) return 'Не удалось создать платёж';
  if (data.error === 'Payment is not configured') return 'Оплата не настроена на сервере';
  if (data.error === 'APP_URL is not configured') return 'Не настроен APP_URL';
  if (data.providerMessage) {
    return 'ЮKassa: ' + String(data.providerMessage).slice(0, 120);
  }
  if (data.providerCode) return 'Ошибка оплаты (' + data.providerCode + ')';
  if (status === 502) return 'Платёжный сервис временно недоступен';
  if (status === 400) return 'Некорректный запрос оплаты';
  return data.error || 'Не удалось создать платёж';
}

export async function startPayment() {
  try {
    const deviceId = await getDeviceId();
    const base = getApiBase() || 'https://nyvex-xi.vercel.app';
    const native = isNativeApp();

    toast('Переход к оплате…');
    const res = await fetch(`${base}/api/create-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId,
        plan: 'monthly',
        isNative: native,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.confirmationUrl) {
      console.error('create-payment', res.status, data);
      toast(mapPaymentError(data, res.status));
      return;
    }
    if (data.paymentId) {
      try {
        sessionStorage.setItem('nyvex_last_payment_id', data.paymentId);
        localStorage.setItem('nyvex_last_payment_id', data.paymentId);
      } catch {}
    }

    if (native) {
      try {
        // Dynamic import — web build must not break if plugin missing
        const { Browser } = await import('https://cdn.jsdelivr.net/npm/@capacitor/browser@6.0.2/+esm').catch(() => ({}));
        if (Browser?.open) {
          await Browser.open({ url: data.confirmationUrl });
          return;
        }
      } catch (e) {
        console.warn('Capacitor Browser fallback', e);
      }
      // Fallback: system open
      window.open(data.confirmationUrl, '_system');
      return;
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
    const base = getApiBase() || 'https://nyvex-xi.vercel.app';
    const q = new URLSearchParams({ deviceId });
    const pid = paymentId || sessionStorage.getItem('nyvex_last_payment_id') || localStorage.getItem('nyvex_last_payment_id');
    if (pid) q.set('paymentId', pid);
    const res = await fetch(`${base}/api/check-subscription?${q}`);
    const data = await res.json().catch(() => ({}));
    if (data.active && data.expiresAt) {
      const s = await getTrialState();
      s.plan = 'paid';
      s.paidAt = data.paidAt || Date.now();
      s.paidUntil = data.expiresAt;
      if (!Array.isArray(s.payments)) s.payments = [];
      s.payments.push({ amount: 290, paidAt: s.paidAt, expiresAt: s.paidUntil });
      activatePaidSubscription(s);
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

/** Call once on app boot for deep-link return from YooKassa */
export function initPaymentDeepLink() {
  try {
    if (!isNativeApp()) return;
    const CapApp = window.Capacitor?.Plugins?.App;
    if (!CapApp?.addListener) return;
    CapApp.addListener('appUrlOpen', async (event) => {
      const url = String(event?.url || '');
      console.log('[nyvex] appUrlOpen', url);
      if (url.includes('payment-success') || url.includes('nyvex://')) {
        try {
          const { Browser } = window.Capacitor?.Plugins || {};
          if (Browser?.close) await Browser.close();
        } catch {}
        const ok = await syncSubscriptionFromServer();
        if (!ok) toast('Проверяем оплату… Откройте чат через минуту');
      }
    });
  } catch (e) {
    console.warn('deeplink init', e);
  }
}
