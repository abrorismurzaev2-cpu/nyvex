/**
 * NYVEX — catalog of downloadable on-device models (Transformers.js / ONNX)
 * TinyLlama + Meta Llama 3.2 (ONNX for Transformers.js)
 */
export const AVAILABLE_MODELS = [
  {
    id: 'tinyllama-1.1b',
    name: 'Быстрая',
    description: 'Мгновенные ответы для простых задач',
    hfId: 'onnx-community/TinyLlama-1.1B-Chat-v1.0-ONNX',
    size: 650 * 1024 * 1024,
    sizeLabel: '≈650 МБ',
    quality: 2,
    speed: 5,
    ramNeededGb: 1.5,
    minDeviceMemoryGb: 2,
    dtype: 'q4',
    vendor: 'TinyLlama',
    default: false,
  },
  {
    id: 'llama-3.2-1b',
    name: 'Умная',
    description: 'Баланс скорости и качества · рекомендуем',
    hfId: 'onnx-community/Llama-3.2-1B-Instruct-ONNX',
    size: 800 * 1024 * 1024,
    sizeLabel: '≈800 МБ',
    quality: 3,
    speed: 4,
    ramNeededGb: 2,
    minDeviceMemoryGb: 3,
    dtype: 'q4',
    vendor: 'Meta',
    default: true,
  },
  {
    id: 'llama-3.2-3b',
    name: 'Мощная',
    description: 'Максимальное качество для флагманов',
    hfId: 'onnx-community/Llama-3.2-3B-Instruct-ONNX',
    size: 2500 * 1024 * 1024,
    sizeLabel: '≈2.5 ГБ',
    quality: 4,
    speed: 2,
    ramNeededGb: 4,
    minDeviceMemoryGb: 6,
    dtype: 'q4',
    vendor: 'Meta',
    default: false,
  },
];

const KEY_ACTIVE = 'nyvex_active_model';
const KEY_DOWNLOADED = 'nyvex_downloaded_models';

/** Device RAM in GB (Chrome/Android); fallback 4 */
export function getDeviceMemoryGb() {
  try {
    const m = navigator.deviceMemory;
    if (typeof m === 'number' && m > 0) return m;
  } catch {}
  return 4;
}

export function isModelRecommended(model) {
  return getDeviceMemoryGb() >= (model.minDeviceMemoryGb || 2);
}

export function getActiveModel() {
  let id = 'llama-3.2-1b';
  try {
    id = localStorage.getItem(KEY_ACTIVE) || 'llama-3.2-1b';
  } catch {}
  // migrate old qwen ids
  if (String(id).startsWith('qwen')) id = 'llama-3.2-1b';
  return AVAILABLE_MODELS.find((m) => m.id === id) || AVAILABLE_MODELS.find((m) => m.default) || AVAILABLE_MODELS[0];
}

export function setActiveModel(id) {
  if (!AVAILABLE_MODELS.some((m) => m.id === id)) return;
  try {
    localStorage.setItem(KEY_ACTIVE, id);
  } catch {}
}

export function isModelDownloaded(id) {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY_DOWNLOADED) || '[]');
    return Array.isArray(arr) && arr.includes(id);
  } catch {
    return false;
  }
}

export function markModelDownloaded(id) {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY_DOWNLOADED) || '[]');
    if (!arr.includes(id)) {
      arr.push(id);
      localStorage.setItem(KEY_DOWNLOADED, JSON.stringify(arr));
    }
  } catch {}
}

export function unmarkModelDownloaded(id) {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY_DOWNLOADED) || '[]').filter((x) => x !== id);
    localStorage.setItem(KEY_DOWNLOADED, JSON.stringify(arr));
  } catch {}
}

export function getDefaultModel() {
  return AVAILABLE_MODELS.find((m) => m.default) || AVAILABLE_MODELS[0];
}
