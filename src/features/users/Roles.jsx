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

export function Roles({ role, notify, users = [], create, edit, remove }) {
  const matrix = [
    ['ADMIN', '✓', '✓', '✓', '✓', '✓', '✓', '✓', '✓'],
    ['SALES MANAGER', '●', '✓', '●', '✓', '●', '✓', '✓', '—'],
    ['SALES AGENT', '—', '●', '—', '●', '—', '●', '●', '—'],
    ['ACCOUNTS', '—', '—', '✓', '—', '✓', '✓', '✓', '—'],
    ['MANAGEMENT', '—', '—', '—', '—', '—', '✓', '✓', '—']
  ];

  return (
    <>
      <RoleContextBanner role={role} page="User & role management" />

      {/* Users Admin Table */}
      <div className="mini-stats four">
        <Mini title="PROVISIONED USERS" value={users.length} />
        <Mini title="ACTIVE SESSIONS" value={users.filter(u => u.status === 'Active').length} color="green-text" />
        <Mini title="SECURITY ROLES" value="6" />
        <Mini title="COMPLIANCE STATUS" value="SOC-2 Ready" color="green-text" />
      </div>

      <section className="panel section-panel users-panel">
        <div className="crud-heading">
          <div>
            <h2>Workspace Team Accounts</h2>
            <p>Manage credentials, role assignments, and active account statuses.</p>
          </div>
          <button className="button button-primary small-button" onClick={create}>
            <Plus size={14} /> Add Team Member
          </button>
        </div>

        <Table
          headers={['USER', 'EMAIL', 'MOBILE', 'ROLE', 'STATUS', 'ACTIONS']}
          rows={users.map((u, i) => [
            <div className="customer-cell" key={u.id}><Avatar name={u.name} i={i} /><b>{u.name}</b></div>,
            u.email,
            u.phone,
            <Badge>{u.role}</Badge>,
            <Badge>{u.status}</Badge>,
            <div className="crud-actions" key={u.id}>
              <button className="icon-action" title="Edit user" onClick={() => edit(u)}>
                <Edit2 size={14} />
              </button>
              <button className="icon-action delete-action" title="Delete user" onClick={() => remove(u)}>
                <Trash2 size={14} />
              </button>
            </div>
          ])}
        />
      </section>

      {/* Permissions Matrix */}
      <div className="panel section-panel" style={{ marginTop: 14 }}>
        <div className="panel-head">
          <div>
            <h2>Role-Based Access Control (RBAC) Permissions Matrix</h2>
            <p>Granular module privileges enforced across workspace endpoints</p>
          </div>
        </div>

        <Table
          headers={['ROLE', 'ALL PLOTS', 'BOOKINGS', 'PAYMENTS', 'CUSTOMERS', 'COMMISSIONS', 'REPORTS', 'DOCS', 'ADMIN']}
          rows={matrix.map(row => row.map((x, i) => i === 0 ? <b>{x}</b> : (
            <span className={x === '✓' ? 'access-yes' : x === '●' ? 'access-partial' : 'access-no'}>{x}</span>
          )))}
        />
        <div className="access-legend">
          ✓ Full access · ● Assigned records only · — Restricted
        </div>
      </div>
    </>
  );
}
