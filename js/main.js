/**
 * NYVEX — main.js
 * No auth: loading → chat, device trial, model in background
 */
import { initRouter, showScreen } from './core/router.js';
import { initToast, toast } from './core/toast.js';
import { $ } from './core/utils.js';
import { loadModel, cancelLoad, isModelReady, isLoading } from './ai/loader.js';
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

    // minimize / retry wired in boot after loading screen

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
      navigator.serviceWorker.register('./service-worker.js').then((reg) => {
        try { reg.update(); } catch {}
      }).catch(() => {});
    }

    // Device ID + trial start
    await getDeviceId();
    await refreshTrialCache();
    // Pull paid status from server (YooKassa webhook / check)
    try {
      const { syncSubscriptionFromServer } = await import('./payment/checkout.js');
      const pid = sessionStorage.getItem('nyvex_last_payment_id');
      await syncSubscriptionFromServer(pid || undefined);
    } catch (e) {
      console.warn('sub sync', e);
    }

    // Model must load on splash (or resume from cache)
    showScreen('loading');

    let minimized = false;
    const minimizeBtn = document.getElementById('cancelLoadBtn');
    if (minimizeBtn) {
      minimizeBtn.textContent = 'Свернуть';
      minimizeBtn.onclick = () => {
        minimized = true;
        enterApp();
        toast('Загрузка AI продолжается в фоне');
        const hw = document.getElementById('headerLoadWrap');
        if (hw) hw.style.display = '';
      };
    }

    document.getElementById('retryLoadBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('retryLoadBtn');
      if (btn) btn.style.display = 'none';
      minimized = false;
      showScreen('loading');
      try {
        await loadModel();
        if (isModelReady()) enterApp();
      } catch (e) {
        console.error(e);
        if (btn) btn.style.display = '';
      }
    });

    const loadPromise = loadModel().catch((e) => {
      console.error('loadModel', e);
      toast('Ошибка загрузки AI. Проверьте интернет.');
      const retry = document.getElementById('retryLoadBtn');
      if (retry) retry.style.display = '';
      return false;
    });

    // Stay on loading screen until ready (unless user minimized)
    loadPromise.then((ok) => {
      if (isModelReady()) {
        if (!minimized) {
          enterApp();
          try {
            $('composerInput')?.focus();
          } catch {}
        } else {
          toast('AI готов к работе');
          const hw = document.getElementById('headerLoadWrap');
          if (hw) hw.style.display = 'none';
        }
        try {
          const status = document.querySelector('.welcome-status span:last-child');
          if (status) status.textContent = 'AI готов';
          document.querySelector('.welcome-status')?.classList.remove('loading');
        } catch {}
      }
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
