import React, { useState } from 'react';
import { Wallet, IndianRupee, AlertCircle, Clock, CheckCircle2, Download, Plus, FileText, Send, ArrowUpRight, ShieldCheck, RefreshCw } from 'lucide-react';

export function AccountsDashboard({ go, D, notify, pays = [] }) {
  const [disbursedList, setDisbursedList] = useState([
    { id: 'PAYOUT-01', agent: 'M. Kumar', deal: 'Plot A-012 · Rajesh Sharma', gross: '₹36,800', tds: '₹1,840', net: '₹34,960', bank: 'HDFC Bank (Ending 4102)', status: 'Pending' },
    { id: 'PAYOUT-02', agent: 'S. Patel', deal: 'Plot B-104 · Anita Verma', gross: '₹25,200', tds: '₹1,260', net: '₹23,940', bank: 'ICICI Bank (Ending 9018)', status: 'Pending' },
    { id: 'PAYOUT-03', agent: 'R. Gupta', deal: 'Plot A-101 · Priya Nair', gross: '₹19,200', tds: '₹960', net: '₹18,240', bank: 'SBI Bank (Ending 2241)', status: 'Approved' }
  ]);

  const [overdues, setOverdues] = useState([
    { id: 'OD-1', client: 'Sneha Mehta', project: 'Green Meadows', plot: 'B-033', amount: '₹5,60,000', overdueDays: '10 days', lastNotice: '24 Sep 2026', phone: '+91 98201 11223' },
    { id: 'OD-2', client: 'Vikram Joshi', project: 'Silver Oaks', plot: 'C-015', amount: '₹12,37,500', overdueDays: '18 days', lastNotice: '20 Sep 2026', phone: '+91 98202 33445' }
  ]);

  const handleDisburse = (id, agent, net) => {
    setDisbursedList(disbursedList.map(item => item.id === id ? { ...item, status: 'Disbursed' } : item));
    notify(`NEFT Payment of ${net} successfully disbursed to ${agent}`);
  };

  const handleDemandNotice = (client, amount) => {
    notify(`Formal Legal Demand Notice generated and emailed to ${client} for ${amount}.`);
  };

  const handleReminder = (client, phone) => {
    notify(`Automated WhatsApp & SMS payment reminder sent to ${client} (${phone}).`);
  };

  return (
    <div className="role-dashboard accounts-dash">
      <div className="role-welcome accounts-welcome">
        <div>
          <span className="eyebrow"><i className="live-dot" /> TREASURY, BILLING & FINANCIAL RECONCILIATION</span>
          <h2>Accounts & Collections Command</h2>
          <p>Real-time cash flow receipts, aging analysis of customer receivables, TDS compliance, and commission disbursements.</p>
        </div>
        <div className="welcome-actions">
          <button className="button button-white" onClick={() => notify('Bank reconciliation statement generated')}>
            <RefreshCw size={13} /> Reconcile Bank
          </button>
          <button className="button button-primary" onClick={() => D('payment')}>
            <Plus size={14} /> Record Payment
          </button>
        </div>
      </div>

      {/* Financial Position Metrics */}
      <div className="mini-stats four">
        <div className="mini-stat">
          <small>TOTAL REALIZED COLLECTIONS</small>
          <b className="green-text">₹7.90 Cr</b>
          <span className="stat-sub">Reconciled in primary account</span>
        </div>
        <div className="mini-stat">
          <small>TODAY'S CASH INFLOW</small>
          <b className="indigo-text">₹4.20 L</b>
          <span className="stat-sub">2 NEFT remittances verified</span>
        </div>
        <div className="mini-stat">
          <small>OUTSTANDING RECEIVABLES</small>
          <b>₹4.70 Cr</b>
          <span className="stat-sub">Across 4 project phases</span>
        </div>
        <div className="mini-stat">
          <small>CRITICAL OVERDUE (&gt;60 DAYS)</small>
          <b className="danger-text">₹86.4 L</b>
          <span className="stat-sub">Requires recovery escalation</span>
        </div>
      </div>

      {/* Accounts Receivable Aging Analysis */}
      <section className="panel aging-panel">
        <div className="panel-head">
          <div>
            <h2>Accounts Receivable Aging Analysis (Debtors Ledger)</h2>
            <p>Categorized by payment due date elapsed time</p>
          </div>
          <button className="text-button" onClick={() => notify('Aging report downloaded')}>
            <Download size={13} /> Download Aging Schedule
          </button>
        </div>

        <div className="aging-grid">
          <div className="aging-bucket bucket-normal">
            <span className="aging-label">0 – 30 Days (Current)</span>
            <b className="aging-amount">₹1.20 Cr</b>
            <div className="aging-progress"><div className="fill" style={{ width: '85%' }} /></div>
            <small>Normal billing cycle · 28 clients</small>
          </div>

          <div className="aging-bucket bucket-warning">
            <span className="aging-label">31 – 60 Days (Follow-up)</span>
            <b className="aging-amount">₹1.80 Cr</b>
            <div className="aging-progress"><div className="fill" style={{ width: '60%' }} /></div>
            <small>Reminder notice issued · 14 clients</small>
          </div>

          <div className="aging-bucket bucket-caution">
            <span className="aging-label">61 – 90 Days (Late)</span>
            <b className="aging-amount">₹1.10 Cr</b>
            <div className="aging-progress"><div className="fill" style={{ width: '40%' }} /></div>
            <small>Accountant follow-up · 7 clients</small>
          </div>

          <div className="aging-bucket bucket-danger">
            <span className="aging-label">90+ Days (Defaulters)</span>
            <b className="aging-amount">₹60.0 L</b>
            <div className="aging-progress"><div className="fill" style={{ width: '25%' }} /></div>
            <small>Demand notice active · 4 clients</small>
          </div>
        </div>
      </section>

      <div className="role-dash-grid">
        {/* Critical Overdue Recovery Queue */}
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Overdue Defaulters Recovery Queue</h2>
              <p>Clients with delayed installment schedules requiring accounts action</p>
            </div>
            <button className="text-button" onClick={() => go('Payments')}>
              View Full Ledger →
            </button>
          </div>

          <div className="overdue-list">
            {overdues.map((item) => (
              <div className="overdue-card" key={item.id}>
                <div className="overdue-top">
                  <div>
                    <b>{item.client}</b>
                    <small>{item.project} · Plot {item.plot}</small>
                  </div>
                  <div className="overdue-val">
                    <b className="danger-text">{item.amount}</b>
                    <span className="overdue-tag">{item.overdueDays} overdue</span>
                  </div>
                </div>

                <div className="overdue-actions">
                  <span className="last-notice">Last Notice: {item.lastNotice}</span>
                  <div className="btn-group">
                    <button className="button button-white small-btn" onClick={() => handleReminder(item.client, item.phone)}>
                      <Send size={11} /> WhatsApp Ping
                    </button>
                    <button className="button button-primary small-btn" onClick={() => handleDemandNotice(item.client, item.amount)}>
                      <FileText size={11} /> Issue Demand Notice
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Commission Disbursement Desk */}
        <section className="panel accounts-disburse-panel">
          <div className="panel-head">
            <div>
              <h2>Agent Payout & TDS Desk</h2>
              <p>Approved payouts ready for bank release</p>
            </div>
          </div>

          <div className="disburse-list">
            {disbursedList.map((item) => (
              <div className="disburse-card" key={item.id}>
                <div className="disburse-head">
                  <div>
                    <b>{item.agent}</b>
                    <small>{item.deal}</small>
                  </div>
                  <span className={`badge-pill ${item.status === 'Disbursed' ? 'green' : 'amber'}`}>
                    {item.status}
                  </span>
                </div>

                <div className="disburse-calc">
                  <div><span>Gross:</span> <b>{item.gross}</b></div>
                  <div><span>TDS (5%):</span> <b className="danger-text">-{item.tds}</b></div>
                  <div className="net-row"><span>Net Payout:</span> <b className="green-text">{item.net}</b></div>
                </div>

                <div className="bank-meta">
                  <ShieldCheck size={12} className="green-text" />
                  <span>{item.bank}</span>
                </div>

                {item.status !== 'Disbursed' ? (
                  <button className="button button-primary full-btn" onClick={() => handleDisburse(item.id, item.agent, item.net)}>
                    Disburse via NEFT ({item.net})
                  </button>
                ) : (
                  <div className="disbursed-stamp">✓ Disbursed via NEFT Ref #{item.id}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
