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
import { EditPlotModal } from './EditPlotModal';
import { AddPlotsModal } from './AddPlotsModal';
import { PaymentPlansModal } from './PaymentPlansModal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { RoleContextBanner } from '../../components/layout/RoleContextBanner';

export function Projects({ plots, search, project, filter, F, tab, TB, notify, projects, role, onBook, onSaveProject, onDeleteProject, onDeletePlot, onEditPlot, onAddPlots }) {
  const [addingPlots, setAddingPlots] = useState(false);
  const [planFor, setPlanFor] = useState(null);
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
    p[11] > 0 ? <span title={`Includes a premium of ₹${fmtINR(p[11])}`}>₹{p[10]} <small className="muted-text">(+₹{fmtINR(p[11])})</small></span> : `₹${p[10] ?? p[4]}`,
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

  const view = tab === 'Plots' ? 'Plots' : 'Projects';

  const inScope = (name) => project === 'All projects' || name === project;
  const projectRows = projects
    .filter(p => inScope(p[0]))
    .filter(p => !search || p.slice(0, 6).join(' ').toLowerCase().includes(search.toLowerCase()))
    .map(p => [
      <b>{p[0]}</b>, p[1], p[2], p[3], p[4], p[5] === '—' ? '—' : `₹${p[5]}`,
      <Badge>{p[11] === false ? 'Inactive' : 'Active'}</Badge>,
      <div className="table-actions-cell" key={p[0]}>
        <button className="icon-action" title="View project" onClick={() => setViewProject(p)}><Eye size={14} /></button>
        {canManage && onAddPlots && typeof p[6] === 'number' && (
          <button className="icon-action" title="Add plots to this project" onClick={() => setAddingPlots(true)}><Plus size={14} /></button>
        )}
        {canManage && typeof p[6] === 'number' && (
          <button className="icon-action" title="Payment schemes (EMI, outright…)" onClick={() => setPlanFor(p)}><Wallet size={14} /></button>
        )}
        {canManage && <button className="icon-action" title="Edit project" onClick={() => setEditing(p)}><Edit2 size={14} /></button>}
        {canManage && onDeleteProject && typeof p[6] === 'number' && (
          <button className="icon-action danger" title="Delete project" onClick={() => setRemoving({ kind: 'project', row: p })}><Trash2 size={14} /></button>
        )}
      </div>,
    ]);

  // Headline figures count the plots that really exist (not the number planned when the project was
  // created) and follow the project chosen in the sidebar.
  const scopedProjects = projects.filter(p => inScope(p[0]));
  const scopedPlots = plots.filter(p => inScope(p[8]));
  const totals = {
    plots: scopedPlots.length,
    available: scopedPlots.filter(p => p[5] === 'AVAILABLE').length,
    hold: scopedPlots.filter(p => p[5] === 'HOLD').length,
  };

  return (
    <>
      <RoleContextBanner role={role} page="Projects & plots" />

      <div className="mini-stats four">
        <Mini title="TOTAL PROJECTS" value={scopedProjects.length} />
        <Mini title="TOTAL PLOTS" value={totals.plots} />
        <Mini title="AVAILABLE FOR SALE" value={totals.available} color="green-text" />
        <Mini title="ON HOLD / RESERVED" value={totals.hold} color="amber-text" />
      </div>

      {/* Two options side by side: Projects | Plots. Click one to open that list. */}
      <div className="panel section-panel">
        <div className="tabs view-options">
          <button className={view === 'Projects' ? 'active' : ''} onClick={() => TB('Projects')}>Projects ({projectRows.length})</button>
          <button className={view === 'Plots' ? 'active' : ''} onClick={() => TB('Plots')}>Plots ({list.length})</button>
          {canManage && (
            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>
              {onAddPlots && (
                <button className="button button-white small-btn" onClick={() => setAddingPlots(true)}>
                  <Plus size={12} /> Add Plots
                </button>
              )}
              <button className="button button-primary small-btn" onClick={() => setEditing(null)}>
                <Plus size={12} /> Add Project
              </button>
            </span>
          )}
          {view === 'Plots' && (
            <div className="table-tools">
              <span className="filter-label">FILTER STATUS:</span>
              {['All status', 'AVAILABLE', 'BOOKED', 'HOLD', 'SOLD'].map(s => (
                <button key={s} className={`filter-btn ${filter === s ? 'active' : ''}`} onClick={() => F(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {view === 'Projects' ? (
          <Table
            headers={['PROJECT NAME', 'LOCATION & PHASE', 'TOTAL PLOTS', 'BOOKED', 'HOLD', 'EST. REVENUE', 'STATUS', 'ACTIONS']}
            empty="No projects yet"
            rows={projectRows}
          />
        ) : (
          <Table
            headers={['PLOT NO.', 'PROJECT', 'LAYOUT', 'AREA (SQ.FT)', 'FACING', 'PRICE', 'STATUS', 'CUSTOMER', 'AGENT', 'ACTIONS']}
            empty="No plots yet — the admin adds them with Add Plots"
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
      {planFor && <PaymentPlansModal project={planFor} plots={plots} close={() => setPlanFor(null)} notify={notify} />}
      {addingPlots && <AddPlotsModal projects={projects} defaultProject={project === 'All projects' ? '' : project} close={() => setAddingPlots(false)} save={onAddPlots} />}
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
            if (!row) TB('Projects');   // after saving, show the new project in the Projects list
          }}
        />
      )}
    </>
  );
}
