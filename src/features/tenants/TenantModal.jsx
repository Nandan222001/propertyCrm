import React, { useState } from 'react';
import { Check, Eye, EyeOff, X } from 'lucide-react';
import { PLAN_LABEL, TENANT_PLANS, blankTenantForm, slugify, validateTenant } from '../../utils/tenants';

/** Create (editing = null) or edit an organisation. Creating also provisions its first administrator. */
export function TenantModal({ editing, tenants, close, save }) {
  const [form, setForm] = useState(() => blankTenantForm(editing));
  const [slugTouched, setSlugTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const setAdmin = (key) => (e) => setForm({ ...form, admin: { ...form.admin, [key]: e.target.value } });
  const onName = (e) => {
    const name = e.target.value;
    setForm({ ...form, name, ...(editing || slugTouched ? {} : { slug: slugify(name) }) });
  };

  const submit = async (e) => {
    e.preventDefault();
    const problem = validateTenant(form, { tenants, editing });
    setError(problem);
    if (problem) return;
    setBusy(true);
    const ok = await save(form, editing);
    setBusy(false);
    if (ok) close();
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <form className="modal modal-wide" onSubmit={submit} noValidate>
        <div className="modal-head">
          <div>
            <span className="modal-kicker">{editing ? `EDIT ORGANISATION · ${editing.slug}` : 'NEW ORGANISATION'}</span>
            <h2>{editing ? 'Edit tenant' : 'Add tenant'}</h2>
            <p>
              {editing
                ? 'Changing the plan or seat limit takes effect immediately.'
                : 'Creates an isolated workspace and its first administrator. The organisation can never see another tenant’s data.'}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={close} aria-label="Close"><X size={17} /></button>
        </div>

        <div className="form-grid">
          <label className="span-2">
            Organisation name *
            <input value={form.name} onChange={onName} placeholder="e.g. Skyline Realty" autoFocus />
          </label>
          {!editing && (
            <label>
              Workspace slug
              <input
                value={form.slug} placeholder="auto from name"
                onChange={(e) => { setSlugTouched(true); setForm({ ...form, slug: e.target.value.toLowerCase() }); }}
              />
              <small className="field-hint">Used when customers self-register. Cannot be changed later.</small>
            </label>
          )}
          <label>
            Plan
            <select value={form.plan} onChange={set('plan')}>
              {TENANT_PLANS.map((p) => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}
            </select>
          </label>
          <label>
            User seats *
            <input type="number" min="1" step="1" value={form.max_users} onChange={set('max_users')} />
            {editing && <small className="field-hint">{editing.usage?.users ?? 0} in use</small>}
          </label>
          <label>
            Contact name
            <input value={form.contact_name} onChange={set('contact_name')} />
          </label>
          <label>
            Contact e-mail
            <input type="email" value={form.contact_email} onChange={set('contact_email')} />
          </label>
          <label>
            Contact phone
            <input value={form.contact_phone} onChange={set('contact_phone')} placeholder="+91 …" />
          </label>
          <label className="span-2">
            Notes
            <input value={form.notes} onChange={set('notes')} placeholder="Internal notes (not visible to the tenant)" />
          </label>
        </div>

        {!editing && (
          <>
            <h3 className="sheet-h">First administrator</h3>
            <div className="form-grid">
              <label>
                Name *
                <input value={form.admin.name} onChange={setAdmin('name')} />
              </label>
              <label>
                E-mail * <small className="field-hint">is their sign-in</small>
                <input type="email" value={form.admin.email} onChange={setAdmin('email')} />
              </label>
              <label>
                Phone
                <input value={form.admin.phone} onChange={setAdmin('phone')} />
              </label>
              <label>
                One-time password
                <span style={{ display: 'flex', gap: 6 }}>
                  <input
                    style={{ flex: 1 }} type={showPassword ? 'text' : 'password'} autoComplete="new-password"
                    value={form.admin.temporary_password} onChange={setAdmin('temporary_password')}
                    placeholder="leave blank to generate"
                  />
                  <button type="button" className="icon-action" onClick={() => setShowPassword(!showPassword)} aria-label="Show password">
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </span>
                <small className="field-hint">They must change it at first sign-in.</small>
              </label>
            </div>
          </>
        )}

        {error && <p className="form-error" role="alert" style={{ color: '#d92d20', margin: '8px 0 0' }}>{error}</p>}

        <div className="modal-actions">
          <button type="button" className="button button-white" onClick={close}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>
            <Check size={13} /> {editing ? 'Save changes' : 'Create tenant'}
          </button>
        </div>
      </form>
    </div>
  );
}
