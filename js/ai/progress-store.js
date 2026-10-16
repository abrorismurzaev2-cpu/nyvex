/**
 * NYVEX — model download progress metadata (localStorage + IndexedDB)
 */
const LS_KEY = 'nyvex_model_progress';
const IDB_NAME = 'nyvex_model';
const IDB_STORE = 'progress';

export function saveProgressMeta(meta) {
  const data = {
    startedAt: meta.startedAt || Date.now(),
    lastUpdate: Date.now(),
    totalLoaded: meta.totalLoaded || 0,
    totalBytes: meta.totalBytes || 900 * 1024 * 1024,
    percent: meta.percent || 0,
    file: meta.file || '',
    ready: !!meta.ready,
    version: 'llama32-1b-q4',
  };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {}
  idbPut(data).catch(() => {});
  return data;
}

export function loadProgressMeta() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export async function loadProgressMetaAsync() {
  const ls = loadProgressMeta();
  if (ls) return ls;
  try {
    return await idbGet();
  } catch {
    return null;
  }
}

export function clearProgressMeta() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {}
  idbClear().catch(() => {});
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

async function idbPut(data) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(data, 'meta');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet() {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get('meta');
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbClear() {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete('meta');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
