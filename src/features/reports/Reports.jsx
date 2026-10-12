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
import { buildReport, REPORT_PERIODS } from '../../utils/reports';
import { getSettings } from '../../utils/settings';
import { downloadCsv } from '../../utils/csv';
import { toRow } from '../commissions/Commissions';
import { api, hasSession } from '../../api';

import { RoleContextBanner } from '../../components/layout/RoleContextBanner';

const REPORTS = [
  ['Sales & Booking Velocity', 'Comprehensive contract report with installment breakdowns', 'sales', 'Uses scope + project'],
  ['Accounts Receivable Aging', '0-30, 31-60, 61-90, 90+ days debtor schedule and demand notices', 'accounts', 'Uses project'],
  ['Project Inventory Absorption', 'Plots sold, reserved, hold and unsold yield analysis', 'inventory', 'Uses project'],
  ['TDS & Commission Payroll', 'Agent commissions, tax withholding, and bank transfer ledger', 'tax', 'Uses project · TDS rate from Administration'],
];

export function Reports({ notify, role, bookings = [], payments = [], plots = [], projects: projectList = [], project: activeProject = 'All projects', onExport }) {
  const [dateRange, setDateRange] = useState('All time');
  const [reportProject, setReportProject] = useState(activeProject);
  useEffect(() => { setReportProject(activeProject); }, [activeProject]);

  // Live: the commissions this role may see (from the server). Offline preview: the sample register.
  const [liveCommissions, setLiveCommissions] = useState(hasSession() ? [] : null);
  useEffect(() => {
    if (!hasSession()) return;
    api.commissions.list({ page_size: 200 })
      .then((response) => {
        const byId = new Map(bookings.filter((b) => typeof b[10] === 'number').map((b) => [b[10], b]));
        setLiveCommissions((response.data || []).map((c) => toRow(c, byId)));
      })
      .catch(() => setLiveCommissions([]));
  }, [bookings]);
  const data = useMemo(
    () => ({ bookings, payments, plots, commissions: liveCommissions ?? [] }),
    [bookings, payments, plots, liveCommissions],
  );
  const reports = useMemo(() => {
    const tdsRate = getSettings().tax.tdsRate;
    return Object.fromEntries(REPORTS.map(([, , key]) => [
      key, buildReport(key, data, { period: dateRange, project: reportProject, tdsRate }),
    ]));
  }, [data, dateRange, reportProject]);

  const download = (title, key) => {
    const report = reports[key];
    if (report.rows.length === 0) {
      notify(`${title}: no records for ${reportProject} · ${dateRange}. Try a wider scope.`);
      return;
    }
    downloadCsv(report.filename, report.rows, report.headers);
    onExport?.(key, report.rows.length);
    notify(`${title} downloaded · ${report.rows.length} row${report.rows.length === 1 ? '' : 's'}`);
  };

  return (
    <>
      <RoleContextBanner role={role} page="Reports" />

      <div className="report-toolbar">
        <div>
          <h2>Business Intelligence & Periodic Reports</h2>
          <p>Auditable operational and financial insights · {dateRange} · {reportProject}</p>
        </div>
        <div className="report-filters">
          <label>
            Scope
            <select value={dateRange} onChange={e => setDateRange(e.target.value)}>
              {REPORT_PERIODS.map(p => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label>
            Project
            <select value={reportProject} onChange={e => setReportProject(e.target.value)}>
              <option>All projects</option>
              {projectList.map(p => <option key={p[0]}>{p[0]}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="stats-grid">
        {REPORTS.map(([title, desc, key, note]) => {
          const count = reports[key].rows.length;
          return (
            <div className="stat-card report-card" key={key}>
              <b>{title}</b>
              <p>{desc}</p>
              <p><small>{count} record{count === 1 ? '' : 's'} · {note}</small></p>
              <button className="button button-white small-btn" onClick={() => download(title, key)}>
                <Download size={13} /> Download Report (CSV)
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
