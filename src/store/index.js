/**
 * Redux store factory. One store for the whole SPA:
 *   auth   → session, role, team directory
 *   domain → ERP master data
 *   ui     → shell/navigation/modal state
 *   tenants→ platform console (super admin): organisations
 */
import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import authReducer from './slices/authSlice';
import domainReducer from './slices/domainSlice';
import notificationsReducer from './slices/notificationsSlice';
import tenantsReducer from './slices/tenantsSlice';
import uiReducer from './slices/uiSlice';
import { createPersistenceMiddleware } from './persistence';
import { setRemoteSettings, setSettingsTenant } from '../utils/settings';

export const createStore = (preloadedState) => {
  const instance = configureStore({
    reducer: { auth: authReducer, domain: domainReducer, ui: uiReducer, tenants: tenantsReducer, notifications: notificationsReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false }).concat(createPersistenceMiddleware()),
    preloadedState,
  });
  // Letterhead / settings follow the signed-in organisation.
  const sync = () => {
    const user = instance.getState().auth.currentUser;
    setSettingsTenant(user?.tenantSlug ? { slug: user.tenantSlug, name: user.tenantName } : null);
    if (!instance.getState().auth.session) setRemoteSettings(null);   // signed out: drop the organisation's settings
  };
  instance.subscribe(sync);
  sync();
  return instance;
};

export const store = createStore();

/** Typed-ish hooks — import these instead of the raw react-redux ones. */
export const useAppDispatch = () => useDispatch();
export const useAppSelector = useSelector;

// Dev-only handle so browser tests can inspect state (never shipped in a production build).
if (import.meta.env?.DEV && typeof window !== 'undefined') window.__store = store;
