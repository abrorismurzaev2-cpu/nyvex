/**
 * NYVEX — core/config.js
 */
export const APP_NAME = 'NYVEX';
export const APP_VERSION = '2.3.0';
export const PRICE_RUB = 290;
export const TRIAL_DAYS = 7;
export const PAID_DAYS = 30;

export const STORAGE_KEYS = {
  CHATS: 'nyvex_chats',
  SETTINGS: 'nyvex_settings',
  COOKIE_CONSENT: 'nyvex_cookie_consent',
  DEVICE_ID: 'nyvex_device_id',
  TRIAL_STATE: 'nyvex_trial_state',
  MOD_LOG: 'nyvex_moderation_log',
};

/** Internal model id — never show in UI */
export const MODEL_ID = 'onnx-community/Qwen2.5-1.5B-Instruct';
export const DEFAULT_MODEL_ID = MODEL_ID;

export const MODEL = {
  id: MODEL_ID,
  task: 'text-generation',
  dtype: 'q4',
  maxNewTokens: 150,
  temperature: 0.5,
  topP: 0.85,
  topK: 40,
  repetitionPenalty: 1.05,
    systemPrompt: `Ты — вежливый русскоязычный AI-ассистент NYVEX.

ПРАВИЛА:
1. Отвечай в основном на русском языке.
2. Будь кратким — 2–4 предложения.
3. Отвечай по делу, без лишних вступлений.
4. Если не знаешь ответа — честно скажи об этом.`,
  thinkingSystemAdd: `Сначала рассуждай в <thinking>...</thinking>, затем ответ в <answer>...</answer>.`,
};

export const CDN = {
  primary: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2',
};

export const HF_MIRRORS = [
  'https://huggingface.co',
  'https://hf-mirror.com',
];

export const LIMITS = {
  chatTitleMax: 60,
  historyContext: 6,
  avatarMaxBytes: 3 * 1024 * 1024,
};

export const LOGO_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="12" rx="9.5" ry="4.2" transform="rotate(-28 12 12)"/><path d="M12 2.5 L12 21.5"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/></svg>`;

/** Backend API (Vercel). Override: localStorage nyvex_api_base */
export function getApiBase() {
  try {
    const custom = localStorage.getItem('nyvex_api_base');
    if (custom) return String(custom).replace(/\/$/, '');
  } catch {}
  return 'https://nyvex-xi.vercel.app';
}
