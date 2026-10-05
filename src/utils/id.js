/**
 * Reference-number helpers. All reference numbers are generated in one place so
 * the client preview and the backend agree on the shape (`RCT-2026-0201`).
 */

export const pad4 = (n) => String(n).padStart(4, '0');

/** `BK-2026-0042` — next sequential business reference for a prefix. */
export function nextReference(prefix, existing = [], year = new Date().getFullYear()) {
  const highest = existing.reduce((max, ref) => {
    const value = Number(String(ref).split('-')[2]);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);
  return `${prefix}-${year}-${pad4(highest + 1)}`;
}

/** Uniform id for locally created demo records (crypto.randomUUID in browsers). */
export const newId = () =>
  (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
