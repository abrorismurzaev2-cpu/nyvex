/**
 * NYVEX — ai/loader.js
 * Web Worker + fallback, model status, model switch
 */
import { MODEL, CDN, MODELS, DEFAULT_MODEL_ID, STORAGE_KEYS } from '../core/config.js';
import { isMobile, $ } from '../core/utils.js';
import { toast } from '../core/toast.js';
import { storage } from '../core/storage.js';

let worker = null;
let modelReady = false;
let modelDevice = 'WASM';
let loadError = null;
let loading = false;
let cancelled = false;
let useWorker = true;
let mainGenerator = null;
let pendingGenerate = new Map();
let reqSeq = 0;
let loadPct = 0;
let statusListeners = [];

function getPrefModelId() {
  try {
    const pref = storage.getModelPref();
    if (pref?.id) return pref.id;
  } catch {}
  return DEFAULT_MODEL_ID;
}

let activeModelId = getPrefModelId();

export function getActiveModelId() {
  return activeModelId;
}

export function isModelReady() {
  return modelReady;
}

export function getModelDevice() {
  return modelDevice;
}

export function getLoadError() {
  return loadError;
}

export function getLoadPct() {
  return loadPct;
}

export function getModelStatus() {
  if (loadError && !modelReady) return { state: 'error', label: 'Ошибка', pct: loadPct, device: modelDevice };
  if (modelReady) return { state: 'ready', label: 'Загружена · ' + modelDevice, pct: 100, device: modelDevice };
  if (loading) return { state: 'loading', label: 'Загрузка · ' + Math.round(loadPct) + '%', pct: loadPct, device: modelDevice };
  return { state: 'idle', label: 'Не загружена', pct: 0, device: modelDevice };
}

export function onModelStatus(fn) {
  statusListeners.push(fn);
  try {
    fn(getModelStatus());
  } catch {}
  return () => {
    statusListeners = statusListeners.filter((x) => x !== fn);
  };
}

function emitStatus() {
  const st = getModelStatus();
  statusListeners.forEach((fn) => {
    try {
      fn(st);
    } catch (e) {
      console.error(e);
    }
  });
  // UI hooks
  try {
    const badge = $('modelBadge');
    if (badge) {
      badge.classList.toggle('loading', st.state === 'loading');
      badge.classList.toggle('error', st.state === 'error');
      if (st.state === 'ready') badge.classList.remove('loading', 'error');
    }
    const desc = $('modelInfoDesc');
    if (desc) desc.textContent = st.label;
    const miStatus = $('miStatus');
    if (miStatus) miStatus.textContent = st.state === 'ready' ? 'Загружена' : st.state === 'error' ? 'Ошибка' : st.state === 'loading' ? 'Загрузка' : 'Не загружена';
    const miDevice = $('miDevice');
    if (miDevice) miDevice.textContent = modelDevice;
    const modelName = $('modelName');
    if (modelName) {
      const m = MODELS.find((x) => x.id === activeModelId);
      modelName.textContent = m?.name || 'Qwen2.5-0.5B';
    }
  } catch (e) {
    console.error('emitStatus UI', e);
  }
}

function formatBytes(n) {
  if (!n || n < 0) return '0 МБ';
  return (n / 1024 / 1024).toFixed(1) + ' МБ';
}

function formatSpeed(bps) {
  if (!bps || bps < 1) return '—';
  return (bps / 1024 / 1024).toFixed(1) + ' МБ/с';
}

function formatEta(sec) {
  if (!sec || !isFinite(sec) || sec < 0) return '—';
  if (sec < 60) return '~' + Math.ceil(sec) + ' сек';
  const m = Math.floor(sec / 60);
  const s = Math.ceil(sec % 60);
  return '~' + m + ' мин ' + s + ' сек';
}

function updateUI(payload) {
  const fill = $('loadFill');
  const st = $('loadStatus');
  const pc = $('loadPercent');
  const det = $('loadDetail');
  const warn = $('loadWarn');
  const speedEl = $('loadSpeed');
  const etaEl = $('loadEta');
  const mbEl = $('loadMb');

  if (payload.status === 'from_cache' || payload.status === 'done') {
    loadPct = 100;
    if (st) st.textContent = payload.status === 'from_cache' ? 'Загрузка из кэша ✓' : 'Готово!';
    if (det) det.textContent = 'Модель · ' + modelDevice;
    if (fill) fill.style.width = '100%';
    if (pc) pc.textContent = '100%';
    emitStatus();
    return;
  }

  if (payload.status === 'progress') {
    const total = payload.total || 350 * 1024 * 1024;
    const loaded = payload.loaded || 0;
    const pct = payload.pct != null ? payload.pct : total ? (loaded / total) * 100 : 0;
    loadPct = Math.min(99, pct);
    if (fill) fill.style.width = loadPct + '%';
    if (pc) pc.textContent = Math.round(loadPct) + '%';
    if (st) st.textContent = 'Скачивание модели…';
    if (mbEl) mbEl.textContent = formatBytes(loaded) + ' / ' + formatBytes(total);
    if (speedEl) speedEl.textContent = formatSpeed(payload.speed);
    if (etaEl) etaEl.textContent = 'ETA ' + formatEta(payload.eta);
    if (det) {
      const slow = payload.speed > 0 && payload.speed < 200 * 1024;
      det.textContent = slow ? 'Медленное соединение. Рекомендуем Wi‑Fi' : 'Ускорение: ' + modelDevice;
    }
    if (warn && payload.speed > 0 && payload.speed < 100 * 1024) {
      warn.style.display = 'block';
      warn.textContent = '⚠️ Медленная сеть. Первый запуск ~350 МБ — лучше на Wi‑Fi.';
    }
    emitStatus();
    return;
  }

  if (payload.status === 'ready' || payload.status === 'init') {
    if (st) st.textContent = payload.message || 'Инициализация…';
    if (payload.pct != null) {
      loadPct = payload.pct;
      if (fill) fill.style.width = payload.pct + '%';
      if (pc) pc.textContent = Math.round(payload.pct) + '%';
    }
    emitStatus();
  }
}

function ensureWorker() {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const msg = e.data || {};
      if (msg.type === 'progress') {
        updateUI(msg);
      } else if (msg.type === 'loaded') {
        modelReady = true;
        modelDevice = msg.device === 'webgpu' ? 'WebGPU' : 'WASM';
        loadPct = 100;
        updateUI({ status: 'done' });
        emitStatus();
      } else if (msg.type === 'result') {
        const p = pendingGenerate.get(msg.id);
        if (p) {
          pendingGenerate.delete(msg.id);
          p.resolve(msg.text);
        }
      } else if (msg.type === 'error') {
        if (msg.id && pendingGenerate.has(msg.id)) {
          const p = pendingGenerate.get(msg.id);
          pendingGenerate.delete(msg.id);
          p.reject(new Error(msg.message || 'Worker error'));
        } else {
          loadError = new Error(msg.message || 'Worker error');
          console.error('Worker error:', msg.message);
          emitStatus();
        }
      }
    };
    worker.onerror = (err) => {
      console.error('Worker crash:', err);
      useWorker = false;
      loadError = err;
      emitStatus();
    };
    return worker;
  } catch (e) {
    console.warn('Worker unavailable', e);
    useWorker = false;
    return null;
  }
}

export function cancelLoad() {
  cancelled = true;
  if (worker) {
    try {
      worker.terminate();
    } catch {}
    worker = null;
  }
  loading = false;
  modelReady = false;
  if ($('loadStatus')) $('loadStatus').textContent = 'Загрузка отменена';
  toast('Загрузка отменена');
  emitStatus();
}

export async function loadModel(modelId) {
  if (loading) return modelReady;
  if (modelReady && (!modelId || modelId === activeModelId)) return true;

  if (modelId && modelId !== activeModelId) {
    await unloadModel();
    activeModelId = modelId;
    storage.setModelPref({ id: modelId, at: Date.now() });
  }

  loading = true;
  cancelled = false;
  loadError = null;
  loadPct = 0;
  emitStatus();

  const warn = $('loadWarn');
  if (warn) {
    warn.style.display = 'block';
    warn.textContent =
      '📥 При первом запуске скачивается модель. Рекомендуем Wi‑Fi. Повторный запуск — из кэша.';
  }

  const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
  const preferGpu = hasWebGPU && !isMobile();
  modelDevice = preferGpu ? 'WebGPU' : 'WASM';

  const w = ensureWorker();
  if (w && useWorker) {
    try {
      const ok = await new Promise((resolve) => {
        const onMsg = (e) => {
          const msg = e.data || {};
          if (msg.type === 'loaded') {
            w.removeEventListener('message', onMsg);
            resolve(true);
          } else if (msg.type === 'error' && !msg.id) {
            w.removeEventListener('message', onMsg);
            resolve(false);
          }
        };
        w.addEventListener('message', onMsg);
        w.postMessage({ type: 'load', preferGpu, modelId: activeModelId });
        setTimeout(() => {
          w.removeEventListener('message', onMsg);
          if (!modelReady) resolve(false);
        }, 15 * 60 * 1000);
      });
      loading = false;
      if (cancelled) return false;
      if (!ok && !modelReady) return loadMainThread(preferGpu);
      emitStatus();
      return modelReady;
    } catch (e) {
      console.error(e);
      useWorker = false;
      return loadMainThread(preferGpu);
    }
  }
  return loadMainThread(preferGpu);
}

async function loadMainThread(preferGpu) {
  try {
    const { pipeline, env } = await import(/* @vite-ignore */ CDN.primary);
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    modelDevice = preferGpu ? 'WebGPU' : 'WASM';

    const progressMap = {};
    let lastTs = Date.now();
    let lastLoaded = 0;

    mainGenerator = await pipeline(MODEL.task, activeModelId, {
      device: preferGpu ? 'webgpu' : 'wasm',
      dtype: MODEL.dtype,
      progress_callback: (p) => {
        if (cancelled) return;
        if (p.status === 'progress' && p.file) {
          progressMap[p.file] = { loaded: p.loaded || 0, total: p.total || 0 };
          let total = 0;
          let loaded = 0;
          for (const k in progressMap) {
            total += progressMap[k].total;
            loaded += progressMap[k].loaded;
          }
          const now = Date.now();
          const dt = Math.max(0.05, (now - lastTs) / 1000);
          const speed = (loaded - lastLoaded) / dt;
          lastTs = now;
          lastLoaded = loaded;
          updateUI({
            status: 'progress',
            loaded,
            total,
            pct: total ? (loaded / total) * 100 : 0,
            speed,
            eta: speed > 0 && total > loaded ? (total - loaded) / speed : 0,
          });
        }
      },
    });

    if (cancelled) {
      mainGenerator = null;
      loading = false;
      emitStatus();
      return false;
    }

    modelReady = true;
    useWorker = false;
    loadPct = 100;
    updateUI({ status: 'done' });
    loading = false;
    emitStatus();
    return true;
  } catch (e) {
    console.error('Main-thread model load error:', e);
    loadError = e;
    loading = false;
    if ($('loadWarn')) {
      $('loadWarn').style.display = 'block';
      $('loadWarn').textContent =
        '⚠️ Не удалось загрузить LLM: ' + (e?.message || 'ошибка') + '. Интерфейс доступен.';
    }
    if ($('loadStatus')) $('loadStatus').textContent = 'LLM недоступна';
    emitStatus();
    return false;
  }
}

export async function unloadModel() {
  modelReady = false;
  mainGenerator = null;
  if (worker) {
    try {
      worker.terminate();
    } catch {}
    worker = null;
  }
  pendingGenerate.clear();
  emitStatus();
}

export function generateViaWorker(messages, options = {}) {
  if (!modelReady) {
    return Promise.resolve('Модель ещё не загружена. Подождите или обновите страницу.');
  }

  if (useWorker && worker) {
    const id = ++reqSeq;
    return new Promise((resolve, reject) => {
      pendingGenerate.set(id, { resolve, reject });
      try {
        worker.postMessage({ type: 'generate', id, messages, options });
      } catch (e) {
        pendingGenerate.delete(id);
        reject(e);
      }
      setTimeout(() => {
        if (pendingGenerate.has(id)) {
          pendingGenerate.delete(id);
          reject(new Error('Timeout генерации'));
        }
      }, 120000);
    });
  }

  return (async () => {
    if (!mainGenerator) return 'Модель недоступна.';
    try {
      const output = await mainGenerator(messages, {
        max_new_tokens: options.max_new_tokens || MODEL.maxNewTokens,
        temperature: options.temperature ?? MODEL.temperature,
        top_p: options.top_p ?? MODEL.topP,
        do_sample: true,
        repetition_penalty: options.repetition_penalty ?? MODEL.repetitionPenalty,
      });
      let reply = '';
      if (Array.isArray(output) && output[0]?.generated_text) {
        const gen = output[0].generated_text;
        if (Array.isArray(gen)) {
          const last = gen[gen.length - 1];
          reply = typeof last === 'string' ? last : last?.content || '';
        } else {
          reply = String(gen).replace(/^[\s\S]*?assistant\s*/i, '').trim();
        }
      }
      return reply || 'Не удалось сгенерировать ответ.';
    } catch (e) {
      return 'Ошибка генерации: ' + String(e?.message || '').slice(0, 120);
    }
  })();
}

export function terminateWorker() {
  unloadModel();
}
