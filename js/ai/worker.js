/**
 * NYVEX — ai/worker.js
 * Resume download + retries + mirrors + generation
 */
import { installResumeFetch } from './resume-fetch.js';

installResumeFetch();

let pipeline;
let env;
let MODEL_ID = 'skjortan/MiniCPM5-1B-ONNX';
let generator = null;
let device = 'wasm';
let ready = false;

const MIRRORS = ['https://huggingface.co', 'https://hf-mirror.com'];

function post(msg) {
  self.postMessage(msg);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function friendlyError(err) {
  const msg = String(err?.message || err || '');
  if (/network|fetch|Failed to fetch|Load failed|TypeError|HTTP /i.test(msg)) {
    return 'Ошибка сети при загрузке AI. Проверьте интернет / Wi‑Fi и повторите.';
  }
  if (/CORS|cross-origin/i.test(msg)) return 'Ошибка доступа к модели. Обновите страницу.';
  if (/memory|out of memory|OOM/i.test(msg)) return 'Недостаточно памяти. Закройте другие вкладки.';
  if (/WebGPU/i.test(msg)) return 'WebGPU недоступен, пробуем WASM…';
  return msg.slice(0, 180) || 'Не удалось загрузить AI';
}

async function ensureTransformers() {
  if (pipeline) return;
  const mod = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2');
  pipeline = mod.pipeline;
  env = mod.env;
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.useBrowserCache = true;
  try {
    env.cacheDir = 'nyvex-model-cache-v2';
  } catch {}
}

async function tryPipeline(dev, dt, remoteHost) {
  await ensureTransformers();
  try {
    if (remoteHost) env.remoteHost = remoteHost;
  } catch {}

  const progressMap = {};
  let lastTs = Date.now();
  let lastLoaded = 0;

  return pipeline('text-generation', MODEL_ID, {
    device: dev,
    dtype: dt,
    progress_callback: (p) => {
      try {
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
}

async function loadPipeline(preferGpu) {
  const devices = preferGpu ? ['webgpu', 'wasm'] : ['wasm', 'webgpu'];
  const dtypes = ['q4f16', 'q4'];
  let lastErr = null;

  for (const mirror of MIRRORS) {
    for (const dev of devices) {
      for (const dt of dtypes) {
        for (let retry = 0; retry < 4; retry++) {
          try {
            post({
              type: 'progress',
              status: 'init',
              message: retry ? 'Повтор ' + retry + '/3…' : 'Подключение…',
            });
            console.log('[nyvex-worker] load', MODEL_ID, dev, dt, mirror, 'retry', retry);
            device = dev;
            generator = await tryPipeline(dev, dt, mirror);
            return;
          } catch (err) {
            lastErr = err;
            console.error('[nyvex-worker] failed', dev, dt, mirror, err);
            post({ type: 'progress', status: 'init', message: friendlyError(err) });
            generator = null;
            await sleep(Math.min(6000, 1000 * Math.pow(2, retry)));
          }
        }
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
