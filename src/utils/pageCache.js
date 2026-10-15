/**
 * Remembers what a page fetched for itself (agents, commissions, …) so that coming back to it shows the
 * numbers straight away and refreshes quietly; "Loading…" is only for data that has never arrived.
 * Emptied whenever someone signs in or out, so one organisation's figures never reach another.
 */
const store = new Map();
export const pageCache = {
  get: (key) => store.get(key),
  has: (key) => store.has(key),
  set: (key, value) => { store.set(key, value); return value; },
  clear: () => store.clear(),
};
