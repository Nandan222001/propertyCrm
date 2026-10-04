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

export function CrudWorkspace({ page, records, project, search, create, edit, view, remove, role }) {
  const rows = records.filter(r => {
    return Object.values(r).join(' ').toLowerCase().includes(search.toLowerCase()) &&
      (project === 'All projects' || `${r.name} ${r.category}`.toLowerCase().includes(project.toLowerCase()));
  }).map(r => [
    <b>{r.name}</b>,
    <code>{r.reference}</code>,
    r.category,
    r.amount,
    <Badge>{r.status}</Badge>,
    <div className="crud-actions" key={r.id}>
      <button className="icon-action" title="View details" onClick={() => view(r)}><Eye size={14} /></button>
      <button className="icon-action" title="Edit record" onClick={() => edit(r)}><Edit2 size={14} /></button>
      <button className="icon-action delete-action" title="Delete record" onClick={() => remove(r)}><Trash2 size={14} /></button>
    </div>
  ]);

  return (
    <section className="panel crud-panel">
      <div className="crud-heading">
        <div>
          <h2>{page} Master Records</h2>
          <p>Local in-browser record entries with instantaneous editing & verification.</p>
        </div>
        <button className="button button-white small-button" onClick={create}>
          <Plus size={14} /> Add {page.slice(0, -1)}
        </button>
      </div>

      <Table
        headers={['RECORD NAME', 'REF CODE', 'CATEGORY / RELATION', 'VALUE', 'STATUS', 'ACTIONS']}
        rows={rows}
      />
      <div className="table-pagination">
        {rows.length} {rows.length === 1 ? 'record' : 'records'} in {page}
        <span>Persisted in browser localStorage <CheckCircle2 size={12} className="green-text" /></span>
      </div>
    </section>
  );
}
