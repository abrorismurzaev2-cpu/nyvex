/**
 * NYVEX — settings UI for model download / switch / delete
 */
import {
  AVAILABLE_MODELS,
  getActiveModel,
  setActiveModel,
  isModelDownloaded,
  markModelDownloaded,
  unmarkModelDownloaded,
} from '../ai/models.js';
import { toast } from '../core/toast.js';
import { loadModel, isModelReady, unloadModel } from '../ai/loader.js';

function stars(n) {
  return '★'.repeat(Math.max(0, n || 0));
}

function rockets(n) {
  return '▲'.repeat(Math.max(0, n || 0));
}

export function renderModelList() {
  const container = document.getElementById('modelList');
  if (!container) return;

  const activeId = getActiveModel().id;

  container.innerHTML = AVAILABLE_MODELS.map((model) => {
    const isActive = model.id === activeId;
    const isDownloaded = isModelDownloaded(model.id);
    const ramGb = Math.round((model.ramNeeded / (1024 * 1024 * 1024)) * 10) / 10;

    let actions = '';
    if (!isDownloaded) {
      actions = `<button type="button" class="model-btn primary" data-act="download" data-id="${model.id}">Скачать</button>`;
    } else if (isActive) {
      actions = `<span class="model-active-label">✓ Активна</span>`;
    } else {
      actions = `
        <button type="button" class="model-btn primary" data-act="activate" data-id="${model.id}">Использовать</button>
        <button type="button" class="model-btn danger" data-act="delete" data-id="${model.id}">Удалить</button>`;
    }

    return `
      <div class="model-item ${isActive ? 'active' : ''}" data-model-id="${model.id}">
        <div class="model-name">${model.name}</div>
        <div class="model-desc">${model.description}</div>
        <div class="model-meta">
          <span>📦 ${model.sizeLabel}</span>
          <span>⭐ ${stars(model.quality)}</span>
          <span>⚡ ${rockets(model.speed)}</span>
          <span>💾 ~${ramGb} ГБ RAM</span>
        </div>
        <div class="model-actions">${actions}</div>
        <div class="model-progress" id="progress-${model.id}" style="display:none">
          <div class="model-progress-fill" style="width:0%"></div>
        </div>
        <div class="model-progress-text" id="progress-text-${model.id}" style="display:none"></div>
      </div>`;
  }).join('');
}

async function downloadModel(id) {
  const model = AVAILABLE_MODELS.find((m) => m.id === id);
  if (!model) return;

  const progressBar = document.getElementById('progress-' + id);
  const progressText = document.getElementById('progress-text-' + id);
  const fill = progressBar?.querySelector('.model-progress-fill');
  if (progressBar) progressBar.style.display = 'block';
  if (progressText) progressText.style.display = 'flex';

  try {
    setActiveModel(id);
    // Force unload previous then load (loader uses getActiveModel)
    try {
      await unloadModel();
    } catch {}
    // Progress via global loader UI + local bar (listen status if possible)
    const ok = await loadModel();
    if (ok || isModelReady()) {
      markModelDownloaded(id);
      if (fill) fill.style.width = '100%';
      if (progressText) progressText.innerHTML = '<span>Готово</span><span>100%</span>';
      toast('Модель «' + model.name + '» загружена');
      renderModelList();
    } else {
      throw new Error('Загрузка не завершена');
    }
  } catch (e) {
    console.error('downloadModel', e);
    toast('Ошибка: ' + (e?.message || 'не удалось скачать'));
    if (progressBar) progressBar.style.display = 'none';
    if (progressText) progressText.style.display = 'none';
  }
}

function activateModel(id) {
  setActiveModel(id);
  renderModelList();
  toast('Модель переключена. Перезагрузка…');
  setTimeout(() => location.reload(), 900);
}

async function deleteModel(id) {
  if (!confirm('Удалить модель с устройства? Потребуется скачать снова.')) return;
  const model = AVAILABLE_MODELS.find((m) => m.id === id);
  if (model) {
    try {
      const names = await caches.keys();
      for (const name of names) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        for (const req of keys) {
          const u = req.url || '';
          if (u.includes(model.hfId) || u.includes(encodeURIComponent(model.hfId))) {
            await cache.delete(req);
          }
        }
      }
    } catch (e) {
      console.warn(e);
    }
  }
  unmarkModelDownloaded(id);
  if (getActiveModel().id === id) {
    setActiveModel('qwen-0.5b');
  }
  renderModelList();
  toast('Модель удалена');
}

export function initModelSettings() {
  const container = document.getElementById('modelList');
  if (!container) return;
  renderModelList();
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const act = btn.getAttribute('data-act');
    if (act === 'download') downloadModel(id);
    else if (act === 'activate') activateModel(id);
    else if (act === 'delete') deleteModel(id);
  });
}
