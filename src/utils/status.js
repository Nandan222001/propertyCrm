/** Status vocabulary shared by bookings, plots, customers and payments. */

export const BOOKING_STATUS = {
  PENDING: 'Pending Approval',
  CONFIRMED: 'Confirmed',
  AGREEMENT: 'Agreement',
  REGISTERED: 'Registered',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export const PLOT_STATUS = {
  AVAILABLE: 'AVAILABLE',
  HOLD: 'HOLD',
  BOOKED: 'BOOKED',
  SOLD: 'SOLD',
  COMPANY_HOLD: 'COMPANY_HOLD',   // kept back by the company: not for sale, cannot be booked
};

/** Plot status as shown to people ("COMPANY_HOLD" -> "Company Hold"). */
export const plotStatusLabel = (status) => (status === PLOT_STATUS.COMPANY_HOLD ? 'Company Hold' : status);

export const CUSTOMER_STATUS = {
  PENDING: 'Pending Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

export const PAYMENT_STATUS = {
  PAID: 'PAID',
  PARTIAL: 'PARTIALLY PAID',
  PENDING: 'PENDING',
};

export const isPendingStatus = (s) => String(s).toLowerCase() === 'pending approval';
export const isConfirmedStatus = (s) => ['confirmed', 'agreement', 'registered'].includes(String(s).toLowerCase());

/** Tailwind-free tone lookup so every StatusBadge/Table cell colours the same. */
export function toneForStatus(status) {
  const s = String(status || '').toLowerCase();
  if (['confirmed', 'approved', 'paid', 'sold', 'registered', 'active'].some((k) => s.includes(k))) return 'green';
  if (['pending', 'hold', 'partially'].some((k) => s.includes(k))) return 'amber';
  if (['rejected', 'cancelled', 'overdue'].some((k) => s.includes(k))) return 'red';
  if (['booked', 'agreement'].some((k) => s.includes(k))) return 'indigo';
  return 'grey';
}
