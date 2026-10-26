import React, { useState } from 'react';
import { ArrowUpRight, ChevronRight, Download, Plus, Search, CalendarDays } from 'lucide-react';
import { fmtINR } from '../../utils/money';
import { CHART_RANGES, chartRangeDates, compactINR, inventoryStats, rangeSeries, salesStats } from '../../utils/dashboardStats';

export function AdminDashboard({ bookings: allBookings = [], pays: allPays = [], plots: allPlots = [], receipts: allReceipts = null, project = 'All projects', go, D, notify }) {
  const [chartRange, setChartRange] = useState('Last 6 months');
  const [custom, setCustom] = useState({ from: '', to: '' });

  // The project chosen in the sidebar scopes every figure on the overview.
  const all = project === 'All projects';
  const bookings = all ? allBookings : allBookings.filter((b) => b[2] === project);
  const pays = all ? allPays : allPays.filter((p) => p[2] === project);
  const plots = all ? allPlots : allPlots.filter((x) => x[8] === project);
  const sales = salesStats(bookings);
  const inventory = inventoryStats(plots);
  const receipts = allReceipts && (all ? allReceipts : allReceipts.filter((r) => r.project === project));
  const dates = chartRangeDates(chartRange, custom);
  const series = rangeSeries(bookings, receipts, ...(dates || chartRangeDates('Last 6 months')));
  const labelEvery = Math.max(Math.ceil(series.buckets.length / 12), 1);
  const money = (n) => compactINR(n);
  const yTop = compactINR(series.max);

  const stats = [
    { title: 'Total sales value', ...money(sales.sales), foot: `${sales.deals} booking${sales.deals === 1 ? '' : 's'}`, type: 'indigo' },
    { title: 'Total collection', ...money(sales.collected), foot: sales.sales ? `${Math.round((sales.collected / sales.sales) * 100)}% of sales value` : 'No collections yet', type: 'green' },
    { title: 'Pending payments', ...money(sales.pending), foot: 'Balance still to collect', type: 'amber' },
    { title: 'Available plots', val: String(inventory.available), unit: `/ ${inventory.total} plots`, type: 'blue' },
  ];

  return (
    <div className="role-dashboard admin-dash">
      <div className="stats-grid">
        {stats.map((s) => (
          <article className="stat-card" key={s.title}>
            <div className="stat-top">
              {s.title}
              <span className={`stat-icon ${s.type}`}>
                {s.type === 'green' ? '₹' : s.type === 'amber' ? '◷' : s.type === 'blue' ? '⌂' : '↗'}
              </span>
            </div>
            <div className="stat-value">
              {s.val}<span>{s.unit}</span>
            </div>
            {s.type === 'blue' && (
              <div className="progress-track"><span style={{ width: `${inventory.total ? Math.round((inventory.available / inventory.total) * 100) : 0}%` }} /></div>
            )}
            <div className="stat-foot">
              {s.type === 'blue' ? (
                <>{inventory.total ? Math.round((inventory.available / inventory.total) * 100) : 0}% inventory available</>
              ) : (
                <>{s.foot}</>
              )}
            </div>
          </article>
        ))}
      </div>

      <div className="overview-grid">
        <article className="panel sales-panel">
          <div className="panel-head">
            <div>
              <h2>Sales & Collections Velocity</h2>
              <p>Gross booking value vs reconciled bank cash collection</p>
            </div>
            <div className="chart-range">
              <select className="select-mini" value={chartRange} onChange={e => setChartRange(e.target.value)} aria-label="Chart period">
                {CHART_RANGES.map((r) => <option key={r}>{r}</option>)}
              </select>
              {chartRange === 'Custom range' && (
                <>
                  <input type="date" className="select-mini" value={custom.from} max={custom.to || undefined} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label="From date" />
                  <span>to</span>
                  <input type="date" className="select-mini" value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label="To date" />
                </>
              )}
            </div>
          </div>
          {chartRange === 'Custom range' && !dates && <p className="field-hint">Pick both dates (the first on or before the second) — showing the last 6 months meanwhile.</p>}
          <div className="chart-legend">
            <span><i className="legend-dot indigo-dot" />Sales value</span>
            <span><i className="legend-dot green-dot" />Collection</span>
          </div>
          {series.max === 0 ? (
            <p className="empty-note">No sales or collections in this period.</p>
          ) : (
            <>
              <div className="chart-wrap">
                <div className="y-labels">
                  <span>{yTop.val}{yTop.unit && ` ${yTop.unit}`}</span><span /><span /><span>0</span>
                </div>
                <div className="chart">
                  <div className="grid-lines"><i /><i /><i /><i /></div>
                  <div className="bars">
                    {series.buckets.map((m) => (
                      <div className="bar-group" key={m.key} title={`${series.unit === 'week' ? 'Week of ' : ''}${m.label}: sales ₹${fmtINR(m.sales)} · collected ₹${fmtINR(m.collected)}`}>
                        <div className="bar" style={{ height: `${m.salesPct}%` }} />
                        <div className="bar collection" style={{ height: `${m.collectedPct}%` }} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="x-labels">
                {series.buckets.map((m, i) => <span key={m.key}>{i % labelEvery === 0 ? m.label : ''}</span>)}
              </div>
            </>
          )}
        </article>

        <article className="panel inventory-panel">
          <div className="panel-head">
            <div>
              <h2>Inventory Allocation</h2>
              <p>Current distribution across {inventory.total} master plot{inventory.total === 1 ? '' : 's'}</p>
            </div>
            <button className="text-button" onClick={() => go('Projects & plots')}>
              View plots →
            </button>
          </div>
          <div className="donut-area">
            <div className="donut" style={{ background: inventory.gradient }}>
              <div className="donut-center">
                <b>{inventory.total}</b>
                <small>TOTAL PLOTS</small>
              </div>
            </div>
            <div className="donut-legend">
              {inventory.rows.map((r) => (
                <div className="donut-item" key={r.key}>
                  <i style={{ background: r.color }} />
                  <span>{r.label}</span>
                  <b>{r.count} ({r.pct}%)</b>
                </div>
              ))}
            </div>
          </div>
        </article>
      </div>

      <div className="bottom-grid">
        <article className="panel recent-panel">
          <div className="panel-head">
            <div>
              <h2>Recent Customer Bookings</h2>
              <p>Auditable booking registrations awaiting processing</p>
            </div>
            <button className="text-button" onClick={() => go('Bookings')}>
              View all bookings →
            </button>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>CUSTOMER</th>
                  <th>PROJECT & PLOT</th>
                  <th>VALUE</th>
                  <th>STATUS</th>
                  <th>ASSIGNED AGENT</th>
                </tr>
              </thead>
              <tbody>
                {bookings.slice(0, 5).map((b, i) => (
                  <tr key={b[0]}>
                    <td>
                      <div className="customer-cell">
                        <div className={`avatar avatar-${['peach', 'mint', 'lilac', 'sky', 'rose'][i % 5]}`}>
                          {b[1].substring(0, 2)}
                        </div>
                        <div>
                          <b>{b[1]}</b>
                          <small>{b[0]}</small>
                        </div>
                      </div>
                    </td>
                    <td><b>{b[2]}</b> <span className="muted-text">({b[3]})</span></td>
                    <td><b>₹{b[5]}</b></td>
                    <td>
                      <span className={`badge-pill ${b[7] === 'Confirmed' ? 'green' : 'indigo'}`}>
                        {b[7]}
                      </span>
                    </td>
                    <td>{b[8]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel reminders-panel">
          <div className="panel-head">
            <div>
              <h2>Operational Reminders</h2>
              <p>Collection & follow-up queue</p>
            </div>
            <button className="text-button" onClick={() => go('Payments')}>
              Ledger →
            </button>
          </div>
          <div className="reminder-list">
            {pays.slice(0, 4).map((p, i) => (
              <div className="reminder-item" key={i}>
                <div>
                  <b>{p[0]}</b>
                  <small>{p[2]} · Plot {p[1]}</small>
                </div>
                <div className="reminder-right">
                  <b className={p[7] === 'OVERDUE' ? 'danger-text' : p[7] === 'PAID' ? 'green-text' : ''}>
                    ₹{p[5]}
                  </b>
                  <span className={`badge-pill ${p[7] === 'OVERDUE' ? 'danger' : p[7] === 'PAID' ? 'green' : 'amber'}`}>
                    {p[7]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}
