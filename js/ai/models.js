/**
 * NYVEX — models for @xenova/transformers@2.17 (ONNX quantized, non-SIMD safe)
 * UI shows only: Быстрая / Умная / Мощная (never HF id)
 */
import { getRecommendedModelId, getDeviceCaps } from './capabilities.js';

export const AVAILABLE_MODELS = [
  {
    id: 'fast',
    name: 'Быстрая',
    description: 'Мгновенные ответы для простых задач',
    hfId: 'Xenova/Qwen1.5-0.5B-Chat',
    size: 350 * 1024 * 1024,
    sizeLabel: '≈350 МБ',
    quality: 2,
    speed: 5,
    ramNeededGb: 1.5,
    minDeviceMemoryGb: 2,
    dtype: 'q4',
    vendor: '',
    default: false,
  },
  {
    id: 'smart',
    name: 'Умная',
    description: 'Баланс скорости и качества',
    hfId: 'Xenova/Qwen1.5-1.8B-Chat',
    size: 900 * 1024 * 1024,
    sizeLabel: '≈900 МБ',
    quality: 3,
    speed: 4,
    ramNeededGb: 2.5,
    minDeviceMemoryGb: 3,
    dtype: 'q4',
    vendor: '',
    default: true,
  },
  {
    id: 'strong',
    name: 'Мощная',
    description: 'Максимальное качество для флагманов',
    hfId: 'Xenova/Phi-3-mini-4k-instruct',
    size: 2000 * 1024 * 1024,
    sizeLabel: '≈2 ГБ',
    quality: 4,
    speed: 2,
    ramNeededGb: 4,
    minDeviceMemoryGb: 6,
    dtype: 'q4',
    vendor: '',
    default: false,
  },
];

const KEY_ACTIVE = 'nyvex_active_model';
const KEY_DOWNLOADED = 'nyvex_downloaded_models';

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

export function getRecommendedModel() {
  const id = getRecommendedModelId();
  return AVAILABLE_MODELS.find((m) => m.id === id) || AVAILABLE_MODELS[0];
}

export function getActiveModel() {
  let id = null;
  try {
    id = localStorage.getItem(KEY_ACTIVE);
  } catch {}
  // migrate old ids
  if (id && String(id).startsWith('qwen')) id = null;
  if (id && String(id).startsWith('llama')) id = null;
  if (id && String(id).startsWith('tinyllama')) id = null;
  if (!id) {
    id = getRecommendedModelId();
    try {
      localStorage.setItem(KEY_ACTIVE, id);
    } catch {}
  }
  return AVAILABLE_MODELS.find((m) => m.id === id) || getRecommendedModel();
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
  return getRecommendedModel();
}

export { getDeviceCaps, getRecommendedModelId };
