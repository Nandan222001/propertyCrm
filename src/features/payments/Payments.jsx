import React, { useState, useMemo, useEffect } from 'react';
import {
  LayoutDashboard, Map, ClipboardList, Wallet, Users, Handshake, Percent,
  ChartNoAxesCombined, FolderOpen, Bell, Settings, Shield, Search, Plus,
  Download, ChevronDown, ChevronRight, Menu, X, ArrowUpRight, MoreHorizontal,
  CalendarDays, Building2, House, Receipt, FileText, Clock3, CheckCircle2,
  AlertCircle, SlidersHorizontal, Send, Eye, Edit2, LockKeyhole, RefreshCw,
  FileSpreadsheet, MapPin, IndianRupee, Mail, Phone, Activity, Trash2, LogOut,
  Sparkles, Check, CheckCircle, Printer, MessageCircle
} from 'lucide-react';
import { parseAmt, fmtINR, amountInWords, agentKey, todayLabel, openWhatsApp, waLink, isAdmin, canCreateBooking, canApprove, canCreateCustomer, canRecordPayment, canManageBills, isCustomer, isPendingStatus } from '../../utils';
import { projects, agents, seedUsers } from '../../data/seedData';

import { Table } from '../../components/common/DataTable';
import { Badge } from '../../components/common/Badge';
import { Mini } from '../../components/common/StatTile';
import { RoleContextBanner } from '../../components/layout/RoleContextBanner';

export function Payments({ pays, receipts, project, search, filter, F, D, notify, role, onOpenBill, onShare, onRemind, onStatus }) {
  const [view, setView] = useState('ledger');
  const canBill = canManageBills(role);
  const customerView = role === 'CUSTOMER';

  const list = pays.filter(p => {
    const textMatch = p.join(' ').toLowerCase().includes(search.toLowerCase());
    const projMatch = project === 'All projects' || p[2] === project;
    const filterMatch = filter === 'All status' || p[7] === filter.toUpperCase();
    return textMatch && projMatch && filterMatch;
  });
  const bills = receipts.filter(r => r.customer.toLowerCase().includes(search.toLowerCase()) || r.no.toLowerCase().includes(search.toLowerCase()) || r.plot.toLowerCase().includes(search.toLowerCase()));

  const total = pays.reduce((s, p) => s + parseAmt(p[3]), 0);
  const paid = pays.reduce((s, p) => s + parseAmt(p[4]), 0);
  const overdue = pays.filter(p => p[7] === 'OVERDUE').reduce((s, p) => s + parseAmt(p[5]), 0);

  return (
    <>
      <RoleContextBanner role={role} page="Payments" />

      <div className="mini-stats four">
        <Mini title="TOTAL BOOKING VALUE" value={`₹${fmtINR(total)}`} />
        <Mini title="COLLECTED TO DATE" value={`₹${fmtINR(paid)}`} color="green-text" />
        <Mini title="PENDING" value={`₹${fmtINR(total - paid)}`} color="indigo-text" />
        <Mini title="OVERDUE" value={`₹${fmtINR(overdue)}`} color="amber-text" />
      </div>

      <div className="panel section-panel">
        <div className="tabs">
          <button className={view === 'ledger' ? 'active' : ''} onClick={() => setView('ledger')}>{customerView ? 'My payments' : 'Ledger'} ({list.length})</button>
          <button className={view === 'bills' ? 'active' : ''} onClick={() => setView('bills')}>Bills &amp; receipts ({receipts.length})</button>
          {canRecordPayment(role) && (
            <button className="button button-primary small-btn" onClick={() => D('payment')} style={{ marginLeft: 'auto' }}>
              <Plus size={12} /> Record Payment
            </button>
          )}
        </div>

        {view === 'ledger' && (
          <>
            <div className="tabs">
              <span className="filter-label">STATUS:</span>
              {['All status', 'PAID', 'PARTIALLY PAID', 'PENDING', 'OVERDUE'].map(s => (
                <button key={s} className={`filter-btn ${filter === s ? 'active' : ''}`} onClick={() => F(s)}>
                  {s}
                </button>
              ))}
            </div>
            <Table
              headers={['CUSTOMER', 'PROJECT & PLOT', 'FINAL PRICE', 'PAID TO DATE', 'PENDING BALANCE', 'NEXT DUE DATE', 'STATUS', customerView ? 'AGENT' : 'ACTIONS']}
              rows={list.map(p => [
                <b>{p[0]}</b>,
                `${p[2]} · ${p[1]}`,
                `₹${p[3]}`,
                <span className="green-text">₹{p[4]}</span>,
                `₹${p[5]}`,
                p[6],
                <Badge>{p[7]}</Badge>,
                customerView ? p[8] : (
                  <div className="row-actions" key={`${p[0]}-${p[1]}`}>
                    {canRecordPayment(role) && p[5] !== '0' && onStatus && (
                      <select
                        className="select-mini" value={p[7]} aria-label={`Change status for ${p[0]}`}
                        onChange={(e) => onStatus(p, e.target.value)}
                      >
                        {[...new Set([p[7], 'PENDING', ...(parseAmt(p[4]) > 0 ? ['PARTIALLY PAID'] : []), 'OVERDUE'])]
                          .map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                    {p[5] !== '0' && (
                      <button className="icon-action wa-icon" onClick={() => onRemind(p)} title="WhatsApp payment reminder">
                        <MessageCircle size={14} />
                      </button>
                    )}
                  </div>
                )
              ])}
            />
            <div className="table-pagination">Showing {list.length} ledgers <span>Balance updates automatically when a payment is recorded · use Record Payment to mark as paid</span></div>
          </>
        )}

        {view === 'bills' && (
          <>
            <Table
              headers={['RECEIPT NO.', 'DATE', 'CUSTOMER', 'PLOT', 'AMOUNT', 'MODE', 'SHARED', 'ACTIONS']}
              rows={bills.map(r => [
                <b>{r.no}</b>,
                r.date,
                r.customer,
                `${r.project} · ${r.plot}`,
                <b>₹{r.amount}</b>,
                r.mode,
                <Badge>{r.shared ? 'Shared' : 'Not shared'}</Badge>,
                <div className="row-actions" key={r.no}>
                  <button className="icon-action" onClick={() => onOpenBill(r)} title="View / print bill (office + customer copy)">
                    <Printer size={14} />
                  </button>
                  {canBill && (
                    <button className="button whatsapp-btn small-btn" onClick={() => onShare(r)} title="Share bill with customer">
                      <MessageCircle size={12} /> Share
                    </button>
                  )}
                </div>
              ])}
            />
            {bills.length === 0 && <p className="empty-note">No bills yet.</p>}
            <div className="table-pagination">
              {customerView ? 'Bills shared with you by the office' : 'Each bill prints with an office copy and a customer copy'}
            </div>
          </>
        )}
      </div>
    </>
  );
}
