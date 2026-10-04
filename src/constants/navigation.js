/** Route table, headings and icon map — one definition for sidebar + routes. */
import {
  LayoutDashboard, Map, ClipboardList, Wallet, Users, Handshake, Percent,
  ChartNoAxesCombined, FolderOpen, Bell, Settings, Shield, FileText,
} from 'lucide-react';

const PAGE = {
  OVERVIEW: 'Overview',
  APPROVALS: 'Approvals',
  PROJECTS: 'Projects & plots',
  BOOKINGS: 'Bookings',
  PAYMENTS: 'Payments',
  CUSTOMERS: 'Customers',
  CUSTOMER_DETAIL: 'Customer detail',
  AGENTS: 'Agents',
  COMMISSIONS: 'Commissions',
  REPORTS: 'Reports',
  DOCUMENTS: 'Documents',
  NOTIFICATIONS: 'Notifications',
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
  [PAGE.CUSTOMERS]: '/customers',
  [PAGE.CUSTOMER_DETAIL]: '/customers/detail',
  [PAGE.AGENTS]: '/agents',
  [PAGE.COMMISSIONS]: '/commissions',
  [PAGE.REPORTS]: '/reports',
  [PAGE.DOCUMENTS]: '/documents',
  [PAGE.NOTIFICATIONS]: '/notifications',
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
  [PAGE.CUSTOMERS]: Users,
  [PAGE.AGENTS]: Handshake,
  [PAGE.COMMISSIONS]: Percent,
  [PAGE.REPORTS]: ChartNoAxesCombined,
  [PAGE.DOCUMENTS]: FolderOpen,
  [PAGE.NOTIFICATIONS]: Bell,
  [PAGE.USERS]: Shield,
  [PAGE.ADMIN]: Settings,
  [PAGE.CUSTOMER_DETAIL]: FileText,
};

export const PAGE_META = {
  [PAGE.APPROVALS]: ['Admin Approvals', 'Bookings and customers entered by agents are confirmed here.'],
  [PAGE.PROJECTS]: ['Project & Plot Inventory', 'Master portfolio, layout availability, plot dimensions and customer allocations.'],
  [PAGE.BOOKINGS]: ['Sales Booking Operations', 'Auditable transaction lifecycle from token advance to registered conveyance.'],
  [PAGE.PAYMENTS]: ['Collections, Dues & Treasury', 'Every rupee booked, collected and pending — daily banking reconciliations.'],
  [PAGE.CUSTOMERS]: ['Customer Master Directory', 'Comprehensive client files, plot allocations, milestone payments, and documents.'],
  [PAGE.AGENTS]: ['Sales Force & Agency Roster', 'Agent productivity, active bookings, commission tiering, and performance metrics.'],
  [PAGE.COMMISSIONS]: ['Agent Commissions & Payouts', 'Eligibility rules, manager approvals, TDS tax compliance, and bank disbursements.'],
  [PAGE.REPORTS]: ['Reports & Business Intelligence', 'Real-time financial, operational, sales funnel and portfolio BI.'],
  [PAGE.DOCUMENTS]: ['Document Vault & Contracts', 'Booking forms, allotment letters, agreement copies, and tax invoices.'],
  [PAGE.NOTIFICATIONS]: ['Operational Follow-ups & Alerts', 'Payment overdue warnings, customer reminders, and system notifications.'],
  [PAGE.USERS]: ['Identity & Role-Based Access (RBAC)', 'Assign permissions, manage workspaces, and invite team members.'],
  [PAGE.ADMIN]: ['System Configuration & Master Rules', 'Tax rules, plot layout schemas, banking preferences, and company profiles.'],
};

/**
 * Sidebar counters per role. `{pending}` / `{users}` are filled from live
 * selectors, so the numbers can never drift from the underlying data.
 */
export const NAV_BADGES = {
  'SALES AGENT': { Bookings: { text: '3' }, Notifications: { text: '2' } },
  ACCOUNTS: {
    Payments: { text: '14', alert: true },
    Commissions: { text: '3' },
    Notifications: { text: '6' },
  },
  'SALES MANAGER': {
    Bookings: { text: '6' },
    Commissions: { text: '3 pending' },
    Notifications: { text: '4' },
  },
  'SUPER ADMIN': {
    Approvals: { text: '{pending}', alert: true },
    Notifications: { text: '5' },
    'User & role management': { text: '{users}' },
  },
  ADMIN: {
    Approvals: { text: '{pending}', alert: true },
    Bookings: { text: '6' },
    Payments: { text: '24', alert: true },
    Notifications: { text: '3' },
  },
  MANAGEMENT: { Notifications: { text: '2' } },
};
