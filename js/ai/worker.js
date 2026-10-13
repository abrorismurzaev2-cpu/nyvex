/**
 * NYVEX — ai/worker.js
 * Web: HF + resume fetch. APK: local assets/models (no network).
 */
import { installResumeFetch } from './resume-fetch.js';

installResumeFetch();

let pipeline;
let env;
let MODEL_ID = 'skjortan/MiniCPM5-1B-ONNX';
let generator = null;
let device = 'wasm';
let ready = false;
let useLocal = false;
let localModelPath = './assets/models/';

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
  if (/local|not found|404/i.test(msg)) return 'Локальная модель не найдена в приложении.';
  return msg.slice(0, 180) || 'Не удалось загрузить AI';
}

async function ensureTransformers() {
  if (pipeline) return;
  const mod = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2');
  pipeline = mod.pipeline;
  env = mod.env;
}

function applyEnvLocal() {
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  try {
    env.localModelPath = localModelPath;
  } catch {}
  try {
    env.useBrowserCache = false;
  } catch {}
}

function applyEnvRemote() {
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  try {
    env.useBrowserCache = true;
    env.cacheDir = 'nyvex-model-cache-v2';
  } catch {}
}

async function tryPipeline(dev, dt, remoteHost) {
  await ensureTransformers();
  if (useLocal) applyEnvLocal();
  else {
    applyEnvRemote();
    try {
      if (remoteHost) env.remoteHost = remoteHost;
    } catch {}
  }

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
          if (!total) total = useLocal ? 1 : 900 * 1024 * 1024;
          const now = Date.now();
          const dtSec = Math.max(0.25, (now - lastTs) / 1000);
          const speed = Math.max(0, (loaded - lastLoaded) / dtSec);
          lastTs = now;
          lastLoaded = loaded;
          const pct = total > 0 ? Math.min(99, (loaded / total) * 100) : (useLocal ? 50 : 0);
          const remaining = speed > 0 && total > loaded ? (total - loaded) / speed : 0;
          post({
            type: 'progress',
            status: 'progress',
            loaded,
            total,
            pct: useLocal ? Math.max(pct, 10) : pct,
            speed: useLocal ? 0 : speed,
            eta: useLocal ? 0 : remaining,
            file: String(p.file || '').split('/').pop(),
          });
        } else if (p.status === 'ready') {
          post({ type: 'progress', status: 'ready', message: useLocal ? 'Инициализация локальной модели…' : 'Инициализация…', pct: 99 });
        } else if (p.status === 'done') {
          post({ type: 'progress', status: useLocal ? 'from_cache' : 'from_cache', message: useLocal ? 'Локальная модель' : 'Из кэша', pct: 100 });
        } else if (p.status === 'initiate' || p.status === 'download') {
          post({
            type: 'progress',
            status: 'init',
            message: useLocal
              ? 'Чтение модели из приложения…'
              : p.file
                ? String(p.file).split('/').pop()
                : 'Скачивание…',
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
  // Prefer q4f16 (bundled default), then q4
  const dtypes = ['q4f16', 'q4'];
  let lastErr = null;

  const mirrors = useLocal ? [null] : MIRRORS;

  for (const mirror of mirrors) {
    for (const dev of devices) {
      for (const dt of dtypes) {
        const retries = useLocal ? 2 : 4;
        for (let retry = 0; retry < retries; retry++) {
          try {
            post({
              type: 'progress',
              status: 'init',
              message: useLocal
                ? 'Загрузка AI из приложения…'
                : retry
                  ? 'Повтор ' + retry + '/3…'
                  : 'Подключение…',
            });
            console.log('[nyvex-worker] load', MODEL_ID, dev, dt, useLocal ? 'LOCAL' : mirror, 'retry', retry);
            device = dev;
            generator = await tryPipeline(dev, dt, mirror);
            return;
          } catch (err) {
            lastErr = err;
            console.error('[nyvex-worker] failed', dev, dt, err);
            post({ type: 'progress', status: 'init', message: friendlyError(err) });
            generator = null;
            await sleep(Math.min(4000, 800 * Math.pow(2, retry)));
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
      useLocal = !!data.local;
      if (data.localModelPath) localModelPath = data.localModelPath;
      await loadPipeline(!!data.preferGpu);
      ready = true;
      post({ type: 'loaded', device, id, local: useLocal });
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
    if (type === 'ping') post({ type: 'pong', ready, device, local: useLocal });
  } catch (err) {
    console.error('[nyvex-worker]', err);
    post({ type: 'error', id, message: friendlyError(err) });
  }
};

post({ type: 'boot' });
