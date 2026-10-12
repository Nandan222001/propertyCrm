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

export function RecordModal({ kind, close, save, context, initial, role }) {
  const record = kind === 'record';
  const title = kind === 'user'
    ? `${initial ? 'Edit' : 'Add'} Team Member`
    : record
    ? `${initial ? 'Edit' : 'Create'} ${context === 'Projects & plots' ? 'Project' : context === 'Agents' ? 'Agent' : 'Record'}`
    : 'Save Record';

  const fields = kind === 'user' ? [
    ['name', 'Full Name', 'text', 'Enter full name'],
    ['email', 'Email Address', 'email', 'E-mail address'],
    ['phone', kind === 'user' && !initial ? 'Mobile Number (required — last 5 digits form the starting password)' : 'Mobile Number', 'tel', '10-digit mobile number'],
    ['title', 'Job title (optional)', 'text', 'e.g. Senior Property Consultant'],
    ['role', 'Role', 'select', ['ADMIN', 'SALES MANAGER', 'SALES AGENT', 'ACCOUNTS']],
    ['agent_code', 'Agent code (sales agents)', 'text', 'Agent code — links the login to an agent record'],
    ['status', 'Account Status', 'select', ['Active', 'Pending', 'Invited', 'Suspended']]
  ] : record ? [
    ['name', 'Name / Title', 'text', 'e.g. Master record or phase'],
    ['reference', 'Reference Code', 'text', 'e.g. REF-2026-01'],
    ['category', 'Category / Phase', 'text', 'Project, plot or type'],
    ['amount', 'Amount / Plots', 'text', 'e.g. 18,40,000'],
    ['status', 'Status', 'select', ['Active', 'Pending', 'Processing', 'Confirmed', 'Overdue', 'Paid', 'Approved']],
    ['notes', 'Details / Notes', 'text', 'Add relevant notes']
  ] : [
    ['name', 'Record Name', 'text', 'Enter name'],
    ['details', 'Details', 'text', 'Enter details']
  ];

  function submit(e) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    save(d);
  }

  return (
    <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && close()}>
      <div className="modal">
        <div className="modal-head">
          <div>
            <span className="modal-kicker">ERP · {context || 'WORKSPACE'}</span>
            <h2>{title}</h2>
            <p>Enter the details below to update live workspace records.</p>
          </div>
          <button className="modal-close" onClick={close}><X size={17} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            {fields.map(([n, label, type, placeholder]) => (
              <label key={n}>
                {label}
                {type === 'select' ? (
                  <select name={n} defaultValue={initial?.[n] || placeholder[0]}>
                    {placeholder.map(x => <option key={x} value={x}>{x}</option>)}
                  </select>
                ) : (
                  <input
                    name={n}
                    type={type}
                    placeholder={placeholder}
                    defaultValue={initial?.[n] || ''}
                    required={['customer', 'plot', 'amount', 'total', 'name', 'email'].includes(n)}
                  />
                )}
              </label>
            ))}
          </div>
          <div className="modal-actions">
            <button type="button" className="button button-white" onClick={close}>Cancel</button>
            <button type="submit" className="button button-primary">
              {initial ? 'Save Changes' : 'Save'}
              <ChevronRight size={14} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
