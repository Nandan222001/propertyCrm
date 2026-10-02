// Shared helpers: money, names, permissions, WhatsApp links.

export const parseAmt = (v) => Number(String(v ?? '0').replace(/[^0-9.]/g, '')) || 0;
export const fmtINR = (n) => Math.round(Number(n) || 0).toLocaleString('en-IN');

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const below100 = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);
const below1000 = (n) => (n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${below100(n % 100)}` : ''}` : below100(n));

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

// "Sanjay Patel" -> "S. Patel" (agent name as used in booking/payment rows)
export function agentKey(fullName = '') {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  return `${parts[0][0].toUpperCase()}. ${parts[parts.length - 1]}`;
}

// ---- permissions -------------------------------------------------------
const ADMINS = ['ADMIN', 'SUPER ADMIN'];
export const isAdmin = (role) => ADMINS.includes(role);
export const canCreateBooking = (role) => isAdmin(role) || role === 'SALES AGENT';
export const canApprove = (role) => isAdmin(role);
export const canCreateCustomer = (role) => role === 'SALES AGENT';
export const canRecordPayment = (role) => isAdmin(role) || role === 'ACCOUNTS';
export const canManageBills = (role) => isAdmin(role) || role === 'ACCOUNTS';
export const isCustomer = (role) => role === 'CUSTOMER';

export const isPendingStatus = (s) => String(s).toLowerCase() === 'pending approval';

// ---- WhatsApp (click-to-chat deep link; no Business API) ---------------
export function waLink(phone, text) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function openWhatsApp(phone, text) {
  window.open(waLink(phone, text), '_blank', 'noopener,noreferrer');
}

export const todayLabel = () =>
  new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
