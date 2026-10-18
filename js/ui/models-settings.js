/**
 * NYVEX — model status in settings (single model, no picker)
 */
import { getActiveModel, isModelDownloaded } from '../ai/models.js';
import {
  isModelReady,
  isLoading,
  getModelStatus,
  loadModel,
  cancelLoad,
  onModelStatus,
  getModelCacheSize,
} from '../ai/loader.js';
import { formatBytes } from '../ai/model-cache.js';
import { toast } from '../core/toast.js';

function renderStatus() {
  const list = document.getElementById('modelList');
  if (!list) return;
  const st = getModelStatus();
  const ready = isModelReady();
  const loading = isLoading();
  const downloaded = isModelDownloaded('default') || isModelDownloaded('fast');

  let statusText = 'Не загружена';
  let action = '';
  if (ready) {
    statusText = 'Готова к работе · офлайн';
  } else if (loading) {
    const pct = Math.round(st.pct || 0);
    statusText = `Загрузка ${pct}%`;
    if (st.loaded && st.total) {
      statusText += ` · ${formatBytes(st.loaded)} / ${formatBytes(st.total)}`;
    }
    action = `<button type="button" class="model-btn cancel" id="settingsCancelLoad">Отменить</button>`;
  } else if (downloaded || st.state === 'ready') {
    statusText = 'В кэше · нажмите «Загрузить»';
    action = `<button type="button" class="model-btn primary" id="settingsLoadModel">Загрузить AI</button>`;
  } else {
    statusText = 'Нужна первая загрузка (~400 МБ)';
    action = `<button type="button" class="model-btn primary" id="settingsLoadModel">Загрузить AI</button>`;
  }

  list.innerHTML = `
    <div class="model-card active">
      <div class="model-card-head">
        <div class="model-card-title">Локальный AI</div>
        <div class="model-card-badge">${ready ? '✓' : loading ? '…' : '○'}</div>
      </div>
      <div class="model-card-desc">${statusText}</div>
      <div class="model-card-specs">Работает на устройстве · без серверов</div>
      ${action ? `<div class="model-card-actions">${action}</div>` : ''}
    </div>`;

  document.getElementById('settingsLoadModel')?.addEventListener('click', async () => {
    try {
      toast('Загрузка AI…');
      await loadModel();
      toast(isModelReady() ? 'AI готов' : 'Загрузка…');
      renderStatus();
    } catch (e) {
      console.error(e);
      toast('Не удалось загрузить');
    }
  });
  document.getElementById('settingsCancelLoad')?.addEventListener('click', () => {
    cancelLoad();
    toast('Загрузка остановлена');
    renderStatus();
  });
}

export function initModelSettings() {
  renderStatus();
  onModelStatus(() => renderStatus());
}
