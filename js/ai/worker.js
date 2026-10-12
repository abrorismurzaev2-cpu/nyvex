/**
 * NYVEX — ai/worker.js
 * Load + generate off main thread. Robust HF download.
 */
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
// Prefer official HF host (Transformers.js default)
try {
  if (!env.remoteHost) env.remoteHost = 'https://huggingface.co';
} catch {}

let MODEL_ID = 'onnx-community/Qwen2.5-1.5B-Instruct';
let generator = null;
let device = 'wasm';
let ready = false;

function post(msg) {
  self.postMessage(msg);
}

function friendlyError(err) {
  const msg = String(err?.message || err || '');
  if (/network|fetch|Failed to fetch|Load failed|TypeError/i.test(msg)) {
    return 'Ошибка сети при загрузке AI. Проверьте интернет / Wi‑Fi и повторите.';
  }
  if (/CORS|cross-origin/i.test(msg)) {
    return 'Ошибка доступа к модели. Обновите страницу (Ctrl+Shift+R).';
  }
  if (/memory|out of memory|OOM/i.test(msg)) {
    return 'Недостаточно памяти. Закройте другие вкладки и повторите.';
  }
  if (/WebGPU/i.test(msg)) {
    return 'WebGPU недоступен, пробуем WASM…';
  }
  return msg.slice(0, 180) || 'Не удалось загрузить AI';
}

async function loadPipeline(preferGpu) {
  // Mobile / unstable GPU: prefer WASM first for reliability
  const order = preferGpu ? ['webgpu', 'wasm'] : ['wasm', 'webgpu'];
  let lastErr = null;

  for (const dev of order) {
    for (const dt of ['q4', 'q4f16', 'q8']) {
      try {
        post({ type: 'progress', status: 'init', message: 'Подключение · ' + dev });
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
          message: friendlyError(err),
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
    post({ type: 'error', id, message: friendlyError(err) });
  }
};

post({ type: 'boot' });
