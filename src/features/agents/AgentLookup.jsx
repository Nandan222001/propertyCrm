import React, { useMemo, useState } from 'react';
import { Search, X, MessageCircle } from 'lucide-react';
import { agents } from '../../data/seedData';
import { parseAmt, fmtINR, openWhatsApp } from '../../utils';

export function agentStats(name, bookings, customers, receipts) {
  const mine = bookings.filter(b => b[8] === name);
  const live = mine.filter(b => b[7] !== 'Pending Approval' && b[7] !== 'Rejected');
  const sales = live.reduce((s, b) => s + parseAmt(b[5]), 0);
  const collected = live.reduce((s, b) => s + parseAmt(b[6]), 0);
  return {
    mine,
    deals: live.length,
    pending: mine.filter(b => b[7] === 'Pending Approval').length,
    sales,
    collected,
    outstanding: sales - collected,
    commission: Math.round(sales * 0.02),
    customers: customers.filter(c => c.agent === name),
    receipts: receipts.filter(r => r.agent === name).length
  };
}

export function AgentLookup({ onPick }) {
  const [q, setQ] = useState('');
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return agents.filter(a => a[0].toLowerCase().includes(t) || a[1].toLowerCase().includes(t));
  }, [q]);
  return (
    <div className="agent-lookup">
      <Search size={14} />
      <input placeholder="Search agent…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search agent" />
      {q.trim() && (
        <ul className="agent-lookup-list">
          {matches.length === 0 && <li className="empty">No agent found</li>}
          {matches.map(a => (
            <li key={a[1]}>
              <button onClick={() => { onPick(a); setQ(''); }}>
                <b>{a[0]}</b><small>{a[1]}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AgentInfoModal({ agent, bookings, customers, receipts, close }) {
  const s = agentStats(agent[0], bookings, customers, receipts);
  const tiles = [
    ['Deals closed', s.deals], ['Sales value', `₹${fmtINR(s.sales)}`], ['Collected', `₹${fmtINR(s.collected)}`],
    ['Outstanding', `₹${fmtINR(s.outstanding)}`], ['Commission (2%)', `₹${fmtINR(s.commission)}`], ['Awaiting approval', s.pending]
  ];
  return (
    <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && close()}>
      <div className="modal agent-modal">
        <div className="modal-head">
          <div>
            <span className="modal-kicker">AGENT PROFILE · {agent[1]}</span>
            <h2>{agent[0]}</h2>
            <p>Phone {agent[7]} · {s.customers.length} customers · {s.receipts} receipts issued</p>
          </div>
          <button className="modal-close" onClick={close}><X size={17} /></button>
        </div>
        <div className="agent-tiles">
          {tiles.map(([k, v]) => <div key={k}><small>{k}</small><b>{v}</b></div>)}
        </div>
        <h3 className="sheet-h">Bookings</h3>
        <div className="table-scroll data-table">
          <table>
            <thead><tr><th>ID</th><th>CUSTOMER</th><th>PLOT</th><th>VALUE</th><th>PAID</th><th>STATUS</th></tr></thead>
            <tbody>
              {s.mine.length === 0 && <tr><td colSpan="6">No bookings yet</td></tr>}
              {s.mine.map(b => (
                <tr key={b[0]}><td>{b[0]}</td><td>{b[1]}</td><td>{b[2]} · {b[3]}</td><td>₹{b[5]}</td><td>₹{b[6]}</td><td>{b[7]}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="modal-actions">
          <button className="button whatsapp-btn" onClick={() => openWhatsApp(agent[7], `Hi ${agent[0]}, this is the Lalita ERP admin desk.`)}>
            <MessageCircle size={14} /> WhatsApp agent
          </button>
          <button className="button button-white" onClick={close}>Close</button>
        </div>
      </div>
    </div>
  );
}
