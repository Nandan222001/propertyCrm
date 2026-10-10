import React, { useEffect, useState } from 'react';
import { Target, Plus, Phone, MapPin, Award, AlertCircle } from 'lucide-react';
import { api, hasSession } from '../../api';
import { parseAmt, fmtINR } from '../../utils';

const crLakh = (n) => (n >= 10000000 ? `₹${(n / 10000000).toFixed(2)} Cr` : n >= 100000 ? `₹${(n / 100000).toFixed(2)} L` : `₹${fmtINR(n)}`);
const OPEN = (b) => b[7] !== 'Rejected' && b[7] !== 'Cancelled';

/**
 * The agent's own desk. Everything here derives from `bookings` (already limited to this
 * agent by the API), the commissions this agent may see, and shared plot inventory —
 * never from other agents' deals.
 */
export function SalesAgentDashboard({ go, D, notify, agentName = '', bookings = [], plots = [] }) {
  const live = hasSession();
  const [commissions, setCommissions] = useState([]);

  useEffect(() => {
    if (!live) return;
    api.commissions.list({ page_size: 200 })
      .then((response) => setCommissions(response.data || []))
      .catch(() => setCommissions([]));
  }, [live, bookings.length]);

  const mine = bookings.filter(OPEN);
  const confirmed = mine.filter((b) => b[7] !== 'Pending Approval');
  const sales = confirmed.reduce((t, b) => t + parseAmt(b[5]), 0);
  const collected = confirmed.reduce((t, b) => t + parseAmt(b[6]), 0);
  const pct = sales ? Math.min(100, Math.round((collected / sales) * 100)) : 0;
  const pending = mine.filter((b) => b[7] === 'Pending Approval');

  const commissionByBooking = new Map(commissions.map((c) => [c.booking_id, c]));
  const total = commissions.reduce((t, c) => t + Number(c.gross_amount || 0), 0);
  const paid = commissions.filter((c) => c.status === 'PAID').reduce((t, c) => t + Number(c.gross_amount || 0), 0);
  const approved = commissions.filter((c) => c.status === 'APPROVED').reduce((t, c) => t + Number(c.gross_amount || 0), 0);
  const commissionFor = (b) => {
    const c = commissionByBooking.get(b[10]);
    return c ? `₹${fmtINR(c.gross_amount)}` : '—';
  };

  const dues = confirmed.filter((b) => parseAmt(b[5]) - parseAmt(b[6]) > 0);
  const available = plots.filter((p) => p[5] === 'AVAILABLE').slice(0, 4);

  return (
    <div className="role-dashboard sales-agent-dash">
      <div className="role-welcome agent-welcome">
        <div>
          <span className="eyebrow"><i className="live-dot" /> FIELD AGENT WORKSPACE{agentName ? ` · ${agentName.toUpperCase()}` : ''}</span>
          <h2>My Sales Desk &amp; Deal Flow</h2>
          <p>Your own deals, customers and commissions — nothing from other agents appears here.</p>
        </div>
        <div className="welcome-actions">
          <button className="button button-white" onClick={() => go('Projects & plots')}>
            <MapPin size={14} /> Available Inventory
          </button>
          <button className="button button-primary" onClick={() => D('booking')}>
            <Plus size={14} /> Quick Book Plot
          </button>
        </div>
      </div>

      <div className="agent-spotlight-grid">
        <div className="panel spotlight-card target-spotlight">
          <div className="spotlight-top">
            <span className="eyebrow"><Target size={13} /> MY SALES</span>
            <span className="badge-pill green">{pct}% collected</span>
          </div>
          <div className="spotlight-vals">
            <h3>{crLakh(sales)} <small>booked value</small></h3>
            <p>{crLakh(collected)} collected · {crLakh(Math.max(sales - collected, 0))} still to collect</p>
          </div>
          <div className="spotlight-track"><div className="spotlight-fill" style={{ width: `${pct}%` }} /></div>
          <div className="spotlight-foot">
            <span><b>{confirmed.length}</b> confirmed deal{confirmed.length === 1 ? '' : 's'}</span>
            <span><b>{pending.length}</b> awaiting admin approval</span>
          </div>
        </div>

        <div className="panel spotlight-card commission-spotlight">
          <div className="spotlight-top">
            <span className="eyebrow"><Award size={13} /> MY COMMISSIONS</span>
            <button className="text-button" onClick={() => go('Commissions')}>View Slips →</button>
          </div>
          <div className="spotlight-vals">
            <h3 className="green-text">{live ? `₹${fmtINR(total)}` : '—'}</h3>
            <p>Accrued on your confirmed deals</p>
          </div>
          <div className="commission-meta-pills">
            <div className="meta-pill"><small>Disbursed to bank</small><b>{live ? `₹${fmtINR(paid)}` : '—'}</b></div>
            <div className="meta-pill highlight"><small>Approved / due</small><b>{live ? `₹${fmtINR(approved)}` : '—'}</b></div>
          </div>
        </div>
      </div>

      <div className="role-dash-grid">
        <section className="panel agent-schedule-panel">
          <div className="panel-head">
            <div>
              <h2>Needs your attention</h2>
              <p>{pending.length + dues.length} item{pending.length + dues.length === 1 ? '' : 's'} on your deals</p>
            </div>
          </div>
          <div className="task-checklist">
            {pending.length + dues.length === 0 && <p className="empty-note">Nothing pending — all your deals are up to date.</p>}
            {pending.map((b) => (
              <div className="task-row" key={`p-${b[0]}`} onClick={() => go('Bookings')}>
                <AlertCircle size={18} className="muted-text" />
                <div className="task-info">
                  <span className="task-time">Awaiting admin approval</span>
                  <p className="task-text">{b[0]} · {b[1]} · Plot {b[3]} ({b[2]})</p>
                </div>
                <span className="task-priority medium">Pending</span>
              </div>
            ))}
            {dues.map((b) => (
              <div className="task-row" key={`d-${b[0]}`} onClick={() => go('Bookings')}>
                <AlertCircle size={18} className="muted-text" />
                <div className="task-info">
                  <span className="task-time">Balance ₹{fmtINR(parseAmt(b[5]) - parseAmt(b[6]))} to collect</span>
                  <p className="task-text">{b[0]} · {b[1]} · Plot {b[3]} ({b[2]})</p>
                </div>
                <span className="task-priority normal">Follow up</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel agent-quick-reserve">
          <div className="panel-head">
            <div><h2>Quick Plot Availability</h2><p>Open inventory you can book</p></div>
          </div>
          <div className="mini-inventory-list">
            {available.length === 0 && <p className="empty-note">No plots are available right now.</p>}
            {available.map((p) => (
              <div className="mini-inv-item" key={`${p[8]}-${p[0]}`}>
                <div><b>Plot {p[0]}</b><small>{p[8]} · {p[2]} sqft · {p[3]}</small></div>
                <span className="badge-pill green">Available</span>
                <button className="button button-primary table-btn" onClick={() => D('booking', { project: p[8], plot: p[0] })}>Book</button>
              </div>
            ))}
          </div>
          <button className="full-width-btn" onClick={() => go('Projects & plots')}>Open Master Plot Map &amp; Rate Card →</button>
        </section>
      </div>

      <section className="panel section-panel">
        <div className="panel-head">
          <div>
            <h2>My Customer Deals</h2>
            <p>Payment progress and commission on your own bookings</p>
          </div>
          <button className="text-button" onClick={() => go('Bookings')}>View All My Bookings →</button>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>CLIENT NAME</th><th>PROJECT &amp; PLOT</th><th>DEAL VALUE</th><th>PAID AMOUNT</th>
                <th>PAYMENT MILESTONE</th><th>STAGE</th><th>MY COMM.</th><th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {mine.length === 0 && <tr><td colSpan={8} className="empty-cell">No deals yet — book a plot for one of your customers.</td></tr>}
              {mine.map((b) => {
                const progress = parseAmt(b[5]) ? Math.min(100, Math.round((parseAmt(b[6]) / parseAmt(b[5])) * 100)) : 0;
                return (
                  <tr key={b[0]}>
                    <td>
                      <div className="customer-cell">
                        <div className="avatar avatar-mint">{b[1].substring(0, 2)}</div>
                        <div><b>{b[1]}</b><small>{b[0]}</small></div>
                      </div>
                    </td>
                    <td><b>{b[2]}</b> <span className="muted-text">({b[3]})</span></td>
                    <td><b>₹{b[5]}</b></td>
                    <td><span className="green-text font-bold">₹{b[6]}</span></td>
                    <td style={{ minWidth: 120 }}>
                      <div className="inline-progress"><div className="inline-bar green" style={{ width: `${progress}%` }} /></div>
                      <small className="muted-text">{progress}% collected</small>
                    </td>
                    <td><span className="badge-pill indigo">{b[7]}</span></td>
                    <td><b className="green-text">{commissionFor(b)}</b></td>
                    <td>
                      <button className="button button-white table-btn" onClick={() => notify(`Open Customers to contact ${b[1]}`)}>
                        <Phone size={11} /> Contact
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
