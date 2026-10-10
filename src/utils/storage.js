/**
 * localStorage access with a single try/catch (Safari private mode throws) and
 * one namespace, so no component ever touches `window.localStorage` directly.
 */

const PREFIX = 'lalita_erp:';

export const storageKey = (key) => `${PREFIX}${key}`;

export function readJson(key, fallback = null) {
  try {
    const raw = window.localStorage.getItem(storageKey(key));
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    if (value === undefined) window.localStorage.removeItem(storageKey(key));
    else window.localStorage.setItem(storageKey(key), JSON.stringify(value));
  } catch {
    /* storage disabled — the Redux store keeps working in memory */
  }
}

export function readText(key, fallback = '') {
  try {
    return window.localStorage.getItem(storageKey(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeText(key, value) {
  try {
    if (!value) window.localStorage.removeItem(storageKey(key));
    else window.localStorage.setItem(storageKey(key), String(value));
  } catch {
    /* storage disabled */
  }
}

/**
 * Tab-scoped storage for credentials: gone when the tab closes, never shared with other tabs or
 * left on disk (unlike localStorage), which limits what a stray script or a shared PC can reach.
 */
export function readSession(key, fallback = '') {
  try {
    return window.sessionStorage.getItem(storageKey(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeSession(key, value) {
  try {
    if (!value) window.sessionStorage.removeItem(storageKey(key));
    else window.sessionStorage.setItem(storageKey(key), String(value));
  } catch {
    /* storage disabled */
  }
}

/** Remove every key this app owns (used on sign-out and by tests). */
export function clearStorage() {
  try {
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => window.localStorage.removeItem(k));
    Object.keys(window.sessionStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => window.sessionStorage.removeItem(k));
  } catch {
    /* storage disabled */
  }
}
