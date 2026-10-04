import React, { useEffect } from 'react';
import { CheckCircle } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../store';
import { selectToast } from '../../store/selectors';
import { toastCleared } from '../../store/slices/uiSlice';

/** Single global toast + its auto-dismiss timer (no per-page timer copies). */
export function Toast({ duration = 3000 }) {
  const message = useAppSelector(selectToast);
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => dispatch(toastCleared()), duration);
    return () => clearTimeout(timer);
  }, [message, duration, dispatch]);

  if (!message) return null;
  return (
    <div className="app-toast" role="status" aria-live="polite">
      <CheckCircle size={15} className="green-text" />
      <span>{message}</span>
    </div>
  );
}
