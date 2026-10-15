import React, { useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import { PasswordInput } from '../../components/common/PasswordInput';
import { startingPassword } from '../../utils/startingPassword';

const STRONG = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,128}$/;

/**
 * Change my password. `forced` = first sign-in with the starting password: it is offered straight away, but
 * can be closed (X or "Skip for now") to carry on with the starting password. Changing it signs everyone out.
 */
export function ChangePasswordDialog({ forced = false, onSubmit, close }) {
  const [form, setForm] = useState({ current: forced ? startingPassword.get() : '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.current) return setError('Enter your current (starting) password.');
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
            <p>{forced ? 'You signed in with your starting password. We recommend choosing your own now — or close this to keep using the starting password.' : 'You will be signed out everywhere and asked to sign in again.'}</p>
          </div>
          <button type="button" className="modal-close" onClick={close} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="form-grid">
          <label>Current password<PasswordInput autoComplete="current-password" value={form.current} onChange={set('current')} autoFocus={!form.current} /></label>
          <label>New password<PasswordInput autoComplete="new-password" value={form.next} onChange={set('next')} autoFocus={Boolean(form.current)} /></label>
          <label>Confirm new password<PasswordInput autoComplete="new-password" value={form.confirm} onChange={set('confirm')} /></label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-white" onClick={close}>{forced ? 'Skip for now' : 'Cancel'}</button>
          <button type="submit" className="button button-primary" disabled={busy}>Change password</button>
        </div>
      </form>
    </div>
  );
}
