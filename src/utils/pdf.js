/**
 * Minimal, dependency-free PDF writer for tax invoices (demo / offline mode).
 *
 * When the backend is reachable the app downloads the reportlab-rendered PDF
 * from `GET /invoices/{id}/pdf`; this module produces the same A4 tax invoice
 * locally so the "Download PDF" action also works in the offline demo. It
 * writes PDF 1.4 with the core Helvetica fonts (WinAnsiEncoding) — text,
 * rectangles and hairlines only, which is exactly what an invoice needs.
 *
 * Layout mirrors `backend/app/services/invoice_pdf.py`.
 */

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 42;

const INK = [0.13, 0.15, 0.24];
const MUTED = [0.42, 0.46, 0.55];
const ACCENT = [0.16, 0.24, 0.58];
const LINE = [0.85, 0.87, 0.91];
const ZEBRA = [0.96, 0.97, 0.99];
const PANEL = [0.976, 0.98, 0.992];
const STRIP = [0.992, 0.949, 0.902];
const WHITE = [1, 1, 1];

const STATUS_COLORS = {
  DRAFT: [0.42, 0.46, 0.55],
  ISSUED: [0.13, 0.45, 0.85],
  PARTIALLY_PAID: [0.85, 0.56, 0.08],
  PAID: [0.05, 0.59, 0.32],
  OVERDUE: [0.8, 0.2, 0.24],
  CANCELLED: [0.55, 0.57, 0.62],
};

/* --- Helvetica metrics (widths per 1000 units, ASCII 32..126) ------------- */
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722,
  667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556,
  556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500,
  722, 500, 500, 500, 334, 260, 334, 584];
const HELV_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975,
  722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722,
  667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611,
  556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556,
  778, 556, 556, 500, 389, 280, 389, 584];

const WINANSI_MAP = { 0x2013: 0x96, 0x2014: 0x97, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95 };

/** Width of `text` at `size` in the chosen font (PDF user units). */
export function measureText(text, size = 9, bold = false) {
  const widths = bold ? HELV_BOLD : HELV;
  let total = 0;
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    total += code >= 32 && code <= 126 ? widths[code - 32] : 556;
  }
  return (total / 1000) * size;
}

const esc = (text) => String(text).replace(/[\\()]/g, (ch) => `\\${ch}`);
const fmt = (n) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(n) || 0);
const rupees = (n) => `Rs. ${fmt(n)}`;

/**
 * WinAnsi-safe text: the rupee sign is not in the core-font encoding, so it is
 * spelled out (the statutory convention on printed Indian invoices anyway).
 */
const pdfSafe = (text) => String(text ?? '').replace(/₹\s?/g, 'Rs. ');

/* --- content-stream painter ------------------------------------------------ */
class Painter {
  constructor() {
    this.ops = [];
    this.y = PAGE_H - MARGIN;
  }

  text(x, y, str, { size = 9, color = INK, bold = false, align = 'left' } = {}) {
    const value = pdfSafe(str);
    let tx = x;
    if (align === 'right') tx = x - measureText(value, size, bold);
    if (align === 'center') tx = x - measureText(value, size, bold) / 2;
    this.ops.push(
      `${color[0]} ${color[1]} ${color[2]} rg`,
      `BT /${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${tx.toFixed(2)} ${y.toFixed(2)} Tm (${esc(value)}) Tj ET`,
    );
  }

  rect(x, y, w, h, { fill = null, stroke = null, radius = 0 } = {}) {
    const parts = [];
    if (fill) parts.push(`${fill[0]} ${fill[1]} ${fill[2]} rg`);
    if (stroke) parts.push(`${stroke[0]} ${stroke[1]} ${stroke[2]} RG 0.7 w`);
    // Rounded corners when asked (simple four-arc approximation via `k` ops).
    parts.push(radius
      ? `${x} ${y} ${w} ${h} ${radius} re` // re ignores radius; keep sharp but tinted
      : `${x} ${y} ${w} ${h} re`);
    parts.push(fill && stroke ? 'B' : fill ? 'f' : 'S');
    this.ops.push(parts.join(' '));
  }

  line(x1, y1, x2, y2, { color = LINE, width = 0.7 } = {}) {
    this.ops.push(`${color[0]} ${color[1]} ${color[2]} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
  }

  wrap(str, size, bold, maxWidth) {
    const words = pdfSafe(str).split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (measureText(candidate, size, bold) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines.slice(0, 12);
  }
}

/* --- invoice layout -------------------------------------------------------- */
function paintInvoice(painter, payload) {
  const { invoice, company = {}, customer = {}, booking = {} } = payload;
  const p = painter;

  /* header */
  p.text(MARGIN, p.y, company.name || '', { size: 16, bold: true, color: ACCENT });
  p.y -= 13;
  for (const line of [company.address, `GSTIN: ${company.gstin || '—'}`, `Phone: ${company.phone || '—'} · ${company.email || '—'}`]) {
    if (line) { p.text(MARGIN, p.y, line, { size: 8, color: MUTED }); p.y -= 10.5; }
  }
  const titleY = PAGE_H - MARGIN - 16;
  p.text(PAGE_W - MARGIN, titleY, 'TAX INVOICE', { size: 18, bold: true, align: 'right' });
  const status = invoice.status || 'DRAFT';
  const label = `  ${String(status).replace(/_/g, ' ')}  `;
  const pillW = measureText(label, 9, true) + 8;
  p.rect(PAGE_W - MARGIN - pillW, titleY - 24, pillW, 15, { fill: STATUS_COLORS[status] || MUTED });
  p.text(PAGE_W - MARGIN - pillW / 2, titleY - 19.5, label, { size: 9, bold: true, color: WHITE, align: 'center' });
  p.y = Math.min(p.y, titleY - 40);
  p.line(MARGIN, p.y, PAGE_W - MARGIN, p.y, { color: ACCENT, width: 1.1 });
  p.y -= 16;

  /* bill-to + invoice details */
  const boxH = 78;
  const gap = 8;
  const boxW = (PAGE_W - 2 * MARGIN - gap) / 2;
  const top = p.y;
  p.rect(MARGIN, top - boxH, boxW, boxH, { fill: PANEL });
  p.rect(MARGIN + boxW + gap, top - boxH, boxW, boxH, { fill: PANEL });
  let x = MARGIN + 8;
  let y = top - 14;
  p.text(x, y, 'BILL TO', { size: 7.5, color: MUTED, bold: true });
  y -= 13;
  p.text(x, y, customer.name || invoice.customer_name || '—', { size: 10.5, bold: true });
  y -= 12;
  for (const line of [customer.phone, customer.email, customer.address].filter(Boolean)) {
    p.text(x, y, line, { size: 8, color: MUTED });
    y -= 10.5;
  }
  x = MARGIN + boxW + gap + 8;
  y = top - 14;
  p.text(x, y, 'INVOICE DETAILS', { size: 7.5, color: MUTED, bold: true });
  y -= 13;
  const facts = [
    ['Invoice no.', invoice.invoice_number],
    ['Issue date', invoice.issue_date],
    ['Due date', invoice.due_date || '—'],
    ['Booking', booking.booking_number || invoice.booking_number || '—'],
  ];
  for (const [labelText, value] of facts) {
    p.text(x, y, `${labelText}:`, { size: 8, color: MUTED });
    p.text(MARGIN + 2 * boxW + gap - 8, y, String(value), { size: 8, bold: true, align: 'right' });
    y -= 11;
  }

  /* property strip */
  p.y = top - boxH - 8;
  const stripH = 34;
  p.rect(MARGIN, p.y - stripH, PAGE_W - 2 * MARGIN, stripH, { fill: STRIP });
  x = MARGIN + 10;
  y = p.y - 13;
  p.text(x, y, 'PROPERTY', { size: 7.5, color: MUTED, bold: true });
  y -= 12;
  const bits = [
    booking.project || invoice.project_name,
    (booking.plot || invoice.plot_number) && `Plot ${booking.plot || invoice.plot_number}`,
  ].filter(Boolean).join(' · ');
  p.text(x, y, bits || '—', { size: 9, bold: true });
  p.y -= stripH + 16;

  /* items table */
  const columns = [
    ['#', 18, 'left'], ['DESCRIPTION', 175, 'left'], ['HSN/SAC', 48, 'center'],
    ['QTY', 40, 'right'], ['RATE', 66, 'right'], ['DISCOUNT', 60, 'right'], ['AMOUNT', 68, 'right'],
  ];
  const items = invoice.items || [];
  const headH = 18;
  p.rect(MARGIN, p.y - headH, PAGE_W - 2 * MARGIN, headH, { fill: ACCENT });
  let cx = MARGIN;
  for (const [title, width, align] of columns) {
    if (align === 'left') p.text(cx + 4, p.y - 12, title, { size: 7.5, color: WHITE, bold: true });
    else if (align === 'center') p.text(cx + width / 2, p.y - 12, title, { size: 7.5, color: WHITE, bold: true, align: 'center' });
    else p.text(cx + width - 4, p.y - 12, title, { size: 7.5, color: WHITE, bold: true, align: 'right' });
    cx += width;
  }
  p.y -= headH;
  items.forEach((item, index) => {
    const descLines = p.wrap(item.description, 8.5, false, columns[1][1] - 8).slice(0, 3);
    const height = Math.max(16, descLines.length * 11 + 7);
    if (index % 2 === 1) p.rect(MARGIN, p.y - height, PAGE_W - 2 * MARGIN, height, { fill: ZEBRA });
    const baseline = p.y - 11.5;
    cx = MARGIN;
    const values = [
      String(index + 1), null, item.hsn_sac || '—',
      `${fmt(item.quantity)} ${item.unit || ''}`.trim(),
      rupees(item.unit_price),
      Number(item.discount_amount) > 0 ? rupees(item.discount_amount) : '—',
      rupees(item.line_total),
    ];
    values.forEach((value, i) => {
      const [title, width, align] = columns[i];
      if (value === null) {
        let yy = baseline;
        for (const line of descLines) { p.text(cx + 4, yy, line, { size: 8.5 }); yy -= 11; }
      } else if (align === 'right') p.text(cx + width - 4, baseline, value, { size: 8.5, bold: title === 'AMOUNT', align: 'right' });
      else if (align === 'center') p.text(cx + width / 2, baseline, value, { size: 8.5, align: 'center' });
      else p.text(cx + 4, baseline, value, { size: 8.5 });
      cx += width;
    });
    p.y -= height;
  });
  p.line(MARGIN, p.y, PAGE_W - MARGIN, p.y);
  p.y -= 14;

  /* totals block */
  const rows = [['Subtotal', rupees(invoice.subtotal)]];
  if (Number(invoice.discount_amount) > 0) rows.push(['Less: discount', `- ${rupees(invoice.discount_amount)}`]);
  rows.push(['Taxable value', rupees(invoice.taxable_value)]);
  if (Number(invoice.gst_rate) > 0) {
    const half = (Number(invoice.gst_rate) / 2 * 100);
    rows.push([`CGST @ ${half}%`, rupees(invoice.cgst_amount)]);
    rows.push([`SGST @ ${half}%`, rupees(invoice.sgst_amount)]);
  }
  if (Number(invoice.round_off) !== 0) rows.push(['Round off', rupees(invoice.round_off)]);
  const paid = Number(invoice.amount_paid) || 0;
  const blockW = 220;
  const xLabel = PAGE_W - MARGIN - blockW;
  let ty = p.y - 10;
  for (const [labelText, value] of rows) {
    p.text(xLabel, ty, labelText, { size: 8.5, color: MUTED });
    p.text(PAGE_W - MARGIN - 6, ty, value, { size: 8.5, align: 'right' });
    ty -= 13;
  }
  p.rect(xLabel, ty - 15, blockW, 18, { fill: [0.93, 0.95, 1.0], stroke: ACCENT });
  p.text(xLabel + 4, ty - 10, 'TOTAL PAYABLE', { size: 9.5, bold: true, color: ACCENT });
  p.text(PAGE_W - MARGIN - 6, ty - 10, rupees(invoice.total_amount), { size: 10, bold: true, color: ACCENT, align: 'right' });
  ty -= 26;
  if (paid > 0) {
    p.text(xLabel, ty, 'Paid to date', { size: 8.5, color: MUTED });
    p.text(PAGE_W - MARGIN - 6, ty, rupees(paid), { size: 8.5, align: 'right' });
    ty -= 12;
    p.text(xLabel, ty, 'Balance due', { size: 9, bold: true });
    p.text(PAGE_W - MARGIN - 6, ty, rupees(invoice.balance_amount), { size: 9, bold: true, align: 'right' });
    ty -= 14;
  }

  /* amount in words (left of the totals) */
  const words = `Amount in words: ${payload.amountInWords || ''}`;
  let wy = p.y - 4;
  for (const line of p.wrap(words, 8.5, true, PAGE_W - 2 * MARGIN - blockW - 16)) {
    p.text(MARGIN, wy, line, { size: 8.5, bold: true });
    wy -= 11;
  }
  p.y = Math.min(ty, wy) - 14;

  /* lifecycle timeline */
  const history = (invoice.history || []).slice(0, 5);
  if (history.length) {
    p.text(MARGIN, p.y, 'LIFECYCLE', { size: 7.5, color: MUTED, bold: true });
    p.y -= 4;
    p.line(MARGIN, p.y, PAGE_W - MARGIN, p.y);
    p.y -= 12;
    for (const entry of history) {
      const text = `${entry.to_status}${entry.reason ? ` — ${entry.reason}` : ''}${entry.changed_by_label ? ` (${entry.changed_by_label})` : ''}`;
      p.text(MARGIN, p.y, text, { size: 8, color: MUTED });
      p.y -= 12;
    }
    p.y -= 6;
  }

  /* notes & terms */
  for (const [title, body] of [['NOTES', invoice.notes], ['TERMS', invoice.terms]]) {
    if (!body) continue;
    p.text(MARGIN, p.y, title, { size: 7.5, color: MUTED, bold: true });
    p.y -= 11;
    for (const line of p.wrap(body, 8, false, PAGE_W - 2 * MARGIN)) {
      p.text(MARGIN, p.y, line, { size: 8, color: MUTED });
      p.y -= 10.5;
    }
    p.y -= 8;
  }
  if (status === 'CANCELLED' && invoice.cancellation_reason) {
    p.text(MARGIN, p.y, `CANCELLED — ${invoice.cancellation_reason}`, { size: 8.5, color: STATUS_COLORS.CANCELLED });
    p.y -= 16;
  }

  /* signatures */
  p.y = Math.max(p.y, MARGIN + 58);
  p.line(MARGIN, p.y, PAGE_W - MARGIN, p.y);
  p.text(PAGE_W - MARGIN - 6, p.y - 34, 'Authorised signatory', { size: 8, color: MUTED, align: 'right' });
  p.text(PAGE_W - MARGIN - 6, p.y - 46, '________________________', { size: 8, color: MUTED, align: 'right' });

  /* footer */
  const fy = MARGIN / 2 + 4;
  p.line(MARGIN, fy + 12, PAGE_W - MARGIN, fy + 12, { width: 0.5 });
  const generated = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  p.text(MARGIN, fy, `Computer-generated tax invoice · ${generated} · ${invoice.invoice_number}`, { size: 7, color: MUTED });
  p.text(PAGE_W - MARGIN, fy, 'Page 1', { size: 7, color: MUTED, align: 'right' });
}

/* --- PDF assembly ---------------------------------------------------------- */
const latin1 = (str) => Array.from(String(str), (ch) => {
  const code = ch.codePointAt(0);
  if (code <= 0xff) return code;
  if (WINANSI_MAP[code] !== undefined) return WINANSI_MAP[code];
  return 0x3f; // '?'
});

function assemble(contentOps) {
  const chunks = [];
  let offset = 0;
  const push = (str) => {
    const bytes = latin1(str);
    chunks.push(bytes);
    offset += bytes.length;
  };
  push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');

  const offsets = [0];
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] `
    + '/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    null, // content stream, filled below
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  const stream = `${contentOps.join('\n')}\n`;
  objects[3] = `<< /Length ${latin1(stream).length} >>\nstream\n${stream}endstream`;

  objects.forEach((body, index) => {
    offsets.push(offset);
    push(`${index + 1} 0 obj\n${body}\nendobj\n`);
  });

  const xrefStart = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  const total = chunks.reduce((sum, bytes) => sum + bytes.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const bytes of chunks) {
    out.set(bytes, cursor);
    cursor += bytes.length;
  }
  return out;
}

/**
 * Build the tax-invoice PDF (A4, single page).
 * @param {object} payload `{ invoice, company, customer, booking, amountInWords }`
 * @returns {Uint8Array} raw PDF bytes
 */
export function buildInvoicePdf(payload) {
  const painter = new Painter();
  paintInvoice(painter, payload);
  return assemble(painter.ops);
}

/** Trigger a browser download of raw PDF bytes. */
export function downloadPdfBytes(bytes, filename) {
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
