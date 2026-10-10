/**
 * NYVEX — ai/chat.js
 * Language-aware prompts + Deep Thinking parse
 */
import { MODEL, LIMITS, STORAGE_KEYS } from '../core/config.js';
import { isModelReady, generateViaWorker, getActiveModelId } from './loader.js';

function detectLang(text) {
  const t = String(text || '');
  const cyr = (t.match(/[а-яёА-ЯЁ]/g) || []).length;
  const lat = (t.match(/[a-zA-Z]/g) || []).length;
  const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length;
  if (cjk > cyr && cjk > lat) return 'zh';
  if (cyr >= lat) return 'ru';
  if (lat > 0) return 'en';
  return 'ru';
}

function langInstruction(lang) {
  if (lang === 'en') return 'Respond ONLY in English.';
  if (lang === 'zh') return '请只用中文回答。';
  return 'Отвечай ТОЛЬКО на русском языке. Не используй английский или китайский.';
}

function latinRatio(text) {
  const t = String(text || '').replace(/\s/g, '');
  if (!t.length) return 0;
  const lat = (t.match(/[a-zA-Z]/g) || []).length;
  const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length;
  return (lat + cjk) / t.length;
}

/**
 * Parse thinking / answer tags
 */
export function parseThinkingReply(raw) {
  const text = String(raw || '');
  const thinkMatch = text.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  const answerMatch = text.match(/<answer>([\s\S]*?)<\/answer>/i);
  if (thinkMatch || answerMatch) {
    return {
      thinking: thinkMatch ? thinkMatch[1].trim() : null,
      answer: answerMatch ? answerMatch[1].trim() : text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim(),
    };
  }
  return { thinking: null, answer: text.trim() };
}

/**
 * @param {string} userText
 * @param {Array} history
 * @param {{deepThinking?: boolean}} opts
 */
export async function generateReply(userText, history = [], opts = {}) {
  if (!isModelReady()) {
    return {
      answer:
        'Модель ещё не загружена. Подождите завершения загрузки или обновите страницу при стабильном интернете.',
      thinking: null,
      ms: 0,
    };
  }

  const lang = detectLang(userText);
  const recent = history
    .filter((m) => m.role === 'user')
    .slice(-3)
    .map((m) => m.text)
    .join(' ');
  const lang2 = recent ? detectLang(recent + ' ' + userText) : lang;

  let system = MODEL.systemPrompt + '\n' + langInstruction(lang2);
  if (opts.deepThinking) {
    system += '\n' + MODEL.thinkingSystemAdd;
  }

  const messages = [
    { role: 'system', content: system },
    ...history.slice(-LIMITS.historyContext).map((m) => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.text || '',
    })),
    { role: 'user', content: userText },
  ];

  const t0 = Date.now();
  try {
    let reply = await generateViaWorker(messages, {
      max_new_tokens: opts.deepThinking ? 420 : MODEL.maxNewTokens,
      temperature: MODEL.temperature,
      top_p: MODEL.topP,
      repetition_penalty: MODEL.repetitionPenalty,
    });
    reply = String(reply || '').trim();

    // Language post-check for Russian users
    if (lang2 === 'ru' && latinRatio(reply) > 0.55 && !opts._retried) {
      const retryMessages = [
        ...messages,
        {
          role: 'user',
          content:
            'Перепиши предыдущий ответ СТРОГО на русском языке, без английских и китайских фраз.',
        },
      ];
      try {
        const retry = await generateViaWorker(retryMessages, {
          max_new_tokens: MODEL.maxNewTokens,
          temperature: 0.5,
          top_p: 0.9,
          repetition_penalty: 1.15,
        });
        if (retry && latinRatio(retry) < latinRatio(reply)) {
          reply = String(retry).trim();
        }
      } catch (e) {
        console.error('lang retry failed', e);
      }
    }

    const parsed = parseThinkingReply(reply);
    return {
      answer: parsed.answer || reply,
      thinking: opts.deepThinking ? parsed.thinking || null : parsed.thinking,
      ms: Date.now() - t0,
    };
  } catch (e) {
    console.error('Inference error:', e);
    return {
      answer: 'Ошибка генерации: ' + String(e?.message || 'неизвестно').slice(0, 120),
      thinking: null,
      ms: Date.now() - t0,
    };
  }
}
