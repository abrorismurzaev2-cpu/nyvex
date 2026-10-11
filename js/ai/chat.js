/**
 * NYVEX — ai/chat.js
 * Russian-only, fast generation
 */
import { MODEL, LIMITS } from '../core/config.js';
import { isModelReady, generateViaWorker } from './loader.js';

export function parseThinkingReply(raw) {
  const text = String(raw || '');
  const thinkMatch = text.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  const answerMatch = text.match(/<answer>([\s\S]*?)<\/answer>/i);
  if (thinkMatch || answerMatch) {
    return {
      thinking: thinkMatch ? thinkMatch[1].trim() : null,
      answer: answerMatch
        ? answerMatch[1].trim()
        : text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim(),
    };
  }
  return { thinking: null, answer: text.trim() };
}

function latinHeavy(text) {
  const t = String(text || '');
  if (t.length < 8) return false;
  const latin = (t.match(/[a-zA-Z]/g) || []).length;
  const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length;
  const cyr = (t.match(/[а-яА-ЯёЁ]/g) || []).length;
  return latin + cjk > cyr;
}

export async function generateReply(userText, history = [], opts = {}) {
  if (!isModelReady()) {
    return {
      answer: 'AI ещё загружается. Подождите немного или проверьте интернет при первом запуске.',
      thinking: null,
      ms: 0,
    };
  }

  let system = MODEL.systemPrompt;
  if (opts.deepThinking) system += '\n' + MODEL.thinkingSystemAdd;

  const messages = [
    { role: 'system', content: system },
    ...history.slice(-LIMITS.historyContext).map((m) => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.text || '',
    })),
    { role: 'user', content: userText },
  ];

  const genOpts = {
    max_new_tokens: opts.deepThinking ? 400 : MODEL.maxNewTokens,
    temperature: MODEL.temperature,
    top_p: MODEL.topP,
    repetition_penalty: MODEL.repetitionPenalty,
  };

  const t0 = Date.now();
  try {
    let reply = String(await generateViaWorker(messages, genOpts) || '').trim();

    if (latinHeavy(reply)) {
      const retryMsgs = [
        ...messages,
        {
          role: 'user',
          content: 'Перепиши ответ СТРОГО на русском языке, без английских и китайских фраз.',
        },
      ];
      try {
        const retry = String(await generateViaWorker(retryMsgs, { ...genOpts, temperature: 0.4 }) || '').trim();
        if (retry && !latinHeavy(retry)) reply = retry;
        else if (latinHeavy(reply)) {
          reply = 'Извините, произошла ошибка. Попробуйте переформулировать вопрос.';
        }
      } catch {
        reply = 'Извините, произошла ошибка. Попробуйте переформулировать вопрос.';
      }
    }

    const parsed = parseThinkingReply(reply);
    return {
      answer: parsed.answer || reply,
      thinking: opts.deepThinking ? parsed.thinking : parsed.thinking,
      ms: Date.now() - t0,
    };
  } catch (e) {
    console.error('Inference error:', e);
    return {
      answer: 'Не удалось получить ответ. Попробуйте ещё раз.',
      thinking: null,
      ms: Date.now() - t0,
    };
  }
}
