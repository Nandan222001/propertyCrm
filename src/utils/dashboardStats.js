/** KPI roll-ups for the dashboards, derived from the tenant's own rows (never hard-coded). */
import { fmtINR, parseAmt } from './money';

/** Bookings that represent real business (pending / rejected / cancelled ones are not revenue). */
const COUNTED = (b) => !['Pending Approval', 'Rejected', 'Cancelled'].includes(b[7]);

/** 12600000 -> { val: '₹1.26', unit: 'Cr' } ; 790000 -> { val: '₹7.9', unit: 'L' } ; 4500 -> { val: '₹4,500', unit: '' } */
export function compactINR(n) {
  const value = Number(n) || 0;
  if (value >= 10000000) return { val: `₹${Number((value / 10000000).toFixed(2))}`, unit: 'Cr' };
  if (value >= 100000) return { val: `₹${Number((value / 100000).toFixed(2))}`, unit: 'L' };
  return { val: `₹${fmtINR(value)}`, unit: '' };
}

const parseBookingDate = (label) => {
  const d = new Date(String(label || ''));
  return Number.isNaN(d.getTime()) ? null : d;
};

export function salesStats(bookings = []) {
  const live = bookings.filter(COUNTED);
  const sales = live.reduce((s, b) => s + parseAmt(b[5]), 0);
  const collected = live.reduce((s, b) => s + parseAmt(b[6]), 0);
  return { sales, collected, pending: Math.max(sales - collected, 0), deals: live.length };
}

const STATUS_ORDER = [
  ['AVAILABLE', 'Available', '#5565dc'],
  ['BOOKED', 'Booked', '#25a879'],
  ['SOLD', 'Sold', '#f59e0b'],
  ['HOLD', 'On hold', '#94a3b8'],
];

export function inventoryStats(plots = []) {
  const total = plots.length;
  const rows = STATUS_ORDER.map(([key, label, color]) => {
    const count = plots.filter((p) => p[5] === key).length;
    return { key, label, color, count, pct: total ? Math.round((count / total) * 100) : 0 };
  });
  // conic-gradient stops, e.g. "#5565dc 0 46%, #25a879 46% 70%, …" (grey ring when empty)
  let at = 0;
  const stops = total
    ? rows.filter((r) => r.count).map((r) => {
      const from = at;
      at += (r.count / total) * 100;
      return `${r.color} ${from}% ${at}%`;
    }).join(', ')
    : '#e6e9ef 0 100%';
  return { total, rows, available: rows[0].count, gradient: `conic-gradient(${stops})` };
}

/** Monthly sales/collection for the last `months` months ending now (bars scale to the max). */
export function monthlySeries(bookings = [], months = 6, now = new Date()) {
  const buckets = Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('en-GB', { month: 'short' }), sales: 0, collected: 0 };
  });
  bookings.filter(COUNTED).forEach((b) => {
    const d = parseBookingDate(b[4]);
    const bucket = d && buckets.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
    if (bucket) { bucket.sales += parseAmt(b[5]); bucket.collected += parseAmt(b[6]); }
  });
  const max = Math.max(...buckets.map((x) => Math.max(x.sales, x.collected)), 0);
  return {
    max,
    buckets: buckets.map((x) => ({
      ...x,
      salesPct: max ? Math.max((x.sales / max) * 100, x.sales ? 4 : 0) : 0,
      collectedPct: max ? Math.max((x.collected / max) * 100, x.collected ? 4 : 0) : 0,
    })),
  };
}

const DAY = 24 * 60 * 60 * 1000;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Sales (bookings, by booking date) and collections (receipts, by receipt date; cancelled payments left out)
 * between `from` and `to`, both days included. Short ranges are bucketed by day, medium ones by week, long ones by month.
 * Without receipts, collections fall back to what each booking has paid so far (on its booking date).
 */
export function rangeSeries(bookings = [], receipts = null, from, to) {
  const start = startOfDay(from);
  const end = startOfDay(to);
  const days = Math.max(Math.round((end - start) / DAY) + 1, 1);
  const unit = days <= 31 ? 'day' : days <= 140 ? 'week' : 'month';

  const buckets = [];
  if (unit === 'month') {
    for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      buckets.push({ at: d, next: new Date(d.getFullYear(), d.getMonth() + 1, 1), label: d.toLocaleDateString('en-GB', { month: 'short' }) });
    }
  } else {
    const step = unit === 'day' ? 1 : 7;
    for (let d = start; d <= end; d = new Date(d.getTime() + step * DAY)) {
      const next = new Date(d.getTime() + step * DAY);
      buckets.push({ at: d, next, label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) });
    }
  }
  const rows = buckets.map((b, i) => ({ ...b, key: `${unit}-${i}`, sales: 0, collected: 0 }));
  const place = (date, field, amount) => {
    if (!date || date < start || date >= new Date(end.getTime() + DAY)) return;
    const bucket = rows.find((r) => date >= r.at && date < r.next);
    if (bucket) bucket[field] += amount;
  };

  bookings.filter(COUNTED).forEach((b) => {
    const d = parseBookingDate(b[4]);
    place(d, 'sales', parseAmt(b[5]));
    if (!receipts) place(d, 'collected', parseAmt(b[6]));
  });
  (receipts || []).filter((r) => !r.cancelled).forEach((r) => place(parseBookingDate(r.date), 'collected', parseAmt(r.amount)));

  const max = Math.max(...rows.map((x) => Math.max(x.sales, x.collected)), 0);
  return {
    max, unit, days,
    buckets: rows.map((x) => ({
      ...x,
      salesPct: max ? Math.max((x.sales / max) * 100, x.sales ? 4 : 0) : 0,
      collectedPct: max ? Math.max((x.collected / max) * 100, x.collected ? 4 : 0) : 0,
    })),
  };
}

/** The ranges offered on the overview chart; `custom` takes the dates the user picks. */
export const CHART_RANGES = ['Last 7 days', 'Last 30 days', 'Last 90 days', 'Last 6 months', 'This year', 'Custom range'];

export function chartRangeDates(range, custom = {}, now = new Date()) {
  const today = startOfDay(now);
  const back = (n) => new Date(today.getTime() - (n - 1) * DAY);
  switch (range) {
    case 'Last 7 days': return [back(7), today];
    case 'Last 30 days': return [back(30), today];
    case 'Last 90 days': return [back(90), today];
    case 'This year': return [new Date(today.getFullYear(), 0, 1), today];
    case 'Custom range': {
      const from = custom.from ? new Date(`${custom.from}T00:00:00`) : null;
      const to = custom.to ? new Date(`${custom.to}T00:00:00`) : null;
      return from && to && from <= to ? [from, to] : null;
    }
    default: return [new Date(today.getFullYear(), today.getMonth() - 5, 1), today];   // Last 6 months
  }
}
