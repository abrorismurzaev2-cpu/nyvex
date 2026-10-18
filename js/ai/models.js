/**
 * NYVEX — single universal model (UI never shows HF id)
 */
const KEY_ACTIVE = 'nyvex_active_model';
const KEY_DOWNLOADED = 'nyvex_downloaded_models';

export const AVAILABLE_MODELS = [
  {
    id: 'default',
    name: 'AI',
    description: 'Локальная модель для чата',
    hfId: 'onnx-community/Qwen2.5-0.5B-Instruct',
    size: 400 * 1024 * 1024,
    sizeLabel: '≈400 МБ',
    quality: 3,
    speed: 4,
    ramNeededGb: 1.5,
    minDeviceMemoryGb: 2,
    dtype: 'q4',
    vendor: '',
    default: true,
    isDefault: true,
  },
];

export function getDeviceMemoryGb() {
  try {
    const m = navigator.deviceMemory;
    if (typeof m === 'number' && m > 0) return m;
  } catch {}
  return 4;
}

export function isModelRecommended() {
  return true;
}

export function getRecommendedModel() {
  return AVAILABLE_MODELS[0];
}

export function getRecommendedModelId() {
  return 'default';
}

export function getActiveModel() {
  return AVAILABLE_MODELS[0];
}

export function setActiveModel(id) {
  try {
    localStorage.setItem(KEY_ACTIVE, 'default');
  } catch {}
}

export function markModelDownloaded(id) {
  try {
    const raw = localStorage.getItem(KEY_DOWNLOADED);
    const set = new Set(raw ? JSON.parse(raw) : []);
    set.add(id || 'default');
    localStorage.setItem(KEY_DOWNLOADED, JSON.stringify([...set]));
  } catch {}
}

export function isModelDownloaded(id) {
  try {
    const raw = localStorage.getItem(KEY_DOWNLOADED);
    const set = new Set(raw ? JSON.parse(raw) : []);
    return set.has(id || 'default') || set.has('fast'); // migrate old id
  } catch {
    return false;
  }
}

export function listDownloadedModels() {
  try {
    const raw = localStorage.getItem(KEY_DOWNLOADED);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
