/**
 * A customer's document list = their booking documents and receipts, plus the receipt of every application
 * (application fee + enrollment, taken before any booking). Cancelled applications are left out; newest first.
 * `documents` is the list the Documents page already has; `applications` are the customer's rows from the API.
 */
const dayLabel = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const when = (doc) => { const t = Date.parse(doc.date); return Number.isNaN(t) ? 0 : t; };

export function withApplicationReceipts(documents = [], applications = []) {
  const own = applications.filter((a) => a.status !== 'CANCELLED').map((a) => ({
    key: `app-${a.id}`, title: `Receipt ${a.receipt_number}`, kind: 'Receipt', date: dayLabel(a.received_on), application: a,
    sub: `${a.project_name} · ₹${Number(a.total).toLocaleString('en-IN', { maximumFractionDigits: 2 })} · application fee + enrollment`,
  }));
  if (!own.length) return documents;
  return [...documents, ...own].sort((a, b) => when(b) - when(a));
}
