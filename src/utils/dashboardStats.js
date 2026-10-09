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
