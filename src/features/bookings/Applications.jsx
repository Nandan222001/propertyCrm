import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Printer, X } from 'lucide-react';
import { api, hasSession } from '../../api';
import { fmtINR, parseAmt } from '../../utils';
import { Table } from '../../components/common/DataTable';
import { Badge } from '../../components/common/Badge';
import { BillModal } from '../documents/PrintSheets';

const MODES = ['UPI', 'NEFT', 'RTGS', 'Cheque', 'Cash', 'Card'];
const dayLabel = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

/** An application as the payment receipt prints it: no plot yet, and what the money was for. */
export const asReceipt = (a) => ({
  no: a.receipt_number, date: dayLabel(a.received_on), dateTime: dayLabel(a.received_on), customer: a.customer_name || '—',
  project: a.project_name || '—', plot: 'Not specified', amount: fmtINR(Number(a.total)), mode: a.payment_mode, reference: a.reference || '',
  paidTo: a.paid_to || '',
  paymentType: [Number(a.application_fee) > 0 && `Application Fee ₹${fmtINR(Number(a.application_fee))}`, Number(a.enrollment_fee) > 0 && `Enrollment ₹${fmtINR(Number(a.enrollment_fee))}`].filter(Boolean).join(' + '),
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
    if (parseAmt(d.application_fee || 0) + parseAmt(d.enrollment_fee || 0) <= 0) return setError('Enter the application fee and / or the enrollment fee received.');
    setBusy(true);
    try {
      const response = await api.applications.create({
        customer_id: Number(d.customer), project_id: project[6],
        application_fee: parseAmt(d.application_fee || 0), enrollment_fee: parseAmt(d.enrollment_fee || 0),
        payment_mode: d.mode, ...(d.txn ? { reference: d.txn.trim() } : {}), ...(d.paidTo ? { paid_to: d.paidTo.trim() } : {}),
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
export function ApplicationsPanel({ project, search, canCreate, onNewApplication, onAllot, reloadKey, onPrint, notify }) {
  const live = hasSession();
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
              <button className="icon-action" onClick={() => onPrint(a)} title="View / print receipt"><Printer size={14} /></button>
              {canCreate && a.status === 'OPEN' && (
                <button className="button button-white small-btn" onClick={() => onAllot(a)} title="Allot a plot to this customer (step 2)">Allot plot</button>
              )}
            </div>,
          ])}
        />
      )}
    </>
  );
}
