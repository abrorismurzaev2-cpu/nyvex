/**
 * NYVEX — ui/settings.js (no profile, no model picker)
 */
import { $ } from '../core/utils.js';
import { storage } from '../core/storage.js';
import { toast } from '../core/toast.js';
import { clearAllHistory } from '../chat/history.js';
import { onModelStatus, getModelStatus } from '../ai/loader.js';
import { clearAllNyvexData } from '../core/utils.js';
import { showPaymentModal, refreshSubUI, getCachedState, refreshTrialCache } from '../core/trial.js';
import { showScreen } from '../core/router.js';

export function initSettings() {
  const panel = $('settingsPanel');
  $('settingsBtn')?.addEventListener('click', async () => {
    const st = await refreshTrialCache();
    refreshSubUI(st);
    updateAiStatus(getModelStatus());
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

function updateAiStatus(st) {
  const el = $('aiLoadStatus');
  const bar = $('aiLoadBar');
  if (el) el.textContent = st.label || '';
  if (bar) {
    bar.style.width = (st.pct || 0) + '%';
    bar.parentElement?.classList.toggle('done', st.state === 'ready');
  }
}
