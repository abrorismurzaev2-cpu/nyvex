/**
 * NYVEX — auth/register.js
 */

import { storage } from '../core/storage.js';
import { toast } from '../core/toast.js';
import { $, escapeHtml } from '../core/utils.js';
import { EMAIL_RE, LIMITS, MIN_AGE } from '../core/config.js';
import { showScreen } from '../core/router.js';
import { loadUserUI } from './profile.js';

/** Callback after successful auth — set from main.js to avoid circular import */
let onEnterApp = null;
export function setEnterAppCallback(fn) {
  onEnterApp = typeof fn === 'function' ? fn : null;
}

let pendingAvatar = null;
let isRegister = true;

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
      const field = el.closest('.field');
      field?.classList.remove('error');
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

function onAvatarChange(e) {
  const f = e.target.files?.[0];
  if (!f) return;
  if (!f.type.startsWith('image/')) {
    toast('Выберите изображение');
    return;
  }
  if (f.size > LIMITS.avatarMaxBytes) {
    toast('Максимум 3 МБ');
    return;
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    pendingAvatar = ev.target.result;
    const preview = $('avatarPreview');
    const ph = $('avPlaceholder');
    const circle = $('avatarCircle');
    if (preview) {
      preview.src = pendingAvatar;
      preview.style.display = 'block';
    }
    if (ph) ph.style.display = 'none';
    circle?.classList.add('filled');
  };
  reader.onerror = () => toast('Не удалось прочитать файл');
  reader.readAsDataURL(f);
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
    regFields.forEach((f) => { f.style.display = ''; });
  } else {
    if (authTitle) authTitle.innerHTML = 'Вход в <span>NYVEX</span>';
    if (authSub) authSub.textContent = 'Войдите, чтобы продолжить работу.';
    if (authBtnText) authBtnText.textContent = 'Войти';
    if (switchText) switchText.textContent = 'Нет аккаунта?';
    if (switchBtn) switchBtn.textContent = 'Зарегистрироваться';
    regFields.forEach((f) => { f.style.display = 'none'; });
  }
  document.querySelectorAll('.field.error').forEach((f) => f.classList.remove('error'));
  document.querySelectorAll('.checkbox-row.error').forEach((f) => f.classList.remove('error'));
}

function setErr(id) {
  $(id)?.classList.add('error');
}

async function onAuthSubmit() {
  const nameEl = $('name');
  const emailEl = $('email');
  const passEl = $('password');
  const authBtn = $('authBtn');
  const authBtnText = $('authBtnText');
  const agreeTerms = $('agreeTerms');
  const agreeAge = $('agreeAge');

  let valid = true;

  if (isRegister) {
    if (!pendingAvatar) {
      toast('Загрузите фото профиля');
      valid = false;
    }
    if (!nameEl || nameEl.value.trim().length < LIMITS.nameMin) {
      setErr('f-name');
      valid = false;
    }
    if (!emailEl || !EMAIL_RE.test(emailEl.value.trim())) {
      setErr('f-email');
      valid = false;
    }
    if (!passEl || passEl.value.length < LIMITS.passwordMin) {
      setErr('f-pass');
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
    if (!emailEl || !EMAIL_RE.test(emailEl.value.trim())) {
      setErr('f-email');
      valid = false;
    }
    if (!passEl || passEl.value.length < 1) {
      setErr('f-pass');
      valid = false;
    }
  }

  if (!valid) return;

  authBtn?.classList.add('loading');
  if (authBtn) authBtn.disabled = true;
  if (authBtnText) authBtnText.textContent = isRegister ? 'Создаём...' : 'Входим...';

  await new Promise((r) => setTimeout(r, 400));

  try {
    if (isRegister) {
      storage.setUser({
        email: emailEl.value.trim(),
        name: nameEl.value.trim().slice(0, LIMITS.nameMax),
        avatar: pendingAvatar,
        plan: 'pro',
        createdAt: Date.now(),
        agreedTerms: true,
        ageConfirmed: true,
      });
    } else {
      const existing = storage.getUser();
      if (!existing) {
        storage.setUser({
          email: emailEl.value.trim(),
          name: emailEl.value.trim().split('@')[0],
          avatar: null,
          plan: 'pro',
          createdAt: Date.now(),
        });
      }
    }
  } catch {
    toast('Ошибка сохранения');
  }

  authBtn?.classList.remove('loading');
  if (authBtn) authBtn.disabled = false;
  if (authBtnText) authBtnText.textContent = isRegister ? 'Создать аккаунт' : 'Войти';

  toast(isRegister ? 'Аккаунт создан' : 'С возвращением!');
  loadUserUI();
  if (onEnterApp) onEnterApp();
  else showScreen('app');
}

export function logout() {
  storage.removeUser();
  showScreen('auth');
  setMode(true);
  toast('Вы вышли');
}
