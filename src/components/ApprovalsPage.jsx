import React from 'react';
import { Check, X, MessageCircle, Eye } from 'lucide-react';
import { StatusBadge } from './CustomerViews';

export function ApprovalsPage({ bookings, customers, onApproveBooking, onRejectBooking, onApproveCustomer, onRejectCustomer, onWhatsApp, onPrintBooking }) {
  const pendingBookings = bookings.filter(b => b[7] === 'Pending Approval');
  const pendingCustomers = customers.filter(c => c.status === 'Pending Approval');

  return (
    <>
      <div className="mini-stats four">
        <div className="mini-stat"><small>BOOKINGS AWAITING</small><b className="amber-text">{pendingBookings.length}</b></div>
        <div className="mini-stat"><small>CUSTOMERS AWAITING</small><b className="amber-text">{pendingCustomers.length}</b></div>
      </div>

      <div className="panel section-panel">
        <div className="panel-head"><div><h2>Booking approvals</h2><p>Agent bookings stay on hold until you confirm them.</p></div></div>
        {pendingBookings.length === 0 && <p className="empty-note">No bookings waiting for approval.</p>}
        {pendingBookings.length > 0 && (
          <div className="table-scroll data-table">
            <table>
              <thead><tr><th>BOOKING</th><th>CUSTOMER</th><th>PLOT</th><th>FINAL PRICE</th><th>TOKEN</th><th>AGENT</th><th>ACTIONS</th></tr></thead>
              <tbody>
                {pendingBookings.map(b => (
                  <tr key={b[0]}>
                    <td><b>{b[0]}</b></td><td>{b[1]}</td><td>{b[2]} · {b[3]}</td><td>₹{b[5]}</td><td>₹{b[6]}</td><td>{b[8]}</td>
                    <td>
                      <div className="row-actions">
                        <button className="icon-action" title="Booking form" onClick={() => onPrintBooking(b)}><Eye size={14} /></button>
                        <button className="button button-primary small-btn" onClick={() => onApproveBooking(b)}><Check size={12} /> Approve</button>
                        <button className="button button-white small-btn" onClick={() => onRejectBooking(b)}><X size={12} /> Reject</button>
                        <button className="icon-action wa-icon" title="Notify customer on WhatsApp" onClick={() => onWhatsApp(b)}><MessageCircle size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel section-panel" style={{ marginTop: 14 }}>
        <div className="panel-head"><div><h2>Customer approvals</h2><p>Customers added by agents need approval before they can be booked.</p></div></div>
        {pendingCustomers.length === 0 && <p className="empty-note">No customers waiting for approval.</p>}
        {pendingCustomers.length > 0 && (
          <div className="table-scroll data-table">
            <table>
              <thead><tr><th>CUSTOMER</th><th>MOBILE</th><th>ADDRESS</th><th>ADDED BY</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
              <tbody>
                {pendingCustomers.map(c => (
                  <tr key={c.id}>
                    <td><b>{c.name}</b></td><td>{c.mobile}</td><td>{c.address || '—'}</td><td>{c.agent}</td><td><StatusBadge>{c.status}</StatusBadge></td>
                    <td>
                      <div className="row-actions">
                        <button className="button button-primary small-btn" onClick={() => onApproveCustomer(c)}><Check size={12} /> Approve</button>
                        <button className="button button-white small-btn" onClick={() => onRejectCustomer(c)}><X size={12} /> Reject</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
