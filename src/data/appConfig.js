/**
 * Static application configuration — role presentation (colour, title, navigation) and the
 * registration milestones. There is no sample business data anywhere in the front end: every
 * project, plot, customer, booking and person shown comes from the signed-in organisation's API.
 */

/** The signed-in organisation's letterhead, kept in step with its saved settings (see utils/settings). */
export const COMPANY = { name: '', address: '', gstin: '', phone: '', email: '' };

export const REGISTRY_STEPS = ['Not started', 'Documents pending', 'Agreement signed', 'Sub-registrar appointment', 'Registered'];

export const roleConfigs = {
  'SUPER ADMIN': {
    badge: 'PLATFORM ADMIN',
    color: '#7b39ed',
    bg: '#f3e8ff',
    title: 'Platform Console',
    subtitle: 'Organisations (tenants), their administrators, plans and access — never their business data.',
    permissions: ['TENANT_VIEW', 'TENANT_MANAGE', 'PLATFORM_AUDIT'],
    workspaceNav: ['Overview', 'Tenants'],
    insightsNav: []
  },
  'ADMIN': {
    badge: 'ADMIN',
    color: '#4f5fce',
    bg: '#eef0ff',
    title: 'Operations Command Center',
    subtitle: 'Overall project portfolio, customer bookings, collection reconciliations and operations.',
    permissions: ['PROJECTS_CRUD', 'BOOKINGS_CRUD', 'PAYMENTS_CRUD', 'AGENTS_CRUD', 'REPORTS_VIEW', 'USER_MANAGEMENT'],
    workspaceNav: ['Overview', 'Approvals', 'Projects & plots', 'Bookings', 'Payments', 'Billing', 'Customers', 'Agents', 'Commissions', 'Expenses'],
    insightsNav: ['Reports', 'Documents', 'Notifications', 'User & role management', 'Administration']
  },
  'SALES MANAGER': {
    badge: 'SALES MANAGER',
    color: '#0891b2',
    bg: '#e0f2fe',
    title: 'Sales Team Pipeline & Collections',
    subtitle: 'Real-time sales velocity, agent league tables, commission sign-offs and team conversions.',
    permissions: ['VIEW_ALL_LEADS', 'APPROVE_HOLDS', 'APPROVE_COMMISSIONS', 'ASSIGN_AGENTS', 'SALES_ANALYTICS'],
    workspaceNav: ['Overview', 'Projects & plots', 'Bookings', 'Customers', 'Agents', 'Commissions'],
    insightsNav: ['Reports', 'Documents', 'Notifications', 'Billing']
  },
  'SALES AGENT': {
    badge: 'SALES AGENT',
    color: '#16a34a',
    bg: '#dcfce7',
    title: 'My Sales Desk & Deal Pipeline',
    subtitle: 'Track your assigned plots, customer visits, deal closures, and commission statements.',
    permissions: ['VIEW_INVENTORY', 'CREATE_BOOKING', 'MY_CUSTOMERS_ONLY', 'MY_COMMISSIONS_ONLY', 'VIEW_BROCHURES'],
    workspaceNav: ['Overview', 'Projects & plots', 'Bookings', 'Customers', 'Commissions'],
    insightsNav: ['Documents', 'Notifications']
  },
  'ACCOUNTS': {
    badge: 'ACCOUNTS',
    color: '#ea580c',
    bg: '#ffedd5',
    title: 'Financial Ledger, Collections & Dues',
    subtitle: 'Payment receipts, installment reconciliation, aging debtor analysis, and commission payouts.',
    permissions: ['RECORD_PAYMENTS', 'MANAGE_LEDGER', 'RECONCILE_ACCOUNTS', 'DISBURSE_COMMISSIONS', 'FINANCIAL_REPORTS'],
    workspaceNav: ['Overview', 'Payments', 'Billing', 'Bookings', 'Customers', 'Commissions', 'Expenses'],
    insightsNav: ['Reports', 'Documents', 'Notifications']
  },
  'CUSTOMER': {
    badge: 'CUSTOMER',
    color: '#0d9488',
    bg: '#ccfbf1',
    title: 'My Plots, Payments & Documents',
    subtitle: 'View your plots, registry status, payments, pending dues, bills and documents. View-only access.',
    permissions: ['VIEW_MY_PLOTS', 'VIEW_MY_PAYMENTS', 'VIEW_MY_BILLS', 'VIEW_MY_DOCUMENTS'],
    workspaceNav: ['Overview', 'Payments', 'Billing', 'Documents'],
    insightsNav: []
  }
};
