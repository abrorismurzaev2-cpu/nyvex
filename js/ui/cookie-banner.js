/**
 * NYVEX — ui/cookie-banner.js
 */

import { storage } from '../core/storage.js';

function renderBanner() {
  const root = document.getElementById('cookie-banner-root') || document.body;
  if (storage.getCookieConsent()) return;

  const el = document.createElement('div');
  el.className = 'cookie-banner';
  el.id = 'cookieBanner';
  el.innerHTML = `
    <div class="cookie-banner-inner">
      <p>
        Мы используем только технические данные (localStorage) для работы чата и сохранения настроек.
        Аналитики и рекламы нет.
        <a href="/legal/cookies.html">Политика Cookie</a> ·
        <a href="/legal/privacy.html">Конфиденциальность</a>
      </p>
      <div class="cookie-actions">
        <button type="button" class="btn btn-primary" id="cookieAcceptAll">Принять все</button>
        <button type="button" class="btn btn-ghost" id="cookieNecessary">Только необходимые</button>
      </div>
    </div>`;
  root.appendChild(el);

  el.querySelector('#cookieAcceptAll')?.addEventListener('click', () => {
    storage.setCookieConsent({ level: 'all', at: Date.now() });
    el.remove();
  });
  el.querySelector('#cookieNecessary')?.addEventListener('click', () => {
    storage.setCookieConsent({ level: 'necessary', at: Date.now() });
    el.remove();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderBanner);
} else {
  renderBanner();
}

export { renderBanner };
