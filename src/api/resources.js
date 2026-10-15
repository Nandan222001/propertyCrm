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
  expenses: ENDPOINTS.expenses,
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
    resource.remove = (id, body) => authedRequest(paths.item(id), body ? { method: 'DELETE', body } : { method: 'DELETE' });
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
  confirmPassword: (password) => authedRequest(ENDPOINTS.auth.confirmPassword, { method: 'POST', body: { password } }),
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
  profitSummary: () => authedRequest(ENDPOINTS.expenses.summary),
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

/** The expenses API edits with PUT (full record), not PATCH. */
api.expenses.update = (id, body) => authedRequest(ENDPOINTS.expenses.item(id), { method: 'PUT', body });

api.plots.createBulk = (body) => authedRequest(`${ENDPOINTS.plots.list}/bulk`, { method: 'POST', body });

api.agents.provisionLogin = (id) => authedRequest(`${ENDPOINTS.agents.item(id)}/login`, { method: 'POST', body: {} });

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

/** Deployment name for the sign-in page (public). */
actions.branding = () => request('/branding', { auth: false });

/** Payment schemes (per project), quotes and a booking's payment schedule. */
actions.projectPlans = (projectId) => authedRequest(`${ENDPOINTS.projects.item(projectId)}/plans`);
actions.createPlan = (projectId, body) => authedRequest(`${ENDPOINTS.projects.item(projectId)}/plans`, { method: 'POST', body });
actions.updatePlan = (id, body) => authedRequest(`/plans/${id}`, { method: 'PATCH', body });
actions.deletePlan = (id) => authedRequest(`/plans/${id}`, { method: 'DELETE' });
actions.quotePlan = (body) => authedRequest('/plans/quote', { method: 'POST', body });
actions.bookingSchedule = (bookingId) => authedRequest(`${ENDPOINTS.bookings.item(bookingId)}/installments`);

actions.roleMatrix = () => authedRequest('/roles/matrix');

actions.resetUserPassword = (id) => authedRequest(`${ENDPOINTS.users.item(id)}/reset-password`, { method: 'POST', body: {} });

actions.setRegistryStage = (bookingId, body) => authedRequest(`${ENDPOINTS.bookings.item(bookingId)}/registry`, { method: 'POST', body });

actions.setDueDate = (bookingNumber, dueDate) => authedRequest(`/ledger/${encodeURIComponent(bookingNumber)}/due-date`, { method: 'POST', body: { due_date: dueDate } });
