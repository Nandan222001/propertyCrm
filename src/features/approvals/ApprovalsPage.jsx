import React, { useEffect, useState } from 'react';
import { Check, X, MessageCircle, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { StatusBadge } from '../customers/CustomerViews';

const PAGE_SIZE = 10;
const PENDING = 'Pending Approval';
const REJECTED = 'Rejected';

/** Pending first, then everything already decided (kept visible with its mark). */
const pendingFirst = (rows, statusOf) => [
  ...rows.filter((r) => statusOf(r) === PENDING),
  ...rows.filter((r) => statusOf(r) !== PENDING),
];

/** Booking status after review: Rejected stays Rejected, any other decided state reads as Approved. */
const bookingDecision = (status) => (status === REJECTED ? REJECTED : 'Approved');

function usePaged(rows) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  useEffect(() => { if (page > pages) setPage(pages); }, [page, pages]);
  const current = Math.min(page, pages);
  const start = (current - 1) * PAGE_SIZE;
  return { rows: rows.slice(start, start + PAGE_SIZE), page: current, pages, total: rows.length, start, setPage };
}

function Pager({ paged, label }) {
  if (paged.total <= PAGE_SIZE) {
    return <div className="table-pagination">Showing {paged.total} {label}</div>;
  }
  const end = Math.min(paged.start + PAGE_SIZE, paged.total);
  return (
    <div className="table-pagination" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span>Showing {paged.start + 1}–{end} of {paged.total} {label}</span>
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="icon-action" aria-label="Previous page" disabled={paged.page === 1} onClick={() => paged.setPage(paged.page - 1)}><ChevronLeft size={14} /></button>
        Page {paged.page} of {paged.pages}
        <button className="icon-action" aria-label="Next page" disabled={paged.page === paged.pages} onClick={() => paged.setPage(paged.page + 1)}><ChevronRight size={14} /></button>
      </span>
    </div>
  );
}

export function ApprovalsPage({ bookings, customers, onApproveBooking, onRejectBooking, onApproveCustomer, onRejectCustomer, onWhatsApp, onPrintBooking }) {
  const pendingBookings = bookings.filter(b => b[7] === PENDING);
  const pendingCustomers = customers.filter(c => c.status === PENDING);
  const [tab, setTab] = useState('bookings');
  const bookingPaged = usePaged(pendingFirst(bookings, (b) => b[7]));
  const customerPaged = usePaged(pendingFirst(customers, (c) => c.status));

  return (
    <>
      <div className="mini-stats four">
        <div className="mini-stat"><small>BOOKINGS AWAITING</small><b className="amber-text">{pendingBookings.length}</b></div>
        <div className="mini-stat"><small>CUSTOMERS AWAITING</small><b className="amber-text">{pendingCustomers.length}</b></div>
      </div>

      <div className="panel section-panel" style={{ paddingTop: 0, paddingBottom: 0, minHeight: 0 }}>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'bookings'} className={tab === 'bookings' ? 'selected' : ''} onClick={() => setTab('bookings')}>
            Booking approvals ({pendingBookings.length} pending)
          </button>
          <button role="tab" aria-selected={tab === 'customers'} className={tab === 'customers' ? 'selected' : ''} onClick={() => setTab('customers')}>
            Customer approvals ({pendingCustomers.length} pending)
          </button>
        </div>
      </div>

      {tab === 'bookings' && (
      <div className="panel section-panel" style={{ marginTop: 14, minHeight: 0 }}>
        <div className="panel-head"><div><h2>Booking approvals</h2><p>Agent bookings stay on hold until you confirm them. Reviewed bookings remain here with their status.</p></div></div>
        {bookings.length === 0 && <p className="empty-note">No bookings to review.</p>}
        {bookings.length > 0 && (
          <div className="table-scroll data-table">
            <table>
              <thead><tr><th>BOOKING</th><th>CUSTOMER</th><th>PLOT</th><th>FINAL PRICE</th><th>TOKEN</th><th>AGENT</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
              <tbody>
                {bookingPaged.rows.map(b => (
                  <tr key={b[0]}>
                    <td><b>{b[0]}</b></td><td>{b[1]}</td><td>{b[2]} · {b[3]}</td><td>₹{b[5]}</td><td>₹{b[6]}</td><td>{b[8]}</td>
                    <td>
                      {b[7] === PENDING
                        ? <StatusBadge>{PENDING}</StatusBadge>
                        : <StatusBadge>{bookingDecision(b[7])}</StatusBadge>}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="icon-action" title="Booking form" onClick={() => onPrintBooking(b)}><Eye size={14} /></button>
                        {b[7] === PENDING && (
                          <>
                            <button className="button button-primary small-btn" onClick={() => onApproveBooking(b)}><Check size={12} /> Approve</button>
                            <button className="button button-white small-btn" onClick={() => onRejectBooking(b)}><X size={12} /> Reject</button>
                          </>
                        )}
                        <button className="icon-action wa-icon" title="Notify customer on WhatsApp" onClick={() => onWhatsApp(b)}><MessageCircle size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {bookings.length > 0 && <Pager paged={bookingPaged} label="bookings" />}
      </div>
      )}

      {tab === 'customers' && (
      <div className="panel section-panel" style={{ marginTop: 14, minHeight: 0 }}>
        <div className="panel-head"><div><h2>Customer approvals</h2><p>Customers added by agents need approval before they can be booked.</p></div></div>
        {customers.length === 0 && <p className="empty-note">No customers to review.</p>}
        {customers.length > 0 && (
          <div className="table-scroll data-table">
            <table>
              <thead><tr><th>CUSTOMER</th><th>MOBILE</th><th>ADDRESS</th><th>ADDED BY</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
              <tbody>
                {customerPaged.rows.map(c => (
                  <tr key={c.id}>
                    <td><b>{c.name}</b></td><td>{c.mobile}</td><td>{c.address || '—'}</td><td>{c.agent}</td><td><StatusBadge>{c.status}</StatusBadge></td>
                    <td>
                      {c.status === PENDING ? (
                        <div className="row-actions">
                          <button className="button button-primary small-btn" onClick={() => onApproveCustomer(c)}><Check size={12} /> Approve</button>
                          <button className="button button-white small-btn" onClick={() => onRejectCustomer(c)}><X size={12} /> Reject</button>
                        </div>
                      ) : <small>{c.status === REJECTED ? 'Rejected' : '✓ Approved'}</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {customers.length > 0 && <Pager paged={customerPaged} label="customers" />}
      </div>
      )}
    </>
  );
}
