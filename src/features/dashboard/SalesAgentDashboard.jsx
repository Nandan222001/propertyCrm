import React, { useState } from 'react';
import { Target, CheckCircle2, Circle, Plus, Phone, Calendar, Clock, MapPin, IndianRupee, ArrowUpRight, Award, FileText, Send } from 'lucide-react';

export function SalesAgentDashboard({ go, D, notify, bookings = [], plots = [] }) {
  const [tasks, setTasks] = useState([
    { id: 1, time: '10:30 AM', text: 'Call Rajesh Sharma regarding registration for Plot A-012', done: true, priority: 'High' },
    { id: 2, time: '02:00 PM', text: 'Conduct on-site property tour with Anita Verma at Silver Oaks Plot B-104', done: false, priority: 'Urgent' },
    { id: 3, time: '04:30 PM', text: 'Collect booking agreement signature & token draft from Deepak Iyer', done: false, priority: 'Medium' },
    { id: 4, time: '06:00 PM', text: 'Follow up with Sneha Mehta regarding pending 2nd installment', done: false, priority: 'Normal' }
  ]);

  const toggleTask = (id) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, done: !t.done } : t));
    const t = tasks.find(x => x.id === id);
    if (!t.done) notify(`Task completed: ${t.text}`);
  };

  const myDeals = [
    { id: 'BK-2026-0148', client: 'Rajesh Sharma', project: 'Green Meadows', plot: 'A-012', value: '₹18,40,000', paid: '₹14,72,000', progress: 80, stage: 'Agreement Executed', comm: '₹36,800' },
    { id: 'BK-2026-0147', client: 'Anita Verma', project: 'Silver Oaks', plot: 'B-104', value: '₹12,60,000', paid: '₹6,30,000', progress: 50, stage: 'Token Paid', comm: '₹25,200' },
    { id: 'BK-2026-0146', client: 'Deepak Iyer', project: 'Park View', plot: 'C-078', value: '₹25,20,000', paid: '₹25,20,000', progress: 100, stage: 'Fully Reconciled', comm: '₹50,400' }
  ];

  return (
    <div className="role-dashboard sales-agent-dash">
      <div className="role-welcome agent-welcome">
        <div>
          <span className="eyebrow"><i className="live-dot" /> FIELD AGENT WORKSPACE · SANJAY PATEL</span>
          <h2>My Sales Desk & Deal Flow</h2>
          <p>Your personal revenue performance, assigned customer appointments, commission slips, and deal tracking.</p>
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

      {/* Target Progress & Commission Highlight */}
      <div className="agent-spotlight-grid">
        <div className="panel spotlight-card target-spotlight">
          <div className="spotlight-top">
            <span className="eyebrow"><Target size={13} /> MY MONTHLY SALES QUOTA</span>
            <span className="badge-pill green">73.6% Achieved</span>
          </div>
          <div className="spotlight-vals">
            <h3>₹36.80 L <small>/ ₹50.00 L</small></h3>
            <p>₹13.20 L remaining to achieve your September milestone</p>
          </div>
          <div className="spotlight-track">
            <div className="spotlight-fill" style={{ width: '73.6%' }} />
          </div>
          <div className="spotlight-foot">
            <span>Quota tier: <b>Gold Agent (2.0%)</b></span>
            <span>Next tier at ₹60L (2.5%)</span>
          </div>
        </div>

        <div className="panel spotlight-card commission-spotlight">
          <div className="spotlight-top">
            <span className="eyebrow"><Award size={13} /> MY COMMISSIONS</span>
            <button className="text-button" onClick={() => go('Commissions')}>View Slips →</button>
          </div>
          <div className="spotlight-vals">
            <h3 className="green-text">₹2,24,000</h3>
            <p>Accrued this financial quarter (July – Sept 2026)</p>
          </div>
          <div className="commission-meta-pills">
            <div className="meta-pill">
              <small>Disbursed to Bank</small>
              <b>₹1,87,200</b>
            </div>
            <div className="meta-pill highlight">
              <small>Approved / Due this Friday</small>
              <b>₹36,800</b>
            </div>
          </div>
        </div>
      </div>

      {/* Daily Tasks & Schedule */}
      <div className="role-dash-grid">
        <section className="panel agent-schedule-panel">
          <div className="panel-head">
            <div>
              <h2>Today's Appointments & Customer Follow-ups</h2>
              <p>{tasks.filter(t => !t.done).length} actions pending today</p>
            </div>
            <button className="button button-white small-btn" onClick={() => notify('New appointment scheduled')}>
              <Plus size={12} /> Add Task
            </button>
          </div>

          <div className="task-checklist">
            {tasks.map((task) => (
              <div className={`task-row ${task.done ? 'completed' : ''}`} key={task.id} onClick={() => toggleTask(task.id)}>
                <button className="check-btn" type="button">
                  {task.done ? <CheckCircle2 size={18} className="green-text" /> : <Circle size={18} className="muted-text" />}
                </button>
                <div className="task-info">
                  <span className="task-time"><Clock size={11} /> {task.time}</span>
                  <p className="task-text">{task.text}</p>
                </div>
                <span className={`task-priority ${task.priority.toLowerCase()}`}>
                  {task.priority}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Quick Plot Reserve Wizard */}
        <section className="panel agent-quick-reserve">
          <div className="panel-head">
            <div>
              <h2>Quick Plot Availability</h2>
              <p>Top inquiries right now</p>
            </div>
          </div>

          <div className="mini-inventory-list">
            <div className="mini-inv-item">
              <div>
                <b>Plot B-104</b>
                <small>Silver Oaks · 1,800 sqft · West</small>
              </div>
              <span className="badge-pill green">Available</span>
              <button className="button button-primary table-btn" onClick={() => D('booking')}>Book</button>
            </div>
            <div className="mini-inv-item">
              <div>
                <b>Plot B-022</b>
                <small>Silver Oaks · 2,000 sqft · South</small>
              </div>
              <span className="badge-pill green">Available</span>
              <button className="button button-primary table-btn" onClick={() => D('booking')}>Book</button>
            </div>
            <div className="mini-inv-item">
              <div>
                <b>Plot C-031</b>
                <small>Park View · 3,000 sqft · North</small>
              </div>
              <span className="badge-pill amber">Hold (24h)</span>
              <button className="button button-white table-btn" onClick={() => notify('Plot is currently on hold by S. Patel')}>Details</button>
            </div>
          </div>

          <button className="full-width-btn" onClick={() => go('Projects & plots')}>
            Open Master Plot Map & Rate Card →
          </button>
        </section>
      </div>

      {/* My Deals Table */}
      <section className="panel section-panel">
        <div className="panel-head">
          <div>
            <h2>My Active Customer Deals</h2>
            <p>Real-time payment milestone and commission progress for your deals</p>
          </div>
          <button className="text-button" onClick={() => go('Bookings')}>
            View All My Bookings →
          </button>
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>CLIENT NAME</th>
                <th>PROJECT & PLOT</th>
                <th>DEAL VALUE</th>
                <th>PAID AMOUNT</th>
                <th>PAYMENT MILESTONE</th>
                <th>STAGE</th>
                <th>MY COMM.</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {myDeals.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div className="customer-cell">
                      <div className="avatar avatar-mint">{d.client.substring(0, 2)}</div>
                      <div>
                        <b>{d.client}</b>
                        <small>{d.id}</small>
                      </div>
                    </div>
                  </td>
                  <td><b>{d.project}</b> <span className="muted-text">({d.plot})</span></td>
                  <td><b>{d.value}</b></td>
                  <td><span className="green-text font-bold">{d.paid}</span></td>
                  <td style={{ minWidth: 120 }}>
                    <div className="inline-progress">
                      <div className="inline-bar green" style={{ width: `${d.progress}%` }} />
                    </div>
                    <small className="muted-text">{d.progress}% collected</small>
                  </td>
                  <td><span className="badge-pill indigo">{d.stage}</span></td>
                  <td><b className="green-text">{d.comm}</b></td>
                  <td>
                    <button className="button button-white table-btn" onClick={() => notify(`Opening WhatsApp chat with ${d.client}`)}>
                      <Phone size={11} /> Contact
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
