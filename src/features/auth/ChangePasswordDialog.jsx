import React, { useState } from 'react';
import { KeyRound, X } from 'lucide-react';

const STRONG = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,128}$/;

/**
 * Change my password. `forced` = first sign-in with a one-time password: it cannot be dismissed
 * until a new password is chosen. The server signs everyone out afterwards.
 */
export function ChangePasswordDialog({ forced = false, onSubmit, close }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.current) return setError('Enter your current (one-time) password.');
    if (!STRONG.test(form.next)) return setError('Use at least 8 characters with upper and lower case letters, a digit and a symbol.');
    if (form.next !== form.confirm) return setError('The new passwords do not match.');
    if (form.next === form.current) return setError('Choose a password different from the current one.');
    setBusy(true);
    const problem = await onSubmit(form);
    setBusy(false);
    if (problem) setError(problem);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-label="Change password">
      <form className="modal view-modal" onSubmit={submit} noValidate>
        <div className="modal-head">
          <div>
            <span className="modal-kicker"><KeyRound size={12} /> {forced ? 'SET YOUR OWN PASSWORD' : 'ACCOUNT SECURITY'}</span>
            <h2>{forced ? 'Choose a new password' : 'Change password'}</h2>
            <p>{forced ? 'You signed in with a one-time password. Pick your own before continuing.' : 'You will be signed out everywhere and asked to sign in again.'}</p>
          </div>
          {!forced && <button type="button" className="modal-close" onClick={close} aria-label="Close"><X size={16} /></button>}
        </div>
        <div className="form-grid">
          <label>Current password<input type="password" autoComplete="current-password" value={form.current} onChange={set('current')} autoFocus /></label>
          <label>New password<input type="password" autoComplete="new-password" value={form.next} onChange={set('next')} /></label>
          <label>Confirm new password<input type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} /></label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          {!forced && <button type="button" className="button button-white" onClick={close}>Cancel</button>}
          <button type="submit" className="button button-primary" disabled={busy}>Change password</button>
        </div>
      </form>
    </div>
  );
}
