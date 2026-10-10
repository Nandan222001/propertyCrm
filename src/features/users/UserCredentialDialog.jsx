import React, { useState } from 'react';
import { Check, Copy, X } from 'lucide-react';

/** One-time login details for a new team member. Shown once; never stored or logged. */
export function UserCredentialDialog({ credential, close }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Email: ${credential.email}\nTemporary password: ${credential.password}`);
      setCopied(true);
    } catch { /* clipboard unavailable: the details are on screen */ }
  };
  return (
    <div className="modal-backdrop" role="dialog" aria-label="One-time password">
      <div className="modal view-modal">
        <div className="modal-head">
          <div>
            <span className="modal-kicker">TEAM MEMBER ADDED</span>
            <h2>{credential.name}</h2>
            <p>Share these sign-in details securely. The password is shown only now and must be changed at first sign-in.</p>
          </div>
          <button type="button" className="modal-close" onClick={close} aria-label="Close"><X size={16} /></button>
        </div>
        <dl className="view-facts">
          <dt>Email</dt><dd>{credential.email}</dd>
          <dt>Temporary password</dt><dd><code data-testid="one-time-password">{credential.password}</code></dd>
        </dl>
        <div className="modal-actions">
          <button type="button" className="button button-white" onClick={copy}>
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy details'}
          </button>
          <button type="button" className="button button-primary" onClick={close}>I have saved it</button>
        </div>
      </div>
    </div>
  );
}
