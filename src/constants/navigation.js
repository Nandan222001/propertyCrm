/** Route table, headings and icon map — one definition for sidebar + routes. */
import {
  LayoutDashboard, Map, ClipboardList, Wallet, Users, Handshake, Percent,
  ChartNoAxesCombined, FolderOpen, Bell, Settings, Shield, FileText, ReceiptIndianRupee, Building2, Banknote, MapPinned, UsersRound, IndianRupee, ShoppingCart,
} from 'lucide-react';

const PAGE = {
  OVERVIEW: 'Overview',
  APPROVALS: 'Approvals',
  PROJECTS: 'Projects & plots',
  BOOKINGS: 'Bookings',
  PAYMENTS: 'Payments',
  BILLING: 'Billing',
  CUSTOMERS: 'Customers',
  CUSTOMER_DETAIL: 'Customer detail',
  AGENTS: 'Agents',
  COMMISSIONS: 'Commissions',
  MY_TEAM: 'My Team',
  INCOME: 'Income',
  DIRECT_SALE: 'Direct Sale',
  TEAM_SALE: 'Team Sale',
  SALE_PAYMENTS: 'Sale Payments',
  EXPENSES: 'Expenses',
  PLOT_MAP: 'Plot map',
  REPORTS: 'Reports',
  DOCUMENTS: 'Documents',
  NOTIFICATIONS: 'Notifications',
  TENANTS: 'Tenants',
  USERS: 'User & role management',
  ADMIN: 'Administration',
};

export const PAGES = PAGE;

/** Page name -> URL path (the router keys off this single table). */
export const PATH_FOR = {
  [PAGE.OVERVIEW]: '/',
  [PAGE.APPROVALS]: '/approvals',
  [PAGE.PROJECTS]: '/projects-plots',
  [PAGE.BOOKINGS]: '/bookings',
  [PAGE.PAYMENTS]: '/payments',
  [PAGE.BILLING]: '/billing',
  [PAGE.CUSTOMERS]: '/customers',
  [PAGE.CUSTOMER_DETAIL]: '/customers/detail',
  [PAGE.AGENTS]: '/agents',
  [PAGE.COMMISSIONS]: '/commissions',
  [PAGE.MY_TEAM]: '/my-team',
  [PAGE.INCOME]: '/income',
  [PAGE.DIRECT_SALE]: '/sales/direct',
  [PAGE.TEAM_SALE]: '/sales/team',
  [PAGE.SALE_PAYMENTS]: '/sales/payments',
  [PAGE.EXPENSES]: '/expenses',
  [PAGE.PLOT_MAP]: '/plot-map',
  [PAGE.REPORTS]: '/reports',
  [PAGE.DOCUMENTS]: '/documents',
  [PAGE.NOTIFICATIONS]: '/notifications',
  [PAGE.TENANTS]: '/tenants',
  [PAGE.USERS]: '/user-roles',
  [PAGE.ADMIN]: '/administration',
};

export const PAGE_FOR_PATH = Object.fromEntries(
  Object.entries(PATH_FOR).map(([page, path]) => [path, page]),
);

export const PAGE_ICON = {
  [PAGE.OVERVIEW]: LayoutDashboard,
  [PAGE.APPROVALS]: Shield,
  [PAGE.PROJECTS]: Map,
  [PAGE.BOOKINGS]: ClipboardList,
  [PAGE.PAYMENTS]: Wallet,
  [PAGE.BILLING]: ReceiptIndianRupee,
  [PAGE.CUSTOMERS]: Users,
  [PAGE.AGENTS]: Handshake,
  [PAGE.COMMISSIONS]: Percent,
  [PAGE.MY_TEAM]: UsersRound,
  [PAGE.INCOME]: IndianRupee,
  [PAGE.DIRECT_SALE]: ShoppingCart,
  [PAGE.TEAM_SALE]: UsersRound,
  [PAGE.SALE_PAYMENTS]: Wallet,
  [PAGE.EXPENSES]: Banknote,
  [PAGE.PLOT_MAP]: MapPinned,
  [PAGE.REPORTS]: ChartNoAxesCombined,
  [PAGE.DOCUMENTS]: FolderOpen,
  [PAGE.NOTIFICATIONS]: Bell,
  [PAGE.TENANTS]: Building2,
  [PAGE.USERS]: Shield,
  [PAGE.ADMIN]: Settings,
  [PAGE.CUSTOMER_DETAIL]: FileText,
};

export const PAGE_META = {
  [PAGE.APPROVALS]: ['Admin Approvals', 'Bookings and customers entered by agents are confirmed here.'],
  [PAGE.PROJECTS]: ['Project & Plot Inventory', 'Master portfolio, layout availability, plot dimensions and customer allocations.'],
  [PAGE.BOOKINGS]: ['Sales Booking Operations', 'Auditable transaction lifecycle from token advance to registered conveyance.'],
  [PAGE.PAYMENTS]: ['Collections, Dues & Treasury', 'Every rupee booked, collected and pending — daily banking reconciliations.'],
  [PAGE.BILLING]: ['Tax Invoices & Billing Desk', 'Raise GST bills with line items, issue, collect, and share print-ready PDF invoices.'],
  [PAGE.CUSTOMERS]: ['Customer Master Directory', 'Comprehensive client files, plot allocations, milestone payments, and documents.'],
  [PAGE.AGENTS]: ['Sales Force & Agency Roster', 'Agent productivity, active bookings, commission tiering, and performance metrics.'],
  [PAGE.COMMISSIONS]: ['Agent Commissions & Payouts', 'Eligibility rules, manager approvals, TDS tax compliance, and bank disbursements.'],
  [PAGE.MY_TEAM]: ['My Team', 'The agents under you — their level, sales and the commission slice each member holds.'],
  [PAGE.INCOME]: ['Income', 'Your commission month by month — earned, admin charge, TDS and payable — with the payment-wise details.'],
  [PAGE.DIRECT_SALE]: ['Direct Sales', 'The plots you sold yourself — status, price, what the customer has paid and what is left.'],
  [PAGE.TEAM_SALE]: ['Team Sales', 'The plots sold by the agents under you, with the selling agent against each sale.'],
  [PAGE.SALE_PAYMENTS]: ['Sale Payments', 'Every payment received on your own and your team\'s sales, with its receipt.'],
  [PAGE.EXPENSES]: ['Expenses & Company Profit', 'Record what the company spends. Profit = money collected, minus agent commission, minus expenses.'],
  [PAGE.PLOT_MAP]: ['Plot Map', 'Green plots are available; red plots are booked.'],
  [PAGE.REPORTS]: ['Reports & Business Intelligence', 'Real-time financial, operational, sales funnel and portfolio BI.'],
  [PAGE.DOCUMENTS]: ['Document Vault & Contracts', 'Booking forms, allotment letters, agreement copies, and tax invoices.'],
  [PAGE.NOTIFICATIONS]: ['Operational Follow-ups & Alerts', 'Payment overdue warnings, customer reminders, and system notifications.'],
  [PAGE.TENANTS]: ['Tenant Management', 'Create organisations, assign their administrators, manage plans and seat limits, suspend or reactivate access.'],
  [PAGE.USERS]: ['Identity & Role-Based Access (RBAC)', 'Assign permissions, manage workspaces, and invite team members.'],
  [PAGE.ADMIN]: ['System Configuration & Master Rules', 'Tax rules, plot layout schemas, banking preferences, and company profiles.'],
};

/**
 * Sidebar counters per role. Every number is computed from the tenant's own rows
 * (`{pending}`, `{overduePayments}`, …) — a counter is shown only when it can be
 * derived, so a brand-new organisation never sees invented figures.
 */
export const NAV_BADGES = {
  ACCOUNTS: {
    Payments: { text: '{overduePayments}', alert: true },
    Billing: { text: '{overdueInvoices}', alert: true },
  },
  'SUPER ADMIN': {
    Tenants: { text: '{tenants}' },
  },
  ADMIN: {
    Approvals: { text: '{pending}', alert: true },
    Payments: { text: '{overduePayments}', alert: true },
  },
};
