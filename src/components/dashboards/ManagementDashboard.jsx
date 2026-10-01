import React from 'react';
import { Briefcase, TrendingUp, PieChart, BarChart3, Download, ArrowUpRight, ShieldCheck, Building, Landmark, FileSpreadsheet } from 'lucide-react';

export function ManagementDashboard({ go, notify, projects = [] }) {
  const portfolioMatrix = [
    { name: 'Green Meadows', location: 'Phase II · Mumbai', units: 128, gdv: '₹12.6 Cr', sold: 82, collected: '₹7.9 Cr', margin: '42.5%', status: 'Cash Cow' },
    { name: 'Silver Oaks', location: 'West Zone · Pune', units: 104, gdv: '₹8.4 Cr', sold: 54, collected: '₹3.8 Cr', margin: '38.0%', status: 'Growth Phase' },
    { name: 'Park View', location: 'North District · Thane', units: 88, gdv: '₹5.2 Cr', sold: 41, collected: '₹2.1 Cr', margin: '35.2%', status: 'Steady Sales' },
    { name: 'River Enclave', location: 'East Corridor · Mumbai', units: 64, gdv: '₹3.8 Cr', sold: 28, collected: '₹1.4 Cr', margin: '32.0%', status: 'Launch Phase' }
  ];

  return (
    <div className="role-dashboard management-dash">
      <div className="role-welcome management-welcome">
        <div>
          <span className="eyebrow"><i className="live-dot" /> EXECUTIVE BOARDROOM · STRATEGIC BI</span>
          <h2>Macro Portfolio Health & Capital Allocation</h2>
          <p>High-level Gross Development Value (GDV), cash realization trajectory, inventory absorption rate, and project-wise EBITDA margins.</p>
        </div>
        <div className="welcome-actions">
          <button className="button button-white" onClick={() => notify('Capital allocation model downloaded')}>
            <FileSpreadsheet size={13} /> Capital Model
          </button>
          <button className="button button-primary" onClick={() => notify('Board Briefing Pack (Q3 2026) exported')}>
            <Download size={13} /> Download Board Pack
          </button>
        </div>
      </div>

      {/* Strategic Board KPIs */}
      <div className="mini-stats four">
        <div className="mini-stat">
          <small>PORTFOLIO GDV</small>
          <b className="indigo-text">₹30.0 Cr</b>
          <span className="stat-sub">Across 4 master developments</span>
        </div>
        <div className="mini-stat">
          <small>REALIZED CASH TO DATE</small>
          <b className="green-text">₹15.2 Cr</b>
          <span className="stat-sub">50.6% portfolio liquidity</span>
        </div>
        <div className="mini-stat">
          <small>INVENTORY ABSORPTION</small>
          <b className="green-text">64.2%</b>
          <span className="stat-sub">246 of 384 plots sold / held</span>
        </div>
        <div className="mini-stat">
          <small>BLENDED EBITDA MARGIN</small>
          <b className="amber-text">38.5%</b>
          <span className="stat-sub">+3.2% vs previous fiscal year</span>
        </div>
      </div>

      {/* Project-by-Project Performance Matrix */}
      <section className="panel section-panel">
        <div className="panel-head">
          <div>
            <h2>Project Portfolio Performance & Yield Matrix</h2>
            <p>Comparative analysis of capital realization and margins by development</p>
          </div>
          <span className="badge-pill indigo">All 4 Developments Active</span>
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>DEVELOPMENT & LOCATION</th>
                <th>UNITS</th>
                <th>TOTAL GDV</th>
                <th>ABSORPTION / SOLD</th>
                <th>REALIZED CASH</th>
                <th>EBITDA MARGIN</th>
                <th>CLASSIFICATION</th>
              </tr>
            </thead>
            <tbody>
              {portfolioMatrix.map((item) => (
                <tr key={item.name}>
                  <td>
                    <div className="customer-cell">
                      <div className="avatar avatar-indigo"><Building size={14} /></div>
                      <div>
                        <b>{item.name}</b>
                        <small>{item.location}</small>
                      </div>
                    </div>
                  </td>
                  <td><b>{item.units} Plots</b></td>
                  <td><b className="indigo-text">{item.gdv}</b></td>
                  <td style={{ minWidth: 140 }}>
                    <div className="inline-progress">
                      <div className="inline-bar green" style={{ width: `${item.sold}%` }} />
                    </div>
                    <small className="muted-text">{item.sold}% units allocated</small>
                  </td>
                  <td><b className="green-text">{item.collected}</b></td>
                  <td><b className="amber-text">{item.margin}</b></td>
                  <td>
                    <span className={`badge-pill ${item.sold > 70 ? 'green' : item.sold > 40 ? 'indigo' : 'amber'}`}>
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Cash Flow Trajectory & Strategic Insights */}
      <div className="role-dash-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Cash Flow Inflow Trajectory</h2>
              <p>Historical quarters and projected Q4 2026 receivables</p>
            </div>
            <span className="badge-pill green">+22% YoY Growth</span>
          </div>

          <div className="trajectory-chart">
            <div className="traj-bar-wrap">
              <div className="traj-bar" style={{ height: '55%' }}>
                <span>₹2.8 Cr</span>
              </div>
              <small>Q1 2026 (Act)</small>
            </div>
            <div className="traj-bar-wrap">
              <div className="traj-bar" style={{ height: '62%' }}>
                <span>₹3.2 Cr</span>
              </div>
              <small>Q2 2026 (Act)</small>
            </div>
            <div className="traj-bar-wrap">
              <div className="traj-bar" style={{ height: '78%' }}>
                <span>₹4.1 Cr</span>
              </div>
              <small>Q3 2026 (Act)</small>
            </div>
            <div className="traj-bar-wrap highlight">
              <div className="traj-bar project" style={{ height: '95%' }}>
                <span>₹5.1 Cr</span>
              </div>
              <small>Q4 2026 (Proj)</small>
            </div>
          </div>
        </section>

        {/* Board Strategic Decisions */}
        <section className="panel management-decisions">
          <div className="panel-head">
            <div>
              <h2>Strategic Board Directives</h2>
              <p>Action items for executive committee</p>
            </div>
          </div>

          <div className="directive-cards">
            <div className="directive-item">
              <div className="dir-icon green"><Landmark size={15} /></div>
              <div>
                <b>Phase III Land Acquisition</b>
                <p>Green Meadows expansion: Preliminary feasibility study ready for sign-off.</p>
                <button className="text-button" onClick={() => notify('Feasibility report opened')}>Review Dossier →</button>
              </div>
            </div>

            <div className="directive-item">
              <div className="dir-icon amber"><TrendingUp size={15} /></div>
              <div>
                <b>Dynamic Plot Price Escalation</b>
                <p>Silver Oaks Phase II hits 50% absorption. Recommended 6% price hike.</p>
                <button className="text-button" onClick={() => notify('Price revision proposal queued for approval')}>Authorize Escalation →</button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
