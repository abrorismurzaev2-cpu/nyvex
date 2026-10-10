/**
 * NYVEX — ai/loader.js
 * Загрузка модели через Web Worker (+ fallback main thread)
 */

import { MODEL, CDN } from '../core/config.js';
import { isMobile, $ } from '../core/utils.js';
import { toast } from '../core/toast.js';

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

const EST_TOTAL_BYTES = 350 * 1024 * 1024;

export function isModelReady() {
  return modelReady;
}

export function getModelDevice() {
  return modelDevice;
}

export function getLoadError() {
  return loadError;
}

export function isUsingWorker() {
  return useWorker && !!worker;
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

  if (payload.status === 'from_cache') {
    if (st) st.textContent = 'Загрузка из кэша ✓';
    if (det) det.textContent = 'Модель уже на устройстве';
    if (fill) fill.style.width = '100%';
    if (pc) pc.textContent = '100%';
    if (mbEl) mbEl.textContent = '';
    if (speedEl) speedEl.textContent = '';
    if (etaEl) etaEl.textContent = '';
    return;
  }

  if (payload.status === 'progress') {
    const total = payload.total || EST_TOTAL_BYTES;
    const loaded = payload.loaded || 0;
    const pct = payload.pct != null ? payload.pct : total ? (loaded / total) * 100 : 0;
    if (fill) fill.style.width = Math.min(99, pct) + '%';
    if (pc) pc.textContent = Math.round(Math.min(99, pct)) + '%';
    if (st) st.textContent = 'Скачивание модели…';
    if (mbEl) mbEl.textContent = formatBytes(loaded) + ' / ' + formatBytes(total);
    if (speedEl) speedEl.textContent = formatSpeed(payload.speed);
    if (etaEl) etaEl.textContent = 'ETA ' + formatEta(payload.eta);
    if (det) {
      const slow = payload.speed > 0 && payload.speed < 200 * 1024;
      det.textContent = slow
        ? 'Медленное соединение. Рекомендуем Wi‑Fi'
        : 'Ускорение: ' + modelDevice;
    }
    if (warn && payload.speed > 0 && payload.speed < 100 * 1024) {
      warn.style.display = 'block';
      warn.textContent = '⚠️ Медленная сеть. Первый запуск ~350 МБ — лучше на Wi‑Fi.';
    }
    return;
  }

  if (payload.status === 'ready' || payload.status === 'init') {
    if (st) st.textContent = payload.message || 'Инициализация…';
    if (payload.pct != null && fill) fill.style.width = payload.pct + '%';
    if (payload.pct != null && pc) pc.textContent = Math.round(payload.pct) + '%';
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
        updateUI({ status: 'from_cache' });
        const fill = $('loadFill');
        const pc = $('loadPercent');
        const st = $('loadStatus');
        if (fill) fill.style.width = '100%';
        if (pc) pc.textContent = '100%';
        if (st) st.textContent = 'Готово!';
        $('modelBadge')?.classList.remove('loading');
        if ($('modelBadge')) $('modelBadge').textContent = 'nyvex';
        if ($('modelInfoDesc')) $('modelInfoDesc').textContent = 'Готово · ' + modelDevice;
        if ($('miStatus')) $('miStatus').textContent = 'Загружена';
        if ($('miDevice')) $('miDevice').textContent = modelDevice;
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
        }
      }
    };
    worker.onerror = (err) => {
      console.error('Worker crash:', err);
      useWorker = false;
      loadError = err;
    };
    return worker;
  } catch (e) {
    console.warn('Worker unavailable, fallback main thread', e);
    useWorker = false;
    return null;
  }
}

export function cancelLoad() {
  cancelled = true;
  if (worker) {
    try { worker.terminate(); } catch { /* ignore */ }
    worker = null;
  }
  loading = false;
  modelReady = false;
  if ($('loadStatus')) $('loadStatus').textContent = 'Загрузка отменена';
  if ($('loadDetail')) $('loadDetail').textContent = 'Можно продолжить без LLM или обновить страницу';
  toast('Загрузка отменена');
}

export async function loadModel() {
  if (loading) return modelReady;
  if (modelReady) return true;
  loading = true;
  cancelled = false;
  loadError = null;

  const warn = $('loadWarn');
  if (warn) {
    warn.style.display = 'block';
    warn.textContent =
      '📥 При первом запуске скачивается модель ~350 МБ. Рекомендуем Wi‑Fi. Повторный запуск — из кэша, почти мгновенно.';
  }
  $('modelBadge')?.classList.add('loading');

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
        w.postMessage({ type: 'load', preferGpu });
        setTimeout(() => {
          w.removeEventListener('message', onMsg);
          if (!modelReady) resolve(false);
        }, 15 * 60 * 1000);
      });
      loading = false;
      if (cancelled) return false;
      if (!ok && !modelReady) {
        return loadMainThread(preferGpu);
      }
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

    mainGenerator = await pipeline(MODEL.task, MODEL.id, {
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
      return false;
    }

    modelReady = true;
    useWorker = false;
    updateUI({ status: 'from_cache' });
    $('modelBadge')?.classList.remove('loading');
    if ($('modelBadge')) $('modelBadge').textContent = 'nyvex';
    loading = false;
    return true;
  } catch (e) {
    console.error('Main-thread model load error:', e);
    loadError = e;
    const warn = $('loadWarn');
    if (warn) {
      warn.style.display = 'block';
      warn.textContent =
        '⚠️ Не удалось загрузить LLM: ' + (e?.message || 'ошибка') + '. Интерфейс доступен.';
    }
    if ($('loadStatus')) $('loadStatus').textContent = 'LLM недоступна';
    loading = false;
    return false;
  }
}

export function generateViaWorker(messages, options = {}) {
  if (!modelReady) {
    return Promise.resolve(
      'Модель ещё не загружена. Подождите завершения загрузки или обновите страницу при стабильном интернете.'
    );
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
  if (worker) {
    try { worker.terminate(); } catch { /* ignore */ }
    worker = null;
  }
  pendingGenerate.clear();
  modelReady = false;
}
