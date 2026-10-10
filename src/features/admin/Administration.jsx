import React, { useState, useMemo, useEffect } from 'react';
import {
  LayoutDashboard, Map, ClipboardList, Wallet, Users, Handshake, Percent,
  ChartNoAxesCombined, FolderOpen, Bell, Settings, Shield, Search, Plus,
  Download, ChevronDown, ChevronRight, Menu, X, ArrowUpRight, MoreHorizontal,
  CalendarDays, Building2, House, Receipt, FileText, Clock3, CheckCircle2,
  AlertCircle, SlidersHorizontal, Send, Eye, Edit2, LockKeyhole, RefreshCw,
  FileSpreadsheet, MapPin, IndianRupee, Mail, Phone, Activity, Trash2, LogOut,
  Sparkles, Check, CheckCircle, Printer, MessageCircle
} from 'lucide-react';
import { parseAmt, fmtINR, amountInWords, agentKey, todayLabel, openWhatsApp, waLink, isAdmin, canCreateBooking, canApprove, canCreateCustomer, canRecordPayment, canManageBills, isCustomer, isPendingStatus } from '../../utils';
import { projects, agents, seedUsers } from '../../data/seedData';

import { RoleContextBanner } from '../../components/layout/RoleContextBanner';
import { PAGES } from '../../constants/navigation';
import { getSettings, saveSettingsSection, resetSettingsSection, setRemoteSettings, usesRemoteSettings } from '../../utils/settings';
import { actions } from '../../api';
import { clientAudit } from '../../utils/security';

const GST_CHOICES = [['0', 'Exempt (0%)'], ['0.05', 'GST 5%'], ['0.12', 'GST 12%'], ['0.18', 'GST 18%']];

/** Field spec: [key, label, type, hint, validator(value) -> error string | ''] */
const required = (label) => (v) => (String(v).trim() ? '' : `${label} is required`);
const pattern = (re, msg) => (v) => (!String(v).trim() || re.test(String(v).trim()) ? '' : msg);
const range = (min, max, label) => (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? '' : `${label} must be between ${min} and ${max}`;
};

const MODULES = [
  {
    key: 'company', title: 'Organization profile', icon: Building2,
    desc: 'Company information and legal entity registration',
    fields: [
      ['name', 'Company name', 'text', '', required('Company name')],
      ['address', 'Registered address', 'text', '', required('Address')],
      ['gstin', 'GSTIN', 'text', '27AAACL1234K1ZV', pattern(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/i, 'Enter a valid 15-character GSTIN')],
      ['phone', 'Phone', 'text', '+91 …', pattern(/^[+\d][\d\s-]{6,}$/, 'Enter a valid phone number')],
      ['email', 'Accounts e-mail', 'email', '', pattern(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'Enter a valid e-mail')],
    ],
    summary: (v) => `${v.name} · ${v.gstin || 'no GSTIN'}`,
    note: 'Appears on every receipt, booking form and tax invoice.',
  },
  {
    key: 'tax', title: 'Tax & GST invoicing', icon: Receipt,
    desc: 'Receipt numbering, state GST, TDS withholding percentages',
    fields: [
      ['receiptPrefix', 'Receipt number prefix', 'text', 'RCT', pattern(/^[A-Za-z]{2,6}$/, 'Use 2–6 letters')],
      ['defaultGst', 'Default GST rate on new invoices', 'select', '', null, GST_CHOICES],
      ['tdsRate', 'TDS on commission (%)', 'number', '5', range(0, 30, 'TDS rate')],
      ['dueDays', 'Invoice payment terms (days)', 'number', '15', range(1, 365, 'Payment terms')],
    ],
    summary: (v) => `Prefix ${v.receiptPrefix} · GST ${Number(v.defaultGst) * 100}% · TDS ${v.tdsRate}% · ${v.dueDays} days`,
    note: 'Used by new receipts, new invoices, issue due dates and the TDS report.',
  },
  {
    key: 'bank', title: 'Banking & payment gateways', icon: Wallet,
    desc: 'Escrow account details, NEFT/RTGS accounts, virtual IDs',
    fields: [
      ['bankName', 'Bank name', 'text', '', null],
      ['accountName', 'Account holder name', 'text', '', null],
      ['accountNumber', 'Account number', 'text', '', pattern(/^\d{9,18}$/, 'Account number must be 9–18 digits')],
      ['ifsc', 'IFSC', 'text', 'HDFC0001234', pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/i, 'Enter a valid IFSC (e.g. HDFC0001234)')],
      ['upi', 'UPI ID', 'text', 'name@bank', pattern(/^[\w.-]+@[\w-]+$/, 'Enter a valid UPI ID')],
    ],
    summary: (v) => (v.bankName ? `${v.bankName} · ${v.ifsc || 'no IFSC'}` : 'Not configured'),
    note: 'Printed on payment receipts so customers know where to pay.',
  },
];

function SettingsModal({ module, close, onSaved }) {
  const [values, setValues] = useState(() => ({ ...getSettings()[module.key] }));
  const [errors, setErrors] = useState({});

  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState('');

  /** Live: save on the server (shared by every user); offline: this browser only. */
  const persist = async (section, next) => {
    if (!usesRemoteSettings()) { saveSettingsSection(section, next); return; }
    const response = await actions.saveOrgSettings(section, next);
    setRemoteSettings({ ...getSettings(), [section]: response.data });
  };

  const submit = async (e) => {
    e.preventDefault();
    const found = {};
    module.fields.forEach(([key, , , , validate]) => {
      const message = validate ? validate(values[key]) : '';
      if (message) found[key] = message;
    });
    setErrors(found);
    if (Object.keys(found).length) return;
    const cleaned = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
    if (cleaned.ifsc) cleaned.ifsc = cleaned.ifsc.toUpperCase();
    if (cleaned.gstin) cleaned.gstin = cleaned.gstin.toUpperCase();
    if (cleaned.receiptPrefix) cleaned.receiptPrefix = cleaned.receiptPrefix.toUpperCase();
    setSaving(true); setFailure('');
    try {
      await persist(module.key, cleaned);
    } catch (error) {
      setSaving(false); setFailure(error.message || 'Could not save the settings.');
      return;
    }
    clientAudit('settings.updated', { section: module.key });
    onSaved(`${module.title} saved`);
    close();
  };

  const reset = async () => {
    setSaving(true); setFailure('');
    try {
      if (usesRemoteSettings()) {
        const defaults = module.key === 'company' ? { name: getSettings().company.name, address: '', gstin: '', phone: '', email: '' }
          : module.key === 'tax' ? { receiptPrefix: 'RCT', defaultGst: '0.18', tdsRate: '5', dueDays: '15' }
            : { bankName: '', accountName: '', accountNumber: '', ifsc: '', upi: '' };
        await persist(module.key, defaults);
      } else {
        resetSettingsSection(module.key);
      }
    } catch (error) {
      setSaving(false); setFailure(error.message || 'Could not reset the settings.');
      return;
    }
    clientAudit('settings.reset', { section: module.key });
    onSaved(`${module.title} reset to defaults`);
    close();
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <form className="modal" onSubmit={submit} noValidate>
        <div className="modal-head">
          <div>
            <span className="modal-kicker">ADMINISTRATION</span>
            <h2>{module.title}</h2>
            <p>{module.note}</p>
          </div>
          <button type="button" className="modal-close" onClick={close} aria-label="Close"><X size={17} /></button>
        </div>
        <div className="form-grid">
          {module.fields.map(([key, label, type, hint, , options]) => (
            <label key={key}>
              {label}
              {type === 'select' ? (
                <select value={values[key]} onChange={(e) => setValues({ ...values, [key]: e.target.value })}>
                  {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              ) : (
                <input
                  type={type === 'number' ? 'number' : 'text'} value={values[key] ?? ''} placeholder={hint}
                  onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                />
              )}
              {errors[key] && <small className="field-error" style={{ color: '#d92d20' }}>{errors[key]}</small>}
            </label>
          ))}
        </div>
        {failure && <p className="form-error" role="alert" style={{ color: '#d92d20', margin: '8px 0 0' }}>{failure}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-white" onClick={reset} disabled={saving}>Reset to defaults</button>
          <button type="button" className="button button-white" onClick={close}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={saving}><Check size={13} /> Save changes</button>
        </div>
      </form>
    </div>
  );
}

export function Administration({ notify, role, onNavigate, allowedPages = [] }) {
  const [editing, setEditing] = useState(null);
  const [, refresh] = useState(0);
  const settings = getSettings();

  const links = [
    ['Projects & layout schemas', 'Phase layouts, plot master blueprints and base rates', Map, PAGES.PROJECTS, 'Open projects & plots →'],
    ['User identity & IAM', 'Multi-factor authentication and role assignment policies', Users, PAGES.USERS, 'Open user & role management →'],
  ];
  const openLink = (page, title) => {
    if (onNavigate && allowedPages.includes(page)) onNavigate(page);
    else notify(`${title}: your role cannot open this module`);
  };

  return (
    <>
      <RoleContextBanner role={role} page="Administration" />

      <div className="panel section-panel">
        <div className="panel-head">
          <div>
            <h2>System Master Configuration</h2>
            <p>Global parameters, project schemas, and compliance rules</p>
          </div>
        </div>

        <div className="settings-grid">
          {MODULES.map((module) => (
            <div className="setting-card" key={module.key}>
              <div className="setting-icon"><module.icon size={20} /></div>
              <div>
                <b>{module.title}</b>
                <p>{module.desc}</p>
                <small>{module.summary(settings[module.key])}</small>
                <br />
                <button className="text-button" onClick={() => setEditing(module)}>Configure module →</button>
              </div>
            </div>
          ))}
          {links.map(([title, desc, Icon, page, label]) => (
            <div className="setting-card" key={title}>
              <div className="setting-icon"><Icon size={20} /></div>
              <div>
                <b>{title}</b>
                <p>{desc}</p>
                <button className="text-button" onClick={() => openLink(page, title)}>{label}</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <SettingsModal
          module={editing}
          close={() => setEditing(null)}
          onSaved={(message) => { notify(message); refresh((n) => n + 1); }}
        />
      )}
    </>
  );
}
