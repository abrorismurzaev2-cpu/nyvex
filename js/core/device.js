/**
 * NYVEX — device fingerprint ID
 */
function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  let result = '';
  for (let i = 0; i < length; i++) result += chars[array[i] % chars.length];
  return result;
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function formatDeviceId(hash) {
  const upper = hash.slice(0, 12).toUpperCase();
  return 'NYVX-' + upper.slice(0, 4) + '-' + upper.slice(4, 8) + '-' + upper.slice(8, 12);
}

export async function getDeviceId() {
  try {
    const stored = localStorage.getItem('nyvex_device_id');
    if (stored) return stored;
  } catch {}

  const parts = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    String(screen.colorDepth),
    String(new Date().getTimezoneOffset()),
    String(navigator.hardwareConcurrency || 'unknown'),
    String(navigator.deviceMemory || 'unknown'),
    navigator.platform || '',
    String(navigator.maxTouchPoints || 0),
  ];

  let salt;
  try {
    salt = localStorage.getItem('nyvex_device_salt');
  } catch {
    salt = null;
  }
  if (!salt) {
    salt = generateRandomString(32);
    try {
      localStorage.setItem('nyvex_device_salt', salt);
    } catch {}
  }
  parts.push(salt);

  const hash = await sha256(parts.join('|'));
  const deviceId = formatDeviceId(hash);
  try {
    localStorage.setItem('nyvex_device_id', deviceId);
  } catch {}
  return deviceId;
}
