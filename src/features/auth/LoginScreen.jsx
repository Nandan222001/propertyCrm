import React, { useState } from 'react';
import { 
  Shield, ChevronRight, Lock, Mail, User, Phone, Building2, 
  CheckCircle2, Sparkles, Layers, ArrowRight, Eye, EyeOff, Award, 
  Briefcase, Wallet, Users, Target, Check, RefreshCw
} from 'lucide-react';
import { roleConfigs } from '../../data/seedData';

export function LoginScreen({ onLogin, onRegister, customers = [], users = [] }) {
  const [tab, setTab] = useState('login'); // 'login' | 'register'
  const [selectedImage, setSelectedImage] = useState(0); // 0, 1, 2
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('ADMIN');
  const [email, setEmail] = useState('admin@nmtsolution.demo');
  const [password, setPassword] = useState('demo123');
  const [error, setError] = useState('');

  // Registration state
  const [regData, setRegData] = useState({
    name: '',
    email: '',
    phone: '',
    org: 'Apex Real Estate Developers',
    role: 'SALES AGENT',
    password: '',
    confirmPassword: '',
    agreed: true
  });

  const heroImages = [
    {
      url: '/images/auth-luxury-estate.jpg',
      title: 'Master-Planned Township',
      caption: 'Green Meadows Phase II · Mumbai',
      tag: 'Portfolio View'
    },
    {
      url: '/images/auth-township-model.jpg',
      title: 'Architectural Blueprint & Modeling',
      caption: 'Silver Oaks & Park View Master Layouts',
      tag: 'Master Layout'
    },
    {
      url: '/images/auth-agent-portal.jpg',
      title: 'Executive Sales Experience Lounge',
      caption: 'Modern Interactive Customer Presentation Suite',
      tag: 'Client Suite'
    }
  ];

  const quickRoles = [
    { role: 'SUPER ADMIN', label: 'Super Admin', icon: Shield, desc: 'Root Governance & System Health', color: '#7b39ed', bg: '#f3e8ff' },
    { role: 'ADMIN', label: 'Admin', icon: Building2, desc: 'Operations Command & Project Inventory', color: '#4f5fce', bg: '#eef0ff' },
    { role: 'SALES MANAGER', label: 'Sales Manager', icon: Target, desc: 'Team Pipeline & Quota Realization', color: '#0891b2', bg: '#e0f2fe' },
    { role: 'SALES AGENT', label: 'Sales Agent', icon: Users, desc: 'My Sales Desk, Deals & Commissions', color: '#16a34a', bg: '#dcfce7' },
    { role: 'ACCOUNTS', label: 'Accounts', icon: Wallet, desc: 'Financial Ledger & Aging Receivables', color: '#ea580c', bg: '#ffedd5' },
    { role: 'MANAGEMENT', label: 'Management', icon: Briefcase, desc: 'Executive Boardroom & Portfolio GDV', color: '#be123c', bg: '#ffe4e6' },
    { role: 'CUSTOMER', label: 'Customer', icon: User, desc: 'My Plots, Payments, Bills & Registry (view only)', color: '#0d9488', bg: '#ccfbf1' }
  ];
  const registerRoles = quickRoles.filter((r) => r.role === 'SALES AGENT' || r.role === 'CUSTOMER');

  const handleQuickLogin = (targetRole) => {
    const userForRole = roleConfigs[targetRole]?.defaultUser || {
      name: `${targetRole.toLowerCase()} User`,
      email: `${targetRole.toLowerCase().replace(' ', '')}@nmtsolution.demo`,
      role: targetRole
    };
    onLogin(targetRole, userForRole);
  };

  const handleLoginSubmit = (e) => {
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
    let user = roleConfigs[role]?.defaultUser || { name: 'Workspace User', email, role };
    if (role === 'CUSTOMER') {
      const c = customers.find((x) => (x.email || '').toLowerCase() === typed);
      if (!c) {
        setError('No customer account with this email. Try customer@nmtsolution.demo.');
        return;
      }
      user = { name: c.name, email: c.email, role, customerName: c.name };
    } else if (role === 'SALES AGENT') {
      const u = users.find((x) => x.role === 'SALES AGENT' && x.email.toLowerCase() === typed);
      if (u) user = u;
    }
    setError('');
    onLogin(role, user);
  };

  const handleRegisterSubmit = (e) => {
    e.preventDefault();
    if (!regData.name.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!regData.email.includes('@')) {
      setError('Please enter a valid business email.');
      return;
    }
    if (regData.password.length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }
    if (regData.password !== regData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError('');

    const newUser = {
      id: `USR-${Math.floor(100 + Math.random() * 900)}`,
      name: regData.name,
      email: regData.email,
      phone: regData.phone || '+91 98765 00000',
      role: regData.role,
      status: 'Active',
      title: `${regData.role} · ${regData.org}`
    };

    if (onRegister) {
      onRegister(newUser);
    } else {
      onLogin(regData.role, newUser);
    }
  };

  const currentRoleConfig = roleConfigs[tab === 'login' ? role : regData.role] || roleConfigs['ADMIN'];

  return (
    <main className="login-screen interactive-auth">
      {/* Visual Showcase Left Panel */}
      <section className="login-art auth-hero-panel" style={{ backgroundImage: `linear-gradient(rgba(18, 26, 49, 0.72), rgba(18, 26, 49, 0.88)), url(${heroImages[selectedImage].url})` }}>
        <div className="login-brand">
          <div className="brand-mark">L</div>
          <div>
            <b>Lalita <span>Realestate Infra</span></b>
            <small>ENTERPRISE REAL ESTATE OPERATIONS</small>
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
                title={img.caption}
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
            sales forces, accounts treasury, and executive management.
          </p>

          <div className="current-photo-badge">
            <span className="photo-title">{heroImages[selectedImage].title}</span>
            <span className="photo-caption">{heroImages[selectedImage].caption}</span>
          </div>

          <div className="login-metrics">
            <div>
              <b>384</b>
              <small>Plots in portfolio</small>
            </div>
            <div>
              <b>4</b>
              <small>Active projects</small>
            </div>
            <div>
              <b>₹7.9 Cr</b>
              <small>Reconciled cash</small>
            </div>
            <div>
              <b>99.98%</b>
              <small>SLA availability</small>
            </div>
          </div>
        </div>

        {/* Feature Highlights on Image */}
        <div className="auth-footer-features">
          <div className="trust-pill"><CheckCircle2 size={13} /> Role-Based Access Control</div>
          <div className="trust-pill"><CheckCircle2 size={13} /> 256-Bit Financial Encryption</div>
          <div className="trust-pill"><CheckCircle2 size={13} /> Multi-Development Ready</div>
        </div>
      </section>

      {/* Interactive Form Right Panel */}
      <section className="login-form-wrap">
        <div className="login-card-container">
          {/* Auth Mode Tabs */}
          <div className="auth-mode-tabs">
            <button 
              type="button" 
              className={`mode-tab ${tab === 'login' ? 'active' : ''}`}
              onClick={() => { setTab('login'); setError(''); }}
            >
              Sign In to Workspace
            </button>
            <button 
              type="button" 
              className={`mode-tab ${tab === 'register' ? 'active' : ''}`}
              onClick={() => { setTab('register'); setError(''); }}
            >
              Create Account / Register
            </button>
          </div>

          {/* Quick Demo 1-Click Role Switcher */}
          <div className="quick-roles-container">
            <div className="quick-roles-head">
              <span className="quick-roles-title">
                <Sparkles size={14} className="indigo-text" /> 
                <b>Explore Demo As (1-Click Login):</b>
              </span>
              <span className="quick-roles-sub">Instantly switch between real estate roles</span>
            </div>

            <div className="quick-role-buttons-grid">
              {quickRoles.map((r) => {
                const Icon = r.icon;
                return (
                  <button
                    key={r.role}
                    type="button"
                    className="quick-role-card"
                    style={{ '--role-color': r.color, '--role-bg': r.bg }}
                    onClick={() => handleQuickLogin(r.role)}
                    title={`Login as ${r.label}: ${r.desc}`}
                  >
                    <div className="role-btn-icon" style={{ color: r.color, background: r.bg }}>
                      <Icon size={14} />
                    </div>
                    <div className="role-btn-text">
                      <b>{r.label}</b>
                      <small>{r.desc}</small>
                    </div>
                    <ChevronRight size={13} className="role-chevron" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="auth-divider">
            <span>OR ENTER CREDENTIALS</span>
          </div>

          {error && (
            <div className="login-error-banner">
              <span>{error}</span>
            </div>
          )}

          {/* SIGN IN FORM */}
          {tab === 'login' && (
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
                      placeholder="e.g. admin@nmtsolution.demo"
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

              <div className="form-group">
                <label>
                  Select Role View
                  <select value={role} onChange={(e) => { setRole(e.target.value); setEmail(roleConfigs[e.target.value]?.defaultUser?.email || email); }}>
                    {quickRoles.map((r) => (
                      <option key={r.role} value={r.role}>{r.label} ({r.role})</option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Live Role Capabilities Preview Box */}
              <div className="role-preview-box" style={{ borderLeftColor: currentRoleConfig.color }}>
                <div className="preview-top">
                  <span className="preview-badge" style={{ background: currentRoleConfig.bg, color: currentRoleConfig.color }}>
                    <Shield size={11} /> {role} PERMISSIONS
                  </span>
                </div>
                <p className="preview-desc">{currentRoleConfig.subtitle}</p>
                <div className="preview-modules">
                  <span>Modules:</span> {currentRoleConfig.workspaceNav.slice(0, 4).join(', ')}...
                </div>
              </div>

              <button type="submit" className="button button-primary login-submit">
                <span>Sign In to {role} Workspace</span>
                <ArrowRight size={15} />
              </button>

              <div className="demo-credentials-helper">
                <b>Default Demo Credentials</b>
                <div className="cred-row">
                  <span>Email: <code>admin@nmtsolution.demo</code></span>
                  <span>Pass: <code>demo123</code></span>
                </div>
                <button
                  type="button"
                  className="fill-btn"
                  onClick={() => {
                    setEmail('admin@nmtsolution.demo');
                    setPassword('demo123');
                    setRole('ADMIN');
                  }}
                >
                  Autofill Default
                </button>
              </div>
            </form>
          )}

          {/* REGISTRATION FORM */}
          {tab === 'register' && (
            <form className="login-card register-card" onSubmit={handleRegisterSubmit}>
              <div className="form-grid-2">
                <label>
                  Full Name
                  <div className="input-with-icon">
                    <User size={15} />
                    <input
                      type="text"
                      placeholder="e.g. Vikram Malhotra"
                      value={regData.name}
                      onChange={(e) => setRegData({ ...regData, name: e.target.value })}
                      required
                    />
                  </div>
                </label>

                <label>
                  Business Email
                  <div className="input-with-icon">
                    <Mail size={15} />
                    <input
                      type="email"
                      placeholder="e.g. vikram@realty.com"
                      value={regData.email}
                      onChange={(e) => setRegData({ ...regData, email: e.target.value })}
                      required
                    />
                  </div>
                </label>
              </div>

              <div className="form-grid-2">
                <label>
                  Mobile Number
                  <div className="input-with-icon">
                    <Phone size={15} />
                    <input
                      type="tel"
                      placeholder="+91 98200 45678"
                      value={regData.phone}
                      onChange={(e) => setRegData({ ...regData, phone: e.target.value })}
                    />
                  </div>
                </label>

                <label>
                  Organization / Agency
                  <div className="input-with-icon">
                    <Building2 size={15} />
                    <input
                      type="text"
                      placeholder="Developer or Agency name"
                      value={regData.org}
                      onChange={(e) => setRegData({ ...regData, org: e.target.value })}
                    />
                  </div>
                </label>
              </div>

              <div className="form-group">
                <label>
                  Requested Workspace Role
                  <select 
                    value={regData.role} 
                    onChange={(e) => setRegData({ ...regData, role: e.target.value })}
                  >
                    {registerRoles.map((r) => (
                      <option key={r.role} value={r.role}>{r.label} — {r.desc}</option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Dynamic Role Capability Preview */}
              <div className="role-preview-box register-preview" style={{ borderLeftColor: currentRoleConfig.color }}>
                <div className="preview-top">
                  <span className="preview-badge" style={{ background: currentRoleConfig.bg, color: currentRoleConfig.color }}>
                    <Shield size={11} /> {regData.role} WORKSPACE SPECIFICATION
                  </span>
                </div>
                <p className="preview-desc">{currentRoleConfig.subtitle}</p>
                <div className="preview-tags">
                  {currentRoleConfig.permissions.slice(0, 4).map((p) => (
                    <span key={p} className="preview-perm-tag">✓ {p.replace('_', ' ')}</span>
                  ))}
                </div>
              </div>

              <div className="form-grid-2">
                <label>
                  Create Password
                  <div className="input-with-icon">
                    <Lock size={15} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Min 4 characters"
                      value={regData.password}
                      onChange={(e) => setRegData({ ...regData, password: e.target.value })}
                      required
                    />
                  </div>
                </label>

                <label>
                  Confirm Password
                  <div className="input-with-icon">
                    <Lock size={15} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Repeat password"
                      value={regData.confirmPassword}
                      onChange={(e) => setRegData({ ...regData, confirmPassword: e.target.value })}
                      required
                    />
                  </div>
                </label>
              </div>

              <div className="checkbox-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={regData.agreed}
                    onChange={(e) => setRegData({ ...regData, agreed: e.target.checked })}
                    required
                  />
                  <span>I agree to ERP operational guidelines and role audit tracking.</span>
                </label>
              </div>

              <button type="submit" className="button button-primary login-submit">
                <span>Complete Registration & Launch {regData.role}</span>
                <ArrowRight size={15} />
              </button>
            </form>
          )}

          <div className="security-guarantee">
            <Shield size={13} className="green-text" />
            <span>Multi-Tenant Enterprise Architecture · ISO/IEC 27001 Ready</span>
          </div>
        </div>
      </section>
    </main>
  );
}
