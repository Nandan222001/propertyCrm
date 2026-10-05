/**
 * Persistence middleware — the ONLY place that writes app state to
 * localStorage. Replaces a dozen scattered `useEffect(() => save(...))` hooks
 * and keeps the stored shape versioned by key.
 */
import { readJson, writeJson } from '../utils/storage';

const COLLECTION_KEYS = ['projects', 'plots', 'bookings', 'payments', 'receipts', 'customers', 'registry'];
const PERSISTED_SLICES = ['auth', 'domain'];

export const createPersistenceMiddleware = () => (store) => (next) => (action) => {
  const result = next(action);
  if (!action.type.startsWith('persist/') && shouldPersist(action.type)) {
    const state = store.getState();
    writeJson('session', state.auth.session);
    writeJson('role', state.auth.role);
    writeJson('current_user', state.auth.currentUser);
    writeJson('users', state.auth.users);
    writeJson('collections', Object.fromEntries(COLLECTION_KEYS.map((key) => [key, state.domain[key]])));
    writeJson('crud', state.domain.crud);
    writeJson('follow_ups', state.domain.followUps);
  }
  return result;
};

/** Skip high-frequency UI actions (typing in the search box, toggles). */
const TRANSIENT = ['ui/searchChanged', 'ui/sidebarToggled', 'ui/toastPushed', 'ui/toastCleared'];

const shouldPersist = (type) =>
  PERSISTED_SLICES.some((slice) => type.startsWith(`${slice}/`)) && !TRANSIENT.includes(type);

/** Rehydrate a slice state object (used by tests and the store factory). */
export const rehydrate = (key, fallback) => readJson(key, fallback);
