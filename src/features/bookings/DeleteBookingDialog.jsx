import React, { useState } from 'react';
import { ModalShell } from '../../components/common/ModalShell';
import { actions } from '../../api/resources';
import { PasswordInput } from '../../components/common/PasswordInput';

/**
 * Deleting a booking is admin-only and takes two steps: the admin types their own password,
 * then confirms "are you sure". The server checks the password and says so if it is wrong.
 * `onDelete(booking, password)` resolves to '' on success or an error message.
 */
export function DeleteBookingDialog({ booking, onDelete, onCancel }) {
  const [step, setStep] = useState('password');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // The password is checked with the server here, so a wrong one never reaches the "are you sure?" step.
  const next = async (e) => {
    e.preventDefault();
    if (!password) return setError('Enter your password to continue.');
    setBusy(true);
    setError('');
    try {
      await actions.confirmPassword(password);
      setStep('confirm');
    } catch (err) {
      setError(err.status === 403 || err.code === 'forbidden' ? 'Wrong password. Please try again.' : (err.message || 'Could not check your password.'));
      setPassword('');
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    setBusy(true);
    const problem = await onDelete(booking, password);
    setBusy(false);
    if (!problem) return onCancel();
    setError(problem);
    setPassword('');
    setStep('password');
  };

  if (step === 'password') {
    return (
      <ModalShell
        title="Delete booking"
        subtitle={`${booking[0]} · ${booking[1]} · plot ${booking[3]}`}
        onClose={onCancel}
      >
        <form onSubmit={next}>
          <div className="form-grid">
            <label className="span-2">
              Enter your password to continue
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            </label>
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="button button-white" onClick={onCancel}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
          </div>
        </form>
      </ModalShell>
    );
  }
  return (
    <ModalShell
      title="Are you sure?"
      onClose={onCancel}
      footer={(
        <>
          <button type="button" className="button button-white" disabled={busy} onClick={onCancel}>No, keep it</button>
          <button type="button" className="button button-primary danger-btn" disabled={busy} onClick={confirm}>
            {busy ? 'Deleting…' : 'Yes, delete'}
          </button>
        </>
      )}
    >
      <p className="confirm-text">
        Delete booking {booking[0]} ({booking[1]}, plot {booking[3]})? The plot becomes available again.
        Bookings with payments or invoices cannot be deleted — cancel those instead.
      </p>
    </ModalShell>
  );
}
