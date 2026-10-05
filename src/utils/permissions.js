/**
 * Client-side permission mirror of the backend RBAC matrix
 * (`backend/app/core/constants.py` -> ROLE_PERMISSIONS).
 *
 * The UI uses these only to hide controls it cannot legally use; the API
 * re-checks every request, so a spoofed role can never widen access.
 */
import { ROLES } from '../constants/roles';

const ADMINS = [ROLES.ADMIN, ROLES.SUPER_ADMIN];

export const isAdmin = (role) => ADMINS.includes(role);
export const isCustomer = (role) => role === ROLES.CUSTOMER;
export const canCreateBooking = (role) => isAdmin(role) || role === ROLES.SALES_AGENT;
export const canApprove = (role) => isAdmin(role);
export const canCreateCustomer = (role) => role === ROLES.SALES_AGENT;
export const canRecordPayment = (role) => isAdmin(role) || role === ROLES.ACCOUNTS;
export const canManageBills = (role) => isAdmin(role) || role === ROLES.ACCOUNTS;
export const canManageUsers = (role) => isAdmin(role);

/** Permission strings the backend enforces, exposed for feature-level gating. */
export const PERMISSIONS = {
  BOOKING_CREATE: 'booking:create',
  BOOKING_APPROVE: 'booking:approve',
  PAYMENT_CREATE: 'payment:create',
  CUSTOMER_CREATE: 'customer:create',
  USER_MANAGE: 'user:manage',
  AUDIT_VIEW: 'audit:view',
};

const ROLE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: ['*'],
  [ROLES.ADMIN]: Object.values(PERMISSIONS),
  [ROLES.SALES_MANAGER]: [PERMISSIONS.BOOKING_CREATE, PERMISSIONS.BOOKING_APPROVE, PERMISSIONS.CUSTOMER_CREATE],
  [ROLES.SALES_AGENT]: [PERMISSIONS.BOOKING_CREATE, PERMISSIONS.CUSTOMER_CREATE],
  [ROLES.ACCOUNTS]: [PERMISSIONS.PAYMENT_CREATE],
  [ROLES.MANAGEMENT]: [],
  [ROLES.CUSTOMER]: [],
};

/** True when the role holds `permission` (super admin holds every permission). */
export function hasPermission(role, permission) {
  const granted = ROLE_PERMISSIONS[role] || [];
  return granted.includes('*') || granted.includes(permission);
}
