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
  const [withMoney, setWithMoney] = useState(false);
  const confirm = async (deletePayments = false) => {
    setBusy(true);
    const problem = await onDelete(booking, password, deletePayments);
    setBusy(false);
    if (!problem) return onCancel();
    // The booking has payments / invoices: offer to delete those together with it.
    if (/delete them along with the booking/.test(problem)) { setWithMoney(true); setStep('confirm'); return; }
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
      title={withMoney ? 'Delete payments too?' : 'Are you sure?'}
      onClose={onCancel}
      footer={(
        <>
          <button type="button" className="button button-white" disabled={busy} onClick={onCancel}>No, keep it</button>
          <button type="button" className="button button-primary danger-btn" disabled={busy} onClick={() => confirm(withMoney)}>
            {busy ? 'Deleting…' : (withMoney ? 'Yes, delete all' : 'Yes, delete')}
          </button>
        </>
      )}
    >
      {withMoney ? (
        <p className="confirm-text">
          Booking {booking[0]} ({booking[1]}, plot {booking[3]}) has payments or invoices. Delete the booking
          <strong> together with all its payments, invoices and commission</strong>? The collected totals will drop
          by that amount and this cannot be undone from the screen. To keep the records, choose No and cancel the booking instead.
        </p>
      ) : (
      <p className="confirm-text">
        Delete booking {booking[0]} ({booking[1]}, plot {booking[3]})? The plot becomes available again.
        If it has payments or invoices you will be asked whether to delete those too.
      </p>
      )}
    </ModalShell>
  );
}
