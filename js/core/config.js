/**
 * NYVEX — core/config.js
 */
export const APP_NAME = 'NYVEX';
export const APP_VERSION = '2.0.0';
export const PRICE_RUB = 290;
export const TRIAL_DAYS = 7;
export const PAID_DAYS = 30;

export const STORAGE_KEYS = {
  CHATS: 'nyvex_chats',
  SETTINGS: 'nyvex_settings',
  COOKIE_CONSENT: 'nyvex_cookie_consent',
  DEVICE_ID: 'nyvex_device_id',
  TRIAL_STATE: 'nyvex_trial_state',
};

/** Single model — never show name in UI */
export const MODEL_ID = 'onnx-community/Qwen2.5-1.5B-Instruct';
export const DEFAULT_MODEL_ID = MODEL_ID;

export const MODEL = {
  id: MODEL_ID,
  task: 'text-generation',
  dtype: 'q4',
  maxNewTokens: 200,
  temperature: 0.6,
  topP: 0.85,
  repetitionPenalty: 1.05,
  systemPrompt: `Ты NYVEX — дружелюбный русскоязычный AI-ассистент.
ПРАВИЛА:
1. Отвечай ВСЕГДА только на русском языке. Даже если вопрос на другом языке — отвечай по-русски.
2. Будь кратким и по делу.
3. Не используй сложные термины без пояснений.
4. Если не знаешь — скажи честно.
Не отвечай на английском, китайском или других языках. Не смешивай языки.`,
  thinkingSystemAdd: `Сначала кратко рассуждай по-русски в тегах <thinking>...</thinking>, затем ответ в <answer>...</answer>.`,
};

export const CDN = {
  primary: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2',
};

export const LIMITS = {
  chatTitleMax: 60,
  historyContext: 6,
  avatarMaxBytes: 3 * 1024 * 1024,
};

export const LOGO_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="12" rx="9.5" ry="4.2" transform="rotate(-28 12 12)"/><path d="M12 2.5 L12 21.5"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/></svg>`;
