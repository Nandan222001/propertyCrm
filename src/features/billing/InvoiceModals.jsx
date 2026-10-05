/**
 * Billing modals: the invoice editor (with line items + live totals), the
 * print/preview sheet, the "record collection" dialog and the cancel dialog.
 *
 * The editor computes totals with the same arithmetic as the API
 * (`utils/billing.computeTotals`), so the preview can never drift from what the
 * server stores. The view modal reuses the print-sheet CSS (`.bill-*`) so the
 * on-screen preview and `window.print()` output are identical.
 */
import React, { useMemo, useState } from 'react';
import {
  X, ChevronRight, Plus, Trash2, Download, Send, CheckCircle2, Ban, IndianRupee,
} from 'lucide-react';
import { COMPANY } from '../../data/seedData';
import {
  amountInWords, fmtINR, parseAmt, computeTotals, GST_OPTIONS, invoiceDate,
  INVOICE_STATUS_LABEL, itemsPayload,
} from '../../utils';
import { PrintModal } from '../documents/PrintSheets';

const PAY_MODES = ['UPI', 'NEFT', 'RTGS', 'Cheque', 'Cash', 'Card'];

function Shell({ kicker, title, sub, close, children, wide }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={wide ? 'modal modal-wide' : 'modal'}>
        <div className="modal-head">
          <div>
            <span className="modal-kicker">{kicker}</span>
            <h2>{title}</h2>
            <p>{sub}</p>
          </div>
          <button className="modal-close" onClick={close} aria-label="Close"><X size={17} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const Field = ({ label, children, hint, wide }) => (
  <label className={wide ? 'span-2' : ''}>
    {label}
    {children}
    {hint && <small className="field-hint">{hint}</small>}
  </label>
);

const emptyItem = () => ({ description: '', hsn: '', quantity: '1', unit: 'NOS', unitPrice: '', discount: '0' });

/** Booking options normalised across demo tuples and live API objects. */
export const bookingOptions = (bookings) => bookings
  .filter((b) => {
    const status = Array.isArray(b) ? b[7] : b.status;
    return !['Pending Approval', 'Rejected', 'CANCELLED', 'REJECTED', 'PENDING_APPROVAL'].includes(status);
  })
  .map((b) => (Array.isArray(b)
    ? { id: null, number: b[0], customer: b[1], project: b[2], plot: b[3], agent: b[8], balance: parseAmt(b[5]) - parseAmt(b[6]) }
    : {
      id: b.id, number: b.booking_number, customer: b.customer_name, project: b.project_name,
      plot: b.plot_number, agent: b.agent_name,
      balance: Number(b.final_price || 0) - Number(b.paid_amount || 0),
    }));

/* --------------------------------------------------------- invoice editor */
export function InvoiceFormModal({ bookings, editing, close, save }) {
  const options = useMemo(() => bookingOptions(bookings), [bookings]);
  const [bookingNumber, setBookingNumber] = useState(editing?.booking_number || options[0]?.number || '');
  const booking = options.find((o) => o.number === bookingNumber) || options[0];
  const [gstRate, setGstRate] = useState(String(editing?.gst_rate ?? 0.18));
  const [discount, setDiscount] = useState(String(editing?.discount_amount || 0));
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState(editing?.notes || 'Please quote the invoice number with every payment.');
  const [terms, setTerms] = useState(editing?.terms || 'Payment is due on or before the due date. Interest @ 12% p.a. applies on delayed instalments.');
  const [rows, setRows] = useState(() => {
    if (editing?.items?.length) {
      return editing.items.map((item) => ({
        description: item.description, hsn: item.hsn_sac || '', quantity: String(item.quantity),
        unit: item.unit || 'NOS', unitPrice: String(item.unit_price), discount: String(item.discount_amount || 0),
      }));
    }
    return [
      { ...emptyItem(), description: 'Instalment — plot sale consideration' },
    ];
  });
  const [error, setError] = useState('');

  const totals = computeTotals(rows, { discount: parseAmt(discount), gstRate: Number(gstRate) });

  const setRow = (index, patch) => setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const lineBase = (row) => parseAmt(row.quantity) * parseAmt(row.unitPrice);

  function submit(e) {
    e.preventDefault();
    if (!booking) return setError('Select a booking to bill against.');
    const items = itemsPayload(rows);
    if (!items.length) return setError('Add at least one line item with a description.');
    if (parseAmt(discount) > totals.subtotal) return setError('Invoice discount cannot exceed the subtotal.');
    const badLine = rows.find((row) => row.description.trim() && parseAmt(row.discount) > lineBase(row));
    if (badLine) return setError('A line discount exceeds its quantity × rate.');
    if (totals.totalAmount <= 0) return setError('The invoice must bill more than zero.');
    save({
      booking, bookingNumber: booking.number, items: rows,
      discount: parseAmt(discount), gstRate: Number(gstRate),
      dueDate: dueDate || null, notes: notes.trim() || null, terms: terms.trim() || null, editing,
    });
  }

  return (
    <Shell
      kicker="Lalita ERP · BILLING"
      title={editing ? `Edit draft ${editing.invoice_number}` : 'Raise Tax Invoice'}
      sub="Line items, GST and discounts are computed by the server when the draft is saved."
      close={close}
      wide
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Booking" wide hint={booking ? `${booking.customer} · ${booking.project} · Plot ${booking.plot} · booking balance ₹${fmtINR(booking.balance)}` : undefined}>
            <select value={bookingNumber} onChange={(e) => setBookingNumber(e.target.value)}>
              {options.length === 0 && <option value="">No live bookings</option>}
              {options.map((o) => <option key={o.number} value={o.number}>{o.number} · {o.customer} · Plot {o.plot}</option>)}
            </select>
          </Field>
          <Field label="GST rate">
            <select value={gstRate} onChange={(e) => setGstRate(e.target.value)}>
              {GST_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Invoice discount (₹)" hint="Applied after line discounts">
            <input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="numeric" placeholder="0" />
          </Field>
          <Field label="Payment due date" hint="Defaults to 15 days after issue">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>

        <div className="inv-items-head">
          <b>LINE ITEMS</b>
          <button type="button" className="button button-white small-btn" onClick={() => setRows([...rows, emptyItem()])}>
            <Plus size={12} /> Add line
          </button>
        </div>
        <div className="inv-items">
          {rows.map((row, index) => (
            <div className="inv-item-row" key={index}>
              <input
                className="inv-item-desc" placeholder="Description (e.g. Instalment 3 of 12 — plot sale consideration)"
                value={row.description} onChange={(e) => setRow(index, { description: e.target.value })}
              />
              <input className="inv-item-hsn" placeholder="HSN" value={row.hsn} onChange={(e) => setRow(index, { hsn: e.target.value })} />
              <input className="inv-item-qty" placeholder="Qty" value={row.quantity} onChange={(e) => setRow(index, { quantity: e.target.value })} inputMode="decimal" />
              <input className="inv-item-unit" placeholder="Unit" value={row.unit} onChange={(e) => setRow(index, { unit: e.target.value })} />
              <input className="inv-item-rate" placeholder="Rate ₹" value={row.unitPrice} onChange={(e) => setRow(index, { unitPrice: e.target.value })} inputMode="numeric" />
              <input className="inv-item-disc" placeholder="Disc ₹" value={row.discount} onChange={(e) => setRow(index, { discount: e.target.value })} inputMode="numeric" />
              <span className="inv-item-total">₹{fmtINR(Math.max(0, lineBase(row) - parseAmt(row.discount)))}</span>
              <button
                type="button" className="icon-action" title="Remove line"
                onClick={() => setRows(rows.length === 1 ? [emptyItem()] : rows.filter((_, i) => i !== index))}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        <div className="inv-totals-preview">
          <div className="inv-totals-rows">
            <span>Subtotal</span><b>₹{fmtINR(totals.subtotal)}</b>
            {totals.discountAmount > 0 && (<><span>Less: discount</span><b>- ₹{fmtINR(totals.discountAmount)}</b></>)}
            <span>Taxable value</span><b>₹{fmtINR(totals.taxableValue)}</b>
            {totals.gstAmount > 0 && (
              <>
                <span>CGST</span><b>₹{fmtINR(totals.cgstAmount)}</b>
                <span>SGST</span><b>₹{fmtINR(totals.sgstAmount)}</b>
              </>
            )}
            {totals.roundOff !== 0 && (<><span>Round off</span><b>{totals.roundOff > 0 ? '+' : '-'} ₹{fmtINR(Math.abs(totals.roundOff))}</b></>)}
            <span className="inv-grand">TOTAL PAYABLE</span>
            <b className="inv-grand">₹{fmtINR(totals.totalAmount)}</b>
          </div>
          <p className="inv-words">{amountInWords(totals.totalAmount)}</p>
        </div>

        <div className="form-grid">
          <Field label="Notes (printed on the bill)"><input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <Field label="Terms (printed on the bill)"><input value={terms} onChange={(e) => setTerms(e.target.value)} /></Field>
        </div>

        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-white" onClick={close}>Cancel</button>
          <button type="submit" className="button button-primary">
            {editing ? 'Save Draft' : 'Save Draft Invoice'} <ChevronRight size={14} />
          </button>
        </div>
      </form>
    </Shell>
  );
}

/* ------------------------------------------------------------ record payment */
export function InvoicePayModal({ invoice, close, save }) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const balance = Number(invoice.balance_amount) || 0;
  const after = Math.max(balance - parseAmt(amount), 0);

  function submit(e) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    if (parseAmt(amount) <= 0) return setError('Enter the amount received.');
    if (parseAmt(amount) > balance) return setError(`Amount exceeds the invoice balance of ₹${fmtINR(balance)}.`);
    save({ amount: parseAmt(amount), mode: d.mode, reference: d.reference });
  }

  return (
    <Shell
      kicker="Lalita ERP · BILLING"
      title={`Collect against ${invoice.invoice_number}`}
      sub={`${invoice.customer_name} · total ₹${fmtINR(invoice.total_amount)} · the collection also updates the booking ledger and issues a receipt.`}
      close={close}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Invoice balance (₹)"><input value={fmtINR(balance)} readOnly /></Field>
          <Field label="Amount received now (₹)">
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="50,000" autoFocus />
          </Field>
          <Field label="Balance after this collection (₹)"><input value={fmtINR(after)} readOnly /></Field>
          <Field label="Payment mode">
            <select name="mode" defaultValue="UPI">{PAY_MODES.map((mode) => <option key={mode}>{mode}</option>)}</select>
          </Field>
          <Field label="Reference / UTR / cheque no." wide><input name="reference" placeholder="TXN123456" /></Field>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-white" onClick={close}>Cancel</button>
          <button type="submit" className="button button-primary"><IndianRupee size={13} /> Record Collection</button>
        </div>
      </form>
    </Shell>
  );
}

/* ------------------------------------------------------------------ cancel */
export function InvoiceCancelModal({ invoice, close, save }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const paid = Number(invoice.amount_paid) || 0;

  function submit(e) {
    e.preventDefault();
    if (reason.trim().length < 3) return setError('Give a reason (min 3 characters) — it is stored on the audit trail.');
    save(reason.trim());
  }

  return (
    <Shell
      kicker="Lalita ERP · BILLING"
      title={`Cancel ${invoice.invoice_number}`}
      sub="Only unpaid invoices can be cancelled. The reason is printed on the bill and kept in the timeline."
      close={close}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label={`Reason for cancelling (collected so far: ₹${fmtINR(paid)})`} wide>
            <input
              value={reason} onChange={(e) => setReason(e.target.value)} autoFocus
              placeholder="Raised against the wrong booking"
            />
          </Field>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-white" onClick={close}>Keep invoice</button>
          <button type="submit" className="button button-danger"><Ban size={13} /> Cancel Invoice</button>
        </div>
      </form>
    </Shell>
  );
}

/* -------------------------------------------------------------- view/print */
function InvoiceSheet({ invoice, customer }) {
  const items = invoice.items || [];
  const statusLabel = INVOICE_STATUS_LABEL[invoice.status] || invoice.status;
  return (
    <div className="bill-sheet invoice-sheet">
      <header className="bill-head">
        <div>
          <h2>{COMPANY.name}</h2>
          <p>{COMPANY.address} · GSTIN {COMPANY.gstin}</p>
          <p>{COMPANY.phone} · {COMPANY.email}</p>
        </div>
        <div className="bill-copy-tag">{statusLabel.toUpperCase()}</div>
      </header>
      <div className="bill-title">TAX INVOICE</div>

      <div className="inv-meta-grid">
        <table className="bill-table">
          <tbody>
            <tr><th>Billed to</th><td><b>{invoice.customer_name}</b></td></tr>
            <tr><th>Contact</th><td>{customer?.mobile ? `${customer.mobile} · ` : ''}{customer?.email || '—'}</td></tr>
            <tr><th>Address</th><td>{customer?.address || '—'}</td></tr>
          </tbody>
        </table>
        <table className="bill-table">
          <tbody>
            <tr><th>Invoice no.</th><td><b>{invoice.invoice_number}</b></td></tr>
            <tr><th>Issue date</th><td>{invoiceDate(invoice.issue_date)}</td></tr>
            <tr><th>Due date</th><td>{invoice.due_date ? invoiceDate(invoice.due_date) : '—'}</td></tr>
            <tr><th>Booking</th><td>{invoice.booking_number || '—'}</td></tr>
          </tbody>
        </table>
      </div>

      <table className="bill-table inv-items-table">
        <thead>
          <tr>
            <th>#</th><th className="inv-col-desc">Description</th><th>HSN/SAC</th>
            <th className="inv-col-num">Qty</th><th className="inv-col-num">Rate</th>
            <th className="inv-col-num">Disc</th><th className="inv-col-num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.id || index}>
              <td>{index + 1}</td>
              <td>{item.description}</td>
              <td>{item.hsn_sac || '—'}</td>
              <td className="inv-col-num">{fmtINR(item.quantity)} {item.unit}</td>
              <td className="inv-col-num">₹{fmtINR(item.unit_price)}</td>
              <td className="inv-col-num">{Number(item.discount_amount) > 0 ? `₹${fmtINR(item.discount_amount)}` : '—'}</td>
              <td className="inv-col-num"><b>₹{fmtINR(item.line_total)}</b></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="inv-totals-block">
        <div className="inv-totals-rows">
          <span>Subtotal</span><b>₹{fmtINR(invoice.subtotal)}</b>
          {Number(invoice.discount_amount) > 0 && (<><span>Less: discount</span><b>- ₹{fmtINR(invoice.discount_amount)}</b></>)}
          <span>Taxable value</span><b>₹{fmtINR(invoice.taxable_value)}</b>
          {Number(invoice.gst_rate) > 0 && (
            <>
              <span>CGST @ {Number(invoice.gst_rate) / 2 * 100}%</span><b>₹{fmtINR(invoice.cgst_amount)}</b>
              <span>SGST @ {Number(invoice.gst_rate) / 2 * 100}%</span><b>₹{fmtINR(invoice.sgst_amount)}</b>
            </>
          )}
          {Number(invoice.round_off) !== 0 && (<><span>Round off</span><b>₹{fmtINR(invoice.round_off)}</b></>)}
          <span className="inv-grand">TOTAL PAYABLE</span><b className="inv-grand">₹{fmtINR(invoice.total_amount)}</b>
          {Number(invoice.amount_paid) > 0 && (
            <>
              <span>Paid to date</span><b>₹{fmtINR(invoice.amount_paid)}</b>
              <span>Balance due</span><b>₹{fmtINR(invoice.balance_amount)}</b>
            </>
          )}
        </div>
      </div>
      <p className="bill-words">Amount in words: <b>{amountInWords(invoice.total_amount)}</b></p>

      {(invoice.history || []).length > 0 && (
        <>
          <h3 className="sheet-h">Lifecycle</h3>
          <table className="bill-table">
            <tbody>
              {(invoice.history || []).slice(0, 6).map((entry, index) => (
                <tr key={entry.id || index}>
                  <th>{INVOICE_STATUS_LABEL[entry.to_status] || entry.to_status}</th>
                  <td>{entry.reason || '—'}{entry.changed_by_label ? ` · by ${entry.changed_by_label}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {(invoice.notes || invoice.terms) && (
        <>
          <h3 className="sheet-h">Notes &amp; terms</h3>
          {invoice.notes && <p className="bill-words">{invoice.notes}</p>}
          {invoice.terms && <ol className="sheet-terms"><li>{invoice.terms}</li></ol>}
        </>
      )}
      {invoice.status === 'CANCELLED' && invoice.cancellation_reason && (
        <p className="bill-words"><b>CANCELLED — {invoice.cancellation_reason}</b></p>
      )}

      <footer className="bill-sign three">
        <div><i /> Customer signature</div>
        <div><i /> Sales agent{invoice.agent_name ? ` · ${invoice.agent_name}` : ''}</div>
        <div><i /> Authorised signatory</div>
      </footer>
    </div>
  );
}

export function InvoiceViewModal({ invoice, customer, close, onPdf, onShare, canShare }) {
  return (
    <PrintModal
      title={`Invoice ${invoice.invoice_number}`}
      close={close}
      actions={(
        <>
          <button className="button button-white small-btn" onClick={onPdf}>
            <Download size={13} /> Download PDF
          </button>
          {canShare && (
            <button className="button whatsapp-btn small-btn" onClick={onShare}>
              {invoice.is_shared_with_customer ? <CheckCircle2 size={13} /> : <Send size={13} />}
              {invoice.is_shared_with_customer ? 'Shared · resend' : 'Share with customer'}
            </button>
          )}
        </>
      )}
    >
      <InvoiceSheet invoice={invoice} customer={customer} />
    </PrintModal>
  );
}
