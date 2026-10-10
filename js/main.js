/**
 * NYVEX — main.js
 * Точка входа приложения (app.html)
 */

import { initRouter, showScreen } from './core/router.js';
import { initToast, toast } from './core/toast.js';
import { storage } from './core/storage.js';
import { $ } from './core/utils.js';
import { initAuth, setEnterAppCallback } from './auth/register.js';
import { hasSession } from './auth/login.js';
import { loadUserUI, initProfileEdit } from './auth/profile.js';
import { loadModel, cancelLoad } from './ai/loader.js';
import { loadHistory, initChatMenu, newChat as createChat } from './chat/history.js';
import { initControls } from './chat/controls.js';
import { initSidebar } from './ui/sidebar.js';
import { initSettings } from './ui/settings.js';

export function enterApp() {
  showScreen('app');
  loadUserUI();
  loadHistory();
  createChat();
}

async function boot() {
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
    // allow entering auth/app without model
    setTimeout(() => {
      if (hasSession()) enterApp();
      else showScreen('auth');
    }, 300);
  });

  $('newChatBtn')?.addEventListener('click', () => createChat());
  $('homeLogo')?.addEventListener('click', () => createChat());

  document.addEventListener('gesturestart', (e) => e.preventDefault());

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }

  showScreen('loading');
  const ok = await loadModel();

  setTimeout(() => {
    if (hasSession()) {
      enterApp();
    } else {
      showScreen('auth');
    }
    if (!ok) {
      toast('Модель не загрузилась — интерфейс доступен');
    }
  }, ok ? 400 : 1800);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
