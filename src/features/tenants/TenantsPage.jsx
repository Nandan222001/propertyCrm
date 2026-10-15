import React, { useMemo, useState } from 'react';
import { Building2, Edit2, Eye, KeyRound, Pause, Play, Plus, UserPlus, X } from 'lucide-react';
import { Badge } from '../../components/common/Badge';
import { Mini } from '../../components/common/StatTile';
import { Table } from '../../components/common/DataTable';
import { Pager, usePaged } from '../../components/common/Pager';
import { PLAN_LABEL, platformStats, seatUsage } from '../../utils/tenants';
import { isValidMobile, MOBILE_HINT, limitMobile, MOBILE_INPUT } from '../../utils/phone';
import { TenantModal } from './TenantModal';
import { SuspendModal } from './TenantDialogs';

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const STATUS_FILTERS = ['All', 'ACTIVE', 'SUSPENDED'];

function SeatBar({ tenant }) {
  const { used, pct } = seatUsage(tenant);
  return (
    <div style={{ minWidth: 96 }}>
      <small>{used} / {tenant.max_users} seats</small>
      <div style={{ height: 5, background: '#edf0f4', borderRadius: 3, marginTop: 3 }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: pct >= 90 ? '#d92d20' : '#5565dc' }} />
      </div>
    </div>
  );
}

function AddAdminForm({ onAdd }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [error, setError] = useState('');
  const set = (key, fn = (v) => v) => (e) => setForm({ ...form, [key]: fn(e.target.value) });
  const submit = async (e) => {
    e.preventDefault();
    if (form.name.trim().length < 2) { setError('Name is required'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) { setError('Enter a valid e-mail'); return; }
    if (form.name.replace(/[^A-Za-z]/g, '').length < 4) { setError('Enter a name with at least 4 letters.'); return; }
    if (!isValidMobile(form.phone)) { setError(MOBILE_HINT); return; }
    setError('');
    if (await onAdd(form)) setForm({ name: '', email: '', phone: '' });
  };
  return (
    <form onSubmit={submit} noValidate>
      <div className="form-grid">
        <label>Name<input value={form.name} onChange={set('name')} /></label>
        <label>E-mail<input type="email" value={form.email} onChange={set('email')} /></label>
        <label>Mobile<input value={form.phone} onChange={set('phone', limitMobile)} {...MOBILE_INPUT} /></label>
      </div>
      {error && <p role="alert" style={{ color: '#d92d20', margin: '6px 0 0' }}>{error}</p>}
      <div className="modal-actions" style={{ marginTop: 8 }}>
        <button type="submit" className="button button-white small-btn"><UserPlus size={13} /> Add administrator</button>
      </div>
    </form>
  );
}

function TenantDetail({ tenant, close, onEdit, onSuspend, onActivate, onAddAdmin, onResetPassword }) {
  const usage = tenant.usage || {};
  const tiles = [
    ['Users', `${usage.users ?? 0} / ${tenant.max_users}`], ['Projects', usage.projects ?? 0], ['Plots', usage.plots ?? 0],
    ['Customers', usage.customers ?? 0], ['Bookings', usage.bookings ?? 0], ['Plan', PLAN_LABEL[tenant.plan] || tenant.plan],
  ];
  const admins = tenant.admins || [];
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal modal-wide">
        <div className="modal-head">
          <div>
            <span className="modal-kicker">ORGANISATION · {tenant.public_id} · /{tenant.slug}</span>
            <h2>{tenant.name} <Badge>{tenant.status === 'ACTIVE' ? 'Active' : 'Suspended'}</Badge></h2>
            <p>
              Created {fmtDate(tenant.created_at)}
              {tenant.status === 'SUSPENDED' && ` · Suspended ${fmtDate(tenant.suspended_at)}: ${tenant.suspended_reason || 'no reason recorded'}`}
            </p>
          </div>
          <button className="modal-close" onClick={close} aria-label="Close"><X size={17} /></button>
        </div>

        <div className="agent-tiles">
          {tiles.map(([k, v]) => <div key={k}><small>{k}</small><b>{v}</b></div>)}
        </div>

        {(tenant.contact_name || tenant.contact_email || tenant.contact_phone) && (
          <p className="bill-words">
            Contact: <b>{tenant.contact_name || '—'}</b> · {tenant.contact_email || '—'} · {tenant.contact_phone || '—'}
          </p>
        )}
        {tenant.notes && <p className="bill-words">Notes: {tenant.notes}</p>}

        <h3 className="sheet-h">Administrators</h3>
        <div className="table-scroll data-table">
          <table>
            <thead><tr><th>NAME</th><th>E-MAIL</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
            <tbody>
              {admins.length === 0 && <tr><td colSpan="4">No administrators loaded</td></tr>}
              {admins.map((a) => (
                <tr key={a.id}>
                  <td><b>{a.name}</b></td>
                  <td>{a.email}</td>
                  <td><Badge>{a.must_change_password ? 'Invited' : (a.status === 'ACTIVE' ? 'Active' : a.status)}</Badge></td>
                  <td>
                    <button className="button button-white small-btn" onClick={() => onResetPassword(tenant, a)}>
                      <KeyRound size={12} /> Reset password
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AddAdminForm onAdd={(form) => onAddAdmin(tenant, form)} />

        <div className="modal-actions">
          <button className="button button-white" onClick={() => onEdit(tenant)}><Edit2 size={13} /> Edit</button>
          {tenant.status === 'ACTIVE'
            ? <button className="button button-white" onClick={() => onSuspend(tenant)}><Pause size={13} /> Suspend</button>
            : <button className="button button-primary" onClick={() => onActivate(tenant)}><Play size={13} /> Reactivate</button>}
          <button className="button button-white" onClick={close}>Close</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Platform console: every organisation on the platform. Super admins see tenants and their
 * usage counts here — never a tenant's customers, bookings or payments.
 */
export function TenantsPage({
  tenants, search, loading, error,
  onSave, onSuspend, onActivate, onAddAdmin, onResetPassword, onOpenDetail, onDismissCredential,
}) {
  const [filter, setFilter] = useState('All');
  const [editing, setEditing] = useState(undefined);   // undefined = closed, null = new, tenant = edit
  const [viewing, setViewing] = useState(null);        // tenant id (kept in sync with the store)
  const [suspending, setSuspending] = useState(null);

  const stats = platformStats(tenants);
  const rows = useMemo(() => tenants.filter((t) => {
    const text = [t.name, t.slug, t.contact_email, t.contact_name].join(' ').toLowerCase();
    return text.includes((search || '').toLowerCase()) && (filter === 'All' || t.status === filter);
  }), [tenants, search, filter]);
  const paged = usePaged(rows);
  const viewed = tenants.find((t) => t.id === viewing) || null;

  const open = (tenant) => { setViewing(tenant.id); onOpenDetail?.(tenant); };

  return (
    <>
      <div className="mini-stats four">
        <Mini title="ORGANISATIONS" value={stats.total} />
        <Mini title="ACTIVE" value={stats.active} color="green-text" />
        <Mini title="SUSPENDED" value={stats.suspended} color="amber-text" />
        <Mini title="TOTAL USERS" value={stats.users} color="indigo-text" />
      </div>

      <div className="panel section-panel">
        <div className="tabs">
          {STATUS_FILTERS.map((s) => (
            <button key={s} className={filter === s ? 'selected' : ''} onClick={() => setFilter(s)}>
              {s === 'All' ? `All (${stats.total})` : `${s === 'ACTIVE' ? 'Active' : 'Suspended'} (${s === 'ACTIVE' ? stats.active : stats.suspended})`}
            </button>
          ))}
          <button className="button button-primary small-btn" style={{ marginLeft: 'auto' }} onClick={() => setEditing(null)}>
            <Plus size={12} /> Add Tenant
          </button>
        </div>

        {error && <p className="empty-note" role="alert">Could not load tenants: {error}</p>}
        {loading && <p className="empty-note">Loading organisations…</p>}

        <Table
          headers={['ORGANISATION', 'ADMINISTRATOR', 'PLAN', 'SEATS', 'PROJECTS', 'BOOKINGS', 'STATUS', 'CREATED', 'ACTIONS']}
          rows={paged.rows.map((t) => [
            <div key={`${t.id}-n`}><b>{t.name}</b><div className="cell-sub">/{t.slug}</div></div>,
            <span key={`${t.id}-a`}>{t.admins?.[0]?.email || t.primary_admin_email || t.contact_email || '—'}</span>,
            <Badge key={`${t.id}-p`} tone={t.plan === 'ENTERPRISE' ? 'indigo' : t.plan === 'TRIAL' ? 'amber' : 'green'}>{PLAN_LABEL[t.plan] || t.plan}</Badge>,
            <SeatBar key={`${t.id}-s`} tenant={t} />,
            t.usage?.projects ?? 0,
            t.usage?.bookings ?? 0,
            <Badge key={`${t.id}-st`}>{t.status === 'ACTIVE' ? 'Active' : 'Suspended'}</Badge>,
            fmtDate(t.created_at),
            <div className="table-actions-cell" key={`${t.id}-x`}>
              <button className="icon-action" title="View organisation" onClick={() => open(t)}><Eye size={14} /></button>
              <button className="icon-action" title="Edit organisation" onClick={() => setEditing(t)}><Edit2 size={14} /></button>
              {t.status === 'ACTIVE'
                ? <button className="icon-action" title="Suspend access" onClick={() => setSuspending(t)}><Pause size={14} /></button>
                : <button className="icon-action" title="Reactivate" onClick={() => onActivate(t)}><Play size={14} /></button>}
            </div>,
          ])}
        />
        {rows.length === 0 && (
          <p className="empty-note"><Building2 size={14} /> No organisations match. Use “Add Tenant” to onboard one.</p>
        )}
        <Pager paged={paged} label="organisations" />
      </div>

      {editing !== undefined && (
        <TenantModal editing={editing} tenants={tenants} close={() => setEditing(undefined)} save={onSave} />
      )}
      {viewed && (
        <TenantDetail
          tenant={viewed}
          close={() => setViewing(null)}
          onEdit={(t) => { setViewing(null); setEditing(t); }}
          onSuspend={(t) => { setViewing(null); setSuspending(t); }}
          onActivate={onActivate}
          onAddAdmin={onAddAdmin}
          onResetPassword={onResetPassword}
        />
      )}
      {suspending && <SuspendModal tenant={suspending} close={() => setSuspending(null)} confirm={onSuspend} />}
    </>
  );
}
