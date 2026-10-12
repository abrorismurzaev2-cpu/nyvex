/**
 * NYVEX — model cache helpers (Cache API + persistent storage)
 */
export const MODEL_CACHE_NAMES = [
  'nyvex-model-cache',
  'transformers-cache',
  'transformers-cache-v1',
];

function looksLikeModelUrl(url) {
  const u = String(url || '').toLowerCase();
  return (
    u.includes('huggingface') ||
    u.includes('xethub') ||
    u.includes('hf-mirror') ||
    u.includes('model') && (u.includes('.onnx') || u.includes('onnx')) ||
    u.includes('tokenizer') ||
    u.includes('config.json')
  );
}

export async function listModelCacheEntries() {
  const out = [];
  try {
    const names = await caches.keys();
    for (const name of names) {
      const low = name.toLowerCase();
      const keep =
        MODEL_CACHE_NAMES.includes(name) ||
        low.includes('transformers') ||
        low.includes('nyvex-model') ||
        low.includes('onnx');
      if (!keep) continue;
      const cache = await caches.open(name);
      const keys = await cache.keys();
      for (const req of keys) {
        if (looksLikeModelUrl(req.url) || keep) {
          let size = 0;
          try {
            const res = await cache.match(req);
            if (res) {
              const buf = await res.clone().arrayBuffer();
              size = buf.byteLength;
            }
          } catch {}
          out.push({ cache: name, url: req.url, size });
        }
      }
    }
  } catch (e) {
    console.warn('[model-cache] list', e);
  }
  return out;
}

export async function hasModelInCache() {
  try {
    const entries = await listModelCacheEntries();
    // Need substantial data (not just tiny config) — at least ~5MB total
    const total = entries.reduce((s, e) => s + (e.size || 0), 0);
    console.log('[model-cache] entries', entries.length, 'bytes', total);
    return total > 5 * 1024 * 1024 || entries.some((e) => /model.*\.onnx/i.test(e.url));
  } catch {
    return false;
  }
}

export async function getModelCacheSize() {
  const entries = await listModelCacheEntries();
  return entries.reduce((s, e) => s + (e.size || 0), 0);
}

export async function clearModelCache() {
  const names = await caches.keys();
  for (const name of names) {
    const low = name.toLowerCase();
    if (
      MODEL_CACHE_NAMES.includes(name) ||
      low.includes('transformers') ||
      low.includes('nyvex-model') ||
      low.includes('onnx')
    ) {
      await caches.delete(name);
      console.log('[model-cache] deleted', name);
    }
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

export async function isLikelyIncognito() {
  try {
    if (navigator.storage?.estimate) {
      const { quota } = await navigator.storage.estimate();
      // Private modes often report low quota
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
