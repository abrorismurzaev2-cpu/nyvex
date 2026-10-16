/**
 * NYVEX — catalog of downloadable on-device models (HF / Transformers.js)
 * 3B uses Coder variant — plain Qwen2.5-3B-Instruct is not on onnx-community.
 */
export const AVAILABLE_MODELS = [
  {
    id: 'qwen-0.5b',
    name: 'Быстрая',
    description: 'Мгновенные ответы · ~1.5 ГБ RAM · для любых телефонов',
    hfId: 'onnx-community/Qwen2.5-0.5B-Instruct',
    size: 350 * 1024 * 1024,
    sizeLabel: '≈350 МБ',
    quality: 2,
    speed: 5,
    ramNeededGb: 1.5,
    minDeviceMemoryGb: 2,
    dtype: 'q4',
    default: true,
  },
  {
    id: 'qwen-1.5b',
    name: 'Умная',
    description: 'Баланс скорости и качества · ~2.5 ГБ RAM',
    hfId: 'onnx-community/Qwen2.5-1.5B-Instruct',
    size: 900 * 1024 * 1024,
    sizeLabel: '≈900 МБ',
    quality: 3,
    speed: 3,
    ramNeededGb: 2.5,
    minDeviceMemoryGb: 4,
    dtype: 'q4',
    default: false,
  },
  {
    id: 'qwen-3b',
    name: 'Мощная',
    description: 'Лучшее качество · ~5 ГБ RAM · флагман',
    hfId: 'onnx-community/Qwen2.5-Coder-3B-Instruct',
    size: 1800 * 1024 * 1024,
    sizeLabel: '≈1.8 ГБ',
    quality: 4,
    speed: 2,
    ramNeededGb: 5,
    minDeviceMemoryGb: 6,
    dtype: 'q4',
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
  let id = 'qwen-0.5b';
  try {
    id = localStorage.getItem(KEY_ACTIVE) || 'qwen-0.5b';
  } catch {}
  return AVAILABLE_MODELS.find((m) => m.id === id) || AVAILABLE_MODELS[0];
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
