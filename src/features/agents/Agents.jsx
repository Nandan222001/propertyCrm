import React, { useCallback, useEffect, useState } from 'react';
import { Eye, Edit2, X, Check, Plus, Trash2, KeyRound } from 'lucide-react';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { fmtINR, parseAmt, isValidMobile, normaliseMobile, MOBILE_HINT } from '../../utils';
import { isAdmin } from '../../utils/permissions';
import { api, actions, hasSession } from '../../api';

import { Table } from '../../components/common/DataTable';
import { Badge } from '../../components/common/Badge';
import { Mini } from '../../components/common/StatTile';
import { Avatar } from '../../components/common/Avatar';
import { RoleContextBanner } from '../../components/layout/RoleContextBanner';
import { limitMobile, MOBILE_INPUT } from '../../utils/phone';
import { usePageLoading } from '../../hooks';
import { pageCache } from '../../utils/pageCache';

const SEES_RATES = ['ADMIN', 'ACCOUNTS', 'SALES MANAGER'];
const pct = (rate) => `${Number((Number(rate) * 100).toFixed(2))}%`;

/** Edit every agent field (admin only; the API enforces it too). */
function EditAgentModal({ agent, close, save }) {
  const [form, setForm] = useState({
    name: agent.name, code: agent.code, phone: agent.phone || '', email: agent.email || '',
    rate: String(Number((agent.rate * 100).toFixed(2))), active: agent.active ? 'ACTIVE' : 'INACTIVE',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key, fn = (v) => v) => (e) => setForm({ ...form, [key]: fn(e.target.value) });
  const submit = async (e) => {
    e.preventDefault();
    const rate = Number(form.rate);
    if (form.name.trim().length < 2) return setError('Enter the agent\'s full name.');
    if (!/^[A-Za-z0-9-]{2,16}$/.test(form.code.trim())) return setError('Code: 2-16 letters, digits or dashes (e.g. AG-031).');
    if (form.phone && !isValidMobile(form.phone)) return setError(MOBILE_HINT);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 25) return setError('Commission rate must be between 0.1% and 25%.');
    setBusy(true);
    const problem = await save(agent, {
      name: form.name.trim(), code: form.code.trim().toUpperCase(),
      ...(form.phone ? { phone: normaliseMobile(form.phone) } : {}),
      ...(form.email ? { email: form.email.trim() } : {}),
      commission_rate: rate / 100, is_active: form.active,
    });
    setBusy(false);
    if (problem) setError(problem); else close();
  };
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <form className="modal view-modal" onSubmit={submit} noValidate>
        <div className="modal-head">
          <div>
            <span className="modal-kicker">EDIT AGENT · {agent.code}</span>
            <h2>{agent.name}</h2>
            <p>A new commission rate applies to future commissions; existing records keep the rate they were calculated at.</p>
          </div>
          <button type="button" className="modal-close" onClick={close} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="form-grid">
          <label>Full name<input value={form.name} onChange={set('name')} autoFocus /></label>
          <label>Agent code<input value={form.code} onChange={set('code')} /></label>
          <label>Mobile<input value={form.phone} onChange={set('phone', limitMobile)} {...MOBILE_INPUT} /></label>
          <label>Email<input value={form.email} onChange={set('email')} type="email" /></label>
          <label>Commission rate (%)<input value={form.rate} onChange={set('rate')} inputMode="decimal" /></label>
          <label>Status
            <select value={form.active} onChange={set('active')}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-white" onClick={close}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}><Check size={13} /> Save changes</button>
        </div>
      </form>
    </div>
  );
}

/** Onboard a sales agent (admin only). The code is what customers/bookings are tagged with. */
function AddAgentModal({ suggestedCode, close, save }) {
  const [form, setForm] = useState({ name: '', code: suggestedCode, phone: '', email: '', rate: '2' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key, fn = (v) => v) => (e) => setForm({ ...form, [key]: fn(e.target.value) });
  const submit = async (e) => {
    e.preventDefault();
    const rate = Number(form.rate);
    if (form.name.trim().length < 2) return setError('Enter the agent\'s full name.');
    if (!/^[A-Za-z0-9-]{2,16}$/.test(form.code.trim())) return setError('Code: 2-16 letters, digits or dashes (e.g. AG-031).');
    if (form.name.replace(/[^A-Za-z]/g, '').length < 4) return setError('Enter a name with at least 4 letters.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return setError('Enter the agent\'s e-mail — it is their sign-in.');
    if (!isValidMobile(form.phone)) return setError(MOBILE_HINT);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 25) return setError('Commission rate must be between 0.1% and 25%.');
    setBusy(true);
    const problem = await save({
      name: form.name.trim(), code: form.code.trim().toUpperCase(),
      ...(form.phone ? { phone: normaliseMobile(form.phone) } : {}),
      ...(form.email ? { email: form.email.trim() } : {}),
      commission_rate: rate / 100,
    });
    setBusy(false);
    if (problem) setError(problem); else close();
  };
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <form className="modal view-modal" onSubmit={submit} noValidate>
        <div className="modal-head">
          <div>
            <span className="modal-kicker">NEW SALES AGENT</span>
            <h2>Add agent</h2>
            <p>Agents are tagged on customers, bookings and commissions by their code.</p>
          </div>
          <button type="button" className="modal-close" onClick={close} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="form-grid">
          <label>Full name<input value={form.name} onChange={set('name')} autoFocus placeholder="Full name" /></label>
          <label>Agent code<input value={form.code} onChange={set('code')} placeholder="Agent code" /></label>
          <label>Mobile<input value={form.phone} onChange={set('phone', limitMobile)} {...MOBILE_INPUT} placeholder="10-digit mobile number" /></label>
          <label>Email<input value={form.email} onChange={set('email')} type="email" placeholder="E-mail address" /></label>
          <label>Commission rate (%)<input value={form.rate} onChange={set('rate')} inputMode="decimal" /></label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-white" onClick={close}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}><Check size={13} /> Add agent</button>
        </div>
      </form>
    </div>
  );
}

export function Agents({ search, notify, role, onView, bookings = [], project = 'All projects' }) {
  const live = hasSession();
  const canEditRate = isAdmin(role) && live;
  const showRate = live && SEES_RATES.includes(role);
  const [rows, setRows] = useState(() => pageCache.get('agents') ?? null);       // null until the first load (live mode)
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [granting, setGranting] = useState(null);

  const load = useCallback(async () => {
    try {
      const [list, board] = await Promise.all([api.agents.list({ page_size: 200 }), actions.agentLeaderboard()]);
      const totals = new Map((board.data || []).map((r) => [r.id, r]));
      const fresh = ((list.data || []).map((a) => {
        const t = totals.get(a.id) || {};
        const rate = Number(a.commission_rate);
        return {
          id: a.id, name: a.name, code: a.code, rate, email: a.email || '', phone: a.phone || '',
          active: a.is_active !== 'INACTIVE', hasLogin: Boolean(a.has_login),
          deals: Number(t.deals) || 0, sales: Number(t.sales) || 0, collected: Number(t.collected) || 0,
        };
      }).sort((x, y) => y.sales - x.sales));
      setRows(pageCache.set('agents', fresh));
    } catch (error) {
      notify(`Could not load agents: ${error.message}`);
      setRows([]);
    }
  }, [notify]);

  useEffect(() => { if (live) load(); }, [live, load]);
  usePageLoading('agents', live && rows === null);

  const saveAgent = async (agent, changes) => {
    try {
      await api.agents.update(agent.id, changes);
      notify(`Agent ${changes.name} updated`);
      await load();
      return '';
    } catch (error) {
      return error.message || 'Could not save the agent.';
    }
  };

  const addAgent = async (body) => {
    try {
      const response = await api.agents.create(body);
      const login = response.data?.login || '';
      notify(`Agent ${body.name} (${body.code}) added. ${login.startsWith('login created')
        ? 'They can sign in with their e-mail and a starting password (first 4 letters of the name + last 5 digits of the mobile — not displayed); they must change it at first sign-in.'
        : login}`);
      await load();
      return '';
    } catch (error) {
      return error.message || 'Could not add the agent.';
    }
  };
  const nextCode = () => {
    const nums = (rows || []).map((r) => Number(String(r.code).replace(/\D/g, '')) || 0);
    return `AG-${String(Math.max(0, ...nums) + 1).padStart(3, '0')}`;
  };

  // Offline preview keeps the sample table; a live tenant only ever sees its own agents.
  const inProject = bookings.filter((b) => b[2] === project && !['Pending Approval', 'Rejected', 'Cancelled'].includes(b[7]));
  const forProject = (r) => {
    if (project === 'All projects') return r;
    const mine = inProject.filter((b) => b[8] === r.name);
    return { ...r, deals: mine.length, sales: mine.reduce((t, b) => t + parseAmt(b[5]), 0), collected: mine.reduce((t, b) => t + parseAmt(b[6]), 0) };
  };
  const view = live
    ? (rows || []).map(forProject).sort((x, y) => y.sales - x.sales).map((r) => ({ ...r, commission: Math.round(r.sales * r.rate) }))
    : [];
  const shown = view.filter((r) => [r.name, r.code].join(' ').toLowerCase().includes(search.toLowerCase()));
  const money = (v) => (live ? `₹${fmtINR(v)}` : `₹${v}`);
  const totalSales = view.reduce((s, r) => s + (live ? r.sales : 0), 0);
  const pool = view.reduce((s, r) => s + (live ? r.commission : 0), 0);

  const headers = ['RANK', 'AGENT NAME', 'CODE', 'DEALS CLOSED', 'GROSS SALES', 'COLLECTED', ...(showRate ? ['RATE'] : []), 'COMMISSION', 'STATUS', 'ACTIONS'];

  return (
    <>
      <RoleContextBanner role={role} page="Agents" />

      <div className="mini-stats four">
        <Mini title="ACTIVE SALES AGENTS" value={live ? view.length : '—'} color="green-text" />
        <Mini title="BOOKINGS" value={live ? view.reduce((s, r) => s + r.deals, 0) : '—'} />
        <Mini title="SALES VALUE" value={live ? `₹${fmtINR(totalSales)}` : '—'} />
        <Mini title="COMMISSION POOL" value={live ? `₹${fmtINR(pool)}` : '—'} color="amber-text" />
      </div>

      <div className="panel section-panel">
        {canEditRate && (
          <div className="crud-heading">
            <div><h2>Sales agents</h2><p>Add agents and edit their details and commission rate. Only the admin can do this.</p></div>
            <button className="button button-primary small-btn" onClick={() => setAdding(true)}><Plus size={13} /> Add Agent</button>
          </div>
        )}
        {live && rows === null ? <p className="empty-note">Loading agents…</p> : (
          <Table
            label="agents"
            headers={headers}
            empty="No agents yet"
            rows={shown.map((r, i) => [
              i + 1,
              <div className="customer-cell"><Avatar name={r.name} i={i} /><b>{r.name}</b></div>,
              r.code,
              r.deals,
              money(r.sales),
              money(r.collected),
              ...(showRate ? [<b key="rate">{pct(r.rate)}</b>] : []),
              money(r.commission),
              <span key="st" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Badge>{r.active === false ? 'Inactive' : 'Active'}</Badge>{live && !r.hasLogin && <Badge>No login</Badge>}</span>,
              <div className="table-actions-cell" key={r.code}>
                <button
                  className="icon-action" title="View agent profile"
                  onClick={() => onView && onView([r.name, r.code, r.deals, live ? fmtINR(r.sales) : r.sales, live ? fmtINR(r.collected) : r.collected, live ? fmtINR(r.commission) : r.commission, '', r.phone || '—', Number(r.rate), live ? { deals: r.deals, sales: r.sales, collected: r.collected, commission: r.commission } : null])}
                >
                  <Eye size={14} />
                </button>
                {canEditRate && (
                  <button className="icon-action" title="Edit agent" onClick={() => setEditing(r)}>
                    <Edit2 size={14} />
                  </button>
                )}
                {canEditRate && !r.hasLogin && (
                  <button className="icon-action" title="Create login (e-mail + starting password)" onClick={() => setGranting(r)}>
                    <KeyRound size={14} />
                  </button>
                )}
                {canEditRate && (
                  <button className="icon-action danger" title="Delete agent" onClick={() => setRemoving(r)}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>,
            ])}
          />
        )}
      </div>
      {adding && <AddAgentModal suggestedCode={nextCode()} close={() => setAdding(false)} save={addAgent} />}
      {granting && (
        <ConfirmDialog
          title="Create login"
          message={`Create a sign-in for ${granting.name}? They log in with their e-mail (${granting.email || 'add one first'}) and a starting password — the first 4 letters of their name plus the last 5 digits of their mobile. It is not displayed, and they must change it at first sign-in.`}
          confirmLabel="Create login"
          onConfirm={async () => {
            try { await api.agents.provisionLogin(granting.id); notify(`Login created for ${granting.name}`); await load(); return ''; }
            catch (error) { return error.message || 'Could not create the login.'; }
          }}
          onCancel={() => setGranting(null)}
        />
      )}
      {removing && (
        <ConfirmDialog
          title="Delete agent"
          message={`Delete ${removing.name} (${removing.code})? Agents with bookings cannot be deleted — set them to inactive instead.`}
          onConfirm={async () => {
            try { await api.agents.remove(removing.id); notify(`Agent ${removing.name} deleted`); await load(); return ''; }
            catch (error) { return error.message || 'Could not delete the agent.'; }
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
      {editing && <EditAgentModal agent={editing} close={() => setEditing(null)} save={saveAgent} />}
    </>
  );
}
