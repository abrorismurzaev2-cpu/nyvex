/**
 * NYVEX — auth/login.js
 * Режим входа переключается в register.js (setMode)
 * Здесь только проверка сессии
 */

import { storage } from '../core/storage.js';

export function hasSession() {
  const u = storage.getUser();
  return !!(u && (u.email || u.name));
}
