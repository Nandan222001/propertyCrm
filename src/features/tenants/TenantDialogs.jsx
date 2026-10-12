import React, { useState } from 'react';
import { X } from 'lucide-react';

/** Suspend needs a reason (it is audited and shown to the platform team). */
export function SuspendModal({ tenant, close, confirm }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (reason.trim().length < 3) { setError('Give a short reason (at least 3 characters)'); return; }
    setBusy(true);
    const ok = await confirm(tenant, reason.trim());
    setBusy(false);
    if (ok) close();
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <form className="modal" onSubmit={submit} noValidate>
        <div className="modal-head">
          <div>
            <span className="modal-kicker">SUSPEND ORGANISATION</span>
            <h2>{tenant.name}</h2>
            <p>Every user of this organisation is signed out immediately and cannot sign in until it is reactivated. Their data is kept.</p>
          </div>
          <button type="button" className="modal-close" onClick={close} aria-label="Close"><X size={17} /></button>
        </div>
        <div className="form-grid">
          <label className="span-2">
            Reason *
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Invoice unpaid for 30 days" autoFocus />
          </label>
        </div>
        {error && <p role="alert" style={{ color: '#d92d20', margin: '8px 0 0' }}>{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-white" onClick={close}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>Suspend access</button>
        </div>
      </form>
    </div>
  );
}

/** Shown exactly once after a password is generated. Never stored, never logged. */
