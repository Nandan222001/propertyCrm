import React, { useState, useMemo, useEffect } from 'react';
import {
  LayoutDashboard, Map, ClipboardList, Wallet, Users, Handshake, Percent,
  ChartNoAxesCombined, FolderOpen, Bell, Settings, Shield, Search,
  Download, ChevronDown, ChevronRight, Menu, X, ArrowUpRight, MoreHorizontal,
  CalendarDays, Building2, House, Receipt, FileText, Clock3, CheckCircle2,
  AlertCircle, SlidersHorizontal, Send, Eye, Edit2, LockKeyhole, RefreshCw,
  FileSpreadsheet, MapPin, IndianRupee, Mail, Phone, Activity, Trash2, LogOut,
  Sparkles, Check, CheckCircle, Printer, MessageCircle
} from 'lucide-react';
import { parseAmt, fmtINR, amountInWords, agentKey, todayLabel, openWhatsApp, waLink, isAdmin, canCreateBooking, canApprove, canCreateCustomer, canRecordPayment, canManageBills, isCustomer, isPendingStatus } from '../../utils';

import { api, hasSession } from '../../api';
import { Table } from '../../components/common/DataTable';
import { Badge } from '../../components/common/Badge';
import { Mini } from '../../components/common/StatTile';
import { RoleContextBanner } from '../../components/layout/RoleContextBanner';

export function Payments({ pays, receipts, project, search, filter, F, D, notify, role, onOpenBill, onShare, onRemind, onStatus, onDueDate, onCancelPayment, onEditPayment }) {
  const [dueFor, setDueFor] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [editing, setEditing] = useState(null);
  const [historyFor, setHistoryFor] = useState(null); // ledger row whose payments are being reviewed
  const [view, setView] = useState('ledger');
  const canBill = canManageBills(role);
  const customerView = role === 'CUSTOMER';

  const list = pays.filter(p => {
    const textMatch = p.join(' ').toLowerCase().includes(search.toLowerCase());
    const projMatch = project === 'All projects' || p[2] === project;
    const filterMatch = filter === 'All status' || p[7] === filter.toUpperCase();
    return textMatch && projMatch && filterMatch;
  });
  const bills = receipts.filter(r => r.customer.toLowerCase().includes(search.toLowerCase()) || r.no.toLowerCase().includes(search.toLowerCase()) || r.plot.toLowerCase().includes(search.toLowerCase()));

  // Application fee + enrollment fee are received in step 1 (before any plot is allotted), so they are not in
  // the booking ledger: they get their own cards, following the project filter.
  const [applications, setApplications] = useState([]);
  useEffect(() => {
    if (!hasSession() || customerView) return undefined;
    let live = true;
    const load = () => api.applications.list({ page_size: 200 })
      .then((r) => live && setApplications(r.data || [])).catch(() => {});
    load();
    window.addEventListener('erp:applications-changed', load);
    return () => { live = false; window.removeEventListener('erp:applications-changed', load); };
  }, [customerView]);
  const feeRows = applications.filter((a) => a.status !== 'CANCELLED' && (project === 'All projects' || a.project_name === project));
  // The application fee is never counted on this page: only the enrollment fee adds to the collection.
  const enrollmentFees = feeRows.reduce((s, a) => s + Number(a.enrollment_fee || 0), 0);

  const total = pays.reduce((s, p) => s + parseAmt(p[3]), 0);
  const paid = pays.reduce((s, p) => s + parseAmt(p[4]), 0);
  const overdue = pays.filter(p => p[7] === 'OVERDUE').reduce((s, p) => s + parseAmt(p[5]), 0);

  return (
    <>
      <RoleContextBanner role={role} page="Payments" />

      <div className={`mini-stats ${customerView ? 'four' : 'five'}`}>
        <Mini title="TOTAL BOOKING VALUE" value={`₹${fmtINR(total)}`} />
        <Mini title="COLLECTED TO DATE" value={`₹${fmtINR(paid + (customerView ? 0 : enrollmentFees))}`} color="green-text" />
        <Mini title="PENDING" value={`₹${fmtINR(total - paid)}`} color="indigo-text" />
        <Mini title="OVERDUE" value={`₹${fmtINR(overdue)}`} color="amber-text" />
        {!customerView && <Mini title="ENROLLMENT FEES" value={`₹${fmtINR(enrollmentFees)}`} color="green-text" />}
      </div>

      <div className="panel section-panel">
        <div className="tabs">
          <button className={view === 'ledger' ? 'active' : ''} onClick={() => setView('ledger')}>{customerView ? 'My payments' : 'Ledger'} ({list.length})</button>
          <button className={view === 'bills' ? 'active' : ''} onClick={() => setView('bills')}>Bills &amp; receipts ({receipts.length})</button>
        </div>

        {view === 'ledger' && (
          <>
            <div className="tabs">
              <span className="filter-label">STATUS:</span>
              {['All status', 'PAID', 'PARTIALLY PAID', 'PENDING', 'OVERDUE'].map(s => (
                <button key={s} className={`filter-btn ${filter === s ? 'active' : ''}`} onClick={() => F(s)}>
                  {s}
                </button>
              ))}
            </div>
            <Table
              label="ledgers"
              headers={['CUSTOMER', 'PROJECT & PLOT', 'FINAL PRICE', 'PAID TO DATE', 'PENDING BALANCE', 'NEXT DUE DATE', 'STATUS', customerView ? 'AGENT' : 'ACTIONS']}
              rows={list.map(p => [
                <b>{p[0]}</b>,
                `${p[2]} · ${p[1]}`,
                `₹${p[3]}`,
                <span className="green-text">₹{p[4]}</span>,
                `₹${p[5]}`,
                p[6],
                <Badge>{p[7]}</Badge>,
                customerView ? p[8] : (
                  <div className="row-actions" key={`${p[0]}-${p[1]}`}>
                    {canRecordPayment(role) && p[5] !== '0' && onDueDate && (
                      <button className="icon-action" title="Set next due date" onClick={() => setDueFor(p)}>
                        <CalendarDays size={14} />
                      </button>
                    )}
                    {canRecordPayment(role) && p[5] !== '0' && onStatus && !onDueDate && (
                      <select
                        className="select-mini" value={p[7]} aria-label={`Change status for ${p[0]}`}
                        onChange={(e) => onStatus(p, e.target.value)}
                      >
                        {[...new Set([p[7], 'PENDING', ...(parseAmt(p[4]) > 0 ? ['PARTIALLY PAID'] : []), 'OVERDUE'])]
                          .map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                    {canApprove(role) && onEditPayment && (
                      <button className="icon-action" title="Payments of this booking — edit one if it was entered wrongly" onClick={() => setHistoryFor(p)}>
                        <Edit2 size={14} />
                      </button>
                    )}
                    {p[5] !== '0' && (
                      <button className="icon-action wa-icon" onClick={() => onRemind(p)} title="WhatsApp payment reminder">
                        <MessageCircle size={14} />
                      </button>
                    )}
                  </div>
                )
              ])}
            />
            <div className="table-pagination"><span>Balance updates automatically when a payment is recorded · use Record Payment to mark as paid</span></div>
          </>
        )}

        {view === 'bills' && (
          <>
            <Table
              label="receipts"
              headers={['RECEIPT NO.', 'DATE', 'CUSTOMER', 'PLOT', 'AMOUNT', 'MODE', 'SHARED', 'ACTIONS']}
              rows={bills.map(r => [
                <b>{r.no}</b>,
                r.date,
                r.customer,
                `${r.project} · ${r.plot}`,
                <b>₹{r.amount}</b>,
                r.mode,
                <span key={`s-${r.no}`}>{r.cancelled ? <Badge>CANCELLED</Badge> : <Badge>{r.shared ? 'Shared' : 'Not shared'}</Badge>}</span>,
                <div className="row-actions" key={r.no}>
                  <button className="icon-action" onClick={() => onOpenBill(r)} title="View / print bill (office + customer copy)">
                    <Printer size={14} />
                  </button>
                  {canApprove(role) && onEditPayment && !r.cancelled && typeof r.paymentId === 'number' && (
                    <button className="icon-action" onClick={() => setEditing(r)} title="Edit this payment (correct a mistake)">
                      <Edit2 size={14} />
                    </button>
                  )}
                  {canBill && onCancelPayment && !r.cancelled && typeof r.paymentId === 'number' && (
                    <button className="button button-white small-btn" onClick={() => setCancelling(r)} title="Cancel this payment (entered by mistake)">
                      <X size={12} /> Cancel
                    </button>
                  )}
                  {canBill && !r.cancelled && (
                    <button className="button whatsapp-btn small-btn" onClick={() => onShare(r)} title="Share bill with customer">
                      <MessageCircle size={12} /> Share
                    </button>
                  )}
                </div>
              ])}
            />
            {bills.length === 0 && <p className="empty-note">No bills yet.</p>}
            <div className="table-pagination">
              {customerView ? 'Bills shared with you by the office' : 'Each bill prints with an office copy and a customer copy'}
            </div>
          </>
        )}
      </div>
      {historyFor && (
        <BookingPaymentsModal
          row={historyFor} close={() => setHistoryFor(null)}
          receipts={receipts.filter((r) => r.bookingNo === historyFor[9])}
          onEdit={(r) => { setHistoryFor(null); setEditing(r); }}
        />
      )}
      {editing && <EditPaymentModal receipt={editing} close={() => setEditing(null)} save={onEditPayment} />}
      {cancelling && <CancelPaymentModal receipt={cancelling} close={() => setCancelling(null)} save={onCancelPayment} />}
      {dueFor && <DueDateModal payment={dueFor} close={() => setDueFor(null)} save={onDueDate} />}
    </>
  );
}

/** Every payment taken on one booking (allotment and instalments), each with an Edit button. */
function BookingPaymentsModal({ row, receipts, close, onEdit }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal view-modal">
        <div className="modal-head">
          <div>
            <span className="modal-kicker">PAYMENTS</span>
            <h2>{row[0]} · Plot {row[1]}</h2>
            <p>Allotment and instalments received. Pick one to correct a wrong amount, date or mode.</p>
          </div>
          <button type="button" className="modal-close" onClick={close} aria-label="Close"><X size={16} /></button>
        </div>
        {receipts.length === 0 && <p className="empty-note">No payments yet.</p>}
        <div className="documents-list">
          {receipts.map((r) => (
            <div className="document-row" key={r.no}>
              <div><b>{r.no}</b><small>{r.date} · {r.mode}{r.paymentType ? ` · ${r.paymentType}` : ' · Instalment'}</small></div>
              <b>₹{r.amount}</b>
              {r.cancelled ? <Badge>CANCELLED</Badge> : typeof r.paymentId === 'number' && (
                <button className="button button-white small-btn" onClick={() => onEdit(r)}><Edit2 size={12} /> Edit</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Correct a payment entered with a mistake (amount, mode, cheque details, date, reference). */
function EditPaymentModal({ receipt, close, save }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    amount: String(receipt.rawAmount ?? ''), mode: String(receipt.mode || 'UPI').toUpperCase(),
    received_on: receipt.rawDate || today, reference: receipt.reference || '', paid_to: receipt.paidTo || '',
    bank_name: receipt.bankName || '', instrument_date: receipt.chequeDate || '',
  });
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const cheque = form.mode === 'CHEQUE';
  const submit = async (e) => {
    e.preventDefault();
    if (!(Number(form.amount) > 0)) { setError('Enter an amount greater than zero.'); return; }
    if (cheque && (!form.bank_name.trim() || !form.instrument_date)) { setError('A cheque needs the bank name and the cheque receiving date.'); return; }
    const problem = await save(receipt, {
      amount: form.amount, mode: form.mode, received_on: form.received_on, reference: form.reference.trim() || null,
      paid_to: form.paid_to.trim() || null, ...(cheque ? { bank_name: form.bank_name.trim(), instrument_date: form.instrument_date } : {}),
    });
    if (problem) setError(problem); else close();
  };
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <form className="modal view-modal" onSubmit={submit} noValidate>
        <div className="modal-head">
          <div>
            <span className="modal-kicker">EDIT PAYMENT</span>
            <h2>{receipt.no} · {receipt.customer}</h2>
            <p>{receipt.project} · Plot {receipt.plot}. The balance, receipt and the agent's commission follow the corrected amount.</p>
          </div>
          <button type="button" className="modal-close" onClick={close} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="form-grid">
          <label>Amount (₹)<input type="number" min="1" step="0.01" value={form.amount} onChange={set('amount')} autoFocus /></label>
          <label>Payment date<input type="date" max={today} value={form.received_on} onChange={set('received_on')} /></label>
          <label>Mode
            <select value={form.mode} onChange={set('mode')}>
              {['CASH', 'UPI', 'NEFT', 'RTGS', 'CHEQUE', 'CARD', 'TOKEN_ADVANCE'].map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
            </select>
          </label>
          <label>{cheque ? 'Cheque number' : 'Reference'}<input value={form.reference} onChange={set('reference')} maxLength={80} /></label>
          {cheque && <label>Bank name<input value={form.bank_name} onChange={set('bank_name')} maxLength={80} /></label>}
          {cheque && <label>Cheque receiving date<input type="date" value={form.instrument_date} onChange={set('instrument_date')} /></label>}
          <label>Paid to<input value={form.paid_to} onChange={set('paid_to')} maxLength={80} /></label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-white" onClick={close}>Cancel</button>
          <button type="submit" className="button button-primary">Save changes</button>
        </div>
      </form>
    </div>
  );
}

/** Reverse a payment: needs a reason, and the customer's balance and the agent's commission follow. */
function CancelPaymentModal({ receipt, close, save }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (reason.trim().length < 3) { setError('Say why the payment is being cancelled.'); return; }
    const problem = await save(receipt, reason.trim());
    if (problem) setError(problem); else close();
  };
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <form className="modal view-modal" onSubmit={submit} noValidate>
        <div className="modal-head">
          <div>
            <span className="modal-kicker">CANCEL PAYMENT</span>
            <h2>{receipt.no} · ₹{receipt.amount}</h2>
            <p>{receipt.customer} · {receipt.project} · Plot {receipt.plot}. The amount is added back to the balance and the agent's commission on it is cancelled.</p>
          </div>
          <button type="button" className="modal-close" onClick={close} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="form-grid">
          <label>Reason<input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} autoFocus /></label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-white" onClick={close}>Keep payment</button>
          <button type="submit" className="button button-primary">Cancel payment</button>
        </div>
      </form>
    </div>
  );
}

/** Pick the next instalment's due date; the ledger status (pending / overdue) follows from it. */
function DueDateModal({ payment, close, save }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (!date) { setError('Choose a date.'); return; }
    const problem = await save(payment, date);
    if (problem) setError(problem); else close();
  };
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <form className="modal view-modal" onSubmit={submit} noValidate>
        <div className="modal-head">
          <div>
            <span className="modal-kicker">PAYMENT SCHEDULE</span>
            <h2>Next due date</h2>
            <p>{payment[0]} · Plot {payment[1]} · balance ₹{payment[5]}. A past date makes the instalment overdue.</p>
          </div>
          <button type="button" className="modal-close" onClick={close} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="form-grid">
          <label>Due date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} autoFocus /></label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-white" onClick={close}>Cancel</button>
          <button type="submit" className="button button-primary">Save due date</button>
        </div>
      </form>
    </div>
  );
}
