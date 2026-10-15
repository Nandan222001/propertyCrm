/** Reusable hooks. Feature components never import react-redux directly. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store';
import { selectCurrentUser, selectMode, selectRole, selectSession } from '../store/selectors';
import { hasPermission, isAdmin, isPlatformAdmin, canApprove, canCreateBooking, canCreateCustomer, canManageBills, canRecordPayment } from '../utils/permissions';
import { notify } from '../store/thunks';
import { loadingSet } from '../store/slices/uiSlice';

export { useAppDispatch, useAppSelector };

/** A page that fetches its own data calls this so numbers read "Loading…" until the data is in (never a false 0). */
export function usePageLoading(key, loading) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch(loadingSet({ key, value: Boolean(loading) }));
    return () => { dispatch(loadingSet({ key, value: false })); };
  }, [dispatch, key, loading]);
}

/** Identity + capability helpers for the active session. */
export function useAuth() {
  const session = useAppSelector(selectSession);
  const role = useAppSelector(selectRole);
  const user = useAppSelector(selectCurrentUser);
  const mode = useAppSelector(selectMode);
  return useMemo(() => ({
    session,
    role,
    user,
    mode,
    signedIn: Boolean(session),
    isAdmin: isAdmin(role),
    isPlatform: isPlatformAdmin(role),
    canApprove: canApprove(role),
    canCreateBooking: canCreateBooking(role),
    canCreateCustomer: canCreateCustomer(role),
    canRecordPayment: canRecordPayment(role),
    canManageBills: canManageBills(role),
    can: (permission) => hasPermission(role, permission),
  }), [session, role, user, mode]);
}

/** `const notify = useNotify()` — pushes a toast through the store. */
export function useNotify() {
  const dispatch = useAppDispatch();
  return useMemo(() => (message) => dispatch(notify(message)), [dispatch]);
}

/** Debounced value (search boxes) — one implementation for the whole app. */
export function useDebouncedValue(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Run an async loader once and expose {data, loading, error}. */
export function useAsync(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  useEffect(() => {
    setState((prev) => ({ ...prev, loading: true }));
    let cancelled = false;
    Promise.resolve()
      .then(loader)
      .then((data) => { if (!cancelled && mounted.current) setState({ data, loading: false, error: null }); })
      .catch((error) => { if (!cancelled && mounted.current) setState({ data: null, loading: false, error }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
