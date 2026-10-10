/**
 * NYVEX — core/toast.js
 * Уведомления
 */

let toastEl = null;
let timer = null;

export function initToast() {
  toastEl = document.getElementById('toast');
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'toast';
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
}

export function toast(msg, duration = 2200) {
  if (!toastEl) initToast();
  if (!toastEl) return;
  toastEl.textContent = String(msg || '');
  toastEl.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(() => {
    toastEl.classList.remove('show');
  }, duration);
}
