import React from 'react';
import { fmtINR } from '../../utils';

const money = (v) => `₹${fmtINR(Math.round(Number(v) * 100) / 100)}`;
const dateLabel = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

/**
 * What a payment scheme works out to on a plot, laid out the way a brochure does:
 * the price, what is paid at booking, the discount, and the dated instalments.
 */
export function PlanBreakdown({ quote }) {
  if (!quote) return null;
  const lines = quote.schedule || [];
  return (
    <div className="plan-breakdown">
      <dl className="plan-summary">
        <div><dt>Plot price</dt><dd>{money(quote.price)}</dd></div>
        {Number(quote.application_fee) > 0 && <div><dt>Application fee (extra)</dt><dd>{money(quote.application_fee)}</dd></div>}
        {Number(quote.enrollment_fee) > 0 && <div><dt>Enrollment</dt><dd>{money(quote.enrollment_fee)}</dd></div>}
        {Number(quote.allotment_amount) > 0 && <div><dt>Allotment amount</dt><dd>{money(quote.allotment_amount)}</dd></div>}
        <div><dt>Balance to pay</dt><dd>{money(quote.balance)}</dd></div>
        {Number(quote.discount_amount) > 0 && <div className="good"><dt>Discount ({Number(quote.discount_percent)}% of balance)</dt><dd>− {money(quote.discount_amount)}</dd></div>}
        <div className="total"><dt>Total payable</dt><dd>{money(quote.total_payable)}</dd></div>
        <div><dt>Due at booking</dt><dd>{money(quote.upfront_total)}</dd></div>
      </dl>
      <p className="muted-text plan-count">Complete payment schedule · {lines.length} payments</p>
      <div className="table-scroll plan-schedule-scroll">
        <table className="data-table plan-schedule">
          <thead><tr><th>#</th><th>PAYMENT</th><th>DUE</th><th>AMOUNT</th></tr></thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.sequence}><td>{line.sequence}</td><td>{line.label}</td><td>{dateLabel(line.due_date)}</td><td><b>{money(line.amount)}</b></td></tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={3}><b>Total payable</b></td><td><b>{money(quote.total_payable)}</b></td></tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
