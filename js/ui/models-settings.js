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
  getDeviceMemoryGb,
  isModelRecommended,
} from '../ai/models.js';
import { toast } from '../core/toast.js';
import { loadModel, isModelReady, unloadModel, cancelLoad } from '../ai/loader.js';

function stars(n) {
  return '★'.repeat(Math.max(0, n || 0));
}

function rockets(n) {
  return '▲'.repeat(Math.max(0, n || 0));
}

let downloadingId = null;

export function renderModelList() {
  const container = document.getElementById('modelList');
  if (!container) return;

  const activeId = getActiveModel().id;
  const ram = getDeviceMemoryGb();
  const hint = `<p class="model-hint">3 модели AI на выбор — от Meta и сообщества. Для большинства телефонов подходит «Умная». «Мощная» — для флагманов (6+ ГБ RAM). На этом устройстве ≈${ram} ГБ RAM.</p>`;

  container.innerHTML =
    hint +
    AVAILABLE_MODELS.map((model) => {
      const isActive = model.id === activeId;
      const isDownloaded = isModelDownloaded(model.id);
      const recommended = isModelRecommended(model);
      const warn = !recommended
        ? `<div class="model-warn">Может не хватить памяти на этом телефоне</div>`
        : '';

      let actions = '';
      if (downloadingId === model.id) {
        actions = `<button type="button" class="model-btn danger" data-act="cancel-dl" data-id="${model.id}">Отменить</button>`;
      } else if (!isDownloaded) {
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
        <div class="model-name">${model.name}${model.default ? ' · Рекомендуется' : ''}</div>
        <div class="model-desc">${model.description}</div>
        <div class="model-meta">
          <span>${model.vendor || ''}</span>
          <span>📦 ${model.sizeLabel}</span>
          <span>💾 ~${model.ramNeededGb} ГБ RAM</span>
          <span>⭐ ${stars(model.quality)}</span>
        </div>
        ${warn}
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

  if (!isModelRecommended(model)) {
    const ok = confirm(
      `Модель «${model.name}» требует ~${model.ramNeededGb} ГБ RAM. На этом устройстве может не хватить памяти. Скачать всё равно?`
    );
    if (!ok) return;
  }

  const progressBar = document.getElementById('progress-' + id);
  const progressText = document.getElementById('progress-text-' + id);
  const fill = progressBar?.querySelector('.model-progress-fill');
  if (progressBar) progressBar.style.display = 'block';
  if (progressText) progressText.style.display = 'flex';

  downloadingId = id;
  renderModelList();
  // re-show progress after re-render
  const pb = document.getElementById('progress-' + id);
  const pt = document.getElementById('progress-text-' + id);
  if (pb) pb.style.display = 'block';
  if (pt) pt.style.display = 'flex';

  try {
    setActiveModel(id);
    try {
      await unloadModel();
    } catch {}
    const ok = await loadModel();
    downloadingId = null;
    if (ok || isModelReady()) {
      markModelDownloaded(id);
      if (fill) fill.style.width = '100%';
      toast('Модель «' + model.name + '» загружена');
      renderModelList();
    } else {
      throw new Error('Загрузка не завершена');
    }
  } catch (e) {
    downloadingId = null;
    console.error('downloadModel', e);
    toast('Ошибка: ' + (e?.message || 'не удалось скачать'));
    renderModelList();
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
    setActiveModel('llama-3.2-1b');
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
    else if (act === 'cancel-dl') {
      cancelLoad();
      downloadingId = null;
      toast('Загрузка отменена');
      renderModelList();
    }
  });
}
