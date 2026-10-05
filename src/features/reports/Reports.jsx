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

import { RoleContextBanner } from '../../components/layout/RoleContextBanner';

export function Reports({ notify, role }) {
  const [dateRange, setDateRange] = useState('This month');
  const [reportProject, setReportProject] = useState('All projects');
  const [reportAgent, setReportAgent] = useState('All agents');

  return (
    <>
      <RoleContextBanner role={role} page="Reports" />

      <div className="report-toolbar">
        <div>
          <h2>Business Intelligence & Periodic Reports</h2>
          <p>Auditable operational and financial insights</p>
        </div>
        <div className="report-filters">
          <label>
            Scope
            <select value={dateRange} onChange={e => setDateRange(e.target.value)}>
              <option>This month</option>
              <option>Last month</option>
              <option>This quarter</option>
              <option>Financial year 2026-27</option>
            </select>
          </label>
          <label>
            Project
            <select value={reportProject} onChange={e => setReportProject(e.target.value)}>
              <option>All projects</option>
              {projects.map(p => <option key={p[0]}>{p[0]}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="stats-grid">
        {[
          ['Sales & Booking Velocity', 'Comprehensive contract report with installment breakdowns', 'sales'],
          ['Accounts Receivable Aging', '0-30, 31-60, 61-90, 90+ days debtor schedule and demand notices', 'accounts'],
          ['Project Inventory Absorption', 'Plots sold, reserved, hold and unsold yield analysis', 'inventory'],
          ['TDS & Commission Payroll', 'Agent commissions, tax withholding (5%), and bank transfer ledger', 'tax']
        ].map(([title, desc, key]) => (
          <div className="stat-card report-card" key={key}>
            <b>{title}</b>
            <p>{desc}</p>
            <button className="button button-white small-btn" onClick={() => notify(`${title} generated and downloaded.`)}>
              <Download size={13} /> Download Report
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
