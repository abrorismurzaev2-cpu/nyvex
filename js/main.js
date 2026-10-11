/**
 * NYVEX — main.js
 * No auth: loading → chat, device trial, model in background
 */
import { initRouter, showScreen } from './core/router.js';
import { initToast, toast } from './core/toast.js';
import { $ } from './core/utils.js';
import { loadModel, cancelLoad, isModelReady } from './ai/loader.js';
import { loadHistory, initChatMenu, newChat as createChat } from './chat/history.js';
import { initControls } from './chat/controls.js';
import { initSidebar } from './ui/sidebar.js';
import { initSettings } from './ui/settings.js';
import {
  startTrialBadge,
  refreshTrialCache,
  showPaymentModal,
  hidePaymentModal,
  activatePro,
  cancelPro,
  getCachedState,
} from './core/trial.js';
import { getDeviceId } from './core/device.js';
import { initNotificationClick, checkTrialNotifications, ensureNotificationPermission } from './ui/notifications.js';

export function enterApp() {
  showScreen('app');
  loadHistory();
  createChat();
  startTrialBadge();
  initNotificationClick();
  // trial push checks each minute
  setInterval(() => {
    try {
      checkTrialNotifications(getCachedState());
    } catch {}
  }, 60000);
}

async function boot() {
  try {
    initRouter();
    initToast();
    initSidebar();
    initSettings();
    initControls();
    initChatMenu();

    document.getElementById('cancelLoadBtn')?.addEventListener('click', () => {
      cancelLoad();
      enterApp();
    });
    document.getElementById('retryLoadBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('retryLoadBtn');
      if (btn) btn.style.display = 'none';
      try {
        await loadModel();
      } catch (e) {
        console.error(e);
        if (btn) btn.style.display = '';
      }
    });

    $('newChatBtn')?.addEventListener('click', () => createChat());
    $('homeLogo')?.addEventListener('click', () => createChat());

    $('trialBadge')?.addEventListener('click', () => showPaymentModal());
    $('trialModalClose')?.addEventListener('click', hidePaymentModal);
    $('trialModalLater')?.addEventListener('click', hidePaymentModal);
    $('trialModalPay')?.addEventListener('click', () => activatePro());
    $('subscribeBtn')?.addEventListener('click', () => activatePro());
    $('cancelSubBtn')?.addEventListener('click', async () => {
      if (confirm('Отключить автопродление? Доступ сохранится до конца оплаченного периода.')) {
        await cancelPro();
      }
    });
    $('trialModal')?.addEventListener('click', (e) => {
      if (e.target === $('trialModal')) hidePaymentModal();
    });

    document.addEventListener('gesturestart', (e) => e.preventDefault());

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    }

    // Device ID + trial start
    await getDeviceId();
    await refreshTrialCache();

    showScreen('loading');
    // Enter chat quickly; model loads in parallel
    const loadPromise = loadModel().catch((e) => {
      console.error(e);
      return false;
    });

    await Promise.race([
      loadPromise,
      new Promise((r) => setTimeout(r, 1800)),
    ]);

    enterApp();

    loadPromise.then((ok) => {
      if (!ok && !isModelReady()) {
        toast('AI загружается в фоне. При первом запуске нужен интернет.');
      }
      try {
        const status = document.querySelector('.welcome-status span:last-child');
        if (status && isModelReady()) status.textContent = 'AI готов';
        document.querySelector('.welcome-status')?.classList.remove('loading');
      } catch {}
    });
  } catch (e) {
    console.error('boot', e);
    try {
      enterApp();
    } catch {
      showScreen('app');
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
