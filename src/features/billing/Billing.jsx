/**
 * Billing desk — the invoice book for the ERP.
 *
 * Everything is driven through callbacks (`onIssue`, `onPay`, `onPdf`, …) that
 * App.jsx binds to thunks, so this page stays presentational like the other
 * feature pages. KPI tiles come from the `summary` selector; rows are the
 * API-shaped invoice objects (demo seed and live backend share the schema).
 */
import React, { useMemo, useState } from 'react';
import {
  Plus, Send, Printer, Download, MessageCircle, Edit2, Ban,
  IndianRupee, FileText,
} from 'lucide-react';

import { Table } from '../../components/common/DataTable';
import { Badge } from '../../components/common/Badge';
import { Mini } from '../../components/common/StatTile';
import { RoleContextBanner } from '../../components/layout/RoleContextBanner';
import {
  fmtINR, invoiceDate, INVOICE_STATUS_LABEL, isPayableInvoice,
  canCreateInvoice, canCancelInvoice, canIssueInvoice, canManageBills, canPayInvoice,
} from '../../utils';
import {
  InvoiceFormModal, InvoicePayModal, InvoiceCancelModal, InvoiceViewModal,
} from './InvoiceModals';

const STATUS_TONE = {
  DRAFT: 'grey', ISSUED: 'indigo', PARTIALLY_PAID: 'amber',
  PAID: 'green', OVERDUE: 'red', CANCELLED: 'grey',
};

export function Billing({
  invoices, bookings, customers, summary, project, search, filter, F, notify, role,
  onCreate, onEdit, onIssue, onCancel, onPay, onPdf, onShare, onWhatsApp,
}) {
  const canBill = canCreateInvoice(role);
  const canShare = canManageBills(role);
  const [editing, setEditing] = useState(null);      // InvoiceFormModal (create when null)
  const [paying, setPaying] = useState(null);        // InvoicePayModal
  const [cancelling, setCancelling] = useState(null); // InvoiceCancelModal
  const [viewing, setViewing] = useState(null);      // InvoiceViewModal

  const list = useMemo(() => invoices.filter((inv) => {
    const haystack = [
      inv.invoice_number, inv.customer_name, inv.project_name, inv.plot_number,
      inv.booking_number, inv.status,
    ].join(' ').toLowerCase();
    const textMatch = haystack.includes(search.toLowerCase());
    const projMatch = project === 'All projects' || inv.project_name === project;
    const filterMatch = filter === 'All status' || inv.status === filter;
    return textMatch && projMatch && filterMatch;
  }), [invoices, search, project, filter]);

  const customerFor = (name) => customers.find((c) => c.name === name);

  const rowActions = (inv) => {
    const payable = isPayableInvoice(inv);
    const draft = inv.status === 'DRAFT';
    return (
      <div className="row-actions" key={inv.invoice_number}>
        <button className="icon-action" onClick={() => setViewing(inv)} title="View / print tax invoice">
          <Printer size={14} />
        </button>
        <button className="icon-action" onClick={() => onPdf(inv)} title="Download PDF bill">
          <Download size={14} />
        </button>
        {canShare && (
          <button
            className="icon-action wa-icon" title="Share bill on WhatsApp"
            onClick={() => onShare(inv)}
          >
            <MessageCircle size={14} />
          </button>
        )}
        {draft && canBill && (
          <button className="icon-action" onClick={() => setEditing(inv)} title="Edit draft">
            <Edit2 size={14} />
          </button>
        )}
        {draft && canIssueInvoice(role) && (
          <button className="button button-primary small-btn" onClick={() => onIssue(inv)}>
            <Send size={12} /> Issue
          </button>
        )}
        {payable && canPayInvoice(role) && (
          <button className="button button-primary small-btn" onClick={() => setPaying(inv)}>
            <IndianRupee size={12} /> Collect
          </button>
        )}
        {!['PAID', 'CANCELLED'].includes(inv.status) && canCancelInvoice(role) && Number(inv.amount_paid) === 0 && (
          <button className="icon-action danger" onClick={() => setCancelling(inv)} title="Cancel invoice">
            <Ban size={14} />
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <RoleContextBanner role={role} page="Billing" />

      <div className="mini-stats four">
        <Mini title="TOTAL BILLED" value={`₹${fmtINR(summary.billed)}`} />
        <Mini title="COLLECTED" value={`₹${fmtINR(summary.collected)}`} color="green-text" />
        <Mini title="OUTSTANDING" value={`₹${fmtINR(summary.outstanding)}`} color="indigo-text" />
        <Mini title="OVERDUE" value={`₹${fmtINR(summary.overdue)}`} color="amber-text" />
      </div>

      <div className="panel section-panel">
        <div className="tabs">
          <button className="active">Invoices ({list.length})</button>
          {canBill && (
            <button
              className="button button-primary small-btn" style={{ marginLeft: 'auto' }}
              onClick={() => setEditing({ __new: true })}
            >
              <Plus size={12} /> Raise Invoice
            </button>
          )}
        </div>

        <div className="tabs">
          <span className="filter-label">STATUS:</span>
          {['All status', 'DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'].map((status) => (
            <button key={status} className={`filter-btn ${filter === status ? 'active' : ''}`} onClick={() => F(status)}>
              {status === 'All status' ? status : INVOICE_STATUS_LABEL[status] || status}
            </button>
          ))}
        </div>

        <Table
          headers={['INVOICE', 'CUSTOMER', 'PROJECT · PLOT', 'ISSUED / DUE', 'TOTAL', 'PAID', 'BALANCE', 'STATUS', 'ACTIONS']}
          rows={list.map((inv) => [
            <div key={`${inv.invoice_number}-no`}>
              <b>{inv.invoice_number}</b>
              <div className="cell-sub">{inv.items?.length || 0} item{(inv.items?.length || 0) === 1 ? '' : 's'}{Number(inv.gst_rate) > 0 ? ` · GST ${Number(inv.gst_rate) * 100}%` : ''}</div>
            </div>,
            <div key={`${inv.invoice_number}-cust`}>
              <b>{inv.customer_name}</b>
              <div className="cell-sub">{inv.booking_number}</div>
            </div>,
            <span key={`${inv.invoice_number}-proj`}>{inv.project_name || '—'} · {inv.plot_number || '—'}</span>,
            <span key={`${inv.invoice_number}-dates`}>
              {invoiceDate(inv.issue_date)}
              <div className="cell-sub">{inv.due_date ? `due ${invoiceDate(inv.due_date)}` : 'no due date'}</div>
            </span>,
            <b key={`${inv.invoice_number}-total`}>₹{fmtINR(inv.total_amount)}</b>,
            <span className="green-text" key={`${inv.invoice_number}-paid`}>₹{fmtINR(inv.amount_paid)}</span>,
            inv.status === 'OVERDUE'
              ? <span className="amber-text" key={`${inv.invoice_number}-bal`}><b>₹{fmtINR(inv.balance_amount)}</b></span>
              : <span key={`${inv.invoice_number}-bal`}>₹{fmtINR(inv.balance_amount)}</span>,
            <Badge tone={STATUS_TONE[inv.status]} key={`${inv.invoice_number}-status`}>
              {INVOICE_STATUS_LABEL[inv.status] || inv.status}
            </Badge>,
            rowActions(inv),
          ])}
        />

        {list.length === 0 && (
          <div className="empty-note">
            <FileText size={16} /> No invoices match this view yet.
            {canBill && ' Use "Raise Invoice" to bill an instalment or service charge against a booking.'}
          </div>
        )}
        <div className="table-pagination">
          Showing {list.length} of {invoices.length} invoices
          <span>Every collection against a bill flows into the payments ledger and issues a numbered receipt</span>
        </div>
      </div>

      {/* ------------------------------------------------------ modals */}
      {editing && (
        <InvoiceFormModal
          bookings={bookings}
          editing={editing.__new ? null : editing}
          close={() => setEditing(null)}
          save={(form) => { setEditing(null); onCreate(form); }}
        />
      )}
      {paying && (
        <InvoicePayModal
          invoice={paying}
          close={() => setPaying(null)}
          save={(payment) => { const inv = paying; setPaying(null); onPay(inv, payment); }}
        />
      )}
      {cancelling && (
        <InvoiceCancelModal
          invoice={cancelling}
          close={() => setCancelling(null)}
          save={(reason) => { const inv = cancelling; setCancelling(null); onCancel(inv, reason); }}
        />
      )}
      {viewing && (
        <InvoiceViewModal
          invoice={viewing}
          customer={customerFor(viewing.customer_name)}
          close={() => setViewing(null)}
          onPdf={() => onPdf(viewing)}
          onShare={() => onShare(viewing)}
          canShare={canShare}
        />
      )}
    </>
  );
}
