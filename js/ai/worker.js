/**
 * NYVEX — ai/worker.js
 * @xenova/transformers@2.17.2 + optional non-SIMD ORT 1.14
 */
import { installResumeFetch } from './resume-fetch.js';

installResumeFetch();

let pipeline;
let env;
let MODEL_ID = 'Xenova/Qwen1.5-0.5B-Chat';
let DTYPE = 'q4';
let generator = null;
let device = 'wasm';
let ready = false;
let backend = 'wasm-no-simd';

const MIRRORS = ['https://huggingface.co', 'https://hf-mirror.com'];

function post(msg) {
  self.postMessage(msg);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function detectSimd() {
  try {
    const bytes = new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
    ]);
    return WebAssembly.validate(bytes);
  } catch {
    return false;
  }
}

function friendlyError(err) {
  const msg = String(err?.message || err || '');
  if (/SIMD|simd/i.test(msg)) {
    return 'Устройство без SIMD — включён режим совместимости. Повторите загрузку.';
  }
  if (/network|fetch|Failed to fetch|Load failed|TypeError|HTTP /i.test(msg)) {
    return 'Ошибка сети при загрузке AI. Проверьте интернет / Wi‑Fi и повторите.';
  }
  if (/CORS|cross-origin/i.test(msg)) return 'Ошибка доступа к модели. Обновите страницу.';
  if (/memory|out of memory|OOM/i.test(msg)) {
    return 'Недостаточно памяти. Закройте другие вкладки или выберите модель «Быстрая».';
  }
  if (/WebGPU/i.test(msg)) return 'WebGPU недоступен, пробуем WASM…';
  if (/no available backend/i.test(msg)) {
    return 'Нет подходящего backend. Включён режим совместимости без SIMD.';
  }
  return msg.slice(0, 180) || 'Не удалось загрузить AI';
}

function messagesToPrompt(messages) {
  const lines = [];
  for (const m of messages || []) {
    const role = m.role || 'user';
    const content = typeof m.content === 'string' ? m.content : '';
    if (role === 'system') lines.push(content);
    else if (role === 'user') lines.push('User: ' + content);
    else if (role === 'assistant') lines.push('Assistant: ' + content);
  }
  lines.push('Assistant:');
  return lines.join('\n');
}

function extractReply(output, prompt) {
  let reply = '';
  try {
    if (Array.isArray(output) && output[0]?.generated_text != null) {
      const gen = output[0].generated_text;
      if (typeof gen === 'string') {
        reply = gen;
        if (prompt && reply.startsWith(prompt)) reply = reply.slice(prompt.length);
      } else if (Array.isArray(gen)) {
        const last = gen[gen.length - 1];
        reply = typeof last === 'string' ? last : last?.content || '';
      }
    } else if (typeof output === 'string') {
      reply = output;
    }
  } catch {}
  reply = String(reply || '')
    .replace(/^Assistant:\s*/i, '')
    .replace(/^[:\s]+/, '')
    .trim();
  // take last assistant turn if multi
  const parts = reply.split(/(?:^|\n)Assistant:\s*/i);
  if (parts.length > 1) reply = parts[parts.length - 1].trim();
  const userIdx = reply.search(/\nUser:\s*/i);
  if (userIdx > 0) reply = reply.slice(0, userIdx).trim();
  return reply;
}

async function ensureTransformers() {
  if (pipeline) return;
  const mod = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
  pipeline = mod.pipeline;
  env = mod.env;

  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.useBrowserCache = true;
  try {
    env.cacheDir = 'nyvex-model-cache-v3';
  } catch {}

  // Always prefer non-SIMD ORT 1.14 — works on Samsung A15 / WebView / older Chrome
  const simd = detectSimd();
  backend = 'wasm-no-simd';

  try {
    if (!env.backends) env.backends = {};
    if (!env.backends.onnx) env.backends.onnx = {};
    if (!env.backends.onnx.wasm) env.backends.onnx.wasm = {};
    const wasm = env.backends.onnx.wasm;
    wasm.simd = false;
    wasm.numThreads = 1;
    wasm.proxy = false;
    wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/';
  } catch (e) {
    console.warn('[nyvex-worker] onnx env', e);
  }

  post({
    type: 'progress',
    status: 'init',
    message: simd ? 'WASM · совместимость' : 'Режим совместимости · WASM',
    pct: 1,
  });
}

async function tryPipeline(remoteHost) {
  await ensureTransformers();
  try {
    if (remoteHost) env.remoteHost = remoteHost;
  } catch {}

  const progressMap = {};
  let lastTs = Date.now();
  let lastLoaded = 0;

  // v2: quantized defaults; no device/dtype like v3
  return pipeline('text-generation', MODEL_ID, {
    quantized: true,
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
          if (!total) total = 350 * 1024 * 1024;
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

async function loadPipeline() {
  let lastErr = null;
  for (const mirror of MIRRORS) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        post({
          type: 'progress',
          status: 'init',
          message: attempt ? ('Повтор ' + (attempt + 1) + '/5…') : 'Загрузка AI…',
          pct: Math.min(5, 1 + attempt),
        });
        generator = await tryPipeline(mirror);
        device = backend === 'wasm-no-simd' ? 'WASM-compat' : 'WASM';
        return;
      } catch (err) {
        lastErr = err;
        console.error('[nyvex-worker] load attempt', mirror, attempt + 1, err);
        const msg = String(err?.message || err || '');
        if (/SIMD|no available backend/i.test(msg) && env?.backends?.onnx?.wasm) {
          try {
            env.backends.onnx.wasm.simd = false;
            env.backends.onnx.wasm.numThreads = 1;
            env.backends.onnx.wasm.wasmPaths =
              'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/';
            backend = 'wasm-no-simd';
          } catch {}
        }
        await sleep(Math.min(20000, Math.pow(2, attempt) * 1000));
      }
    }
  }
  throw lastErr || new Error('Не удалось загрузить AI. Проверьте интернет и Wi‑Fi.');
}

self.onmessage = async (e) => {
  const data = e.data || {};
  const { type, id } = data;
  try {
    if (type === 'load') {
      if (data.modelId) MODEL_ID = data.modelId;
      if (data.dtype) DTYPE = data.dtype;
      await loadPipeline();
      ready = true;
      post({ type: 'loaded', device, id, modelId: MODEL_ID, backend });
      return;
    }
    if (type === 'generate') {
      if (!ready || !generator) {
        post({ type: 'error', id, message: 'AI не загружен' });
        return;
      }
      const messages = Array.isArray(data.messages) ? data.messages : [];
      const opts = data.options || {};
      const prompt = messagesToPrompt(messages);
      const genPromise = generator(prompt, {
        max_new_tokens: Math.min(opts.max_new_tokens || 120, 200),
        temperature: opts.temperature ?? 0.5,
        top_p: opts.top_p ?? 0.85,
        top_k: opts.top_k ?? 40,
        do_sample: true,
        repetition_penalty: opts.repetition_penalty ?? 1.05,
        return_full_text: false,
      });
      const timeoutMs = 45000;
      const output = await Promise.race([
        genPromise,
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error('AI не отвечает. Попробуйте ещё раз.')), timeoutMs)
        ),
      ]);
      let reply = extractReply(output, prompt);
      if (!reply || reply.length < 1) {
        reply = 'Не удалось получить ответ. Попробуйте переформулировать.';
      }
      post({ type: 'result', id, text: reply.trim() });
      return;
    }
    if (type === 'ping') post({ type: 'pong', ready, device, modelId: MODEL_ID, backend });
  } catch (err) {
    console.error('[nyvex-worker]', err);
    post({ type: 'error', id, message: friendlyError(err) });
  }
};

post({ type: 'boot' });
