/**
 * NYVEX — ai/loader.js
 * Web Worker + fallback, model status, model switch
 */
import { MODEL, CDN, MODEL_ID } from '../core/config.js';
import {
  detectBestBackend,
  applyOnnxEnv,
  backendLabel,
  getRecommendedModelId,
} from './capabilities.js';
import { isNativeApp } from '../core/platform.js';
import { getActiveModel, markModelDownloaded } from './models.js';
import { isMobile, $ } from '../core/utils.js';
import { toast } from '../core/toast.js';
import { saveProgressMeta, loadProgressMeta, clearProgressMeta } from './progress-store.js';
import {
  requestDownloadNotifPermission,
  notifyDownloadStart,
  notifyDownloadProgress,
  notifyDownloadDone,
} from './download-notify.js';
import {
  hasModelInCache,
  getModelState,
  requestPersistentStorage,
  isLikelyIncognito,
  checkFreeSpace,
  formatBytes as fmtCacheBytes,
  getModelCacheSize,
  clearModelCache,
  markModelReady,
  isStoragePersisted,
} from './model-cache.js';

export { getModelCacheSize, clearModelCache, hasModelInCache, getModelState, isStoragePersisted, isNativeApp };

/** Prefer WASM on weak Android / low RAM / few cores (Samsung A-series etc.) */
export function shouldPreferWasm() {
  try {
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 4;
    const ua = navigator.userAgent || '';
    const isAndroid = /Android/i.test(ua);
    const isWebView = /; wv\)/i.test(ua) || /Version\/\d+\.\d+.*Chrome\/\d+\.\d+\.\d+\.\d+/i.test(ua);
    if (cores < 6) return true;
    if (mem > 0 && mem < 6) return true;
    if (isAndroid && mem <= 6) return true;
    if (isWebView) return true;
  } catch {}
  return false;
}


let worker = null;
let modelReady = false;
let loadPromise = null;
let modelDevice = 'WASM';
let loadError = null;
let loading = false;
let cancelled = false;
let useWorker = true;
let mainGenerator = null;
let pendingGenerate = new Map();
let reqSeq = 0;
let loadPct = 0;
let loadLoaded = 0;
let loadTotal = 0;
let loadSpeed = 0;
let loadEta = 0;
let loadFromCache = false;
let stallTimer = null;
let lastProgressAt = 0;
let statusListeners = [];

let activeModelId = MODEL_ID;

export function getActiveModelId() {
  return activeModelId;
}

export function isModelReady() {
  return modelReady;
}

export function isLoading() {
  return loading;
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
  if (loadError && !modelReady)
    return { state: 'error', label: 'Ошибка: ' + String(loadError).slice(0, 80), pct: loadPct, device: modelDevice, loaded: loadLoaded, total: loadTotal, speed: loadSpeed, eta: loadEta, error: loadError };
  if (modelReady)
    return { state: 'ready', label: loadFromCache ? 'AI готов к работе ✓ · из кэша' : 'AI готов к работе ✓', pct: 100, device: modelDevice, loaded: loadLoaded, total: loadTotal, speed: 0, eta: 0 };
  if (loading)
    return { state: 'loading', label: 'Скачивание · ' + Math.round(loadPct) + '%', pct: loadPct, device: modelDevice, loaded: loadLoaded, total: loadTotal, speed: loadSpeed, eta: loadEta };
  return { state: 'idle', label: 'AI не загружен', pct: 0, device: modelDevice, loaded: 0, total: 0, speed: 0, eta: 0 };
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
    if (miStatus) miStatus.textContent = st.state === 'ready' ? 'AI готов' : st.state === 'error' ? 'Ошибка' : st.state === 'loading' ? 'Загрузка AI' : 'AI не загружен';
    const miDevice = $('miDevice');
    if (miDevice) miDevice.textContent = modelDevice;
    const modelName = $('modelName');
    if (modelName) modelName.textContent = 'AI';
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
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    const s = Math.ceil(sec % 60);
    return '~' + m + ' мин ' + s + ' сек';
  }
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return '~' + h + ' ч ' + m + ' мин';
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

  // transformers.js emits done/from_cache PER FILE — do not mark fully ready here
  if (payload.status === 'from_cache' || payload.status === 'done') {
    loadFromCache = payload.status === 'from_cache' || loadFromCache;
    if (st && !modelReady) {
      st.textContent = loadFromCache ? 'Чтение из кэша…' : 'Инициализация…';
    }
    const live = document.getElementById('loadLiveMeta');
    if (live && !modelReady) {
      live.textContent = loadFromCache ? 'Чтение файлов из кэша…' : 'Подготовка AI…';
      live.style.opacity = '1';
    }
    emitStatus();
    return;
  }

  if (payload.status === 'progress') {
    try {
      const panel = document.getElementById('loadProgressPanel');
      if (panel) panel.style.display = '';
    } catch {}
    const total = payload.total || 900 * 1024 * 1024;
    const loaded = payload.loaded || 0;
    const pct = payload.pct != null ? payload.pct : total ? (loaded / total) * 100 : 0;
    loadPct = Math.min(99, pct);
    loadLoaded = loaded;
    loadTotal = total;
    loadSpeed = payload.speed || 0;
    loadEta = payload.eta || 0;
    lastProgressAt = Date.now();
    touchStallWatch();
    updateRingProgress(loadPct);
    saveProgressMeta({
      totalLoaded: loaded,
      totalBytes: total,
      percent: loadPct,
      file: payload.file || '',
      ready: false,
    });
    try {
      const sp = formatSpeed(payload.speed);
      const et = formatEta(payload.eta);
      notifyDownloadProgress(loadPct, sp, et);
    } catch {}
    // header mini bar
    try {
      const hb = document.getElementById('headerLoadBar');
      const hw = document.getElementById('headerLoadWrap');
      if (hb) hb.style.width = loadPct + '%';
      if (hw) hw.style.display = loadPct < 100 ? '' : 'none';
    } catch {}
    if (fill) fill.style.width = loadPct + '%';
    if (pc) pc.textContent = Math.round(loadPct) + '%';
    if (st) st.textContent = 'Скачивание модели…';
    if (mbEl) mbEl.textContent = formatBytes(loaded) + ' / ' + formatBytes(total);
    if (speedEl) speedEl.textContent = 'Скорость: ' + (formatSpeed(payload.speed) || '—');
    if (etaEl) etaEl.textContent = 'Осталось: ' + (formatEta(payload.eta) || '—');
    const live = document.getElementById('loadLiveMeta');
    if (live) {
      const parts = [
        'Скачивание · ' + Math.round(loadPct) + '%',
        formatBytes(loaded) + ' / ' + formatBytes(total),
      ];
      if (payload.speed) parts.push(formatSpeed(payload.speed));
      if (payload.eta) parts.push(formatEta(payload.eta));
      if (payload.file) parts.push(String(payload.file).slice(0, 24));
      live.textContent = parts.join(' · ');
      live.style.opacity = '1';
    }
    if (det) {
      const slow = payload.speed > 0 && payload.speed < 200 * 1024;
      det.textContent = slow ? 'Медленное соединение. Рекомендуем Wi‑Fi' : 'Ускорение: ' + modelDevice;
    }
    if (warn && payload.speed > 0 && payload.speed < 100 * 1024) {
      warn.style.display = 'block';
      warn.textContent = '⚠️ Медленная сеть. Первый запуск ~900 МБ — лучше на Wi‑Fi.';
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
        try {
          const am = getActiveModel();
          markModelDownloaded(am.id);
        } catch {}
        loading = false;
        try { markModelReady(loadTotal || 350 * 1024 * 1024, activeModelId); } catch {}
        modelDevice = msg.device === 'webgpu' ? 'WebGPU' : 'WASM';
        loadPct = 100;
        loadFromCache = true;
        try {
          const stEl = $('loadStatus');
          const live = document.getElementById('loadLiveMeta');
          const fillEl = $('loadFill');
          const pcEl = $('loadPercent');
          if (stEl) stEl.textContent = 'AI готов — можно начинать';
          if (live) {
            live.textContent = 'AI готов к работе';
            live.style.opacity = '1';
          }
          if (fillEl) fillEl.style.width = '100%';
          if (pcEl) pcEl.textContent = '100%';
          updateRingProgress(100);
        } catch {}
        saveProgressMeta({ percent: 100, ready: true, totalLoaded: 1, totalBytes: 1 });
        try { notifyDownloadDone(); } catch {}
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
          loadError = friendlyLoadError(msg.message || 'Worker error');
          console.error('Worker error:', msg.message);
          const live = document.getElementById('loadLiveMeta');
          if (live) { live.textContent = String(loadError); live.style.opacity = '1'; }
          const retry = document.getElementById('retryLoadBtn');
          if (retry) retry.style.display = '';
          emitStatus();
        }
      }
    };
    worker.onerror = (err) => {
      console.error('Worker crash:', err, err?.message, err?.filename, err?.error);
      useWorker = false;
      loadError = friendlyLoadError(err);
      const live = document.getElementById('loadLiveMeta');
      if (live) {
        live.textContent = String(loadError);
        live.style.opacity = '1';
      }
      const retry = document.getElementById('retryLoadBtn');
      if (retry) retry.style.display = '';
      emitStatus();
    };
    return worker;
  } catch (e) {
    console.warn('Worker unavailable', e);
    useWorker = false;
    return null;
  }
}


function updateRingProgress(pct) {
  try {
    const ring = document.getElementById('loadRingProgress');
    if (!ring) return;
    const r = 42;
    const c = 2 * Math.PI * r;
    const offset = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
    ring.style.strokeDasharray = c + ' ' + c;
    ring.style.strokeDashoffset = String(offset);
  } catch {}
}

function touchStallWatch() {
  if (stallTimer) clearTimeout(stallTimer);
  if (!loading || modelReady) return;
  stallTimer = setTimeout(() => {
    if (modelReady || !loading) return;
    const idle = Date.now() - (lastProgressAt || Date.now());
    const live = document.getElementById('loadLiveMeta');
    const retry = $('retryLoadBtn');
    if (idle >= 120000) {
      loadError = 'Нет прогресса 2 мин. Проверьте интернет.';
      if (live) { live.textContent = loadError; live.style.opacity = '1'; }
      if (retry) retry.style.display = '';
      emitStatus();
    } else if (idle >= 30000) {
      if (live) {
        live.textContent = 'Проблема с сетью? Подождите или нажмите «Повторить»';
        live.style.opacity = '1';
      }
      if (retry) retry.style.display = '';
      // keep watching
      touchStallWatch();
    }
  }, 15000);
}

function friendlyLoadError(err) {
  // Worker onerror passes ErrorEvent → "[object Event]" if stringified naively
  let msg = '';
  try {
    if (err == null) msg = '';
    else if (typeof err === 'string') msg = err;
    else if (err instanceof Error) msg = err.message || err.name || '';
    else if (typeof Event !== 'undefined' && err instanceof Event) {
      msg = err.message || err.type || (err.filename ? String(err.filename) : '') || 'Worker error';
      if (err.error && err.error.message) msg = err.error.message;
    } else if (typeof err === 'object') {
      msg = err.message || err.reason || err.type || '';
      if (!msg) {
        try { msg = JSON.stringify(err); } catch { msg = Object.prototype.toString.call(err); }
      }
    } else {
      msg = String(err);
    }
  } catch {
    msg = 'Неизвестная ошибка загрузки';
  }
  msg = String(msg || '');
  if (/network|fetch|Failed to fetch|TypeError|Load failed/i.test(msg)) {
    return 'Ошибка сети. Проверьте интернет / Wi‑Fi и нажмите «Повторить».';
  }
  if (/CORS|cross-origin/i.test(msg)) return 'Ошибка доступа. Обновите приложение.';
  if (/memory|OOM|out of memory/i.test(msg)) return 'Недостаточно памяти. Закройте другие приложения.';
  if (/\[object Event\]/i.test(msg) || msg === 'error') {
    return 'Сбой загрузки AI в WebView. Проверьте интернет и нажмите «Повторить».';
  }
  return (msg.slice(0, 160) || 'Не удалось загрузить AI');
}

export function logRuntimeEnvironment() {
  try {
    const info = {
      isCapacitor: !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()),
      hasGPU: typeof navigator !== 'undefined' && 'gpu' in navigator,
      hasFetch: typeof fetch === 'function',
      hasCaches: typeof caches !== 'undefined',
      hasIDB: typeof indexedDB !== 'undefined',
      hasWASM: typeof WebAssembly !== 'undefined',
      hasWorker: typeof Worker !== 'undefined',
      protocol: location.protocol,
      origin: location.origin,
      ua: (navigator.userAgent || '').slice(0, 120),
    };
    console.log('[nyvex] Environment', info);
    return info;
  } catch (e) {
    console.warn('env log', e);
    return {};
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
  const live = document.getElementById('loadLiveMeta');
  if (live) {
    live.textContent = 'Загрузка отменена. При следующем входе продолжится.';
    live.style.opacity = '1';
  }
  const retry = document.getElementById('retryLoadBtn');
  if (retry) retry.style.display = '';
  toast('Загрузка отменена. Прогресс сохранён.');
  emitStatus();
}

export async function loadModel(modelId) {
  // Single-flight: concurrent callers share the same promise (no re-download loop)
  if (modelReady) {
    console.log('[nyvex] loadModel: already ready');
    return true;
  }
  if (loadPromise) {
    console.log('[nyvex] loadModel: join in-flight load');
    return loadPromise;
  }

  loadPromise = loadModelInner(modelId).finally(() => {
    loadPromise = null;
  });
  return loadPromise;
}

async function loadModelInner(modelId) {
  if (modelReady) return true;
  activeModelId = MODEL_ID;

  const native = isNativeApp();
  const active = getActiveModel();
  activeModelId = active.hfId || MODEL_ID;
  console.log('[nyvex] loadModel native=', native, 'model=', active.id, activeModelId);

  try {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const et = conn && conn.effectiveType;
    if (et === '2g' || et === 'slow-2g') {
      const ok = window.confirm(
        'Медленное соединение. Первый запуск AI может занять время — рекомендуем Wi‑Fi.\n\nПродолжить загрузку?'
      );
      if (!ok) {
        emitStatus();
        return false;
      }
    }
  } catch {}

  loading = true;
  cancelled = false;
  loadError = null;
  loadPct = 0;
  emitStatus();

  try {
    const prev = loadProgressMeta();
    if (prev && prev.percent > 0 && prev.percent < 100 && !prev.ready) {
      loadPct = prev.percent;
      updateRingProgress(loadPct);
      const live = document.getElementById('loadLiveMeta');
      if (live) {
        live.textContent =
          'Продолжаем с ' + Math.round(prev.percent) + '% · докачка с места остановки';
        live.style.opacity = '1';
      }
    }
  } catch {}
  // Persistent storage so browser does not evict model cache
  requestPersistentStorage().then((p) => console.log('[nyvex] persistent', p)).catch(() => {});

  try {
    if (await isLikelyIncognito()) {
      const live = document.getElementById('loadLiveMeta');
      if (live) {
        live.textContent = 'Приватный режим: модель может не сохраниться. Откройте в обычном окне.';
        live.style.opacity = '1';
      }
      try {
        toast('Приватный режим — кэш модели может не сохраниться');
      } catch {}
    }
  } catch {}

  try {
    const space = await checkFreeSpace();
    if (space && space.free > 0 && space.free < 1.2 * 1024 * 1024 * 1024) {
      const live = document.getElementById('loadLiveMeta');
      if (live) {
        live.textContent = 'Мало места (' + fmtCacheBytes(space.free) + '). Нужно ~1.5 ГБ для AI.';
        live.style.opacity = '1';
      }
    }
  } catch {}

  let fromCache = false;
  try {
    fromCache = await hasModelInCache();
    console.log('[nyvex] model in cache?', fromCache);
    const live = document.getElementById('loadLiveMeta');
    if (live) {
      live.textContent = fromCache
        ? 'Загрузка из кэша · мгновенно'
        : 'Первая загрузка · ~900 МБ · нужен Wi‑Fi';
      live.style.opacity = '1';
    }
    // Only spam download notifications on first full download
    if (!fromCache) {
      requestDownloadNotifPermission().then((ok) => {
        if (ok) notifyDownloadStart();
      }).catch(() => {});
    }
  } catch {
    requestDownloadNotifPermission().then((ok) => {
      if (ok) notifyDownloadStart();
    }).catch(() => {});
  }


  const warn = $('loadWarn');
  if (warn) {
    warn.style.display = 'block';
    warn.textContent =
      '📥 При первом запуске скачивается модель. Рекомендуем Wi‑Fi. Повторный запуск — из кэша.';
  }

  const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
  // Weak phones (A15 etc.): always WASM — WebGPU often crashes or hangs
  const preferGpu = hasWebGPU && !shouldPreferWasm();
  modelDevice = preferGpu ? 'WebGPU' : 'WASM';
  console.log('[nyvex] preferGpu=', preferGpu, 'cores=', navigator.hardwareConcurrency, 'mem=', navigator.deviceMemory);

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
        const am = getActiveModel();
        w.postMessage({
          type: 'load',
          preferGpu,
          modelId: am.hfId || activeModelId,
          dtype: am.dtype || 'q4',
          local: false,
        });
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
    try { env.allowRemoteModels = true; env.cacheDir = 'nyvex-model-cache-v3'; } catch {}
    try {
      const am = getActiveModel();
      activeModelId = am.hfId || activeModelId;
    } catch {}
    const backend = detectBestBackend();
    applyOnnxEnv(env, backend);
    modelDevice = backendLabel(backend);

    const progressMap = {};
    let lastTs = Date.now();
    let lastLoaded = 0;

    mainGenerator = await pipeline(MODEL.task, activeModelId, {
      quantized: true,
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
    try {
      const am = getActiveModel();
      markModelDownloaded(am.id);
    } catch {}
    try {
      markModelReady(loadTotal || 350 * 1024 * 1024, activeModelId);
    } catch {}
    useWorker = false;
    loadPct = 100;
    loadFromCache = true;
    try {
      const stEl = $('loadStatus');
      const live = document.getElementById('loadLiveMeta');
      if (stEl) stEl.textContent = 'AI готов — можно начинать';
      if (live) {
        live.textContent = 'AI готов к работе';
        live.style.opacity = '1';
      }
      updateRingProgress(100);
      const fillEl = $('loadFill');
      const pcEl = $('loadPercent');
      if (fillEl) fillEl.style.width = '100%';
      if (pcEl) pcEl.textContent = '100%';
    } catch {}
    saveProgressMeta({ percent: 100, ready: true, totalLoaded: 1, totalBytes: 1 });
    try { notifyDownloadDone(); } catch {}
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
          reject(new Error('AI не отвечает. Попробуйте ещё раз или выберите модель «Быстрая».'));
        }
      }, 45000);
    });
  }

  return (async () => {
    if (!mainGenerator) return 'Модель недоступна.';
    try {
      // v2 text-generation expects a string prompt
      const lines = [];
      for (const m of messages || []) {
        if (m.role === 'system') lines.push(m.content || '');
        else if (m.role === 'user') lines.push('User: ' + (m.content || ''));
        else if (m.role === 'assistant') lines.push('Assistant: ' + (m.content || ''));
      }
      lines.push('Assistant:');
      const prompt = lines.join('\n');
      const output = await mainGenerator(prompt, {
        max_new_tokens: options.max_new_tokens || MODEL.maxNewTokens,
        temperature: options.temperature ?? MODEL.temperature,
        top_p: options.top_p ?? MODEL.topP,
        do_sample: true,
        repetition_penalty: options.repetition_penalty ?? MODEL.repetitionPenalty,
        return_full_text: false,
      });
      let reply = '';
      if (Array.isArray(output) && output[0]?.generated_text != null) {
        const gen = output[0].generated_text;
        if (typeof gen === 'string') {
          reply = gen.startsWith(prompt) ? gen.slice(prompt.length) : gen;
        } else if (Array.isArray(gen)) {
          const last = gen[gen.length - 1];
          reply = typeof last === 'string' ? last : last?.content || '';
        }
      }
      reply = String(reply || '').replace(/^Assistant:\s*/i, '').trim();
      return reply || 'Не удалось сгенерировать ответ.';
    } catch (e) {
      return 'Ошибка генерации: ' + String(e?.message || '').slice(0, 120);
    }
  })();
}

export function terminateWorker() {
  unloadModel();
}


/** Console helper: debugModel.status() / debugModel.reset() */
try {
  if (typeof window !== 'undefined') {
    window.debugModel = {
      async status() {
        const { debugModelStatus } = await import('./model-cache.js');
        return debugModelStatus({
          generator: modelReady,
          isLoading: loading,
          device: modelDevice,
          activeModelId,
        });
      },
      async reset() {
        const { clearModelCache } = await import('./model-cache.js');
        await clearModelCache();
        modelReady = false;
        mainGenerator = null;
        console.log('[nyvex] model cache + flag cleared');
      },
    };
  }
} catch {}
