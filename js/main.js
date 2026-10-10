/**
 * NYVEX — main.js
 * Boot: session first, model in background
 */
import { initRouter, showScreen } from './core/router.js';
import { initToast, toast } from './core/toast.js';
import { $ } from './core/utils.js';
import { initAuth, setEnterAppCallback } from './auth/register.js';
import { hasSession } from './auth/login.js';
import { loadUserUI, initProfileEdit } from './auth/profile.js';
import { loadModel, cancelLoad, isModelReady } from './ai/loader.js';
import { loadHistory, initChatMenu, newChat as createChat } from './chat/history.js';
import { initControls } from './chat/controls.js';
import { initSidebar } from './ui/sidebar.js';
import { initSettings } from './ui/settings.js';
import { startTrialBadge, ensureTrialOnUser } from './core/trial.js';
import { storage } from './core/storage.js';

export function enterApp() {
  // ensure trial fields
  try {
    const u = storage.getUser();
    if (u) {
      storage.setUser(ensureTrialOnUser(u));
    }
  } catch (e) {
    console.error(e);
  }
  showScreen('app');
  loadUserUI();
  loadHistory();
  createChat();
  startTrialBadge();
}

async function boot() {
  try {
    initRouter();
    initToast();
    setEnterAppCallback(enterApp);
    initAuth();
    initProfileEdit();
    initSidebar();
    initSettings();
    initControls();
    initChatMenu();

    document.getElementById('cancelLoadBtn')?.addEventListener('click', () => {
      cancelLoad();
      setTimeout(() => {
        if (hasSession()) enterApp();
        else showScreen('auth');
      }, 200);
    });

    $('newChatBtn')?.addEventListener('click', () => createChat());
    $('homeLogo')?.addEventListener('click', () => createChat());

    document.addEventListener('gesturestart', (e) => e.preventDefault());

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    }

    // BUG2 fix: if logged in → enter app immediately, load model in background
    if (hasSession()) {
      enterApp();
      // background model load (non-blocking)
      loadModel()
        .then((ok) => {
          if (!ok) toast('Модель не загрузилась — интерфейс доступен');
          // refresh welcome status if empty chat
          try {
            const status = document.querySelector('.welcome-status span:last-child');
            if (status && isModelReady()) status.textContent = 'Модель готова';
            document.querySelector('.welcome-status')?.classList.remove('loading');
          } catch {}
        })
        .catch((e) => {
          console.error('bg model load', e);
          toast('Не удалось загрузить модель. Попробуйте позже.');
        });
      return;
    }

    // Not logged in: short loading then auth (model still loads in background)
    showScreen('loading');
    const loadPromise = loadModel().catch((e) => {
      console.error(e);
      return false;
    });

    // Don't wait forever — show auth after max 2.5s even if model still downloading
    await Promise.race([
      loadPromise.then(() => true),
      new Promise((r) => setTimeout(r, 2500)),
    ]);

    if (hasSession()) {
      enterApp();
    } else {
      showScreen('auth');
    }

    loadPromise.then((ok) => {
      if (!ok && !isModelReady()) {
        // silent if still loading later
      }
    });
  } catch (e) {
    console.error('boot failed', e);
    try {
      if (hasSession()) enterApp();
      else showScreen('auth');
    } catch {
      showScreen('auth');
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
