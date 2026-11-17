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
import { usePageLoading } from '../../hooks';
import { pageCache } from '../../utils/pageCache';
import { PrintModal } from '../documents/PrintSheets';
import { COMPANY } from '../../data/appConfig';

const REPORTS = [
  ['Sales & Booking Velocity', 'Comprehensive contract report with installment breakdowns', 'sales', 'Uses scope + project'],
  ['Expense Report', 'Company expenses by category, date and payee', 'expense', 'Not project-wise'],
  ['Accounts Receivable Aging', '0-30, 31-60, 61-90, 90+ days debtor schedule and demand notices', 'accounts', 'Uses project'],
  ['Project Inventory Absorption', 'Plots sold, reserved, hold and unsold yield analysis', 'inventory', 'Uses project'],
  ['TDS & Commission Payroll', 'Agent commissions, tax withholding, and bank transfer ledger', 'tax', 'Uses project · TDS rate from Administration'],
];

export function Reports({ notify, role, bookings = [], payments = [], plots = [], projects: projectList = [], project: activeProject = 'All projects', onExport }) {
  const [dateRange, setDateRange] = useState('All time');
  const [reportProject, setReportProject] = useState(activeProject);
  useEffect(() => { setReportProject(activeProject); }, [activeProject]);

  // Live: the commissions this role may see (from the server). Offline preview: the sample register.
  const [liveCommissions, setLiveCommissions] = useState(hasSession() ? (pageCache.get('report-commissions') ?? []) : null);
  const [commissionsLoaded, setCommissionsLoaded] = useState(!hasSession() || pageCache.has('report-commissions'));
  useEffect(() => {
    if (!hasSession()) return;
    api.commissions.list({ page_size: 200 })
      .then((response) => {
        const byId = new Map(bookings.filter((b) => typeof b[10] === 'number').map((b) => [b[10], b]));
        setLiveCommissions(pageCache.set('report-commissions', (response.data || []).map((c) => toRow(c, byId))));
        setCommissionsLoaded(true);
      })
      .catch(() => { setLiveCommissions([]); setCommissionsLoaded(true); });
  }, [bookings]);
  usePageLoading('reports', !commissionsLoaded);
  // Expenses (live only; a role without access simply gets an empty report).
  const [expenses, setExpenses] = useState([]);
  useEffect(() => {
    if (!hasSession()) return;
    api.expenses.list({ page_size: 200 }).then((r) => setExpenses(r.data || [])).catch(() => setExpenses([]));
  }, []);
  const data = useMemo(
    () => ({ bookings, payments, plots, commissions: liveCommissions ?? [], expenses }),
    [bookings, payments, plots, liveCommissions, expenses],
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

  const [printing, setPrinting] = useState(null);   // { title, key }
  const printReport = (title, key) => {
    if (reports[key].rows.length === 0) {
      notify(`${title}: no records for ${reportProject} · ${dateRange}. Try a wider scope.`);
      return;
    }
    setPrinting({ title, key });
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
              {PRINTABLE.includes(key) && (
                <button className="button button-white small-btn" style={{ marginLeft: 8 }} onClick={() => printReport(title, key)}>
                  <Printer size={13} /> Print
                </button>
              )}
            </div>
          );
        })}
      </div>
      {printing && (
        <PrintModal title={`${printing.title} · print`} close={() => setPrinting(null)}>
          <ReportSheet title={printing.title} reportKey={printing.key} report={reports[printing.key]} scope={`${dateRange}${printing.key === 'expense' ? '' : ` · ${reportProject}`}`} />
        </PrintModal>
      )}
    </>
  );
}

/** Reports that can be printed, and which columns are summed in the totals row. */
const PRINTABLE = ['sales', 'expense', 'tax'];
const TOTAL_COLUMNS = {
  sales: ['Value', 'Paid', 'Balance'],
  expense: ['Amount'],
  tax: ['Deal value', 'Commission', 'TDS withheld', 'Net payable'],
};
const MONEY = new Set(['Value', 'Paid', 'Balance', 'Amount', 'Deal value', 'Commission', 'TDS withheld', 'Net payable']);

function ReportSheet({ title, reportKey, report, scope }) {
  const key = reportKey;
  const sums = (TOTAL_COLUMNS[key] || []).map((name) => [report.headers.indexOf(name), name]);
  const cell = (header, value) => (MONEY.has(header) ? `Rs. ${fmtINR(parseAmt(value))}` : String(value ?? ''));
  return (
    <section className="report-sheet">
      <header className="report-sheet-head">
        <div>
          <h2>{COMPANY.name}</h2>
          {COMPANY.address && <p>{COMPANY.address}</p>}
        </div>
        <div className="report-sheet-title">
          <b>{title.toUpperCase()}</b>
          <span>{scope}</span>
          <span>Printed on {todayLabel()} · {report.rows.length} record{report.rows.length === 1 ? '' : 's'}</span>
        </div>
      </header>
      <table className="report-sheet-table">
        <thead><tr>{report.headers.map((h) => <th key={h} className={MONEY.has(h) ? 'num' : ''}>{h}</th>)}</tr></thead>
        <tbody>
          {report.rows.map((row, i) => (
            <tr key={i}>{row.map((value, j) => <td key={j} className={MONEY.has(report.headers[j]) ? 'num' : ''}>{cell(report.headers[j], value)}</td>)}</tr>
          ))}
        </tbody>
        {sums.length > 0 && (
          <tfoot>
            <tr>
              {report.headers.map((h, j) => {
                const sum = sums.find(([index]) => index === j);
                return <td key={h} className={MONEY.has(h) ? 'num' : ''}>{j === 0 ? 'Total' : sum ? `Rs. ${fmtINR(report.rows.reduce((t, row) => t + parseAmt(row[j]), 0))}` : ''}</td>;
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </section>
  );
}
