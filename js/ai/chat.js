/**
 * NYVEX — ai/chat.js
 * Chat generation + Think mode (no content filters — local model, user responsibility)
 */
import { MODEL, LIMITS } from '../core/config.js';
import { isModelReady, generateViaWorker } from './loader.js';

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
Краткий ответ.
</answer>

ПРАВИЛА:
- Отвечай в основном на русском языке.
- В <thinking> — пошаговые рассуждения.
- В <answer> — максимум 5 предложений.`;

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
    ? '\n\n(Ответь в формате <thinking>...</thinking><answer>...</answer>.)'
    : '\n\n(Ответь кратко, 2–4 предложения.)';
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
  const fallback = 'Извините, произошла ошибка. Попробуйте ещё раз.';

  try {
    const messages = buildMessages(userText, history, system, deepThinking);
    let reply = String((await generateViaWorker(messages, genOpts)) || '').trim();
    const parsed = parseThinkingReply(reply);
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
