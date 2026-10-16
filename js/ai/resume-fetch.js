/**
 * NYVEX — resume-fetch.js
 * Patch global fetch for HF model files:
 *  - cache-first (Cache API)
 *  - retry with exponential backoff
 *  - Range resume via IndexedDB for large .onnx files
 * Used inside the AI worker (and safe on main thread).
 */
const CACHE_NAME = 'nyvex-model-cache-v3';
const IDB_NAME = 'nyvex-downloads-v3';
const IDB_STORE = 'files';
const MAX_RETRIES = 6;

function isModelUrl(url) {
  try {
    const u = String(url || '');
    return (
      u.includes('huggingface.co') ||
      u.includes('hf-mirror.com') ||
      u.includes('xethub.hf.co') ||
      u.includes('cdn-lfs') ||
      /\.onnx(\?|$)/i.test(u) ||
      /tokenizer|config\.json|generation_config|special_tokens|merges\.txt|vocab/i.test(u)
    );
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  try {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const r = tx.objectStore(IDB_STORE).get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  } catch {
    return null;
  }
}

async function idbPut(key, value) {
  try {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

async function idbDel(key) {
  try {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

function concatChunks(chunks) {
  let total = 0;
  for (const c of chunks) total += c.byteLength || c.length || 0;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    const u = c instanceof Uint8Array ? c : new Uint8Array(c);
    out.set(u, off);
    off += u.byteLength;
  }
  return out;
}

async function fetchWithRetry(originalFetch, url, init, maxRetries = MAX_RETRIES) {
  let lastErr = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 120000); // 2 min per attempt
      const merged = { ...(init || {}), signal: ctrl.signal };
      try {
        const res = await originalFetch(url, merged);
        clearTimeout(t);
        if (res.ok || res.status === 206) return res;
        // Retry on 408, 429, 5xx
        if (res.status === 408 || res.status === 429 || res.status >= 500) {
          lastErr = new Error('HTTP ' + res.status);
          await sleep(Math.min(30000, Math.pow(2, i) * 1000));
          continue;
        }
        return res; // 404 etc — don't retry
      } catch (e) {
        clearTimeout(t);
        throw e;
      }
    } catch (e) {
      lastErr = e;
      console.warn('[resume-fetch] attempt', i + 1, '/', maxRetries, String(e?.message || e));
      if (i === maxRetries - 1) break;
      await sleep(Math.min(30000, Math.pow(2, i) * 1000 + Math.random() * 500));
    }
  }
  throw lastErr || new Error('network error');
}

async function downloadWithResume(url, originalFetch, init) {
  // 1) Cache API full hit
  try {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(url);
    if (cached && cached.ok) {
      return cached;
    }
  } catch {}

  // 2) Partial from IndexedDB (Range resume)
  const partial = await idbGet(url);
  let startByte = 0;
  let chunks = [];
  if (partial && partial.chunks && partial.chunks.length) {
    chunks = partial.chunks.map((c) => new Uint8Array(c));
    startByte = chunks.reduce((s, c) => s + c.byteLength, 0);
    console.log('[resume-fetch] resume from', startByte, 'bytes', url.slice(-40));
  }

  const headers = new Headers((init && init.headers) || {});
  if (startByte > 0) {
    headers.set('Range', 'bytes=' + startByte + '-');
  }

  const res = await fetchWithRetry(originalFetch, url, { ...(init || {}), headers });

  // Full response when no range or server ignored range
  if (res.status === 200 && startByte === 0) {
    // Stream into cache + return clone
    try {
      const cache = await caches.open(CACHE_NAME);
      const clone = res.clone();
      // Put in background — don't block return of body to transformers
      cache.put(url, clone).catch(() => {});
    } catch {}
    await idbDel(url);
    return res;
  }

  if (res.status === 200 && startByte > 0) {
    // Server ignored Range — start over
    chunks = [];
    startByte = 0;
  }

  if (res.status !== 206 && res.status !== 200) {
    throw new Error('HTTP ' + res.status + ' for ' + url.slice(-50));
  }

  // Read body in chunks, persist progress every ~2MB
  const reader = res.body && res.body.getReader ? res.body.getReader() : null;
  if (!reader) {
    // No streaming — buffer whole response
    const buf = await res.arrayBuffer();
    const body = startByte > 0 ? concatChunks([...chunks, new Uint8Array(buf)]) : new Uint8Array(buf);
    await idbDel(url);
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(url, new Response(body, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } }));
    } catch {}
    return new Response(body, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
  }

  let sinceSave = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength) {
        chunks.push(value);
        sinceSave += value.byteLength;
        if (sinceSave >= 2 * 1024 * 1024) {
          sinceSave = 0;
          // Store as ArrayBuffers for IDB
          await idbPut(url, {
            chunks: chunks.map((c) => c.buffer.slice(c.byteOffset, c.byteOffset + c.byteLength)),
            updated: Date.now(),
          });
        }
      }
    }
  } catch (e) {
    // Network drop mid-stream — save progress for next resume
    try {
      await idbPut(url, {
        chunks: chunks.map((c) => c.buffer.slice(c.byteOffset, c.byteOffset + c.byteLength)),
        updated: Date.now(),
      });
    } catch {}
    console.warn('[resume-fetch] mid-stream error, saved', startByte + sinceSave, e);
    throw e;
  }

  const body = concatChunks(chunks);
  await idbDel(url);
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      url,
      new Response(body, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } })
    );
  } catch {}
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
}

export function installResumeFetch() {
  if (typeof self === 'undefined' || !self.fetch) return;
  if (self.__nyvexResumeFetchInstalled) return;
  self.__nyvexResumeFetchInstalled = true;
  const originalFetch = self.fetch.bind(self);

  self.fetch = async function patchedFetch(input, init) {
    const url = typeof input === 'string' ? input : input && input.url ? input.url : String(input);
    if (!isModelUrl(url)) {
      return originalFetch(input, init);
    }
    // Only GET model files
    const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if (method !== 'GET') {
      return originalFetch(input, init);
    }
    try {
      return await downloadWithResume(url, originalFetch, init);
    } catch (e) {
      console.error('[resume-fetch] failed', url.slice(-60), e);
      // Last resort: plain fetch with retries
      return fetchWithRetry(originalFetch, url, init, 3);
    }
  };

  console.log('[resume-fetch] installed');
}
