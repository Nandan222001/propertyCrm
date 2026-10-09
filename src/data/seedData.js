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
  { id: 'USR-001', name: 'Arjun Shah', email: 'admin@lalitainfra.com', phone: '+91 98765 00001', role: 'ADMIN', status: 'Active', title: 'Operations Director' },
  { id: 'USR-002', name: 'Devendra Singhania', email: 'superadmin@lalitainfra.com', phone: '+91 98765 00000', role: 'SUPER ADMIN', status: 'Active', title: 'Chief Technology Officer' },
  { id: 'USR-003', name: 'Meera Kumar', email: 'manager@lalitainfra.com', phone: '+91 98765 00002', role: 'SALES MANAGER', status: 'Active', title: 'VP of Sales & Strategy' },
  { id: 'USR-004', name: 'Sanjay Patel', email: 'agent@lalitainfra.com', phone: '+91 98765 00003', role: 'SALES AGENT', status: 'Active', title: 'Senior Property Consultant' },
  { id: 'USR-007', name: 'Manoj Kumar', email: 'manoj@lalitainfra.com', phone: '+91 98765 10001', role: 'SALES AGENT', status: 'Active', title: 'Property Consultant' },
  { id: 'USR-008', name: 'Rohit Gupta', email: 'rohit@lalitainfra.com', phone: '+91 98765 10003', role: 'SALES AGENT', status: 'Active', title: 'Property Consultant' },
  { id: 'USR-005', name: 'Neha Desai', email: 'accounts@lalitainfra.com', phone: '+91 98765 00004', role: 'ACCOUNTS', status: 'Active', title: 'Head of Treasury & Billing' },
  { id: 'USR-006', name: 'Vikramaditya Birla', email: 'management@lalitainfra.com', phone: '+91 98765 00005', role: 'MANAGEMENT', status: 'Active', title: 'Managing Director & Board Member' }
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
  gstin: '27AAACL1234K1ZV',
  phone: '+91 98765 00001',
  email: 'accounts@lalitainfra.com'
};

export const seedCustomers = [
  ['Rajesh Sharma', '9876500101', 'rajesh.sharma@gmail.com', 'Andheri East, Mumbai', 'M. Kumar'],
  ['Anita Verma', '9876500102', 'anita.verma@gmail.com', 'Kothrud, Pune', 'S. Patel'],
  ['Deepak Iyer', '9876500103', 'deepak.iyer@gmail.com', 'Thane West', 'M. Kumar'],
  ['Priya Nair', '9876500104', 'priya.nair@gmail.com', 'Powai, Mumbai', 'R. Gupta'],
  ['Sneha Mehta', '9876500105', 'sneha.mehta@gmail.com', 'Borivali, Mumbai', 'M. Kumar'],
  ['Vikram Joshi', '9876500106', 'vikram.joshi@gmail.com', 'Baner, Pune', 'S. Patel'],
  ['Karan Rao', '9876500107', 'karan.rao@gmail.com', 'Hinjewadi, Pune', 'R. Gupta'],
  ['Meena Kapoor', '9876500108', 'meena.kapoor@gmail.com', 'Vashi, Navi Mumbai', 'S. Patel']
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

/**
 * Demo tax invoices — the same object shape the /invoices API returns, so the
 * Billing page renders identically in demo mode and against the live backend.
 */
export const seedInvoices = [
  {
    id: 'INV-2026-0101', public_id: 'INV-2026-0101', invoice_number: 'INV-2026-0101',
    booking_number: 'BK-2026-0148', customer_name: 'Rajesh Sharma', agent_name: 'M. Kumar',
    project_name: 'Green Meadows', plot_number: 'A-012',
    issue_date: '25 Sep 2026', due_date: '09 Oct 2026', status: 'ISSUED',
    subtotal: 186500, discount_amount: 0, taxable_value: 186500, gst_rate: 0,
    gst_amount: 0, cgst_amount: 0, sgst_amount: 0, round_off: 0,
    total_amount: 186500, amount_paid: 0, balance_amount: 186500,
    items: [
      { id: 1, description: 'Instalment 11 of 12 — plot sale consideration', hsn_sac: null, quantity: 1, unit: 'NOS', unit_price: 184000, discount_amount: 0, line_total: 184000 },
      { id: 2, description: 'Documentation & registration assistance', hsn_sac: null, quantity: 1, unit: 'NOS', unit_price: 2500, discount_amount: 0, line_total: 2500 },
    ],
    history: [
      { id: 2, to_status: 'ISSUED', from_status: 'DRAFT', changed_by_label: 'Neha Desai', reason: 'Issued · payment due 09 Oct 2026' },
      { id: 1, to_status: 'DRAFT', from_status: null, changed_by_label: 'Neha Desai', reason: 'Invoice created' },
    ],
    notes: 'Please quote the invoice number with every payment.',
    terms: 'Payment is due on or before the due date. Interest @ 12% p.a. applies on delayed instalments.',
    is_shared_with_customer: false, cancellation_reason: null,
  },
  {
    id: 'INV-2026-0102', public_id: 'INV-2026-0102', invoice_number: 'INV-2026-0102',
    booking_number: 'BK-2026-0148', customer_name: 'Rajesh Sharma', agent_name: 'M. Kumar',
    project_name: 'Green Meadows', plot_number: 'A-012',
    issue_date: '25 Sep 2026', due_date: '29 Sep 2026', status: 'OVERDUE',
    subtotal: 60000, discount_amount: 0, taxable_value: 60000, gst_rate: 0.18,
    gst_amount: 10800, cgst_amount: 5400, sgst_amount: 5400, round_off: 0,
    total_amount: 70800, amount_paid: 30000, balance_amount: 40800,
    items: [
      { id: 1, description: 'Development & infrastructural charges — Phase II', hsn_sac: '995461', quantity: 2400, unit: 'SQFT', unit_price: 25, discount_amount: 0, line_total: 60000 },
    ],
    history: [
      { id: 3, to_status: 'OVERDUE', from_status: 'PARTIALLY_PAID', changed_by_label: 'System', reason: 'Past due date sweep' },
      { id: 2, to_status: 'PARTIALLY_PAID', from_status: 'ISSUED', changed_by_label: 'Neha Desai', reason: '₹30,000 collected via NEFT' },
      { id: 1, to_status: 'ISSUED', from_status: 'DRAFT', changed_by_label: 'Neha Desai', reason: 'Issued · payment due 29 Sep 2026' },
    ],
    notes: 'Please quote the invoice number with every payment.',
    terms: 'Payment is due on or before the due date. Interest @ 12% p.a. applies on delayed instalments.',
    is_shared_with_customer: true, cancellation_reason: null,
  },
  {
    id: 'INV-2026-0103', public_id: 'INV-2026-0103', invoice_number: 'INV-2026-0103',
    booking_number: 'BK-2026-0147', customer_name: 'Anita Verma', agent_name: 'S. Patel',
    project_name: 'Silver Oaks', plot_number: 'B-104',
    issue_date: '26 Sep 2026', due_date: null, status: 'DRAFT',
    subtotal: 210000, discount_amount: 10000, taxable_value: 200000, gst_rate: 0,
    gst_amount: 0, cgst_amount: 0, sgst_amount: 0, round_off: 0,
    total_amount: 200000, amount_paid: 0, balance_amount: 200000,
    items: [
      { id: 1, description: 'Instalment 4 of 6 — plot sale consideration', hsn_sac: null, quantity: 1, unit: 'NOS', unit_price: 210000, discount_amount: 0, line_total: 210000 },
    ],
    history: [
      { id: 1, to_status: 'DRAFT', from_status: null, changed_by_label: 'Neha Desai', reason: 'Invoice created' },
    ],
    notes: 'Loyalty adjustment applied.',
    terms: 'Payment is due on or before the due date. Interest @ 12% p.a. applies on delayed instalments.',
    is_shared_with_customer: false, cancellation_reason: null,
  },
  {
    id: 'INV-2026-0104', public_id: 'INV-2026-0104', invoice_number: 'INV-2026-0104',
    booking_number: 'BK-2026-0143', customer_name: 'Vikram Joshi', agent_name: 'S. Patel',
    project_name: 'Silver Oaks', plot_number: 'C-015',
    issue_date: '24 Sep 2026', due_date: '01 Oct 2026', status: 'PAID',
    subtotal: 100000, discount_amount: 0, taxable_value: 100000, gst_rate: 0.18,
    gst_amount: 18000, cgst_amount: 9000, sgst_amount: 9000, round_off: 0,
    total_amount: 118000, amount_paid: 118000, balance_amount: 0,
    items: [
      { id: 1, description: 'Club house & amenity charges', hsn_sac: '995461', quantity: 1, unit: 'NOS', unit_price: 100000, discount_amount: 0, line_total: 100000 },
    ],
    history: [
      { id: 3, to_status: 'PAID', from_status: 'PARTIALLY_PAID', changed_by_label: 'Neha Desai', reason: '₹1,18,000 collected via NEFT' },
      { id: 2, to_status: 'ISSUED', from_status: 'DRAFT', changed_by_label: 'Neha Desai', reason: 'Issued · payment due 01 Oct 2026' },
      { id: 1, to_status: 'DRAFT', from_status: null, changed_by_label: 'Neha Desai', reason: 'Invoice created' },
    ],
    notes: 'Please quote the invoice number with every payment.',
    terms: 'Payment is due on or before the due date. Interest @ 12% p.a. applies on delayed instalments.',
    is_shared_with_customer: true, cancellation_reason: null,
  },
  {
    id: 'INV-2026-0105', public_id: 'INV-2026-0105', invoice_number: 'INV-2026-0105',
    booking_number: 'BK-2026-0144', customer_name: 'Sneha Mehta', agent_name: 'M. Kumar',
    project_name: 'Green Meadows', plot_number: 'B-033',
    issue_date: '22 Sep 2026', due_date: null, status: 'CANCELLED',
    subtotal: 75000, discount_amount: 0, taxable_value: 75000, gst_rate: 0.18,
    gst_amount: 13500, cgst_amount: 6750, sgst_amount: 6750, round_off: 0,
    total_amount: 88500, amount_paid: 0, balance_amount: 0,
    items: [
      { id: 1, description: 'Car parking allotment — covered bay', hsn_sac: null, quantity: 1, unit: 'NOS', unit_price: 75000, discount_amount: 0, line_total: 75000 },
    ],
    history: [
      { id: 2, to_status: 'CANCELLED', from_status: 'DRAFT', changed_by_label: 'Arjun Shah', reason: 'Raised in error — duplicate of the instalment bill' },
      { id: 1, to_status: 'DRAFT', from_status: null, changed_by_label: 'Neha Desai', reason: 'Invoice created' },
    ],
    notes: null, terms: null,
    is_shared_with_customer: false, cancellation_reason: 'Raised in error — duplicate of the instalment bill',
  },
  {
    id: 'INV-2026-0106', public_id: 'INV-2026-0106', invoice_number: 'INV-2026-0106',
    booking_number: 'BK-2026-0145', customer_name: 'Priya Nair', agent_name: 'R. Gupta',
    project_name: 'Green Meadows', plot_number: 'A-101',
    issue_date: '21 Sep 2026', due_date: '17 Oct 2026', status: 'PARTIALLY_PAID',
    subtotal: 87000, discount_amount: 0, taxable_value: 87000, gst_rate: 0,
    gst_amount: 0, cgst_amount: 0, sgst_amount: 0, round_off: 0,
    total_amount: 87000, amount_paid: 50000, balance_amount: 37000,
    items: [
      { id: 1, description: 'Instalment 5 of 12 — plot sale consideration', hsn_sac: null, quantity: 1, unit: 'NOS', unit_price: 80000, discount_amount: 0, line_total: 80000 },
      { id: 2, description: 'Legal & conveyance charges', hsn_sac: null, quantity: 1, unit: 'NOS', unit_price: 7500, discount_amount: 500, line_total: 7000 },
    ],
    history: [
      { id: 2, to_status: 'PARTIALLY_PAID', from_status: 'ISSUED', changed_by_label: 'Neha Desai', reason: '₹50,000 collected via UPI' },
      { id: 1, to_status: 'ISSUED', from_status: 'DRAFT', changed_by_label: 'Neha Desai', reason: 'Issued · payment due 17 Oct 2026' },
    ],
    notes: 'Please quote the invoice number with every payment.',
    terms: 'Payment is due on or before the due date. Interest @ 12% p.a. applies on delayed instalments.',
    is_shared_with_customer: false, cancellation_reason: null,
  },
];

export const roleConfigs = {
  'SUPER ADMIN': {
    badge: 'PLATFORM ADMIN',
    color: '#7b39ed',
    bg: '#f3e8ff',
    title: 'Platform Console',
    subtitle: 'Organisations (tenants), their administrators, plans and access — never their business data.',
    defaultUser: { name: 'Devendra Singhania', email: 'superadmin@lalitainfra.com', role: 'SUPER ADMIN' },
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
    defaultUser: { name: 'Arjun Shah', email: 'admin@lalitainfra.com', role: 'ADMIN' },
    permissions: ['PROJECTS_CRUD', 'BOOKINGS_CRUD', 'PAYMENTS_CRUD', 'AGENTS_CRUD', 'REPORTS_VIEW', 'USER_MANAGEMENT'],
    workspaceNav: ['Overview', 'Approvals', 'Projects & plots', 'Bookings', 'Payments', 'Billing', 'Customers', 'Agents', 'Commissions'],
    insightsNav: ['Reports', 'Documents', 'Notifications', 'User & role management', 'Administration']
  },
  'SALES MANAGER': {
    badge: 'SALES MANAGER',
    color: '#0891b2',
    bg: '#e0f2fe',
    title: 'Sales Team Pipeline & Quotas',
    subtitle: 'Real-time sales velocity, agent league tables, discount approvals and team conversions.',
    defaultUser: { name: 'Meera Kumar', email: 'manager@lalitainfra.com', role: 'SALES MANAGER' },
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
    defaultUser: { name: 'Sanjay Patel', email: 'agent@lalitainfra.com', role: 'SALES AGENT' },
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
    defaultUser: { name: 'Neha Desai', email: 'accounts@lalitainfra.com', role: 'ACCOUNTS' },
    permissions: ['RECORD_PAYMENTS', 'MANAGE_LEDGER', 'RECONCILE_ACCOUNTS', 'DISBURSE_COMMISSIONS', 'FINANCIAL_REPORTS'],
    workspaceNav: ['Overview', 'Payments', 'Billing', 'Bookings', 'Customers', 'Commissions'],
    insightsNav: ['Reports', 'Documents', 'Notifications']
  },
  'MANAGEMENT': {
    badge: 'MANAGEMENT',
    color: '#be123c',
    bg: '#ffe4e6',
    title: 'Executive Boardroom & Portfolio BI',
    subtitle: 'High-level Gross Development Value (GDV), cash flow forecasts, absorption velocity and project ROI.',
    defaultUser: { name: 'Vikramaditya Birla', email: 'management@lalitainfra.com', role: 'MANAGEMENT' },
    permissions: ['EXECUTIVE_BI', 'CASHFLOW_VIEW', 'PORTFOLIO_ANALYTICS', 'BOARD_REPORTS', 'EXPORT_DATA'],
    workspaceNav: ['Overview', 'Projects & plots', 'Bookings', 'Payments', 'Billing'],
    insightsNav: ['Reports', 'Documents', 'Notifications']
  },
  'CUSTOMER': {
    badge: 'CUSTOMER',
    color: '#0d9488',
    bg: '#ccfbf1',
    title: 'My Plots, Payments & Documents',
    subtitle: 'View your plots, registry status, payments, pending dues, bills and documents. View-only access.',
    defaultUser: { name: 'Rajesh Sharma', email: 'rajesh.sharma@gmail.com', role: 'CUSTOMER', customerName: 'Rajesh Sharma' },
    permissions: ['VIEW_MY_PLOTS', 'VIEW_MY_PAYMENTS', 'VIEW_MY_BILLS', 'VIEW_MY_DOCUMENTS'],
    workspaceNav: ['Overview', 'Payments', 'Billing', 'Documents'],
    insightsNav: []
  }
};
