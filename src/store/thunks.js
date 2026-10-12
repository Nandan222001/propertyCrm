/**
 * Async workflows. Each thunk updates Redux first (so the UI never blocks on a
 * cold network) and, when the backend handshake has succeeded ('live' mode),
 * mirrors the change through the REST API. Reads hydrate the same slices the
 * demo seed fills, which is why the app works both against MySQL and offline.
 */
import { ApiUnavailableError, actions, api, hasSession, setTokens, clearTokens } from '../api';
import { ROLES, toUiRole } from '../constants/roles';
import { COMPANY, roleConfigs } from '../data/appConfig';
import { amountInWords, fmtINR, parseAmt } from '../utils/money';
import { todayLabel } from '../utils/date';
import { isValidMobile, normaliseMobile, MOBILE_HINT } from '../utils/phone';
import { BOOKING_STATUS, PAYMENT_STATUS, PLOT_STATUS } from '../utils/status';
import { nextReference, newId } from '../utils/id';
import { getSettings } from '../utils/settings';
import { loadTenants } from './tenantThunks';
import { projectApiPayload, projectFromApi, projectRowFromForm } from '../utils/projects';
import { adaptWorkspace, adaptCustomer, REGISTRY_CODE } from '../utils/liveAdapters';
import { notificationsLoaded, notificationPatched } from './slices/notificationsSlice';
import { setRemoteSettings } from '../utils/settings';
import { clientAudit } from '../utils/security';
import {
  sessionFailed, sessionLoaded, signedIn, signedOut, userSaved, usersLoaded, userRemoved, authError, loginNoticeSet,
} from './slices/authSlice';
import {
  crudRowRemoved, crudRowUpserted, followUpSet, registryStatusSet, paymentStatusSet, projectSaved, rowPatched, rowRemoved, rowUpserted,
  workspaceFailed, workspaceHydrated, workspaceLoading,
} from './slices/domainSlice';
import {
  computeTotals, itemsPayload, nextInvoiceNumber,
} from '../utils/billing';
import { buildInvoicePdf, downloadPdfBytes } from '../utils/pdf';
import { modalClosed, toastPushed } from './slices/uiSlice';

/** Toast helper — every page calls `notify(...)` through this one action. */
export const notify = (message) => toastPushed(message);

// --------------------------------------------------------------- session
/** Sign in against the server. There is no offline or sample session: if it cannot be reached, say so. */
export const signIn = ({ email, password }) => async (dispatch) => {
  try {
    const { data } = await actions.login({ email, password });
    setTokens(data?.tokens);
    const user = data?.user || {};
    dispatch(sessionLoaded({ user, permissions: user.permissions }));
    dispatch(toastPushed(`Welcome back, ${user.name || email}.`));
    clientAudit('auth.login', { mode: 'live', role: user.role });
    await dispatch(hydrateWorkspace());
  } catch (error) {
    const failure = error instanceof ApiUnavailableError
      ? Object.assign(new Error('Cannot reach the server. Please check your connection and try again.'), { code: 'unavailable' })
      : error;
    dispatch(authError(failure.message));
    clientAudit('auth.login_failed', { code: failure.code });
    throw failure;
  }
};

/**
 * After a page reload: confirm the stored session with the server before anything is shown or saved.
 * A session that cannot be confirmed is dropped, so the app is never "signed in but offline".
 */
export const restoreSession = () => async (dispatch) => {
  if (!hasSession()) {
    dispatch(signedOut());
    return false;
  }
  try {
    const { data } = await actions.me();
    const user = data?.user || data || {};
    dispatch(sessionLoaded({ user, permissions: user.permissions }));
    await dispatch(hydrateWorkspace());
    return true;
  } catch (error) {
    clearTokens();
    dispatch(signedOut());
    dispatch(loginNoticeSet(error instanceof ApiUnavailableError
      ? 'Cannot reach the server. Please sign in again once it is available.'
      : 'Your session has ended. Please sign in again.'));
    return false;
  }
};

export const signOut = () => async (dispatch, getState) => {
  const mode = getState().auth.mode;
  if (mode === 'live') await actions.logout().catch(() => {});
  clearTokens();
  dispatch(signedOut());
  dispatch(toastPushed('Logged out of workspace session.'));
};

/** Collections a role has no permission to read — never requested. */
const HIDDEN_COLLECTIONS = {
  'SALES AGENT': ['ledger', 'receipts', 'invoices'],
  CUSTOMER: ['customers'],
};

/** Hydrate every collection the UI needs from the API. */
export const hydrateWorkspace = ({ silent = false } = {}) => async (dispatch, getState) => {
  // The platform owner has no business data: their workspace is the tenant list.
  if (getState().auth.role === ROLES.SUPER_ADMIN) {
    await dispatch(loadTenants());
    return;
  }
  if (!silent) dispatch(workspaceLoading());
  try {
    // A role may not be allowed to read every collection (e.g. agents cannot list invoices):
    // a 403 simply means "none for you", never a reason to abandon the whole workspace.
    // Only ask for what this role may read (the API would answer 403 anyway; skipping keeps the
    // console and the server's denied-access log free of noise).
    const forbidden = HIDDEN_COLLECTIONS[getState().auth.role] || [];
    const load = (name, resource) => (forbidden.includes(name) ? Promise.resolve([]) : listAll(resource));
    const [projects, plots, bookings, customers, ledger, receipts, invoices, agents] = await Promise.all([
      load('projects', api.projects), load('plots', api.plots), load('bookings', api.bookings),
      load('customers', api.customers), load('ledger', api.ledger), load('receipts', api.receipts),
      load('invoices', api.invoices), load('agents', api.agents),
    ]);
    dispatch(workspaceHydrated(adaptWorkspace({ projects, plots, bookings, customers, ledger, receipts, invoices, agents })));
    dispatch(usersLoaded([]));                                   // the team list is loaded below for roles allowed to see it
    try { setRemoteSettings((await actions.orgSettings()).data); } catch { /* keep defaults; printing still works */ }
    if (['ADMIN', 'SALES MANAGER'].includes(getState().auth.role)) dispatch(loadUsers());
  } catch (error) {
    // Signed in but the data failed to load: show nothing and say why.
    dispatch(workspaceFailed(error.message));
    dispatch(toastPushed(`Could not load your workspace: ${error.message}`));
  }
};

/** Every page of a collection (the API caps page_size at 200); 403 -> empty for this role. */
const listAll = async (resource) => {
  const rows = [];
  try {
    for (let page = 1; page <= 50; page += 1) {
      const response = await resource.list({ page, page_size: 200 });
      rows.push(...(response.data || []));
      if (!response.meta?.has_next) break;
    }
  } catch (error) {
    if (error?.status === 403) return [];
    throw error;
  }
  return rows;
};

// --------------------------------------------------------------- projects
/** Add a project, or update `editing` (the existing row). Saved locally first, then synced when live. */
export const saveProject = (form, editing = null) => async (dispatch, getState) => {
  const row = projectRowFromForm(form, editing);
  dispatch(projectSaved({ previousName: editing ? editing[0] : null, row }));
  dispatch(toastPushed(editing ? `Project ${row[0]} updated` : `Project ${row[0]} added — now use Add Plots to create its plots so agents can book them`));
  clientAudit(editing ? 'project.updated' : 'project.created', { name: row[0] });
  if (getState().auth.mode !== 'live') return;
  try {
    const response = editing && typeof editing[6] === 'number'
      ? await api.projects.update(editing[6], projectApiPayload(form))
      : await api.projects.create(projectApiPayload(form));
    if (response?.data) dispatch(projectSaved({ previousName: row[0], row: projectFromApi(response.data) }));
  } catch (error) {
    dispatch(toastPushed(`Saved locally — sync failed: ${error.message}`));
  }
};

// ---------------------------------------------- edit / delete (Actions column)
/** Run an API write, then reload the workspace. Resolves '' on success or the server's message. */
const writeThenRefresh = (call, success) => async (dispatch, getState) => {
  if (getState().auth.mode !== 'live') return 'Editing and deleting are available when connected to the server.';
  try {
    await call();
    await dispatch(hydrateWorkspace({ silent: true }));
    dispatch(toastPushed(success));
    return '';
  } catch (error) {
    return error.message || 'The server refused this change.';
  }
};

export const updateCustomerLive = (customer, changes) => writeThenRefresh(
  () => api.customers.update(customer.id, changes), `Customer ${changes.name || customer.name} updated`);
export const deleteCustomerLive = (customer) => writeThenRefresh(
  () => api.customers.remove(customer.id), `Customer ${customer.name} deleted`);
export const updateBookingLive = (booking, changes) => writeThenRefresh(
  () => api.bookings.update(booking[10], changes), `Booking ${booking[0]} updated`);
export const deleteBookingLive = (booking) => writeThenRefresh(
  () => api.bookings.remove(booking[10]), `Booking ${booking[0]} deleted · plot ${booking[3]} is free again`);
export const deleteProjectLive = (project) => writeThenRefresh(
  () => api.projects.remove(project[6]), `Project ${project[0]} deleted`);
export const updatePlotLive = (plot, changes) => writeThenRefresh(
  () => api.plots.update(plot[9], changes), `Plot ${plot[0]} updated`);
export const addPlotsLive = (body, count) => writeThenRefresh(
  () => api.plots.createBulk(body), `${count} plot${count === 1 ? '' : 's'} added — they are now available for booking`);
export const deletePlotLive = (plot) => writeThenRefresh(
  () => api.plots.remove(plot[9]), `Plot ${plot[0]} deleted`);
export const resetUserPasswordLive = (user) => async (dispatch, getState) => {
  if (getState().auth.mode !== 'live' || typeof user.id !== 'number') return 'Password reset is available when connected to the server.';
  try {
    await actions.resetUserPassword(user.id);
    dispatch(toastPushed(`${user.name}'s password was reset to the starting password. They must change it at next sign-in.`));
    return '';
  } catch (error) {
    return error.message || 'Could not reset the password.';
  }
};
export const deleteAgentLive = (agent) => writeThenRefresh(
  () => api.agents.remove(agent.id), `Agent ${agent.name} deleted`);

// --------------------------------------------------------------- bookings
/** Live booking: the server decides the status (approver => confirmed, agent => pending) and the plot hold. */
const createBookingLive = (form) => async (dispatch, getState) => {
  const { domain } = getState();
  const customer = domain.customers.find((c) => c.name === form.customer);
  const plot = domain.plots.find((p) => p[0] === form.plot && p[8] === form.project);
  if (!customer || typeof customer.id !== 'number' || !plot || typeof plot[9] !== 'number') {
    dispatch(toastPushed('Could not book: the customer or plot is no longer available. Refresh and try again.'));
    return;
  }
  try {
    const response = await api.bookings.create({
      customer_id: customer.id, plot_id: plot[9], final_price: parseAmt(form.amount),
      token_amount: parseAmt(form.paid || 0), payment_plan: form.plan,
    });
    const booking = response.data;
    dispatch(modalClosed());
    await dispatch(hydrateWorkspace({ silent: true }));
    dispatch(toastPushed(booking.status === 'CONFIRMED'
      ? `Booking ${booking.booking_number} confirmed · Plot ${form.plot} booked`
      : `Booking ${booking.booking_number} sent to admin for approval · Plot ${form.plot} on hold`));
  } catch (error) {
    dispatch(toastPushed(`Could not create the booking: ${error.message}`));
  }
};

export const createBooking = (form) => (dispatch, getState) => {
  const { auth, domain } = getState();
  if (auth.mode === 'live') return dispatch(createBookingLive(form));
  const approved = auth.role === ROLES.ADMIN;
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
        no: nextReference(getSettings().tax.receiptPrefix || 'RCT', receipts.map((r) => r.no)).replace(/-0*(\d+)$/, (m, n) => `-${String(Math.max(201, Number(n))).padStart(4, '0')}`),
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
    // The API addresses a booking by its numeric id (last-but-one tuple slot), not the BK- number.
    const apiId = typeof booking[10] === 'number' ? booking[10] : booking[0];
    (approved ? actions.approveBooking : actions.rejectBooking)(apiId, { reason: 'Saved from the ERP console' })
      .catch((error) => {
        dispatch(toastPushed(`Could not save the decision: ${error.message}`));
        dispatch(hydrateWorkspace({ silent: true }));   // show what the server really holds
      });
  }
};

// --------------------------------------------------------------- customers
export const createCustomer = (form) => async (dispatch, getState) => {
  const live = getState().auth.mode === 'live';
  if (live) {
    // The server's row (real id, real approval status) is the one the admin sees in Approvals.
    try {
      // A sales agent's own agent profile is applied by the server; only send a code we can resolve.
      const agentCode = (getState().domain.agents || []).find((a) => a[0] === form.agent)?.[1];
      const projectId = getState().domain.projects.find((p) => p[0] === form.project)?.[6];
      const response = await api.customers.create({
        name: form.name, phone: form.mobile, email: form.email, address: form.address,
        ...(agentCode ? { agent_code: agentCode } : {}),
        ...(projectId ? { project_id: projectId } : {}),
      });
      dispatch(rowUpserted({ key: 'customers', row: adaptCustomer(response.data) }));
      dispatch(modalClosed());
      const login = response.data.portal_login || '';
      dispatch(toastPushed(`Customer ${form.name} sent to admin for approval. Portal ${login.startsWith('login created')
        ? 'login created: their e-mail + a starting password (first 4 letters of the name + last 5 digits of the mobile), not displayed.'
        : login || 'login not created.'}`));
    } catch (error) {
      dispatch(toastPushed(`Could not add customer: ${error.message}`));
    }
    return;
  }
  const { customers } = getState().domain;
  const id = nextReference('CUS', customers.map((c) => c.id));
  dispatch(rowUpserted({
    key: 'customers',
    row: { id, ...form, status: 'Pending Approval', createdAt: todayLabel() },
  }));
  dispatch(modalClosed());
  dispatch(toastPushed(`Customer ${form.name} sent to admin for approval`));
};

export const decideCustomer = (customer, status) => (dispatch, getState) => {
  dispatch(rowPatched({ key: 'customers', id: customer.id, changes: { status } }));
  dispatch(toastPushed(`Customer ${customer.name} ${String(status).toLowerCase()}`));
  clientAudit('customer.decision', { id: customer.id, status });
  if (getState().auth.mode === 'live') {
    actions.decideCustomer(customer.id, { status: String(status).toUpperCase(), reason: 'Reviewed in console' })
      .catch((error) => {
        dispatch(toastPushed(`Could not save the decision: ${error.message}`));
        dispatch(hydrateWorkspace({ silent: true }));
      });
  }
};

export const setRegistryStatus = (id, value) => async (dispatch, getState) => {
  if (getState().auth.mode === 'live') {
    // Saved on the server: reaching "Agreement signed" / "Registered" also moves the booking itself.
    const booking = getState().domain.bookings.find((b) => b[0] === id);
    if (!booking || typeof booking[10] !== 'number') {
      dispatch(toastPushed('Could not update the registry: refresh and try again.'));
      return;
    }
    try {
      await actions.setRegistryStage(booking[10], { stage: REGISTRY_CODE[value] });
      await dispatch(hydrateWorkspace({ silent: true }));
      dispatch(toastPushed(`Registry status set to "${value}"`));
    } catch (error) {
      dispatch(toastPushed(`Could not update the registry: ${error.message}`));
    }
    return;
  }
  dispatch(registryStatusSet({ id, value }));
  dispatch(toastPushed(`Registry status set to "${value}"`));
};

export const setFollowUp = (id, value) => (dispatch) => dispatch(followUpSet({ id, value }));

// --------------------------------------------------------------- payments
/** Live payment: the server updates the booking, ledger, plot and issues the numbered receipt. */
const recordPaymentLive = ({ booking, finalPrice, amount, mode, reference, due }) => async (dispatch) => {
  if (typeof booking[10] !== 'number') {
    dispatch(toastPushed('Could not record the payment: this booking is not synced yet. Refresh and try again.'));
    return;
  }
  try {
    const response = await api.payments.create({
      booking_id: booking[10], amount, mode: String(mode).toUpperCase(), reference: reference || undefined,
      final_price: finalPrice, ...(due ? { due_date: due } : {}),
    });
    dispatch(modalClosed());
    await dispatch(hydrateWorkspace({ silent: true }));
    dispatch(toastPushed(response.message || `₹${fmtINR(amount)} recorded for ${booking[1]}`));
  } catch (error) {
    dispatch(toastPushed(`Could not record the payment: ${error.message}`));
  }
};

export const recordPayment = ({ booking, finalPrice, amount, mode, reference, due }) => (dispatch, getState) => {
  if (getState().auth.mode === 'live') return dispatch(recordPaymentLive({ booking, finalPrice, amount, mode, reference, due }));
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
    no: nextReference(getSettings().tax.receiptPrefix || 'RCT', receipts.map((r) => r.no)),
    date: todayLabel(), shared: false, mode, reference: reference || '',
    customer: booking[1], plot: booking[3], project: booking[2],
    finalPrice: fmtINR(finalPrice), amount: fmtINR(amount), balance: fmtINR(Math.max(balance, 0)), agent: booking[8],
  };
  dispatch(rowUpserted({ key: 'receipts', row: receipt }));
  dispatch(modalClosed());
  dispatch(toastPushed(`₹${fmtINR(amount)} recorded for ${booking[1]} · bill ${receipt.no} generated`));
  clientAudit('payment.recorded', { receipt: receipt.no, mode });
  return receipt;
};

/** Manual ledger status (e.g. flag a due instalment as overdue). Settling to PAID goes through Record Payment. */
/** Live: the status (pending / overdue) follows from the next instalment's due date, saved on the server. */
export const setNextDueDate = (payment, isoDate) => async (dispatch) => {
  try {
    const response = await actions.setDueDate(payment[9], isoDate);
    await dispatch(hydrateWorkspace({ silent: true }));
    dispatch(toastPushed(`${payment[0]} · Plot ${payment[1]}: next due date set — now ${String(response.data.status).replace(/_/g, ' ').toLowerCase()}`));
    return '';
  } catch (error) {
    return error.message || 'Could not set the due date.';
  }
};

export const setPaymentStatus = (payment, status) => (dispatch) => {
  dispatch(paymentStatusSet({ customer: payment[0], plot: payment[1], status }));
  dispatch(toastPushed(`${payment[0]} · Plot ${payment[1]} marked ${status.toLowerCase()}`));
  clientAudit('payment.status_changed', { customer: payment[0], plot: payment[1], status });
};

export const markReceiptShared = (receipt) => async (dispatch, getState) => {
  if (getState().auth.mode === 'live' && typeof receipt.id === 'number') {
    // Only the server flag makes the bill visible in the customer's own login.
    try {
      await actions.shareReceipt(receipt.id);
    } catch (error) {
      dispatch(toastPushed(`Could not share the bill: ${error.message}`));
      return;
    }
  }
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
  const due = new Date(Date.now() + (Number(getSettings().tax.dueDays) || 15) * 86400000)
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

/**
 * Manual invoice status change for transitions the API has no endpoint for
 * (flag overdue / reopen). Issue and cancel keep their own audited flows.
 */
export const setInvoiceStatus = (invoice, status) => (dispatch, getState) => {
  const { auth } = getState();
  dispatch(rowPatched({
    key: 'invoices',
    id: invoice.id,
    changes: {
      status,
      history: invoiceHistoryEntry(invoice, status, `Status changed to ${status.replace('_', ' ').toLowerCase()}`,
        auth.currentUser?.name || 'Billing desk'),
    },
  }));
  dispatch(toastPushed(auth.mode === 'live'
    ? `Invoice ${invoice.invoice_number} marked ${status.replace('_', ' ').toLowerCase()} (saved in this browser only)`
    : `Invoice ${invoice.invoice_number} marked ${status.replace('_', ' ').toLowerCase()}`));
  clientAudit('invoice.status_changed', { number: invoice.invoice_number, status });
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
/** API user -> the row the Roles page renders. */
const adaptUser = (u) => ({
  id: u.id, name: u.name, email: u.email, phone: u.phone || '', role: toUiRole(u.role),
  status: u.status ? u.status.charAt(0) + u.status.slice(1).toLowerCase() : '', title: u.title || '',
  agentCode: u.agent_code || '',
});
const toApiRole = (uiRole) => String(uiRole || '').trim().replace(/\s+/g, '_').toUpperCase();

/** My organisation's team (live; only roles allowed to read /users get a list). */
export const loadUsers = () => async (dispatch) => {
  try {
    const rows = await listAll(api.users);
    dispatch(usersLoaded(rows.map(adaptUser)));
  } catch (error) {
    if (error?.status === 403) dispatch(usersLoaded([]));
    else dispatch(toastPushed(`Could not load the team: ${error.message}`));
  }
};

/** Create / edit a team member against the real API; a new member gets a starting password built from their name and mobile (never shown). */
const saveUserLive = (record) => async (dispatch, getState) => {
  const editing = getState().ui.userEdit || getState().ui.editRecord;
  const base = {
    name: record.name, phone: record.phone || undefined, title: record.title || undefined,
    role: toApiRole(record.role), ...(record.agent_code ? { agent_code: record.agent_code.trim().toUpperCase() } : {}),
  };
  try {
    if (editing && typeof editing.id === 'number') {
      await api.users.update(editing.id, { ...base, status: String(record.status || '').toUpperCase() || undefined });
      dispatch(toastPushed(`Team member ${record.name} updated`));
    } else {
      const letters = String(record.name || '').normalize('NFKD').replace(/[^A-Za-z]/g, '');
      if (letters.length < 4) { dispatch(toastPushed('Enter a name with at least four letters — the starting password uses them.')); return; }
      if (!isValidMobile(record.phone)) { dispatch(toastPushed(`${MOBILE_HINT} The starting password uses its last five digits.`)); return; }
      await api.users.create({ ...base, phone: normaliseMobile(record.phone), email: record.email });
      dispatch(toastPushed(`Team member ${record.name} added. Their starting password is the first 4 letters of the name + last 5 digits of the mobile (not displayed); they must change it at first sign-in.`));
    }
    dispatch(modalClosed());
    await dispatch(loadUsers());
  } catch (error) {
    dispatch(toastPushed(`Could not save the team member: ${error.message}`));
  }
};

export const saveRecord = (record) => (dispatch, getState) => {
  const { crudPage, editRecord, modal } = getState().ui;
  if (modal === 'user' && getState().auth.mode === 'live') return dispatch(saveUserLive(record));
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

export const deleteRecord = (record) => async (dispatch, getState) => {
  const { crudPage, page } = getState().ui;
  if (page === 'User & role management') {
    if (getState().auth.mode === 'live' && typeof record.id === 'number') {
      try {
        await api.users.remove(record.id);
        dispatch(toastPushed(`Removed user ${record.name}`));
        await dispatch(loadUsers());
      } catch (error) {
        dispatch(toastPushed(`Could not remove the user: ${error.message}`));
      }
      return;
    }
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

export { sessionFailed };

// ----------------------------------------------------------- notifications
/** Refresh my queue (live only; the API returns just what is addressed to me). */
export const loadNotifications = () => async (dispatch, getState) => {
  if (getState().auth.mode !== 'live' || getState().auth.role === ROLES.SUPER_ADMIN) return;   // platform owner has no queue
  try {
    const response = await actions.notificationQueue();
    dispatch(notificationsLoaded(response.data || []));
  } catch (error) {
    if (error?.status === 403) dispatch(notificationsLoaded([]));   // this role has no queue
  }
};

/** "Take action": log it on the server, then the page navigates to where the work is. */
export const actionNotification = (item) => async (dispatch, getState) => {
  dispatch(notificationPatched({ id: item.id, changes: { is_read: true, actioned_at: new Date().toISOString() } }));
  if (getState().auth.mode === 'live' && typeof item.id === 'number') {
    try { await actions.notificationAction(item.id); } catch { /* the queue reloads from the server next */ }
    dispatch(loadNotifications());
  }
};

/** Change my own password. The server revokes every session, so the user signs in again with the new one. */
export const changeMyPassword = ({ current, next, confirm }) => async (dispatch) => {
  try {
    await actions.changePassword({ current_password: current, new_password: next, confirm_password: confirm });
  } catch (error) {
    return error.message || 'Could not change the password.';
  }
  clearTokens();
  dispatch(signedOut());
  dispatch(loginNoticeSet('Password changed. Please sign in with your new password.'));
  return '';
};
