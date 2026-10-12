/** Canonical role vocabulary (mirrors backend `app/core/constants.py::Role`). */

export const ROLES = {
  SUPER_ADMIN: 'SUPER ADMIN',
  ADMIN: 'ADMIN',
  SALES_MANAGER: 'SALES MANAGER',
  SALES_AGENT: 'SALES AGENT',
  ACCOUNTS: 'ACCOUNTS',
  CUSTOMER: 'CUSTOMER',
};

/** Display order used by every role selector / role card grid. */
export const ROLE_ORDER = [
  ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SALES_MANAGER,
  ROLES.SALES_AGENT, ROLES.ACCOUNTS, ROLES.CUSTOMER,
];

/** Roles allowed to approve agent-entered bookings/customers. */
export const APPROVER_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN];

/**
 * Backend roles arrive as `SALES_MANAGER`; the UI vocabulary is `SALES MANAGER`.
 * An empty value stays empty (= signed out) — it must never default to a real role.
 * Unknown values are passed through upper-cased so they are visible, not hidden.
 */
export const toUiRole = (apiRole) => String(apiRole || '').trim().replace(/[_\s]+/g, ' ').toUpperCase();
