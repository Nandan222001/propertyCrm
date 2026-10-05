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

export function Commissions({ search, notify, role }) {
  const isAgent = role === 'SALES AGENT';
  const isManager = role === 'SALES MANAGER';
  const isAccounts = role === 'ACCOUNTS';

  const data = [
    ['M. Kumar', 'Green Meadows', 'A-012', '18,40,000', '2.0%', '36,800', 'APPROVED'],
    ['S. Patel', 'Green Meadows', 'C-078', '25,20,000', '2.0%', '50,400', 'PAYABLE'],
    ['R. Gupta', 'Silver Oaks', 'B-104', '12,60,000', '1.5%', '18,900', 'PAID'],
    ['A. Khan', 'Green Meadows', 'A-101', '9,60,000', '2.0%', '19,200', 'PROCESSING'],
    ['N. Bose', 'Park View', 'C-031', '24,75,000', '2.0%', '49,500', 'ON HOLD']
  ];

  return (
    <>
      <RoleContextBanner role={role} page="Commissions" />

      <div className="mini-stats four">
        <Mini title="TOTAL COMMISSIONS" value="₹7.68 L" />
        <Mini title="DISBURSED TO DATE" value="₹4.82 L" color="green-text" />
        <Mini title="READY FOR DISBURSAL" value="₹1.92 L" color="indigo-text" />
        <Mini title="PENDING APPROVAL" value="₹94,000" color="amber-text" />
      </div>

      <div className="panel section-panel">
        <Table
          headers={['AGENT', 'PROJECT', 'PLOT', 'DEAL VALUE', 'COMM. SLAB', 'AMOUNT (₹)', 'STATUS', 'ACTIONS']}
          rows={data.filter(a => a.join(' ').toLowerCase().includes(search.toLowerCase())).map(a => [
            <b>{a[0]}</b>,
            a[1],
            a[2],
            `₹${a[3]}`,
            a[4],
            `₹${a[5]}`,
            <Badge>{a[6]}</Badge>,
            <div className="table-actions-cell" key={a[0]}>
              <button className="icon-action" onClick={() => notify(`Commission slip for ${a[0]} opened`)} title="Inspect calculation">
                <Eye size={14} />
              </button>
              {isManager && a[6] === 'PROCESSING' && (
                <button className="button button-white small-btn" onClick={() => notify(`Approved commission for ${a[0]}`)}>
                  Approve
                </button>
              )}
              {isAccounts && a[6] === 'APPROVED' && (
                <button className="button button-primary small-btn" onClick={() => notify(`NEFT payout initiated for ${a[0]}`)}>
                  Disburse
                </button>
              )}
            </div>
          ])}
        />
      </div>
    </>
  );
}
