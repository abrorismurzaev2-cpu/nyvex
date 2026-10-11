/**
 * NYVEX — notifications (response ready + trial)
 */
const KEY = 'nyvex_notifications_allowed';
const TRIAL_NOTIF_KEY = 'nyvex_trial_notif_day';

export function getNotifPref() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setNotifPref(v) {
  try {
    localStorage.setItem(KEY, v);
  } catch {}
}

export async function ensureNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') {
    setNotifPref('granted');
    return true;
  }
  if (Notification.permission === 'denied') {
    setNotifPref('denied');
    return false;
  }
  const pref = getNotifPref();
  if (pref === 'dismissed') return false;

  // soft prompt UI once
  const ok = window.confirm(
    'Разрешить уведомления?\nМы сообщим, когда AI ответит, даже если приложение свёрнуто.'
  );
  if (!ok) {
    setNotifPref('dismissed');
    return false;
  }
  try {
    const perm = await Notification.requestPermission();
    setNotifPref(perm === 'granted' ? 'granted' : 'denied');
    return perm === 'granted';
  } catch {
    return false;
  }
}

export function notifyResponseReady() {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return;

    const opts = {
      body: 'AI готов ответить на ваш вопрос',
      icon: './assets/icons/icon-192.png',
      badge: './assets/icons/icon-192.png',
      tag: 'nyvex-response',
      silent: false,
    };

    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.ready
        .then((reg) => reg.showNotification('NYVEX', opts))
        .catch(() => new Notification('NYVEX', opts));
    } else {
      new Notification('NYVEX', opts);
    }
  } catch (e) {
    console.error('notify', e);
  }
}

export function notifyTrial(title, body, tag) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const opts = {
      body,
      icon: './assets/icons/icon-192.png',
      tag: tag || 'nyvex-trial',
    };
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.ready
        .then((reg) => reg.showNotification(title || 'NYVEX', opts))
        .catch(() => new Notification(title || 'NYVEX', opts));
    } else {
      new Notification(title || 'NYVEX', opts);
    }
  } catch (e) {
    console.error(e);
  }
}

/** Call periodically with trial state */
export function checkTrialNotifications(state) {
  if (!state) return;
  const now = Date.now();
  const ms = state.plan === 'trial'
    ? Math.max(0, state.expiresAt - now)
    : state.plan === 'paid' && state.paidUntil
      ? Math.max(0, state.paidUntil - now)
      : 0;

  const dayKey = new Date().toISOString().slice(0, 10);
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(TRIAL_NOTIF_KEY) || '{}');
  } catch {
    stored = {};
  }

  const mark = (k) => {
    stored[k] = dayKey;
    try {
      localStorage.setItem(TRIAL_NOTIF_KEY, JSON.stringify(stored));
    } catch {}
  };

  if (state.plan === 'trial' || state.plan === 'paid') {
    // ~1 day left
    if (ms > 0 && ms <= 24 * 3600 * 1000 && ms > 3600 * 1000) {
      if (stored.day !== dayKey) {
        mark('day');
        notifyTrial('NYVEX', 'Завтра закончится доступ. Оформите подписку.', 'nyvex-trial-day');
      }
    }
    // ~1 hour left
    if (ms > 0 && ms <= 3600 * 1000) {
      if (stored.hour !== dayKey) {
        mark('hour');
        notifyTrial('NYVEX', 'Доступ заканчивается через час', 'nyvex-trial-hour');
      }
    }
  }
  if (state.plan === 'expired') {
    if (stored.expired !== dayKey) {
      mark('expired');
      notifyTrial('NYVEX', 'Пробный период или подписка закончились', 'nyvex-trial-expired');
    }
  }
}

export function initNotificationClick() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'notification-click') {
      try {
        window.focus();
        document.getElementById('chatScroll')?.scrollTo({
          top: 999999,
          behavior: 'smooth',
        });
      } catch {}
    }
  });
}
