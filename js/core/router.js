/**
 * NYVEX — core/router.js
 * Screen switching: loading / agreement / app
 */

const screens = {
  loading: null,
  agreement: null,
  auth: null,
  app: null,
};

let current = null;

export function initRouter() {
  screens.loading = document.getElementById('screen-loading');
  screens.agreement = document.getElementById('screen-agreement');
  screens.auth = document.getElementById('screen-auth');
  screens.app = document.getElementById('screen-app');
}

export function showScreen(name) {
  if (!screens[name]) {
    console.warn('[router] unknown screen', name);
    return;
  }
  Object.keys(screens).forEach((key) => {
    const el = screens[key];
    if (!el) return;
    if (key === name) el.classList.add('active');
    else el.classList.remove('active');
  });
  current = name;
}

export function getCurrentScreen() {
  return current;
}
