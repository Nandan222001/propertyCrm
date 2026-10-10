/**
 * Declarative REST client: one entry per backend resource, so no component ever
 * hand-writes a URL. `list/get/create/update/remove` are generated from the
 * endpoint table in `constants/api.js` (DRY across a dozen collections).
 */
import { ENDPOINTS } from '../constants/api';
import { authedRequest, request, requestBlob } from './client';

const COLLECTION_PATHS = {
  users: ENDPOINTS.users,
  tenants: ENDPOINTS.tenants,
  projects: ENDPOINTS.projects,
  plots: ENDPOINTS.plots,
  customers: ENDPOINTS.customers,
  bookings: ENDPOINTS.bookings,
  payments: ENDPOINTS.payments,
  receipts: ENDPOINTS.receipts,
  invoices: ENDPOINTS.invoices,
  ledger: ENDPOINTS.ledger,
  agents: ENDPOINTS.agents,
  commissions: ENDPOINTS.commissions,
  documents: ENDPOINTS.documents,
  notifications: ENDPOINTS.notifications,
  auditLogs: ENDPOINTS.auditLogs,
  securityEvents: ENDPOINTS.securityEvents,
};

function buildResource(paths) {
  const resource = {
    /** GET the collection with optional `{ page, page_size, search, sort, ...filters }`. */
    list: (params) => authedRequest(paths.list, { params }),
  };
  if (paths.item) {
    resource.get = (id) => authedRequest(paths.item(id));
    resource.create = (body) => authedRequest(paths.list, { method: 'POST', body });
    resource.update = (id, body) => authedRequest(paths.item(id), { method: 'PATCH', body });
    resource.remove = (id) => authedRequest(paths.item(id), { method: 'DELETE' });
  }
  return resource;
}

export const api = Object.fromEntries(
  Object.entries(COLLECTION_PATHS).map(([name, paths]) => [name, buildResource(paths)]),
);

/** Non-CRUD actions, grouped by the feature that owns them. */
export const actions = {
  login: (body) => request(ENDPOINTS.auth.login, { method: 'POST', body, auth: false }),
  logout: (body) => authedRequest(ENDPOINTS.auth.logout, { method: 'POST', body }),
  me: () => authedRequest(ENDPOINTS.auth.me),
  register: (body) => request(ENDPOINTS.auth.register, { method: 'POST', body, auth: false }),
  changePassword: (body) => authedRequest(ENDPOINTS.auth.changePassword, { method: 'POST', body }),
  approveBooking: (id, body) => authedRequest(ENDPOINTS.bookings.approve(id), { method: 'POST', body }),
  rejectBooking: (id, body) => authedRequest(ENDPOINTS.bookings.reject(id), { method: 'POST', body }),
  decideCustomer: (id, body) => authedRequest(ENDPOINTS.customers.decision(id), { method: 'POST', body }),
  receiptCopy: (id) => authedRequest(ENDPOINTS.receipts.copy(id)),
  issueInvoice: (id, body) => authedRequest(ENDPOINTS.invoices.issue(id), { method: 'POST', body: body || {} }),
  cancelInvoice: (id, body) => authedRequest(ENDPOINTS.invoices.cancel(id), { method: 'POST', body }),
  payInvoice: (id, body) => authedRequest(ENDPOINTS.invoices.payments(id), { method: 'POST', body }),
  shareInvoice: (id) => authedRequest(ENDPOINTS.invoices.share(id), { method: 'POST', body: {} }),
  invoiceSummary: () => authedRequest(ENDPOINTS.invoices.summary),
  invoicePdf: (id) => requestBlob(ENDPOINTS.invoices.pdf(id)),
  ledgerSummary: () => authedRequest(ENDPOINTS.ledger.summary),
  approvalQueue: () => authedRequest(ENDPOINTS.bookings.approvals),
  dailyReport: (params) => authedRequest(ENDPOINTS.reports.daily, { params }),
  auditTrail: (params) => authedRequest(ENDPOINTS.reports.auditTrail, { params }),
  suspendTenant: (id, body) => authedRequest(ENDPOINTS.tenants.suspend(id), { method: 'POST', body }),
  activateTenant: (id) => authedRequest(ENDPOINTS.tenants.activate(id), { method: 'POST', body: {} }),
  addTenantAdmin: (id, body) => authedRequest(ENDPOINTS.tenants.admins(id), { method: 'POST', body }),
  resetTenantAdminPassword: (id, userId) => authedRequest(ENDPOINTS.tenants.resetPassword(id, userId), { method: 'POST', body: {} }),
  acknowledgeEvent: (id, body) => authedRequest(ENDPOINTS.securityEvents.acknowledge(id), { method: 'POST', body }),
};

/** Per-agent sales totals (deals, gross sales, collected) for the Agents page. */
actions.agentLeaderboard = () => authedRequest(`${ENDPOINTS.agents.list}/leaderboard`);

/** The caller's own notification queue (the server scopes it by role / person). */
actions.notificationQueue = () => authedRequest(ENDPOINTS.notifications.list);
actions.notificationAction = (id) => authedRequest(`${ENDPOINTS.notifications.item(id)}/action`, { method: 'POST', body: {} });

actions.commissionDecision = (id, body) => authedRequest(`${ENDPOINTS.commissions.item(id)}/decision`, { method: 'POST', body });

actions.shareReceipt = (id) => authedRequest(`${ENDPOINTS.receipts.item(id)}/share`, { method: 'POST', body: {} });

/** Password reset (no session needed). */
actions.forgotPassword = (email) => request('/auth/password/forgot', { method: 'POST', body: { email }, auth: false });
actions.resetPassword = (token, newPassword) => request('/auth/password/reset', { method: 'POST', body: { token, new_password: newPassword }, auth: false });

/** Organisation settings (company / bank / tax) shared by every user of the organisation. */
actions.orgSettings = () => authedRequest('/organisation/settings');
actions.saveOrgSettings = (section, values) => authedRequest(`/organisation/settings/${section}`, { method: 'PUT', body: { values } });

actions.setRegistryStage = (bookingId, body) => authedRequest(`${ENDPOINTS.bookings.item(bookingId)}/registry`, { method: 'POST', body });

actions.setDueDate = (bookingNumber, dueDate) => authedRequest(`/ledger/${encodeURIComponent(bookingNumber)}/due-date`, { method: 'POST', body: { due_date: dueDate } });
