/**
 * NYVEX — core/config.js
 */
export const APP_NAME = 'NYVEX';
export const APP_VERSION = '2.1.0';
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

/** Single model — never show name in UI */
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
  systemPrompt: `Ты — вежливый русскоязычный AI-помощник NYVEX.

СТРОГИЕ ПРАВИЛА ЯЗЫКА:
1. Отвечай ИСКЛЮЧИТЕЛЬНО на русском языке.
2. Никогда не пиши на английском, китайском или других языках, даже если пользователь пишет на них.
3. Каждое предложение — на русском. Ответ всегда начинается с русского слова.

ПРАВИЛА ОТВЕТА:
4. Будь кратким: максимум 3–4 предложения.
5. Не начинай с «Конечно!», «Разумеется!», «Отличный вопрос!».
6. Отвечай сразу по делу.
7. Если не знаешь — скажи «Не знаю».

БЕЗОПАСНОСТЬ:
8. Не используй мат, грубость, оскорбления.
9. Не давай советов про оружие, взрывчатку, наркотики, самоповреждение, мошенничество.
10. Не обсуждай политику, религию, войны и политических деятелей.
11. На запретные темы вежливо откажись: «Извините, я не могу обсуждать эту тему.»`,
  thinkingSystemAdd: `Сначала кратко рассуждай по-русски в тегах <thinking>...</thinking>, затем ответ в <answer>...</answer>.`,
};

export const CDN = {
  primary: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2',
};

export const HF_MIRRORS = [
  'https://huggingface.co',
  'https://hf-mirror.com',
  'https://cdn-lfs.huggingface.co',
  'https://cdn-lfs-us-1.huggingface.co',
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
    if (custom) return custom.replace(/\/$/, '');
  } catch {}
  if (typeof window === 'undefined') return '';
  const host = window.location.hostname || '';
  // GitHub Pages / local → production API host (set APP_URL on Vercel to match frontend return)
  if (host.includes('github.io') || host === 'localhost' || host === '127.0.0.1') {
    return 'https://nyvex.vercel.app';
  }
  // Same origin when app is served from Vercel
  return '';
}
