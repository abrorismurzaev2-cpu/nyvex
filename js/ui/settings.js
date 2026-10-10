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
  getModelStatus,
  onModelStatus,
  loadModel,
  unloadModel,
  getActiveModelId,
  cancelLoad,
  isModelReady,
} from '../ai/loader.js';
import { MODELS, PRICE_RUB, STORAGE_KEYS } from '../core/config.js';
import {
  getTrialInfo,
  formatRemaining,
  activatePro,
  cancelPro,
  showTrialModal,
  hideTrialModal,
} from '../core/trial.js';

const DL_KEY = 'nyvex_downloaded_models';

function getDownloaded() {
  try {
    return JSON.parse(localStorage.getItem(DL_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function markDownloaded(id, sizeMB) {
  const d = getDownloaded();
  d[id] = { downloadedAt: Date.now(), sizeMB };
  try {
    localStorage.setItem(DL_KEY, JSON.stringify(d));
  } catch (e) {
    console.error(e);
  }
}

function unmarkDownloaded(id) {
  const d = getDownloaded();
  delete d[id];
  try {
    localStorage.setItem(DL_KEY, JSON.stringify(d));
  } catch {}
}

/** Per-model download progress UI state */
const progressState = {};

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

  onModelStatus((st) => {
    if ($('modelInfoDesc')) $('modelInfoDesc').textContent = st.label;
    // refresh active card progress if matching
    const active = getActiveModelId();
    if (progressState[active] || st.state === 'loading') {
      progressState[active] = {
        ...(progressState[active] || {}),
        percent: st.pct,
        status: st.label,
        loading: st.state === 'loading',
      };
      updateCardProgress(active);
    }
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
  $('trialModalPay')?.addEventListener('click', () => activatePro());
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

  // About → show landing
  $('aboutAppBtn')?.addEventListener('click', () => {
    // Отдельный лендинг-сайт
    window.open('https://abrorismurzaev2-cpu.github.io/nyvex-landing/', '_blank');
  });
}

function updateCardProgress(modelId) {
  const card = document.querySelector(`[data-model="${CSS.escape(modelId)}"]`);
  if (!card) return;
  const st = progressState[modelId] || {};
  const bar = card.querySelector('.model-progress-fill');
  const meta = card.querySelector('.model-progress-meta');
  const wrap = card.querySelector('.model-progress');
  if (st.loading || (st.percent > 0 && st.percent < 100)) {
    if (wrap) wrap.style.display = 'block';
    if (bar) bar.style.width = Math.min(99, st.percent || 0) + '%';
    if (meta) {
      const pct = Math.round(st.percent || 0);
      const parts = [`${pct}%`];
      if (st.loaded && st.total) parts.push(`${st.loaded} / ${st.total} МБ`);
      if (st.speed) parts.push(st.speed);
      if (st.eta) parts.push(st.eta);
      meta.textContent = parts.join(' · ');
    }
  } else if (st.percent >= 100) {
    if (wrap) wrap.style.display = 'none';
  }
}

export function renderModelList() {
  const box = $('modelList');
  if (!box) return;
  const active = getActiveModelId();
  const st = getModelStatus();
  const downloaded = getDownloaded();
  // mark active as downloaded when ready
  if (isModelReady() && active) markDownloaded(active, MODELS.find((m) => m.id === active)?.sizeMB);

  box.innerHTML = MODELS.map((m) => {
    const isActive = m.id === active;
    const isDl = !!downloaded[m.id] || (isActive && st.state === 'ready');
    const loading = isActive && st.state === 'loading';
    const ps = progressState[m.id] || {};
    const showProg = loading || (ps.loading && ps.percent < 100);

    return `<div class="model-card ${isActive ? 'active' : ''}" data-model="${m.id}">
      <div class="model-card-top">
        <strong>${m.name}</strong>
        ${isActive && st.state === 'ready' ? '<span class="tag">Активна</span>' : ''}
        ${loading ? '<span class="tag">Загрузка…</span>' : ''}
      </div>
      <div class="model-card-meta">${m.desc || ''}</div>
      <div class="model-card-stars">${m.size || m.sizeMB + ' МБ'} · ${m.qualityStars || ''} · ${m.speedIcons || ''} · RAM ${m.ram || '—'}</div>
      <div class="model-progress" style="display:${showProg ? 'block' : 'none'};margin:10px 0;">
        <div class="sub-progress"><div class="model-progress-fill sub-progress-fill" style="width:${ps.percent || st.pct || 0}%"></div></div>
        <div class="model-progress-meta" style="font-size:11px;color:var(--dim-2);margin-top:6px;">${Math.round(ps.percent || st.pct || 0)}%</div>
      </div>
      <div class="model-card-actions">
        ${
          isActive && st.state === 'ready'
            ? `<button type="button" class="btn btn-sm btn-ghost" data-forget-model="${m.id}">Сбросить статус</button>`
            : isActive && loading
              ? `<button type="button" class="btn btn-sm btn-ghost" data-cancel-model="${m.id}">Отменить</button>`
              : isDl
                ? `<button type="button" class="btn btn-sm btn-primary" data-select-model="${m.id}">Активировать</button>`
                : `<button type="button" class="btn btn-sm btn-primary" data-select-model="${m.id}">Скачать</button>`
        }
      </div>
    </div>`;
  }).join('');

  box.querySelectorAll('[data-select-model]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.selectModel;
      if (!id) return;
      const m = MODELS.find((x) => x.id === id);
      btn.disabled = true;
      btn.textContent = 'Загрузка…';
      progressState[id] = { loading: true, percent: 0 };
      renderModelList();
      toast('Скачиваем ' + (m?.name || 'модель') + '…');
      try {
        const ok = await loadModel(id);
        if (ok) {
          markDownloaded(id, m?.sizeMB);
          progressState[id] = { loading: false, percent: 100 };
          toast('Модель готова: ' + (m?.name || id));
        } else {
          toast('Не удалось загрузить модель');
          progressState[id] = { loading: false, percent: 0 };
        }
      } catch (e) {
        console.error(e);
        toast('Ошибка: ' + String(e?.message || '').slice(0, 80));
        progressState[id] = { loading: false, percent: 0 };
      }
      renderModelList();
    });
  });

  box.querySelectorAll('[data-cancel-model]').forEach((btn) => {
    btn.addEventListener('click', () => {
      cancelLoad();
      const id = btn.dataset.cancelModel;
      if (id) progressState[id] = { loading: false, percent: 0 };
      toast('Загрузка отменена');
      renderModelList();
    });
  });

  box.querySelectorAll('[data-forget-model]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.forgetModel;
      if (id) unmarkDownloaded(id);
      toast('Статус сброшен (файлы кэша браузера могут остаться)');
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
    else if (info.trialEnd) endEl.textContent = 'До ' + new Date(info.trialEnd).toLocaleString('ru-RU');
    else endEl.textContent = '—';
  }
}
