import React, { useCallback, useEffect, useState } from 'react';
import { Eye, X } from 'lucide-react';
import { parseAmt, fmtINR } from '../../utils';
import { api, hasSession } from '../../api';

import { Table } from '../../components/common/DataTable';
import { Mini } from '../../components/common/StatTile';
import { RoleContextBanner } from '../../components/layout/RoleContextBanner';
import { usePageLoading } from '../../hooks';
import { pageCache } from '../../utils/pageCache';

/** One deal: the commission rows (one per customer payment) are rolled up into a single line. */
export function groupDeals(rows, bookingByNo) {
  const groups = new Map();
  rows.forEach((r) => {
    const key = r[8] ?? `manual-${r[7]}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });
  return [...groups.values()].map((list) => {
    const first = list[0];
    const booking = bookingByNo.get(first[8]);
    // A cancelled payment no longer counts: it stays in the list (marked) but not in the totals.
    const active = list.filter((r) => r[6] !== 'CANCELLED');
    const received = active.reduce((t, r) => t + r[11], 0);
    const earned = active.reduce((t, r) => t + r[12], 0);
    const dealValue = booking ? parseAmt(booking[5]) : received;
    const statuses = [...new Set(active.map((r) => r[6]))];
    const status = !active.length ? 'CANCELLED' : statuses.length === 1 ? statuses[0] : (statuses.includes('PAID') ? 'PARTLY PAID' : 'PARTLY APPROVED');
    return {
      key: first[8] ?? `manual-${first[7]}`, agent: first[0], project: first[1], plot: first[2], rate: first[10],
      dealValue, received, earned, remaining: Math.max(dealValue - received, 0), status, list,
      ids: (statusName) => list.filter((r) => r[6] === statusName).map((r) => r[7]),
    };
  });
}

function CommissionSlip({ deal, close }) {
  const { agent, project, plot, rate, dealValue, received, earned, remaining, status, list } = deal;
  const pct = `${Number((rate * 100).toFixed(2))}%`;
  const upcoming = Math.round(remaining * rate);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal">
        <div className="modal-head">
          <div>
            <span className="modal-kicker">COMMISSION · {project} · Plot {plot}</span>
            <h2>{agent}</h2>
            <p>{status === 'CANCELLED' ? 'All payments on this deal were cancelled' : `${list.filter((r) => r[6] !== 'CANCELLED').length} payment(s) recorded`}</p>
          </div>
          <button className="modal-close" onClick={close} aria-label="Close"><X size={17} /></button>
        </div>
        <div className="agent-tiles">
          <div><small>Deal value</small><b>₹{fmtINR(dealValue)}</b></div>
          <div><small>Received so far</small><b>₹{fmtINR(received)}</b></div>
          <div><small>Still to come</small><b>₹{fmtINR(remaining)}</b></div>
        </div>
        <div className="agent-tiles">
          <div><small>Commission rate</small><b>{pct}</b></div>
          <div><small>Commission earned</small><b>₹{fmtINR(earned)}</b></div>
          <div><small>Commission still to come</small><b>₹{fmtINR(upcoming)}</b></div>
        </div>
        <h3 className="sheet-h">Payments received and commission on each</h3>
        <table className="inv2-items">
          <thead><tr><th>DATE</th><th className="num">PAYMENT</th><th>RATE</th><th className="num">COMMISSION</th><th></th></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r[7]} style={r[6] === 'CANCELLED' ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>
                <td>{dayLabel(r[9])}</td>
                <td className="num">₹{fmtINR(r[11])}</td>
                <td>{r[4]}</td>
                <td className="num">₹{r[5]}</td>
                <td>{r[6] === 'CANCELLED' ? <b>CANCELLED</b> : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="bill-words">Commission is earned at {pct} on every payment the customer makes, until the deal is fully paid.</p>
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
    c.booking_id ?? null, c.received_on || c.created_at || '', Number(c.rate), Number(c.deal_value), Number(c.gross_amount),
  ];
};

const dayLabel = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export function Commissions({ search, notify, role, bookings = [], project = 'All projects' }) {
  const live = hasSession();
  const [viewing, setViewing] = useState(null);
  const [rows, setRows] = useState(() => pageCache.get('commissions') ?? null);

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

  // The server already returns only the commissions this role may see (an agent: their own).
  const data = (live ? (rows || []) : []).filter((r) => project === 'All projects' || r[1] === project);
  const bookingByNo = new Map(bookings.filter((b) => typeof b[10] === 'number').map((b) => [b[10], b]));
  const deals = groupDeals(data, bookingByNo);
  const counted = deals.filter((d) => d.status !== 'CANCELLED');
  const stats = live
    ? [
      ['COMMISSION EARNED', crLakh(counted.reduce((t, d) => t + d.earned, 0)), 'green-text'],
      ['PAYMENTS RECEIVED', crLakh(counted.reduce((t, d) => t + d.received, 0)), ''],
      ['COMMISSION STILL TO COME', crLakh(counted.reduce((t, d) => t + Math.round(d.remaining * d.rate), 0)), 'amber-text'],
      ['DEALS', String(counted.length), ''],
    ]
    : [['COMMISSION EARNED', '—', ''], ['PAYMENTS RECEIVED', '—', ''], ['COMMISSION STILL TO COME', '—', ''], ['DEALS', '—', '']];

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
            headers={['AGENT', 'PROJECT', 'PLOT', 'DEAL VALUE', 'RECEIVED', 'COMM. RATE', 'COMMISSION (₹)', 'LAST PAYMENT', 'VIEW']}
            empty="No commissions yet — one is recorded automatically each time a customer pays"
            rows={deals
              .filter((d) => [d.agent, d.project, d.plot].join(' ').toLowerCase().includes(search.toLowerCase()))
              .map((d) => {
                const last = d.list.filter((r) => r[6] !== 'CANCELLED').map((r) => r[9]).sort().pop();
                return [
                  <b>{d.agent}</b>,
                  d.project,
                  d.plot,
                  `₹${fmtINR(d.dealValue)}`,
                  `₹${fmtINR(d.received)}`,
                  `${Number((d.rate * 100).toFixed(2))}%`,
                  `₹${fmtINR(d.earned)}`,
                  dayLabel(last),
                  <div className="table-actions-cell" key={d.key}>
                    <button className="icon-action" onClick={() => setViewing(d)} title="View each payment and its commission">
                      <Eye size={14} />
                    </button>
                  </div>,
                ];
              })}
          />
        )}
      </div>
      {viewing && <CommissionSlip deal={viewing} close={() => setViewing(null)} />}
    </>
  );
}
