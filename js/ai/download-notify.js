/**
 * NYVEX — download progress notifications
 */
let lastNotifAt = 0;
let startedNotified = false;

export async function requestDownloadNotifPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const ok = window.confirm(
      'Разрешить уведомления?\nПокажем прогресс загрузки AI и сообщим, когда модель будет готова.'
    );
    if (!ok) return false;
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  } catch {
    return false;
  }
}

function show(title, body, opts = {}) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const payload = {
      body,
      icon: './assets/icons/icon-192.png',
      badge: './assets/icons/icon-192.png',
      tag: 'nyvex-download',
      silent: !!opts.silent,
      requireInteraction: !!opts.requireInteraction,
    };
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SHOW_PROGRESS',
        title,
        body,
        ...payload,
      });
    } else {
      const n = new Notification(title, payload);
      n.onclick = () => {
        try {
          window.focus();
        } catch {}
        n.close();
      };
    }
  } catch (e) {
    console.warn('notify', e);
  }
}

export function notifyDownloadStart() {
  if (startedNotified) return;
  startedNotified = true;
  show('NYVEX · Загрузка AI', 'Начинаем загрузку модели. Это может занять несколько минут.', {
    requireInteraction: true,
    silent: false,
  });
}

export function notifyDownloadProgress(pct, speedStr, etaStr) {
  const now = Date.now();
  if (pct < 5) return;
  if (now - lastNotifAt < 30000) return;
  lastNotifAt = now;
  show(
    'NYVEX · Загрузка AI',
    `Загружено ${Math.round(pct)}% · ${speedStr || '—'} · осталось ${etaStr || '—'}`,
    { silent: true, requireInteraction: true }
  );
}

export function notifyDownloadDone() {
  lastNotifAt = 0;
  show('NYVEX', 'AI загружен и готов к работе.', {
    silent: false,
    requireInteraction: false,
  });
}
