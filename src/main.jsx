import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Map, ClipboardList, Wallet, Users, Handshake, Percent,
  ChartNoAxesCombined, FolderOpen, Bell, Settings, Shield, Search, Plus,
  Download, ChevronDown, ChevronRight, Menu, X, ArrowUpRight, MoreHorizontal,
  CalendarDays, Building2, House, Receipt, FileText, Clock3, CheckCircle2,
  AlertCircle, SlidersHorizontal, Send, Eye, Edit2, LockKeyhole, RefreshCw,
  FileSpreadsheet, MapPin, IndianRupee, Mail, Phone, Activity, Trash2, LogOut,
  Sparkles, Check, CheckCircle, Printer, MessageCircle
} from 'lucide-react';

import './style.css';
import './components/RoleThemeStyles.css';
import './components/FeatureStyles.css';

import {
  projects, seedBookings, seedPlots, seedPays, agents, seedUsers, seedCrud, roleConfigs,
  seedCustomers, seedReceipts, seedRegistry
} from './data/seedData';
import {
  parseAmt, fmtINR, agentKey, todayLabel, openWhatsApp,
  isAdmin, canCreateBooking, canApprove, canCreateCustomer, canRecordPayment, canManageBills
} from './lib/helpers';
import { BookingModal, PaymentModal, CustomerModal } from './components/FeatureModals';
import { BillModal, BookingFormModal } from './components/PrintSheets';
import { PlotMap3D } from './components/PlotMap3D';
import { AgentLookup, AgentInfoModal } from './components/AgentLookup';
import { CustomersPage, CustomerProfile, DocumentsPage, StatusBadge } from './components/CustomerViews';
import { ApprovalsPage } from './components/ApprovalsPage';

import { SuperAdminDashboard } from './components/dashboards/SuperAdminDashboard';
import { AdminDashboard } from './components/dashboards/AdminDashboard';
import { SalesManagerDashboard } from './components/dashboards/SalesManagerDashboard';
import { SalesAgentDashboard } from './components/dashboards/SalesAgentDashboard';
import { AccountsDashboard } from './components/dashboards/AccountsDashboard';
import { ManagementDashboard } from './components/dashboards/ManagementDashboard';
import { RoleContextBanner } from './components/RoleContextBanner';
import { LoginScreen } from './components/LoginScreen';

const pathFor = {
  'Overview': '/',
  'Approvals': '/approvals',
  'Projects & plots': '/projects-plots',
  'Bookings': '/bookings',
  'Payments': '/payments',
  'Customers': '/customers',
  'Customer detail': '/customers/detail',
  'Agents': '/agents',
  'Commissions': '/commissions',
  'Reports': '/reports',
  'Documents': '/documents',
  'Notifications': '/notifications',
  'User & role management': '/user-roles',
  'Administration': '/administration'
};

const iconMap = {
  'Overview': LayoutDashboard,
  'Approvals': CheckCircle2,
  'Projects & plots': Map,
  'Bookings': ClipboardList,
  'Payments': Wallet,
  'Customers': Users,
  'Agents': Handshake,
  'Commissions': Percent,
  'Reports': ChartNoAxesCombined,
  'Documents': FolderOpen,
  'Notifications': Bell,
  'User & role management': Shield,
  'Administration': Settings
};

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const rawPage = Object.keys(pathFor).find(k => pathFor[k] === location.pathname) || 'Overview';

  // Navigation & UI state
  const [mobile, setMobile] = useState(false);
  const [modal, setModal] = useState('');
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState('This month');
  const [project, setProject] = useState('All projects');
  const [tab, setTab] = useState('Plots');
  const [filter, setFilter] = useState('All status');
  const [selected, setSelected] = useState(null);

  // Authentication & Role state
  const [session, setSession] = useState(() => localStorage.getItem('nmt_session') || '');
  const [role, setRole] = useState(() => localStorage.getItem('nmt_role') || 'ADMIN');
  const [users, setUsers] = useState(() => JSON.parse(localStorage.getItem('nmt_users') || 'null') || seedUsers);
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = JSON.parse(localStorage.getItem('nmt_current_user') || 'null');
    return saved || roleConfigs['ADMIN'].defaultUser;
  });

  // Core ERP Domain Data
  const load = (key, seed) => {
    try { return JSON.parse(localStorage.getItem(key) || 'null') || seed; } catch { return seed; }
  };
  const [bookings, setBookings] = useState(() => load('nmt2_bookings', seedBookings));
  const [plots, setPlots] = useState(() => load('nmt2_plots', seedPlots));
  const [pays, setPays] = useState(() => load('nmt2_payments', seedPays));
  const [customers, setCustomers] = useState(() => load('nmt2_customers', seedCustomers));
  const [receipts, setReceipts] = useState(() => load('nmt2_receipts', seedReceipts));
  const [registry, setRegistry] = useState(() => load('nmt2_registry', seedRegistry));
  const [billNo, setBillNo] = useState('');
  const [bookingPrint, setBookingPrint] = useState(null);
  const [agentInfo, setAgentInfo] = useState(null);
  const [bookingPreset, setBookingPreset] = useState(null);
  const [fups, setFups] = useState({});
  const [crud, setCrud] = useState(() => {
    const saved = JSON.parse(localStorage.getItem('nmt_module_crud') || 'null') || seedCrud;
    return Object.fromEntries(
      Object.entries(saved).map(([k, rows]) => [k, rows.map((r, i) => ({ ...r, id: r.id || `${k}-${i + 1}` }))])
    );
  });
  const [crudPage, setCrudPage] = useState('Overview');
  const [editRecord, setEditRecord] = useState(null);
  const [userEdit, setUserEdit] = useState(null);

  // Sync to localStorage
  useEffect(() => localStorage.setItem('nmt2_bookings', JSON.stringify(bookings)), [bookings]);
  useEffect(() => localStorage.setItem('nmt2_plots', JSON.stringify(plots)), [plots]);
  useEffect(() => localStorage.setItem('nmt2_payments', JSON.stringify(pays)), [pays]);
  useEffect(() => localStorage.setItem('nmt2_customers', JSON.stringify(customers)), [customers]);
  useEffect(() => localStorage.setItem('nmt2_receipts', JSON.stringify(receipts)), [receipts]);
  useEffect(() => localStorage.setItem('nmt2_registry', JSON.stringify(registry)), [registry]);
  useEffect(() => localStorage.setItem('nmt_module_crud', JSON.stringify(crud)), [crud]);
  useEffect(() => localStorage.setItem('nmt_users', JSON.stringify(users)), [users]);
  useEffect(() => localStorage.setItem('nmt_role', role), [role]);
  useEffect(() => localStorage.setItem('nmt_current_user', JSON.stringify(currentUser)), [currentUser]);

  useEffect(() => {
    if (rawPage === 'Projects & plots') setTab('Plots');
    if (rawPage === 'Bookings') setTab('All bookings');
  }, [rawPage]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const notify = (msg) => setToast(msg);

  const go = (p) => {
    navigate(pathFor[p] || '/');
    setSearch('');
    setMobile(false);
    if (p !== 'Customer detail') setSelected(null);
    setTab(p === 'Projects & plots' ? 'Plots' : 'All bookings');
  };

  const handleRoleChange = (newRole) => {
    setRole(newRole);
    localStorage.setItem('nmt_role', newRole);
    const matchedUser = users.find(u => u.role === newRole) || roleConfigs[newRole]?.defaultUser || {
      name: `${newRole} User`,
      email: `${newRole.toLowerCase().replace(' ', '')}@nmtsolution.demo`,
      role: newRole
    };
    setCurrentUser(matchedUser);
    notify(`Switched perspective to ${newRole}`);
  };

  const handleLogin = (selectedRole, userObj) => {
    setRole(selectedRole);
    setSession(selectedRole);
    localStorage.setItem('nmt_session', selectedRole);
    localStorage.setItem('nmt_role', selectedRole);
    const user = userObj || users.find(u => u.role === selectedRole) || roleConfigs[selectedRole].defaultUser;
    setCurrentUser(user);
    notify(`Welcome to Lalita ERP! Logged in as ${user.name} (${selectedRole}).`);
    go('Overview');
  };

  const handleRegister = (newUser) => {
    if (newUser.role === 'CUSTOMER') {
      newUser = { ...newUser, customerName: newUser.name };
      setCustomers([{ id: `CUS-${String(Date.now()).slice(-4)}`, name: newUser.name, mobile: (newUser.phone || '').replace(/\D/g, '').slice(-10), email: newUser.email, address: '', agent: '', status: 'Pending Approval', createdAt: todayLabel() }, ...customers]);
    } else {
      setUsers([newUser, ...users]);
    }
    setRole(newUser.role);
    setSession(newUser.role);
    setCurrentUser(newUser);
    localStorage.setItem('nmt_session', newUser.role);
    localStorage.setItem('nmt_role', newUser.role);
    notify(`Welcome, ${newUser.name}! Your ${newUser.role} workspace is ready.`);
    go('Overview');
  };

  const handleLogout = () => {
    setSession('');
    localStorage.removeItem('nmt_session');
    notify('Logged out of workspace session.');
  };

  const exportCsv = () => {
    const rows = page === 'Payments' ? vPays.map(x => x.join(',')) : vBookings.map(x => x.slice(0, 9).join(','));
    const head = page === 'Payments'
      ? 'Customer,Plot,Project,Booking value,Paid,Pending,Due date,Status,Agent'
      : 'Booking ID,Customer,Project,Plot,Date,Value,Paid,Status,Agent';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([[head, ...rows].join('\n')], { type: 'text/csv' }));
    a.download = `nmt-${page.toLowerCase().replaceAll(' ', '-')}.csv`;
    a.click();
    notify('CSV report exported successfully');
  };

  const saveRecord = (d) => {
    if (modal === 'record') {
      const prior = editRecord;
      setCrud({
        ...crud,
        [crudPage]: prior
          ? (crud[crudPage] || []).map(x => x.id === prior.id ? { ...d, id: prior.id, updatedAt: new Date().toLocaleString() } : x)
          : [{ ...d, id: crypto.randomUUID(), createdAt: new Date().toLocaleString() }, ...(crud[crudPage] || [])]
      });
      notify(prior ? 'Record updated' : 'Record created');
      setEditRecord(null);
    } else if (modal === 'user') {
      if (userEdit) {
        setUsers(users.map(u => u.id === userEdit.id ? { ...u, ...d } : u));
        notify(`Team member ${d.name} updated`);
      } else {
        const nu = { id: `USR-${String(users.length + 1).padStart(3, '0')}`, ...d, status: d.status || 'Active' };
        setUsers([...users, nu]);
        notify(`Team member ${d.name} invited as ${d.role}`);
      }
      setUserEdit(null);
    } else {
      notify(`${modal} saved successfully`);
    }
    setModal('');
  };

  // ---- receipts / bills ------------------------------------------------
  const nextReceiptNo = (list) =>
    `RCT-2026-${String(Math.max(200, ...list.map(r => Number(r.no.split('-')[2]) || 0)) + 1).padStart(4, '0')}`;

  const newReceipt = (list, f) => ({
    no: nextReceiptNo(list), date: todayLabel(), shared: false, reference: '', mode: 'Cash', ...f
  });

  const billText = (r) =>
    `Dear ${r.customer}, we have received ₹${r.amount} for Plot ${r.plot} (${r.project}). ` +
    `Receipt ${r.no} dated ${r.date}. Balance: ₹${r.balance}. Thank you - Lalita Realestate Infra.`;

  const customerPhone = (name) => customers.find(c => c.name === name)?.mobile || '';

  const shareReceipt = (r) => {
    setReceipts(prev => prev.map(x => x.no === r.no ? { ...x, shared: true } : x));
    openWhatsApp(customerPhone(r.customer), billText(r));
    notify(`Bill ${r.no} shared with ${r.customer} (visible in their login)`);
  };

  const copyBill = async (r) => {
    try { await navigator.clipboard.writeText(billText(r)); notify('Bill text copied'); }
    catch { notify('Copy not available in this browser'); }
  };

  // ---- bookings ----------------------------------------------------------
  // Creates the ledger row and a token receipt once a booking is confirmed.
  const confirmLedger = (b) => {
    const due = parseAmt(b[5]) - parseAmt(b[6]);
    setPays(prev => prev.some(p => p[0] === b[1] && p[1] === b[3]) ? prev : [
      [b[1], b[3], b[2], b[5], b[6], fmtINR(due), '—', due <= 0 ? 'PAID' : 'PENDING', b[8]], ...prev
    ]);
    if (parseAmt(b[6]) > 0) {
      setReceipts(prev => [newReceipt(prev, {
        customer: b[1], plot: b[3], project: b[2], finalPrice: b[5], amount: b[6],
        balance: fmtINR(due), mode: 'Token advance', agent: b[8]
      }), ...prev]);
    }
  };

  const saveBooking = (d) => {
    const next = Math.max(0, ...bookings.map(b => Number(b[0].split('-')[2]) || 0)) + 1;
    const approved = isAdmin(role);
    const b = [
      `BK-2026-${String(next).padStart(4, '0')}`, d.customer, d.project, d.plot, todayLabel(),
      d.amount, d.paid || '0', approved ? 'Confirmed' : 'Pending Approval', d.agent, d.plan
    ];
    setBookings([b, ...bookings]);
    setPlots(plots.map(x => x[0] === d.plot ? [...x.slice(0, 5), approved ? 'BOOKED' : 'HOLD', d.customer, d.agent, x[8]] : x));
    if (approved) confirmLedger(b);
    setModal('');
    setBookingPreset(null);
    notify(approved
      ? `Booking ${b[0]} confirmed · Plot ${d.plot} booked`
      : `Booking ${b[0]} sent to admin for approval · Plot ${d.plot} on hold`);
  };

  const approveBooking = (b) => {
    const confirmed = b.map((v, i) => i === 7 ? 'Confirmed' : v);
    setBookings(prev => prev.map(x => x[0] === b[0] ? confirmed : x));
    setPlots(prev => prev.map(x => x[0] === b[3] ? [...x.slice(0, 5), 'BOOKED', b[1], b[8], x[8]] : x));
    confirmLedger(confirmed);
    notify(`Booking ${b[0]} approved · token receipt generated`);
  };

  const rejectBooking = (b) => {
    setBookings(prev => prev.map(x => x[0] === b[0] ? x.map((v, i) => i === 7 ? 'Rejected' : v) : x));
    setPlots(prev => prev.map(x => x[0] === b[3] ? [...x.slice(0, 5), 'AVAILABLE', '—', x[7], x[8]] : x));
    notify(`Booking ${b[0]} rejected · Plot ${b[3]} released`);
  };

  const whatsappBooking = (b) => {
    const text = b[7] === 'Confirmed' || b[7] === 'Agreement'
      ? `Dear ${b[1]}, your booking ${b[0]} for Plot ${b[3]} (${b[2]}) is confirmed. Final price ₹${b[5]}, paid ₹${b[6]}. - Lalita Realestate Infra`
      : `Dear ${b[1]}, your booking ${b[0]} for Plot ${b[3]} (${b[2]}) is ${b[7].toLowerCase()}. We will update you shortly. - Lalita Realestate Infra`;
    openWhatsApp(customerPhone(b[1]), text);
  };

  // ---- payments -----------------------------------------------------------
  const savePayment = ({ booking: b, finalPrice, amount, mode, reference, due }) => {
    const newPaid = parseAmt(b[6]) + amount;
    const balance = finalPrice - newPaid;
    const dueLabel = balance <= 0 || !due
      ? '—'
      : new Date(due).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    setBookings(prev => prev.map(x => x[0] === b[0] ? x.map((v, i) => i === 5 ? fmtINR(finalPrice) : i === 6 ? fmtINR(newPaid) : v) : x));
    setPays(prev => {
      const row = [b[1], b[3], b[2], fmtINR(finalPrice), fmtINR(newPaid), fmtINR(Math.max(balance, 0)), dueLabel, balance <= 0 ? 'PAID' : 'PARTIALLY PAID', b[8]];
      return prev.some(p => p[0] === b[1] && p[1] === b[3]) ? prev.map(p => p[0] === b[1] && p[1] === b[3] ? row : p) : [row, ...prev];
    });
    if (balance <= 0) setPlots(prev => prev.map(x => x[0] === b[3] ? [...x.slice(0, 5), 'SOLD', ...x.slice(6)] : x));
    const r = newReceipt(receipts, {
      customer: b[1], plot: b[3], project: b[2], finalPrice: fmtINR(finalPrice), amount: fmtINR(amount),
      balance: fmtINR(Math.max(balance, 0)), mode, reference, agent: b[8]
    });
    setReceipts([r, ...receipts]);
    setModal('');
    setBillNo(r.no);
    notify(`₹${fmtINR(amount)} recorded for ${b[1]} · bill ${r.no} generated`);
  };

  // ---- customers ----------------------------------------------------------
  const saveCustomer = (d) => {
    const next = Math.max(0, ...customers.map(c => Number(c.id.split('-')[1]) || 0)) + 1;
    setCustomers([{ id: `CUS-${String(next).padStart(4, '0')}`, ...d, status: 'Pending Approval', createdAt: todayLabel() }, ...customers]);
    setModal('');
    notify(`Customer ${d.name} sent to admin for approval`);
  };
  const setCustomerStatus = (c, status) => {
    setCustomers(prev => prev.map(x => x.id === c.id ? { ...x, status } : x));
    notify(`Customer ${c.name} ${status.toLowerCase()}`);
  };
  const openCustomer = (c) => { setSelected(c); navigate(pathFor['Customer detail']); setSearch(''); setMobile(false); };
  const whatsappCustomer = (c) => openWhatsApp(c.mobile, `Hello ${c.name}, this is Lalita Realestate Infra regarding your plot booking.`);
  const setRegistryStatus = (id, value) => { setRegistry(prev => ({ ...prev, [id]: value })); notify(`Registry status set to "${value}"`); };
  const bookPlot = (p) => { setBookingPreset({ project: p[8], plot: p[0] }); setModal('booking'); };

  // If no active session, show the interactive Auth screen with generated real estate photography
  if (!session) {
    return <LoginScreen onLogin={handleLogin} onRegister={handleRegister} customers={customers} users={users} />;
  }

  // Active role config & navigation definitions
  const currentRoleConfig = roleConfigs[role] || roleConfigs['ADMIN'];
  const workspaceNav = currentRoleConfig.workspaceNav || ['Overview', 'Projects & plots', 'Bookings', 'Payments'];
  const insightsNav = currentRoleConfig.insightsNav || ['Reports', 'Documents', 'Notifications'];

  // Direct URLs cannot bypass the role's navigation.
  const allowedPages = [...workspaceNav, ...insightsNav, ...(workspaceNav.includes('Customers') ? ['Customer detail'] : [])];
  const page = allowedPages.includes(rawPage) ? rawPage : 'Overview';

  // Role-scoped data: agents see their own records, customers see only theirs.
  const isAgentRole = role === 'SALES AGENT';
  const isCustomerRole = role === 'CUSTOMER';
  const myKey = agentKey(currentUser.name);
  const myName = currentUser.customerName || currentUser.name;
  const vBookings = isAgentRole ? bookings.filter(b => b[8] === myKey) : isCustomerRole ? bookings.filter(b => b[1] === myName) : bookings;
  const vPays = isAgentRole ? pays.filter(p => p[8] === myKey) : isCustomerRole ? pays.filter(p => p[0] === myName) : pays;
  const vCustomers = isAgentRole ? customers.filter(c => c.agent === myKey) : isCustomerRole ? customers.filter(c => c.name === myName) : customers;
  const vReceipts = isAgentRole ? receipts.filter(r => r.agent === myKey) : isCustomerRole ? receipts.filter(r => r.customer === myName && r.shared) : receipts;
  const myCustomer = customers.find(c => c.name === myName) || { id: 'CUS-NEW', name: myName, mobile: '', email: currentUser.email || '', address: '', agent: '' };
  const pendingApprovals = bookings.filter(b => b[7] === 'Pending Approval').length + customers.filter(c => c.status === 'Pending Approval').length;
  const billReceipt = receipts.find(r => r.no === billNo);
  const openBooking = (b) => setBookingPrint(b);
  const plotOf = (no) => plots.find(p => p[0] === no);

  const documents = [
    ...vBookings.flatMap(b => [
      { key: `bf-${b[0]}`, title: 'Booking Form', sub: `${b[1]} · ${b[3]}`, date: b[4], kind: 'Booking', open: () => openBooking(b) },
      ...(b[7] === 'Confirmed' || b[7] === 'Agreement' ? [{ key: `al-${b[0]}`, title: 'Allotment Letter', sub: `${b[1]} · ${b[3]}`, date: b[4], kind: 'Allotment' }] : []),
      ...(b[7] === 'Agreement' ? [{ key: `ag-${b[0]}`, title: 'Agreement to Sale', sub: `${b[1]} · ${b[3]}`, date: b[4], kind: 'Agreement' }] : [])
    ]),
    ...vReceipts.map(r => ({ key: r.no, title: `Receipt ${r.no}`, sub: `${r.customer} · ₹${r.amount}`, date: r.date, kind: 'Receipt', open: () => setBillNo(r.no) }))
  ];

  const getNavBadge = (itemName) => {
    if (role === 'SALES AGENT') {
      if (itemName === 'Bookings') return { text: '3', alert: false };
      if (itemName === 'Notifications') return { text: '2', alert: false };
    } else if (role === 'ACCOUNTS') {
      if (itemName === 'Payments') return { text: '14', alert: true };
      if (itemName === 'Commissions') return { text: '3', alert: false };
      if (itemName === 'Notifications') return { text: '6', alert: false };
    } else if (role === 'SALES MANAGER') {
      if (itemName === 'Bookings') return { text: '6', alert: false };
      if (itemName === 'Commissions') return { text: '3 pending', alert: false };
      if (itemName === 'Notifications') return { text: '4', alert: false };
    } else if (role === 'SUPER ADMIN') {
      if (itemName === 'Approvals' && pendingApprovals) return { text: `${pendingApprovals}`, alert: true };
      if (itemName === 'Notifications') return { text: '5', alert: false };
      if (itemName === 'User & role management') return { text: `${users.length}`, alert: false };
    } else if (role === 'ADMIN') {
      if (itemName === 'Approvals' && pendingApprovals) return { text: `${pendingApprovals}`, alert: true };
      if (itemName === 'Bookings') return { text: '6', alert: false };
      if (itemName === 'Payments') return { text: '24', alert: true };
      if (itemName === 'Notifications') return { text: '3', alert: false };
    } else if (role === 'MANAGEMENT') {
      if (itemName === 'Notifications') return { text: '2', alert: false };
    }
    return null;
  };

  const meta = {
    'Overview': [currentRoleConfig.title, currentRoleConfig.subtitle],
    'Approvals': ['Admin Approvals', 'Bookings and customers entered by agents are confirmed here.'],
    'Projects & plots': ['Project & Plot Inventory', 'Master portfolio, layout availability, plot dimensions and customer allocations.'],
    'Bookings': ['Sales Booking Operations', 'Auditable transaction lifecycle from token advance to registered conveyance.'],
    'Payments': ['Collections, Dues & Treasury', 'Every rupee booked, collected and pending — daily banking reconciliations.'],
    'Customers': ['Customer Master Directory', 'Comprehensive client files, plot allocations, milestone payments, and documents.'],
    'Agents': ['Sales Force & Agency Roster', 'Agent productivity, active bookings, commission tiering, and performance metrics.'],
    'Commissions': ['Agent Commissions & Payouts', 'Eligibility rules, manager approvals, TDS tax compliance, and bank disbursements.'],
    'Reports': ['Reports & Business Intelligence', 'Real-time financial, operational, sales funnel and portfolio BI.'],
    'Documents': ['Document Vault & Contracts', 'Booking forms, allotment letters, agreement copies, and tax invoices.'],
    'Notifications': ['Operational Follow-ups & Alerts', 'Payment overdue warnings, customer reminders, and system notifications.'],
    'User & role management': ['Identity & Role-Based Access (RBAC)', 'Assign permissions, manage workspaces, and invite team members.'],
    'Administration': ['System Configuration & Master Rules', 'Tax rules, plot layout schemas, banking preferences, and company profiles.']
  };

  const heading = meta[page] || [page, 'Customer profile and linked operational records.'];

  return (
    <div className="app-shell">
      {/* Toast Notification */}
      {toast && (
        <div className="app-toast">
          <CheckCircle size={15} className="green-text" />
          <span>{toast}</span>
        </div>
      )}

      {/* Dynamic Role-Based Sidebar */}
      <aside className={`sidebar ${mobile ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">L</div>
          <div>
            <b>Lalita <span>Realestate Infra</span></b>
            <small>ENTERPRISE REAL ESTATE</small>
          </div>
          <button className="sidebar-close" onClick={() => setMobile(false)}>
            <X size={18} />
          </button>
        </div>

        {/* Project & Role Chip */}
        <div className="workspace-card">
          {!isCustomerRole && (
            <button
              className="workspace"
              onClick={() => setProject(project === 'All projects' ? 'Green Meadows' : 'All projects')}
              title="Switch project filter"
            >
              <span className="workspace-icon">GM</span>
              <span>
                <b>{project === 'All projects' ? 'Green Meadows' : project}</b>
                <small>Phase II · Mumbai</small>
              </span>
              <ChevronDown size={14} />
            </button>
          )}

          <div className="sidebar-role-tag" style={{ borderLeftColor: currentRoleConfig.color }}>
            <span className="role-dot" style={{ background: currentRoleConfig.color }} />
            <div className="role-tag-info">
              <b>{role}</b>
              <small>{currentRoleConfig.badge}</small>
            </div>
          </div>
        </div>

        {/* Dynamic Nav: Workspace Section */}
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {workspaceNav.map((n) => {
            const Icon = iconMap[n] || LayoutDashboard;
            const badge = getNavBadge(n);
            return (
              <button
                className={`nav-item ${page === n ? 'active' : ''}`}
                key={n}
                onClick={() => go(n)}
              >
                <Icon size={16} />
                <span>{n}</span>
                {badge && (
                  <i className={badge.alert ? 'alert-count' : ''}>
                    {badge.text}
                  </i>
                )}
              </button>
            );
          })}
        </nav>

        {/* Dynamic Nav: Insights Section */}
        {insightsNav.length > 0 && (
          <>
            <div className="nav-label nav-gap">INSIGHTS & GOVERNANCE</div>
            <nav>
              {insightsNav.map((n) => {
                const Icon = iconMap[n] || FileText;
                const badge = getNavBadge(n);
                return (
                  <button
                    className={`nav-item ${page === n ? 'active' : ''}`}
                    key={n}
                    onClick={() => go(n)}
                  >
                    <Icon size={16} />
                    <span>{n}</span>
                    {badge && (
                      <i className={badge.alert ? 'alert-count' : ''}>
                        {badge.text}
                      </i>
                    )}
                  </button>
                );
              })}
            </nav>
          </>
        )}

        {/* Sidebar Footer with Role Switcher & User Profile */}
        <div className="sidebar-bottom">
          <div className="user-profile">
            <div className="avatar avatar-indigo">
              {currentUser.name ? currentUser.name.substring(0, 2).toUpperCase() : 'AS'}
            </div>
            <div className="user-info">
              <b>{currentUser.name || 'Arjun Shah'}</b>
              <small>{role}</small>
            </div>

            {/* Perspective switcher: only a Super Admin session can preview other roles */}
            {session === 'SUPER ADMIN' && (
              <select
                value={role}
                onChange={(e) => handleRoleChange(e.target.value)}
                title="Preview another role"
              >
                {['SUPER ADMIN', 'ADMIN', 'SALES MANAGER', 'SALES AGENT', 'ACCOUNTS', 'MANAGEMENT', 'CUSTOMER'].map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            )}

            <button
              className="logout-button"
              onClick={handleLogout}
              title="Sign out of workspace"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Workspace Body */}
      <main className="main">
        {/* Top Header Bar */}
        <header className="topbar">
          <button className="menu-toggle" onClick={() => setMobile(true)}>
            <Menu size={19} />
          </button>

          <div className="breadcrumb">
            Workspace <span>/</span> <b>{page}</b>
          </div>

          <div className="top-actions">
            {/* Active Role Indicator in Topbar */}
            <div className="topbar-role-pill" style={{ background: currentRoleConfig.bg, color: currentRoleConfig.color }}>
              <Shield size={12} />
              <span>{role}</span>
            </div>

            {/* Global Search */}
            <div className="global-search">
              <Search size={14} />
              <input
                placeholder="Search plots, clients, deals..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <kbd>⌘K</kbd>
            </div>

            {/* Quick Perspective Switcher (Super Admin session only) */}
            {session === 'SUPER ADMIN' && (
              <div className="role-switch-quick">
                <select
                  value={role}
                  onChange={(e) => handleRoleChange(e.target.value)}
                  className="select-mini role-topbar-select"
                >
                  {['SUPER ADMIN', 'ADMIN', 'SALES MANAGER', 'SALES AGENT', 'ACCOUNTS', 'MANAGEMENT', 'CUSTOMER'].map((r) => (
                    <option key={r} value={r}>Role: {r}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Notifications Shortcut */}
            <button className="top-icon" onClick={() => go('Notifications')} title="View alerts">
              <Bell size={17} />
              <em />
            </button>

            <div className="top-divider" />

            {/* User Details & Logout */}
            <div className="top-user" onClick={handleLogout} title="Click to log out">
              <div className="avatar avatar-indigo">
                {currentUser.name ? currentUser.name.substring(0, 2).toUpperCase() : 'AS'}
              </div>
              <span>{currentUser.name || 'Arjun Shah'}</span>
              <LogOut size={13} className="logout-inline-icon" />
            </div>
          </div>
        </header>

        {/* Content Body */}
        <div className="content">
          {/* Page Heading & Actions */}
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <i className="live-dot" /> ENTERPRISE REAL ESTATE OPERATIONS · LIVE
              </div>
              <h1>
                {heading[0]} {page === 'Overview' && <span className="wave">✳</span>}
              </h1>
              <p>{heading[1]}</p>
            </div>

            <div className="heading-actions">
              {!isCustomerRole && (
                <button className="button button-white" onClick={exportCsv}>
                  <Download size={14} /> Export CSV
                </button>
              )}

              {/* Admin: look up any agent's numbers, beside New Booking */}
              {page === 'Overview' && isAdmin(role) && (
                <AgentLookup onPick={setAgentInfo} />
              )}

              {/* Role-tailored primary actions */}
              {canCreateBooking(role) && ['Overview', 'Bookings', 'Projects & plots'].includes(page) && (
                <button className="button button-primary" onClick={() => { setBookingPreset(null); setModal('booking'); }}>
                  <Plus size={15} /> {role === 'SALES AGENT' ? 'Quick Book Plot' : 'New Booking'}
                </button>
              )}
              {canRecordPayment(role) && ['Overview', 'Payments'].includes(page) && (
                <button className="button button-primary" onClick={() => setModal('payment')}>
                  <Plus size={15} /> Record Payment
                </button>
              )}
              {canCreateCustomer(role) && page === 'Customers' && (
                <button className="button button-primary" onClick={() => setModal('customer')}>
                  <Plus size={15} /> Add Customer
                </button>
              )}
              {isAdmin(role) && (page === 'Projects & plots' || page === 'Agents') && (
                <button
                  className="button button-white"
                  onClick={() => { setCrudPage(page); setEditRecord(null); setModal('record'); }}
                >
                  <Plus size={15} /> {page === 'Agents' ? 'Add Agent' : 'Add Project'}
                </button>
              )}
            </div>
          </div>

          {/* Filters Bar */}
          {!isCustomerRole && (
          <div className="filters">
            <label>
              <span>PROJECT</span>
              <select value={project} onChange={(e) => setProject(e.target.value)}>
                <option>All projects</option>
                {projects.map(p => <option key={p[0]}>{p[0]}</option>)}
              </select>
            </label>

            <label>
              <span>PERIOD</span>
              <select value={period} onChange={(e) => setPeriod(e.target.value)}>
                <option>This month</option>
                <option>Last month</option>
                <option>This quarter</option>
                <option>This year</option>
              </select>
            </label>

            <label className="search-filter">
              <Search size={14} />
              <input
                placeholder={`Search ${page.toLowerCase()}...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>

            <div className="filter-meta">
              <i className="live-dot" /> Live Data
              <span className="meta-divider" />
              Role: <b>{role}</b>
            </div>
          </div>
          )}

          {/* Admin: agent/customer entries waiting for approval */}
          {page === 'Overview' && canApprove(role) && pendingApprovals > 0 && (
            <div className="pending-banner">
              <span><b>{pendingApprovals}</b> item{pendingApprovals > 1 ? 's' : ''} entered by agents {pendingApprovals > 1 ? 'are' : 'is'} waiting for your approval.</span>
              <button className="button button-primary small-btn" onClick={() => go('Approvals')}>Review now</button>
            </div>
          )}

          {/* OVERVIEW: Distinct Dashboard per Role */}
          {page === 'Overview' && (
            <>
              {role === 'SUPER ADMIN' && (
                <SuperAdminDashboard go={go} notify={notify} users={users} />
              )}
              {role === 'ADMIN' && (
                <AdminDashboard bookings={bookings} pays={pays} go={go} D={setModal} notify={notify} />
              )}
              {role === 'SALES MANAGER' && (
                <SalesManagerDashboard go={go} D={setModal} notify={notify} agents={agents} />
              )}
              {role === 'SALES AGENT' && (
                <SalesAgentDashboard go={go} D={setModal} notify={notify} bookings={vBookings} plots={plots} />
              )}
              {role === 'CUSTOMER' && (
                <CustomerProfile
                  portal
                  customer={myCustomer}
                  bookings={bookings}
                  pays={pays}
                  receipts={vReceipts}
                  registry={registry}
                  role={role}
                  onOpenBill={(r) => setBillNo(r.no)}
                  onPrintBooking={openBooking}
                  notify={notify}
                />
              )}
              {role === 'ACCOUNTS' && (
                <AccountsDashboard go={go} D={setModal} notify={notify} pays={pays} />
              )}
              {role === 'MANAGEMENT' && (
                <ManagementDashboard go={go} notify={notify} projects={projects} />
              )}
            </>
          )}

          {/* OTHER PAGES: Customized & Role-Adapted */}
          {page === 'Approvals' && (
            <ApprovalsPage
              bookings={bookings}
              customers={customers}
              onApproveBooking={approveBooking}
              onRejectBooking={rejectBooking}
              onApproveCustomer={(c) => setCustomerStatus(c, 'Approved')}
              onRejectCustomer={(c) => setCustomerStatus(c, 'Rejected')}
              onWhatsApp={whatsappBooking}
              onPrintBooking={openBooking}
            />
          )}

          {page === 'Projects & plots' && (
            <Projects
              plots={plots}
              search={search}
              project={project}
              filter={filter}
              F={setFilter}
              tab={tab}
              TB={setTab}
              notify={notify}
              projects={projects}
              role={role}
              onBook={bookPlot}
            />
          )}

          {page === 'Bookings' && (
            <Bookings
              bookings={vBookings}
              project={project}
              search={search}
              tab={tab}
              TB={setTab}
              role={role}
              onNew={() => { setBookingPreset(null); setModal('booking'); }}
              onOpenCustomer={(name) => openCustomer(customers.find(c => c.name === name) || { name, mobile: '', email: '', address: '', agent: '' })}
              onApprove={approveBooking}
              onReject={rejectBooking}
              onPrint={openBooking}
              onWhatsApp={whatsappBooking}
            />
          )}

          {page === 'Payments' && (
            <Payments
              pays={vPays}
              receipts={vReceipts}
              project={project}
              search={search}
              filter={filter}
              F={setFilter}
              D={setModal}
              notify={notify}
              role={role}
              onOpenBill={(r) => setBillNo(r.no)}
              onShare={shareReceipt}
              onRemind={(p) => openWhatsApp(customerPhone(p[0]), `Dear ${p[0]}, a payment of ₹${p[5]} for Plot ${p[1]} (${p[2]}) is due ${p[6] !== '—' ? `on ${p[6]}` : 'now'}. Please pay at the earliest. - Lalita Realestate Infra`)}
            />
          )}

          {page === 'Customers' && (
            <CustomersPage
              customers={vCustomers}
              bookings={vBookings}
              role={role}
              search={search}
              project={project}
              onOpen={openCustomer}
              onAdd={() => setModal('customer')}
              onApprove={(c) => setCustomerStatus(c, 'Approved')}
              onReject={(c) => setCustomerStatus(c, 'Rejected')}
              onWhatsApp={whatsappCustomer}
            />
          )}

          {page === 'Agents' && (
            <Agents
              search={search}
              notify={notify}
              role={role}
            />
          )}

          {page === 'Commissions' && (
            <Commissions
              search={search}
              notify={notify}
              role={role}
            />
          )}

          {page === 'Reports' && (
            <Reports
              notify={notify}
              role={role}
            />
          )}

          {page === 'Documents' && (
            <DocumentsPage docs={documents} notify={notify} />
          )}

          {page === 'Notifications' && (
            <Notifications
              fups={fups}
              FUP={setFups}
              notify={notify}
              role={role}
            />
          )}

          {page === 'User & role management' && (
            <Roles
              role={role}
              notify={notify}
              users={users}
              create={() => { setUserEdit(null); setModal('user'); }}
              edit={(u) => { setUserEdit(u); setModal('user'); }}
              remove={(u) => { setUsers(users.filter(x => x.id !== u.id)); notify(`Removed user ${u.name}`); }}
            />
          )}

          {page === 'Administration' && (
            <Administration
              notify={notify}
              role={role}
            />
          )}

          {page === 'Customer detail' && (
            <CustomerProfile
              customer={selected && selected.name ? selected : vCustomers[0] || myCustomer}
              bookings={vBookings}
              pays={vPays}
              receipts={vReceipts}
              registry={registry}
              role={role}
              onRegistry={setRegistryStatus}
              onOpenBill={(r) => setBillNo(r.no)}
              onPrintBooking={openBooking}
              notify={notify}
            />
          )}

          {/* Module CRUD Records View */}
          {isAdmin(role) && !['Overview', 'Approvals', 'Customer detail', 'Customers', 'Bookings', 'Payments', 'User & role management', 'Documents'].includes(page) && (
            <CrudWorkspace
              page={page}
              records={crud[page] || []}
              project={project}
              search={search}
              role={role}
              create={() => { setCrudPage(page); setEditRecord(null); setModal('record'); }}
              edit={(r) => { setCrudPage(page); setEditRecord(r); setModal('record'); }}
              view={(r) => notify(`Inspecting ${r.name}`)}
              remove={(r) => {
                setCrud({ ...crud, [page]: (crud[page] || []).filter(x => x.id !== r.id) });
                notify(`Deleted ${r.name}`);
              }}
            />
          )}
        </div>
      </main>

      {/* Modal dialogs */}
      {modal === 'booking' && (
        <BookingModal
          role={role}
          agentName={myKey}
          customers={customers}
          plots={plots}
          preset={bookingPreset}
          close={() => { setModal(''); setBookingPreset(null); }}
          save={saveBooking}
        />
      )}
      {modal === 'payment' && (
        <PaymentModal bookings={bookings} pays={pays} close={() => setModal('')} save={savePayment} />
      )}
      {modal === 'customer' && (
        <CustomerModal agentName={myKey} customers={customers} close={() => setModal('')} save={saveCustomer} />
      )}
      {modal && !['booking', 'payment', 'customer'].includes(modal) && (
        <Modal
          kind={modal}
          close={() => { setModal(''); setEditRecord(null); setUserEdit(null); }}
          save={saveRecord}
          context={crudPage}
          initial={editRecord || userEdit}
          role={role}
        />
      )}

      {billReceipt && (
        <BillModal
          receipt={billReceipt}
          close={() => setBillNo('')}
          shared={billReceipt.shared}
          onShare={canManageBills(role) ? () => shareReceipt(billReceipt) : undefined}
          onCopy={() => copyBill(billReceipt)}
        />
      )}
      {bookingPrint && (
        <BookingFormModal
          booking={bookingPrint}
          customer={customers.find(c => c.name === bookingPrint[1])}
          plot={plotOf(bookingPrint[3])}
          close={() => setBookingPrint(null)}
          onWhatsApp={isCustomerRole ? undefined : () => whatsappBooking(bookingPrint)}
        />
      )}
      {agentInfo && (
        <AgentInfoModal agent={agentInfo} bookings={bookings} customers={customers} receipts={receipts} close={() => setAgentInfo(null)} />
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// REUSABLE PRESENTATIONAL COMPONENTS
// --------------------------------------------------------------------------

function Avatar({ name, i = 0 }) {
  return (
    <div className={`avatar avatar-${['peach', 'mint', 'lilac', 'sky', 'rose'][i % 5]}`}>
      {(name || 'NA').split(' ').slice(0, 2).map(x => x[0]).join('')}
    </div>
  );
}

function Badge({ children }) {
  const s = String(children).toLowerCase();
  return (
    <span className={`badge ${s.includes('paid') || s.includes('confirmed') || s === 'available' || s === 'active' || s === 'ready' ? 'badge-green' : s.includes('overdue') || s === 'suspended' ? 'badge-red' : s.includes('hold') || s.includes('processing') || s.includes('invited') ? 'badge-amber' : 'badge-indigo'}`}>
      {children}
    </span>
  );
}

function Mini({ title, value, color = '' }) {
  return (
    <div className="mini-stat">
      <small>{title}</small>
      <b className={color}>{value}</b>
    </div>
  );
}

function Table({ headers, rows }) {
  return (
    <div className="table-scroll data-table">
      <table>
        <thead>
          <tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --------------------------------------------------------------------------
// ROLE-ADAPTED MODULE PAGES
// --------------------------------------------------------------------------

function Projects({ plots, search, project, filter, F, tab, TB, notify, projects, role, onBook }) {
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

function Bookings({ bookings, project, search, tab, TB, role, onNew, onOpenCustomer, onApprove, onReject, onPrint, onWhatsApp }) {
  const statuses = ['All bookings', 'Confirmed', 'Pending Approval', 'Processing', 'Agreement', 'Rejected'];
  const rows = bookings.filter(b => {
    const textMatch = b.join(' ').toLowerCase().includes(search.toLowerCase());
    const projMatch = project === 'All projects' || b[2] === project;
    const tabMatch = tab === 'All bookings' || b[7].toLowerCase() === tab.toLowerCase();
    return textMatch && projMatch && tabMatch;
  });
  const count = (s) => bookings.filter(b => b[7] === s).length;
  const customerView = role === 'CUSTOMER';

  return (
    <>
      <RoleContextBanner role={role} page="Bookings" />

      <div className="mini-stats four">
        <Mini title="TOTAL BOOKINGS" value={bookings.length} />
        <Mini title="CONFIRMED" value={count('Confirmed')} color="green-text" />
        <Mini title="AWAITING ADMIN APPROVAL" value={count('Pending Approval')} color="amber-text" />
        <Mini title="AGREEMENT STAGE" value={count('Agreement')} color="indigo-text" />
      </div>

      <div className="panel section-panel">
        <div className="tabs">
          {statuses.map(s => (
            <button key={s} className={tab === s ? 'active' : ''} onClick={() => TB(s)}>
              {s}
            </button>
          ))}
          {canCreateBooking(role) && (
            <button className="button button-primary small-btn" onClick={onNew} style={{ marginLeft: 'auto' }}>
              <Plus size={12} /> New Booking
            </button>
          )}
        </div>

        <Table
          headers={['BOOKING ID', 'CUSTOMER', 'PROJECT & PLOT', 'DATE', 'VALUE', 'PAID', 'STATUS', 'AGENT', 'ACTIONS']}
          rows={rows.map(b => [
            <b>{b[0]}</b>,
            <div className="customer-cell"><Avatar name={b[1]} /><b>{b[1]}</b></div>,
            `${b[2]} · ${b[3]}`,
            b[4],
            `₹${b[5]}`,
            `₹${b[6]}`,
            <Badge>{b[7]}</Badge>,
            b[8],
            <div className="row-actions" key={b[0]}>
              <button className="icon-action" onClick={() => onOpenCustomer(b[1])} title="Customer profile">
                <Eye size={14} />
              </button>
              <button className="icon-action" onClick={() => onPrint(b)} title="Print booking form">
                <Printer size={14} />
              </button>
              <button className="icon-action wa-icon" onClick={() => onWhatsApp(b)} title="WhatsApp customer">
                <MessageCircle size={14} />
              </button>
              {canApprove(role) && b[7] === 'Pending Approval' && (
                <>
                  <button className="button button-primary small-btn" onClick={() => onApprove(b)}>Approve</button>
                  <button className="button button-white small-btn" onClick={() => onReject(b)}>Reject</button>
                </>
              )}
            </div>
          ])}
        />
        <div className="table-pagination">
          Showing {rows.length} bookings <span>{role === 'SALES AGENT' ? 'Your bookings only' : 'Role-filtered view'}</span>
        </div>
      </div>
    </>
  );
}

function Payments({ pays, receipts, project, search, filter, F, D, notify, role, onOpenBill, onShare, onRemind }) {
  const [view, setView] = useState('ledger');
  const canBill = canManageBills(role);
  const customerView = role === 'CUSTOMER';

  const list = pays.filter(p => {
    const textMatch = p.join(' ').toLowerCase().includes(search.toLowerCase());
    const projMatch = project === 'All projects' || p[2] === project;
    const filterMatch = filter === 'All status' || p[7] === filter.toUpperCase();
    return textMatch && projMatch && filterMatch;
  });
  const bills = receipts.filter(r => r.customer.toLowerCase().includes(search.toLowerCase()) || r.no.toLowerCase().includes(search.toLowerCase()) || r.plot.toLowerCase().includes(search.toLowerCase()));

  const total = pays.reduce((s, p) => s + parseAmt(p[3]), 0);
  const paid = pays.reduce((s, p) => s + parseAmt(p[4]), 0);
  const overdue = pays.filter(p => p[7] === 'OVERDUE').reduce((s, p) => s + parseAmt(p[5]), 0);

  return (
    <>
      <RoleContextBanner role={role} page="Payments" />

      <div className="mini-stats four">
        <Mini title="TOTAL BOOKING VALUE" value={`₹${fmtINR(total)}`} />
        <Mini title="COLLECTED TO DATE" value={`₹${fmtINR(paid)}`} color="green-text" />
        <Mini title="PENDING" value={`₹${fmtINR(total - paid)}`} color="indigo-text" />
        <Mini title="OVERDUE" value={`₹${fmtINR(overdue)}`} color="amber-text" />
      </div>

      <div className="panel section-panel">
        <div className="tabs">
          <button className={view === 'ledger' ? 'active' : ''} onClick={() => setView('ledger')}>{customerView ? 'My payments' : 'Ledger'} ({list.length})</button>
          <button className={view === 'bills' ? 'active' : ''} onClick={() => setView('bills')}>Bills &amp; receipts ({receipts.length})</button>
          {canRecordPayment(role) && (
            <button className="button button-primary small-btn" onClick={() => D('payment')} style={{ marginLeft: 'auto' }}>
              <Plus size={12} /> Record Payment
            </button>
          )}
        </div>

        {view === 'ledger' && (
          <>
            <div className="tabs">
              <span className="filter-label">STATUS:</span>
              {['All status', 'PAID', 'PARTIALLY PAID', 'PENDING', 'OVERDUE'].map(s => (
                <button key={s} className={`filter-btn ${filter === s ? 'active' : ''}`} onClick={() => F(s)}>
                  {s}
                </button>
              ))}
            </div>
            <Table
              headers={['CUSTOMER', 'PROJECT & PLOT', 'FINAL PRICE', 'PAID TO DATE', 'PENDING BALANCE', 'NEXT DUE DATE', 'STATUS', customerView ? 'AGENT' : 'ACTIONS']}
              rows={list.map(p => [
                <b>{p[0]}</b>,
                `${p[2]} · ${p[1]}`,
                `₹${p[3]}`,
                <span className="green-text">₹{p[4]}</span>,
                `₹${p[5]}`,
                p[6],
                <Badge>{p[7]}</Badge>,
                customerView ? p[8] : (
                  <div className="row-actions" key={`${p[0]}-${p[1]}`}>
                    {p[5] !== '0' && (
                      <button className="icon-action wa-icon" onClick={() => onRemind(p)} title="WhatsApp payment reminder">
                        <MessageCircle size={14} />
                      </button>
                    )}
                  </div>
                )
              ])}
            />
            <div className="table-pagination">Showing {list.length} ledgers <span>Balance updates automatically when a payment is recorded</span></div>
          </>
        )}

        {view === 'bills' && (
          <>
            <Table
              headers={['RECEIPT NO.', 'DATE', 'CUSTOMER', 'PLOT', 'AMOUNT', 'MODE', 'SHARED', 'ACTIONS']}
              rows={bills.map(r => [
                <b>{r.no}</b>,
                r.date,
                r.customer,
                `${r.project} · ${r.plot}`,
                <b>₹{r.amount}</b>,
                r.mode,
                <Badge>{r.shared ? 'Shared' : 'Not shared'}</Badge>,
                <div className="row-actions" key={r.no}>
                  <button className="icon-action" onClick={() => onOpenBill(r)} title="View / print bill (office + customer copy)">
                    <Printer size={14} />
                  </button>
                  {canBill && (
                    <button className="button whatsapp-btn small-btn" onClick={() => onShare(r)} title="Share bill with customer">
                      <MessageCircle size={12} /> Share
                    </button>
                  )}
                </div>
              ])}
            />
            {bills.length === 0 && <p className="empty-note">No bills yet.</p>}
            <div className="table-pagination">
              {customerView ? 'Bills shared with you by the office' : 'Each bill prints with an office copy and a customer copy'}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Agents({ search, notify, role }) {
  return (
    <>
      <RoleContextBanner role={role} page="Agents" />

      <div className="mini-stats four">
        <Mini title="ACTIVE SALES AGENTS" value="14" color="green-text" />
        <Mini title="BOOKINGS THIS MONTH" value="23" />
        <Mini title="SALES VALUE CLOSED" value="₹3.84 Cr" />
        <Mini title="COMMISSION POOL" value="₹7.68 L" color="amber-text" />
      </div>

      <div className="panel section-panel">
        <Table
          headers={['RANK', 'AGENT NAME', 'CODE', 'DEALS CLOSED', 'GROSS SALES', 'COLLECTED', 'COMMISSION', 'STATUS']}
          rows={agents.filter(a => a.join(' ').toLowerCase().includes(search.toLowerCase())).map((a, i) => [
            i + 1,
            <div className="customer-cell"><Avatar name={a[0]} i={i} /><b>{a[0]}</b></div>,
            a[1],
            a[2],
            `₹${a[3]}`,
            `₹${a[4]}`,
            `₹${a[5]}`,
            <Badge>Active</Badge>
          ])}
        />
      </div>
    </>
  );
}

function Commissions({ search, notify, role }) {
  const isAgent = role === 'SALES AGENT';
  const isManager = role === 'SALES MANAGER';
  const isAccounts = role === 'ACCOUNTS';

  const data = [
    ['M. Kumar', 'Green Meadows', 'A-012', '18,40,000', '2.0%', '36,800', 'APPROVED'],
    ['S. Patel', 'Green Meadows', 'C-078', '25,20,000', '2.0%', '50,400', 'PAYABLE'],
    ['R. Gupta', 'Silver Oaks', 'B-104', '12,60,000', '1.5%', '18,900', 'PAID'],
    ['A. Khan', 'Green Meadows', 'A-101', '9,60,000', '2.0%', '19,200', 'PROCESSING'],
    ['N. Bose', 'Park View', 'C-031', '24,75,000', '2.0%', '49,500', 'ON HOLD']
  ];

  return (
    <>
      <RoleContextBanner role={role} page="Commissions" />

      <div className="mini-stats four">
        <Mini title="TOTAL COMMISSIONS" value="₹7.68 L" />
        <Mini title="DISBURSED TO DATE" value="₹4.82 L" color="green-text" />
        <Mini title="READY FOR DISBURSAL" value="₹1.92 L" color="indigo-text" />
        <Mini title="PENDING APPROVAL" value="₹94,000" color="amber-text" />
      </div>

      <div className="panel section-panel">
        <Table
          headers={['AGENT', 'PROJECT', 'PLOT', 'DEAL VALUE', 'COMM. SLAB', 'AMOUNT (₹)', 'STATUS', 'ACTIONS']}
          rows={data.filter(a => a.join(' ').toLowerCase().includes(search.toLowerCase())).map(a => [
            <b>{a[0]}</b>,
            a[1],
            a[2],
            `₹${a[3]}`,
            a[4],
            `₹${a[5]}`,
            <Badge>{a[6]}</Badge>,
            <div className="table-actions-cell" key={a[0]}>
              <button className="icon-action" onClick={() => notify(`Commission slip for ${a[0]} opened`)} title="Inspect calculation">
                <Eye size={14} />
              </button>
              {isManager && a[6] === 'PROCESSING' && (
                <button className="button button-white small-btn" onClick={() => notify(`Approved commission for ${a[0]}`)}>
                  Approve
                </button>
              )}
              {isAccounts && a[6] === 'APPROVED' && (
                <button className="button button-primary small-btn" onClick={() => notify(`NEFT payout initiated for ${a[0]}`)}>
                  Disburse
                </button>
              )}
            </div>
          ])}
        />
      </div>
    </>
  );
}

function Reports({ notify, role }) {
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

function Notifications({ fups, FUP, notify, role }) {
  const data = [
    ['Payment overdue · Sneha Mehta', 'Plot B-033 · ₹5,60,000 is 10 days overdue.', 'Today, 9:42 AM', 'alert'],
    ['Installment due · Priya Nair', 'Plot A-101 · ₹4,80,000 due on 05 Oct 2026.', 'Today, 8:15 AM', 'warn'],
    ['New booking confirmed · Rajesh Sharma', 'Plot A-012 confirmed by sales manager.', 'Yesterday, 5:30 PM', 'info'],
    ['Plot hold expiry · Plot C-031', 'Hold period expires in 4 hours for customer.', 'Yesterday, 2:10 PM', 'warn'],
    ['System snapshot backup completed', 'Database cold archive backed up to S3 vault.', 'Yesterday, 1:00 AM', 'system']
  ];

  return (
    <>
      <RoleContextBanner role={role} page="Notifications" />

      <div className="panel section-panel">
        <div className="panel-head">
          <div>
            <h2>Alerts, Follow-ups & Reminders</h2>
            <p>Operational queues filtered for your role</p>
          </div>
        </div>

        <div className="notifications-list">
          {data.map((item, i) => (
            <div className="notification-row" key={i}>
              <span className={`status-dot ${item[3] === 'alert' ? 'red' : item[3] === 'warn' ? 'amber' : 'green'}`} />
              <div className="notification-info">
                <b>{item[0]}</b>
                <p>{item[1]}</p>
                <small>{item[2]}</small>
              </div>
              <button
                className="button button-white small-button"
                onClick={() => {
                  FUP({ ...fups, [i]: true });
                  notify(fups[i] ? 'Already followed up' : 'Action logged in workspace');
                }}
              >
                {fups[i] ? 'Followed up ✓' : 'Take Action'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Roles({ role, notify, users = [], create, edit, remove }) {
  const matrix = [
    ['SUPER ADMIN', '✓', '✓', '✓', '✓', '✓', '✓', '✓', '✓'],
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

function Administration({ notify, role }) {
  const data = [
    ['Organization profile', 'Company information and legal entity registration', Building2],
    ['Projects & layout schemas', 'Phase layouts, plot master blueprints and base rates', Map],
    ['User identity & IAM', 'Multi-factor authentication and role assignment policies', Users],
    ['Tax & GST invoicing', 'Receipt numbering, state GST, TDS withholding percentages', Receipt],
    ['Banking & payment gateways', 'Escrow account details, NEFT/RTGS accounts, virtual IDs', Wallet]
  ];

  return (
    <>
      <RoleContextBanner role={role} page="Administration" />

      <div className="panel section-panel">
        <div className="panel-head">
          <div>
            <h2>System Master Configuration</h2>
            <p>Global parameters, project schemas, and compliance rules</p>
          </div>
        </div>

        <div className="settings-grid">
          {data.map(([title, desc, Icon]) => (
            <div className="setting-card" key={title}>
              <div className="setting-icon"><Icon size={20} /></div>
              <div>
                <b>{title}</b>
                <p>{desc}</p>
                <button className="text-button" onClick={() => notify(`${title} settings opened`)}>
                  Configure module →
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function CrudWorkspace({ page, records, project, search, create, edit, view, remove, role }) {
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

function Modal({ kind, close, save, context, initial, role }) {
  const record = kind === 'record';
  const title = kind === 'user'
    ? `${initial ? 'Edit' : 'Add'} Team Member`
    : record
    ? `${initial ? 'Edit' : 'Create'} ${context === 'Projects & plots' ? 'Project' : context === 'Agents' ? 'Agent' : 'Record'}`
    : 'Save Record';

  const fields = kind === 'user' ? [
    ['name', 'Full Name', 'text', 'Enter full name'],
    ['email', 'Email Address', 'email', 'name@company.com'],
    ['phone', 'Mobile Number', 'tel', '+91 98765 43210'],
    ['role', 'Role', 'select', ['ADMIN', 'SUPER ADMIN', 'SALES MANAGER', 'SALES AGENT', 'ACCOUNTS', 'MANAGEMENT']],
    ['status', 'Account Status', 'select', ['Active', 'Invited', 'Suspended']]
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
            <span className="modal-kicker">Lalita ERP · {context || 'WORKSPACE'}</span>
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
// MOUNT APPLICATION ROOT
// --------------------------------------------------------------------------

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
