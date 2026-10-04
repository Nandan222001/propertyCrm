import React, { useState } from 'react';
import { Target, Users, TrendingUp, CheckCircle, Clock, ChevronRight, AlertCircle, Award, ArrowUpRight, Plus, PhoneCall } from 'lucide-react';

export function SalesManagerDashboard({ go, D, notify, agents = [] }) {
  const [approvals, setApprovals] = useState([
    { id: 'APP-101', title: 'Plot Hold Extension (48h)', customer: 'Sneha Mehta · Plot B-033', agent: 'M. Kumar', amount: '₹14,00,000', type: 'HOLD_REQUEST' },
    { id: 'APP-102', title: 'Early Bird Discount (2%)', customer: 'Priya Nair · Plot A-101', agent: 'R. Gupta', amount: '₹9,60,000', type: 'DISCOUNT_REQUEST' },
    { id: 'APP-103', title: 'Commission Sign-off (2.0%)', customer: 'Rajesh Sharma · Plot A-012', agent: 'M. Kumar', amount: '₹36,800', type: 'COMMISSION_APPROVAL' }
  ]);

  const handleApprove = (id, title) => {
    setApprovals(approvals.filter(a => a.id !== id));
    notify(`Approved: ${title}`);
  };

  const handleReject = (id, title) => {
    setApprovals(approvals.filter(a => a.id !== id));
    notify(`Rejected request: ${title}`);
  };

  const agentLeaderboard = [
    { name: 'M. Kumar', code: 'AG-014', deals: 9, target: '₹1.20 Cr', achieved: '₹1.12 Cr', pct: 93, conv: '28.4%', status: 'Top Performer' },
    { name: 'S. Patel', code: 'AG-008', deals: 7, target: '₹1.00 Cr', achieved: '₹86.0 L', pct: 86, conv: '24.1%', status: 'On Track' },
    { name: 'R. Gupta', code: 'AG-021', deals: 4, target: '₹75.0 L', achieved: '₹52.5 L', pct: 70, conv: '19.5%', status: 'Nearing Target' },
    { name: 'A. Khan', code: 'AG-003', deals: 3, target: '₹60.0 L', achieved: '₹38.4 L', pct: 64, conv: '16.8%', status: 'Requires Push' },
    { name: 'N. Bose', code: 'AG-017', deals: 2, target: '₹50.0 L', achieved: '₹24.0 L', pct: 48, conv: '12.5%', status: 'Follow-up Due' }
  ];

  return (
    <div className="role-dashboard sales-manager-dash">
      <div className="role-welcome manager-welcome">
        <div>
          <span className="eyebrow"><i className="live-dot" /> SALES LEADERSHIP COMMAND</span>
          <h2>Team Sales Velocity & Quota Performance</h2>
          <p>Real-time deal flow, agent leaderboard rankings, conversion funnel velocity, and manager approvals.</p>
        </div>
        <div className="welcome-actions">
          <button className="button button-white" onClick={() => go('Agents')}>
            <Users size={14} /> View All Agents
          </button>
          <button className="button button-primary" onClick={() => D('booking')}>
            <Plus size={14} /> Add Team Booking
          </button>
        </div>
      </div>

      {/* Target Realization Meter */}
      <div className="team-quota-panel">
        <div className="quota-header">
          <div>
            <span className="quota-tag"><Target size={14} /> SEPTEMBER 2026 TEAM QUOTA</span>
            <h3>₹3.84 Cr Achieved <span>of ₹5.00 Cr Target</span></h3>
          </div>
          <div className="quota-right">
            <b>76.8% Met</b>
            <small>₹1.16 Cr remaining · 13 days to month end</small>
          </div>
        </div>
        <div className="quota-progress-track">
          <div className="quota-fill" style={{ width: '76.8%' }}>
            <span className="quota-needle" />
          </div>
        </div>
      </div>

      {/* Sales Manager KPIs */}
      <div className="mini-stats four">
        <div className="mini-stat">
          <small>ACTIVE TEAM BOOKINGS</small>
          <b className="indigo-text">176 Deals</b>
          <span className="stat-sub">+23 this current month</span>
        </div>
        <div className="mini-stat">
          <small>ACTIVE SALES FORCE</small>
          <b className="green-text">14 / 18 Agents</b>
          <span className="stat-sub">5 agents on target pace</span>
        </div>
        <div className="mini-stat">
          <small>AVERAGE TICKET SIZE</small>
          <b>₹18.4 Lakhs</b>
          <span className="stat-sub">Across 4 developments</span>
        </div>
        <div className="mini-stat">
          <small>CLOSING CONVERSION RATE</small>
          <b className="amber-text">24.6%</b>
          <span className="stat-sub">Visits to confirmed bookings</span>
        </div>
      </div>

      {/* Sales Funnel Velocity */}
      <section className="panel funnel-panel">
        <div className="panel-head">
          <div>
            <h2>Deal Conversion Pipeline Velocity</h2>
            <p>From initial lead qualification to final registered agreement</p>
          </div>
          <span className="badge-pill indigo">Live September Flow</span>
        </div>

        <div className="sales-funnel-steps">
          <div className="funnel-step">
            <span className="step-num">01</span>
            <span className="step-count">142</span>
            <b>New Enquiries</b>
            <small>Portal & Walk-ins</small>
          </div>
          <div className="funnel-arrow">→</div>
          <div className="funnel-step">
            <span className="step-num">02</span>
            <span className="step-count">58</span>
            <b>Site Visits</b>
            <small>40.8% Visit Ratio</small>
          </div>
          <div className="funnel-arrow">→</div>
          <div className="funnel-step highlight">
            <span className="step-num">03</span>
            <span className="step-count">18</span>
            <b>Plots on Hold</b>
            <small>Token Received</small>
          </div>
          <div className="funnel-arrow">→</div>
          <div className="funnel-step highlight-green">
            <span className="step-num">04</span>
            <span className="step-count">23</span>
            <b>Bookings Confirmed</b>
            <small>Advance Reconciled</small>
          </div>
          <div className="funnel-arrow">→</div>
          <div className="funnel-step">
            <span className="step-num">05</span>
            <span className="step-count">19</span>
            <b>Agreements Executed</b>
            <small>Allotment Issued</small>
          </div>
        </div>
      </section>

      <div className="role-dash-grid">
        {/* Agent Performance Leaderboard */}
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Agent Performance Leaderboard</h2>
              <p>Ranked by revenue realized against monthly target</p>
            </div>
            <button className="text-button" onClick={() => go('Agents')}>
              View Full League Table →
            </button>
          </div>

          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>RANK & AGENT</th>
                  <th>DEALS</th>
                  <th>ACHIEVED / TARGET</th>
                  <th>PROGRESS</th>
                  <th>CONVERSION</th>
                  <th>STATUS</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {agentLeaderboard.map((a, idx) => (
                  <tr key={a.code}>
                    <td>
                      <div className="customer-cell">
                        <span className={`rank-badge ${idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : ''}`}>
                          #{idx + 1}
                        </span>
                        <div>
                          <b>{a.name}</b>
                          <small>{a.code}</small>
                        </div>
                      </div>
                    </td>
                    <td><b>{a.deals}</b></td>
                    <td>
                      <div><b>{a.achieved}</b> <span className="muted-text">/ {a.target}</span></div>
                    </td>
                    <td style={{ minWidth: 100 }}>
                      <div className="inline-progress">
                        <div className="inline-bar" style={{ width: `${a.pct}%` }} />
                      </div>
                      <small className="muted-text">{a.pct}%</small>
                    </td>
                    <td><b className="green-text">{a.conv}</b></td>
                    <td>
                      <span className={`badge-pill ${idx < 2 ? 'green' : idx === 2 ? 'indigo' : 'amber'}`}>
                        {a.status}
                      </span>
                    </td>
                    <td>
                      <button className="button button-white table-btn" onClick={() => notify(`Lead assigned to ${a.name}`)}>
                        Assign Lead
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Manager Approvals Queue */}
        <section className="panel manager-approvals-panel">
          <div className="panel-head">
            <div>
              <h2>Pending Approvals Queue</h2>
              <p>{approvals.length} operational actions need manager sign-off</p>
            </div>
          </div>

          {approvals.length === 0 ? (
            <div className="empty-state-box">
              <CheckCircle size={28} className="green-text" />
              <b>All approvals cleared!</b>
              <p>Your team's pipeline has no pending approvals right now.</p>
            </div>
          ) : (
            <div className="approvals-list">
              {approvals.map((item) => (
                <div className="approval-card" key={item.id}>
                  <div className="app-top">
                    <span className="app-type-tag">{item.type.replace('_', ' ')}</span>
                    <b className="app-val">{item.amount}</b>
                  </div>
                  <h4>{item.title}</h4>
                  <p className="app-meta">Client: <b>{item.customer}</b></p>
                  <p className="app-agent">Agent: <span>{item.agent}</span></p>
                  <div className="app-buttons">
                    <button className="button button-white small-btn" onClick={() => handleReject(item.id, item.title)}>
                      Decline
                    </button>
                    <button className="button button-primary small-btn" onClick={() => handleApprove(item.id, item.title)}>
                      Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
