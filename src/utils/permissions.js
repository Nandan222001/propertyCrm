/**
 * Client-side permission mirror of the backend RBAC matrix
 * (`backend/app/core/constants.py` -> ROLE_PERMISSIONS).
 *
 * The UI uses these only to hide controls it cannot legally use; the API
 * re-checks every request, so a spoofed role can never widen access.
 */
import { ROLES } from '../constants/roles';

/** Organisation-level administrators. The platform owner (SUPER ADMIN) is deliberately NOT one. */
const ADMINS = [ROLES.ADMIN];

export const isAdmin = (role) => ADMINS.includes(role);
export const isPlatformAdmin = (role) => role === ROLES.SUPER_ADMIN;
export const isCustomer = (role) => role === ROLES.CUSTOMER;
export const canCreateBooking = (role) => isAdmin(role) || role === ROLES.SALES_AGENT;
export const canApprove = (role) => isAdmin(role);
export const canCreateCustomer = (role) => isAdmin(role) || role === ROLES.SALES_AGENT;
/** Edit / remove from the Actions column. The server enforces the same rules (and scopes an agent to their own rows). */
export const canEditCustomer = (role) => isAdmin(role) || role === ROLES.SALES_AGENT || role === ROLES.SALES_MANAGER;
export const canDeleteCustomer = (role, customer) => isAdmin(role) || (role === ROLES.SALES_AGENT && customer?.status !== 'Approved');
export const canEditBooking = (role, booking) => isAdmin(role) || ([ROLES.SALES_AGENT].includes(role) && booking?.[7] === 'Pending Approval');
/** Only an administrator may delete a booking (and must re-enter their password). */
export const canDeleteBooking = (role) => isAdmin(role);
export const canRecordPayment = (role) => isAdmin(role) || role === ROLES.ACCOUNTS;
/** Expenses and the company-profit figure: the administrator and the accounts desk only. */
export const canManageExpenses = (role) => isAdmin(role) || role === ROLES.ACCOUNTS;
export const canManageBills = (role) => isAdmin(role) || role === ROLES.ACCOUNTS;
export const canManageUsers = (role) => isAdmin(role);
/** Billing desk: raise, edit, issue and cancel tax invoices. */
export const canCreateInvoice = (role) => isAdmin(role) || role === ROLES.ACCOUNTS;
export const canEditInvoice = canCreateInvoice;
export const canIssueInvoice = canCreateInvoice;
export const canCancelInvoice = canCreateInvoice;
export const canPayInvoice = (role) => isAdmin(role) || role === ROLES.ACCOUNTS;
/** Everyone who can open the Billing page can read the book / download PDFs. */
export const canViewBilling = (role) => isAdmin(role)
  || [ROLES.ACCOUNTS, ROLES.SALES_MANAGER, ROLES.CUSTOMER].includes(role);

/** Permission strings the backend enforces, exposed for feature-level gating. */
export const PERMISSIONS = {
  BOOKING_CREATE: 'booking:create',
  BOOKING_APPROVE: 'booking:approve',
  PAYMENT_CREATE: 'payment:create',
  CUSTOMER_CREATE: 'customer:create',
  USER_MANAGE: 'user:manage',
  AUDIT_VIEW: 'audit:view',
  INVOICE_CREATE: 'invoice:create',
  INVOICE_UPDATE: 'invoice:update',
  INVOICE_ISSUE: 'invoice:issue',
  INVOICE_CANCEL: 'invoice:cancel',
  INVOICE_VIEW_ALL: 'invoice:view_all',
  INVOICE_VIEW_OWN: 'invoice:view_own',
};

const ROLE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: ['*'],
  [ROLES.ADMIN]: Object.values(PERMISSIONS),
  [ROLES.SALES_MANAGER]: [PERMISSIONS.BOOKING_CREATE, PERMISSIONS.BOOKING_APPROVE, PERMISSIONS.CUSTOMER_CREATE, PERMISSIONS.INVOICE_VIEW_ALL],
  [ROLES.SALES_AGENT]: [PERMISSIONS.BOOKING_CREATE, PERMISSIONS.CUSTOMER_CREATE],
  [ROLES.ACCOUNTS]: [PERMISSIONS.PAYMENT_CREATE, PERMISSIONS.INVOICE_CREATE, PERMISSIONS.INVOICE_UPDATE, PERMISSIONS.INVOICE_ISSUE, PERMISSIONS.INVOICE_CANCEL, PERMISSIONS.INVOICE_VIEW_ALL],
  [ROLES.CUSTOMER]: [PERMISSIONS.INVOICE_VIEW_OWN],
};

/** True when the role holds `permission` (super admin holds every permission). */
export function hasPermission(role, permission) {
  const granted = ROLE_PERMISSIONS[role] || [];
  return granted.includes('*') || granted.includes(permission);
}
