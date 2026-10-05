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
import { PlotMap3D } from '../../features/plots/PlotMap3D';
import { RoleContextBanner } from '../../components/layout/RoleContextBanner';

export function Projects({ plots, search, project, filter, F, tab, TB, notify, projects, role, onBook }) {
  const customerView = role === 'CUSTOMER';
  const canBook = canCreateBooking(role);

  const list = plots.filter(p => {
    const textMatch = p.join(' ').toLowerCase().includes(search.toLowerCase());
    const projectMatch = project === 'All projects' || p[8] === project;
    const statusMatch = filter === 'All status' || p[5] === filter.toUpperCase();
    return textMatch && projectMatch && statusMatch;
  });

  const plotRows = list.map(p => [
    <b>{p[0]}</b>,
    p[8],
    p[1],
    p[2],
    p[3],
    `₹${p[4]}`,
    <Badge>{p[5]}</Badge>,
    p[6],
    p[7],
    <div className="table-actions-cell" key={p[0]}>
      <button className="icon-action" onClick={() => notify(`Plot ${p[0]} · ${p[2]} sq.ft · ${p[3]} facing · ₹${p[4]}`)} title="View Specs">
        <Eye size={14} />
      </button>
      {canBook && p[5] === 'AVAILABLE' && (
        <button className="button button-primary small-btn" onClick={() => onBook(p)} title="Book this plot">
          {role === 'SALES AGENT' ? 'Reserve' : 'Book'}
        </button>
      )}
    </div>
  ]);

  return (
    <>
      <RoleContextBanner role={role} page="Projects & plots" />

      <div className="mini-stats four">
        <Mini title="TOTAL PROJECTS" value="4" />
        <Mini title="TOTAL PLOTS" value="384" />
        <Mini title="AVAILABLE FOR SALE" value="176" color="green-text" />
        <Mini title="ON HOLD / RESERVED" value="36" color="amber-text" />
      </div>

      <div className="panel section-panel">
        <div className="tabs">
          <button className={tab === 'Plots' ? 'active' : ''} onClick={() => TB('Plots')}>Plot layout ({list.length})</button>
          <button className={tab === '3D' ? 'active' : ''} onClick={() => TB('3D')}>3D map</button>
          <button className={tab === 'Projects' ? 'active' : ''} onClick={() => TB('Projects')}>Master projects (4)</button>
          <div className="table-tools">
            <span className="filter-label">FILTER STATUS:</span>
            {['All status', 'AVAILABLE', 'BOOKED', 'HOLD', 'SOLD'].map(s => (
              <button key={s} className={`filter-btn ${filter === s ? 'active' : ''}`} onClick={() => F(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {tab === 'Projects' ? (
          <Table
            headers={['PROJECT NAME', 'LOCATION & PHASE', 'TOTAL PLOTS', 'BOOKED', 'HOLD', 'EST. REVENUE', 'STATUS']}
            rows={projects.map(p => [<b>{p[0]}</b>, p[1], p[2], p[3], p[4], `₹${p[5]}`, <Badge>Active</Badge>])}
          />
        ) : tab === '3D' ? (
          <PlotMap3D plots={list} role={role} notify={notify} onBook={canBook ? onBook : undefined} />
        ) : (
          <Table
            headers={['PLOT NO.', 'PROJECT', 'LAYOUT', 'AREA (SQ.FT)', 'FACING', 'PRICE', 'STATUS', 'CUSTOMER', 'AGENT', 'ACTIONS']}
            rows={plotRows}
          />
        )}
      </div>
    </>
  );
}
