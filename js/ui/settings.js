/**
 * NYVEX — ui/settings.js
 */

import { $ } from '../core/utils.js';
import { storage } from '../core/storage.js';
import { toast } from '../core/toast.js';
import { clearAllHistory } from '../chat/history.js';
import { logout } from '../auth/register.js';
import { getModelDevice, isModelReady, getLoadError } from '../ai/loader.js';

export function initSettings() {
  const panel = $('settingsPanel');
  $('settingsBtn')?.addEventListener('click', () => panel?.classList.add('show'));
  $('settingsClose')?.addEventListener('click', () => panel?.classList.remove('show'));
  panel?.addEventListener('click', (e) => {
    if (e.target === panel) panel.classList.remove('show');
  });

  $('userBtn')?.addEventListener('click', () => panel?.classList.add('show'));

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
      const title = item?.querySelector('.setting-item-title')?.textContent || '';
      toast(title + ' · ' + (sw.classList.contains('on') ? 'вкл' : 'выкл'));
    });
  });

  // restore switches
  const settings = storage.getSettings() || {};
  document.querySelectorAll('[data-setting]').forEach((item) => {
    const key = item.dataset.setting;
    const sw = item.querySelector('[data-switch]');
    if (!sw || !key) return;
    const on = settings[key] !== false;
    sw.classList.toggle('on', on);
  });

  $('clearHistoryBtn')?.addEventListener('click', () => {
    if (!confirm('Удалить всю историю чатов?')) return;
    clearAllHistory();
    panel?.classList.remove('show');
  });

  $('logoutBtn')?.addEventListener('click', () => {
    if (!confirm('Выйти из аккаунта?')) return;
    panel?.classList.remove('show');
    logout();
  });

  const modelModal = $('modelModal');
  $('modelInfoBtn')?.addEventListener('click', () => {
    const miDevice = $('miDevice');
    const miStatus = $('miStatus');
    if (miDevice) miDevice.textContent = getModelDevice();
    if (miStatus) {
      miStatus.textContent = isModelReady() ? 'Загружена' : getLoadError() ? 'Ошибка' : 'Загрузка';
    }
    modelModal?.classList.add('show');
  });
  $('modelModalClose')?.addEventListener('click', () => modelModal?.classList.remove('show'));
  modelModal?.addEventListener('click', (e) => {
    if (e.target === modelModal) modelModal.classList.remove('show');
  });
}
