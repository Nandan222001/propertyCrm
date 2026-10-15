/**
 * API surface configuration. Every request the UI makes is described here, so a
 * path or method change is a one-line edit (no string literals in components).
 */

const trim = (value) => String(value || '').replace(/\/+$/, '');

/** Base URL: same-origin `/api/v1` through the dev proxy or gateway in prod. */
export const API_BASE_URL = trim(import.meta.env.VITE_API_BASE_URL || '') || '/api/v1';

export const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 8000);

export const STORAGE_KEYS = {
  session: 'session',
  role: 'role',
  currentUser: 'current_user',
  users: 'users',
  collections: 'collections',
  followUps: 'follow_ups',
  crud: 'crud',
  clientAudit: 'client_audit',
};

/** Resource name -> REST path. `resources.js` turns this into a typed client. */
export const ENDPOINTS = {
  auth: { login: '/auth/login', refresh: '/auth/refresh', logout: '/auth/logout', me: '/auth/me', changePassword: '/auth/password/change', confirmPassword: '/auth/password/confirm' },
  users: { list: '/users', item: (id) => `/users/${id}` },
  projects: { list: '/projects', item: (id) => `/projects/${id}` },
  plots: { list: '/plots', item: (id) => `/plots/${id}` },
  customers: { list: '/customers', item: (id) => `/customers/${id}`, decision: (id) => `/customers/${id}/decision` },
  bookings: { list: '/bookings', item: (id) => `/bookings/${id}`, approve: (id) => `/bookings/${id}/approve`, reject: (id) => `/bookings/${id}/reject`, approvals: '/bookings/approvals' },
  payments: { list: '/payments', item: (id) => `/payments/${id}` },
  receipts: { list: '/receipts', item: (id) => `/receipts/${id}`, copy: (id) => `/receipts/${id}/copy` },
  invoices: {
    list: '/invoices',
    item: (id) => `/invoices/${id}`,
    issue: (id) => `/invoices/${id}/issue`,
    cancel: (id) => `/invoices/${id}/cancel`,
    payments: (id) => `/invoices/${id}/payments`,
    share: (id) => `/invoices/${id}/share`,
    pdf: (id) => `/invoices/${id}/pdf`,
    summary: '/invoices/summary',
    sweep: '/invoices/overdue-sweep',
  },
  ledger: { list: '/ledger', summary: '/ledger/summary' },
  agents: { list: '/agents', item: (id) => `/agents/${id}` },
  commissions: { list: '/commissions', item: (id) => `/commissions/${id}` },
  expenses: { list: '/expenses', item: (id) => `/expenses/${id}`, summary: '/expenses/profit-summary' },
  documents: { list: '/documents', item: (id) => `/documents/${id}` },
  notifications: { list: '/notifications', item: (id) => `/notifications/${id}` },
  reports: { daily: '/reports/daily', auditTrail: '/reports/audit-trail' },
  auditLogs: { list: '/audit-logs' },
  securityEvents: { list: '/security-events', acknowledge: (id) => `/security-events/${id}/acknowledge` },
  tenants: {
    list: '/tenants',
    item: (id) => `/tenants/${id}`,
    suspend: (id) => `/tenants/${id}/suspend`,
    activate: (id) => `/tenants/${id}/activate`,
    admins: (id) => `/tenants/${id}/admins`,
    resetPassword: (id, userId) => `/tenants/${id}/admins/${userId}/reset-password`,
  },
  platform: { overview: '/platform/overview' },
  health: { live: '/health', ready: '/ready' },
};
