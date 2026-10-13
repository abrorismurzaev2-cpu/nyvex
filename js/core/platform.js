/**
 * NYVEX — platform helpers (Capacitor APK vs web)
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

/** @deprecated always false — models download from HF */
export async function hasBundledModel() {
  return false;
}

export const BUNDLED_MODEL_ROOT = '';
export const BUNDLED_MODEL_ID = '';
