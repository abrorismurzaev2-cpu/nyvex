/**
 * NYVEX — core/config.js
 */
export const APP_NAME = 'NYVEX';
export const APP_VERSION = '1.1.0';
export const PRICE_RUB = 290;
export const TRIAL_DAYS = 7;

export const STORAGE_KEYS = {
  USER: 'nyvex_user',
  CHATS: 'nyvex_chats',
  SETTINGS: 'nyvex_settings',
  COOKIE_CONSENT: 'nyvex_cookie_consent',
  MODEL_PREF: 'nyvex_model_pref',
  TRIAL_NOTICE: 'nyvex_trial_notice',
};

/** Available models (Transformers.js / onnx-community) */
export const MODELS = [
  {
    id: 'onnx-community/Qwen2.5-0.5B-Instruct',
    name: 'Qwen 2.5 · 0.5B',
    sizeMB: 350,
    size: '350 МБ',
    quality: 2,
    speed: 4,
    ram: '1 ГБ',
    qualityStars: '⭐⭐',
    speedIcons: '🚀🚀🚀🚀',
    desc: 'Быстрая, для простых вопросов',
  },
  {
    id: 'onnx-community/Qwen2.5-1.5B-Instruct',
    name: 'Qwen 2.5 · 1.5B',
    sizeMB: 900,
    size: '900 МБ',
    quality: 3,
    speed: 3,
    ram: '2-3 ГБ',
    qualityStars: '⭐⭐⭐',
    speedIcons: '🚀🚀🚀',
    desc: 'Средняя, для обычных задач',
  },
  {
    id: 'onnx-community/Qwen2.5-3B-Instruct',
    name: 'Qwen 2.5 · 3B',
    sizeMB: 2500,
    size: '2.5 ГБ',
    quality: 4,
    speed: 2,
    ram: '4-5 ГБ',
    qualityStars: '⭐⭐⭐⭐',
    speedIcons: '🚀🚀',
    desc: 'Мощная, для сложных задач',
  },
  {
    id: 'onnx-community/Llama-3.2-1B-Instruct',
    name: 'Llama 3.2 · 1B',
    sizeMB: 800,
    size: '800 МБ',
    quality: 3,
    speed: 3,
    ram: '2 ГБ',
    qualityStars: '⭐⭐⭐',
    speedIcons: '🚀🚀🚀',
    desc: 'Альтернатива от Meta',
  },
  {
    id: 'onnx-community/Llama-3.2-3B-Instruct',
    name: 'Llama 3.2 · 3B',
    sizeMB: 2500,
    size: '2.5 ГБ',
    quality: 4,
    speed: 2,
    ram: '4 ГБ',
    qualityStars: '⭐⭐⭐⭐',
    speedIcons: '🚀🚀',
    desc: 'Мощная, широкий кругозор',
  },
  {
    id: 'onnx-community/Phi-3.5-mini-instruct',
    name: 'Phi 3.5 · mini',
    sizeMB: 2300,
    size: '2.3 ГБ',
    quality: 4,
    speed: 2,
    ram: '4 ГБ',
    qualityStars: '⭐⭐⭐⭐',
    speedIcons: '🚀🚀',
    desc: 'Компактная умная от Microsoft',
  },
];

export const DEFAULT_MODEL_ID = MODELS[0].id;

export const MODEL = {
  id: DEFAULT_MODEL_ID,
  task: 'text-generation',
  dtype: 'q4',
  maxNewTokens: 280,
  temperature: 0.7,
  topP: 0.9,
  repetitionPenalty: 1.1,
  systemPrompt: `Ты NYVEX — дружелюбный AI-помощник.
Отвечай ВСЕГДА на том языке, на котором пишет пользователь.
Если пользователь пишет по-русски — отвечай ТОЛЬКО по-русски.
Если по-английски — только по-английски.
Никогда не смешивай языки в одном ответе.
Отвечай кратко и по делу. Не выдумывай факты.`,
  thinkingSystemAdd: `Прежде чем ответить, подумай пошагово.
Выведи рассуждения строго в тегах <thinking>...</thinking>,
а финальный ответ строго в тегах <answer>...</answer>.`,
};

export const CDN = {
  primary: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2',
  mirrorHint: 'hf-mirror.com',
};

export const LIMITS = {
  nameMin: 2,
  nameMax: 30,
  passwordMin: 6,
  avatarMaxBytes: 3 * 1024 * 1024,
  chatTitleMax: 60,
  historyContext: 6,
};

export const MIN_AGE = 13;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Shared orbital logo SVG path (stroke) */
export const LOGO_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="12" rx="9.5" ry="4.2" transform="rotate(-28 12 12)"/><path d="M12 2.5 L12 21.5"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/></svg>`;
