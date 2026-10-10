/**
 * Persistence middleware — the ONLY place that writes app state to
 * localStorage. Replaces a dozen scattered `useEffect(() => save(...))` hooks
 * and keeps the stored shape versioned by key.
 */
import { readJson, writeJson } from '../utils/storage';

const COLLECTION_KEYS = ['projects', 'plots', 'bookings', 'payments', 'receipts', 'invoices', 'customers', 'registry'];
const PERSISTED_SLICES = ['auth', 'domain', 'tenants'];

/** Everything the sample (offline) mode keeps; a signed-out browser must hold none of it. */
const CACHED_KEYS = ['session', 'role', 'current_user', 'users', 'collections', 'crud', 'follow_ups', 'tenants', 'client_audit'];
export const wipeLocalCache = () => CACHED_KEYS.forEach((key) => writeJson(key, undefined));

export const createPersistenceMiddleware = () => (store) => (next) => (action) => {
  const result = next(action);
  if (action.type === 'auth/signedOut') {
    wipeLocalCache();
    return result;
  }
  if (!action.type.startsWith('persist/') && shouldPersist(action.type)) {
    const state = store.getState();
    if (state.auth.mode === 'live') {
      // Against the real API the server is the source of truth: keep only the minimal identity needed
      // to restore the screen on reload — never customers, bookings, payments, invoices or the team list.
      writeJson('session', state.auth.session);
      writeJson('role', state.auth.role);
      writeJson('current_user', state.auth.currentUser);
      ['users', 'collections', 'crud', 'follow_ups', 'tenants'].forEach((key) => writeJson(key, undefined));
      return result;
    }
    writeJson('session', state.auth.session);
    writeJson('role', state.auth.role);
    writeJson('current_user', state.auth.currentUser);
    writeJson('users', state.auth.users);
    writeJson('collections', Object.fromEntries(COLLECTION_KEYS.map((key) => [key, state.domain[key]])));
    writeJson('crud', state.domain.crud);
    writeJson('follow_ups', state.domain.followUps);
    writeJson('tenants', state.tenants.items);
  }
  return result;
};

/** Skip high-frequency UI actions (typing in the search box, toggles). */
const TRANSIENT = ['ui/searchChanged', 'ui/sidebarToggled', 'ui/toastPushed', 'ui/toastCleared'];

const shouldPersist = (type) =>
  PERSISTED_SLICES.some((slice) => type.startsWith(`${slice}/`)) && !TRANSIENT.includes(type);

/** Rehydrate a slice state object (used by tests and the store factory). */
export const rehydrate = (key, fallback) => readJson(key, fallback);
