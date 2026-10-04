/**
 * Redux store factory. One store for the whole SPA:
 *   auth   → session, role, team directory
 *   domain → ERP master data
 *   ui     → shell/navigation/modal state
 */
import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import authReducer from './slices/authSlice';
import domainReducer from './slices/domainSlice';
import uiReducer from './slices/uiSlice';
import { createPersistenceMiddleware } from './persistence';

export const createStore = (preloadedState) => configureStore({
  reducer: { auth: authReducer, domain: domainReducer, ui: uiReducer },
  middleware: (getDefault) => getDefault({ serializableCheck: false }).concat(createPersistenceMiddleware()),
  preloadedState,
});

export const store = createStore();

/** Typed-ish hooks — import these instead of the raw react-redux ones. */
export const useAppDispatch = () => useDispatch();
export const useAppSelector = useSelector;
