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
  Sparkles, Check, CheckCircle
} from 'lucide-react';

import './style.css';
import './components/RoleThemeStyles.css';

import {
  projects, seedBookings, seedPlots, seedPays, agents, seedUsers, seedCrud, roleConfigs
} from './data/seedData';

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
  const page = Object.keys(pathFor).find(k => pathFor[k] === location.pathname) || 'Overview';

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
  const [session, setSession] = useState(() => localStorage.getItem('nmt_session') || 'ADMIN');
  const [role, setRole] = useState(() => localStorage.getItem('nmt_role') || 'ADMIN');
  const [users, setUsers] = useState(() => JSON.parse(localStorage.getItem('nmt_users') || 'null') || seedUsers);
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = JSON.parse(localStorage.getItem('nmt_current_user') || 'null');
    return saved || roleConfigs['ADMIN'].defaultUser;
  });

  // Core ERP Domain Data
  const [bookings, setBookings] = useState(() => JSON.parse(localStorage.getItem('nmt_bookings') || 'null') || seedBookings);
  const [plots, setPlots] = useState(() => JSON.parse(localStorage.getItem('nmt_plots') || 'null') || seedPlots);
  const [pays, setPays] = useState(() => JSON.parse(localStorage.getItem('nmt_payments') || 'null') || seedPays);
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
  useEffect(() => localStorage.setItem('nmt_bookings', JSON.stringify(bookings)), [bookings]);
  useEffect(() => localStorage.setItem('nmt_plots', JSON.stringify(plots)), [plots]);
  useEffect(() => localStorage.setItem('nmt_payments', JSON.stringify(pays)), [pays]);
  useEffect(() => localStorage.setItem('nmt_module_crud', JSON.stringify(crud)), [crud]);
  useEffect(() => localStorage.setItem('nmt_users', JSON.stringify(users)), [users]);
  useEffect(() => localStorage.setItem('nmt_role', role), [role]);
  useEffect(() => localStorage.setItem('nmt_current_user', JSON.stringify(currentUser)), [currentUser]);

  useEffect(() => {
    if (page === 'Projects & plots') setTab('Plots');
    if (page === 'Bookings') setTab('All bookings');
  }, [page]);

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
    notify(`Welcome to NMT ERP! Logged in as ${user.name} (${selectedRole}).`);
    go('Overview');
  };

  const handleRegister = (newUser) => {
    setUsers([newUser, ...users]);
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
    const rows = page === 'Payments' ? pays.map(x => x.join(',')) : bookings.map(x => x.join(','));
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
    } else if (modal === 'booking') {
      const id = `BK-2026-${String(149 + bookings.length - seedBookings.length).padStart(4, '0')}`;
      const b = [id, d.customer, d.project, d.plot, '28 Sep 2026', d.amount, d.paid || '0', 'Processing', d.agent || currentUser.name];
      setBookings([b, ...bookings]);
      setPlots(plots.map(x => x[0] === d.plot ? [...x.slice(0, 5), 'BOOKED', d.customer, d.agent || currentUser.name] : x));
      notify(`Booking created for ${d.customer} · Plot ${d.plot} marked BOOKED`);
    } else if (modal === 'payment') {
      const due = Number(d.total.replaceAll(',', '')) - Number(d.paid.replaceAll(',', ''));
      setPays([[
        d.customer, d.plot, d.project, d.total, d.paid,
        due.toLocaleString('en-IN'), d.due || '—', due <= 0 ? 'PAID' : 'PARTIALLY PAID', d.agent || currentUser.name
      ], ...pays]);
      notify(`Payment of ₹${d.paid} recorded for ${d.customer}`);
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

  // If no active session, show the interactive Auth screen with generated real estate photography
  if (!session) {
    return <LoginScreen onLogin={handleLogin} onRegister={handleRegister} />;
  }

  // Active role config & navigation definitions
  const currentRoleConfig = roleConfigs[role] || roleConfigs['ADMIN'];
  const workspaceNav = currentRoleConfig.workspaceNav || ['Overview', 'Projects & plots', 'Bookings', 'Payments'];
  const insightsNav = currentRoleConfig.insightsNav || ['Reports', 'Documents', 'Notifications'];

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
      if (itemName === 'Notifications') return { text: '5', alert: false };
      if (itemName === 'User & role management') return { text: `${users.length}`, alert: false };
    } else if (role === 'ADMIN') {
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
          <div className="brand-mark">N</div>
          <div>
            <b>NMT <span>ERP</span></b>
            <small>ENTERPRISE REAL ESTATE</small>
          </div>
          <button className="sidebar-close" onClick={() => setMobile(false)}>
            <X size={18} />
          </button>
        </div>

        {/* Project & Role Chip */}
        <div className="workspace-card">
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

            {/* Quick Role Switcher */}
            <select
              value={role}
              onChange={(e) => handleRoleChange(e.target.value)}
              title="Change user perspective"
            >
              {['SUPER ADMIN', 'ADMIN', 'SALES MANAGER', 'SALES AGENT', 'ACCOUNTS', 'MANAGEMENT'].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>

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

            {/* Quick Perspective Switcher */}
            <div className="role-switch-quick">
              <select
                value={role}
                onChange={(e) => handleRoleChange(e.target.value)}
                className="select-mini role-topbar-select"
              >
                {['SUPER ADMIN', 'ADMIN', 'SALES MANAGER', 'SALES AGENT', 'ACCOUNTS', 'MANAGEMENT'].map((r) => (
                  <option key={r} value={r}>Role: {r}</option>
                ))}
              </select>
            </div>

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
              <button className="button button-white" onClick={exportCsv}>
                <Download size={14} /> Export CSV
              </button>

              {/* Role-tailored primary CTA */}
              {role === 'SALES AGENT' && (
                <button className="button button-primary" onClick={() => setModal('booking')}>
                  <Plus size={15} /> Quick Book Plot
                </button>
              )}
              {role === 'ACCOUNTS' && (
                <button className="button button-primary" onClick={() => setModal('payment')}>
                  <Plus size={15} /> Record Payment
                </button>
              )}
              {(role === 'ADMIN' || role === 'SUPER ADMIN' || role === 'SALES MANAGER') && (
                <button
                  className="button button-primary"
                  onClick={() => {
                    setCrudPage(page);
                    setEditRecord(null);
                    setModal(page === 'Payments' ? 'payment' : page === 'Bookings' ? 'booking' : 'record');
                  }}
                >
                  <Plus size={15} />
                  {page === 'Payments' ? 'Record Payment' : page === 'Projects & plots' ? 'Add Project' : page === 'Agents' ? 'Add Agent' : page === 'Customers' ? 'Add Customer' : 'New Booking'}
                </button>
              )}
            </div>
          </div>

          {/* Filters Bar */}
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
                <SalesAgentDashboard go={go} D={setModal} notify={notify} bookings={bookings} plots={plots} />
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
              D={setModal}
            />
          )}

          {page === 'Bookings' && (
            <Bookings
              bookings={bookings}
              project={project}
              search={search}
              tab={tab}
              TB={setTab}
              setSelected={setSelected}
              go={go}
              role={role}
              D={setModal}
              notify={notify}
            />
          )}

          {page === 'Payments' && (
            <Payments
              pays={pays}
              project={project}
              search={search}
              filter={filter}
              F={setFilter}
              D={setModal}
              notify={notify}
              role={role}
            />
          )}

          {page === 'Customers' && (
            <Customers
              bookings={bookings}
              project={project}
              search={search}
              go={go}
              setSelected={setSelected}
              selected={selected}
              role={role}
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
            <Documents
              notify={notify}
              role={role}
            />
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
            <CustomerDetail
              selected={selected || bookings[0]}
              notify={notify}
              role={role}
            />
          )}

          {/* Module CRUD Records View */}
          {page !== 'Overview' && page !== 'Customer detail' && page !== 'User & role management' && (
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

      {/* Modal Dialog */}
      {modal && (
        <Modal
          kind={modal}
          close={() => { setModal(''); setEditRecord(null); setUserEdit(null); }}
          save={saveRecord}
          context={crudPage}
          initial={editRecord || userEdit}
          role={role}
        />
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

function Projects({ plots, search, project, filter, F, tab, TB, notify, projects, role, D }) {
  const isAgent = role === 'SALES AGENT';
  const isAccounts = role === 'ACCOUNTS';
  const isManager = role === 'SALES MANAGER';

  const list = plots.filter(p => {
    const textMatch = p.join(' ').toLowerCase().includes(search.toLowerCase());
    const projectMatch = project === 'All projects' || ((p[0].startsWith('A-') ? 'Green Meadows' : p[0].startsWith('B-') ? 'Silver Oaks' : 'Park View') === project);
    const statusMatch = filter === 'All status' || p[5] === filter.toUpperCase();
    return textMatch && projectMatch && statusMatch;
  });

  const plotRows = list.map(p => {
    const isAvail = p[5] === 'AVAILABLE';
    return [
      <b>{p[0]}</b>,
      p[1],
      p[2],
      p[3],
      `₹${p[4]}`,
      <Badge>{p[5]}</Badge>,
      p[6],
      p[7],
      <div className="table-actions-cell" key={p[0]}>
        <button className="icon-action" onClick={() => notify(`Plot ${p[0]} specifications opened`)} title="View Specs">
          <Eye size={14} />
        </button>
        {isAgent && isAvail && (
          <button className="button button-primary small-btn" onClick={() => D('booking')} title="Quick reserve plot">
            Reserve
          </button>
        )}
      </div>
    ];
  });

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
        ) : (
          <Table
            headers={['PLOT NO.', 'LAYOUT', 'AREA (SQ.FT)', 'FACING', 'PRICE', 'STATUS', 'CUSTOMER', 'AGENT', 'ACTIONS']}
            rows={plotRows}
          />
        )}
      </div>
    </>
  );
}

function Bookings({ bookings, project, search, tab, TB, setSelected, go, role, D, notify }) {
  const isAgent = role === 'SALES AGENT';
  const isManager = role === 'SALES MANAGER';
  const isAccounts = role === 'ACCOUNTS';

  const statuses = ['All bookings', 'Confirmed', 'Processing', 'Agreement'];
  const rows = bookings.filter(b => {
    const textMatch = b.join(' ').toLowerCase().includes(search.toLowerCase());
    const projMatch = project === 'All projects' || b[2] === project;
    const tabMatch = tab === 'All bookings' || b[7].toLowerCase() === tab.toLowerCase();
    return textMatch && projMatch && tabMatch;
  });

  return (
    <>
      <RoleContextBanner role={role} page="Bookings" />

      <div className="mini-stats four">
        <Mini title="TOTAL BOOKINGS" value="176" />
        <Mini title="CONFIRMED" value="142" color="green-text" />
        <Mini title="UNDER PROCESSING" value="23" color="indigo-text" />
        <Mini title="AGREEMENT STAGE" value="11" color="amber-text" />
      </div>

      <div className="panel section-panel">
        <div className="tabs">
          {statuses.map(s => (
            <button key={s} className={tab === s ? 'active' : ''} onClick={() => TB(s)}>
              {s}
            </button>
          ))}
          {isAgent && (
            <button className="button button-primary small-btn" onClick={() => D('booking')} style={{ marginLeft: 'auto' }}>
              <Plus size={12} /> New Deal
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
            <div className="table-actions-cell" key={b[0]}>
              <button className="icon-action" onClick={() => { setSelected(b); go('Customer detail'); }} title="View details">
                <Eye size={14} />
              </button>
              {isManager && b[7] === 'Processing' && (
                <button className="button button-white small-btn" onClick={() => notify(`Booking ${b[0]} approved and confirmed.`)}>
                  Approve
                </button>
              )}
              {isAccounts && (
                <button className="button button-white small-btn" onClick={() => notify(`Tax invoice generated for ${b[0]}.`)}>
                  Invoice
                </button>
              )}
            </div>
          ])}
        />
        <div className="table-pagination">
          Showing {rows.length} bookings <span>Role-filtered view</span>
        </div>
      </div>
    </>
  );
}

function Payments({ pays, project, search, filter, F, D, notify, role }) {
  const isAccounts = role === 'ACCOUNTS';
  const isAgent = role === 'SALES AGENT';

  const list = pays.filter(p => {
    const textMatch = p.join(' ').toLowerCase().includes(search.toLowerCase());
    const projMatch = project === 'All projects' || p[2] === project;
    const filterMatch = filter === 'All status' || p[7] === filter.toUpperCase();
    return textMatch && projMatch && filterMatch;
  });

  return (
    <>
      <RoleContextBanner role={role} page="Payments" />

      <div className="mini-stats five">
        <Mini title="TOTAL BOOKING VALUE" value="₹12.6 Cr" />
        <Mini title="COLLECTED TO DATE" value="₹7.9 Cr" color="green-text" />
        <Mini title="PENDING INSTALMENTS" value="₹4.7 Cr" color="indigo-text" />
        <Mini title="OVERDUE RECOVERY" value="₹86.4 L" color="amber-text" />
        <Mini title="TODAY'S COLLECTION" value="₹4.2 L" color="green-text" />
      </div>

      <div className="panel section-panel">
        <div className="tabs">
          <span className="filter-label">RECONCILIATION STATUS:</span>
          {['All status', 'PAID', 'PARTIALLY PAID', 'PENDING', 'OVERDUE'].map(s => (
            <button key={s} className={`filter-btn ${filter === s ? 'active' : ''}`} onClick={() => F(s)}>
              {s}
            </button>
          ))}
          {isAccounts && (
            <button className="button button-primary small-btn" onClick={() => D('payment')} style={{ marginLeft: 'auto' }}>
              <Plus size={12} /> Record Receipt
            </button>
          )}
        </div>

        <Table
          headers={['CUSTOMER', 'PROJECT & PLOT', 'TOTAL VALUE', 'PAID TO DATE', 'PENDING BALANCE', 'NEXT DUE DATE', 'STATUS', 'AGENT', 'ACTIONS']}
          rows={list.map(p => [
            <b>{p[0]}</b>,
            `${p[2]} · ${p[1]}`,
            `₹${p[3]}`,
            <span className="green-text">₹{p[4]}</span>,
            `₹${p[5]}`,
            p[6],
            <Badge>{p[7]}</Badge>,
            p[8],
            <div className="table-actions-cell" key={p[0]}>
              <button className="icon-action" onClick={() => notify(`Customer ledger opened for ${p[0]}`)} title="Inspect Ledger">
                <Eye size={14} />
              </button>
              {isAccounts && p[7] === 'OVERDUE' && (
                <button className="button button-white small-btn" onClick={() => notify(`Formal demand notice emailed to ${p[0]}.`)}>
                  Notice
                </button>
              )}
            </div>
          ])}
        />
        <div className="table-pagination">
          Showing {list.length} customer ledgers <span>Audited financial records</span>
        </div>
      </div>
    </>
  );
}

function Customers({ bookings, project, search, go, setSelected, selected, role }) {
  if (selected && selected.length) {
    return <CustomerDetail selected={selected} notify={() => {}} role={role} />;
  }

  const rows = bookings.filter(b => {
    return b.join(' ').toLowerCase().includes(search.toLowerCase()) && (project === 'All projects' || b[2] === project);
  });

  return (
    <>
      <RoleContextBanner role={role} page="Customers" />

      <div className="mini-stats four">
        <Mini title="TOTAL CUSTOMERS" value="176" />
        <Mini title="ACTIVE BOOKINGS" value="152" color="green-text" />
        <Mini title="AVG DEAL SIZE" value="₹18.4 L" />
        <Mini title="REPEAT BUYERS" value="28" color="indigo-text" />
      </div>

      <div className="panel section-panel">
        <Table
          headers={['CUSTOMER NAME', 'PROJECT · PLOT', 'BOOKING ID', 'ALLOTMENT DATE', 'TOTAL DEAL', 'OUTSTANDING', 'PROFILE']}
          rows={rows.map(b => [
            <div className="customer-cell"><Avatar name={b[1]} /><b>{b[1]}</b></div>,
            `${b[2]} · ${b[3]}`,
            b[0],
            b[4],
            `₹${b[5]}`,
            `₹${(Number(b[5].replaceAll(',', '')) - Number(b[6].replaceAll(',', ''))).toLocaleString('en-IN')}`,
            <button className="icon-action" onClick={() => { setSelected(b); go('Customer detail'); }} title="Open customer dossier">
              <Eye size={14} />
            </button>
          ])}
        />
      </div>
    </>
  );
}

function CustomerDetail({ selected, notify, role }) {
  const b = selected;
  return (
    <div className="customer-detail">
      <RoleContextBanner role={role} page="Customers" />

      <div className="panel customer-summary">
        <Avatar name={b[1]} />
        <div>
          <span className="eyebrow">CUSTOMER PROFILE & DOSSIER</span>
          <h2>{b[1]}</h2>
          <p>+91 98•••• •••42 · Assigned Property Consultant: {b[8]}</p>
        </div>
        <button className="button button-white" onClick={() => notify(`Customer file for ${b[1]} downloaded.`)}>
          <Download size={14} /> Dossier PDF
        </button>
      </div>

      <div className="overview-grid">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Property Allocation</h2>
              <p>Registered unit and project details</p>
            </div>
            <Badge>{b[7]}</Badge>
          </div>
          <div className="detail-rows">
            <div><span>Project</span><b>{b[2]}</b></div>
            <div><span>Unit / Plot</span><b>{b[3]}</b></div>
            <div><span>Booking Date</span><b>{b[4]}</b></div>
            <div><span>Booking Value</span><b>₹{b[5]}</b></div>
            <div><span>Paid to Date</span><b className="green-text">₹{b[6]}</b></div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Legal & Contract Documents</h2>
              <p>Executed documents</p>
            </div>
          </div>
          {['Booking Form', 'Allotment Letter', 'Agreement to Sale', 'Payment Receipt'].map(x => (
            <div className="document-row" key={x}>
              <FileText size={17} />
              <b>{x}</b>
              <button className="icon-action" onClick={() => notify(`Opened ${x} for ${b[1]}`)}>
                <Eye size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
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

function Documents({ notify, role }) {
  const docs = [
    ['Booking Form', 'Rajesh Sharma · A-012', '12 Jun 2026', 'Booking'],
    ['Allotment Letter', 'Rajesh Sharma · A-012', '14 Jun 2026', 'Allocation'],
    ['Agreement to Sale', 'Rajesh Sharma · A-012', '18 Jun 2026', 'Agreement'],
    ['Tax Receipt #0211', 'Rajesh Sharma · ₹4,80,000', '20 Sep 2026', 'Receipt'],
    ['Booking Form', 'Anita Verma · B-104', '27 Sep 2026', 'Booking'],
    ['Token Receipt #0212', 'Anita Verma · ₹6,30,000', '27 Sep 2026', 'Receipt']
  ];

  return (
    <>
      <RoleContextBanner role={role} page="Documents" />

      <div className="panel section-panel">
        <div className="panel-head">
          <div>
            <h2>Document Vault & Customer Files</h2>
            <p>Audited records, signed conveyance deeds, and official receipts</p>
          </div>
        </div>

        <div className="documents-list">
          {docs.map((d, idx) => (
            <div className="document-row" key={idx}>
              <FileText size={18} className="indigo-text" />
              <div>
                <b>{d[0]}</b>
                <small>{d[1]}</small>
              </div>
              <span className="doc-date">{d[2]}</span>
              <Badge>{d[3]}</Badge>
              <button className="icon-action" onClick={() => notify(`${d[0]} preview opened`)}>
                <Eye size={14} />
              </button>
              <button className="icon-action" onClick={() => notify(`${d[0]} download started`)}>
                <Download size={14} />
              </button>
            </div>
          ))}
        </div>
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
  const pay = kind === 'payment';
  const record = kind === 'record';
  const title = kind === 'user'
    ? `${initial ? 'Edit' : 'Add'} Team Member`
    : record
    ? `${initial ? 'Edit' : 'Create'} ${context === 'Projects & plots' ? 'Project' : context === 'Bookings' ? 'Booking' : context === 'Payments' ? 'Payment' : 'Record'}`
    : kind === 'booking'
    ? 'Create Sales Booking'
    : pay
    ? 'Record Customer Payment'
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
  ] : pay ? [
    ['customer', 'Customer Name', 'text', 'Rajesh Sharma'],
    ['plot', 'Plot Number', 'text', 'A-012'],
    ['project', 'Project', 'select', ['Green Meadows', 'Silver Oaks', 'Park View', 'River Enclave']],
    ['total', 'Booking Value (₹)', 'text', '18,40,000'],
    ['paid', 'Amount Received (₹)', 'text', '2,00,000'],
    ['due', 'Next Due Date', 'date', ''],
    ['agent', 'Received By', 'select', ['M. Kumar', 'S. Patel', 'R. Gupta', 'N. Bose']]
  ] : kind === 'booking' ? [
    ['customer', 'Customer Name', 'text', 'Neha Kapoor'],
    ['mobile', 'Mobile Number', 'tel', '+91 98765 43210'],
    ['project', 'Project', 'select', ['Green Meadows', 'Silver Oaks', 'Park View', 'River Enclave']],
    ['plot', 'Plot Number', 'text', 'A-024'],
    ['amount', 'Booking Value (₹)', 'text', '18,40,000'],
    ['paid', 'Token Advance (₹)', 'text', '2,00,000'],
    ['agent', 'Assigned Agent', 'select', ['M. Kumar', 'S. Patel', 'R. Gupta', 'N. Bose']],
    ['plan', 'Installment Plan', 'select', ['12 monthly installments', '6 monthly installments', 'Paid in full']]
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
            <span className="modal-kicker">NMT ERP · {context || 'WORKSPACE'}</span>
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
              {initial ? 'Save Changes' : pay ? 'Record Payment' : kind === 'booking' ? 'Confirm Booking' : 'Save'}
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
