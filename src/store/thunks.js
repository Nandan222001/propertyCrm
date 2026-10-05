/**
 * Async workflows. Each thunk updates Redux first (so the UI never blocks on a
 * cold network) and, when the backend handshake has succeeded ('live' mode),
 * mirrors the change through the REST API. Reads hydrate the same slices the
 * demo seed fills, which is why the app works both against MySQL and offline.
 */
import { ApiUnavailableError, actions, api, setTokens, clearTokens } from '../api';
import { ROLES } from '../constants/roles';
import { COMPANY, roleConfigs } from '../data/seedData';
import { amountInWords, fmtINR, parseAmt } from '../utils/money';
import { todayLabel } from '../utils/date';
import { BOOKING_STATUS, PAYMENT_STATUS, PLOT_STATUS } from '../utils/status';
import { nextReference, newId } from '../utils/id';
import { clientAudit } from '../utils/security';
import {
  sessionFailed, sessionLoaded, signedIn, signedOut, rolePreviewed, userSaved, userRemoved, authError,
} from './slices/authSlice';
import {
  crudRowRemoved, crudRowUpserted, followUpSet, registryStatusSet, rowPatched, rowRemoved, rowUpserted,
  workspaceDemo, workspaceHydrated, workspaceLoading,
} from './slices/domainSlice';
import {
  computeTotals, itemsPayload, nextInvoiceNumber,
} from '../utils/billing';
import { buildInvoicePdf, downloadPdfBytes } from '../utils/pdf';
import { modalClosed, toastPushed } from './slices/uiSlice';

/** Toast helper — every page calls `notify(...)` through this one action. */
export const notify = (message) => toastPushed(message);

// --------------------------------------------------------------- session
/**
 * Sign in. Tries the real API; when the backend is unreachable (offline demo),
 * falls back to the role-based local session so the workspace still opens.
 */
export const signIn = ({ email, password, role }) => async (dispatch) => {
  try {
    const { data } = await actions.login({ email, password });
    setTokens(data?.tokens);
    const user = data?.user || {};
    dispatch(sessionLoaded({ user, permissions: user.permissions }));
    dispatch(toastPushed(`Welcome back, ${user.name || email}.`));
    clientAudit('auth.login', { mode: 'live', role: user.role });
    await dispatch(hydrateWorkspace());
    return;
  } catch (error) {
    if (!(error instanceof ApiUnavailableError)) {
      dispatch(authError(error.message));
      clientAudit('auth.login_failed', { code: error.code });
      throw error;
    }
  }
  // Demo fallback: local role-based session.
  const resolvedRole = role || ROLES.ADMIN;
  const user = roleConfigs[resolvedRole]?.defaultUser
    || { name: `${resolvedRole} User`, email, role: resolvedRole };
  dispatch(signedIn({ role: resolvedRole, user: { ...user, email: email || user.email } }));
  dispatch(toastPushed(`Demo session opened as ${user.name} (${resolvedRole}).`));
};

export const signOut = () => async (dispatch, getState) => {
  const mode = getState().auth.mode;
  if (mode === 'live') await actions.logout().catch(() => {});
  clearTokens();
  dispatch(signedOut());
  dispatch(toastPushed('Logged out of workspace session.'));
};

export const previewRole = (role) => (dispatch) => {
  dispatch(rolePreviewed(role));
  dispatch(toastPushed(`Switched perspective to ${role}`));
};

/** Hydrate every collection the UI needs; silently stays in demo mode. */
export const hydrateWorkspace = () => async (dispatch) => {
  dispatch(workspaceLoading());
  try {
    const [projects, plots, bookings, customers, payments, receipts, invoices] = await Promise.all([
      api.projects.list({ page_size: 200 }),
      api.plots.list({ page_size: 500 }),
      api.bookings.list({ page_size: 500 }),
      api.customers.list({ page_size: 500 }),
      api.payments.list({ page_size: 500 }),
      api.receipts.list({ page_size: 500 }),
      api.invoices.list({ page_size: 500 }),
    ]);
    dispatch(workspaceHydrated({
      projects: projects.data, plots: plots.data, bookings: bookings.data,
      customers: customers.data, payments: payments.data, receipts: receipts.data,
      invoices: invoices.data,
    }));
  } catch (error) {
    dispatch(workspaceDemo(error instanceof ApiUnavailableError ? '' : error.message));
  }
};

// --------------------------------------------------------------- bookings
export const createBooking = (form) => (dispatch, getState) => {
  const { auth, domain } = getState();
  const approved = [ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(auth.role);
  const reference = nextReference('BK', domain.bookings.map((b) => b[0]));
  const row = [
    reference, form.customer, form.project, form.plot, todayLabel(),
    form.amount, form.paid || '0', approved ? BOOKING_STATUS.CONFIRMED : BOOKING_STATUS.PENDING,
    form.agent, form.plan,
  ];
  dispatch(rowUpserted({ key: 'bookings', row }));
  dispatch(rowPatched({
    key: 'plots',
    id: form.plot,
    changes: { 5: approved ? PLOT_STATUS.BOOKED : PLOT_STATUS.HOLD, 6: form.customer, 7: form.agent },
  }));
  if (approved) dispatch(confirmLedger(row));
  dispatch(modalClosed());
  dispatch(toastPushed(approved
    ? `Booking ${reference} confirmed · Plot ${form.plot} booked`
    : `Booking ${reference} sent to admin for approval · Plot ${form.plot} on hold`));
  clientAudit('booking.created', { reference, approved });
  if (auth.mode === 'live') {
    api.bookings.create({
      customer_name: form.customer, plot_number: form.plot, final_price: form.amount,
      token_amount: form.paid || 0,
    }).catch(() => dispatch(toastPushed('Saved locally — the server rejected the sync')));
  }
};

/** Token advance rows + receipts for a confirmed booking (idempotent). */
export const confirmLedger = (booking) => (dispatch, getState) => {
  const { payments, receipts } = getState().domain;
  const due = parseAmt(booking[5]) - parseAmt(booking[6]);
  if (!payments.some((p) => p[0] === booking[1] && p[1] === booking[3])) {
    dispatch(rowUpserted({
      key: 'payments',
      row: [
        booking[1], booking[3], booking[2], booking[5], booking[6], fmtINR(due), '—',
        due <= 0 ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.PENDING, booking[8],
      ],
      mode: 'append',
    }));
  }
  if (parseAmt(booking[6]) > 0) {
    dispatch(rowUpserted({
      key: 'receipts',
      row: {
        no: nextReference('RCT', receipts.map((r) => r.no)).replace(/-0*(\d+)$/, (m, n) => `-${String(Math.max(201, Number(n))).padStart(4, '0')}`),
        date: todayLabel(), shared: false, reference: '', mode: 'Token advance',
        customer: booking[1], plot: booking[3], project: booking[2],
        finalPrice: booking[5], amount: booking[6], balance: fmtINR(due), agent: booking[8],
      },
    }));
  }
};

export const decideBooking = (booking, decision) => (dispatch, getState) => {
  const approved = decision === 'approve';
  dispatch(rowPatched({
    key: 'bookings',
    id: booking[0],
    changes: { 7: approved ? BOOKING_STATUS.CONFIRMED : BOOKING_STATUS.REJECTED },
  }));
  dispatch(rowPatched({
    key: 'plots',
    id: booking[3],
    changes: approved
      ? { 5: PLOT_STATUS.BOOKED, 6: booking[1], 7: booking[8] }
      : { 5: PLOT_STATUS.AVAILABLE, 6: '—', 7: booking[8] },
  }));
  if (approved) {
    const confirmed = booking.map((value, i) => (i === 7 ? BOOKING_STATUS.CONFIRMED : value));
    dispatch(confirmLedger(confirmed));
  }
  dispatch(toastPushed(approved
    ? `Booking ${booking[0]} approved · token receipt generated`
    : `Booking ${booking[0]} rejected · Plot ${booking[3]} released`));
  clientAudit(approved ? 'booking.approved' : 'booking.rejected', { reference: booking[0] });
  if (getState().auth.mode === 'live') {
    (approved ? actions.approveBooking : actions.rejectBooking)(booking[0], { reason: 'Saved from the ERP console' })
      .catch(() => dispatch(toastPushed('Saved locally — sync failed')));
  }
};

// --------------------------------------------------------------- customers
export const createCustomer = (form) => (dispatch, getState) => {
  const { customers } = getState().domain;
  const id = nextReference('CUS', customers.map((c) => c.id));
  dispatch(rowUpserted({
    key: 'customers',
    row: { id, ...form, status: 'Pending Approval', createdAt: todayLabel() },
  }));
  dispatch(modalClosed());
  dispatch(toastPushed(`Customer ${form.name} sent to admin for approval`));
  if (getState().auth.mode === 'live') {
    api.customers.create({
      name: form.name, mobile: form.mobile, email: form.email, address: form.address,
      agent_code: form.agent,
    }).catch(() => dispatch(toastPushed('Saved locally — sync failed')));
  }
};

export const decideCustomer = (customer, status) => (dispatch, getState) => {
  dispatch(rowPatched({ key: 'customers', id: customer.id, changes: { status } }));
  dispatch(toastPushed(`Customer ${customer.name} ${String(status).toLowerCase()}`));
  clientAudit('customer.decision', { id: customer.id, status });
  if (getState().auth.mode === 'live') {
    actions.decideCustomer(customer.id, { decision: status.toLowerCase(), reason: 'Reviewed in console' })
      .catch(() => dispatch(toastPushed('Saved locally — sync failed')));
  }
};

export const setRegistryStatus = (id, value) => (dispatch) => {
  dispatch(registryStatusSet({ id, value }));
  dispatch(toastPushed(`Registry status set to "${value}"`));
};

export const setFollowUp = (id, value) => (dispatch) => dispatch(followUpSet({ id, value }));

// --------------------------------------------------------------- payments
export const recordPayment = ({ booking, finalPrice, amount, mode, reference, due }) => (dispatch, getState) => {
  const { receipts, payments } = getState().domain;
  const paid = parseAmt(booking[6]) + amount;
  const balance = finalPrice - paid;
  const dueLabel = balance <= 0 || !due
    ? '—'
    : new Date(due).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  dispatch(rowPatched({ key: 'bookings', id: booking[0], changes: { 5: fmtINR(finalPrice), 6: fmtINR(paid) } }));

  const status = balance <= 0 ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.PARTIAL;
  const existing = payments.find((p) => p[0] === booking[1] && p[1] === booking[3]);
  if (existing) {
    dispatch(rowPatched({
      key: 'payments',
      id: existing[0],
      changes: { 3: fmtINR(finalPrice), 4: fmtINR(paid), 5: fmtINR(Math.max(balance, 0)), 6: dueLabel, 7: status },
    }));
  } else {
    dispatch(rowUpserted({
      key: 'payments',
      row: [booking[1], booking[3], booking[2], fmtINR(finalPrice), fmtINR(paid),
        fmtINR(Math.max(balance, 0)), dueLabel, status, booking[8]],
    }));
  }

  if (balance <= 0) dispatch(rowPatched({ key: 'plots', id: booking[3], changes: { 5: PLOT_STATUS.SOLD } }));

  const receipt = {
    no: nextReference('RCT', receipts.map((r) => r.no)),
    date: todayLabel(), shared: false, mode, reference: reference || '',
    customer: booking[1], plot: booking[3], project: booking[2],
    finalPrice: fmtINR(finalPrice), amount: fmtINR(amount), balance: fmtINR(Math.max(balance, 0)), agent: booking[8],
  };
  dispatch(rowUpserted({ key: 'receipts', row: receipt }));
  dispatch(modalClosed());
  dispatch(toastPushed(`₹${fmtINR(amount)} recorded for ${booking[1]} · bill ${receipt.no} generated`));
  clientAudit('payment.recorded', { receipt: receipt.no, mode });
  if (getState().auth.mode === 'live') {
    api.payments.create({
      booking_id: booking[0], amount, mode, reference, paid_on: new Date().toISOString(),
    }).catch(() => dispatch(toastPushed('Saved locally — sync failed')));
  }
  return receipt;
};

export const markReceiptShared = (receipt) => (dispatch) => {
  dispatch(rowPatched({ key: 'receipts', id: receipt.no, changes: { shared: true } }));
  dispatch(toastPushed(`Bill ${receipt.no} shared with ${receipt.customer} (visible in their login)`));
};

// ----------------------------------------------------------------- billing
/** Dispatch a history entry onto an invoice row (demo mode bookkeeping). */
const invoiceHistoryEntry = (invoice, toStatus, reason, actor) => [
  { id: Date.now(), to_status: toStatus, from_status: invoice.status, changed_by_label: actor, reason },
  ...(invoice.history || []),
];

/**
 * Create (or update a draft) invoice. Demo mode computes the totals locally
 * with the same arithmetic as the API; live mode trusts the server response.
 */
export const saveInvoice = (form) => async (dispatch, getState) => {
  const { auth, domain } = getState();
  const actor = auth.currentUser?.name || 'Billing desk';
  const items = itemsPayload(form.items);
  if (!items.length) {
    dispatch(toastPushed('Add at least one line item first'));
    return null;
  }
  const totals = computeTotals(form.items, { discount: form.discount, gstRate: form.gstRate });

  if (auth.mode === 'live' && form.booking?.id) {
    try {
      const body = {
        booking_id: form.booking.id,
        gst_rate: form.gstRate,
        discount_amount: Number(form.discount) || 0,
        items,
        notes: form.notes || null,
        terms: form.terms || null,
      };
      const response = form.editing
        ? await api.invoices.update(form.editing.id, body)
        : await api.invoices.create(body);
      dispatch(rowUpserted({ key: 'invoices', row: response.data }));
      dispatch(modalClosed());
      dispatch(toastPushed(response.message || `Invoice ${response.data.invoice_number} saved`));
      return response.data;
    } catch (error) {
      dispatch(toastPushed(`The server rejected the invoice: ${error.message}`));
      return null;
    }
  }

  const existing = form.editing;
  const number = existing?.invoice_number || nextInvoiceNumber(domain.invoices);
  const bookingTuple = domain.bookings.find((b) => Array.isArray(b) && b[0] === form.bookingNumber);
  const row = {
    id: existing?.id || number,
    public_id: existing?.public_id || number,
    invoice_number: number,
    booking_number: form.bookingNumber,
    customer_name: form.booking?.customer || bookingTuple?.[1] || '—',
    agent_name: form.booking?.agent || bookingTuple?.[8] || '',
    project_name: form.booking?.project || bookingTuple?.[2] || '',
    plot_number: form.booking?.plot || bookingTuple?.[3] || '',
    issue_date: existing?.issue_date || todayLabel(),
    due_date: form.dueDate || null,
    status: 'DRAFT',
    subtotal: totals.subtotal,
    discount_amount: totals.discountAmount,
    taxable_value: totals.taxableValue,
    gst_rate: totals.gstRate,
    gst_amount: totals.gstAmount,
    cgst_amount: totals.cgstAmount,
    sgst_amount: totals.sgstAmount,
    round_off: totals.roundOff,
    total_amount: totals.totalAmount,
    amount_paid: 0,
    balance_amount: totals.totalAmount,
    items: items.map((item, index) => ({
      ...item, id: index + 1,
      line_total: Math.max(0, item.quantity * item.unit_price - item.discount_amount),
    })),
    history: invoiceHistoryEntry(
      existing || { status: null, history: [] }, 'DRAFT',
      existing ? 'Draft edited' : 'Invoice created', actor,
    ),
    notes: form.notes || null,
    terms: form.terms || null,
    is_shared_with_customer: existing?.is_shared_with_customer || false,
    cancellation_reason: null,
  };
  dispatch(rowUpserted({ key: 'invoices', row }));
  dispatch(modalClosed());
  dispatch(toastPushed(`Draft ${number} saved · ₹${fmtINR(totals.totalAmount)} · ready to issue`));
  clientAudit(existing ? 'invoice.updated' : 'invoice.created', { number, total: totals.totalAmount });
  return row;
};

/** Issue a draft — it becomes a numbered, collectible bill (due in 15 days). */
export const issueInvoice = (invoice) => async (dispatch, getState) => {
  const { auth } = getState();
  if (auth.mode === 'live' && typeof invoice.id === 'number') {
    try {
      const response = await actions.issueInvoice(invoice.id, {});
      dispatch(rowUpserted({ key: 'invoices', row: response.data }));
      dispatch(toastPushed(response.message || `Invoice ${invoice.invoice_number} issued`));
      return;
    } catch (error) {
      dispatch(toastPushed(`Could not issue: ${error.message}`));
      return;
    }
  }
  const due = new Date(Date.now() + 15 * 86400000)
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  dispatch(rowPatched({
    key: 'invoices',
    id: invoice.id,
    changes: {
      status: 'ISSUED',
      due_date: invoice.due_date || due,
      history: invoiceHistoryEntry(invoice, 'ISSUED', `Issued · payment due ${invoice.due_date || due}`,
        auth.currentUser?.name || 'Billing desk'),
    },
  }));
  dispatch(toastPushed(`Invoice ${invoice.invoice_number} issued · due ${invoice.due_date || due}`));
  clientAudit('invoice.issued', { number: invoice.invoice_number });
};

/** Cancel an unpaid invoice with a reason (audited). */
export const cancelInvoice = (invoice, reason) => async (dispatch, getState) => {
  const { auth } = getState();
  if (auth.mode === 'live' && typeof invoice.id === 'number') {
    try {
      const response = await actions.cancelInvoice(invoice.id, { reason });
      dispatch(rowUpserted({ key: 'invoices', row: response.data }));
      dispatch(toastPushed(response.message || `Invoice ${invoice.invoice_number} cancelled`));
      return;
    } catch (error) {
      dispatch(toastPushed(`Could not cancel: ${error.message}`));
      return;
    }
  }
  dispatch(rowPatched({
    key: 'invoices',
    id: invoice.id,
    changes: {
      status: 'CANCELLED',
      cancellation_reason: reason,
      balance_amount: 0,
      history: invoiceHistoryEntry(invoice, 'CANCELLED', reason, auth.currentUser?.name || 'Billing desk'),
    },
  }));
  dispatch(toastPushed(`Invoice ${invoice.invoice_number} cancelled`));
  clientAudit('invoice.cancelled', { number: invoice.invoice_number, reason });
};

/**
 * Collect against an invoice. The ledger side (booking paid amount, payments
 * row, numbered receipt) is delegated to `recordPayment`; the invoice then
 * records the same amount as `amount_paid`.
 */
export const payInvoice = (invoice, { amount, mode, reference }) => async (dispatch, getState) => {
  const { auth, domain } = getState();
  if (auth.mode === 'live' && typeof invoice.id === 'number') {
    try {
      const response = await actions.payInvoice(invoice.id, { amount, mode, reference });
      dispatch(rowUpserted({ key: 'invoices', row: response.data }));
      dispatch(modalClosed());
      dispatch(toastPushed(response.message || `₹${fmtINR(amount)} collected`));
      return;
    } catch (error) {
      dispatch(toastPushed(`Could not record the collection: ${error.message}`));
      return;
    }
  }
  const booking = domain.bookings.find((b) => Array.isArray(b) && b[0] === invoice.booking_number);
  if (booking) {
    dispatch(recordPayment({
      booking, finalPrice: parseAmt(booking[5]), amount, mode, reference, due: null,
    }));
  }
  const paid = (Number(invoice.amount_paid) || 0) + Number(amount);
  const balance = Math.max((Number(invoice.total_amount) || 0) - paid, 0);
  dispatch(rowPatched({
    key: 'invoices',
    id: invoice.id,
    changes: {
      amount_paid: paid,
      balance_amount: balance,
      status: balance <= 0 ? 'PAID' : 'PARTIALLY_PAID',
      history: invoiceHistoryEntry(
        invoice, balance <= 0 ? 'PAID' : 'PARTIALLY_PAID',
        `₹${fmtINR(amount)} collected via ${mode}`, auth.currentUser?.name || 'Billing desk',
      ),
    },
  }));
  dispatch(modalClosed());
  dispatch(toastPushed(
    `₹${fmtINR(amount)} collected on ${invoice.invoice_number} · ${balance <= 0 ? 'fully settled' : `₹${fmtINR(balance)} still due`}`,
  ));
  clientAudit('invoice.payment', { number: invoice.invoice_number, amount });
};

/** Flag the bill as shared with the customer portal/WhatsApp (audited). */
export const shareInvoice = (invoice) => async (dispatch, getState) => {
  const { auth } = getState();
  if (auth.mode === 'live' && typeof invoice.id === 'number') {
    try {
      await actions.shareInvoice(invoice.id);
    } catch (error) {
      dispatch(toastPushed(`Could not share: ${error.message}`));
      return;
    }
  }
  dispatch(rowPatched({ key: 'invoices', id: invoice.id, changes: { is_shared_with_customer: true } }));
  dispatch(toastPushed(`Bill ${invoice.invoice_number} shared with ${invoice.customer_name}`));
  clientAudit('invoice.shared', { number: invoice.invoice_number });
};

/**
 * Download the tax-invoice PDF. Live mode streams the reportlab-rendered file
 * from the API; demo mode renders the same A4 invoice locally (offline-safe).
 */
export const downloadInvoicePdf = (invoice) => async (dispatch, getState) => {
  const { auth, domain } = getState();
  try {
    let bytes = null;
    if (auth.mode === 'live' && typeof invoice.id === 'number') {
      const blob = await actions.invoicePdf(invoice.id);
      bytes = new Uint8Array(await blob.arrayBuffer());
    } else {
      const customer = domain.customers.find((c) => c.name === invoice.customer_name);
      bytes = buildInvoicePdf({
        invoice,
        company: COMPANY,
        customer: {
          name: invoice.customer_name,
          phone: customer?.mobile || '',
          email: customer?.email || '',
          address: customer?.address || '',
        },
        booking: {
          booking_number: invoice.booking_number,
          project: invoice.project_name,
          plot: invoice.plot_number,
        },
        amountInWords: amountInWords(invoice.total_amount),
      });
    }
    downloadPdfBytes(bytes, `${invoice.invoice_number}.pdf`);
    dispatch(toastPushed(`PDF bill ${invoice.invoice_number}.pdf downloaded`));
    clientAudit('invoice.pdf_downloaded', { number: invoice.invoice_number, bytes: bytes.length });
  } catch (error) {
    dispatch(toastPushed(`PDF download failed: ${error.message}`));
  }
};

// --------------------------------------------------------------- masters
export const saveRecord = (record) => (dispatch, getState) => {
  const { crudPage, editRecord, modal } = getState().ui;
  if (modal === 'user') {
    const user = editRecord
      ? { ...editRecord, ...record }
      : { id: `USR-${String(Date.now()).slice(-5)}`, ...record, status: record.status || 'Active' };
    dispatch(userSaved(user));
    dispatch(toastPushed(editRecord ? `Team member ${record.name} updated` : `Team member ${record.name} invited`));
    clientAudit(editRecord ? 'user.updated' : 'user.created', { id: user.id, role: user.role });
  } else {
    dispatch(crudRowUpserted({
      key: crudPage,
      row: editRecord ? { ...record, id: editRecord.id } : { ...record, id: newId() },
    }));
    dispatch(toastPushed(editRecord ? 'Record updated' : 'Record created'));
  }
  dispatch(modalClosed());
};

export const deleteRecord = (record) => (dispatch, getState) => {
  const { crudPage, page } = getState().ui;
  if (page === 'User & role management') {
    dispatch(userRemoved(record.id));
    dispatch(toastPushed(`Removed user ${record.name}`));
  } else {
    dispatch(crudRowRemoved({ key: crudPage, id: record.id }));
    dispatch(toastPushed(`Deleted ${record.name}`));
  }
};

// --------------------------------------------------------------- helpers
export const openCustomerDetail = (customer) => (dispatch) => {
  dispatch({ type: 'ui/customerSelected', payload: customer });
};

/** Self-registration from the login screen: creates the customer file + session. */
export const registerCustomerAccount = (account) => (dispatch) => {
  dispatch(rowUpserted({
    key: 'customers',
    row: {
      id: `CUS-${String(Date.now()).slice(-4)}`,
      name: account.name,
      mobile: (account.phone || '').replace(/\D/g, '').slice(-10),
      email: account.email,
      address: '',
      agent: '',
      status: 'Pending Approval',
      createdAt: todayLabel(),
    },
  }));
  dispatch(signedIn({ role: ROLES.CUSTOMER, user: { ...account, customerName: account.name, role: ROLES.CUSTOMER } }));
  dispatch(toastPushed(`Welcome, ${account.name}! Your customer workspace is ready.`));
};

export { sessionFailed };
