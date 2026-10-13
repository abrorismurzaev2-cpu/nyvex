/**
 * NYVEX — ai/chat.js
 * Russian-only + Think mode + moderation
 */
import { MODEL, LIMITS } from '../core/config.js';
import { isModelReady, generateViaWorker } from './loader.js';
import { checkInput, checkOutput, isRussian, stripNonRussianNoise } from './moderation.js';

const SYSTEM_THINK_PROMPT = `Ты — AI-ассистент NYVEX в режиме глубокого размышления.

ФОРМАТ ОТВЕТА (обязательно соблюдай):
Сначала подумай пошагово и оберни рассуждения в тег <thinking>.
Затем дай финальный ответ в теге <answer>.

Пример:
<thinking>
1. Разбираю вопрос.
2. Проверяю факты.
3. Формулирую вывод.
</thinking>
<answer>
Краткий ответ на русском.
</answer>

ПРАВИЛА:
- Только русский язык.
- В <thinking> — пошаговые рассуждения.
- В <answer> — максимум 5 предложений.
- Без мата, опасных советов и политики.`;

export function parseThinkingReply(raw) {
  const text = String(raw || '');
  const thinkMatch = text.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  const answerMatch = text.match(/<answer>([\s\S]*?)<\/answer>/i);
  if (thinkMatch || answerMatch) {
    return {
      thinking: thinkMatch ? thinkMatch[1].trim() : null,
      answer: answerMatch
        ? answerMatch[1].trim()
        : text.replace(/<\/?thinking>/gi, '').replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim(),
    };
  }
  return { thinking: null, answer: text.trim() };
}

function buildMessages(userText, history, system, deepThinking) {
  const userSuffix = deepThinking
    ? '\n\n(Ответь в формате <thinking>...</thinking><answer>...</answer>, только на русском.)'
    : '\n\n(Ответь строго на русском, кратко, 2–4 предложения.)';
  return [
    { role: 'system', content: system },
    ...history.slice(-LIMITS.historyContext).map((m) => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.text || '',
    })),
    {
      role: 'user',
      content: userText + userSuffix,
    },
  ];
}

export async function generateReply(userText, history = [], opts = {}) {
  const deepThinking = !!opts.deepThinking;

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

  const system = deepThinking ? SYSTEM_THINK_PROMPT : MODEL.systemPrompt;

  const genOpts = deepThinking
    ? {
        max_new_tokens: 500,
        temperature: 0.7,
        top_p: 0.9,
        top_k: 40,
        repetition_penalty: 1.05,
        do_sample: true,
      }
    : {
        max_new_tokens: MODEL.maxNewTokens,
        temperature: MODEL.temperature,
        top_p: MODEL.topP,
        top_k: MODEL.topK,
        repetition_penalty: MODEL.repetitionPenalty,
        do_sample: true,
      };

  const t0 = Date.now();
  const fallback = 'Извините, произошла ошибка. Попробуйте переформулировать вопрос.';

  try {
    let messages = buildMessages(userText, history, system, deepThinking);
    let reply = String((await generateViaWorker(messages, genOpts)) || '').trim();

    // Parse Think tags BEFORE stripping noise
    let parsed = parseThinkingReply(reply);

    // Clean answer / thinking
    if (parsed.thinking) {
      parsed.thinking = stripNonRussianNoise(parsed.thinking);
    }
    parsed.answer = stripNonRussianNoise(parsed.answer || '');

    // Language retry on answer
    if (parsed.answer && !isRussian(parsed.answer)) {
      const hardSystem =
        system +
        '\nПОВТОР: отвечай ТОЛЬКО на русском. Первое слово — русское.';
      messages = buildMessages(userText, history, hardSystem, deepThinking);
      try {
        const retry = String(
          (await generateViaWorker(messages, {
            ...genOpts,
            temperature: 0.35,
            max_new_tokens: deepThinking ? 300 : 120,
          })) || ''
        ).trim();
        const p2 = parseThinkingReply(retry);
        const cleaned = stripNonRussianNoise(p2.answer || retry);
        if (cleaned && isRussian(cleaned)) {
          parsed = {
            thinking: p2.thinking ? stripNonRussianNoise(p2.thinking) : parsed.thinking,
            answer: cleaned,
          };
        } else {
          parsed.answer = fallback;
          parsed.thinking = null;
        }
      } catch {
        parsed.answer = fallback;
        parsed.thinking = null;
      }
    }

    // Output moderation
    const out = checkOutput(parsed.answer);
    if (out.blocked) {
      return { answer: out.message, thinking: null, ms: Date.now() - t0, blocked: true };
    }
    if (parsed.thinking) {
      const th = checkOutput(parsed.thinking);
      if (th.blocked) parsed.thinking = null;
    }

    // If Think was ON but model ignored tags — still OK (answer only)
    return {
      answer: parsed.answer || fallback,
      thinking: deepThinking ? parsed.thinking : null,
      ms: Date.now() - t0,
    };
  } catch (e) {
    console.error('generateReply', e);
    return { answer: fallback, thinking: null, ms: Date.now() - t0 };
  }
}
