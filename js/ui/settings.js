import { initModelSettings } from './models-settings.js';
/**
 * NYVEX — ui/settings.js (settings panel)
 */
import { $ } from '../core/utils.js';
import { storage } from '../core/storage.js';
import { toast } from '../core/toast.js';
import { clearAllHistory } from '../chat/history.js';
import { onModelStatus, getModelStatus, getModelCacheSize, clearModelCache, isStoragePersisted } from '../ai/loader.js';
import { clearAllNyvexData } from '../core/utils.js';
import { showPaymentModal, refreshSubUI, getCachedState, refreshTrialCache } from '../core/trial.js';
import { showScreen } from '../core/router.js';

export function initSettings() {
  try {
    initModelSettings();
  } catch (e) {
    console.warn('model settings', e);
  }
  const panel = $('settingsPanel');
  $('settingsBtn')?.addEventListener('click', async () => {
    const st = await refreshTrialCache();
    refreshSubUI(st);
    updateAiStatus(getModelStatus());
    try {
      initModelSettings();
    } catch {}
    panel?.classList.add('show');
  });
  $('settingsClose')?.addEventListener('click', () => panel?.classList.remove('show'));
  panel?.addEventListener('click', (e) => {
    if (e.target === panel) panel.classList.remove('show');
  });

  document.querySelectorAll('[data-switch]').forEach((sw) => {
    sw.addEventListener('click', (e) => {
      e.stopPropagation();
      sw.classList.toggle('on');
      const item = sw.closest('.setting-item');
      const key = item?.dataset.setting;
      const settings = storage.getSettings() || {};
      if (key === 'history') settings.history = sw.classList.contains('on');
      if (key === 'animations') settings.animations = sw.classList.contains('on');
      storage.setSettings(settings);
      toast((item?.querySelector('.setting-item-title')?.textContent || '') + ' · ' + (sw.classList.contains('on') ? 'вкл' : 'выкл'));
    });
  });

  const settings = storage.getSettings() || {};
  document.querySelectorAll('[data-setting]').forEach((item) => {
    const key = item.dataset.setting;
    const sw = item.querySelector('[data-switch]');
    if (!sw || !key) return;
    sw.classList.toggle('on', settings[key] !== false);
  });

  $('clearHistoryBtn')?.addEventListener('click', () => {
    if (!confirm('Удалить всю историю чатов?')) return;
    clearAllHistory();
    panel?.classList.remove('show');
  });

  onModelStatus((st) => updateAiStatus(st));
  refreshCacheInfo();
  $('aiClearCacheBtn')?.addEventListener('click', async () => {
    if (!confirm('Удалить кэш AI с устройства? При следующем запуске модель скачается заново (~900 МБ).')) return;
    try {
      await clearModelCache();
      toast('Кэш модели очищен');
      await refreshCacheInfo();
    } catch (e) {
      console.error(e);
      toast('Не удалось очистить кэш');
    }
  });

  $('exportDataBtn')?.addEventListener('click', () => {
    try {
      const payload = {
        chats: storage.getChats(),
        settings: storage.getSettings(),
        trial: null,
        exportedAt: new Date().toISOString(),
      };
      try {
        payload.trial = JSON.parse(localStorage.getItem('nyvex_trial_state') || 'null');
      } catch {}
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'nyvex-export-' + Date.now() + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
      toast('Данные экспортированы');
    } catch (e) {
      console.error(e);
      toast('Ошибка экспорта');
    }
  });

  $('deleteAccountBtn')?.addEventListener('click', () => {
    const word = prompt('Удалить все данные с устройства? Введите УДАЛИТЬ:');
    if (word !== 'УДАЛИТЬ') {
      toast('Отменено');
      return;
    }
    const n = clearAllNyvexData();
    panel?.classList.remove('show');
    toast('Удалено ключей: ' + n);
    location.reload();
  });

  $('aboutAppBtn')?.addEventListener('click', () => {
    window.open('https://abrorismurzaev2-cpu.github.io/nyvex-landing/', '_blank');
  });
}

function formatBytes(n) {
  if (!n || n < 0) return '0 МБ';
  return (n / 1024 / 1024).toFixed(0) + ' МБ';
}
function formatSpeed(bps) {
  if (!bps || bps < 1024) return '';
  return (bps / 1024 / 1024).toFixed(1) + ' МБ/с';
}
function formatEta(sec) {
  if (!sec || !isFinite(sec) || sec <= 0) return '';
  if (sec < 60) return Math.ceil(sec) + ' сек';
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    const s = Math.ceil(sec % 60);
    return m + ' мин ' + s + ' сек';
  }
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h + ' ч ' + m + ' мин';
}

function updateAiStatus(st) {
  const el = $('aiLoadStatus');
  const bar = $('aiLoadBar');
  const meta = $('aiLoadMeta');
  const btn = $('aiLoadBtn');
  if (el) el.textContent = st.label || '';
  if (bar) {
    bar.style.width = (st.pct || 0) + '%';
    bar.parentElement?.classList.toggle('done', st.state === 'ready');
  }
  if (meta) {
    if (st.state === 'loading') {
      const parts = [];
      if (st.loaded || st.total) parts.push(formatBytes(st.loaded) + ' / ' + formatBytes(st.total || 900 * 1024 * 1024));
      const sp = formatSpeed(st.speed);
      if (sp) parts.push('⚡ ' + sp);
      const eta = formatEta(st.eta);
      if (eta) parts.push('⏱ ~' + eta);
      meta.textContent = parts.join(' · ');
    } else if (st.state === 'ready') {
      meta.textContent = 'Готов к работе';
    } else if (st.state === 'error') {
      meta.textContent = st.error || 'Ошибка загрузки';
    } else {
      meta.textContent = 'Нажмите «Загрузить AI»';
    }
  }
  if (btn) {
    if (st.state === 'loading') {
      btn.textContent = 'Отменить';
      btn.dataset.act = 'cancel';
      btn.style.display = '';
    } else if (st.state === 'ready') {
      btn.textContent = 'Перезагрузить';
      btn.dataset.act = 'reload';
      btn.style.display = '';
    } else {
      btn.textContent = 'Загрузить AI';
      btn.dataset.act = 'load';
      btn.style.display = '';
    }
  }
}


async function refreshCacheInfo() {
  const el = $('aiCacheSize');
  if (!el) return;
  try {
    const { formatBytes } = await import('../ai/model-cache.js');
    const size = await getModelCacheSize();
    if (size > 5 * 1024 * 1024) {
      el.textContent = 'AI готов к работе · ' + formatBytes(size) + ' на устройстве';
    } else if (size > 0) {
      el.textContent = 'AI загружается · ' + formatBytes(size);
    } else {
      el.textContent = 'AI не загружен · скачается один раз, дальше офлайн';
    }
  } catch {
    el.textContent = 'Статус AI: н/д';
  }
}
