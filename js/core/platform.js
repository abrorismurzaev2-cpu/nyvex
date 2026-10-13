/**
 * NYVEX — detect Capacitor / native APK
 */
export function isNativeApp() {
  try {
    return !!(
      window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform()
    );
  } catch {
    return false;
  }
}

/** Relative root for bundled HF-style models inside APK web assets */
export const BUNDLED_MODEL_ROOT = './assets/models/';

/** Same MODEL_ID as HF — folder under BUNDLED_MODEL_ROOT */
export const BUNDLED_MODEL_ID = 'skjortan/MiniCPM5-1B-ONNX';

/**
 * Probe if config.json of bundled model is reachable (APK only useful).
 */
export async function hasBundledModel() {
  if (!isNativeApp()) return false;
  try {
    const url = BUNDLED_MODEL_ROOT + BUNDLED_MODEL_ID + '/config.json';
    const r = await fetch(url, { method: 'GET', cache: 'force-cache' });
    if (!r.ok) return false;
    const j = await r.json().catch(() => null);
    return !!(j && (j.model_type || j.architectures));
  } catch (e) {
    console.warn('[nyvex] bundled model probe', e);
    return false;
  }
}
