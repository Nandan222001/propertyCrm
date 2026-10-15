import React, { useCallback, useEffect, useState } from 'react';
import { Eye, X } from 'lucide-react';
import { parseAmt, fmtINR } from '../../utils';
import { api, actions, hasSession } from '../../api';

import { Table } from '../../components/common/DataTable';
import { Badge } from '../../components/common/Badge';
import { Mini } from '../../components/common/StatTile';
import { RoleContextBanner } from '../../components/layout/RoleContextBanner';
import { usePageLoading } from '../../hooks';
import { pageCache } from '../../utils/pageCache';

const STAGES = ['PROCESSING', 'APPROVED', 'PAYABLE', 'PAID'];

function CommissionSlip({ row, close }) {
  const [agent, project, plot, dealValue, slab, amount, status] = row;
  const deal = parseAmt(dealValue);
  const rate = parseFloat(slab) / 100;
  const stageIndex = STAGES.indexOf(status);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal">
        <div className="modal-head">
          <div>
            <span className="modal-kicker">COMMISSION SLIP · {project} · Plot {plot}</span>
            <h2>{agent}</h2>
            <p>Status: {status}</p>
          </div>
          <button className="modal-close" onClick={close} aria-label="Close"><X size={17} /></button>
        </div>
        <div className="agent-tiles">
          <div><small>Deal value</small><b>₹{dealValue}</b></div>
          <div><small>Commission slab</small><b>{slab}</b></div>
          <div><small>Commission amount</small><b>₹{amount}</b></div>
        </div>
        <h3 className="sheet-h">Calculation</h3>
        <p className="bill-words">
          ₹{fmtINR(deal)} × {slab} = <b>₹{fmtINR(Math.round(deal * rate))}</b>
          {Math.round(deal * rate) !== parseAmt(amount) && ` (recorded amount ₹${amount})`}
        </p>
        <h3 className="sheet-h">Payout progress</h3>
        <p className="bill-words">
          {status === 'ON HOLD'
            ? 'On hold — payout is paused until the hold is released.'
            : STAGES.map((st, i) => (i <= stageIndex ? `✓ ${st}` : `○ ${st}`)).join('  →  ')}
        </p>
        <div className="modal-actions"><button className="button button-white" onClick={close}>Close</button></div>
      </div>
    </div>
  );
}

const STATUS_LABEL = (status) => String(status || '').replace(/_/g, ' ');
const crLakh = (n) => (n >= 10000000 ? `₹${(n / 10000000).toFixed(2)} Cr` : n >= 100000 ? `₹${(n / 100000).toFixed(2)} L` : `₹${fmtINR(n)}`);

/** One API commission -> the table row ([agent, project, plot, deal, slab, amount, status, id]). */
export const toRow = (c, bookingById) => {
  const booking = bookingById.get(c.booking_id);
  return [
    c.agent_name || '—', booking?.[2] || '—', booking?.[3] || '—', fmtINR(c.deal_value),
    `${Number((Number(c.rate) * 100).toFixed(2))}%`, fmtINR(c.gross_amount), STATUS_LABEL(c.status), c.id,
  ];
};

/** Bank reference is mandatory before a commission can be marked paid. */
function PayoutModal({ row, close, save }) {
  const [ref, setRef] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (ref.trim().length < 4) { setError('Enter the bank / NEFT reference.'); return; }
    const problem = await save(row, 'PAID', ref.trim());
    if (problem) setError(problem); else close();
  };
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <form className="modal view-modal" onSubmit={submit} noValidate>
        <div className="modal-head">
          <div><span className="modal-kicker">DISBURSE COMMISSION</span><h2>{row[0]} · ₹{row[5]}</h2><p>{row[1]} · Plot {row[2]}</p></div>
          <button type="button" className="modal-close" onClick={close} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="form-grid">
          <label>Payout reference (NEFT / UTR)<input value={ref} onChange={(e) => setRef(e.target.value)} autoFocus /></label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-white" onClick={close}>Cancel</button>
          <button type="submit" className="button button-primary">Mark as paid</button>
        </div>
      </form>
    </div>
  );
}

export function Commissions({ search, notify, role, bookings = [], project = 'All projects' }) {
  const live = hasSession();
  const [viewing, setViewing] = useState(null);
  const [paying, setPaying] = useState(null);
  const [rows, setRows] = useState(() => pageCache.get('commissions') ?? null);
  const isManager = role === 'SALES MANAGER' || role === 'ADMIN';
  const isAccounts = role === 'ACCOUNTS' || role === 'ADMIN';

  const load = useCallback(async () => {
    try {
      const response = await api.commissions.list({ page_size: 200 });
      const byId = new Map(bookings.filter((b) => typeof b[10] === 'number').map((b) => [b[10], b]));
      setRows(pageCache.set('commissions', (response.data || []).map((c) => toRow(c, byId))));
    } catch (error) {
      notify(`Could not load commissions: ${error.message}`);
      setRows([]);
    }
  }, [bookings, notify]);

  useEffect(() => { if (live) load(); }, [live, load]);
  usePageLoading('commissions', live && rows === null);

  const decide = async (row, status, reference) => {
    try {
      await actions.commissionDecision(row[7], { status, ...(reference ? { payout_reference: reference } : {}) });
      notify(`Commission for ${row[0]}: ${STATUS_LABEL(status).toLowerCase()}`);
      await load();
      return '';
    } catch (error) {
      return error.message || 'Could not save the decision.';
    }
  };

  // The server already returns only the commissions this role may see (an agent: their own).
  const data = (live ? (rows || []) : []).filter((r) => project === 'All projects' || r[1] === project);
  const sum = (filter) => data.filter(filter).reduce((t, r) => t + parseAmt(r[5]), 0);
  const stats = live
    ? [
      ['TOTAL COMMISSIONS', crLakh(sum(() => true)), ''],
      ['DISBURSED TO DATE', crLakh(sum((r) => r[6] === 'PAID')), 'green-text'],
      ['READY FOR DISBURSAL', crLakh(sum((r) => r[6] === 'APPROVED')), 'indigo-text'],
      ['PENDING APPROVAL', crLakh(sum((r) => ['PAYABLE', 'PROCESSING'].includes(r[6]))), 'amber-text'],
    ]
    : [['TOTAL COMMISSIONS', '—', ''], ['DISBURSED TO DATE', '—', ''], ['READY FOR DISBURSAL', '—', ''], ['PENDING APPROVAL', '—', '']];

  return (
    <>
      <RoleContextBanner role={role} page="Commissions" />

      <div className="mini-stats four">
        {stats.map(([title, value, color]) => <Mini key={title} title={title} value={value} color={color || undefined} />)}
      </div>

      <div className="panel section-panel">
        {live && rows === null ? <p className="empty-note">Loading commissions…</p> : (
          <Table
            label="commissions"
            headers={['AGENT', 'PROJECT', 'PLOT', 'DEAL VALUE', 'COMM. SLAB', 'AMOUNT (₹)', 'STATUS', 'ACTIONS']}
            empty="No commissions yet"
            rows={data.filter(a => a.join(' ').toLowerCase().includes(search.toLowerCase())).map(a => [
              <b>{a[0]}</b>,
              a[1],
              a[2],
              `₹${a[3]}`,
              a[4],
              `₹${a[5]}`,
              <Badge>{a[6]}</Badge>,
              <div className="table-actions-cell" key={`${a[0]}-${a[2]}-${a[7] ?? ''}`}>
                <button className="icon-action" onClick={() => setViewing(a)} title="Inspect calculation">
                  <Eye size={14} />
                </button>
                {isManager && ['PROCESSING', 'PAYABLE', 'ON HOLD'].includes(a[6]) && (
                  <button
                    className="button button-white small-btn"
                    onClick={() => (live ? decide(a, 'APPROVED') : notify(`Approved commission for ${a[0]}`))}
                  >
                    {a[6] === 'ON HOLD' ? 'Release & approve' : 'Approve'}
                  </button>
                )}
                {isAccounts && a[6] === 'APPROVED' && (
                  <button
                    className="button button-primary small-btn"
                    onClick={() => (live ? setPaying(a) : notify(`NEFT payout initiated for ${a[0]}`))}
                  >
                    Disburse
                  </button>
                )}
              </div>
            ])}
          />
        )}
      </div>
      {viewing && <CommissionSlip row={viewing} close={() => setViewing(null)} />}
      {paying && <PayoutModal row={paying} close={() => setPaying(null)} save={decide} />}
    </>
  );
}
