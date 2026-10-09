import React, { useState } from 'react';
import { Check, Copy, KeyRound, X } from 'lucide-react';

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
export function CredentialModal({ credential, close }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(credential.password);
      setCopied(true);
    } catch { /* clipboard blocked — the password is selectable on screen */ }
  };
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label="One-time password">
        <div className="modal-head">
          <div>
            <span className="modal-kicker"><KeyRound size={12} /> ONE-TIME PASSWORD · {credential.tenantName}</span>
            <h2>Share this securely</h2>
            <p>This is the only time it is shown. {credential.email} must change it when signing in.</p>
          </div>
        </div>
        <div className="agent-tiles">
          <div><small>Sign-in e-mail</small><b>{credential.email}</b></div>
          <div><small>One-time password</small><b style={{ fontFamily: 'monospace', userSelect: 'all' }}>{credential.password}</b></div>
        </div>
        <div className="modal-actions">
          <button type="button" className="button button-white" onClick={copy}>
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy password'}
          </button>
          <button type="button" className="button button-primary" onClick={close}>I have saved it</button>
        </div>
      </div>
    </div>
  );
}
