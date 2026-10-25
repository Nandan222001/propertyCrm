import React from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, MessageCircle, Send, Copy, CheckCircle2 } from 'lucide-react';
import { COMPANY } from '../../data/appConfig';
import { getSettings } from '../../utils/settings';
import { amountInWords, parseAmt, fmtINR } from '../../utils';

// Modal shell. Everything inside `.print-area` is what window.print() outputs.
// Rendered into <body> (not inside <main>) so the print stylesheet can hide the app and still show this.
export function PrintModal({ title, close, actions, children }) {
  const host = typeof document !== 'undefined' ? document.body : null;
  const modal = (
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
  return host ? createPortal(modal, host) : modal;
}

function BillCopy({ receipt, copy }) {
  const amount = parseAmt(receipt.amount);
  const bank = getSettings().bank;
  const money = (value) => `Rs. ${value}`;
  return (
    <section className="bill-copy rc">
      <header className="inv2-head">
        <div>
          <h2>{COMPANY.name}</h2>
          <p>{COMPANY.address}</p>
          <p>Phone: {COMPANY.phone}</p>
        </div>
        <div className="inv2-title">
          <b>PAYMENT RECEIPT</b>
          <span className="inv2-status inv2-paid">{copy}</span>
        </div>
      </header>
      <div className="inv2-boxes">
        <div className="inv2-box">
          <small>RECEIVED FROM</small>
          <b>{receipt.customer}</b>
          <p>{receipt.project} · Plot {receipt.plot}</p>
        </div>
        <div className="inv2-box">
          <small>RECEIPT DETAILS</small>
          <dl>
            <dt>Receipt no.:</dt><dd>{receipt.no}</dd>
            <dt>Date:</dt><dd>{receipt.date}</dd>
            <dt>Payment mode:</dt><dd>{receipt.mode}{receipt.reference ? ` · ${receipt.reference}` : ''}</dd>
          </dl>
        </div>
      </div>
      <table className="inv2-items">
        <thead>
          <tr><th>DESCRIPTION</th><th className="num">AMOUNT</th></tr>
        </thead>
        <tbody>
          <tr><td>Final price (customer)</td><td className="num">{money(receipt.finalPrice)}</td></tr>
          <tr><td>Balance after this payment</td><td className="num">{money(receipt.balance)}</td></tr>
        </tbody>
      </table>
      <div className="inv2-totals-wrap">
        <p className="inv2-words">Received with thanks: <b>{amountInWords(amount)}</b></p>
        <div className="inv2-totals">
          <div className="inv2-grand"><span>AMOUNT RECEIVED</span><span>{money(fmtINR(amount))}</span></div>
        </div>
      </div>
      {bank.bankName && (
        <section className="inv2-section">
          <small>PAY TO</small>
          <p>
            <b>{bank.accountName || COMPANY.name}</b> · {bank.bankName}
            {bank.accountNumber ? ` · A/c ${bank.accountNumber}` : ''}{bank.ifsc ? ` · IFSC ${bank.ifsc}` : ''}{bank.upi ? ` · UPI ${bank.upi}` : ''}
          </p>
        </section>
      )}
      <footer className="inv2-sign">
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

const BOOKING_STATUS_CLASS = {
  confirmed: 'inv2-paid', 'pending approval': 'inv2-partially_paid', agreement: 'inv2-issued',
  cancelled: 'inv2-cancelled', rejected: 'inv2-overdue',
};
const bookingStatusClass = (status) => BOOKING_STATUS_CLASS[String(status).toLowerCase()] || 'inv2-draft';

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
    <div className="booking-sheet inv2">
      <header className="inv2-head">
        <div>
          <h2>{COMPANY.name}</h2>
          <p>{COMPANY.address}</p>
          <p>Phone: {COMPANY.phone} · {COMPANY.email}</p>
        </div>
        <div className="inv2-title">
          <b>PLOT BOOKING FORM</b>
          <span className={`inv2-status ${bookingStatusClass(status)}`}>{status.toUpperCase()}</span>
        </div>
      </header>

      <h3 className="inv2-h">Customer details</h3>
      <table className="inv2-kv">
        <tbody>
          <tr><th>Name</th><td>{name}</td><th>Mobile</th><td>{customer?.mobile || '—'}</td></tr>
          <tr><th>Email</th><td>{customer?.email || '—'}</td><th>Address</th><td>{customer?.address || '—'}</td></tr>
        </tbody>
      </table>

      <h3 className="inv2-h">Property details</h3>
      <table className="inv2-kv">
        <tbody>
          {[0, 2, 4, 6].map(i => (
            <tr key={i}>
              <th>{rows[i][0]}</th><td>{rows[i][1]}</td>
              <th>{rows[i + 1][0]}</th><td>{rows[i + 1][1]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="inv2-h">Price &amp; payment</h3>
      <table className="inv2-kv">
        <tbody>
          <tr><th>Final price</th><td className="inv2-hl">₹{value}</td><th>Paid so far</th><td>₹{paid}</td></tr>
          <tr><th>Balance</th><td>₹{fmtINR(balance)}</td><th>Sales agent</th><td>{agent}</td></tr>
        </tbody>
      </table>
      <p className="inv2-p">Amount in words: <b>{amountInWords(parseAmt(value))}</b></p>

      <h3 className="inv2-h">Terms</h3>
      <ol className="inv2-terms">
        <li>Booking is confirmed only after approval by the company administrator.</li>
        <li>Instalments must be paid on or before the due date against the payment plan above.</li>
        <li>An official receipt (office and customer copy) is issued for every payment received.</li>
        <li>Registry is executed after receipt of the full amount and completion of documents.</li>
      </ol>

      <footer className="inv2-sign three">
        <div><i /> Customer signature</div>
        <div><i /> Sales agent · {agent}</div>
        <div><i /> Authorised signatory</div>
      </footer>
    </div>
  );
}

function LetterSheet({ booking, customer, plot, kind }) {
  const [id, name, project, plotNo, date, value, paid, status, agent, plan] = booking;
  const isAgreement = kind === 'Agreement';
  const balance = parseAmt(value) - parseAmt(paid);
  return (
    <div className="booking-sheet inv2">
      <header className="inv2-head">
        <div>
          <h2>{COMPANY.name}</h2>
          <p>{COMPANY.address}</p>
          <p>Phone: {COMPANY.phone} · {COMPANY.email}</p>
        </div>
        <div className="inv2-title">
          <b>{isAgreement ? 'AGREEMENT TO SALE' : 'PLOT ALLOTMENT LETTER'}</b>
          <span className={`inv2-status ${bookingStatusClass(status)}`}>{status.toUpperCase()}</span>
        </div>
      </header>
      <div className="inv2-boxes">
        <div className="inv2-box">
          <small>ISSUED TO</small>
          <b>{name}</b>
          {customer?.address && <p>{customer.address}</p>}
        </div>
        <div className="inv2-box">
          <small>REFERENCE</small>
          <dl>
            <dt>Booking ID:</dt><dd>{id}</dd>
            <dt>Date:</dt><dd>{date}</dd>
          </dl>
        </div>
      </div>
      <p className="inv2-p">
        Dear <b>{name}</b>,{customer?.address ? <><br />{customer.address}</> : null}
      </p>
      <p className="inv2-p">
        {isAgreement
          ? <>This agreement records the sale of the plot described below by <b>{COMPANY.name}</b> (the Vendor) to <b>{name}</b> (the Purchaser) on the terms set out here.</>
          : <>We are pleased to confirm the allotment of the plot described below in your name, against your booking <b>{id}</b>.</>}
      </p>
      <table className="inv2-kv">
        <tbody>
          <tr><th>Project</th><td>{project}</td><th>Plot number</th><td>{plotNo}</td></tr>
          <tr><th>Layout</th><td>{plot?.[1] || '—'}</td><th>Area (sq.ft)</th><td>{plot?.[2] || '—'}</td></tr>
          <tr><th>Facing</th><td>{plot?.[3] || '—'}</td><th>Payment plan</th><td>{plan || '—'}</td></tr>
          <tr><th>Total consideration</th><td className="inv2-hl">₹{value}</td><th>Received so far</th><td>₹{paid}</td></tr>
          <tr><th>Balance payable</th><td>₹{fmtINR(balance)}</td><th>Sales agent</th><td>{agent}</td></tr>
        </tbody>
      </table>
      <p className="inv2-p">Total consideration in words: <b>{amountInWords(parseAmt(value))}</b></p>
      <h3 className="inv2-h">Terms</h3>
      <ol className="inv2-terms">
        <li>The balance must be paid as per the payment plan; delayed instalments may attract interest.</li>
        <li>Allotment is subject to realisation of funds and may be cancelled on default.</li>
        <li>{isAgreement ? 'Registry will be executed after receipt of the full amount and completion of documents.' : 'Please retain this letter; it must be produced at the time of agreement and registry.'}</li>
      </ol>
      <footer className="inv2-sign three">
        <div><i /> {isAgreement ? 'Purchaser signature' : 'Customer acknowledgement'}</div>
        <div><i /> Sales agent · {agent}</div>
        <div><i /> Authorised signatory</div>
      </footer>
    </div>
  );
}

export function BookingFormModal({ booking, customer, plot, close, onWhatsApp, kind = 'Booking' }) {
  const isLetter = kind === 'Allotment' || kind === 'Agreement';
  return (
    <PrintModal
      title={isLetter ? `${kind === 'Agreement' ? 'Agreement to sale' : 'Allotment letter'} ${booking[0]}` : `Booking form ${booking[0]}`}
      close={close}
      actions={onWhatsApp && (
        <button className="button whatsapp-btn small-btn" onClick={onWhatsApp}>
          <MessageCircle size={13} /> WhatsApp customer
        </button>
      )}
    >
      {isLetter
        ? <LetterSheet booking={booking} customer={customer} plot={plot} kind={kind} />
        : <BookingFormSheet booking={booking} customer={customer} plot={plot} />}
    </PrintModal>
  );
}
