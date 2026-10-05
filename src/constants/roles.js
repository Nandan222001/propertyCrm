/** Canonical role vocabulary (mirrors backend `app/core/constants.py::Role`). */

export const ROLES = {
  SUPER_ADMIN: 'SUPER ADMIN',
  ADMIN: 'ADMIN',
  SALES_MANAGER: 'SALES MANAGER',
  SALES_AGENT: 'SALES AGENT',
  ACCOUNTS: 'ACCOUNTS',
  MANAGEMENT: 'MANAGEMENT',
  CUSTOMER: 'CUSTOMER',
};

/** Display order used by every role selector / role card grid. */
export const ROLE_ORDER = [
  ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SALES_MANAGER,
  ROLES.SALES_AGENT, ROLES.ACCOUNTS, ROLES.MANAGEMENT, ROLES.CUSTOMER,
];

/** Roles allowed to approve agent-entered bookings/customers. */
export const APPROVER_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN];

/** Only a super-admin session may preview other role workspaces. */
export const PREVIEW_ROLES = [ROLES.SUPER_ADMIN];
