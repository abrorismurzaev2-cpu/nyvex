/**
 * NYVEX — ai/chat.js
 * Russian-only + moderation + fast generation
 */
import { MODEL, LIMITS } from '../core/config.js';
import { isModelReady, generateViaWorker } from './loader.js';
import { checkInput, checkOutput, isRussian, stripNonRussianNoise } from './moderation.js';

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

function buildMessages(userText, history, system) {
  return [
    { role: 'system', content: system },
    ...history.slice(-LIMITS.historyContext).map((m) => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.text || '',
    })),
    {
      role: 'user',
      content: userText + '\n\n(Ответь строго на русском, кратко, 2–4 предложения.)',
    },
  ];
}

export async function generateReply(userText, history = [], opts = {}) {
  // Input moderation
  const inputCheck = checkInput(userText);
  if (inputCheck.blocked) {
    return { answer: inputCheck.message, thinking: null, ms: 0, blocked: true };
  }

  if (!isModelReady()) {
    return {
      answer: 'AI ещё загружается. Подождите немного или проверьте интернет при первом запуске.',
      thinking: null,
      ms: 0,
    };
  }

  let system = MODEL.systemPrompt;
  if (opts.deepThinking) system += '\n' + MODEL.thinkingSystemAdd;

  const genOpts = {
    max_new_tokens: opts.deepThinking ? 500 : MODEL.maxNewTokens,
    temperature: opts.deepThinking ? 0.7 : MODEL.temperature,
    top_p: MODEL.topP,
    top_k: MODEL.topK,
    repetition_penalty: MODEL.repetitionPenalty,
    do_sample: true,
  };

  const t0 = Date.now();
  const fallback = 'Извините, произошла ошибка. Попробуйте переформулировать вопрос.';

  try {
    let messages = buildMessages(userText, history, system);
    let reply = String((await generateViaWorker(messages, genOpts)) || '').trim();
    reply = stripNonRussianNoise(reply);

    // Language retry
    if (reply && !isRussian(reply)) {
      const hardSystem =
        system +
        '\nПОВТОР: отвечай ТОЛЬКО на русском. Первое слово — русское. Без английского и китайского.';
      messages = buildMessages(userText, history, hardSystem);
      try {
        const retry = String(
          (await generateViaWorker(messages, { ...genOpts, temperature: 0.35, max_new_tokens: 120 })) || ''
        ).trim();
        const cleaned = stripNonRussianNoise(retry);
        if (cleaned && isRussian(cleaned)) reply = cleaned;
        else reply = fallback;
      } catch {
        reply = fallback;
      }
    }

    // Output moderation
    const out = checkOutput(reply);
    if (out.blocked) {
      reply = out.message;
    }

    const parsed = parseThinkingReply(reply);
    // moderate thinking block too
    if (parsed.thinking) {
      const th = checkOutput(parsed.thinking);
      if (th.blocked) parsed.thinking = null;
    }
    if (parsed.answer) {
      const an = checkOutput(parsed.answer);
      if (an.blocked) parsed.answer = an.message;
    }

    return {
      answer: parsed.answer || fallback,
      thinking: parsed.thinking,
      ms: Date.now() - t0,
    };
  } catch (e) {
    console.error('[chat]', e);
    const msg = String(e?.message || e || '');
    if (/network|fetch|Failed to fetch|offline/i.test(msg)) {
      return { answer: 'Проверьте интернет. Попробуйте ещё раз.', thinking: null, ms: Date.now() - t0 };
    }
    return { answer: 'AI временно недоступен. Попробуйте ещё раз.', thinking: null, ms: Date.now() - t0 };
  }
}
