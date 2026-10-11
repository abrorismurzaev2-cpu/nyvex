/**
 * NYVEX — core/utils.js
 * Helpers + security utilities
 */

export function $(id) {
  return document.getElementById(id);
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Sanitize display name: letters, spaces, hyphen, apostrophe */
export function sanitizeName(s) {
  return String(s ?? '')
    .replace(/[^\p{L}\p{M}\s\-']/gu, '')
    .trim()
    .slice(0, 30);
}

export function isValidEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e || e.length > 254) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
  // disposable / throwaway domains (basic list)
  const domain = e.split('@')[1] || '';
  const blocked = [
    'tempmail.com', 'temp-mail.org', 'guerrillamail.com', 'mailinator.com',
    '10minutemail.com', 'throwaway.email', 'yopmail.com', 'trashmail.com',
    'fakeinbox.com', 'sharklasers.com', 'getnada.com',
  ];
  if (blocked.some((d) => domain === d || domain.endsWith('.' + d))) return false;
  return true;
}

export function isStrongPassword(p) {
  const s = String(p || '');
  if (s.length < 8) return false;
  if (!/[A-Za-zА-Яа-яЁё]/.test(s)) return false;
  if (!/[0-9]/.test(s)) return false;
  const weak = ['password', '12345678', 'qwerty123', '11111111', 'password1', 'abc12345'];
  if (weak.includes(s.toLowerCase())) return false;
  return true;
}

/** SHA-256 hex — never store plain passwords */
export async function hashPassword(password, salt = 'nyvex-v1') {
  const data = new TextEncoder().encode(salt + ':' + String(password));
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function renderMarkdown(text) {
  let html = escapeHtml(text);
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre>${code.trim()}</pre>`);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return html;
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
}

export function scrollBottom(el, instant = false) {
  if (!el) return;
  if (instant) {
    el.scrollTop = el.scrollHeight;
  } else {
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  }
}

export function safeQuery(root, sel) {
  try {
    return (root || document).querySelector(sel);
  } catch {
    return null;
  }
}

/** Rate-limit helper stored in localStorage */
export function checkLoginThrottle(key = 'nyvex_login_fail') {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { allowed: true, waitMs: 0 };
    const data = JSON.parse(raw);
    if (data.lockedUntil && Date.now() < data.lockedUntil) {
      return { allowed: false, waitMs: data.lockedUntil - Date.now() };
    }
    return { allowed: true, waitMs: 0, fails: data.fails || 0 };
  } catch {
    return { allowed: true, waitMs: 0 };
  }
}

export function recordLoginFail(key = 'nyvex_login_fail') {
  try {
    const cur = checkLoginThrottle(key);
    const fails = (cur.fails || 0) + 1;
    const payload = { fails, lockedUntil: 0 };
    if (fails >= 5) {
      payload.lockedUntil = Date.now() + 5 * 60 * 1000;
      payload.fails = 0;
    }
    localStorage.setItem(key, JSON.stringify(payload));
    return payload;
  } catch {
    return {};
  }
}

export function clearLoginFail(key = 'nyvex_login_fail') {
  try {
    localStorage.removeItem(key);
  } catch {}
}

/** Clear all nyvex_* keys */
export function clearAllNyvexData() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('nyvex_')) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
    return keys.length;
  } catch (e) {
    console.error('clearAllNyvexData', e);
    return 0;
  }
}

/** Validate image magic bytes */
export async function isRealImageFile(file) {
  if (!file || !file.type) return false;
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) return false;
  if (file.size > 3 * 1024 * 1024) return false;
  try {
    const buf = await file.slice(0, 12).arrayBuffer();
    const u = new Uint8Array(buf);
    // JPEG
    if (u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff) return true;
    // PNG
    if (u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47) return true;
    // WEBP (RIFF....WEBP)
    if (u[0] === 0x52 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x46 &&
        u[8] === 0x57 && u[9] === 0x45 && u[10] === 0x42 && u[11] === 0x50) return true;
    return false;
  } catch {
    return false;
  }
}

/** Compress avatar via canvas */
export function compressImageToDataUrl(file, maxSide = 256, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        const scale = Math.min(1, maxSide / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image load failed'));
    };
    img.src = url;
  });
}
