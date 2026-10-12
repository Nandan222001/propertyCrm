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

import { Table } from '../../components/common/DataTable';
import { Badge } from '../../components/common/Badge';
import { Mini } from '../../components/common/StatTile';
import { ProjectModal } from './ProjectModal';
import { PlotViewModal, ProjectViewModal } from './ProjectViews';
import { PlotMap3D } from '../../features/plots/PlotMap3D';
import { EditPlotModal } from './EditPlotModal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { RoleContextBanner } from '../../components/layout/RoleContextBanner';

export function Projects({ plots, search, project, filter, F, tab, TB, notify, projects, role, onBook, onSaveProject, onDeleteProject, onDeletePlot, onEditPlot }) {
  const [editingPlot, setEditingPlot] = useState(null);
  const [removing, setRemoving] = useState(null); // { kind: 'project' | 'plot', row }
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new, row = edit
  const [viewPlot, setViewPlot] = useState(null);
  const [viewProject, setViewProject] = useState(null);
  const canManage = isAdmin(role) && Boolean(onSaveProject);
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
      <button className="icon-action" onClick={() => setViewPlot(p)} title="View Specs">
        <Eye size={14} />
      </button>
      {canManage && onEditPlot && typeof p[9] === 'number' && (
        <button className="icon-action" onClick={() => setEditingPlot(p)} title="Edit plot details"><Edit2 size={14} /></button>
      )}
      {canManage && onDeletePlot && p[5] === 'AVAILABLE' && typeof p[9] === 'number' && (
        <button className="icon-action danger" onClick={() => setRemoving({ kind: 'plot', row: p })} title="Delete plot"><Trash2 size={14} /></button>
      )}
      {canBook && p[5] === 'AVAILABLE' && (
        <button className="button button-primary small-btn" onClick={() => onBook(p)} title="Book this plot">
          {role === 'SALES AGENT' ? 'Reserve' : 'Book'}
        </button>
      )}
    </div>
  ]);

  const totals = projects.reduce((t, p) => ({
    plots: t.plots + parseAmt(p[2]), booked: t.booked + parseAmt(p[3]), hold: t.hold + parseAmt(p[4]),
  }), { plots: 0, booked: 0, hold: 0 });

  return (
    <>
      <RoleContextBanner role={role} page="Projects & plots" />

      <div className="mini-stats four">
        <Mini title="TOTAL PROJECTS" value={projects.length} />
        <Mini title="TOTAL PLOTS" value={totals.plots} />
        <Mini title="AVAILABLE FOR SALE" value={Math.max(totals.plots - totals.booked - totals.hold, 0)} color="green-text" />
        <Mini title="ON HOLD / RESERVED" value={totals.hold} color="amber-text" />
      </div>

      <div className="panel section-panel">
        <div className="tabs">
          <button className={tab === 'Plots' ? 'active' : ''} onClick={() => TB('Plots')}>Plot layout ({list.length})</button>
          <button className={tab === '3D' ? 'active' : ''} onClick={() => TB('3D')}>3D map</button>
          <button className={tab === 'Projects' ? 'active' : ''} onClick={() => TB('Projects')}>Master projects ({projects.length})</button>
          {canManage && (
            <button
              className="button button-primary small-btn" style={{ marginLeft: 'auto' }}
              onClick={() => setEditing(null)}
            >
              <Plus size={12} /> Add Project
            </button>
          )}
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
            headers={['PROJECT NAME', 'LOCATION & PHASE', 'TOTAL PLOTS', 'BOOKED', 'HOLD', 'EST. REVENUE', 'STATUS', 'ACTIONS']}
            rows={projects
              .filter(p => !search || p.slice(0, 6).join(' ').toLowerCase().includes(search.toLowerCase()))
              .map(p => [
                <b>{p[0]}</b>, p[1], p[2], p[3], p[4], p[5] === '—' ? '—' : `₹${p[5]}`,
                <Badge>{p[11] === false ? 'Inactive' : 'Active'}</Badge>,
                <div className="table-actions-cell" key={p[0]}>
                  <button className="icon-action" title="View project" onClick={() => setViewProject(p)}><Eye size={14} /></button>
                  {canManage && <button className="icon-action" title="Edit project" onClick={() => setEditing(p)}><Edit2 size={14} /></button>}
                  {canManage && onDeleteProject && typeof p[6] === 'number' && (
                    <button className="icon-action danger" title="Delete project" onClick={() => setRemoving({ kind: 'project', row: p })}><Trash2 size={14} /></button>
                  )}
                </div>,
              ])}
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
      {viewPlot && <PlotViewModal plot={viewPlot} close={() => setViewPlot(null)} onBook={canBook ? onBook : undefined} />}
      {viewProject && (
        <ProjectViewModal
          project={viewProject}
          plots={plots}
          close={() => setViewProject(null)}
          onEdit={canManage ? setEditing : undefined}
        />
      )}
      {editingPlot && <EditPlotModal plot={editingPlot} close={() => setEditingPlot(null)} save={onEditPlot} />}
      {removing && (
        <ConfirmDialog
          title={`Delete ${removing.kind}`}
          message={removing.kind === 'project'
            ? `Delete project ${removing.row[0]} and its unsold plots? Projects with held, booked or sold plots cannot be deleted.`
            : `Delete plot ${removing.row[0]} (${removing.row[8]})? Only available plots can be deleted.`}
          onConfirm={() => (removing.kind === 'project' ? onDeleteProject(removing.row) : onDeletePlot(removing.row))}
          onCancel={() => setRemoving(null)}
        />
      )}
      {editing !== undefined && (
        <ProjectModal
          editing={editing}
          projects={projects}
          close={() => setEditing(undefined)}
          save={(form, row) => {
            onSaveProject(form, row);
            if (!row) TB('Projects');   // after saving, show the new project in the master list
          }}
        />
      )}
    </>
  );
}
