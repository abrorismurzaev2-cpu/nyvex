/**
 * NYVEX — ui/settings.js
 */
import { $ } from '../core/utils.js';
import { storage } from '../core/storage.js';
import { toast } from '../core/toast.js';
import { clearAllHistory } from '../chat/history.js';
import { logout } from '../auth/register.js';
import {
  getModelDevice,
  isModelReady,
  getLoadError,
  getModelStatus,
  onModelStatus,
  loadModel,
  getActiveModelId,
} from '../ai/loader.js';
import { MODELS, PRICE_RUB } from '../core/config.js';
import {
  getTrialInfo,
  formatRemaining,
  activatePro,
  cancelPro,
  showTrialModal,
  hideTrialModal,
} from '../core/trial.js';

export function initSettings() {
  const panel = $('settingsPanel');
  $('settingsBtn')?.addEventListener('click', () => {
    refreshSubscriptionUI();
    renderModelList();
    panel?.classList.add('show');
  });
  $('settingsClose')?.addEventListener('click', () => panel?.classList.remove('show'));
  panel?.addEventListener('click', (e) => {
    if (e.target === panel) panel.classList.remove('show');
  });

  $('userBtn')?.addEventListener('click', () => {
    refreshSubscriptionUI();
    renderModelList();
    panel?.classList.add('show');
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
      const title = item?.querySelector('.setting-item-title')?.textContent || '';
      toast(title + ' · ' + (sw.classList.contains('on') ? 'вкл' : 'выкл'));
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

  $('logoutBtn')?.addEventListener('click', () => {
    if (!confirm('Выйти из аккаунта?')) return;
    panel?.classList.remove('show');
    logout();
  });

  const modelModal = $('modelModal');
  $('modelInfoBtn')?.addEventListener('click', () => {
    const st = getModelStatus();
    if ($('miDevice')) $('miDevice').textContent = getModelDevice();
    if ($('miStatus')) $('miStatus').textContent = st.label;
    modelModal?.classList.add('show');
  });
  $('modelModalClose')?.addEventListener('click', () => modelModal?.classList.remove('show'));
  modelModal?.addEventListener('click', (e) => {
    if (e.target === modelModal) modelModal.classList.remove('show');
  });

  // live status
  onModelStatus((st) => {
    if ($('modelInfoDesc')) $('modelInfoDesc').textContent = st.label;
  });

  $('subscribeBtn')?.addEventListener('click', () => {
    activatePro();
    refreshSubscriptionUI();
  });
  $('cancelSubBtn')?.addEventListener('click', () => {
    if (!confirm('Отменить подписку?')) return;
    cancelPro();
    refreshSubscriptionUI();
  });

  $('trialModalClose')?.addEventListener('click', hideTrialModal);
  $('trialModalLater')?.addEventListener('click', hideTrialModal);
  $('trialModalPay')?.addEventListener('click', () => {
    activatePro();
  });
  $('trialModal')?.addEventListener('click', (e) => {
    if (e.target === $('trialModal')) hideTrialModal();
  });

  $('trialBadge')?.addEventListener('click', () => {
    const info = getTrialInfo();
    if (info.plan === 'pro') {
      toast('Подписка Pro активна');
      return;
    }
    toast('Осталось: ' + formatRemaining(info.remainingMs));
    if (info.expired) showTrialModal('expired');
  });
}

function stars(n) {
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));
}

export function renderModelList() {
  const box = $('modelList');
  if (!box) return;
  const active = getActiveModelId();
  const st = getModelStatus();
  box.innerHTML = MODELS.map((m) => {
    const isActive = m.id === active;
    return `<div class="model-card ${isActive ? 'active' : ''}" data-model="${m.id}">
      <div class="model-card-top">
        <strong>${m.name}</strong>
        ${isActive ? '<span class="tag">активна</span>' : ''}
      </div>
      <div class="model-card-meta">${m.sizeMB} МБ · ${m.desc}</div>
      <div class="model-card-stars">Качество ${stars(m.quality)} · Скорость ${stars(m.speed)}</div>
      <div class="model-card-actions">
        <button type="button" class="btn btn-sm btn-primary" data-select-model="${m.id}">
          ${isActive && st.state === 'ready' ? 'Выбрана' : isActive && st.state === 'loading' ? 'Загрузка…' : 'Выбрать'}
        </button>
      </div>
    </div>`;
  }).join('');

  box.querySelectorAll('[data-select-model]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.selectModel;
      if (!id) return;
      btn.disabled = true;
      btn.textContent = 'Загрузка…';
      toast('Загружаем модель…');
      try {
        const ok = await loadModel(id);
        toast(ok ? 'Модель готова' : 'Не удалось загрузить');
      } catch (e) {
        console.error(e);
        toast('Ошибка загрузки модели');
      }
      renderModelList();
    });
  });
}

function refreshSubscriptionUI() {
  const info = getTrialInfo();
  const bar = $('trialProgress');
  const label = $('trialStatusLabel');
  const endEl = $('trialEndDate');
  if (label) {
    if (info.plan === 'pro') label.textContent = 'Pro · активна';
    else if (info.expired) label.textContent = 'Пробный период истёк';
    else label.textContent = 'Пробный · осталось ' + formatRemaining(info.remainingMs);
  }
  if (bar) {
    if (info.plan === 'pro') bar.style.width = '100%';
    else {
      const total = 7 * 24 * 60 * 60 * 1000;
      const pct = info.expired ? 0 : Math.min(100, (info.remainingMs / total) * 100);
      bar.style.width = pct + '%';
    }
  }
  if (endEl) {
    if (info.plan === 'pro') endEl.textContent = 'Без ограничений';
    else if (info.trialEnd)
      endEl.textContent = 'До ' + new Date(info.trialEnd).toLocaleString('ru-RU');
    else endEl.textContent = '—';
  }
}
