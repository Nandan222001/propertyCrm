/**
 * Billing helpers — the client-side mirror of the backend invoice arithmetic
 * (`app/services/billing_service.py::compute_totals`). The server always
 * recomputes totals from the line items; this copy exists purely for the live
 * totals preview in the invoice editor and the demo-mode PDF.
 *
 * Rules (identical to the API):
 *  - line total  = quantity × rate − line discount
 *  - subtotal    = Σ line totals
 *  - taxable     = subtotal − invoice-level discount
 *  - GST         = taxable × gst_rate, split into equal CGST/SGST halves
 *                  (CGST rounds, SGST takes the remainder so they always sum)
 *  - grand total = taxable + GST rounded to the whole rupee (round-off booked)
 */

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const GST_OPTIONS = [
  { label: 'Exempt (0%)', value: 0 },
  { label: 'GST 5%', value: 0.05 },
  { label: 'GST 12%', value: 0.12 },
  { label: 'GST 18%', value: 0.18 },
];

/** Recompute the full totals block from raw item inputs. */
export function computeTotals(items = [], { discount = 0, gstRate = 0.18 } = {}) {
  const safeItems = items.filter((item) => item && String(item.description || '').trim());
  const subtotal = round2(safeItems.reduce(
    (sum, item) => sum + Math.max(
      0, (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0) - (Number(item.discount) || 0),
    ),
    0,
  ));
  const discountAmount = Math.min(Math.max(0, Number(discount) || 0), subtotal);
  const taxableValue = round2(subtotal - discountAmount);
  const rate = Number(gstRate) || 0;
  const gstAmount = round2(taxableValue * rate);
  const cgst = Math.round(gstAmount / 2 * 100) / 100;
  const sgst = round2(gstAmount - cgst);
  const exactTotal = round2(taxableValue + gstAmount);
  const totalAmount = Math.round(exactTotal);
  return {
    subtotal,
    discountAmount,
    taxableValue,
    gstRate: rate,
    gstAmount,
    cgstAmount: cgst,
    sgstAmount: sgst,
    roundOff: round2(totalAmount - exactTotal),
    totalAmount,
    itemCount: safeItems.length,
  };
}

/** Serialise editor rows into the API's item payload. */
export const itemsPayload = (rows) => rows
  .filter((row) => row && String(row.description || '').trim())
  .map((row) => ({
    description: String(row.description).trim(),
    hsn_sac: row.hsn ? String(row.hsn).trim().toUpperCase() : null,
    quantity: Number(row.quantity) || 1,
    unit: (row.unit || 'NOS').trim().toUpperCase() || 'NOS',
    unit_price: Number(row.unitPrice) || 0,
    discount_amount: Number(row.discount) || 0,
  }));

export const INVOICE_STATUSES = ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'];

export const INVOICE_STATUS_LABEL = {
  DRAFT: 'Draft',
  ISSUED: 'Issued',
  PARTIALLY_PAID: 'Partially paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  CANCELLED: 'Cancelled',
};

/** True when a collection can still be recorded against the bill. */
export const isPayableInvoice = (invoice) => ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice?.status);

/** Invoice dates arrive as '2026-09-25' (API) or '25 Sep 2026' (demo seed). */
export function invoiceDate(value) {
  if (!value) return '—';
  if (String(value).includes('-')) {
    const [y, m, d] = String(value).slice(0, 10).split('-');
    if (y && m && d) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${Number(d)} ${months[Number(m) - 1]} ${y}`;
    }
  }
  return String(value);
}

/** Next INV-YYYY-NNNN reference for demo mode (mirrors the API numbering). */
export function nextInvoiceNumber(invoices = []) {
  const year = new Date().getFullYear();
  const highest = invoices.reduce((max, row) => {
    const match = /^INV-(\d{4})-(\d+)$/.exec(row.invoice_number || row.id || '');
    return match && Number(match[1]) === year ? Math.max(max, Number(match[2])) : max;
  }, 100);
  return `INV-${year}-${String(highest + 1).padStart(4, '0')}`;
}
