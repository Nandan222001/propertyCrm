/**
 * Derived state. Every page reads its data through these selectors, so
 * role-scoping (agent sees own records, customer sees only theirs) and the
 * document/approval counts exist exactly once.
 */
import { createSelector } from '@reduxjs/toolkit';
import { ROLES } from '../constants/roles';
import { NAV_BADGES, PAGE_META, PAGES } from '../constants/navigation';
import { agentKey } from '../utils/names';
import { roleConfigs } from '../data/appConfig';

export const selectAuth = (state) => state.auth;
export const selectDomain = (state) => state.domain;
export const selectUi = (state) => state.ui;

export const selectSession = (state) => state.auth.session;
export const selectRole = (state) => state.auth.role;
export const selectCurrentUser = (state) => state.auth.currentUser;
export const selectUsers = (state) => state.auth.users;
export const selectMode = (state) => state.auth.mode;
export const selectIsSignedIn = (state) => Boolean(state.auth.session);

export const selectPage = (state) => state.ui.page;
export const selectSearch = (state) => state.ui.search;
export const selectProject = (state) => state.ui.project;
export const selectFilter = (state) => state.ui.filter;
export const selectPeriod = (state) => state.ui.period;
export const selectTab = (state) => state.ui.tab;
export const selectToast = (state) => state.ui.toast;

/** Role configuration (nav sets, colour, title) for the active role. */
export const selectRoleConfig = createSelector([selectRole], (role) => roleConfigs[role] || roleConfigs[ROLES.ADMIN]);

/** Nav sections for the active role, intersected with the pages that exist. */
export const selectNavigation = createSelector([selectRoleConfig], (config) => ({
  workspace: config.workspaceNav || [],
  insights: config.insightsNav || [],
}));

export const selectHeading = createSelector([selectRoleConfig, selectPage], (config, page) =>
  PAGE_META[page] || [config.title, config.subtitle]);

/** Direct URLs cannot reach a page the role is not allowed to open. */
export const selectAllowedPages = createSelector([selectNavigation], ({ workspace, insights }) => {
  const pages = [...workspace, ...insights];
  if (workspace.includes(PAGES.CUSTOMERS)) pages.push(PAGES.CUSTOMER_DETAIL);
  return pages;
});

/**
 * Role-scoped ERP data. Agents see only rows keyed to their agent code,
 * customers only their own; everyone else sees the book.
 */
export const selectScopedData = createSelector(
  [selectRole, selectCurrentUser, selectDomain, (state) => state.auth.mode],
  (role, currentUser, domain, mode) => {
    const isAgentRole = role === ROLES.SALES_AGENT;
    const isCustomerRole = role === ROLES.CUSTOMER;
    const live = mode === 'live';
    // Without a server session the agent is matched by name. Against the
    // real API the server has already limited every list to this person, so nothing is re-filtered
    // here (a login name never has to equal the agent record's name).
    const liveAgentName = (domain.bookings.find((b) => b[8] && b[8] !== '—')?.[8])
      || (domain.customers.find((c) => c.agent)?.agent) || '';
    const key = live && isAgentRole ? (liveAgentName || currentUser?.name || '') : agentKey(currentUser?.name || '');
    const name = currentUser?.customerName || currentUser?.name || '';

    const inScope = (row, agentIndex, customerIndex) => {
      if (live) return true;
      if (isAgentRole) return row[agentIndex] === key;
      if (isCustomerRole) return row[customerIndex] === name;
      return true;
    };

    const bookings = domain.bookings.filter((b) => inScope(b, 8, 1));
    const payments = domain.payments.filter((p) => inScope(p, 8, 0));
    const customers = live ? domain.customers : isAgentRole
      ? domain.customers.filter((c) => c.agent === key)
      : isCustomerRole
        ? domain.customers.filter((c) => c.name === name)
        : domain.customers;
    const receipts = live
      ? (isCustomerRole ? domain.receipts.filter((r) => r.shared) : domain.receipts)
      : isAgentRole
        ? domain.receipts.filter((r) => r.agent === key)
        : isCustomerRole
          ? domain.receipts.filter((r) => r.customer === name && r.shared)
          : domain.receipts;
    const invoices = live || !isCustomerRole
      ? domain.invoices
      : domain.invoices.filter((inv) => inv.customer_name === name);

    const myCustomer = domain.customers.find((c) => c.name === name)
      || { id: 'CUS-NEW', name, mobile: '', email: currentUser?.email || '', address: '', agent: '' };

    return { bookings, payments, customers, receipts, invoices, myCustomer, isAgentRole, isCustomerRole, agentName: key };
  },
);

export const selectPendingApprovals = createSelector([selectDomain], (domain) =>
  domain.bookings.filter((b) => b[7] === 'Pending Approval').length
  + domain.customers.filter((c) => c.status === 'Pending Approval').length);

/** Document vault — generated from bookings + receipts, never stored twice. */
export const selectDocuments = createSelector([selectScopedData], ({ bookings, receipts }) => [
  ...bookings.flatMap((b) => [
    { key: `bf-${b[0]}`, title: 'Booking Form', sub: `${b[1]} · ${b[3]}`, date: b[4], kind: 'Booking', bookingId: b[0] },
    ...(['Confirmed', 'Agreement', 'Registered'].includes(b[7])
      ? [{ key: `al-${b[0]}`, title: 'Allotment Letter', sub: `${b[1]} · ${b[3]}`, date: b[4], kind: 'Allotment', bookingId: b[0] }] : []),
    ...(b[7] === 'Agreement'
      ? [{ key: `ag-${b[0]}`, title: 'Agreement to Sale', sub: `${b[1]} · ${b[3]}`, date: b[4], kind: 'Agreement', bookingId: b[0] }] : []),
  ]),
  ...receipts.map((r) => ({ key: r.no, title: `Receipt ${r.no}`, sub: `${r.customer} · ₹${r.amount}`, date: r.date, kind: 'Receipt', receiptNo: r.no })),
]);

/** Nav badge rules live here (one place) rather than inside the sidebar JSX. */
export const selectNavBadge = createSelector(
  [selectRole, selectPendingApprovals, selectUsers, selectDomain, (state) => state.tenants.items],
  (role, pending, users, domain, tenants) => (item) => {
    const table = NAV_BADGES[role] || {};
    const badge = table[item];
    if (!badge) return null;
    const overdueInvoices = domain.invoices.filter((inv) => inv.status === 'OVERDUE').length;
    const overduePayments = domain.payments.filter((p) => p[7] === 'OVERDUE').length;
    const text = String(badge.text)
      .replace('{pending}', String(pending))
      .replace('{users}', String(users.length))
      .replace('{overdueInvoices}', String(overdueInvoices))
      .replace('{overduePayments}', String(overduePayments))
      .replace('{tenants}', String(tenants.length));
    if (!text || text === '0') return null;
    return { text, alert: Boolean(badge.alert) };
  },
);

export const selectBillReceipt = createSelector([selectDomain, selectUi], (domain, ui) =>
  domain.receipts.find((r) => r.no === ui.billNo));

export const selectBookingForPrint = createSelector([selectDomain, selectUi], (domain, ui) =>
  domain.bookings.find((b) => b[0] === ui.bookingPrint) || null);

export const selectPlotForPrint = createSelector([selectDomain, selectBookingForPrint], (domain, booking) =>
  booking ? domain.plots.find((p) => p[0] === booking[3]) : null);

/** Billing KPI block, derived from the scoped invoice book (never stored twice). */
export const selectBillingSummary = createSelector([selectScopedData], ({ invoices }) => {
  const live = invoices.filter((inv) => !['DRAFT', 'CANCELLED'].includes(inv.status));
  const num = (row, field) => Number(row[field]) || 0;
  return {
    billed: live.reduce((sum, inv) => sum + num(inv, 'total_amount'), 0),
    collected: live.reduce((sum, inv) => sum + num(inv, 'amount_paid'), 0),
    outstanding: live.reduce((sum, inv) => sum + num(inv, 'balance_amount'), 0),
    overdue: live.filter((inv) => inv.status === 'OVERDUE').reduce((sum, inv) => sum + num(inv, 'balance_amount'), 0),
    gstCharged: live.reduce((sum, inv) => sum + num(inv, 'gst_amount'), 0),
    draftValue: invoices.filter((inv) => inv.status === 'DRAFT').reduce((sum, inv) => sum + num(inv, 'total_amount'), 0),
    invoiceCount: invoices.length,
    statusCounts: invoices.reduce((counts, inv) => ({
      ...counts, [inv.status]: (counts[inv.status] || 0) + 1,
    }), {}),
  };
});

export const selectTenants = (state) => state.tenants.items;
export const selectTenantsMeta = createSelector(
  [(state) => state.tenants.status, (state) => state.tenants.error],
  (status, error) => ({ loading: status === 'loading', error }),
);

/** True while the workspace or a page's own data is still being fetched: KPI tiles show "Loading…" instead of 0. */
export const selectPageLoading = (state) => state.domain.status === 'loading'
  || Object.keys(state.ui.loadingKeys || {}).length > 0
  || state.tenants.status === 'loading'
  || state.auth.usersReady === false;
