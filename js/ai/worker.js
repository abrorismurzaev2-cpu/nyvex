/**
 * NYVEX — ai/worker.js
 * Web Worker: загрузка модели + инференс вне main thread
 * type: module
 */

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';

env.allowLocalModels = false;
env.useBrowserCache = true;

let MODEL_ID = 'onnx-community/Qwen2.5-0.5B-Instruct';

let generator = null;
let device = 'wasm';
let ready = false;

function post(msg) {
  self.postMessage(msg);
}

self.onmessage = async (e) => {
  const data = e.data || {};
  const { type, id } = data;

  try {
    if (type === 'load') {
      const preferGpu = !!data.preferGpu;
      if (data.modelId) MODEL_ID = data.modelId;
      device = preferGpu ? 'webgpu' : 'wasm';
      post({ type: 'progress', status: 'init', message: 'Инициализация…' });

      const progressMap = {};
      let lastTs = Date.now();
      let lastLoaded = 0;

      generator = await pipeline('text-generation', MODEL_ID, {
        device,
        dtype: 'q4',
        progress_callback: (p) => {
          try {
            if (p.status === 'progress' && p.file) {
              progressMap[p.file] = { loaded: p.loaded || 0, total: p.total || 0 };
              let total = 0;
              let loaded = 0;
              for (const k in progressMap) {
                total += progressMap[k].total;
                loaded += progressMap[k].loaded;
              }
              const now = Date.now();
              const dt = Math.max(0.05, (now - lastTs) / 1000);
              const speed = (loaded - lastLoaded) / dt;
              lastTs = now;
              lastLoaded = loaded;
              const pct = total > 0 ? Math.min(99, (loaded / total) * 100) : 0;
              const remaining = speed > 0 && total > loaded ? (total - loaded) / speed : 0;
              post({
                type: 'progress',
                status: 'progress',
                loaded,
                total,
                pct,
                speed,
                eta: remaining,
              });
            } else if (p.status === 'ready') {
              post({ type: 'progress', status: 'ready', message: 'Загрузка в память…', pct: 99 });
            } else if (p.status === 'initiate' || p.status === 'download') {
              post({ type: 'progress', status: p.status || 'init', message: 'Скачивание…' });
            }
          } catch {
            /* ignore */
          }
        },
      });

      ready = true;
      post({ type: 'loaded', device, id });
      return;
    }

    if (type === 'generate') {
      if (!ready || !generator) {
        post({ type: 'error', id, message: 'Модель не загружена' });
        return;
      }

      const messages = Array.isArray(data.messages) ? data.messages : [];
      const opts = data.options || {};

      const output = await generator(messages, {
        max_new_tokens: opts.max_new_tokens || 240,
        temperature: opts.temperature ?? 0.7,
        top_p: opts.top_p ?? 0.9,
        do_sample: true,
        repetition_penalty: opts.repetition_penalty ?? 1.1,
      });

      let reply = '';
      if (Array.isArray(output) && output[0]?.generated_text) {
        const gen = output[0].generated_text;
        if (Array.isArray(gen)) {
          const last = gen[gen.length - 1];
          reply = typeof last === 'string' ? last : last?.content || '';
        } else {
          reply = String(gen).replace(/^[\s\S]*?assistant\s*/i, '').trim();
        }
      }
      if (!reply) reply = 'Не удалось сгенерировать ответ. Попробуйте ещё раз.';
      post({ type: 'result', id, text: reply.trim() });
      return;
    }

    if (type === 'ping') {
      post({ type: 'pong', ready, device });
    }
  } catch (err) {
    post({
      type: 'error',
      id,
      message: String(err?.message || err || 'unknown'),
    });
  }
};

post({ type: 'boot' });
