/**
 * NYVEX — ai/cache.js
 * Утилиты кэша модели (браузерный Cache API)
 */

const CACHE_NAME = 'nyvex-model-v1';

export async function hasModelCache() {
  try {
    if (!('caches' in window)) return false;
    const keys = await caches.keys();
    return keys.some((k) => k.includes('transformers') || k.includes('nyvex') || k.includes('huggingface'));
  } catch {
    return false;
  }
}

export async function clearModelCache() {
  try {
    if (!('caches' in window)) return false;
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.includes('transformers') || k.includes('nyvex')).map((k) => caches.delete(k)));
    return true;
  } catch {
    return false;
  }
}
