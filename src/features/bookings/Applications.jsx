import React, { useCallback, useEffect, useState } from 'react';
import { Eye, Plus, Printer, X } from 'lucide-react';
import { api, hasSession } from '../../api';
import { fmtINR, parseAmt } from '../../utils';
import { Table } from '../../components/common/DataTable';
import { Badge } from '../../components/common/Badge';
import { BillModal } from '../documents/PrintSheets';

const MODES = ['UPI', 'NEFT', 'RTGS', 'Cheque', 'Cash', 'Card'];
const TYPES = ['Application Fee + Enrollment', 'Allotment', 'Installment'];
const dayLabel = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

/** An application as the payment receipt prints it: no plot yet, and what the money was for. */
export const asReceipt = (a, customer) => ({
  mobile: customer?.mobile || '', address: customer?.address || '',
  no: a.receipt_number, date: dayLabel(a.received_on), dateTime: dayLabel(a.received_on), customer: a.customer_name || '—',
  project: a.project_name || '—', plot: 'Not specified', amount: fmtINR(Number(a.total)), mode: a.payment_mode, reference: a.reference || '',
  paidTo: a.paid_to || '',
  paymentType: a.payment_type || 'Application Fee + Enrollment',
});

/** Step 1 of a booking: the customer pays the application fee and enrollment fee (no plot yet) and gets a receipt. */
export function ApplicationModal({ customers, projects, defaultProject, close, saved, notify }) {
  const approved = customers.filter((c) => c.status === 'Approved' && typeof c.id === 'number');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    const project = projects.find((p) => p[0] === d.project);
    if (!d.customer) return setError('Select an approved customer first.');
    if (typeof project?.[6] !== 'number') return setError('Select the project.');
    const appFee = parseAmt(d.application_fee || 0);
    const enrolFee = parseAmt(d.enrollment_fee || 0);
    if (appFee + enrolFee <= 0) return setError('Enter the application fee and / or the enrollment fee received.');
    setBusy(true);
    try {
      const response = await api.applications.create({
        customer_id: Number(d.customer), project_id: project[6],
        application_fee: appFee, enrollment_fee: enrolFee,
        payment_type: d.payment_type, payment_mode: d.mode, ...(d.txn ? { reference: d.txn.trim() } : {}), ...(d.paidTo ? { paid_to: d.paidTo.trim() } : {}),
      });
      notify(response.message || 'Application recorded');
      saved(response.data);
      close();
    } catch (err) {
      setError(err.message || 'Could not record the application.');
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal">
        <div className="modal-head">
          <div>
            <span className="modal-kicker">BOOKING · STEP 1</span>
            <h2>New Application</h2>
            <p>The customer pays the application fee and enrollment fee now and gets a receipt. The plot is allotted later (step 2: New Booking).</p>
          </div>
          <button className="modal-close" onClick={close} aria-label="Close"><X size={17} /></button>
        </div>
        <form onSubmit={submit} noValidate>
          <div className="form-grid">
            <label>Customer
              <select name="customer" defaultValue={approved[0]?.id}>
                {approved.length === 0 && <option value="">No approved customers</option>}
                {approved.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.mobile}</option>)}
              </select>
            </label>
            <label>Project
              <select name="project" defaultValue={defaultProject || projects[0]?.[0]}>{projects.map((p) => <option key={p[0]}>{p[0]}</option>)}</select>
            </label>
            <label>Application fee (₹)<input name="application_fee" inputMode="numeric" placeholder="e.g. 500" />
              <small className="field-hint">Not part of the plot price.</small></label>
            <label>Enrollment fee (₹)<input name="enrollment_fee" inputMode="numeric" placeholder="e.g. 5,000" />
              <small className="field-hint">Not part of the plot price.</small></label>
            <label>Payment mode
              <select name="mode" defaultValue="UPI">{MODES.map((m) => <option key={m}>{m}</option>)}</select></label>
            <label>Transaction details<input name="txn" maxLength={80} placeholder="e.g. TXN123456" /></label>
            <label className="span-2">Paid to<input name="paidTo" maxLength={80} list="paid-to-options-app" placeholder="e.g. Company bank account" />
              <datalist id="paid-to-options-app"><option value="Company bank account" /><option value="Office cash" /><option value="Director" /><option value="Agent" /></datalist>
              <small className="field-hint">Who received the money — shown as 'In favour of' on the receipt.</small></label>
            <label className="span-2">Payment type
              <select name="payment_type" defaultValue={TYPES[0]}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
              <small className="field-hint">Shown on the receipt.</small></label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="button button-white" onClick={close}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Receive & issue receipt'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** The "Applications" tab of the Bookings page (the modal that creates one lives on the page itself). */
/** Everything about one application: step 1 receipt, and (once allotted) the booking and its receipts. */
function ApplicationDetail({ application: a, booking, receipts, onPrint, onOpenBill, close }) {
  const booked = a.status !== 'OPEN';
  const row = (label, value) => <div className="kv-row"><span>{label}</span><b>{value || '—'}</b></div>;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal wide">
        <div className="modal-head">
          <div><span className="modal-kicker">APPLICATION · {booked ? 'BOOKED' : 'AWAITING ALLOTMENT'}</span><h2>{a.customer_name}</h2><p>{a.project_name}</p></div>
          <button className="modal-close" onClick={close} aria-label="Close"><X size={17} /></button>
        </div>
        <h3 className="inv2-h">Step 1 — Application</h3>
        <div className="form-grid">
          {row('Received on', dayLabel(a.received_on))}
          {row('Payment mode', a.payment_mode)}
          {row('Application fee', `₹${fmtINR(Number(a.application_fee))}`)}
          {row('Enrollment fee', `₹${fmtINR(Number(a.enrollment_fee))}`)}
          {row('Total received', `₹${fmtINR(Number(a.total))}`)}
          {row('Transaction details', a.reference)}
          {row('Paid to', a.paid_to)}
        </div>
        <p style={{ margin: '8px 0' }}>Receipt <b>{a.receipt_number}</b>{' '}
          <button className="button button-white small-btn" onClick={() => { close(); onPrint(a); }}><Printer size={12} /> View / print</button></p>
        <h3 className="inv2-h">Step 2 — Booking</h3>
        {!booked ? <p className="empty-note">No plot allotted yet.</p> : (
          <>
            {booking ? (
              <div className="form-grid">
                {row('Booking ID', booking[0])}
                {row('Plot', booking[3])}
                {row('Booking date', booking[4])}
                {row('Plan', booking[9])}
                {row('Total price', `₹${booking[5]}`)}
                {row('Paid so far', `₹${booking[6]}`)}
                {row('Status', booking[7])}
                {row('Agent', booking[8])}
              </div>
            ) : row('Booking ID', a.booking_number)}
            <h3 className="inv2-h">Booking receipts</h3>
            {receipts.length === 0 ? <p className="empty-note">{
              !booking ? 'No payment receipt found for this booking.'
                : /pending/i.test(booking[7]) ? 'The booking is waiting for admin approval — the receipt is issued once it is approved.'
                  : parseAmt(booking[6]) <= 0 ? 'No amount was paid at booking, so no receipt yet. Record a payment to get one.'
                    : 'No payment receipt found for this booking.'}</p> : receipts.map((r) => (
              <p key={r.no} style={{ margin: '6px 0' }}><b>{r.no}</b> · {r.date} · ₹{r.amount}{' '}
                <button className="button button-white small-btn" onClick={() => { close(); onOpenBill(r); }}><Printer size={12} /> View / print</button></p>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export function ApplicationsPanel({ project, search, canCreate, onNewApplication, onAllot, reloadKey, onPrint, notify, bookings = [], receipts = [], onOpenBill }) {
  const live = hasSession();
  const [viewed, setViewed] = useState(null);
  const [rows, setRows] = useState(null);

  const load = useCallback(async () => {
    if (!live) { setRows([]); return; }
    try { setRows((await api.applications.list({ page_size: 200 })).data || []); }
    catch (error) { notify(`Could not load applications: ${error.message}`); setRows([]); }
  }, [live, notify]);
  useEffect(() => { load(); }, [load, reloadKey]);
  // A booking made from an application closes it: refresh so it reads Booked, not Allot plot.
  useEffect(() => {
    window.addEventListener('erp:applications-changed', load);
    return () => window.removeEventListener('erp:applications-changed', load);
  }, [load]);

  const needle = search.trim().toLowerCase();
  const shown = (rows || []).filter((a) => (project === 'All projects' || a.project_name === project)
    && (!needle || [a.receipt_number, a.customer_name, a.project_name, a.status, a.reference].join(' ').toLowerCase().includes(needle)));

  return (
    <>
      <div className="panel-head" style={{ padding: '12px 0' }}>
        <div><h2>Applications</h2><p>Application fee and enrollment fee received before a plot is allotted (step 1)</p></div>
        {canCreate && live && <button className="button button-primary small-btn" onClick={onNewApplication}><Plus size={12} /> New Application</button>}
      </div>
      {!live ? <p className="empty-note">Applications are available in the live workspace.</p> : rows === null ? <p className="empty-note">Loading applications…</p> : (
        <Table
          label="applications"
          headers={['RECEIPT NO.', 'DATE', 'CUSTOMER', 'PROJECT', 'APPLICATION FEE', 'ENROLLMENT', 'TOTAL', 'STATUS', 'ACTIONS']}
          empty="No applications yet — click New Booking when a customer pays the application fee and enrollment"
          rows={shown.map((a) => [
            <b>{a.receipt_number}</b>, dayLabel(a.received_on), a.customer_name || '—', a.project_name || '—',
            `₹${fmtINR(Number(a.application_fee))}`, `₹${fmtINR(Number(a.enrollment_fee))}`, <b>₹{fmtINR(Number(a.total))}</b>,
            <div key={`s-${a.id}`}><Badge>{a.status === 'OPEN' ? 'Awaiting allotment' : 'Booked'}</Badge>{a.booking_number && <small className="stage-note">{a.booking_number}</small>}</div>,
            <div className="row-actions" key={a.id}>
              <button className="icon-action" onClick={() => setViewed(a)} title="View application, booking and receipts"><Eye size={14} /></button>
              <button className="icon-action" onClick={() => onPrint(a)} title="View / print receipt"><Printer size={14} /></button>
              {canCreate && a.status === 'OPEN' && (
                <button className="button button-white small-btn" onClick={() => onAllot(a)} title="Allot a plot to this customer (step 2)">Allot plot</button>
              )}
            </div>,
          ])}
        />
      )}
      {viewed && (
        <ApplicationDetail
          application={viewed} close={() => setViewed(null)} onPrint={onPrint} onOpenBill={onOpenBill}
          booking={bookings.find((b) => b[0] === viewed.booking_number)}
          receipts={viewed.booking_number ? receipts.filter((r) => r.bookingNo === viewed.booking_number) : []}
        />
      )}
    </>
  );
}
