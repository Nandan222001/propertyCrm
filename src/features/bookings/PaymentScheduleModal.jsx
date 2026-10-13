import React, { useEffect, useState } from 'react';
import { ModalShell } from '../../components/common/ModalShell';
import { Badge } from '../../components/common/Badge';
import { actions } from '../../api';
import { fmtINR } from '../../utils';

const money = (v) => `₹${fmtINR(Math.round(Number(v) * 100) / 100)}`;
const dateLabel = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const STATUS = { PAID: 'Paid', PARTIAL: 'Part paid', OVERDUE: 'Overdue', PENDING: 'Upcoming' };

/** The dated payment schedule of one booking (from the payment scheme chosen at booking) and how much is paid. */
export function PaymentScheduleModal({ booking, close }) {
  const [lines, setLines] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    actions.bookingSchedule(booking[10])
      .then((r) => { if (live) setLines(r.data || []); })
      .catch((e) => { if (live) { setError(e.message); setLines([]); } });
    return () => { live = false; };
  }, [booking]);

  const total = (lines || []).reduce((t, l) => t + Number(l.amount), 0);
  const paid = (lines || []).reduce((t, l) => t + Number(l.paid_amount), 0);
  const next = (lines || []).find((l) => l.status !== 'PAID');
  return (
    <ModalShell title={`Payment schedule · ${booking[0]}`} subtitle={`${booking[1]} · ${booking[2]} · Plot ${booking[3]}${booking[9] && booking[9] !== '—' ? ` · ${booking[9]}` : ''}`} onClose={close} wide>
      {lines === null && <p className="empty-note">Loading…</p>}
      {error && <p className="form-error">{error}</p>}
      {lines && lines.length === 0 && !error && (
        <p className="empty-note">This booking has no instalment schedule — it was made before payment schemes, or the project has none. It is simply paid up to the final price of {booking[5] ? `₹${booking[5]}` : 'the booking'}.</p>
      )}
      {lines && lines.length > 0 && (
        <>
          <dl className="plan-summary">
            <div><dt>Total payable</dt><dd>{money(total)}</dd></div>
            <div className="good"><dt>Paid so far</dt><dd>{money(paid)}</dd></div>
            <div><dt>Still to pay</dt><dd>{money(total - paid)}</dd></div>
            <div className="total"><dt>Next due</dt><dd>{next ? `${dateLabel(next.due_date)} · ${money(Number(next.amount) - Number(next.paid_amount))}` : 'All paid'}</dd></div>
          </dl>
          <div className="table-scroll plan-schedule-scroll">
            <table className="data-table plan-schedule">
              <thead><tr><th>#</th><th>PAYMENT</th><th>DUE</th><th>AMOUNT</th><th>PAID</th><th>STATUS</th></tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.sequence}</td><td>{l.label}</td><td>{dateLabel(l.due_date)}</td><td><b>{money(l.amount)}</b></td>
                    <td>{Number(l.paid_amount) > 0 ? money(l.paid_amount) : '—'}</td><td><Badge>{STATUS[l.status] || l.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="modal-actions"><button type="button" className="button button-white" onClick={close}>Close</button></div>
    </ModalShell>
  );
}
