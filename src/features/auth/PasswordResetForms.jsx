import React, { useState } from 'react';
import { ArrowRight, Lock, Mail } from 'lucide-react';
import { actions } from '../../api';

const STRONG = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,128}$/;

/** "Forgot password?" — asks for the e-mail; the answer never reveals whether the account exists. */
export function ForgotPasswordForm({ onBack, onDevToken }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ busy: false, done: '', error: '' });

  const submit = async (e) => {
    e.preventDefault();
    if (!email.includes('@')) { setState({ busy: false, done: '', error: 'Enter the e-mail you sign in with.' }); return; }
    setState({ busy: true, done: '', error: '' });
    try {
      const response = await actions.forgotPassword(email.trim().toLowerCase());
      const data = response?.data || {};
      // Local development (no mail server) returns the token so the flow can still be completed.
      if (data.debug_token && onDevToken) { onDevToken(data.debug_token); return; }
      if (data.delivery === 'unavailable') {
        setState({ busy: false, done: '', error: 'Reset by e-mail is not set up on this server yet. Please ask your administrator to reset your password.' });
        return;
      }
      setState({ busy: false, done: 'If that address belongs to an account, a reset link is on its way. It is valid for 30 minutes.', error: '' });
    } catch (error) {
      setState({ busy: false, done: '', error: error.message || 'Could not send the reset link.' });
    }
  };

  return (
    <form className="login-card" onSubmit={submit} noValidate>
      <div className="form-group">
        <label>
          Work Email Address
          <div className="input-with-icon">
            <Mail size={15} />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your work e-mail" autoFocus />
          </div>
        </label>
      </div>
      {state.error && <div className="login-error-banner"><span>{state.error}</span></div>}
      {state.done && <div className="login-error-banner login-notice-banner" role="status"><span>{state.done}</span></div>}
      <button type="submit" className="button button-primary login-submit" disabled={state.busy}>
        <span>Send reset link</span><ArrowRight size={15} />
      </button>
      <button type="button" className="text-button" style={{ marginTop: 12 }} onClick={onBack}>← Back to sign in</button>
    </form>
  );
}

/** The page behind the e-mailed link: /reset-password?token=… */
export function ResetPasswordForm({ token, onDone }) {
  const [form, setForm] = useState({ next: '', confirm: '' });
  const [state, setState] = useState({ busy: false, error: '' });
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!STRONG.test(form.next)) { setState({ busy: false, error: 'Use at least 8 characters with upper and lower case letters, a digit and a symbol.' }); return; }
    if (form.next !== form.confirm) { setState({ busy: false, error: 'The two passwords do not match.' }); return; }
    setState({ busy: true, error: '' });
    try {
      await actions.resetPassword(token, form.next);
      onDone('Password updated. Please sign in with your new password.');
    } catch (error) {
      setState({ busy: false, error: error.message || 'This reset link is invalid or has expired. Request a new one.' });
    }
  };

  return (
    <form className="login-card" onSubmit={submit} noValidate>
      <div className="form-group">
        <label>New password
          <div className="input-with-icon"><Lock size={15} /><input type="password" autoComplete="new-password" value={form.next} onChange={set('next')} autoFocus /></div>
        </label>
      </div>
      <div className="form-group">
        <label>Confirm new password
          <div className="input-with-icon"><Lock size={15} /><input type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} /></div>
        </label>
      </div>
      {state.error && <div className="login-error-banner"><span>{state.error}</span></div>}
      <button type="submit" className="button button-primary login-submit" disabled={state.busy}>
        <span>Set new password</span><ArrowRight size={15} />
      </button>
    </form>
  );
}
