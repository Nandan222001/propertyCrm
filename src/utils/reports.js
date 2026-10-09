/** Report builders — each returns { filename, headers, rows } from live store data. */
import { parseAmt } from './index';

export const REPORT_PERIODS = ['All time', 'This month', 'Last month', 'This quarter', 'Financial year 2026-27'];

/** "28 Sep 2026" -> Date (null when the cell is a dash or unparseable). */
export const parseRowDate = (value) => {
  const date = new Date(String(value || '').replace(/(\d{2}) (\w{3}) (\d{4})/, '$1 $2 $3'));
  return Number.isNaN(date.getTime()) ? null : date;
};

export function periodRange(period, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (period) {
    case 'This month': return [new Date(y, m, 1), new Date(y, m + 1, 1)];
    case 'Last month': return [new Date(y, m - 1, 1), new Date(y, m, 1)];
    case 'This quarter': { const q = Math.floor(m / 3) * 3; return [new Date(y, q, 1), new Date(y, q + 3, 1)]; }
    case 'Financial year 2026-27': return [new Date(2026, 3, 1), new Date(2027, 3, 1)];
    default: return null;
  }
}

const inPeriod = (value, range) => {
  if (!range) return true;
  const date = parseRowDate(value);
  return Boolean(date) && date >= range[0] && date < range[1];
};

const inProject = (name, project) => project === 'All projects' || name === project;

const bucketFor = (days) => (days <= 0 ? 'Not due' : days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+');

export function buildReport(key, data, { period = 'All time', project = 'All projects', tdsRate = 5, now = new Date() } = {}) {
  const range = periodRange(period, now);
  const stamp = now.toISOString().slice(0, 10);

  if (key === 'sales') {
    const rows = data.bookings
      .filter((b) => inProject(b[2], project) && inPeriod(b[4], range))
      .map((b) => [b[0], b[1], b[2], b[3], b[4], b[5], b[6], parseAmt(b[5]) - parseAmt(b[6]), b[7], b[8], b[9] || '']);
    return {
      filename: `sales-booking-velocity-${stamp}`,
      headers: ['Booking ID', 'Customer', 'Project', 'Plot', 'Date', 'Value', 'Paid', 'Balance', 'Status', 'Agent', 'Payment plan'],
      rows,
    };
  }

  if (key === 'accounts') {
    const rows = data.payments
      .filter((p) => inProject(p[2], project) && parseAmt(p[5]) > 0)
      .map((p) => {
        const due = parseRowDate(p[6]);
        const days = due ? Math.floor((now - due) / 86400000) : 0;
        return [p[0], p[2], p[1], p[3], p[4], p[5], p[6], p[7], Math.max(days, 0), bucketFor(due ? days : 0), p[8]];
      });
    return {
      filename: `accounts-receivable-aging-${stamp}`,
      headers: ['Customer', 'Project', 'Plot', 'Final price', 'Paid', 'Balance', 'Next due', 'Status', 'Days overdue', 'Aging bucket', 'Agent'],
      rows,
    };
  }

  if (key === 'inventory') {
    const byProject = new Map();
    data.plots.filter((p) => inProject(p[8], project)).forEach((p) => {
      const row = byProject.get(p[8]) || { AVAILABLE: 0, HOLD: 0, BOOKED: 0, SOLD: 0, total: 0 };
      row[p[5]] = (row[p[5]] || 0) + 1;
      row.total += 1;
      byProject.set(p[8], row);
    });
    const rows = [...byProject.entries()].map(([name, r]) => [
      name, r.total, r.SOLD, r.BOOKED, r.HOLD, r.AVAILABLE,
      r.total ? `${Math.round(((r.SOLD + r.BOOKED) / r.total) * 100)}%` : '0%',
    ]);
    return {
      filename: `project-inventory-absorption-${stamp}`,
      headers: ['Project', 'Total plots', 'Sold', 'Booked', 'On hold', 'Available', 'Absorption'],
      rows,
    };
  }

  // tax: TDS & commission payroll
  const rows = data.commissions
    .filter((c) => inProject(c[1], project))
    .map((c) => {
      const amount = parseAmt(c[5]);
      const tds = Math.round(amount * (Number(tdsRate) / 100));
      return [c[0], c[1], c[2], c[3], c[4], amount, `${tdsRate}%`, tds, amount - tds, c[6]];
    });
  return {
    filename: `tds-commission-payroll-${stamp}`,
    headers: ['Agent', 'Project', 'Plot', 'Deal value', 'Slab', 'Commission', 'TDS rate', 'TDS withheld', 'Net payable', 'Status'],
    rows,
  };
}
