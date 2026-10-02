export const projects = [
  ['Green Meadows', 'Phase II · Mumbai', '128', '38', '22', '12.6 Cr'],
  ['Silver Oaks', 'West Zone · Pune', '104', '24', '16', '8.4 Cr'],
  ['Park View', 'North District · Thane', '88', '12', '10', '5.2 Cr'],
  ['River Enclave', 'East Corridor · Mumbai', '64', '8', '6', '3.8 Cr']
];

export const seedBookings = [
  ['BK-2026-0148', 'Rajesh Sharma', 'Green Meadows', 'A-012', '28 Sep 2026', '18,40,000', '14,72,000', 'Confirmed', 'M. Kumar', '12 monthly installments'],
  ['BK-2026-0147', 'Anita Verma', 'Silver Oaks', 'B-104', '27 Sep 2026', '12,60,000', '6,30,000', 'Confirmed', 'S. Patel', '6 monthly installments'],
  ['BK-2026-0146', 'Deepak Iyer', 'Park View', 'C-078', '27 Sep 2026', '25,20,000', '25,20,000', 'Confirmed', 'M. Kumar', 'Paid in full'],
  ['BK-2026-0145', 'Priya Nair', 'Green Meadows', 'A-101', '26 Sep 2026', '9,60,000', '4,80,000', 'Agreement', 'R. Gupta', '12 monthly installments'],
  ['BK-2026-0144', 'Sneha Mehta', 'Green Meadows', 'B-033', '25 Sep 2026', '14,00,000', '8,40,000', 'Confirmed', 'M. Kumar', '12 monthly installments'],
  ['BK-2026-0143', 'Vikram Joshi', 'Silver Oaks', 'C-015', '22 Sep 2026', '24,75,000', '12,37,500', 'Confirmed', 'S. Patel', '12 monthly installments'],
  ['BK-2026-0142', 'Karan Rao', 'Silver Oaks', 'B-110', '20 Sep 2026', '12,60,000', '6,30,000', 'Confirmed', 'R. Gupta', '6 monthly installments'],
  ['BK-2026-0149', 'Meena Kapoor', 'Park View', 'C-044', '29 Sep 2026', '22,50,000', '2,00,000', 'Pending Approval', 'S. Patel', '12 monthly installments']
];

const PLOT_PROJECT = (id) => (id.startsWith('A-') ? 'Green Meadows' : id.startsWith('B-') ? 'Silver Oaks' : 'Park View');

const basePlots = [
  ['A-012', 'Layout A — East', '2,400', 'East', '18,40,000', 'BOOKED', 'Rajesh Sharma', 'M. Kumar', 'Green Meadows'],
  ['B-104', 'Layout B — West', '1,800', 'West', '12,60,000', 'BOOKED', 'Anita Verma', 'S. Patel', 'Silver Oaks'],
  ['C-031', 'Layout C — Park', '3,000', 'North', '24,75,000', 'HOLD', '—', 'S. Patel', 'Park View'],
  ['A-045', 'Layout A — East', '2,400', 'East', '18,40,000', 'AVAILABLE', '—', '—', 'Green Meadows'],
  ['B-022', 'Layout B — West', '2,000', 'South', '14,00,000', 'AVAILABLE', '—', '—', 'Silver Oaks'],
  ['C-078', 'Layout C — Park', '3,000', 'North-East', '25,20,000', 'BOOKED', 'Deepak Iyer', 'M. Kumar', 'Park View'],
  ['A-101', 'Layout A — East', '1,200', 'East', '9,60,000', 'SOLD', 'Priya Nair', 'R. Gupta', 'Green Meadows'],
  ['B-057', 'Layout B — West', '2,400', 'West', '16,80,000', 'HOLD', '—', 'R. Gupta', 'Silver Oaks'],
  ['B-033', 'Layout B — West', '2,000', 'South', '14,00,000', 'BOOKED', 'Sneha Mehta', 'M. Kumar', 'Green Meadows'],
  ['C-015', 'Layout C — Park', '3,000', 'North', '24,75,000', 'BOOKED', 'Vikram Joshi', 'S. Patel', 'Silver Oaks'],
  ['B-110', 'Layout B — West', '1,800', 'West', '12,60,000', 'BOOKED', 'Karan Rao', 'R. Gupta', 'Silver Oaks'],
  ['C-044', 'Layout C — Park', '3,000', 'South-East', '22,50,000', 'HOLD', 'Meena Kapoor', 'S. Patel', 'Park View']
];

export const seedPlots = [
  ...basePlots,
  ...Array.from({ length: 28 }, (_, i) => {
    const no = `A-${String(i + 13).padStart(3, '0')}`;
    return [
      no,
      ['Layout A — East', 'Layout B — West', 'Layout C — Park'][i % 3],
      ['1,800', '2,400', '3,000'][i % 3],
      ['East', 'West', 'North'][i % 3],
      ['16,80,000', '18,40,000', '24,75,000'][i % 3],
      ['AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'SOLD', 'HOLD'][i % 5],
      '—',
      ['M. Kumar', 'S. Patel', 'R. Gupta'][i % 3],
      ['Green Meadows', 'Silver Oaks', 'Park View'][i % 3]
    ];
  })
];

export const seedPays = [
  ['Rajesh Sharma', 'A-012', 'Green Meadows', '18,40,000', '14,72,000', '3,68,000', '12 Oct 2026', 'PARTIALLY PAID', 'M. Kumar'],
  ['Anita Verma', 'B-104', 'Silver Oaks', '12,60,000', '6,30,000', '6,30,000', '12 Oct 2026', 'PARTIALLY PAID', 'S. Patel'],
  ['Deepak Iyer', 'C-078', 'Park View', '25,20,000', '25,20,000', '0', '—', 'PAID', 'M. Kumar'],
  ['Priya Nair', 'A-101', 'Green Meadows', '9,60,000', '4,80,000', '4,80,000', '05 Oct 2026', 'PENDING', 'R. Gupta'],
  ['Sneha Mehta', 'B-033', 'Green Meadows', '14,00,000', '8,40,000', '5,60,000', '18 Sep 2026', 'OVERDUE', 'M. Kumar'],
  ['Vikram Joshi', 'C-015', 'Silver Oaks', '24,75,000', '12,37,500', '12,37,500', '12 Sep 2026', 'OVERDUE', 'S. Patel'],
  ['Karan Rao', 'B-110', 'Silver Oaks', '12,60,000', '6,30,000', '6,30,000', '22 Oct 2026', 'PENDING', 'R. Gupta']
];

export const agents = [
  ['M. Kumar', 'AG-014', '9', '1.12 Cr', '70.4 L', '2.24 L', '92%', '9876510001'],
  ['S. Patel', 'AG-008', '7', '86.0 L', '55.2 L', '1.72 L', '85%', '9876510002'],
  ['R. Gupta', 'AG-021', '4', '52.5 L', '31.5 L', '1.05 L', '74%', '9876510003'],
  ['A. Khan', 'AG-003', '3', '38.4 L', '19.2 L', '0.77 L', '68%', '9876510004'],
  ['N. Bose', 'AG-017', '2', '24.0 L', '12.0 L', '0.48 L', '60%', '9876510005']
];

export const seedUsers = [
  { id: 'USR-001', name: 'Arjun Shah', email: 'admin@nmtsolution.demo', phone: '+91 98765 00001', role: 'ADMIN', status: 'Active', title: 'Operations Director' },
  { id: 'USR-002', name: 'Devendra Singhania', email: 'superadmin@nmtsolution.demo', phone: '+91 98765 00000', role: 'SUPER ADMIN', status: 'Active', title: 'Chief Technology Officer' },
  { id: 'USR-003', name: 'Meera Kumar', email: 'manager@nmtsolution.demo', phone: '+91 98765 00002', role: 'SALES MANAGER', status: 'Active', title: 'VP of Sales & Strategy' },
  { id: 'USR-004', name: 'Sanjay Patel', email: 'agent@nmtsolution.demo', phone: '+91 98765 00003', role: 'SALES AGENT', status: 'Active', title: 'Senior Property Consultant' },
  { id: 'USR-007', name: 'Manoj Kumar', email: 'manoj@nmtsolution.demo', phone: '+91 98765 10001', role: 'SALES AGENT', status: 'Active', title: 'Property Consultant' },
  { id: 'USR-008', name: 'Rohit Gupta', email: 'rohit@nmtsolution.demo', phone: '+91 98765 10003', role: 'SALES AGENT', status: 'Active', title: 'Property Consultant' },
  { id: 'USR-005', name: 'Neha Desai', email: 'accounts@nmtsolution.demo', phone: '+91 98765 00004', role: 'ACCOUNTS', status: 'Active', title: 'Head of Treasury & Billing' },
  { id: 'USR-006', name: 'Vikramaditya Birla', email: 'management@nmtsolution.demo', phone: '+91 98765 00005', role: 'MANAGEMENT', status: 'Active', title: 'Managing Director & Board Member' }
];

export const seedCrud = {
  'Overview': [{ id: 'Overview-1', name: 'Daily business report', reference: 'RPT-2026-0928', category: 'Daily report', amount: '4.2 L', status: 'Ready', notes: 'Sales, collection and operations summary' }],
  'Projects & plots': [
    { id: 'Projects-1', name: 'Green Meadows', reference: 'PRJ-001', category: 'Mumbai · Phase II', amount: '128 plots', status: 'Active', notes: 'Master project record' },
    { id: 'Projects-2', name: 'Silver Oaks', reference: 'PRJ-002', category: 'Pune · West Zone', amount: '104 plots', status: 'Active', notes: 'Master project record' }
  ],
  'Bookings': [{ id: 'Bookings-1', name: 'Rajesh Sharma', reference: 'BK-2026-0148', category: 'Green Meadows · A-012', amount: '18,40,000', status: 'Confirmed', notes: '12 monthly installments' }],
  'Payments': [{ id: 'Payments-1', name: 'Sneha Mehta', reference: 'PAY-0214', category: 'Green Meadows · B-033', amount: '5,60,000', status: 'Overdue', notes: 'Payment follow-up required' }],
  'Customers': [{ id: 'Customers-1', name: 'Rajesh Sharma', reference: 'CUS-0148', category: 'Green Meadows · A-012', amount: '18,40,000', status: 'Active', notes: 'Assigned agent M. Kumar' }],
  'Agents': [{ id: 'Agents-1', name: 'M. Kumar', reference: 'AG-014', category: 'Green Meadows · Silver Oaks', amount: '7.68 L', status: 'Active', notes: '96 assigned plots' }],
  'Commissions': [{ id: 'Commissions-1', name: 'M. Kumar', reference: 'COM-0148', category: 'Green Meadows · A-012', amount: '36,800', status: 'Approved', notes: '2.0% commission' }],
  'Reports': [{ id: 'Reports-1', name: 'Daily business report', reference: 'RPT-2026-0928', category: 'Daily report', amount: '4.2 L', status: 'Ready', notes: 'Illustrative daily report' }],
  'Documents': [{ id: 'Documents-1', name: 'Booking Form', reference: 'DOC-0148', category: 'Rajesh Sharma · A-012', amount: 'PDF', status: 'Filed', notes: 'Customer booking document' }],
  'Notifications': [{ id: 'Notifications-1', name: 'Payment overdue · Sneha Mehta', reference: 'NTF-0024', category: 'Follow-up', amount: '5,60,000', status: 'Open', notes: '10 days overdue' }],
  'User & role management': [{ id: 'User-1', name: 'Arjun Shah', reference: 'USR-001', category: 'Administrator', amount: '—', status: 'Active', notes: 'Full administration access' }],
  'Administration': [{ id: 'Admin-1', name: 'Payment preferences', reference: 'CFG-PAY', category: 'Configuration', amount: '—', status: 'Enabled', notes: 'Receipts and installment rules' }]
};


export const COMPANY = {
  name: 'Lalita Realestate Infra',
  address: 'Head Office, Mumbai, Maharashtra',
  phone: '+91 98765 00001',
  email: 'accounts@nmtsolution.demo'
};

export const seedCustomers = [
  ['Rajesh Sharma', '9876500101', 'customer@nmtsolution.demo', 'Andheri East, Mumbai', 'M. Kumar'],
  ['Anita Verma', '9876500102', 'anita@example.demo', 'Kothrud, Pune', 'S. Patel'],
  ['Deepak Iyer', '9876500103', 'deepak@example.demo', 'Thane West', 'M. Kumar'],
  ['Priya Nair', '9876500104', 'priya@example.demo', 'Powai, Mumbai', 'R. Gupta'],
  ['Sneha Mehta', '9876500105', 'sneha@example.demo', 'Borivali, Mumbai', 'M. Kumar'],
  ['Vikram Joshi', '9876500106', 'vikram@example.demo', 'Baner, Pune', 'S. Patel'],
  ['Karan Rao', '9876500107', 'karan@example.demo', 'Hinjewadi, Pune', 'R. Gupta'],
  ['Meena Kapoor', '9876500108', 'meena@example.demo', 'Vashi, Navi Mumbai', 'S. Patel']
].map(([name, mobile, email, address, agent], i) => ({
  id: `CUS-${String(i + 1).padStart(4, '0')}`,
  name, mobile, email, address, agent,
  status: 'Approved',
  createdAt: '15 Sep 2026'
}));

export const seedRegistry = {
  'BK-2026-0148': 'Documents pending',
  'BK-2026-0147': 'Documents pending',
  'BK-2026-0146': 'Registered',
  'BK-2026-0145': 'Agreement signed',
  'BK-2026-0144': 'Not started',
  'BK-2026-0143': 'Not started',
  'BK-2026-0142': 'Not started'
};
export const REGISTRY_STEPS = ['Not started', 'Documents pending', 'Agreement signed', 'Sub-registrar appointment', 'Registered'];

// One receipt per booking that already has money collected.
export const seedReceipts = seedPays
  .filter(p => p[4] !== '0')
  .map((p, i) => ({
    no: `RCT-2026-${String(201 + i).padStart(4, '0')}`,
    date: ['20 Sep 2026', '27 Sep 2026', '27 Sep 2026', '26 Sep 2026', '25 Sep 2026', '22 Sep 2026', '20 Sep 2026'][i] || '20 Sep 2026',
    customer: p[0], plot: p[1], project: p[2],
    finalPrice: p[3], amount: p[4], balance: p[5],
    mode: ['NEFT', 'UPI', 'Cheque', 'UPI', 'NEFT', 'Cheque', 'UPI'][i] || 'UPI',
    reference: `TXN${48210 + i * 7}`,
    agent: p[8],
    shared: i < 4
  }));

export const roleConfigs = {
  'SUPER ADMIN': {
    badge: 'SUPER ADMIN',
    color: '#7b39ed',
    bg: '#f3e8ff',
    title: 'Platform Governance & System Health',
    subtitle: 'System infrastructure, tenant security, global audit logs & root configuration.',
    defaultUser: { name: 'Devendra Singhania', email: 'superadmin@nmtsolution.demo', role: 'SUPER ADMIN' },
    permissions: ['ALL', 'SYSTEM_AUDIT', 'INFRASTRUCTURE', 'DATABASE_BACKUPS', 'IAM_PROVISIONING', 'MASTER_RECORDS'],
    workspaceNav: ['Overview', 'Approvals', 'Projects & plots', 'Bookings', 'Payments', 'Customers', 'Agents', 'Commissions'],
    insightsNav: ['Reports', 'Documents', 'Notifications', 'User & role management', 'Administration']
  },
  'ADMIN': {
    badge: 'ADMIN',
    color: '#4f5fce',
    bg: '#eef0ff',
    title: 'Operations Command Center',
    subtitle: 'Overall project portfolio, customer bookings, collection reconciliations and operations.',
    defaultUser: { name: 'Arjun Shah', email: 'admin@nmtsolution.demo', role: 'ADMIN' },
    permissions: ['PROJECTS_CRUD', 'BOOKINGS_CRUD', 'PAYMENTS_CRUD', 'AGENTS_CRUD', 'REPORTS_VIEW', 'USER_MANAGEMENT'],
    workspaceNav: ['Overview', 'Approvals', 'Projects & plots', 'Bookings', 'Payments', 'Customers', 'Agents', 'Commissions'],
    insightsNav: ['Reports', 'Documents', 'Notifications', 'User & role management', 'Administration']
  },
  'SALES MANAGER': {
    badge: 'SALES MANAGER',
    color: '#0891b2',
    bg: '#e0f2fe',
    title: 'Sales Team Pipeline & Quotas',
    subtitle: 'Real-time sales velocity, agent league tables, discount approvals and team conversions.',
    defaultUser: { name: 'Meera Kumar', email: 'manager@nmtsolution.demo', role: 'SALES MANAGER' },
    permissions: ['VIEW_ALL_LEADS', 'APPROVE_HOLDS', 'APPROVE_COMMISSIONS', 'ASSIGN_AGENTS', 'SALES_ANALYTICS'],
    workspaceNav: ['Overview', 'Projects & plots', 'Bookings', 'Customers', 'Agents', 'Commissions'],
    insightsNav: ['Reports', 'Documents', 'Notifications']
  },
  'SALES AGENT': {
    badge: 'SALES AGENT',
    color: '#16a34a',
    bg: '#dcfce7',
    title: 'My Sales Desk & Deal Pipeline',
    subtitle: 'Track your assigned plots, customer visits, deal closures, and commission statements.',
    defaultUser: { name: 'Sanjay Patel', email: 'agent@nmtsolution.demo', role: 'SALES AGENT' },
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
    defaultUser: { name: 'Neha Desai', email: 'accounts@nmtsolution.demo', role: 'ACCOUNTS' },
    permissions: ['RECORD_PAYMENTS', 'MANAGE_LEDGER', 'RECONCILE_ACCOUNTS', 'DISBURSE_COMMISSIONS', 'FINANCIAL_REPORTS'],
    workspaceNav: ['Overview', 'Payments', 'Bookings', 'Customers', 'Commissions'],
    insightsNav: ['Reports', 'Documents', 'Notifications']
  },
  'MANAGEMENT': {
    badge: 'MANAGEMENT',
    color: '#be123c',
    bg: '#ffe4e6',
    title: 'Executive Boardroom & Portfolio BI',
    subtitle: 'High-level Gross Development Value (GDV), cash flow forecasts, absorption velocity and project ROI.',
    defaultUser: { name: 'Vikramaditya Birla', email: 'management@nmtsolution.demo', role: 'MANAGEMENT' },
    permissions: ['EXECUTIVE_BI', 'CASHFLOW_VIEW', 'PORTFOLIO_ANALYTICS', 'BOARD_REPORTS', 'EXPORT_DATA'],
    workspaceNav: ['Overview', 'Projects & plots', 'Bookings', 'Payments'],
    insightsNav: ['Reports', 'Documents', 'Notifications']
  },
  'CUSTOMER': {
    badge: 'CUSTOMER',
    color: '#0d9488',
    bg: '#ccfbf1',
    title: 'My Plots, Payments & Documents',
    subtitle: 'View your plots, registry status, payments, pending dues, bills and documents. View-only access.',
    defaultUser: { name: 'Rajesh Sharma', email: 'customer@nmtsolution.demo', role: 'CUSTOMER', customerName: 'Rajesh Sharma' },
    permissions: ['VIEW_MY_PLOTS', 'VIEW_MY_PAYMENTS', 'VIEW_MY_BILLS', 'VIEW_MY_DOCUMENTS'],
    workspaceNav: ['Overview', 'Payments', 'Documents'],
    insightsNav: []
  }
};
