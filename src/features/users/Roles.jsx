import React, { useState, useMemo, useEffect } from 'react';
import {
  LayoutDashboard, Map, ClipboardList, Wallet, Users, Handshake, Percent,
  ChartNoAxesCombined, FolderOpen, Bell, Settings, Shield, Search, Plus,
  Download, ChevronDown, ChevronRight, Menu, X, ArrowUpRight, MoreHorizontal,
  CalendarDays, Building2, House, Receipt, FileText, Clock3, CheckCircle2,
  AlertCircle, SlidersHorizontal, Send, Eye, Edit2, LockKeyhole, RefreshCw,
  FileSpreadsheet, MapPin, IndianRupee, Mail, Phone, Activity, Trash2, LogOut,
  Sparkles, Check, CheckCircle, Printer, MessageCircle, KeyRound
} from 'lucide-react';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { actions } from '../../api';
import { parseAmt, fmtINR, amountInWords, agentKey, todayLabel, openWhatsApp, waLink, isAdmin, canCreateBooking, canApprove, canCreateCustomer, canRecordPayment, canManageBills, isCustomer, isPendingStatus } from '../../utils';

import { Table } from '../../components/common/DataTable';
import { Badge } from '../../components/common/Badge';
import { Mini } from '../../components/common/StatTile';
import { Avatar } from '../../components/common/Avatar';
import { RoleContextBanner } from '../../components/layout/RoleContextBanner';
import { usePageLoading } from '../../hooks';
import { pageCache } from '../../utils/pageCache';

export function Roles({ role, notify, users = [], create, edit, remove, resetPassword }) {
  const [resetting, setResetting] = useState(null);
  const [roleFilter, setRoleFilter] = useState('ALL');
  // The matrix is read from the server's own permission table, so it can never drift from what is enforced.
  const [grants, setGrants] = useState(() => pageCache.get('role-matrix') ?? null);
  useEffect(() => {
    let live = true;
    actions.roleMatrix().then((r) => { if (live) setGrants(pageCache.set('role-matrix', r.data?.roles || [])); }).catch(() => { if (live) setGrants([]); });
    return () => { live = false; };
  }, []);
  usePageLoading('roles', grants === null);
  const matrix = (grants || []).filter((r) => r.role !== 'SUPER_ADMIN').map((r) => {
    const has = (p) => r.permissions.includes(p);
    const level = (module, { single = false } = {}) => {
      if (single ? has(`${module}:view`) : has(`${module}:view_all`)) return '✓';
      return r.permissions.some((p) => p.startsWith(`${module}:`)) ? '●' : '—';
    };
    return [
      r.label, level('plot', { single: true }), level('booking'), level('payment'), level('customer'),
      level('commission', { single: true }), level('report', { single: true }), level('document', { single: true }),
      has('user:manage') ? '✓' : '—',
    ];
  });
  const rolesInUse = useMemo(() => [...new Set(users.map((u) => u.role))].filter(Boolean).sort(), [users]);
  const shownUsers = roleFilter === 'ALL' ? users : users.filter((u) => u.role === roleFilter);
  const inactive = users.filter((u) => !['Active', 'Invited'].includes(u.status)).length;

  return (
    <>
      <RoleContextBanner role={role} page="User & role management" />

      {/* Users Admin Table */}
      <div className="mini-stats four">
        <Mini title="PROVISIONED USERS" value={users.length} />
        <Mini title="ACTIVE ACCOUNTS" value={users.filter(u => u.status === 'Active').length} color="green-text" />
        <Mini title="ROLES IN USE" value={new Set(users.map((u) => u.role)).size} />
        <Mini title="SUSPENDED / LOCKED" value={inactive} color={inactive ? 'amber-text' : 'green-text'} />
      </div>

      <section className="panel section-panel users-panel">
        <div className="crud-heading">
          <div>
            <h2>Workspace Team Accounts</h2>
            <p>Manage credentials, role assignments, and active account statuses.</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="select-mini" aria-label="Filter by role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="ALL">All roles ({users.length})</option>
              {rolesInUse.map((r) => (
                <option key={r} value={r}>{r} ({users.filter((u) => u.role === r).length})</option>
              ))}
            </select>
            <button className="button button-primary small-button" onClick={create}>
              <Plus size={14} /> Add Team Member
            </button>
          </div>
        </div>

        <Table
          label="users"
          headers={['USER', 'EMAIL', 'MOBILE', 'ROLE', 'STATUS', 'ACTIONS']}
          rows={shownUsers.map((u, i) => [
            <div className="customer-cell" key={u.id}><Avatar name={u.name} i={i} /><b>{u.name}</b></div>,
            u.email,
            u.phone,
            <Badge>{u.role}</Badge>,
            <Badge>{u.status}</Badge>,
            <div className="crud-actions" key={u.id}>
              <button className="icon-action" title="Edit user" onClick={() => edit(u)}>
                <Edit2 size={14} />
              </button>
              {resetPassword && typeof u.id === 'number' && (
                <button className="icon-action" title="Reset password" onClick={() => setResetting(u)}>
                  <KeyRound size={14} />
                </button>
              )}
              <button className="icon-action delete-action" title="Delete user" onClick={() => remove(u)}>
                <Trash2 size={14} />
              </button>
            </div>
          ])}
        />
      </section>

      {resetting && (
        <ConfirmDialog
          title="Reset password"
          message={`Reset ${resetting.name}'s password to their starting password (first 4 letters of the name + last 5 digits of the mobile)? Every session they have is signed out and they must choose a new password when they next sign in. The password is not displayed.`}
          confirmLabel="Reset password"
          onConfirm={() => resetPassword(resetting)}
          onCancel={() => setResetting(null)}
        />
      )}

      {/* Permissions Matrix */}
      <div className="panel section-panel" style={{ marginTop: 14 }}>
        <div className="panel-head">
          <div>
            <h2>Role-Based Access Control (RBAC) Permissions Matrix</h2>
            <p>Granular module privileges enforced across workspace endpoints</p>
          </div>
        </div>

        {grants === null && <p className="empty-note">Loading permissions…</p>}
        <Table
          paginate={false}
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
