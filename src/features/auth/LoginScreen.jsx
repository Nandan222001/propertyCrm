import React, { useEffect, useState } from 'react';
import {
  Lock, Mail, ArrowRight, Eye, EyeOff
} from 'lucide-react';
import { actions } from '../../api';
import { ForgotPasswordForm, ResetPasswordForm } from './PasswordResetForms';

export function LoginScreen({ onLogin, notice: initialNotice = '' }) {
  // The deployment's name comes from the server (no tenant is known before sign-in).
  const [brand, setBrand] = useState({ name: '', tagline: '' });
  useEffect(() => {
    let live = true;
    actions.branding().then((r) => {
      if (!live || !r?.data) return;
      setBrand(r.data);
      if (r.data.name) document.title = r.data.name;
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  const [brandFirst, ...brandWords] = (brand.name || '').split(' ');
  const brandRest = brandWords.join(' ');
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(initialNotice);
  const [busy, setBusy] = useState(false);
  // 'forgot' = request a reset link; a /reset-password?token=… URL opens the reset form directly.
  const [resetView, setResetView] = useState(() => (typeof window !== 'undefined' && window.location.pathname === '/reset-password' ? 'reset' : ''));
  const [resetToken, setResetToken] = useState(() => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('token') || '' : ''));
  const finishReset = (message) => {
    setNotice(message); setResetView(''); setResetToken('');
    window.history.replaceState({}, '', '/');
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!email.includes('@')) {
      setError('Please enter a valid work email.');
      return;
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }
    const typed = email.trim().toLowerCase();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await onLogin({ email: typed, password });
    } catch (failure) {
      // Wrong password, a locked / suspended / not-yet-activated account, a suspended organisation…
      setError(failure?.message || 'Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-screen interactive-auth">
      {/* Image-only panel: the company logo artwork, no text on top. */}
      <section className="login-art auth-hero-panel" role="img" aria-label={brand.name || 'Company logo'} />

      {/* Interactive Form Right Panel */}
      <section className="login-form-wrap">
        <div className="login-card-container">
          <div className="login-brand login-brand-form">
            <div className="brand-mark">{(brand.name || '·').slice(0, 1).toUpperCase()}</div>
            <div>
              <b>{brandFirst} <span>{brandRest}</span></b>
              <small>{(brand.tagline || '').toUpperCase()}</small>
            </div>
          </div>
          <div className="auth-mode-tabs"><span className="mode-tab active">Sign In to Workspace</span></div>

          {error && (
            <div className="login-error-banner">
              <span>{error}</span>
            </div>
          )}
          {notice && !error && (
            <div className="login-error-banner login-notice-banner" role="status">
              <span>{notice}</span>
            </div>
          )}

          {resetView === 'reset' && <ResetPasswordForm token={resetToken} onDone={finishReset} />}
          {resetView === 'forgot' && (
            <ForgotPasswordForm
              onBack={() => setResetView('')}
              onDevToken={(token) => { setResetToken(token); setResetView('reset'); setNotice('Development mode: no mail server is configured, so you can choose your new password right away.'); }}
            />
          )}
          {/* SIGN IN FORM */}
          {!resetView && (
            <form className="login-card" onSubmit={handleLoginSubmit}>
              <div className="form-group">
                <label>
                  Work Email Address
                  <div className="input-with-icon">
                    <Mail size={15} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Your work e-mail"
                      required
                    />
                  </div>
                </label>
              </div>

              <div className="form-group">
                <label>
                  Password
                  <div className="input-with-icon">
                    <Lock size={15} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      required
                    />
                    <button
                      type="button"
                      className="eye-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </label>
              </div>

              <button type="submit" className="button button-primary login-submit" disabled={busy}>
                <span>Sign In</span>
                <ArrowRight size={15} />
              </button>
              <button type="button" className="text-button login-forgot" onClick={() => { setError(''); setNotice(''); setResetView('forgot'); }}>
                Forgot password?
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
