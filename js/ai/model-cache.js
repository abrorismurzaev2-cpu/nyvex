/**
 * NYVEX — model cache helpers
 * IMPORTANT: never arrayBuffer() whole model files (900MB+) just to measure size
 */
export const MODEL_CACHE_NAMES = [
  'nyvex-model-cache-v2',
  'nyvex-model-cache',
  'transformers-cache',
  'transformers-cache-v1',
];

const READY_KEY = 'nyvex_model_ready_v2';
const SIZE_KEY = 'nyvex_model_cache_size_est_v2';

function looksLikeModelUrl(url) {
  const u = String(url || '').toLowerCase();
  return (
    u.includes('huggingface') ||
    u.includes('xethub') ||
    u.includes('hf-mirror') ||
    u.includes('.onnx') ||
    (u.includes('model') && u.includes('onnx')) ||
    u.includes('tokenizer') ||
    u.includes('config.json') ||
    u.includes('tokenizer.json') ||
    u.includes('merges.txt') ||
    u.includes('vocab')
  );
}

function isModelCacheName(name) {
  const low = String(name || '').toLowerCase();
  return (
    MODEL_CACHE_NAMES.includes(name) ||
    low.includes('transformers') ||
    low.includes('nyvex-model') ||
    low.includes('onnx') ||
    low.includes('ort-')
  );
}

/** Lightweight list — use headers only, no body read */
export async function listModelCacheEntries() {
  const out = [];
  try {
    const names = await caches.keys();
    for (const name of names) {
      if (!isModelCacheName(name)) continue;
      const cache = await caches.open(name);
      const keys = await cache.keys();
      for (const req of keys) {
        if (!looksLikeModelUrl(req.url) && !isModelCacheName(name)) continue;
        let size = 0;
        try {
          const res = await cache.match(req);
          if (res) {
            const cl = res.headers.get('content-length');
            if (cl) size = parseInt(cl, 10) || 0;
            // Fall back: if it's an onnx URL without length, mark as present (~estimate)
            if (!size && /\.onnx/i.test(req.url)) size = 50 * 1024 * 1024;
            if (!size && looksLikeModelUrl(req.url)) size = 1024;
          }
        } catch {}
        out.push({ cache: name, url: req.url, size });
      }
    }
  } catch (e) {
    console.warn('[model-cache] list', e);
  }
  return out;
}

export async function hasModelInCache() {
  try {
    // Fast path: previous successful load on this origin
    if (localStorage.getItem(READY_KEY) === '1') {
      // Still verify at least one cache bucket exists
      const names = await caches.keys();
      const hasBucket = names.some(isModelCacheName);
      if (hasBucket) {
        console.log('[model-cache] ready flag + cache bucket present');
        return true;
      }
      // Flag without cache → cleared by browser
      try {
        localStorage.removeItem(READY_KEY);
      } catch {}
    }

    const entries = await listModelCacheEntries();
    const total = entries.reduce((s, e) => s + (e.size || 0), 0);
    const hasOnnx = entries.some((e) => /\.onnx/i.test(e.url));
    console.log('[model-cache] entries', entries.length, 'estBytes', total, 'onnx', hasOnnx);
    return hasOnnx || total > 5 * 1024 * 1024;
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

export function markModelReady(estimatedBytes) {
  try {
    localStorage.setItem(READY_KEY, '1');
    if (estimatedBytes && estimatedBytes > 0) {
      localStorage.setItem(SIZE_KEY, String(estimatedBytes));
    }
  } catch {}
}

export function clearModelReadyFlag() {
  try {
    localStorage.removeItem(READY_KEY);
    localStorage.removeItem(SIZE_KEY);
  } catch {}
}

export async function clearModelCache() {
  clearModelReadyFlag();
  try {
    const names = await caches.keys();
    for (const name of names) {
      if (isModelCacheName(name)) {
        await caches.delete(name);
        console.log('[model-cache] deleted', name);
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
