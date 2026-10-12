import React from 'react';
import { Building, Landmark, TrendingUp } from 'lucide-react';
import { parseAmt } from '../../utils';
import { compactINR } from '../../utils/dashboardStats';

const money = (n) => { const c = compactINR(n); return `${c.val}${c.unit ? ` ${c.unit}` : ''}`; };
const LIVE = (b) => !['Pending Approval', 'Rejected', 'Cancelled'].includes(b[7]);
const asDate = (label) => { const d = new Date(String(label || '').replace('Sept', 'Sep')); return Number.isNaN(d.getTime()) ? null : d; };
const quarterOf = (d) => `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;

/** A development's stage, from how much of it is already allocated. */
const stage = (absorption) => (absorption >= 75 ? 'Cash Cow' : absorption >= 50 ? 'Steady Sales' : absorption >= 20 ? 'Growth Phase' : 'Launch Phase');

/**
 * Portfolio roll-up for the administrator — a read-only summary of the tenant's own projects, plots, bookings and receipts.
 * (Margins/EBITDA need cost data the ERP does not hold, so they are not shown.)
 */
export function PortfolioInsights({ go, projects = [], plots = [], bookings = [], receipts = [] }) {
  const matrix = projects.map((p) => {
    const mine = plots.filter((x) => x[8] === p[0]);
    const units = mine.length || parseAmt(p[2]);
    const allocated = mine.filter((x) => ['BOOKED', 'SOLD', 'HOLD'].includes(x[5])).length;
    const gdv = mine.reduce((t, x) => t + parseAmt(x[4]), 0);
    const deals = bookings.filter((b) => b[2] === p[0] && LIVE(b));
    const booked = deals.reduce((t, b) => t + parseAmt(b[5]), 0);
    const cash = deals.reduce((t, b) => t + parseAmt(b[6]), 0);
    const absorption = units ? Math.round((allocated / units) * 100) : 0;
    return { name: p[0], where: p[1], units, gdv, absorption, booked, cash, collectedPct: booked ? Math.round((cash / booked) * 100) : 0, stage: stage(absorption) };
  });

  const totalUnits = matrix.reduce((t, m) => t + m.units, 0);
  const allocated = plots.filter((x) => ['BOOKED', 'SOLD', 'HOLD'].includes(x[5])).length;
  const gdv = matrix.reduce((t, m) => t + m.gdv, 0);
  const cash = matrix.reduce((t, m) => t + m.cash, 0);
  const booked = matrix.reduce((t, m) => t + m.booked, 0);
  const absorptionAll = totalUnits ? Math.round((allocated / totalUnits) * 100) : 0;
  const liquidity = gdv ? Math.round((cash / gdv) * 100) : 0;

  // Cash actually received, per calendar quarter (last four).
  const now = new Date();
  const quarters = Array.from({ length: 4 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 3 * (3 - i), 1);
    return { key: quarterOf(d), label: `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`, amount: 0 };
  });
  receipts.forEach((r) => {
    const d = asDate(r.date);
    const q = d && quarters.find((x) => x.key === quarterOf(d));
    if (q) q.amount += parseAmt(r.amount);
  });
  const peak = Math.max(...quarters.map((q) => q.amount), 1);

  const hottest = [...matrix].sort((a, b) => b.absorption - a.absorption)[0];
  const slowestCash = [...matrix].filter((m) => m.booked > 0).sort((a, b) => a.collectedPct - b.collectedPct)[0];
  const pending = bookings.filter((b) => b[7] === 'Pending Approval').length;

  return (
    <div className="role-dashboard management-dash portfolio-insights">
      <div className="mini-stats four">
        <div className="mini-stat">
          <small>PORTFOLIO GDV</small>
          <b className="indigo-text">{money(gdv)}</b>
          <span className="stat-sub">Across {matrix.length} development{matrix.length === 1 ? '' : 's'}</span>
        </div>
        <div className="mini-stat">
          <small>REALISED CASH TO DATE</small>
          <b className="green-text">{money(cash)}</b>
          <span className="stat-sub">{liquidity}% of portfolio GDV</span>
        </div>
        <div className="mini-stat">
          <small>INVENTORY ABSORPTION</small>
          <b className="green-text">{absorptionAll}%</b>
          <span className="stat-sub">{allocated} of {totalUnits} plots booked / sold / held</span>
        </div>
        <div className="mini-stat">
          <small>BOOKED, NOT YET COLLECTED</small>
          <b className="amber-text">{money(Math.max(booked - cash, 0))}</b>
          <span className="stat-sub">{booked ? Math.round((cash / booked) * 100) : 0}% of booked value collected</span>
        </div>
      </div>

      <section className="panel section-panel">
        <div className="panel-head">
          <div>
            <h2>Project Portfolio Performance Matrix</h2>
            <p>Absorption and cash realisation by development</p>
          </div>
          <span className="badge-pill indigo">{matrix.length} Development{matrix.length === 1 ? '' : 's'}</span>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>DEVELOPMENT &amp; LOCATION</th><th>UNITS</th><th>TOTAL GDV</th><th>ABSORPTION</th>
                <th>BOOKED VALUE</th><th>REALISED CASH</th><th>COLLECTED</th><th>STAGE</th>
              </tr>
            </thead>
            <tbody>
              {matrix.length === 0 && <tr><td colSpan={8} className="empty-cell">No projects yet.</td></tr>}
              {matrix.map((m) => (
                <tr key={m.name}>
                  <td>
                    <div className="customer-cell">
                      <div className="avatar avatar-indigo"><Building size={14} /></div>
                      <div><b>{m.name}</b><small>{m.where}</small></div>
                    </div>
                  </td>
                  <td><b>{m.units} Plots</b></td>
                  <td><b className="indigo-text">{money(m.gdv)}</b></td>
                  <td style={{ minWidth: 130 }}>
                    <div className="inline-progress"><div className="inline-bar green" style={{ width: `${m.absorption}%` }} /></div>
                    <small className="muted-text">{m.absorption}% allocated</small>
                  </td>
                  <td><b>{money(m.booked)}</b></td>
                  <td><b className="green-text">{money(m.cash)}</b></td>
                  <td><b className="amber-text">{m.collectedPct}%</b></td>
                  <td><span className={`badge-pill ${m.absorption >= 75 ? 'green' : m.absorption >= 20 ? 'indigo' : 'amber'}`}>{m.stage}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="role-dash-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Cash Received by Quarter</h2>
              <p>Receipts issued in the last four quarters</p>
            </div>
          </div>
          <div className="trajectory-chart">
            {quarters.map((q, i) => (
              <div className={`traj-bar-wrap ${i === quarters.length - 1 ? 'highlight' : ''}`} key={q.key}>
                <div className="traj-bar" style={{ height: `${Math.max(Math.round((q.amount / peak) * 85), q.amount ? 8 : 2)}%` }} />
                <b className="traj-val">{money(q.amount)}</b>
                <small>{q.label}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="panel management-decisions">
          <div className="panel-head">
            <div>
              <h2>Watch List</h2>
              <p>Signals computed from current portfolio data</p>
            </div>
          </div>
          <div className="directive-cards">
            {hottest && hottest.units > 0 && (
              <div className="directive-item">
                <div className="dir-icon green"><TrendingUp size={15} /></div>
                <div>
                  <b>{hottest.name} is {hottest.absorption}% allocated</b>
                  <p>Highest absorption in the portfolio — a candidate for a price review.</p>
                  <button className="text-button" onClick={() => go('Projects & plots')}>Open projects →</button>
                </div>
              </div>
            )}
            {slowestCash && (
              <div className="directive-item">
                <div className="dir-icon amber"><Landmark size={15} /></div>
                <div>
                  <b>{slowestCash.name}: {slowestCash.collectedPct}% of booked value collected</b>
                  <p>{money(Math.max(slowestCash.booked - slowestCash.cash, 0))} still to collect on this development.</p>
                  <button className="text-button" onClick={() => go('Payments')}>Open ledger →</button>
                </div>
              </div>
            )}
            {pending > 0 && (
              <div className="directive-item">
                <div className="dir-icon amber"><Building size={15} /></div>
                <div>
                  <b>{pending} booking{pending === 1 ? '' : 's'} awaiting admin approval</b>
                  <p>Plots stay on hold until the admin confirms them.</p>
                  <button className="text-button" onClick={() => go('Bookings')}>Open bookings →</button>
                </div>
              </div>
            )}
            {!hottest && !slowestCash && pending === 0 && <p className="empty-note">Nothing to flag yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
