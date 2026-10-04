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
import { Avatar } from '../../components/common/Avatar';
import { RoleContextBanner } from '../../components/layout/RoleContextBanner';

export function Bookings({ bookings, project, search, tab, TB, role, onNew, onOpenCustomer, onApprove, onReject, onPrint, onWhatsApp }) {
  const statuses = ['All bookings', 'Confirmed', 'Pending Approval', 'Processing', 'Agreement', 'Rejected'];
  const rows = bookings.filter(b => {
    const textMatch = b.join(' ').toLowerCase().includes(search.toLowerCase());
    const projMatch = project === 'All projects' || b[2] === project;
    const tabMatch = tab === 'All bookings' || b[7].toLowerCase() === tab.toLowerCase();
    return textMatch && projMatch && tabMatch;
  });
  const count = (s) => bookings.filter(b => b[7] === s).length;
  const customerView = role === 'CUSTOMER';

  return (
    <>
      <RoleContextBanner role={role} page="Bookings" />

      <div className="mini-stats four">
        <Mini title="TOTAL BOOKINGS" value={bookings.length} />
        <Mini title="CONFIRMED" value={count('Confirmed')} color="green-text" />
        <Mini title="AWAITING ADMIN APPROVAL" value={count('Pending Approval')} color="amber-text" />
        <Mini title="AGREEMENT STAGE" value={count('Agreement')} color="indigo-text" />
      </div>

      <div className="panel section-panel">
        <div className="tabs">
          {statuses.map(s => (
            <button key={s} className={tab === s ? 'active' : ''} onClick={() => TB(s)}>
              {s}
            </button>
          ))}
          {canCreateBooking(role) && (
            <button className="button button-primary small-btn" onClick={onNew} style={{ marginLeft: 'auto' }}>
              <Plus size={12} /> New Booking
            </button>
          )}
        </div>

        <Table
          headers={['BOOKING ID', 'CUSTOMER', 'PROJECT & PLOT', 'DATE', 'VALUE', 'PAID', 'STATUS', 'AGENT', 'ACTIONS']}
          rows={rows.map(b => [
            <b>{b[0]}</b>,
            <div className="customer-cell"><Avatar name={b[1]} /><b>{b[1]}</b></div>,
            `${b[2]} · ${b[3]}`,
            b[4],
            `₹${b[5]}`,
            `₹${b[6]}`,
            <Badge>{b[7]}</Badge>,
            b[8],
            <div className="row-actions" key={b[0]}>
              <button className="icon-action" onClick={() => onOpenCustomer(b[1])} title="Customer profile">
                <Eye size={14} />
              </button>
              <button className="icon-action" onClick={() => onPrint(b)} title="Print booking form">
                <Printer size={14} />
              </button>
              <button className="icon-action wa-icon" onClick={() => onWhatsApp(b)} title="WhatsApp customer">
                <MessageCircle size={14} />
              </button>
              {canApprove(role) && b[7] === 'Pending Approval' && (
                <>
                  <button className="button button-primary small-btn" onClick={() => onApprove(b)}>Approve</button>
                  <button className="button button-white small-btn" onClick={() => onReject(b)}>Reject</button>
                </>
              )}
            </div>
          ])}
        />
        <div className="table-pagination">
          Showing {rows.length} bookings <span>{role === 'SALES AGENT' ? 'Your bookings only' : 'Role-filtered view'}</span>
        </div>
      </div>
    </>
  );
}
