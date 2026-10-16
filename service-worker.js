/**
 * NYVEX — service-worker.js
 * Relative paths → works on GitHub Pages (/nyvex/) and Capacitor
 */
const SHELL = 'nyvex-shell-v28';
const RUNTIME = 'nyvex-runtime-v28';

const PRECACHE = [
  './',
  './index.html',
  './app.html',
  './manifest.json',
  './css/base.css',
  './css/components.css',
  './css/landing.css',
  './css/auth.css',
  './css/chat.css',
  './css/settings.css',
  './css/legal.css',
  './css/animations.css',
  './js/main.js',
  './js/core/config.js',
  './js/core/storage.js',
  './js/core/router.js',
  './js/core/toast.js',
  './js/core/utils.js',
  './js/core/trial.js',
  './js/auth/register.js',
  './js/auth/login.js',
  './js/auth/profile.js',
  './js/ai/loader.js',
  './js/ai/chat.js',
  './js/ai/cache.js',
  './js/ai/worker.js',
  './js/chat/messages.js',
  './js/chat/history.js',
  './js/chat/controls.js',
  './js/ui/sidebar.js',
  './js/ui/settings.js',
  './js/ui/cookie-banner.js',
  './legal/privacy.html',
  './legal/terms.html',
  './legal/cookies.html',
  './legal/data.html',
  './legal/delivery.html',
  './legal/requisites.html',
  './legal/offer.html',
  './assets/logo.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon.ico',
  './assets/icons/favicon-32.png',
  './assets/fonts/manrope-latin-400.woff2',
  './assets/fonts/manrope-latin-500.woff2',
  './assets/fonts/manrope-latin-600.woff2',
  './assets/fonts/manrope-latin-700.woff2',
  './assets/fonts/manrope-cyrillic-400.woff2',
  './assets/fonts/manrope-cyrillic-500.woff2',
  './assets/fonts/manrope-cyrillic-600.woff2',
  './assets/fonts/manrope-cyrillic-700.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(PRECACHE).catch(() => {})).then(() => self.skipWaiting())
  );
});

function isModelCacheName(name) {
  const n = String(name || '').toLowerCase();
  // Transformers.js / ONNX / HF blobs — NEVER delete on SW update
  return (
    n.includes('transformers') ||
    n.includes('huggingface') ||
    n.includes('nyvex-model') ||
    n.includes('onnx') ||
    n.includes('wasm') ||
    n.includes('ort-')
  );
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL && k !== RUNTIME && !isModelCacheName(k))
          .map((k) => {
            console.log('[sw] delete old cache', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

function isHTML(req) {
  return req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
}

function isStatic(url) {
  const p = url.pathname;
  return (
    p.includes('/css/') ||
    p.includes('/js/') ||
    p.includes('/assets/') ||
    p.endsWith('.woff2') ||
    p.endsWith('manifest.json')
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // CRITICAL: never intercept model CDN / HF / mirrors / ORT
  const host = (url.hostname || '').toLowerCase();
  const path = url.pathname || '';
  if (
    host.includes('huggingface') ||
    host.includes('hf-mirror') ||
    host.includes('xethub') ||
    host.endsWith('.hf.co') ||
    host.includes('jsdelivr') ||
    host.includes('unpkg.com') ||
    host.includes('yookassa') ||
    host.includes('cdn-lfs') ||
    path.endsWith('.onnx') ||
    path.endsWith('.onnx_data') ||
    path.endsWith('.bin') ||
    path.endsWith('.wasm')
  ) {
    return; // browser network only — never SW cache model blobs
  }

  // Never cache payment APIs on our origin
  try {
    if (/\/api\/(payment|yookassa|create-payment|webhook|subscription)/i.test(url.pathname)) {
      return;
    }
  } catch (_) {}
  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  if (isHTML(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(RUNTIME).then((c) => c.put(req, clone)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req).then((r) => r || caches.match('./app.html') || caches.match('./index.html'))
        )
    );
    return;
  }

  if (isStatic(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(SHELL).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        });
      })
    );
  }
});


self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.postMessage({ type: 'notification-click' });
          return c.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow('./app.html');
    })
  );
});


self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SHOW_PROGRESS') {
    self.registration.showNotification(data.title || 'NYVEX', {
      body: data.body || '',
      icon: data.icon || './assets/icons/icon-192.png',
      badge: data.badge || './assets/icons/icon-192.png',
      tag: data.tag || 'nyvex-download',
      silent: !!data.silent,
      requireInteraction: !!data.requireInteraction,
    }).catch(() => {});
  }
});
