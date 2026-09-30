import React, { useState } from 'react';
import { ArrowUpRight, ChevronRight, Download, Plus, Search, CalendarDays } from 'lucide-react';

export function AdminDashboard({ bookings = [], pays = [], go, D, notify }) {
  const [chartRange, setChartRange] = useState('Last 6 months');

  const stats = [
    { title: 'Total sales value', val: '₹12.6', unit: 'Cr', trend: '↗ 12.8%', type: 'indigo' },
    { title: 'Total collection', val: '₹7.9', unit: 'Cr', trend: '↗ 8.2%', type: 'green' },
    { title: 'Pending payments', val: '₹4.7', unit: 'Cr', trend: '↓ 3.4%', type: 'amber' },
    { title: 'Available plots', val: '176', unit: '/ 384 plots', trend: '', type: 'blue' }
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
              <div className="progress-track"><span /></div>
            )}
            <div className="stat-foot">
              {s.type === 'blue' ? (
                <>46% inventory available <span className="trend neutral">4 projects</span></>
              ) : (
                <>
                  <b className={`trend ${s.type === 'amber' ? 'down' : 'up'}`}>{s.trend}</b> vs last month
                  <div className={`sparkline spark-${s.type}`}>
                    {[25, 34, 42, 53, 45, 68, 60, 80, 73, 100].map((x, i) => (
                      <i key={i} style={{ height: `${x}%` }} />
                    ))}
                  </div>
                </>
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
            <select className="select-mini" value={chartRange} onChange={e => setChartRange(e.target.value)}>
              <option>Last 6 months</option>
              <option>This year</option>
              <option>Last quarter</option>
            </select>
          </div>
          <div className="chart-legend">
            <span><i className="legend-dot indigo-dot" />Sales value</span>
            <span><i className="legend-dot green-dot" />Collection</span>
          </div>
          <div className="chart-wrap">
            <div className="y-labels">
              <span>3 Cr</span><span>2 Cr</span><span>1 Cr</span><span>0</span>
            </div>
            <div className="chart">
              <div className="grid-lines"><i /><i /><i /><i /></div>
              <div className="bars">
                {[
                  ['Apr', '55%', '40%'],
                  ['May', '70%', '52%'],
                  ['Jun', '62%', '48%'],
                  ['Jul', '85%', '65%'],
                  ['Aug', '75%', '58%'],
                  ['Sep', '95%', '78%']
                ].map(([m, s, c]) => (
                  <div className="bar-group" key={m}>
                    <div className="bar" style={{ height: s }} />
                    <div className="bar collection" style={{ height: c }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="x-labels">
            {['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'].map(m => (
              <span key={m}>{m}</span>
            ))}
          </div>
        </article>

        <article className="panel inventory-panel">
          <div className="panel-head">
            <div>
              <h2>Inventory Allocation</h2>
              <p>Current distribution across 384 master plots</p>
            </div>
            <button className="text-button" onClick={() => go('Projects & plots')}>
              View plots →
            </button>
          </div>
          <div className="donut-area">
            <div className="donut">
              <div className="donut-hole">
                <b>384</b>
                <span>TOTAL PLOTS</span>
              </div>
            </div>
            <div className="donut-legend">
              <div className="donut-item">
                <i style={{ background: '#5565dc' }} />
                <span>Available</span>
                <b>176 (46%)</b>
              </div>
              <div className="donut-item">
                <i style={{ background: '#25a879' }} />
                <span>Booked</span>
                <b>92 (24%)</b>
              </div>
              <div className="donut-item">
                <i style={{ background: '#f59e0b' }} />
                <span>Sold</span>
                <b>80 (21%)</b>
              </div>
              <div className="donut-item">
                <i style={{ background: '#94a3b8' }} />
                <span>On hold</span>
                <b>36 (9%)</b>
              </div>
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
