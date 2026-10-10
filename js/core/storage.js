/**
 * NYVEX — core/storage.js
 * Безопасная обёртка над localStorage
 */

import { STORAGE_KEYS } from './config.js';

function safeGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function safeRemove(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export const storage = {
  getUser() {
    return safeGet(STORAGE_KEYS.USER, null);
  },

  setUser(user) {
    return safeSet(STORAGE_KEYS.USER, user);
  },

  removeUser() {
    return safeRemove(STORAGE_KEYS.USER);
  },

  getChats() {
    return safeGet(STORAGE_KEYS.CHATS, {}) || {};
  },

  setChats(chats) {
    return safeSet(STORAGE_KEYS.CHATS, chats);
  },

  getSettings() {
    return safeGet(STORAGE_KEYS.SETTINGS, {
      history: true,
      animations: true,
    });
  },

  setSettings(settings) {
    return safeSet(STORAGE_KEYS.SETTINGS, settings);
  },

  getCookieConsent() {
    return safeGet(STORAGE_KEYS.COOKIE_CONSENT, null);
  },

  setCookieConsent(value) {
    return safeSet(STORAGE_KEYS.COOKIE_CONSENT, value);
  },
};
