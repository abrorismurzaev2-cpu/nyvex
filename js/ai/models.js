/**
 * NYVEX — catalog of downloadable on-device models (HF / Transformers.js)
 */
export const AVAILABLE_MODELS = [
  {
    id: 'qwen-0.5b',
    name: 'Быстрая',
    description: 'Мгновенные ответы, базовое качество',
    hfId: 'onnx-community/Qwen2.5-0.5B-Instruct',
    size: 350 * 1024 * 1024,
    sizeLabel: '≈350 МБ',
    quality: 2,
    speed: 5,
    ramNeeded: 1500 * 1024 * 1024,
    dtype: 'q4',
    default: true,
  },
  {
    id: 'qwen-1.5b',
    name: 'Умная',
    description: 'Баланс скорости и качества',
    hfId: 'onnx-community/Qwen2.5-1.5B-Instruct',
    size: 900 * 1024 * 1024,
    sizeLabel: '≈900 МБ',
    quality: 3,
    speed: 3,
    ramNeeded: 2500 * 1024 * 1024,
    dtype: 'q4',
    default: false,
  },
  {
    id: 'qwen-3b',
    name: 'Мощная',
    description: 'Лучшее качество, нужно больше RAM',
    hfId: 'onnx-community/Qwen2.5-3B-Instruct',
    size: 2500 * 1024 * 1024,
    sizeLabel: '≈2.5 ГБ',
    quality: 4,
    speed: 2,
    ramNeeded: 5000 * 1024 * 1024,
    dtype: 'q4',
    default: false,
  },
];

const KEY_ACTIVE = 'nyvex_active_model';
const KEY_DOWNLOADED = 'nyvex_downloaded_models';

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
