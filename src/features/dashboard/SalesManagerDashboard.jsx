import React, { useCallback, useEffect, useState } from 'react';
import { Target, Users, Plus, AlertCircle } from 'lucide-react';
import { api, actions, hasSession } from '../../api';
import { parseAmt, fmtINR } from '../../utils';
import { compactINR } from '../../utils/dashboardStats';

const money = (n) => { const c = compactINR(n); return `${c.val}${c.unit ? ` ${c.unit}` : ''}`; };
const LIVE = (b) => !['Pending Approval', 'Rejected', 'Cancelled'].includes(b[7]);
const monthKey = (label) => { const d = new Date(String(label || '')); return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${d.getMonth()}`; };

/**
 * Team view for the sales manager. Every number comes from the tenant's own rows:
 * bookings / customers (props), the agent leaderboard and the commissions awaiting
 * sign-off (API). Nothing is hard-coded.
 */
export function SalesManagerDashboard({ go, D, notify, bookings = [], customers = [] }) {
  const live = hasSession();
  const [team, setTeam] = useState([]);
  const [commissions, setCommissions] = useState([]);

  const load = useCallback(async () => {
    if (!live) return;
    try {
      const [list, board, comm] = await Promise.all([
        api.agents.list({ page_size: 200 }), actions.agentLeaderboard(), api.commissions.list({ page_size: 200 }),
      ]);
      const rates = new Map((list.data || []).map((a) => [a.id, Number(a.commission_rate)]));
      const rows = (board.data || []).map((r) => ({
        id: r.id, name: r.name, code: r.code, deals: Number(r.deals) || 0,
        sales: Number(r.sales) || 0, collected: Number(r.collected) || 0, rate: rates.get(r.id),
      })).sort((a, b) => b.sales - a.sales);
      setTeam(rows);
      setCommissions(comm.data || []);
    } catch (error) {
      notify(`Could not load team data: ${error.message}`);
    }
  }, [live, notify]);

  useEffect(() => { load(); }, [load, bookings.length]);

  const counted = bookings.filter(LIVE);
  const sales = counted.reduce((t, b) => t + parseAmt(b[5]), 0);
  const collected = counted.reduce((t, b) => t + parseAmt(b[6]), 0);
  const pct = sales ? Math.round((collected / sales) * 100) : 0;
  const thisMonth = monthKey(new Date().toDateString());
  const newThisMonth = counted.filter((b) => monthKey(b[4]) === thisMonth).length;
  const activeAgents = team.filter((a) => a.deals > 0).length;
  const submitted = bookings.length;
  const confirmed = bookings.filter((b) => ['Confirmed', 'Processing', 'Agreement', 'Registered'].includes(b[7])).length;
  const approvedCustomers = customers.filter((c) => c.status === 'Approved').length;
  const agreements = bookings.filter((b) => ['Agreement', 'Registered'].includes(b[7])).length;
  const approvalRate = submitted ? Math.round((confirmed / submitted) * 100) : 0;

  const bookingById = new Map(bookings.filter((b) => typeof b[10] === 'number').map((b) => [b[10], b]));
  const queue = commissions.filter((c) => ['PAYABLE', 'PROCESSING', 'ON_HOLD'].includes(c.status));
  const topSales = team[0]?.sales || 0;
  const decide = async (commission, status) => {
    try {
      await actions.commissionDecision(commission.id, { status });
      notify(`Commission for ${commission.agent_name}: ${status.replace('_', ' ').toLowerCase()}`);
      load();
    } catch (error) {
      notify(`Could not save: ${error.message}`);
    }
  };
  const tag = (i, r) => (r.deals === 0 ? 'No deals yet' : i === 0 ? 'Top performer' : r.collected / (r.sales || 1) >= 0.5 ? 'On track' : 'Collections lag');

  return (
    <div className="role-dashboard sales-manager-dash">
      <div className="role-welcome manager-welcome">
        <div>
          <span className="eyebrow"><i className="live-dot" /> SALES LEADERSHIP COMMAND</span>
          <h2>Team Sales Velocity &amp; Collections</h2>
          <p>Live deal flow, agent leaderboard, pipeline and commission sign-offs for your team.</p>
        </div>
        <div className="welcome-actions">
          <button className="button button-white" onClick={() => go('Agents')}><Users size={14} /> View All Agents</button>
          <button className="button button-primary" onClick={() => D('booking')}><Plus size={14} /> Add Team Booking</button>
        </div>
      </div>

      <div className="team-quota-panel">
        <div className="quota-header">
          <div>
            <span className="quota-tag"><Target size={14} /> TEAM COLLECTIONS</span>
            <h3>{money(collected)} Collected <span>of {money(sales)} booked</span></h3>
          </div>
          <div className="quota-right">
            <b>{pct}% Collected</b>
            <small>{money(Math.max(sales - collected, 0))} still to collect</small>
          </div>
        </div>
        <div className="quota-progress-track">
          <div className="quota-fill" style={{ width: `${pct}%` }}><span className="quota-needle" /></div>
        </div>
      </div>

      <div className="mini-stats four">
        <div className="mini-stat">
          <small>ACTIVE TEAM BOOKINGS</small>
          <b className="indigo-text">{counted.length} Deal{counted.length === 1 ? '' : 's'}</b>
          <span className="stat-sub">+{newThisMonth} this month</span>
        </div>
        <div className="mini-stat">
          <small>ACTIVE SALES FORCE</small>
          <b className="green-text">{activeAgents} / {team.length} Agents</b>
          <span className="stat-sub">with at least one deal</span>
        </div>
        <div className="mini-stat">
          <small>AVERAGE TICKET SIZE</small>
          <b>{counted.length ? money(sales / counted.length) : '—'}</b>
          <span className="stat-sub">per confirmed deal</span>
        </div>
        <div className="mini-stat">
          <small>BOOKING APPROVAL RATE</small>
          <b className="amber-text">{approvalRate}%</b>
          <span className="stat-sub">{confirmed} of {submitted} submitted</span>
        </div>
      </div>

      <section className="panel funnel-panel">
        <div className="panel-head">
          <div>
            <h2>Deal Conversion Pipeline</h2>
            <p>From customers added to agreements executed</p>
          </div>
        </div>
        <div className="sales-funnel-steps">
          {[
            ['Customers Added', customers.length, 'All agents', ''],
            ['Customers Approved', approvedCustomers, customers.length ? `${Math.round((approvedCustomers / customers.length) * 100)}% of added` : '—', ''],
            ['Bookings Submitted', submitted, 'Incl. awaiting approval', 'highlight'],
            ['Bookings Confirmed', confirmed, `${approvalRate}% approval rate`, 'highlight-green'],
            ['Agreements Executed', agreements, 'Allotment issued', ''],
          ].map(([label, count, sub, cls], i, all) => (
            <React.Fragment key={label}>
              <div className={`funnel-step ${cls}`}>
                <span className="step-num">0{i + 1}</span>
                <span className="step-count">{count}</span>
                <b>{label}</b>
                <small>{sub}</small>
              </div>
              {i < all.length - 1 && <div className="funnel-arrow">→</div>}
            </React.Fragment>
          ))}
        </div>
      </section>

      <div className="role-dash-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Agent Performance Leaderboard</h2>
              <p>Ranked by booked sales value</p>
            </div>
            <button className="text-button" onClick={() => go('Agents')}>View Full League Table →</button>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>RANK &amp; AGENT</th><th>DEALS</th><th>SALES VALUE</th><th>PROGRESS</th><th>COLLECTED</th><th>STATUS</th><th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {team.length === 0 && <tr><td colSpan={7} className="empty-cell">No agents yet.</td></tr>}
                {team.map((a, i) => (
                  <tr key={a.id}>
                    <td>
                      <div className="customer-cell">
                        <span className={`rank-badge ${i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : ''}`}>#{i + 1}</span>
                        <div><b>{a.name}</b><small>{a.code}</small></div>
                      </div>
                    </td>
                    <td><b>{a.deals}</b></td>
                    <td><b>{money(a.sales)}</b></td>
                    <td style={{ minWidth: 110 }}>
                      <div className="inline-progress"><div className="inline-bar" style={{ width: `${topSales ? Math.round((a.sales / topSales) * 100) : 0}%` }} /></div>
                      <small className="muted-text">{topSales ? Math.round((a.sales / topSales) * 100) : 0}% of top</small>
                    </td>
                    <td><b className="green-text">{money(a.collected)}</b></td>
                    <td><span className="badge-pill indigo">{tag(i, a)}</span></td>
                    <td><button className="button button-white table-btn" onClick={() => go('Agents')}>View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel manager-approvals-panel">
          <div className="panel-head">
            <div>
              <h2>Commission Sign-off Queue</h2>
              <p>{queue.length} commission{queue.length === 1 ? '' : 's'} need manager approval</p>
            </div>
          </div>
          {queue.length === 0 ? (
            <div className="empty-state-box"><AlertCircle size={26} className="green-text" /><b>All caught up</b><p>No commissions are waiting for your sign-off.</p></div>
          ) : (
            <div className="approvals-list">
              {queue.map((c) => {
                const bk = bookingById.get(c.booking_id);
                return (
                  <div className="approval-card" key={c.id}>
                    <div className="app-top">
                      <span className="app-type-tag">COMMISSION</span>
                      <b className="app-val">₹{fmtINR(c.gross_amount)}</b>
                    </div>
                    <h4>Commission sign-off ({Number((Number(c.rate) * 100).toFixed(2))}%){c.status === 'ON_HOLD' ? ' · on hold' : ''}</h4>
                    <p className="app-meta">Client: <b>{bk ? `${bk[1]} · Plot ${bk[3]}` : '—'}</b></p>
                    <p className="app-agent">Agent: <span>{c.agent_name}</span></p>
                    <div className="app-buttons">
                      {c.status !== 'ON_HOLD' && <button className="button button-white small-btn" onClick={() => decide(c, 'ON_HOLD')}>Hold</button>}
                      <button className="button button-primary small-btn" onClick={() => decide(c, 'APPROVED')}>Approve</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
