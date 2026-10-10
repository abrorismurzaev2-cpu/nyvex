/**
 * NYVEX — core/config.js
 * Константы и настройки приложения
 */

export const APP_NAME = 'NYVEX';
export const APP_VERSION = '1.0.0';

/** Ключи localStorage */
export const STORAGE_KEYS = {
  USER: 'nyvex_user',
  CHATS: 'nyvex_chats',
  SETTINGS: 'nyvex_settings',
  COOKIE_CONSENT: 'nyvex_cookie_consent',
};

/** Модель Transformers.js */
export const MODEL = {
  id: 'onnx-community/Qwen2.5-0.5B-Instruct',
  task: 'text-generation',
  dtype: 'q4',
  maxNewTokens: 240,
  temperature: 0.7,
  topP: 0.9,
  repetitionPenalty: 1.1,
  systemPrompt: 'Ты NYVEX — дружелюбный AI-помощник. Отвечай на русском кратко и по делу. Не выдумывай факты.',
};

/** CDN и зеркала (основной → резерв) */
export const CDN = {
  primary: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2',
  mirrorHint: 'hf-mirror.com',
};

/** Лимиты */
export const LIMITS = {
  nameMin: 2,
  nameMax: 30,
  passwordMin: 6,
  avatarMaxBytes: 3 * 1024 * 1024,
  chatTitleMax: 60,
  historyContext: 4,
};

/** Возраст */
export const MIN_AGE = 13;

/** Email regex */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
