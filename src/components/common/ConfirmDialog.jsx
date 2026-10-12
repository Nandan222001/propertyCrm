import React, { useState } from 'react';
import { ModalShell } from './ModalShell';

/** "Are you sure?" step for destructive actions. `onConfirm` may return an error message to show in place. */
export function ConfirmDialog({ title, message, confirmLabel = 'Delete', onConfirm, onCancel }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async () => {
    setBusy(true);
    const problem = await onConfirm();
    setBusy(false);
    if (problem) setError(problem); else onCancel();
  };
  return (
    <ModalShell
      title={title}
      onClose={onCancel}
      footer={(
        <>
          <button type="button" className="button button-white" onClick={onCancel}>Cancel</button>
          <button type="button" className="button button-primary danger-btn" disabled={busy} onClick={run}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      )}
    >
      <p className="confirm-text">{message}</p>
      {error && <p className="form-error">{error}</p>}
    </ModalShell>
  );
}
