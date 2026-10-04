/**
 * Declarative REST client: one entry per backend resource, so no component ever
 * hand-writes a URL. `list/get/create/update/remove` are generated from the
 * endpoint table in `constants/api.js` (DRY across a dozen collections).
 */
import { ENDPOINTS } from '../constants/api';
import { authedRequest, request } from './client';

const COLLECTION_PATHS = {
  users: ENDPOINTS.users,
  projects: ENDPOINTS.projects,
  plots: ENDPOINTS.plots,
  customers: ENDPOINTS.customers,
  bookings: ENDPOINTS.bookings,
  payments: ENDPOINTS.payments,
  receipts: ENDPOINTS.receipts,
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
  ledgerSummary: () => authedRequest(ENDPOINTS.ledger.summary),
  approvalQueue: () => authedRequest(ENDPOINTS.bookings.approvals),
  dailyReport: (params) => authedRequest(ENDPOINTS.reports.daily, { params }),
  auditTrail: (params) => authedRequest(ENDPOINTS.reports.auditTrail, { params }),
  acknowledgeEvent: (id, body) => authedRequest(ENDPOINTS.securityEvents.acknowledge(id), { method: 'POST', body }),
};
