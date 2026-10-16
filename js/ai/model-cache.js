/**
 * NYVEX — model cache helpers
 * Never arrayBuffer() whole model files.
 */

export const MODEL_CACHE_NAMES = [
  'nyvex-model-cache-v3',
  'nyvex-model-cache-v2',
  'nyvex-model-cache',
  'transformers-cache',
  'transformers-cache-v1',
];

const READY_KEY = 'nyvex_model_ready_v2';
const MODEL_ID_KEY = 'nyvex_model_id';
const READY_AT_KEY = 'nyvex_model_ready_at';
const SIZE_KEY = 'nyvex_model_cache_size_est_v2';

function looksLikeModelUrl(url) {
  const u = String(url || '').toLowerCase();
  return (
    u.includes('huggingface') ||
    u.includes('xethub') ||
    u.includes('hf-mirror') ||
    u.includes('cdn-lfs') ||
    u.includes('.onnx') ||
    u.includes('tokenizer') ||
    u.includes('config.json') ||
    u.includes('tokenizer.json') ||
    u.includes('merges.txt') ||
    u.includes('vocab') ||
    u.includes('generation_config') ||
    (u.includes('model') && (u.includes('onnx') || u.includes('q4')))
  );
}

function isModelCacheName(name) {
  const low = String(name || '').toLowerCase();
  return (
    MODEL_CACHE_NAMES.includes(name) ||
    low.includes('transformers') ||
    low.includes('nyvex-model') ||
    low.includes('nyvex-model-cache') ||
    low.includes('onnx') ||
    low.includes('ort-') ||
    low.includes('huggingface') ||
    low.includes('xenova')
  );
}

/** Lightweight list — headers only */
export async function listModelCacheEntries() {
  const out = [];
  try {
    if (!('caches' in self)) return out;
    const names = await caches.keys();
    for (const name of names) {
      try {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        for (const req of keys) {
          if (!looksLikeModelUrl(req.url) && !isModelCacheName(name)) continue;
          if (!looksLikeModelUrl(req.url)) continue;
          let size = 0;
          try {
            const res = await cache.match(req);
            if (res) {
              const cl = res.headers.get('content-length');
              if (cl) size = parseInt(cl, 10) || 0;
              if (!size && /\.onnx/i.test(req.url)) size = 50 * 1024 * 1024;
              if (!size) size = 1024;
            }
          } catch {}
          out.push({ cache: name, url: req.url, size });
        }
      } catch {}
    }
  } catch (e) {
    console.warn('[model-cache] list', e);
  }
  return out;
}

/**
 * True if we should skip network download UI and treat model as present.
 * Trust localStorage flag strongly — Cache API names vary by TF.js version.
 */
export async function hasModelInCache() {
  try {
    const flag = localStorage.getItem(READY_KEY);
    if (flag === '1') {
      console.log('[model-cache] ready flag is set → treat as cached');
      return true;
    }

    const entries = await listModelCacheEntries();
    const total = entries.reduce((s, e) => s + (e.size || 0), 0);
    const hasOnnx = entries.some((e) => /\.onnx/i.test(e.url));
    const ok = hasOnnx || total > 5 * 1024 * 1024 || entries.length >= 3;
    console.log('[model-cache] entries', entries.length, 'estBytes', total, 'onnx', hasOnnx, '→', ok);
    if (ok) {
      // Restore flag so next cold start is instant
      try {
        localStorage.setItem(READY_KEY, '1');
      } catch {}
      return true;
    }
    return false;
  } catch (e) {
    console.warn('[model-cache] hasModelInCache', e);
    try {
      return localStorage.getItem(READY_KEY) === '1';
    } catch {
      return false;
    }
  }
}

/** 'cached' | 'not-downloaded' */
export async function getModelState() {
  const cached = await hasModelInCache();
  return cached ? 'cached' : 'not-downloaded';
}

export async function getModelCacheSize() {
  try {
    const entries = await listModelCacheEntries();
    const total = entries.reduce((s, e) => s + (e.size || 0), 0);
    if (total > 0) return total;
    const est = parseInt(localStorage.getItem(SIZE_KEY) || '0', 10);
    return est || 0;
  } catch {
    return 0;
  }
}

export function markModelReady(estimatedBytes, modelId) {
  try {
    localStorage.setItem(READY_KEY, '1');
    localStorage.setItem(READY_AT_KEY, String(Date.now()));
    if (modelId) localStorage.setItem(MODEL_ID_KEY, String(modelId));
    if (estimatedBytes && estimatedBytes > 0) {
      localStorage.setItem(SIZE_KEY, String(estimatedBytes));
    }
    console.log('[model-cache] ✅ ready flag saved', modelId || '');
  } catch (e) {
    console.error('[model-cache] failed to save ready flag', e);
  }
}

export function clearModelReadyFlag() {
  try {
    localStorage.removeItem(READY_KEY);
    localStorage.removeItem(SIZE_KEY);
    localStorage.removeItem(MODEL_ID_KEY);
    localStorage.removeItem(READY_AT_KEY);
  } catch {}
}

export async function clearModelCache() {
  clearModelReadyFlag();
  try {
    const names = await caches.keys();
    for (const name of names) {
      // Only delete model-related caches, not app shell
      if (isModelCacheName(name) || looksLikeModelUrl(name)) {
        await caches.delete(name);
        console.log('[model-cache] deleted', name);
      } else {
        // Also delete caches that only hold model files
        try {
          const cache = await caches.open(name);
          const keys = await cache.keys();
          const modelKeys = keys.filter((r) => looksLikeModelUrl(r.url));
          if (modelKeys.length > 0 && modelKeys.length === keys.length) {
            await caches.delete(name);
            console.log('[model-cache] deleted model-only', name);
          }
        } catch {}
      }
    }
  } catch (e) {
    console.warn('[model-cache] clear', e);
  }
}

export async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return false;
    const already = await navigator.storage.persisted();
    if (already) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function isStoragePersisted() {
  try {
    if (!navigator.storage?.persisted) return false;
    return await navigator.storage.persisted();
  } catch {
    return false;
  }
}

export async function isLikelyIncognito() {
  try {
    if (navigator.storage?.estimate) {
      const { quota } = await navigator.storage.estimate();
      if (quota && quota < 120 * 1024 * 1024) return true;
    }
  } catch {}
  return false;
}

export async function checkFreeSpace() {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    return { usage: usage || 0, quota: quota || 0, free: (quota || 0) - (usage || 0) };
  } catch {
    return null;
  }
}

export function formatBytes(n) {
  if (!n || n < 0) return '0 МБ';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' КБ';
  return (n / 1024 / 1024).toFixed(0) + ' МБ';
}

/** Debug helper for console */
export async function debugModelStatus(extra = {}) {
  const info = {
    flag: null,
    modelId: null,
    readyAt: null,
    sizeEst: null,
    cacheNames: [],
    modelEntries: 0,
    ...extra,
  };
  try {
    info.flag = localStorage.getItem(READY_KEY);
    info.modelId = localStorage.getItem(MODEL_ID_KEY);
    info.readyAt = localStorage.getItem(READY_AT_KEY);
    info.sizeEst = localStorage.getItem(SIZE_KEY);
  } catch {}
  try {
    info.cacheNames = await caches.keys();
    const entries = await listModelCacheEntries();
    info.modelEntries = entries.length;
    info.sampleUrls = entries.slice(0, 5).map((e) => e.url.slice(-60));
  } catch (e) {
    info.cacheError = String(e);
  }
  console.log('=== Model Debug ===', info);
  return info;
}
