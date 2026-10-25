/**
 * Application shell.
 *
 * Composition only: the shell reads state through selectors, renders the
 * role-appropriate page and mounts the shared modals. Business rules live in
 * thunks (`store/thunks.js`), so pages stay presentational.
 */
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Download, Plus } from 'lucide-react';

import { PAGE_FOR_PATH, PATH_FOR, PAGES } from '../constants/navigation';
import { ROLES } from '../constants/roles';
import { FilterBar, PageHeader, Toast } from '../components/common';
import { Sidebar, Topbar } from '../components/layout';
import { useAppDispatch, useAppSelector, useAuth, useNotify } from '../hooks';
import {
  selectAllowedPages, selectBillReceipt, selectBillingSummary, selectBookingForPrint, selectDomain, selectPageLoading,
  selectDocuments, selectHeading, selectTenants, selectTenantsMeta, selectNavBadge, selectNavigation, selectPage,
  selectPendingApprovals, selectUsers, selectPlotForPrint, selectRoleConfig, selectScopedData, selectUi,
} from '../store/selectors';
import { hasSession } from '../api';
import {
  createBooking, createCustomer, decideBooking, decideCustomer, deleteRecord, hydrateWorkspace, restoreSession,
  markReceiptShared, recordPayment, saveProject, setInvoiceStatus, setPaymentStatus, setNextDueDate, changeMyPassword, saveRecord, setFollowUp, updateCustomerLive, deleteCustomerLive, updateBookingLive, deleteBookingLive, deleteProjectLive, deletePlotLive, updatePlotLive, addPlotsLive, resetUserPasswordLive,
  setRegistryStatus, actionNotification, loadNotifications, signIn, signOut, saveInvoice, issueInvoice, cancelInvoice, payInvoice,
  shareInvoice, downloadInvoicePdf,
} from '../store/thunks';
import {
  billOpened, bookingPrintSet, agentInfoSet, customerSelected, filterChanged, modalClosed, modalOpened,
  pageChanged, periodChanged, projectChanged, searchChanged, sidebarToggled, tabChanged,
} from '../store/slices/uiSlice';

import { ChangePasswordDialog } from '../features/auth/ChangePasswordDialog';
import { COMPANY } from '../data/appConfig';
import { LoginScreen } from '../features/auth/LoginScreen';
import { ApprovalsPage } from '../features/approvals/ApprovalsPage';
import { AdminDashboard } from '../features/dashboard/AdminDashboard';
import { AccountsDashboard } from '../features/dashboard/AccountsDashboard';
import { PortfolioInsights } from '../features/dashboard/PortfolioInsights';
import { SalesAgentDashboard } from '../features/dashboard/SalesAgentDashboard';
import { SalesManagerDashboard } from '../features/dashboard/SalesManagerDashboard';
import { PlatformDashboard } from '../features/dashboard/PlatformDashboard';
import { TenantsPage } from '../features/tenants/TenantsPage';
import { Projects } from '../features/projects/Projects';
import { Bookings } from '../features/bookings/Bookings';
import { Payments } from '../features/payments/Payments';
import { Billing } from '../features/billing/Billing';
import { Agents } from '../features/agents/Agents';
import { Commissions } from '../features/commissions/Commissions';
import { Expenses } from '../features/expenses/Expenses';
import { Reports } from '../features/reports/Reports';
import { Notifications } from '../features/notifications/Notifications';
import { Roles } from '../features/users/Roles';
import { Administration } from '../features/admin/Administration';
import { RecordModal } from '../features/admin/RecordModal';
import { CustomerProfile, CustomersPage, DocumentsPage } from '../features/customers/CustomerViews';
import { BookingModal, CustomerModal, PaymentModal } from '../features/bookings/FeatureModals';
import { BillModal, BookingFormModal } from '../features/documents/PrintSheets';
import { AgentInfoModal, AgentLookup } from '../features/agents/AgentLookup';
import {
  activateTenant, addTenantAdmin, loadTenantDetail, resetTenantAdminPassword, saveTenant, suspendTenant,
} from '../store/tenantThunks';
import { openWhatsApp } from '../utils/whatsapp';
import { agentKey } from '../utils/names';
import { downloadCsv } from '../utils/csv';
import { clientAudit } from '../utils/security';

export function App() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const notify = useNotify();
  const auth = useAuth();

  const ui = useAppSelector(selectUi);
  const domain = useAppSelector(selectDomain);
  const pageLoading = useAppSelector(selectPageLoading);
  const notifications = useAppSelector((state) => state.notifications);
  const teamUsers = useAppSelector(selectUsers);
  const loginNotice = useAppSelector((state) => state.auth.loginNotice);
  const [changingPassword, setChangingPassword] = useState(false);
  // "Skip for now" on the first-sign-in prompt lasts until the next sign-in.
  const [passwordPromptSkipped, setPasswordPromptSkipped] = useState(false);
  useEffect(() => { if (!auth.session) setPasswordPromptSkipped(false); }, [auth.session]);
  const needsVerification = useAppSelector((state) => state.auth.needsVerification);
  const [verifying, setVerifying] = useState(needsVerification);
  const unread = auth.mode === 'live' ? notifications.items.filter((n) => !n.is_read).length : null;
  const scoped = useAppSelector(selectScopedData);
  const nav = useAppSelector(selectNavigation);
  const allowedPages = useAppSelector(selectAllowedPages);
  const roleConfig = useAppSelector(selectRoleConfig);
  const heading = useAppSelector(selectHeading);
  const pendingApprovals = useAppSelector(selectPendingApprovals);
  const documents = useAppSelector(selectDocuments);
  const badgeFor = useAppSelector(selectNavBadge);
  const tenants = useAppSelector(selectTenants);
  const tenantsMeta = useAppSelector(selectTenantsMeta);
  const billReceipt = useAppSelector(selectBillReceipt);
  const billingSummary = useAppSelector(selectBillingSummary);
  const bookingPrint = useAppSelector(selectBookingForPrint);
  const plotForPrint = useAppSelector(selectPlotForPrint);
  const role = auth.role;
  const page = allowedPages.includes(ui.page) ? ui.page : PAGES.OVERVIEW;

  /* ------------------------------------------------------------- effects */
  // URL -> Redux: direct links cannot bypass the role's navigation.
  useEffect(() => {
    const requested = PAGE_FOR_PATH[location.pathname] || PAGES.OVERVIEW;
    const resolved = allowedPages.includes(requested) ? requested : PAGES.OVERVIEW;
    if (resolved !== ui.page) {
      dispatch(pageChanged(resolved));
      if (resolved !== requested) navigate(PATH_FOR[resolved], { replace: true });
    }
  }, [location.pathname, allowedPages, dispatch, navigate, ui.page]);

  // After a page reload the stored session is confirmed with the server first; until then nothing is
  // shown or saved, so the app can never be "signed in" without being connected.
  useEffect(() => {
    if (!needsVerification) return;
    dispatch(restoreSession()).finally(() => setVerifying(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the approval queue fresh: customers/bookings sent by agents appear without a reload.
  useEffect(() => {
    if (!hasSession() || ![PAGES.APPROVALS, PAGES.CUSTOMERS, PAGES.OVERVIEW, PAGES.BOOKINGS].includes(page)) return undefined;
    dispatch(hydrateWorkspace({ silent: true }));
    if (page !== PAGES.APPROVALS) return undefined;
    const timer = setInterval(() => dispatch(hydrateWorkspace({ silent: true })), 20000);
    return () => clearInterval(timer);
  }, [page, dispatch]);

  // My notification queue: on every page change and every 30s while signed in.
  useEffect(() => {
    if (!hasSession()) return undefined;
    dispatch(loadNotifications());
    const timer = setInterval(() => dispatch(loadNotifications()), 30000);
    return () => clearInterval(timer);
  }, [page, auth.mode, dispatch]);

  // Utilities (e.g. WhatsApp) report problems through this event so the user always gets feedback.
  useEffect(() => {
    const onNotify = (event) => notify(String(event.detail || ''));
    window.addEventListener('erp:notify', onNotify);
    return () => window.removeEventListener('erp:notify', onNotify);
  }, [notify]);

  // Global search keyboard shortcut (⌘K / Ctrl-K).
  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.querySelector('.global-search input')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (target) => {
    dispatch(pageChanged(target));
    navigate(PATH_FOR[target] || '/');
  };

  const notifyExport = () => {
    const isPayments = page === PAGES.PAYMENTS;
    const isBilling = page === PAGES.BILLING;
    const rows = isPayments
      ? scoped.payments.map((p) => [p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8]])
      : isBilling
        ? scoped.invoices.map((inv) => [
          inv.invoice_number, inv.customer_name, inv.project_name, inv.plot_number,
          inv.booking_number, inv.issue_date, inv.due_date || '', inv.status,
          inv.total_amount, inv.amount_paid, inv.balance_amount, inv.gst_amount,
        ])
        : scoped.bookings.map((b) => b.slice(0, 9));
    const headers = isPayments
      ? ['Customer', 'Plot', 'Project', 'Booking value', 'Paid', 'Pending', 'Due date', 'Status', 'Agent']
      : isBilling
        ? ['Invoice no.', 'Customer', 'Project', 'Plot', 'Booking', 'Issue date', 'Due date', 'Status',
          'Total', 'Paid', 'Balance', 'GST']
        : ['Booking ID', 'Customer', 'Project', 'Plot', 'Date', 'Value', 'Paid', 'Status', 'Agent'];
    downloadCsv(`export-${page.toLowerCase().replaceAll(' ', '-')}`, rows, headers);
    clientAudit('report.exported', { page, rows: rows.length });
    notify('CSV report exported successfully');
  };

  const customerPhone = (name) => domain.customers.find((c) => c.name === name)?.mobile || '';
  const billText = (receipt) =>
    `Dear ${receipt.customer}, we have received ₹${receipt.amount} for Plot ${receipt.plot} (${receipt.project}). `
    + `Receipt ${receipt.no} dated ${receipt.date}. Balance: ₹${receipt.balance}. Thank you - ${COMPANY.name}.`;

  const shareReceipt = (receipt) => {
    dispatch(markReceiptShared(receipt));
    // The bill is visible in the customer's login either way; WhatsApp only opens when the number is usable.
    openWhatsApp(customerPhone(receipt.customer), billText(receipt));
  };

  const shareInvoiceBill = (invoice) => {
    dispatch(shareInvoice(invoice));
    const balance = Number(invoice.balance_amount) || 0;
    const text = `Dear ${invoice.customer_name}, invoice ${invoice.invoice_number} for `
      + `₹${invoice.total_amount} (${invoice.project_name || 'your booking'}${invoice.plot_number ? ` · Plot ${invoice.plot_number}` : ''}) `
      + `is ${String(invoice.status).toLowerCase().replace(/_/g, ' ')}`
      + (balance > 0 ? `. Balance due: ₹${balance}${invoice.due_date ? ` by ${invoice.due_date}` : ''}. ` : '. Thank you. ')
      + `The PDF bill is attached with this message. - ${COMPANY.name}`;
    openWhatsApp(customerPhone(invoice.customer_name), text);
  };

  const copyBill = async (receipt) => {
    try {
      await navigator.clipboard.writeText(billText(receipt));
      notify('Bill text copied');
    } catch {
      notify('Copy not available in this browser');
    }
  };

  const whatsappBooking = (booking) => {
    const confirmed = ['Confirmed', 'Agreement', 'Registered'].includes(booking[7]);
    const text = confirmed
      ? `Dear ${booking[1]}, your booking ${booking[0]} for Plot ${booking[3]} (${booking[2]}) is confirmed. `
        + `Final price ₹${booking[5]}, paid ₹${booking[6]}. - ${COMPANY.name}`
      : `Dear ${booking[1]}, your booking ${booking[0]} for Plot ${booking[3]} (${booking[2]}) is `
        + `${String(booking[7]).toLowerCase()}. We will update you shortly. - ${COMPANY.name}`;
    openWhatsApp(customerPhone(booking[1]), text);
  };

  // The tab title follows the signed-in organisation.
  useEffect(() => {
    if (auth.session && auth.user?.tenantName) document.title = auth.user.tenantName;
  }, [auth.session, auth.user?.tenantName]);

  /* ---------------------------------------------------------------- auth */
  if (verifying) return <div className="boot-screen" role="status">Loading your workspace…</div>;
  if (!auth.session) {
    return (
      <LoginScreen
        onLogin={(credentials) => dispatch(signIn(credentials))}
        notice={loginNotice}
      />
    );
  }

  return (
    <div className="app-shell">
      <Toast />

      <Sidebar
        role={role}
        roleConfig={roleConfig}
        user={auth.user}
        nav={nav}
        badgeFor={badgeFor}
        page={page}
        mobileOpen={ui.mobileOpen}
        projects={domain.projects}
        project={ui.project}
        session={auth.session}
        tenantName={auth.isPlatform ? 'PLATFORM CONSOLE' : auth.user?.tenantName}
        showWorkspace={!auth.isPlatform}
        onNavigate={go}
        onClose={() => dispatch(sidebarToggled(false))}
        onProjectChange={(value) => dispatch(projectChanged(value))}
        onLogout={() => dispatch(signOut())}
        onChangePassword={auth.mode === 'live' ? () => setChangingPassword(true) : undefined}
      />

      <main className="main">
        <Topbar
          page={page}
          role={role}
          roleConfig={roleConfig}
          session={auth.session}
          tenantName={auth.isPlatform ? 'Platform' : auth.user?.tenantName}
          search={ui.search}
          user={auth.user}
          unread={unread}
          onMenu={() => dispatch(sidebarToggled(true))}
          onSearch={(value) => dispatch(searchChanged(value))}
          onNavigate={go}
          onLogout={() => dispatch(signOut())}
        />

        <div className={`content ${pageLoading ? 'is-loading' : ''}`}>
          <PageHeader title={<>{heading[0]} {page === PAGES.OVERVIEW && <span className="wave">✳</span>}</>} subtitle={heading[1]}>
            {!scoped.isCustomerRole && !auth.isPlatform && page !== PAGES.EXPENSES && (
              <button className="button button-white" onClick={notifyExport}>
                <Download size={14} /> Export CSV
              </button>
            )}

            {page === PAGES.OVERVIEW && auth.isAdmin && (
              <AgentLookup onPick={(agent) => dispatch(agentInfoSet(agent))} />
            )}

            {auth.canCreateBooking && [PAGES.OVERVIEW, PAGES.BOOKINGS, PAGES.PROJECTS].includes(page) && (
              <button className="button button-primary" onClick={() => dispatch(modalOpened({ modal: 'booking' }))}>
                <Plus size={15} /> {role === ROLES.SALES_AGENT ? 'Quick Book Plot' : 'New Booking'}
              </button>
            )}
            {auth.canRecordPayment && [PAGES.OVERVIEW, PAGES.PAYMENTS].includes(page) && (
              <button className="button button-primary" onClick={() => dispatch(modalOpened({ modal: 'payment' }))}>
                <Plus size={15} /> Record Payment
              </button>
            )}
            {auth.canCreateCustomer && page === PAGES.CUSTOMERS && (
              <button className="button button-primary" onClick={() => dispatch(modalOpened({ modal: 'customer' }))}>
                <Plus size={15} /> Add Customer
              </button>
            )}
          </PageHeader>

          <FilterBar
            hidden={scoped.isCustomerRole || auth.isPlatform}
            project={ui.project}
            projects={domain.projects}
            period={ui.period}
            search={ui.search}
            role={role}
            placeholder={`Search ${page.toLowerCase()}...`}
            onProject={(value) => dispatch(projectChanged(value))}
            onPeriod={(value) => dispatch(periodChanged(value))}
            onSearch={(value) => dispatch(searchChanged(value))}
          />

          {page === PAGES.OVERVIEW && auth.canApprove && pendingApprovals > 0 && (
            <div className="pending-banner">
              <span>
                <b>{pendingApprovals}</b> item{pendingApprovals > 1 ? 's' : ''} entered by agents
                {pendingApprovals > 1 ? ' are' : ' is'} waiting for your approval.
              </span>
              <button className="button button-primary small-btn" onClick={() => go(PAGES.APPROVALS)}>Review now</button>
            </div>
          )}

          {/* ---------------------------------------------------- page switch */}
          {page === PAGES.OVERVIEW && (
            <>
              {role === ROLES.SUPER_ADMIN && <PlatformDashboard tenants={tenants} go={go} userName={auth.user?.name} />}
              {role === ROLES.ADMIN && (
                <AdminDashboard bookings={domain.bookings} pays={domain.payments} plots={domain.plots} project={ui.project} go={go} D={(kind, preset) => dispatch(modalOpened({ modal: kind, preset }))} notify={notify} />
              )}
              {role === ROLES.ADMIN && <PortfolioInsights go={go} projects={domain.projects} plots={domain.plots} bookings={scoped.bookings} receipts={scoped.receipts} />}
              {role === ROLES.SALES_MANAGER && (
                <SalesManagerDashboard go={go} D={(kind, preset) => dispatch(modalOpened({ modal: kind, preset }))} notify={notify} bookings={scoped.bookings} customers={scoped.customers || domain.customers} project={ui.project} />
              )}
              {role === ROLES.SALES_AGENT && (
                <SalesAgentDashboard agentName={auth.user?.name} go={go} D={(kind, preset) => dispatch(modalOpened({ modal: kind, preset }))} notify={notify} bookings={scoped.bookings} plots={domain.plots} project={ui.project} />
              )}
              {role === ROLES.CUSTOMER && (
                <CustomerProfile
                  portal
                  customer={scoped.myCustomer}
                  bookings={domain.bookings}
                  pays={domain.payments}
                  receipts={scoped.receipts}
                  registry={domain.registry}
                  role={role}
                  onOpenBill={(receipt) => dispatch(billOpened(receipt.no))}
                  onPrintBooking={(booking) => dispatch(bookingPrintSet(booking[0]))}
                  notify={notify}
                />
              )}
              {role === ROLES.ACCOUNTS && (
                <AccountsDashboard go={go} D={(kind, preset) => dispatch(modalOpened({ modal: kind, preset }))} notify={notify} pays={domain.payments} receipts={scoped.receipts} />
              )}
            </>
          )}

          {page === PAGES.APPROVALS && (
            <ApprovalsPage
              bookings={domain.bookings}
              customers={domain.customers}
              onApproveBooking={(booking) => dispatch(decideBooking(booking, 'approve'))}
              onRejectBooking={(booking) => dispatch(decideBooking(booking, 'reject'))}
              onApproveCustomer={(customer) => dispatch(decideCustomer(customer, 'Approved'))}
              onRejectCustomer={(customer) => dispatch(decideCustomer(customer, 'Rejected'))}
              onWhatsApp={whatsappBooking}
              onPrintBooking={(booking) => dispatch(bookingPrintSet(booking[0]))}
            />
          )}

          {page === PAGES.PROJECTS && (
            <Projects
              plots={domain.plots}
              search={ui.search}
              project={ui.project}
              filter={ui.filter}
              F={(value) => dispatch(filterChanged(value))}
              tab={ui.tab}
              TB={(value) => dispatch(tabChanged(value))}
              notify={notify}
              projects={domain.projects}
              role={role}
              onSaveProject={(form, editing) => dispatch(saveProject(form, editing))}
              onDeleteProject={(project) => dispatch(deleteProjectLive(project))}
              onDeletePlot={(plot) => dispatch(deletePlotLive(plot))}
              onEditPlot={(plot, changes) => dispatch(updatePlotLive(plot, changes))}
              onAddPlots={(body, count) => dispatch(addPlotsLive(body, count))}
              onBook={(plot) => dispatch(modalOpened({ modal: 'booking', preset: { project: plot[8], plot: plot[0] } }))}
            />
          )}

          {page === PAGES.BOOKINGS && (
            <Bookings
              bookings={scoped.bookings}
              project={ui.project}
              search={ui.search}
              tab={ui.tab}
              TB={(value) => dispatch(tabChanged(value))}
              role={role}
              onNew={() => dispatch(modalOpened({ modal: 'booking' }))}
              onOpenCustomer={(name, booking) => {
                // Roles without a customer page see the booking form instead.
                if (!allowedPages.includes(PAGES.CUSTOMER_DETAIL)) {
                  dispatch(bookingPrintSet(booking[0]));
                  return;
                }
                dispatch(customerSelected(
                  (typeof booking[11] === 'number' && domain.customers.find((c) => c.id === booking[11])) ||
                  domain.customers.find((c) => c.name === name) || { name, mobile: '', email: '', address: '', agent: '' },
                ));
                go(PAGES.CUSTOMER_DETAIL);
              }}
              onApprove={(booking) => dispatch(decideBooking(booking, 'approve'))}
              onReject={(booking) => dispatch(decideBooking(booking, 'reject'))}
              onPrint={(booking) => dispatch(bookingPrintSet(booking[0]))}
              onWhatsApp={whatsappBooking}
              onEdit={(booking, changes) => dispatch(updateBookingLive(booking, changes))}
              onDelete={(booking, password, deletePayments) => dispatch(deleteBookingLive(booking, password, deletePayments))}
            />
          )}

          {page === PAGES.PAYMENTS && (
            <Payments
              pays={scoped.payments}
              receipts={scoped.receipts}
              project={ui.project}
              search={ui.search}
              filter={ui.filter}
              F={(value) => dispatch(filterChanged(value))}
              D={modalOpened}
              notify={notify}
              role={role}
              onOpenBill={(receipt) => dispatch(billOpened(receipt.no))}
              onShare={shareReceipt}
              onStatus={(payment, status) => dispatch(setPaymentStatus(payment, status))}
              onDueDate={auth.mode === 'live' ? (payment, date) => dispatch(setNextDueDate(payment, date)) : undefined}
              onRemind={(row) => openWhatsApp(
                customerPhone(row[0]),
                `Dear ${row[0]}, a payment of ₹${row[5]} for Plot ${row[1]} (${row[2]}) is due `
                + `${row[6] !== '—' ? `on ${row[6]}` : 'now'}. Please pay at the earliest. - ${COMPANY.name}`,
              )}
            />
          )}

          {page === PAGES.BILLING && (
            <Billing
              invoices={scoped.invoices}
              bookings={scoped.bookings}
              customers={domain.customers}
              summary={billingSummary}
              project={ui.project}
              search={ui.search}
              filter={ui.filter}
              F={(value) => dispatch(filterChanged(value))}
              notify={notify}
              role={role}
              onCreate={(form) => dispatch(saveInvoice(form))}
              onIssue={(invoice) => dispatch(issueInvoice(invoice))}
              onCancel={(invoice, reason) => dispatch(cancelInvoice(invoice, reason))}
              onStatus={(invoice, status) => dispatch(setInvoiceStatus(invoice, status))}
              onPay={(invoice, payment) => dispatch(payInvoice(invoice, payment))}
              onPdf={(invoice) => dispatch(downloadInvoicePdf(invoice))}
              onShare={shareInvoiceBill}
            />
          )}

          {page === PAGES.CUSTOMERS && (
            <CustomersPage
              customers={scoped.customers}
              bookings={scoped.bookings}
              role={role}
              search={ui.search}
              project={ui.project}
              onOpen={(customer) => {
                dispatch(customerSelected(customer));
                go(PAGES.CUSTOMER_DETAIL);
              }}
              onAdd={() => dispatch(modalOpened({ modal: 'customer' }))}
              onApprove={(customer) => dispatch(decideCustomer(customer, 'Approved'))}
              onReject={(customer) => dispatch(decideCustomer(customer, 'Rejected'))}
              onEdit={(customer, changes) => dispatch(updateCustomerLive(customer, changes))}
              onDelete={(customer) => dispatch(deleteCustomerLive(customer))}
              onWhatsApp={(customer) => openWhatsApp(
                customer.mobile,
                `Hello ${customer.name}, this is ${COMPANY.name} regarding your plot booking.`,
              )}
            />
          )}

          {page === PAGES.TENANTS && auth.isPlatform && (
            <TenantsPage
              tenants={tenants}
              search={ui.search}
              loading={tenantsMeta.loading}
              error={tenantsMeta.error}
              onSave={(form, editing) => dispatch(saveTenant(form, editing))}
              onSuspend={(tenant, reason) => dispatch(suspendTenant(tenant, reason))}
              onActivate={(tenant) => dispatch(activateTenant(tenant))}
              onAddAdmin={(tenant, form) => dispatch(addTenantAdmin(tenant, form))}
              onResetPassword={(tenant, admin) => dispatch(resetTenantAdminPassword(tenant, admin))}
              onOpenDetail={(tenant) => dispatch(loadTenantDetail(tenant))}
            />
          )}

          {page === PAGES.AGENTS && <Agents search={ui.search} notify={notify} role={role} bookings={scoped.bookings} project={ui.project} onView={(agent) => dispatch(agentInfoSet(agent))} />}
          {page === PAGES.COMMISSIONS && <Commissions search={ui.search} notify={notify} role={role} bookings={scoped.bookings} project={ui.project} />}
          {page === PAGES.EXPENSES && <Expenses search={ui.search} notify={notify} role={role} />}
          {page === PAGES.REPORTS && (
            <Reports
              notify={notify}
              role={role}
              bookings={scoped.bookings}
              payments={scoped.payments}
              plots={domain.plots}
              projects={domain.projects}
              project={ui.project}
              onExport={(key, rows) => clientAudit('report.exported', { report: key, rows })}
            />
          )}
          {page === PAGES.DOCUMENTS && (
            <DocumentsPage
              docs={documents}
              notify={notify}
              onOpenDocument={(doc) => (doc.receiptNo
                ? dispatch(billOpened(doc.receiptNo))
                : dispatch(bookingPrintSet({ id: doc.bookingId, kind: doc.kind })))}
            />
          )}
          {page === PAGES.NOTIFICATIONS && (
            <Notifications
              items={notifications.items}
              live={auth.mode === 'live'}
              onAction={(item) => dispatch(actionNotification(item))}
              fups={domain.followUps}
              onNavigate={go}
              allowedPages={allowedPages}
              FUP={(id, value) => dispatch(setFollowUp(id, value))}
              notify={notify}
              role={role}
            />
          )}

          {page === PAGES.USERS && (
            <Roles
              role={role}
              notify={notify}
              users={teamUsers}
              create={() => dispatch(modalOpened({ modal: 'user' }))}
              edit={(user) => dispatch(modalOpened({ modal: 'user', userEdit: user }))}
              remove={(user) => dispatch(deleteRecord(user))}
              resetPassword={(user) => dispatch(resetUserPasswordLive(user))}
            />
          )}

          {page === PAGES.ADMIN && <Administration notify={notify} role={role} onNavigate={go} allowedPages={allowedPages} />}

          {page === PAGES.CUSTOMER_DETAIL && (
            <CustomerProfile
              customer={ui.customerSelected || scoped.customers[0] || scoped.myCustomer}
              bookings={scoped.bookings}
              pays={scoped.payments}
              receipts={scoped.receipts}
              registry={domain.registry}
              role={role}
              onRegistry={(id, value) => dispatch(setRegistryStatus(id, value))}
              onOpenBill={(receipt) => dispatch(billOpened(receipt.no))}
              onPrintBooking={(booking) => dispatch(bookingPrintSet(booking[0]))}
              notify={notify}
            />
          )}
        </div>
      </main>

      {/* ------------------------------------------------------- modals */}
      {ui.modal === 'booking' && (
        <BookingModal
          role={role}
          agentName={scoped.agentName}
          byAdmin={Boolean(auth.isAdmin)}
          customers={domain.customers}
          plots={domain.plots}
          projects={domain.projects}
          preset={ui.bookingPreset}
          close={() => dispatch(modalClosed())}
          save={(form) => dispatch(createBooking({ ...form, agent: scoped.agentName }))}
        />
      )}
      {ui.modal === 'payment' && (
        <PaymentModal
          bookings={domain.bookings}
          pays={domain.payments}
          close={() => dispatch(modalClosed())}
          save={(payload) => dispatch(recordPayment(payload))}
        />
      )}
      {ui.modal === 'customer' && (
        <CustomerModal
          agentName={scoped.agentName}
          customers={domain.customers}
          projects={domain.projects}
          defaultProject={ui.project === 'All projects' ? '' : ui.project}
          close={() => dispatch(modalClosed())}
          save={(form) => dispatch(createCustomer(form))}
        />
      )}
      {ui.modal && !['booking', 'payment', 'customer'].includes(ui.modal) && (
        <RecordModal
          kind={ui.modal}
          close={() => dispatch(modalClosed())}
          save={(record) => dispatch(saveRecord(record))}
          context={ui.crudPage}
          initial={ui.editRecord || ui.userEdit}
          role={role}
        />
      )}

      {auth.mode === 'live' && ((auth.user?.mustChangePassword && !passwordPromptSkipped) || changingPassword) && (
        <ChangePasswordDialog
          forced={Boolean(auth.user?.mustChangePassword) && !changingPassword}
          onSubmit={(form) => dispatch(changeMyPassword(form))}
          close={() => { setChangingPassword(false); setPasswordPromptSkipped(true); }}
        />
      )}

      {billReceipt && (
        <BillModal
          receipt={billReceipt}
          close={() => dispatch(billOpened(''))}
          shared={billReceipt.shared}
          onShare={auth.canManageBills ? () => shareReceipt(billReceipt) : undefined}
          onCopy={() => copyBill(billReceipt)}
        />
      )}
      {bookingPrint && (
        <BookingFormModal
          booking={bookingPrint}
          customer={domain.customers.find((c) => c.name === bookingPrint[1])}
          plot={plotForPrint}
          kind={ui.bookingDocKind}
          close={() => dispatch(bookingPrintSet(null))}
          onWhatsApp={scoped.isCustomerRole ? undefined : () => whatsappBooking(bookingPrint)}
        />
      )}
      {ui.agentInfo && (
        <AgentInfoModal
          agent={ui.agentInfo}
          bookings={domain.bookings}
          customers={domain.customers}
          receipts={domain.receipts}
          close={() => dispatch(agentInfoSet(null))}
        />
      )}
    </div>
  );
}
