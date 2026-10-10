/**
 * NYVEX — service-worker.js
 * cache-first static; network-first HTML
 */
const SHELL = 'nyvex-shell-v2';
const RUNTIME = 'nyvex-runtime-v2';
const PRECACHE = [
  '/', '/index.html', '/app.html', '/manifest.json',
  '/css/base.css', '/css/components.css', '/css/landing.css', '/css/auth.css',
  '/css/chat.css', '/css/settings.css', '/css/legal.css', '/css/animations.css',
  '/js/main.js', '/js/core/config.js', '/js/core/storage.js', '/js/core/router.js',
  '/js/core/toast.js', '/js/core/utils.js',
  '/js/auth/register.js', '/js/auth/login.js', '/js/auth/profile.js',
  '/js/ai/loader.js', '/js/ai/chat.js', '/js/ai/cache.js', '/js/ai/worker.js',
  '/js/chat/messages.js', '/js/chat/history.js', '/js/chat/controls.js',
  '/js/ui/sidebar.js', '/js/ui/settings.js', '/js/ui/cookie-banner.js',
  '/legal/privacy.html', '/legal/terms.html', '/legal/cookies.html', '/legal/data.html',
  '/assets/logo.svg',
  '/assets/icons/icon-192.png', '/assets/icons/icon-512.png',
  '/assets/icons/icon-maskable-512.png', '/assets/icons/apple-touch-icon.png',
  '/assets/icons/favicon.ico', '/assets/icons/favicon-32.png',
  '/assets/fonts/manrope-latin-400.woff2', '/assets/fonts/manrope-latin-500.woff2',
  '/assets/fonts/manrope-latin-600.woff2', '/assets/fonts/manrope-latin-700.woff2',
  '/assets/fonts/manrope-cyrillic-400.woff2', '/assets/fonts/manrope-cyrillic-500.woff2',
  '/assets/fonts/manrope-cyrillic-600.woff2', '/assets/fonts/manrope-cyrillic-700.woff2',
  '/assets/fonts/manrope-latin-ext-400.woff2', '/assets/fonts/manrope-latin-ext-500.woff2',
  '/assets/fonts/manrope-latin-ext-600.woff2', '/assets/fonts/manrope-latin-ext-700.woff2',
  '/assets/fonts/manrope-cyrillic-ext-400.woff2', '/assets/fonts/manrope-cyrillic-ext-500.woff2',
  '/assets/fonts/manrope-cyrillic-ext-600.woff2', '/assets/fonts/manrope-cyrillic-ext-700.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(PRECACHE).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL && k !== RUNTIME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isHTML(req) {
  return req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
}

function isStatic(url) {
  return (
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/js/') ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname === '/manifest.json'
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
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
          caches.match(req).then((r) => r || caches.match('/app.html') || caches.match('/index.html'))
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
