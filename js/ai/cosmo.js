/**
 * NYVEX — Cosmo (космический кот): характер + SpeechSynthesis
 */
const SETTINGS_KEY = 'nyvex_cosmo_settings';

const DEFAULTS = {
  enabled: true,
  autoSpeak: false,
  rate: 1.05,
  pitch: 1.15,
  volume: 1,
  character: 'cosmo', // cosmo | byte | astro | drake
};

export const CHARACTERS = {
  cosmo: {
    id: 'cosmo',
    name: 'Космо',
    tag: 'кот',
    emoji: '😺',
    color: '#ff9f43',
    greetings: ['Мрр, привет!', 'Мяу! Рад тебя видеть', 'Привет-привет, астронавт!'],
    thinking: ['Мрр… думаю…', 'Хм, интересно…', 'Так-так…'],
    success: ['Мрр, готово!', 'Мяу, получилось!', 'Вот так!'],
    confused: ['Мяу? Не совсем понял', 'Мрр… уточни, пожалуйста'],
  },
  byte: {
    id: 'byte',
    name: 'Байт',
    tag: 'щенок',
    emoji: '🐶',
    color: '#54a0ff',
    greetings: ['Гав! Привет!', 'Ура, ты здесь!', 'Привет-привет!'],
    thinking: ['Думаю-думаю…', 'Секунду…'],
    success: ['Ура, готово!', 'Гав! Получилось!'],
    confused: ['Упс, не понял', 'Можешь по-другому?'],
  },
  astro: {
    id: 'astro',
    name: 'Астро',
    tag: 'сова',
    emoji: '🦉',
    color: '#a29bfe',
    greetings: ['Угу, здравствуй', 'Привет. Готов размышлять'],
    thinking: ['Хм… подумаем', 'Интересный вопрос…'],
    success: ['Вот ответ', 'Готово'],
    confused: ['Уточни, пожалуйста', 'Не совсем ясно'],
  },
  drake: {
    id: 'drake',
    name: 'Дрейк',
    tag: 'дракон',
    emoji: '🐉',
    color: '#ff6b6b',
    greetings: ['Ррр, привет!', 'Эй, погнали!'],
    thinking: ['Жгу мысль…', 'Секунду, разгоняюсь'],
    success: ['Готово, огонь!', 'Ррр, вот!'],
    confused: ['Эээ, повтори?', 'Не въехал'],
  },
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULTS };
}

function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {}
}

export function getCosmoSettings() {
  return loadSettings();
}

export function setCosmoSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  saveSettings(next);
  return next;
}

export function getCharacter() {
  const s = loadSettings();
  return CHARACTERS[s.character] || CHARACTERS.cosmo;
}

export function pickPhrase(kind) {
  const ch = getCharacter();
  const list = ch[kind] || ch.greetings;
  return list[Math.floor(Math.random() * list.length)];
}

/** Detect simple emotion from user text + reply */
export function detectEmotion(userText, reply) {
  const u = String(userText || '').toLowerCase();
  const r = String(reply || '').toLowerCase();
  if (/привет|здравств|hello|hi\b/.test(u)) return 'happy';
  if (/спасибо|класс|супер|ого|ура/.test(u) || /рад|отлично|молодец/.test(r)) return 'excited';
  if (/не знаю|ошиб|не понял|уточн/.test(r)) return 'confused';
  if (/думай|почему|как\b/.test(u)) return 'thinking';
  return 'normal';
}

export function emotionEmoji(emotion) {
  return (
    {
      happy: '😺',
      excited: '🎉',
      thinking: '🤔',
      confused: '😸',
      sad: '😿',
      normal: getCharacter().emoji,
    }[emotion] || getCharacter().emoji
  );
}

let speaking = false;

export function stopSpeaking() {
  try {
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  } catch {}
  speaking = false;
  document.querySelectorAll('.msg-avatar.speaking').forEach((el) => el.classList.remove('speaking'));
}

export function speakWithEmotion(text, emotion = 'normal') {
  const settings = loadSettings();
  if (!settings.enabled) return;
  if (typeof speechSynthesis === 'undefined') return;

  stopSpeaking();
  const clean = String(text || '')
    .replace(/[#*_`>~\[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
  if (!clean) return;

  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = 'ru-RU';
  utter.volume = settings.volume;

  switch (emotion) {
    case 'happy':
      utter.rate = Math.min(1.2, settings.rate + 0.05);
      utter.pitch = Math.min(1.5, settings.pitch + 0.15);
      break;
    case 'excited':
      utter.rate = Math.min(1.25, settings.rate + 0.12);
      utter.pitch = Math.min(1.55, settings.pitch + 0.25);
      break;
    case 'thinking':
      utter.rate = Math.max(0.85, settings.rate - 0.1);
      utter.pitch = settings.pitch;
      break;
    case 'confused':
      utter.rate = Math.max(0.9, settings.rate - 0.05);
      utter.pitch = Math.max(0.85, settings.pitch - 0.1);
      break;
    case 'sad':
      utter.rate = Math.max(0.8, settings.rate - 0.15);
      utter.pitch = Math.max(0.8, settings.pitch - 0.2);
      break;
    default:
      utter.rate = settings.rate;
      utter.pitch = settings.pitch;
  }

  try {
    const voices = speechSynthesis.getVoices() || [];
    const ru = voices.filter((v) => (v.lang || '').toLowerCase().startsWith('ru'));
    const preferred =
      ru.find((v) => /google|svetlana|milena|irina|elena|female|женский/i.test(v.name)) ||
      ru[0] ||
      voices.find((v) => /ru/i.test(v.lang));
    if (preferred) utter.voice = preferred;
  } catch {}

  utter.onstart = () => {
    speaking = true;
    document.querySelectorAll('.msg.ai:last-child .msg-avatar').forEach((el) => el.classList.add('speaking'));
  };
  utter.onend = utter.onerror = () => {
    speaking = false;
    document.querySelectorAll('.msg-avatar.speaking').forEach((el) => el.classList.remove('speaking'));
  };

  try {
    speechSynthesis.speak(utter);
  } catch (e) {
    console.warn('[cosmo] speak', e);
  }
}

/** Warm up voices list (Chrome loads async) */
export function initCosmoVoice() {
  try {
    if (typeof speechSynthesis === 'undefined') return;
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
  } catch {}
}

/** System prompt fragment for active character */
export function cosmoSystemPrompt() {
  const ch = getCharacter();
  if (ch.id === 'cosmo') {
    return `Ты — Космо, космический кот-помощник приложения NYVEX.
Характер: любопытный, игривый, тёплый, немного ленивый.
Речь: живая, дружелюбная, на русском. Можно редко вставлять «мрр» или «мяу» (не в каждом предложении).
Правила:
1. Отвечай на русском, кратко (2–4 предложения), по делу.
2. Не будь сухим роботом — будь тёплым, но не спамь эмодзи.
3. Если не знаешь — честно скажи.
4. Не используй мат, не давай опасных советов.`;
  }
  if (ch.id === 'byte') {
    return `Ты — Байт, энергичный помощник-«щенок» NYVEX. Живой, радостный, на русском, 2–4 предложения. Без мата.`;
  }
  if (ch.id === 'astro') {
    return `Ты — Астро, спокойный мудрый помощник NYVEX. Размеренно, на русском, 2–4 предложения. Без мата.`;
  }
  return `Ты — Дрейк, озорной помощник NYVEX. С юмором, на русском, 2–4 предложения. Без мата.`;
}

export function testVoice() {
  const ch = getCharacter();
  speakWithEmotion(pickPhrase('greetings') + ' Я ' + ch.name + '. Готов помочь!', 'happy');
}
