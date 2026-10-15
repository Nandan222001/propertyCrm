import React, { useCallback, useEffect, useState } from 'react';
import { Download, Plus, ShieldCheck, RefreshCw } from 'lucide-react';
import { api, actions, hasSession } from '../../api';
import { parseAmt, fmtINR } from '../../utils';
import { compactINR } from '../../utils/dashboardStats';
import { usePageLoading } from '../../hooks';
import { pageCache } from '../../utils/pageCache';

const money = (n) => { const c = compactINR(n); return `${c.val}${c.unit ? ` ${c.unit}` : ''}`; };
const DAY = 86400000;

/** Days a ledger row is past its next due date (0 when not due yet / no date). */
const daysOver = (row, now) => {
  const due = new Date(String(row[6] || ''));
  if (Number.isNaN(due.getTime())) return 0;
  return Math.max(Math.floor((now - due) / DAY), 0);
};

/**
 * Accounts desk — everything is derived from the tenant's ledger, receipts and commissions.
 * Ledger row: [customer, plot, project, final, paid, pending, nextDue, status, agent].
 */
export function AccountsDashboard({ go, D, notify, pays = [], receipts = [] }) {
  const live = hasSession();
  const [commissions, setCommissions] = useState(() => pageCache.get('accounts-dash') ?? []);
  const [loaded, setLoaded] = useState(!live || pageCache.has('accounts-dash'));
  const [profit, setProfit] = useState(() => pageCache.get('profit-summary') ?? null);
  const [profitLoaded, setProfitLoaded] = useState(!live || pageCache.has('profit-summary'));
  usePageLoading('accounts-dash', !loaded || !profitLoaded);
  const now = new Date();

  const load = useCallback(async () => {
    if (!live) return;
    try {
      const response = await api.commissions.list({ page_size: 200 });
      setCommissions(pageCache.set('accounts-dash', response.data || []));
    } catch { setCommissions([]); }
    setLoaded(true);
  }, [live]);
  useEffect(() => { load(); }, [load, pays.length]);
  useEffect(() => {
    if (!live) return;
    actions.profitSummary()
      .then((response) => setProfit(pageCache.set('profit-summary', response.data || null)))
      .catch(() => setProfit(null))
      .finally(() => setProfitLoaded(true));
  }, [live, pays.length]);

  const collected = pays.reduce((t, r) => t + parseAmt(r[4]), 0);
  const outstanding = pays.reduce((t, r) => t + parseAmt(r[5]), 0);
  const sameDay = (label) => {
    const d = new Date(String(label || '').replace('Sept', 'Sep'));
    return !Number.isNaN(d.getTime()) && d.toDateString() === now.toDateString();
  };
  const todays = receipts.filter((r) => sameDay(r.date));
  const todayAmount = todays.reduce((t, r) => t + parseAmt(r.amount), 0);

  const open = pays.filter((r) => parseAmt(r[5]) > 0);
  const bucket = (min, max) => open.filter((r) => { const d = daysOver(r, now); return d >= min && d <= max; });
  const buckets = [
    ['bucket-normal', '0 – 30 Days (Current)', bucket(0, 30), 'Normal billing cycle'],
    ['bucket-warning', '31 – 60 Days (Follow-up)', bucket(31, 60), 'Reminder due'],
    ['bucket-caution', '61 – 90 Days (Late)', bucket(61, 90), 'Accountant follow-up'],
    ['bucket-danger', '90+ Days (Defaulters)', bucket(91, Infinity), 'Escalate recovery'],
  ].map(([cls, label, rows, note]) => ({ cls, label, rows, note, amount: rows.reduce((t, r) => t + parseAmt(r[5]), 0) }));
  const critical = buckets[2].amount + buckets[3].amount;
  const overdue = open.filter((r) => daysOver(r, now) > 0).sort((a, b) => daysOver(b, now) - daysOver(a, now));

  const approved = commissions.filter((c) => c.status === 'APPROVED');
  const recentPaid = commissions.filter((c) => c.status === 'PAID').slice(0, 3);
  const desk = [...approved, ...recentPaid];

  return (
    <div className="role-dashboard accounts-dash">
      <div className="role-welcome accounts-welcome">
        <div>
          <span className="eyebrow"><i className="live-dot" /> TREASURY, BILLING &amp; FINANCIAL RECONCILIATION</span>
          <h2>Accounts &amp; Collections Command</h2>
          <p>Live receipts, ageing of customer receivables, TDS and commission disbursements.</p>
        </div>
        <div className="welcome-actions">
          <button className="button button-white" onClick={() => go('Payments')}><RefreshCw size={13} /> Open Ledger</button>
          <button className="button button-primary" onClick={() => D('payment')}><Plus size={14} /> Record Payment</button>
        </div>
      </div>

      <div className="mini-stats four">
        <div className="mini-stat">
          <small>TOTAL REALISED COLLECTIONS</small>
          <b className="green-text">{money(collected)}</b>
          <span className="stat-sub">Across {pays.length} ledger account{pays.length === 1 ? '' : 's'}</span>
        </div>
        <div className="mini-stat">
          <small>TODAY&apos;S CASH INFLOW</small>
          <b className="indigo-text">{money(todayAmount)}</b>
          <span className="stat-sub">{todays.length} receipt{todays.length === 1 ? '' : 's'} issued today</span>
        </div>
        <div className="mini-stat">
          <small>OUTSTANDING RECEIVABLES</small>
          <b>{money(outstanding)}</b>
          <span className="stat-sub">{open.length} account{open.length === 1 ? '' : 's'} with a balance</span>
        </div>
        <div className="mini-stat">
          <small>CRITICAL OVERDUE (&gt;60 DAYS)</small>
          <b className="danger-text">{money(critical)}</b>
          <span className="stat-sub">{buckets[2].rows.length + buckets[3].rows.length} account(s) need escalation</span>
        </div>
      </div>

      <section className="panel profit-panel">
        <div className="panel-head">
          <div>
            <h2>Company profit till date</h2>
            <p>Money collected − agent commission − expenses</p>
          </div>
          <button className="text-button" onClick={() => go('Expenses')}>Open Expenses →</button>
        </div>
        <div className="mini-stats four" style={{ marginTop: 12 }}>
          <div className="mini-stat">
            <small>COMPANY PROFIT</small>
            <b className={profit && Number(profit.profit) < 0 ? 'danger-text' : 'green-text'}>{profit ? money(Number(profit.profit)) : '—'}</b>
            <span className="stat-sub">{profit ? `${money(Number(profit.collected))} − ${money(Number(profit.commissions))} − ${money(Number(profit.expenses))}` : 'Not available right now'}</span>
          </div>
        </div>
      </section>

      <section className="panel aging-panel">
        <div className="panel-head">
          <div>
            <h2>Accounts Receivable Ageing</h2>
            <p>Outstanding balances by how long past their due date</p>
          </div>
          <button className="text-button" onClick={() => go('Payments')}><Download size={13} /> Open Ledger</button>
        </div>
        <div className="aging-grid">
          {buckets.map((b) => (
            <div className={`aging-bucket ${b.cls}`} key={b.label}>
              <span className="aging-label">{b.label}</span>
              <b className="aging-amount">{money(b.amount)}</b>
              <div className="aging-progress"><div className="fill" style={{ width: `${outstanding ? Math.round((b.amount / outstanding) * 100) : 0}%` }} /></div>
              <small>{b.note} · {b.rows.length} account{b.rows.length === 1 ? '' : 's'}</small>
            </div>
          ))}
        </div>
      </section>

      <div className="role-dash-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Overdue Recovery Queue</h2>
              <p>Customers past their instalment due date</p>
            </div>
            <button className="text-button" onClick={() => go('Payments')}>View Full Ledger →</button>
          </div>
          <div className="overdue-list">
            {overdue.length === 0 && <p className="empty-note">No overdue instalments — collections are on schedule.</p>}
            {overdue.map((r) => (
              <div className="overdue-card" key={`${r[0]}-${r[1]}`}>
                <div className="overdue-top">
                  <div><b>{r[0]}</b><small>{r[2]} · Plot {r[1]}</small></div>
                  <div className="overdue-val">
                    <b className="danger-text">₹{r[5]}</b>
                    <span className="overdue-tag">{daysOver(r, now)} days overdue</span>
                  </div>
                </div>
                <div className="overdue-actions">
                  <span className="last-notice">Due {r[6]} · Agent {r[8]}</span>
                  <div className="btn-group">
                    <button className="button button-primary small-btn" onClick={() => D('payment')}>Record Payment</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel accounts-disburse-panel">
          <div className="panel-head">
            <div>
              <h2>Agent Payout &amp; TDS Desk</h2>
              <p>{approved.length} approved payout{approved.length === 1 ? '' : 's'} ready for bank release</p>
            </div>
            <button className="text-button" onClick={() => go('Commissions')}>Open Commissions →</button>
          </div>
          <div className="disburse-list">
            {desk.length === 0 && <p className="empty-note">No approved commissions waiting.</p>}
            {desk.map((c) => (
              <div className="disburse-card" key={c.id}>
                <div className="disburse-head">
                  <div><b>{c.agent_name}</b><small>{c.public_id}</small></div>
                  <span className={`badge-pill ${c.status === 'PAID' ? 'green' : 'amber'}`}>{c.status === 'PAID' ? 'Disbursed' : 'Approved'}</span>
                </div>
                <div className="disburse-calc">
                  <div><span>Gross:</span> <b>₹{fmtINR(c.gross_amount)}</b></div>
                  <div><span>TDS:</span> <b className="danger-text">-₹{fmtINR(c.tds_amount)}</b></div>
                  <div className="net-row"><span>Net Payout:</span> <b className="green-text">₹{fmtINR(c.net_amount)}</b></div>
                </div>
                {c.status === 'PAID' ? (
                  <div className="disbursed-stamp"><ShieldCheck size={12} className="green-text" /> Paid · Ref {c.payout_reference || '—'}</div>
                ) : (
                  <button className="button button-primary full-btn" onClick={() => go('Commissions')}>Disburse (₹{fmtINR(c.net_amount)})</button>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
