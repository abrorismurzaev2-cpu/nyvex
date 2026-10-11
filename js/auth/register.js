/**
 * NYVEX — auth/register.js
 * Hardened validation, hashed password, throttled login
 */

import { storage } from '../core/storage.js';
import { toast } from '../core/toast.js';
import {
  $,
  isValidEmail,
  isStrongPassword,
  sanitizeName,
  hashPassword,
  checkLoginThrottle,
  recordLoginFail,
  clearLoginFail,
  clearAllNyvexData,
  isRealImageFile,
  compressImageToDataUrl,
} from '../core/utils.js';
import { LIMITS, MIN_AGE, TRIAL_DAYS } from '../core/config.js';
import { showScreen } from '../core/router.js';
import { loadUserUI } from './profile.js';
import { ensureTrialOnUser } from '../core/trial.js';

let onEnterApp = null;
export function setEnterAppCallback(fn) {
  onEnterApp = typeof fn === 'function' ? fn : null;
}

let pendingAvatar = null;
let isRegister = true;
let submitting = false;

export function initAuth() {
  const avatarCircle = $('avatarCircle');
  const avatarInput = $('avatarInput');
  const switchBtn = $('switchBtn');
  const authBtn = $('authBtn');

  if (avatarCircle && avatarInput) {
    avatarCircle.addEventListener('click', () => avatarInput.click());
    avatarInput.addEventListener('change', onAvatarChange);
  }

  switchBtn?.addEventListener('click', () => setMode(!isRegister));

  ['name', 'email', 'password'].forEach((id) => {
    const el = $(id);
    el?.addEventListener('input', () => {
      el.closest('.field')?.classList.remove('error');
    });
    el?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        authBtn?.click();
      }
    });
  });

  authBtn?.addEventListener('click', onAuthSubmit);
  setMode(true);
}

async function onAvatarChange(e) {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    const ok = await isRealImageFile(f);
    if (!ok) {
      toast('Только JPEG/PNG/WebP до 3 МБ');
      e.target.value = '';
      return;
    }
    pendingAvatar = await compressImageToDataUrl(f);
    const preview = $('avatarPreview');
    const ph = $('avPlaceholder');
    const circle = $('avatarCircle');
    if (preview) {
      preview.src = pendingAvatar;
      preview.style.display = 'block';
    }
    if (ph) ph.style.display = 'none';
    circle?.classList.add('filled');
  } catch (err) {
    console.error('avatar', err);
    toast('Не удалось обработать изображение');
  }
}

export function setMode(register) {
  isRegister = register;
  const authTitle = $('authTitle');
  const authSub = $('authSub');
  const authBtnText = $('authBtnText');
  const switchText = $('switchText');
  const switchBtn = $('switchBtn');
  const regFields = document.querySelectorAll('[data-reg]');

  if (register) {
    if (authTitle) authTitle.innerHTML = 'Добро пожаловать в <span>NYVEX</span>';
    if (authSub) authSub.textContent = 'Загрузите фото и укажите имя — они будут в чате.';
    if (authBtnText) authBtnText.textContent = 'Создать аккаунт';
    if (switchText) switchText.textContent = 'Уже есть аккаунт?';
    if (switchBtn) switchBtn.textContent = 'Войти';
    regFields.forEach((f) => {
      f.style.display = '';
    });
  } else {
    if (authTitle) authTitle.innerHTML = 'Вход в <span>NYVEX</span>';
    if (authSub) authSub.textContent = 'Войдите, чтобы продолжить работу.';
    if (authBtnText) authBtnText.textContent = 'Войти';
    if (switchText) switchText.textContent = 'Нет аккаунта?';
    if (switchBtn) switchBtn.textContent = 'Зарегистрироваться';
    regFields.forEach((f) => {
      f.style.display = 'none';
    });
  }
  document.querySelectorAll('.field.error').forEach((f) => f.classList.remove('error'));
  document.querySelectorAll('.checkbox-row.error').forEach((f) => f.classList.remove('error'));
}

function setErr(id) {
  $(id)?.classList.add('error');
}

async function onAuthSubmit() {
  if (submitting) return;
  const nameEl = $('name');
  const emailEl = $('email');
  const passEl = $('password');
  const authBtn = $('authBtn');
  const authBtnText = $('authBtnText');
  const agreeTerms = $('agreeTerms');
  const agreeAge = $('agreeAge');

  let valid = true;

  if (!isRegister) {
    const thr = checkLoginThrottle();
    if (!thr.allowed) {
      const min = Math.ceil(thr.waitMs / 60000);
      toast(`Слишком много попыток. Подождите ~${min} мин.`);
      return;
    }
  }

  if (isRegister) {
    if (!pendingAvatar) {
      toast('Загрузите фото профиля');
      valid = false;
    }
    const name = sanitizeName(nameEl?.value || '');
    if (!name || name.length < LIMITS.nameMin) {
      setErr('f-name');
      valid = false;
    }
    if (!isValidEmail(emailEl?.value)) {
      setErr('f-email');
      valid = false;
    }
    if (!isStrongPassword(passEl?.value)) {
      setErr('f-pass');
      toast('Пароль: мин. 8 символов, буква и цифра');
      valid = false;
    }
    if (!agreeTerms?.checked) {
      agreeTerms?.closest('.checkbox-row')?.classList.add('error');
      toast('Примите Условия и Политику');
      valid = false;
    }
    if (!agreeAge?.checked) {
      agreeAge?.closest('.checkbox-row')?.classList.add('error');
      toast(`Подтвердите возраст ${MIN_AGE}+`);
      valid = false;
    }
  } else {
    if (!isValidEmail(emailEl?.value)) {
      setErr('f-email');
      valid = false;
    }
    if (!passEl || passEl.value.length < 1) {
      setErr('f-pass');
      valid = false;
    }
  }

  if (!valid) return;

  submitting = true;
  authBtn?.classList.add('loading');
  if (authBtn) authBtn.disabled = true;
  if (authBtnText) authBtnText.textContent = isRegister ? 'Создаём...' : 'Входим...';

  try {
    const email = emailEl.value.trim().toLowerCase();
    const passHash = await hashPassword(passEl.value);

    if (isRegister) {
      const now = Date.now();
      const name = sanitizeName(nameEl.value);
      storage.setUser(
        ensureTrialOnUser({
          email,
          name,
          avatar: pendingAvatar,
          // store hash only — never plain password
          passwordHash: passHash,
          plan: 'trial',
          createdAt: now,
          trialStart: now,
          trialEnd: now + TRIAL_DAYS * 24 * 60 * 60 * 1000,
          agreedTerms: true,
          ageConfirmed: true,
        })
      );
      clearLoginFail();
      toast('Аккаунт создан');
    } else {
      const existing = storage.getUser();
      if (!existing || String(existing.email || '').toLowerCase() !== email) {
        recordLoginFail();
        toast('Неверный email или пароль');
        return;
      }
      // Migration: old users without hash — accept once and set hash
      if (existing.passwordHash) {
        if (existing.passwordHash !== passHash) {
          recordLoginFail();
          toast('Неверный email или пароль');
          return;
        }
      } else {
        existing.passwordHash = passHash;
        storage.setUser(existing);
      }
      clearLoginFail();
      toast('С возвращением!');
    }

    loadUserUI();
    if (onEnterApp) onEnterApp();
    else showScreen('app');
  } catch (e) {
    console.error('auth', e);
    toast('Ошибка сохранения');
  } finally {
    submitting = false;
    authBtn?.classList.remove('loading');
    if (authBtn) authBtn.disabled = false;
    if (authBtnText) authBtnText.textContent = isRegister ? 'Создать аккаунт' : 'Войти';
  }
}

export function logout() {
  try {
    // remove session user only; keep chats optional — clear user
    storage.removeUser();
  } catch {}
  showScreen('auth');
  setMode(true);
  toast('Вы вышли');
}

/** Full wipe: all nyvex_* keys */
export function deleteAccountData() {
  const n = clearAllNyvexData();
  pendingAvatar = null;
  showScreen('auth');
  setMode(true);
  return n;
}
