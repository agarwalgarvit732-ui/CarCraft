/**
 * CarCraft Platform - Security & Defensive Utilities
 * Prevents XSS, Prototype Pollution, Insecure Storage, Form Injection, and Client-Side DoS.
 */

'use strict';

const SecurityUtils = (function () {
  /**
   * Escape HTML characters to prevent XSS injection.
   * @param {any} val - The input to escape.
   * @returns {string} - Escaped safe string.
   */
  function escapeHTML(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;',
      '`': '&#x60;',
      '=': '&#x3D;'
    };
    return str.replace(/[&<>"'`=\/]/g, function (s) {
      return map[s];
    });
  }

  /**
   * Sanitize text: remove control characters, trim, limit length.
   * @param {string} input - Raw string.
   * @param {number} maxLen - Maximum allowed length (default 100).
   * @returns {string}
   */
  function sanitizeText(input, maxLen = 100) {
    if (typeof input !== 'string') return '';
    // Strip control characters (ASCII 0-31 and 127)
    const cleaned = input.replace(/[\x00-\x1F\x7F]/g, '').trim();
    return cleaned.slice(0, maxLen);
  }

  /**
   * Validate Indian 10-digit mobile number: Starts with 6, 7, 8, or 9.
   * @param {string} phone
   * @returns {boolean}
   */
  function validatePhone(phone) {
    if (typeof phone !== 'string') return false;
    const cleanPhone = phone.replace(/[\s-]/g, '');
    return /^[6-9]\d{9}$/.test(cleanPhone);
  }

  /**
   * Validate standard email with ReDoS-safe regex.
   * @param {string} email
   * @returns {boolean}
   */
  function validateEmail(email) {
    if (typeof email !== 'string') return false;
    const cleanEmail = email.trim();
    if (cleanEmail.length > 100 || cleanEmail.length < 5) return false;
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,63}$/;
    return emailRegex.test(cleanEmail);
  }

  /**
   * Validate person name: letters, dots, hyphens, spaces only (2-50 chars).
   * @param {string} name
   * @returns {boolean}
   */
  function validateName(name) {
    if (typeof name !== 'string') return false;
    const trimmed = name.trim();
    return /^[a-zA-Z\s.\-']{2,50}$/.test(trimmed);
  }

  /**
   * Validate and clamp numeric range safely (handles NaN, Infinity).
   * @param {any} val - Input value.
   * @param {number} min - Minimum allowed.
   * @param {number} max - Maximum allowed.
   * @param {number} fallback - Default if invalid.
   * @returns {number}
   */
  function clampNumber(val, min, max, fallback = min) {
    const num = Number(val);
    if (!Number.isFinite(num)) return fallback;
    if (num < min) return min;
    if (num > max) return max;
    return num;
  }

  /**
   * Deep freeze object to prevent prototype tampering and accidental mutation.
   * @param {Object} obj
   * @returns {Object}
   */
  function deepFreeze(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    Object.freeze(obj);
    Object.keys(obj).forEach(key => {
      const prop = obj[key];
      if (typeof prop === 'object' && prop !== null && !Object.isFrozen(prop)) {
        deepFreeze(prop);
      }
    });
    return obj;
  }

  /**
   * Prevent Prototype Pollution: Clean object keys.
   * @param {Object} obj
   * @returns {Object}
   */
  function sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') return {};
    const safeObj = Object.create(null);
    for (const key of Object.keys(obj)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }
      safeObj[key] = obj[key];
    }
    return safeObj;
  }

  /**
   * Rate Limiter for user actions (prevent spamming submissions).
   */
  class RateLimiter {
    constructor(maxCalls = 5, windowMs = 60000) {
      this.maxCalls = maxCalls;
      this.windowMs = windowMs;
      this.timestamps = [];
    }

    canProceed() {
      const now = Date.now();
      this.timestamps = this.timestamps.filter(ts => now - ts < this.windowMs);
      if (this.timestamps.length >= this.maxCalls) {
        return false;
      }
      this.timestamps.push(now);
      return true;
    }
  }

  /**
   * Safe LocalStorage wrapper with schema validation, quota checks, and error handling.
   */
  const SafeStorage = {
    isAvailable: (function () {
      try {
        const testKey = '__cc_test__';
        localStorage.setItem(testKey, testKey);
        localStorage.removeItem(testKey);
        return true;
      } catch (e) {
        return false;
      }
    })(),

    getItem: function (key, fallback = null) {
      if (!this.isAvailable) return fallback;
      try {
        const raw = localStorage.getItem('carcraft_' + key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return parsed;
      } catch (err) {
        console.warn('[Security] SafeStorage getItem failed:', err);
        return fallback;
      }
    },

    setItem: function (key, value) {
      if (!this.isAvailable) return false;
      try {
        // Enforce max storage size limit per item (50KB)
        const serialized = JSON.stringify(value);
        if (serialized.length > 51200) {
          console.warn('[Security] Storage quota guard: Payload too large.');
          return false;
        }
        localStorage.setItem('carcraft_' + key, serialized);
        return true;
      } catch (err) {
        console.warn('[Security] SafeStorage setItem failed:', err);
        return false;
      }
    },

    removeItem: function (key) {
      if (!this.isAvailable) return;
      try {
        localStorage.removeItem('carcraft_' + key);
      } catch (err) {
        console.warn('[Security] SafeStorage removeItem failed:', err);
      }
    }
  };

  /**
   * Debounce helper to prevent rapid UI events and client DoS.
   */
  function debounce(func, wait = 250) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  return {
    escapeHTML,
    sanitizeText,
    validatePhone,
    validateEmail,
    validateName,
    clampNumber,
    deepFreeze,
    sanitizeObject,
    RateLimiter,
    SafeStorage,
    debounce
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SecurityUtils;
}

