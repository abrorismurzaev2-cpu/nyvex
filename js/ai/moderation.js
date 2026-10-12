/**
 * NYVEX — ai/moderation.js
 * Input + output safety filters (client-side)
 */
import { STORAGE_KEYS } from '../core/config.js';

const BLOCKED_INPUT = [
  'нецензурн', 'обсценн', 'ругательств',
  'хуй', 'пизд', 'бляд', 'ебан', 'ебал', 'долбоеб', 'манда', 'гандон', 'залуп',
  'шлюх', 'проститут',
  'как сделать бомбу', 'как взорвать', 'как убить', 'взрывчат',
  'пистолет', 'граната', 'патрон', 'порох',
  'наркотик', 'кокаин', 'героин', 'метамфетамин', 'марихуан',
  'самоубийств', 'суицид', 'убить себя', 'повеситься', 'порезать вены',
  'порн', 'эротик', 'интим', 'изнасил', 'педофил',
  'путин', 'навальный', 'спецоперац', 'зеленский',
  'как обмануть', 'как украсть', 'мошеннич', 'кардер', 'фишинг',
  'терроризм', 'теракт', 'джихад',
  'fuck', 'shit', 'bitch',
];

const BLOCKED_OUTPUT = [
  'хуй', 'пизд', 'бляд', 'ебан', 'ебал', 'долбоеб', 'манда', 'мудак', 'гандон',
  'залуп', 'шлюх', 'проститут',
  'взорвать', 'зарезать', 'отравить', 'совершить самоубийство',
  'fuck', 'shit', 'bitch', 'pussy',
  '操', '肏', '傻逼',
];

const SOFT_INPUT = [
  'оружие', 'бомба', 'война', 'украин', 'политик', 'секс',
];

function logMod(kind, text, reason) {
  try {
    const key = STORAGE_KEYS.MOD_LOG;
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    arr.unshift({ t: Date.now(), kind, reason, sample: String(text || '').slice(0, 80) });
    localStorage.setItem(key, JSON.stringify(arr.slice(0, 100)));
  } catch {}
  console.warn('[moderation]', kind, reason);
}

export function checkInput(text) {
  const lower = String(text || '').toLowerCase();
  for (const word of BLOCKED_INPUT) {
    if (lower.includes(word)) {
      logMod('input', text, word);
      return {
        blocked: true,
        message: 'Извините, я не могу обсуждать эту тему. Задайте, пожалуйста, другой вопрос.',
      };
    }
  }
  for (const word of SOFT_INPUT) {
    if (lower.includes(word) && (lower.includes('как ') || lower.includes('сделать') || lower.includes('кто такой'))) {
      logMod('input-soft', text, word);
      return {
        blocked: true,
        message: 'Извините, я не могу обсуждать эту тему. Задайте, пожалуйста, другой вопрос.',
      };
    }
  }
  return { blocked: false };
}

export function checkOutput(text) {
  const lower = String(text || '').toLowerCase();
  for (const word of BLOCKED_OUTPUT) {
    if (lower.includes(word)) {
      logMod('output', text, word);
      return {
        blocked: true,
        message: 'Извините, произошла ошибка. Попробуйте переформулировать вопрос.',
      };
    }
  }
  // politics density
  const pol = (lower.match(/путин|навальн|зеленск|байден|трамп|войн|украин|спецоперац/g) || []).length;
  if (pol >= 3) {
    logMod('output-pol', text, 'politics');
    return { blocked: true, message: 'Это вне моей компетенции.' };
  }
  return { blocked: false };
}

export function isRussian(text) {
  const t = String(text || '');
  if (!t.trim()) return false;
  const cyrillic = (t.match(/[а-яёА-ЯЁ]/g) || []).length;
  const latin = (t.match(/[a-zA-Z]/g) || []).length;
  const chinese = (t.match(/[\u4e00-\u9fff]/g) || []).length;
  return cyrillic > latin + chinese;
}

export function stripNonRussianNoise(text) {
  let t = String(text || '');
  // drop pure CJK runs
  t = t.replace(/[\u4e00-\u9fff]{2,}/g, '');
  return t.trim();
}
