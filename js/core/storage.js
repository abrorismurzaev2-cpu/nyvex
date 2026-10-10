/**
 * NYVEX — core/storage.js
 */
import { STORAGE_KEYS } from './config.js';

function safeGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.error('storage.get', key, e);
    return fallback;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error('storage.set', key, e);
    try {
      // quota fallback: drop chats and retry once
      if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
        localStorage.removeItem(STORAGE_KEYS.CHATS);
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      }
    } catch (e2) {
      console.error('storage.set retry', e2);
    }
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
    return safeGet(STORAGE_KEYS.SETTINGS, { history: true, animations: true }) || {
      history: true,
      animations: true,
    };
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
  getModelPref() {
    return safeGet(STORAGE_KEYS.MODEL_PREF, null);
  },
  setModelPref(pref) {
    return safeSet(STORAGE_KEYS.MODEL_PREF, pref);
  },
  getTrialNoticeDay() {
    return safeGet(STORAGE_KEYS.TRIAL_NOTICE, null);
  },
  setTrialNoticeDay(dayKey) {
    return safeSet(STORAGE_KEYS.TRIAL_NOTICE, dayKey);
  },
};
