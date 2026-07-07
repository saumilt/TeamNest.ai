/**
 * safeStorage — small audited wrapper around localStorage for UI-state flags
 * (theme, PWA install banner, cross-sell dismissals). Centralizes the
 * try/catch boilerplate, validates values on read so a tampered localStorage
 * can't crash the app, and namespaces every key under the `tn:` prefix.
 *
 * Sensitive data (auth tokens, PII, business records) MUST NOT use this — auth
 * lives in HttpOnly cookies and business data in the backend. This module is
 * for non-secret, ephemeral UI preferences only.
 */

const NS = "tn:";

function _hasLocalStorage() {
  if (typeof window === "undefined") return false;
  try {
    // Some browsers throw on .localStorage access in private mode.
    return !!window.localStorage;
  } catch {
    return false;
  }
}

/**
 * Read a string value. Returns `fallback` (default null) on any error or if
 * the value fails the optional validator predicate. The validator is the
 * primary tamper defense — callers should narrow to expected shapes.
 *
 *   safeStorage.get("theme", { fallback: "dark", validator: v => v === "dark" || v === "light" })
 */
function get(key, { fallback = null, validator } = {}) {
  if (!_hasLocalStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(NS + key);
    if (raw == null) return fallback;
    if (validator && !validator(raw)) return fallback;
    return raw;
  } catch {
    return fallback;
  }
}

/**
 * Parse a stored number with finite-check tamper defense. Returns `fallback`
 * on any read/parse error.
 */
function getNumber(key, fallback = 0) {
  const raw = get(key);
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Write a string value. Silently no-ops on QuotaExceeded / SecurityError so
 * a failure in private mode never breaks the calling component.
 */
function set(key, value) {
  if (!_hasLocalStorage()) return false;
  try {
    window.localStorage.setItem(NS + key, String(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key) {
  if (!_hasLocalStorage()) return;
  try { window.localStorage.removeItem(NS + key); } catch { /* ignore */ }
}

const safeStorage = { get, getNumber, set, remove };
export default safeStorage;
