import React, { useEffect, useState } from 'react';
import {
  Lock, Mail, CheckCircle2, Layers, ArrowRight, Eye, EyeOff
} from 'lucide-react';
import { actions } from '../../api';
import { ForgotPasswordForm, ResetPasswordForm } from './PasswordResetForms';

export function LoginScreen({ onLogin, notice: initialNotice = '' }) {
  const [selectedImage, setSelectedImage] = useState(0); // 0, 1, 2
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

  const heroImages = [
    {
      url: '/images/auth-luxury-estate.jpg',
      title: 'Master-Planned Township',
      tag: 'Portfolio View'
    },
    {
      url: '/images/auth-township-model.jpg',
      title: 'Architectural Blueprint & Modeling',
      tag: 'Master Layout'
    },
    {
      url: '/images/auth-agent-portal.jpg',
      title: 'Executive Sales Experience Lounge',
      tag: 'Client Suite'
    }
  ];

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
      {/* Visual Showcase Left Panel */}
      <section className="login-art auth-hero-panel" style={{ backgroundImage: `linear-gradient(rgba(18, 26, 49, 0.72), rgba(18, 26, 49, 0.88)), url(${heroImages[selectedImage].url})` }}>
        <div className="login-brand">
          <div className="brand-mark">{(brand.name || '·').slice(0, 1).toUpperCase()}</div>
          <div>
            <b>{brandFirst} <span>{brandRest}</span></b>
            <small>{(brand.tagline || '').toUpperCase()}</small>
          </div>
        </div>

        {/* Image Showcase Switcher */}
        <div className="image-showcase-bar">
          <span className="showcase-label"><Layers size={13} /> Architectural Showcase:</span>
          <div className="showcase-thumbnails">
            {heroImages.map((img, i) => (
              <button
                key={img.title}
                type="button"
                className={`showcase-thumb-btn ${selectedImage === i ? 'active' : ''}`}
                onClick={() => setSelectedImage(i)}
                title={img.title}
              >
                <span>{img.tag}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="login-pitch">
          <div className="eyebrow">
            <i className="live-dot" /> {heroImages[selectedImage].tag.toUpperCase()} · LIVE WORKSPACE
          </div>
          <h1>
            Every plot.<br />
            Every payment.<br />
            <em>One clear picture.</em>
          </h1>
          <p>
            An end-to-end operational operating system designed specifically for real estate developers, 
            sales forces and accounts treasury.
          </p>

          <div className="current-photo-badge">
            <span className="photo-title">{heroImages[selectedImage].title}</span>
          </div>

        </div>

        {/* Feature Highlights on Image */}
        <div className="auth-footer-features">
          <div className="trust-pill"><CheckCircle2 size={13} /> Role-Based Access Control</div>
          <div className="trust-pill"><CheckCircle2 size={13} /> Multi-Development Ready</div>
        </div>
      </section>

      {/* Interactive Form Right Panel */}
      <section className="login-form-wrap">
        <div className="login-card-container">
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
