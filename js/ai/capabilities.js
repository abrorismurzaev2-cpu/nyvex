/**
 * Device capabilities: SIMD, WebGPU, recommend backend & model tier
 */

export function detectSimd() {
  try {
    // Minimal WASM module that uses SIMD v128.const
    const bytes = new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
    ]);
    return WebAssembly.validate(bytes);
  } catch {
    return false;
  }
}

export function getDeviceCaps() {
  const ram = typeof navigator.deviceMemory === 'number' ? navigator.deviceMemory : 4;
  const threads = Math.min(navigator.hardwareConcurrency || 1, 4);
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  const webgpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
  const simd = detectSimd();
  return { simd, threads, webgpu, memory: ram, isMobile };
}

/**
 * @returns {'webgpu'|'wasm-simd'|'wasm-no-simd'}
 */
export function detectBestBackend() {
  const caps = getDeviceCaps();
  try {
    console.log('[nyvex] Device capabilities:', caps);
  } catch {}

  if (caps.webgpu && caps.memory >= 4 && !caps.isMobile) {
    // WebGPU still often needs SIMD path in ORT; prefer only if SIMD ok
    if (caps.simd) return 'webgpu';
  }
  if (caps.simd) return 'wasm-simd';
  return 'wasm-no-simd';
}

/**
 * Apply env.backends for @xenova/transformers v2 / onnxruntime-web
 */
export function applyOnnxEnv(env, backend) {
  try {
    env.allowLocalModels = false;
    env.allowRemoteModels = true;
    env.useBrowserCache = true;
  } catch {}

  try {
    if (!env.backends) env.backends = {};
    if (!env.backends.onnx) env.backends.onnx = {};
    if (!env.backends.onnx.wasm) env.backends.onnx.wasm = {};

    const wasm = env.backends.onnx.wasm;
    if (backend === 'wasm-no-simd') {
      wasm.simd = false;
      wasm.numThreads = 1;
      wasm.proxy = false;
      // Non-SIMD ORT 1.14
      wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/';
    } else {
      wasm.simd = true;
      wasm.numThreads = Math.min(navigator.hardwareConcurrency || 2, 4);
      wasm.proxy = false;
    }
  } catch (e) {
    console.warn('[nyvex] applyOnnxEnv', e);
  }
  return backend;
}

export function backendLabel(backend) {
  if (backend === 'webgpu') return 'WebGPU';
  if (backend === 'wasm-simd') return 'WASM';
  return 'Режим совместимости · WASM';
}

/**
 * Recommended model id from AVAILABLE_MODELS catalog
 */
export function getRecommendedModelId() {
  const { memory: ram, threads: cores, isMobile, webgpu } = getDeviceCaps();
  if (ram < 4 || cores < 4 || (isMobile && !webgpu)) return 'fast';
  if (ram < 6 || !webgpu) return 'smart';
  return 'smart';
}

export function getRecommendReason() {
  const id = getRecommendedModelId();
  if (id === 'fast') return 'Ваше устройство: рекомендуем «Быструю» модель';
  if (id === 'smart') return 'Ваше устройство: рекомендуем «Умную» модель';
  return 'Ваше устройство: можете использовать любую модель';
}
