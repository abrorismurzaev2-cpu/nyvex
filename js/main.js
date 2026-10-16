/**
 * NYVEX — main.js
 * No auth: loading → chat, device trial, model in background
 */
import { initRouter, showScreen } from './core/router.js';
import { hasAcceptedAgreement, setupAgreement } from './ui/agreement.js';
import { initToast, toast } from './core/toast.js';
import { $ } from './core/utils.js';
import { loadModel, cancelLoad, isModelReady, isLoading, getModelState } from './ai/loader.js';
import { setActiveModel, isModelDownloaded, getActiveModel } from './ai/models.js';
import { isNativeApp } from './core/platform.js';
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

    const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    // Service Worker often breaks in Capacitor WebView — skip on native
    if ('serviceWorker' in navigator && !isNative) {
      navigator.serviceWorker.register('./service-worker.js').then((reg) => {
        try { reg.update(); } catch {}
      }).catch(() => {});
    }
    try {
      const { initPaymentDeepLink } = await import('./payment/checkout.js');
      initPaymentDeepLink();
    } catch (e) {
      console.warn('payment deeplink', e);
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

    // First-launch agreement (no chat / model until accepted)
    if (!hasAcceptedAgreement()) {
      showScreen('agreement');
      setupAgreement(async () => {
        await continueModelBoot();
      });
      return;
    }

    await continueModelBoot();
  } catch (e) {
    console.error('boot', e);
    try {
      enterApp();
    } catch {
      showScreen('app');
    }
  }
}

async function continueModelBoot() {
  try {
    // Always ensure weakest model is selected for first auto-download
    try {
      const active = getActiveModel();
      if (!isModelDownloaded(active.id)) {
        setActiveModel('fast');
      }
    } catch {}
    // Model splash: logo-only if cached, full progress if first download
    showScreen('loading');
    let modelState = 'not-downloaded';
    try {
      modelState = await getModelState();
    } catch {}
    const isCached = modelState === 'cached';
    console.log('[nyvex] modelState', modelState, 'native', isNativeApp());

    const progressEls = [
      'loadLiveMeta', 'loadMb', 'loadSpeed', 'loadEta', 'loadStatus', 'loadDetail', 'loadWarn',
    ];
    const cancelBtn = document.getElementById('cancelLoadBtn');
    const minimizeBtn = document.getElementById('minimizeLoadBtn');
    const retryBtn = document.getElementById('retryLoadBtn');
    if (isCached) {
      const panel = document.getElementById('loadProgressPanel');
      if (panel) panel.style.display = 'none';
      progressEls.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      if (cancelBtn) cancelBtn.style.display = 'none';
      if (minimizeBtn) minimizeBtn.style.display = 'none';
      if (retryBtn) retryBtn.style.display = 'none';
      document.querySelectorAll('#screen-loading .sub-progress, #screen-loading .load-bar, .splash-progress, .load-ring').forEach((el) => {
        try { el.style.display = 'none'; } catch {}
      });
    } else {
      const panel = document.getElementById('loadProgressPanel');
      if (panel) panel.style.display = '';
      progressEls.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = '';
      });
      if (cancelBtn) cancelBtn.style.display = '';
      if (minimizeBtn) minimizeBtn.style.display = '';
    }

    let minimized = false;
    // Отменить = stop download, keep progress for resume
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        cancelLoad();
        toast('Загрузка отменена. При следующем входе продолжится.');
        showScreen('loading');
        const live = document.getElementById('loadLiveMeta');
        if (live) {
          live.textContent = 'Загрузка отменена. Нажмите «Повторить» или откройте приложение снова.';
          live.style.opacity = '1';
        }
        if (retryBtn) retryBtn.style.display = '';
      };
    }
    // Свернуть = continue in background, open chat UI
    if (minimizeBtn) {
      minimizeBtn.onclick = () => {
        minimized = true;
        enterApp();
        toast('Загрузка AI продолжается в фоне');
        const hw = document.getElementById('headerLoadWrap');
        if (hw) hw.style.display = '';
      };
    }

    retryBtn?.addEventListener('click', async () => {
      if (retryBtn) retryBtn.style.display = 'none';
      minimized = false;
      showScreen('loading');
      try {
        await loadModel();
        if (isModelReady()) enterApp();
      } catch (e) {
        console.error(e);
        if (retryBtn) retryBtn.style.display = '';
      }
    });

    const t0 = Date.now();
    // FAST PATH: model already on device → open chat after ~600ms, finish init in background
    if (isCached) {
      const splashMs = isNativeApp() ? 400 : 600;
      setTimeout(() => {
        if (!minimized) {
          enterApp();
          try { $('composerInput')?.focus(); } catch {}
        }
      }, splashMs);
    }

    const loadPromise = loadModel().catch((e) => {
      console.error('loadModel', e);
      toast('Не удалось загрузить AI. Проверьте интернет или VPN.');
      if (retryBtn) retryBtn.style.display = '';
      progressEls.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = '';
      });
      return false;
    });

    loadPromise.then(async () => {
      if (!isModelReady()) return;
      if (isCached) {
        // already entered chat; just update status
        try {
          const status = document.querySelector('.welcome-status span:last-child');
          if (status) status.textContent = 'AI готов';
          document.querySelector('.welcome-status')?.classList.remove('loading');
          const hw = document.getElementById('headerLoadWrap');
          if (hw) hw.style.display = 'none';
        } catch {}
        return;
      }
      if (!minimized) {
        enterApp();
        try { $('composerInput')?.focus(); } catch {}
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
    });
  } catch (e) {
    console.error('continueModelBoot', e);
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
