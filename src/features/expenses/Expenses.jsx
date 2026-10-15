import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit2, Plus, Trash2, X } from 'lucide-react';
import { api, actions, hasSession } from '../../api';
import { Table } from '../../components/common/DataTable';
import { Badge } from '../../components/common/Badge';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Mini } from '../../components/common/StatTile';
import { RoleContextBanner } from '../../components/layout/RoleContextBanner';
import { usePageLoading } from '../../hooks';
import { pageCache } from '../../utils/pageCache';

export const EXPENSE_CATEGORIES = [
  'Office rent', 'Salaries', 'Marketing', 'Legal & registration', 'Land development',
  'Travel', 'Utilities', 'Maintenance', 'Other',
];
export const PAYMENT_MODES = ['Cash', 'Bank transfer', 'UPI', 'Cheque'];

const todayIso = () => new Date().toISOString().slice(0, 10);
const rupees = (value) => `₹${(Number(value) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const niceDate = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
/** Keep digits and one dot, at most two decimals — so no letters or signs can be typed into the amount. */
const cleanAmount = (text) => {
  const [whole, ...rest] = String(text).replace(/[^0-9.]/g, '').split('.');
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
};

/** Every page of /expenses (the API caps page_size at 200). */
const loadAllExpenses = async () => {
  const rows = [];
  for (let page = 1; page <= 50; page += 1) {
    const response = await api.expenses.list({ page, page_size: 200 });
    rows.push(...(response.data || []));
    if (!response.meta?.has_next) break;
  }
  return rows;
};

function ExpenseModal({ initial, onSave, close }) {
  const [form, setForm] = useState({
    category: initial?.category || EXPENSE_CATEGORIES[0],
    description: initial?.description || '',
    amount: initial ? String(Number(initial.amount)) : '',
    expense_date: initial?.expense_date || todayIso(),
    paid_to: initial?.paid_to || '',
    payment_mode: initial?.payment_mode || PAYMENT_MODES[0],
    reference: initial?.reference || '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key, transform = (v) => v) => (e) => setForm({ ...form, [key]: transform(e.target.value) });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.description.trim()) return setError('Write a short description of the expense.');
    if (!(Number(form.amount) > 0)) return setError('Enter an amount greater than 0.');
    if (!form.expense_date) return setError('Choose the date of the expense.');
    if (form.expense_date > todayIso()) return setError('Choose today or an earlier date.');
    setBusy(true);
    const problem = await onSave({
      category: form.category,
      description: form.description.trim(),
      amount: Number(form.amount),
      expense_date: form.expense_date,
      paid_to: form.paid_to.trim() || null,
      payment_mode: form.payment_mode,
      reference: form.reference.trim() || null,
    });
    setBusy(false);
    if (problem) setError(problem); else close();
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <form className="modal view-modal" onSubmit={submit} noValidate>
        <div className="modal-head">
          <div>
            <span className="modal-kicker">COMPANY EXPENSE</span>
            <h2>{initial ? 'Edit expense' : 'Add expense'}</h2>
            <p>Money the company spent. It is deducted from company profit.</p>
          </div>
          <button type="button" className="modal-close" onClick={close} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="form-grid">
          <label>Category
            <select value={form.category} onChange={set('category')}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>Amount (₹)
            <input inputMode="decimal" value={form.amount} onChange={set('amount', cleanAmount)} placeholder="0" autoFocus />
          </label>
          <label style={{ gridColumn: '1 / -1' }}>Description
            <input value={form.description} maxLength={200} onChange={set('description')} placeholder="e.g. October office rent" />
          </label>
          <label>Date
            <input type="date" value={form.expense_date} max={todayIso()} onChange={set('expense_date')} />
          </label>
          <label>Payment mode
            <select value={form.payment_mode} onChange={set('payment_mode')}>
              {PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
          <label>Paid to (optional)
            <input value={form.paid_to} maxLength={120} onChange={set('paid_to')} />
          </label>
          <label>Reference no. (optional)
            <input value={form.reference} maxLength={80} onChange={set('reference')} />
          </label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-white" onClick={close}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>{initial ? 'Save changes' : 'Add expense'}</button>
        </div>
      </form>
    </div>
  );
}

/**
 * Expenses desk for the accounts team and the administrator: add / edit / delete company expenses and see the
 * company profit till date (collected − agent commission − expenses), all from the server.
 */
export function Expenses({ search = '', notify, role }) {
  const live = hasSession();
  const [rows, setRows] = useState(() => pageCache.get('expenses') ?? null);
  const [summary, setSummary] = useState(() => pageCache.get('profit-summary') ?? null);
  const [editing, setEditing] = useState(null); // null | 'new' | expense row
  const [removing, setRemoving] = useState(null);

  const load = useCallback(async () => {
    try {
      const [list, totals] = await Promise.all([loadAllExpenses(), actions.profitSummary()]);
      setRows(pageCache.set('expenses', list));
      setSummary(pageCache.set('profit-summary', totals.data || null));
    } catch (error) {
      notify(`Could not load expenses: ${error.message}`);
      setRows((current) => current ?? []);
    }
  }, [notify]);

  useEffect(() => { if (live) load(); }, [live, load]);
  usePageLoading('expenses', live && (rows === null || summary === null));

  const save = async (body) => {
    try {
      if (editing && editing !== 'new') await api.expenses.update(editing.id, body);
      else await api.expenses.create(body);
      notify(editing && editing !== 'new' ? 'Expense updated.' : 'Expense added.');
      await load();
      return '';
    } catch (error) {
      return error.message || 'Could not save the expense.';
    }
  };

  const remove = async () => {
    try {
      await api.expenses.remove(removing.id);
      notify('Expense deleted.');
      await load();
      return '';
    } catch (error) {
      return error.message || 'Could not delete the expense.';
    }
  };

  const needle = search.trim().toLowerCase();
  const visible = useMemo(() => (rows || []).filter((r) => !needle
    || [r.category, r.description, r.paid_to, r.payment_mode, r.reference].some((v) => String(v || '').toLowerCase().includes(needle))), [rows, needle]);
  const shownTotal = visible.reduce((t, r) => t + Number(r.amount || 0), 0);

  const profit = summary ? Number(summary.profit) : 0;
  const money = (key) => (summary ? rupees(summary[key]) : '—');

  return (
    <>
      <RoleContextBanner role={role} page="Expenses" />

      <div className="mini-stats four">
        <Mini title="TOTAL COLLECTED" value={money('collected')} color="green-text" />
        <Mini title="TOTAL COMMISSION" value={money('commissions')} color="amber-text" />
        <Mini title="TOTAL EXPENSES" value={money('expenses')} color="indigo-text" />
        <Mini title="COMPANY PROFIT TILL DATE" value={summary ? rupees(profit) : '—'} color={profit < 0 ? 'danger-text' : 'green-text'} />
      </div>
      <p className="field-hint" style={{ marginTop: 8 }}>Profit = money collected − total agent commission − expenses.</p>

      <div className="panel section-panel">
        <div className="tabs">
          <span className="section-title">Expense register ({visible.length})</span>
          <button type="button" className="button button-primary small-btn" onClick={() => setEditing('new')} style={{ marginLeft: 'auto' }}>
            <Plus size={12} /> Add Expense
          </button>
        </div>

        {live && rows === null ? <p className="empty-note">Loading expenses…</p> : (
          <>
            <Table
              label="expenses"
              headers={['DATE', 'CATEGORY', 'DESCRIPTION', 'PAID TO', 'MODE', 'REFERENCE', 'AMOUNT', 'ACTIONS']}
              rows={visible.map((r) => [
                niceDate(r.expense_date),
                <Badge tone="indigo">{r.category}</Badge>,
                r.description,
                r.paid_to || '—',
                r.payment_mode || '—',
                r.reference || '—',
                <b>{rupees(r.amount)}</b>,
                <div className="row-actions">
                  <button type="button" className="icon-action" title="Edit expense" onClick={() => setEditing(r)}><Edit2 size={14} /></button>
                  <button type="button" className="icon-action" title="Delete expense" onClick={() => setRemoving(r)}><Trash2 size={14} /></button>
                </div>,
              ])}
            />
            {visible.length === 0 && <p className="empty-note">{needle ? 'No expenses match your search.' : 'No expenses yet. Use "Add Expense" to record the first one.'}</p>}
            {visible.length > 0 && <div className="table-pagination"><span>Total of the expenses shown: {rupees(shownTotal)}</span></div>}
          </>
        )}
      </div>

      {editing && <ExpenseModal initial={editing === 'new' ? null : editing} onSave={save} close={() => setEditing(null)} />}
      {removing && (
        <ConfirmDialog
          title="Delete this expense?"
          message={`${removing.category} · ${rupees(removing.amount)} on ${niceDate(removing.expense_date)}. Company profit will go up by this amount.`}
          onConfirm={remove}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  );
}
