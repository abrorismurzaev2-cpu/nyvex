/**
 * NYVEX — ai/worker.js
 * Load + generate off main thread
 */
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';

env.allowLocalModels = false;
env.useBrowserCache = true;

let MODEL_ID = 'onnx-community/Qwen2.5-1.5B-Instruct';
let generator = null;
let device = 'wasm';
let ready = false;

function post(msg) {
  self.postMessage(msg);
}

async function loadPipeline(preferGpu) {
  const order = preferGpu ? ['webgpu', 'wasm'] : ['wasm'];
  let lastErr = null;
  for (const dev of order) {
    for (const dt of ['q4', 'q8']) {
      try {
        post({ type: 'progress', status: 'init', message: 'Подключение…' });
        console.log('[nyvex-worker] load', MODEL_ID, dev, dt);
        device = dev;
        const progressMap = {};
        let lastTs = Date.now();
        let lastLoaded = 0;

        generator = await pipeline('text-generation', MODEL_ID, {
          device: dev,
          dtype: dt,
          progress_callback: (p) => {
            try {
              if (p.file) console.log('[nyvex-worker]', p.status, p.file, p.loaded, p.total);
              if (p.status === 'progress' && p.file) {
                progressMap[p.file] = { loaded: p.loaded || 0, total: p.total || 0 };
                let total = 0;
                let loaded = 0;
                for (const k in progressMap) {
                  total += progressMap[k].total || 0;
                  loaded += progressMap[k].loaded || 0;
                }
                if (!total) total = 900 * 1024 * 1024;
                const now = Date.now();
                const dtSec = Math.max(0.25, (now - lastTs) / 1000);
                const speed = Math.max(0, (loaded - lastLoaded) / dtSec);
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
                  file: String(p.file || '').split('/').pop(),
                });
              } else if (p.status === 'ready') {
                post({ type: 'progress', status: 'ready', message: 'Инициализация…', pct: 99 });
              } else if (p.status === 'done') {
                post({ type: 'progress', status: 'from_cache', message: 'Из кэша', pct: 100 });
              } else if (p.status === 'initiate' || p.status === 'download') {
                post({
                  type: 'progress',
                  status: 'init',
                  message: p.file ? String(p.file).split('/').pop() : 'Скачивание…',
                });
              }
            } catch (e) {
              console.error('[nyvex-worker] progress', e);
            }
          },
        });
        return;
      } catch (err) {
        lastErr = err;
        console.error('[nyvex-worker] failed', dev, dt, err);
        post({
          type: 'progress',
          status: 'init',
          message: 'Повтор…',
        });
        generator = null;
      }
    }
  }
  throw lastErr || new Error('Не удалось загрузить AI');
}

self.onmessage = async (e) => {
  const data = e.data || {};
  const { type, id } = data;
  try {
    if (type === 'load') {
      if (data.modelId) MODEL_ID = data.modelId;
      await loadPipeline(!!data.preferGpu);
      ready = true;
      post({ type: 'loaded', device, id });
      return;
    }
    if (type === 'generate') {
      if (!ready || !generator) {
        post({ type: 'error', id, message: 'AI не загружен' });
        return;
      }
      const messages = Array.isArray(data.messages) ? data.messages : [];
      const opts = data.options || {};
      const output = await generator(messages, {
        max_new_tokens: opts.max_new_tokens || 150,
        temperature: opts.temperature ?? 0.5,
        top_p: opts.top_p ?? 0.85,
        top_k: opts.top_k ?? 40,
        do_sample: true,
        repetition_penalty: opts.repetition_penalty ?? 1.05,
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
    if (type === 'ping') post({ type: 'pong', ready, device });
  } catch (err) {
    console.error('[nyvex-worker]', err);
    post({ type: 'error', id, message: String(err?.message || err || 'unknown') });
  }
};

post({ type: 'boot' });
