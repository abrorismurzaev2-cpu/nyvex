/**
 * NYVEX — ai/chat.js
 * Диалог с моделью через Web Worker (без математики)
 */

import { MODEL, LIMITS } from '../core/config.js';
import { isModelReady, generateViaWorker } from './loader.js';

/**
 * @param {string} userText
 * @param {Array<{role:string,text:string}>} history
 * @returns {Promise<string>}
 */
export async function generateReply(userText, history = []) {
  if (!isModelReady()) {
    return 'Модель ещё не загружена. Подождите завершения загрузки или обновите страницу при стабильном интернете.';
  }

  const messages = [
    { role: 'system', content: MODEL.systemPrompt },
    ...history.slice(-LIMITS.historyContext).map((m) => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.text || '',
    })),
    { role: 'user', content: userText },
  ];

  try {
    const reply = await generateViaWorker(messages, {
      max_new_tokens: MODEL.maxNewTokens,
      temperature: MODEL.temperature,
      top_p: MODEL.topP,
      repetition_penalty: MODEL.repetitionPenalty,
    });
    return String(reply || '').trim() || 'Пустой ответ. Попробуйте ещё раз.';
  } catch (e) {
    console.error('Inference error:', e);
    return 'Ошибка генерации: ' + String(e?.message || 'неизвестно').slice(0, 120);
  }
}
