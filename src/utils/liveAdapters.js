/**
 * Live API -> UI shapes.
 *
 * The pages were built around compact "tuple" rows (see `data/seedData.js`). In live mode the
 * API returns objects, so each collection is mapped here once, at the edge — pages never
 * learn whether their data came from the demo seed or from a tenant's real records.
 */
import { fmtINR } from './money';
import { projectFromApi } from './projects';

const dash = '—';
const dateLabel = (iso) => {
  if (!iso) return dash;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? dash : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const BOOKING_STATUS = {
  PENDING_APPROVAL: 'Pending Approval', CONFIRMED: 'Confirmed', AGREEMENT: 'Agreement',
  REGISTERED: 'Registered', CANCELLED: 'Cancelled', REJECTED: 'Rejected',
};
const CUSTOMER_STATUS = { PENDING_APPROVAL: 'Pending Approval', APPROVED: 'Approved', REJECTED: 'Rejected' };

/** One API customer -> the SPA customer row. */
export const adaptCustomer = (c) => ({
  id: c.id,
  name: c.name,
  mobile: c.phone || '',
  email: c.email || '',
  address: c.address || [c.city, c.pincode].filter(Boolean).join(' '),
  agent: c.agent_name || '',
  status: CUSTOMER_STATUS[c.status] || c.status,
  project: c.project_name || '',
  projectId: c.project_id ?? null,
});

export const REGISTRY_LABEL = {
  NOT_STARTED: 'Not started', DOCUMENTS_PENDING: 'Documents pending', AGREEMENT_SIGNED: 'Agreement signed',
  SUB_REGISTRAR_APPOINTMENT: 'Sub-registrar appointment', REGISTERED: 'Registered',
};
export const REGISTRY_CODE = Object.fromEntries(Object.entries(REGISTRY_LABEL).map(([code, label]) => [label, code]));

const byId = (rows) => new Map(rows.map((r) => [r.id, r]));

/** Build every UI collection from the raw API lists (any list may be empty or unavailable). */
export function adaptWorkspace({
  projects = [], plots = [], bookings = [], customers = [], ledger = [], receipts = [], invoices = [], agents = [],
}) {
  const customerById = byId(customers);
  const agentById = byId(agents);
  const bookingById = byId(bookings);

  return {
    projects: projects.map(projectFromApi),

    // [plot no, layout, area, facing, price, status, customer, agent, project, apiId]
    plots: plots.map((p) => [
      p.plot_number, p.layout || dash, fmtINR(p.area_sqft), p.facing || dash, fmtINR(p.price), p.status,
      customerById.get(p.customer_id)?.name || dash, agentById.get(p.agent_id)?.name || dash, p.project_name || dash,
      p.id,
    ]),

    // [id, customer, project, plot, date, value, paid, status, agent, plan, apiId, customerId]
    bookings: bookings.map((b) => [
      b.booking_number, b.customer_name || dash, b.project_name || dash, b.plot_number || dash, dateLabel(b.booking_date),
      fmtINR(b.final_price), fmtINR(b.paid_amount), BOOKING_STATUS[b.status] || b.status, b.agent_name || dash,
      b.payment_plan || dash, b.id, b.customer_id,
    ]),

    customers: customers.map(adaptCustomer),

    // ledger row: [customer, plot, project, final, paid, pending, next due, status, agent, bookingNumber]
    payments: ledger.map((r) => [
      r.customer_name || dash, r.plot_number || dash, r.project_name || dash, fmtINR(r.final_price), fmtINR(r.paid_amount),
      fmtINR(r.balance), dateLabel(r.due_date), String(r.status || '').replace(/_/g, ' '), r.agent_name || dash,
      r.booking_number,
    ]),

    receipts: receipts.map((r) => {
      const booking = bookingById.get(r.booking_id);
      return {
        id: r.id,
        no: r.receipt_number,
        date: dateLabel(r.issued_on),
        customer: customerById.get(r.customer_id)?.name || booking?.customer_name || dash,
        plot: booking?.plot_number || dash,
        project: booking?.project_name || dash,
        finalPrice: fmtINR(r.final_price),
        amount: fmtINR(r.amount),
        balance: fmtINR(r.balance),
        mode: r.mode,
        reference: r.reference || '',
        agent: booking?.agent_name || '',
        shared: Boolean(r.is_shared_with_customer),
      };
    }),

    registry: Object.fromEntries(bookings.map((b) => [b.booking_number, REGISTRY_LABEL[b.registry_stage] || 'Not started'])),

    invoices, // already API-shaped: the Billing page consumes them as-is
  };
}
