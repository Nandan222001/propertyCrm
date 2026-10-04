import React from 'react';
import { Printer, X, MessageCircle, Send, Copy, CheckCircle2 } from 'lucide-react';
import { COMPANY } from '../../data/seedData';
import { amountInWords, parseAmt, fmtINR } from '../../utils';

// Modal shell. Everything inside `.print-area` is what window.print() outputs.
export function PrintModal({ title, close, actions, children }) {
  return (
    <div className="modal-backdrop print-backdrop" onMouseDown={e => e.target === e.currentTarget && close()}>
      <div className="print-modal">
        <div className="print-toolbar no-print">
          <b>{title}</b>
          <div className="print-toolbar-actions">
            {actions}
            <button className="button button-primary small-btn" onClick={() => window.print()}>
              <Printer size={13} /> Print
            </button>
            <button className="modal-close" onClick={close} aria-label="Close"><X size={16} /></button>
          </div>
        </div>
        <div className="print-area">{children}</div>
      </div>
    </div>
  );
}

function BillCopy({ receipt, copy }) {
  const amount = parseAmt(receipt.amount);
  return (
    <section className="bill-copy">
      <header className="bill-head">
        <div>
          <h2>{COMPANY.name}</h2>
          <p>{COMPANY.address} · {COMPANY.phone}</p>
        </div>
        <div className="bill-copy-tag">{copy}</div>
      </header>
      <div className="bill-title">PAYMENT RECEIPT</div>
      <div className="bill-meta">
        <div><span>Receipt No.</span><b>{receipt.no}</b></div>
        <div><span>Date</span><b>{receipt.date}</b></div>
        <div><span>Payment mode</span><b>{receipt.mode}{receipt.reference ? ` · ${receipt.reference}` : ''}</b></div>
      </div>
      <table className="bill-table">
        <tbody>
          <tr><th>Received from</th><td>{receipt.customer}</td></tr>
          <tr><th>Project · Plot</th><td>{receipt.project} · Plot {receipt.plot}</td></tr>
          <tr><th>Final price (customer)</th><td>₹{receipt.finalPrice}</td></tr>
          <tr><th>Amount received now</th><td className="bill-amount">₹{fmtINR(amount)}</td></tr>
          <tr><th>Balance after this payment</th><td>₹{receipt.balance}</td></tr>
        </tbody>
      </table>
      <p className="bill-words">Received with thanks: <b>{amountInWords(amount)}</b></p>
      <footer className="bill-sign">
        <div><i /> Customer signature</div>
        <div><i /> Authorised signatory{receipt.agent ? ` · Agent ${receipt.agent}` : ''}</div>
      </footer>
    </section>
  );
}

// Both copies on one A4: office copy on top, customer copy below.
export function BillSheet({ receipt }) {
  return (
    <div className="bill-sheet">
      <BillCopy receipt={receipt} copy="OFFICE COPY" />
      <div className="bill-cut">✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</div>
      <BillCopy receipt={receipt} copy="CUSTOMER COPY" />
    </div>
  );
}

export function BillModal({ receipt, close, onShare, onCopy, shared }) {
  return (
    <PrintModal
      title={`Bill ${receipt.no}`}
      close={close}
      actions={onShare && (
        <>
          <button className="button button-white small-btn" onClick={onCopy}>
            <Copy size={13} /> Copy text
          </button>
          <button className="button whatsapp-btn small-btn" onClick={onShare}>
            {shared ? <CheckCircle2 size={13} /> : <Send size={13} />}
            {shared ? 'Shared · resend on WhatsApp' : 'Share with customer'}
          </button>
        </>
      )}
    >
      <BillSheet receipt={receipt} />
    </PrintModal>
  );
}

export function BookingFormSheet({ booking, customer, plot }) {
  const [id, name, project, plotNo, date, value, paid, status, agent, plan] = booking;
  const balance = parseAmt(value) - parseAmt(paid);
  const rows = [
    ['Booking ID', id], ['Booking date', date],
    ['Project', project], ['Plot number', plotNo],
    ['Layout', plot?.[1] || '—'], ['Area (sq.ft)', plot?.[2] || '—'],
    ['Facing', plot?.[3] || '—'], ['Payment plan', plan || '—']
  ];
  return (
    <div className="booking-sheet">
      <header className="bill-head">
        <div>
          <h2>{COMPANY.name}</h2>
          <p>{COMPANY.address} · {COMPANY.phone} · {COMPANY.email}</p>
        </div>
        <div className="bill-copy-tag">{status.toUpperCase()}</div>
      </header>
      <div className="bill-title">PLOT BOOKING FORM</div>

      <h3 className="sheet-h">Customer details</h3>
      <table className="bill-table">
        <tbody>
          <tr><th>Name</th><td>{name}</td><th>Mobile</th><td>{customer?.mobile || '—'}</td></tr>
          <tr><th>Email</th><td>{customer?.email || '—'}</td><th>Address</th><td>{customer?.address || '—'}</td></tr>
        </tbody>
      </table>

      <h3 className="sheet-h">Property details</h3>
      <table className="bill-table">
        <tbody>
          {[0, 2, 4, 6].map(i => (
            <tr key={i}>
              <th>{rows[i][0]}</th><td>{rows[i][1]}</td>
              <th>{rows[i + 1][0]}</th><td>{rows[i + 1][1]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="sheet-h">Price &amp; payment</h3>
      <table className="bill-table">
        <tbody>
          <tr><th>Final price</th><td className="bill-amount">₹{value}</td><th>Paid so far</th><td>₹{paid}</td></tr>
          <tr><th>Balance</th><td>₹{fmtINR(balance)}</td><th>Sales agent</th><td>{agent}</td></tr>
        </tbody>
      </table>
      <p className="bill-words">Amount in words: <b>{amountInWords(parseAmt(value))}</b></p>

      <h3 className="sheet-h">Terms</h3>
      <ol className="sheet-terms">
        <li>Booking is confirmed only after approval by the company administrator.</li>
        <li>Instalments must be paid on or before the due date against the payment plan above.</li>
        <li>An official receipt (office and customer copy) is issued for every payment received.</li>
        <li>Registry is executed after receipt of the full amount and completion of documents.</li>
      </ol>

      <footer className="bill-sign three">
        <div><i /> Customer signature</div>
        <div><i /> Sales agent · {agent}</div>
        <div><i /> Authorised signatory</div>
      </footer>
    </div>
  );
}

export function BookingFormModal({ booking, customer, plot, close, onWhatsApp }) {
  return (
    <PrintModal
      title={`Booking form ${booking[0]}`}
      close={close}
      actions={onWhatsApp && (
        <button className="button whatsapp-btn small-btn" onClick={onWhatsApp}>
          <MessageCircle size={13} /> WhatsApp customer
        </button>
      )}
    >
      <BookingFormSheet booking={booking} customer={customer} plot={plot} />
    </PrintModal>
  );
}
