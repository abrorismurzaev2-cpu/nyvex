/**
 * NYVEX — resume-fetch.js
 * Patch fetch for HF model files: cache-first, Range resume via IndexedDB.
 * Used only inside the AI worker.
 */
const CACHE_NAME = 'nyvex-model-cache-v2';
const IDB_NAME = 'nyvex-downloads';
const IDB_STORE = 'files';

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

async function downloadWithResume(url, originalFetch, init) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(url);
  if (cached) {
    console.log('[resume-fetch] cache hit', url.split('/').pop());
    return cached;
  }

  const key = url.split('?')[0];
  let partial = await idbGet(key);
  let startByte = partial && partial.buffer ? partial.buffer.byteLength : 0;
  let expectedTotal = partial && partial.total ? partial.total : 0;

  const headers = new Headers((init && init.headers) || {});
  if (startByte > 0) {
    headers.set('Range', 'bytes=' + startByte + '-');
    console.log('[resume-fetch] resume from', startByte, url.split('/').pop());
  }

  const res = await originalFetch(url, { ...init, headers });

  // Full response already (200) or partial (206)
  if (res.status === 200 && startByte > 0) {
    // Server ignored Range — start over
    startByte = 0;
    await idbDel(key);
    partial = null;
  }

  if (!res.ok && res.status !== 206) {
    throw new Error('HTTP ' + res.status + ' for model file');
  }

  const cl = parseInt(res.headers.get('content-length') || '0', 10);
  if (res.status === 206) {
    expectedTotal = startByte + cl;
  } else if (cl) {
    expectedTotal = cl;
  }

  const reader = res.body && res.body.getReader ? res.body.getReader() : null;
  if (!reader) {
    // Fallback: full buffer
    const buf = await res.arrayBuffer();
    const response = new Response(buf, {
      status: 200,
      headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream', 'Content-Length': String(buf.byteLength) },
    });
    await cache.put(url, response.clone());
    await idbDel(key);
    return response;
  }

  const chunks = [];
  if (partial && partial.buffer && startByte > 0) {
    chunks.push(new Uint8Array(partial.buffer));
  }
  let received = startByte;
  let sinceSave = 0;
  const SAVE_EVERY = 4 * 1024 * 1024; // 4 MB

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    sinceSave += value.byteLength;
    if (sinceSave >= SAVE_EVERY) {
      sinceSave = 0;
      const merged = concatChunks(chunks);
      // keep only merged as single buffer to avoid huge arrays
      chunks.length = 0;
      chunks.push(merged);
      await idbPut(key, {
        buffer: merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength),
        received,
        total: expectedTotal || received,
        lastUpdate: Date.now(),
      });
    }
  }

  const finalBuf = concatChunks(chunks);
  const response = new Response(finalBuf, {
    status: 200,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Length': String(finalBuf.byteLength),
    },
  });
  try {
    await cache.put(url, response.clone());
  } catch (e) {
    console.warn('[resume-fetch] cache put failed', e);
  }
  await idbDel(key);
  console.log('[resume-fetch] complete', url.split('/').pop(), finalBuf.byteLength);
  return response;
}

export function installResumeFetch() {
  if (self.__nyvexResumeFetch) return;
  self.__nyvexResumeFetch = true;
  const originalFetch = self.fetch.bind(self);
  self.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input && input.url;
    if (!url || !isModelUrl(url)) {
      return originalFetch(input, init);
    }
    // Only GET downloads
    const method = (init && init.method) || (typeof input !== 'string' && input.method) || 'GET';
    if (String(method).toUpperCase() !== 'GET') {
      return originalFetch(input, init);
    }
    try {
      return await downloadWithResume(url, originalFetch, init || {});
    } catch (e) {
      console.error('[resume-fetch] fallback to plain fetch', e);
      return originalFetch(input, init);
    }
  };
  console.log('[resume-fetch] installed');
}

export async function getPartialProgressSummary() {
  try {
    const db = await idbOpen();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).getAll();
      req.onsuccess = () => {
        const rows = req.result || [];
        let received = 0;
        let total = 0;
        for (const r of rows) {
          received += r.received || 0;
          total += r.total || 0;
        }
        resolve({ files: rows.length, received, total });
      };
      req.onerror = () => resolve({ files: 0, received: 0, total: 0 });
    });
  } catch {
    return { files: 0, received: 0, total: 0 };
  }
}
