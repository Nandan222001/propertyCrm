/**
 * Money helpers — the single place that formats or parses Indian currency.
 * Mirrors the backend contract in `app/utils/money.py`.
 */

/** Parse "₹18,40,000" / "1840000" / 1840000 into a Number (0 when unusable). */
export const parseAmt = (v) => Number(String(v ?? '0').replace(/[^0-9.]/g, '')) || 0;

/** 1840000 -> "18,40,000" (Indian digit grouping, no symbol). */
export const fmtINR = (n) => Math.round(Number(n) || 0).toLocaleString('en-IN');

/** 1840000 -> "₹18,40,000". */
export const inr = (n) => `₹${fmtINR(n)}`;

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const below100 = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);
const below1000 = (n) => (n >= 100
  ? `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${below100(n % 100)}` : ''}`
  : below100(n));

/** 1840000 -> "Eighteen Lakh Forty Thousand Rupees Only" (printed on receipts). */
export function amountInWords(value) {
  let n = Math.round(Number(value) || 0);
  if (n === 0) return 'Zero Rupees Only';
  const parts = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(`${below1000(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (n) parts.push(below1000(n));
  return `${parts.join(' ')} Rupees Only`;
}

/** Percentage of a value, clamped to 0-100 — used by every progress bar. */
export const pct = (value, total) => (total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0);
