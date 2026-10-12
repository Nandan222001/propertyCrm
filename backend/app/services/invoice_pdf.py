"""Tax-invoice PDF renderer (reportlab canvas, A4, print-ready).

Design constraints:
* only PDF core fonts are used (Helvetica) so no font embedding/licensing is
  involved — which also means the rupee glyph is unavailable, so amounts are
  prefixed ``Rs.`` (the statutory convention on printed Indian invoices);
* amounts are formatted with the Indian lakh/crore grouping via
  :func:`app.utils.money.fmt_inr`;
* the payload comes straight from :meth:`BillingService.pdf_payload`, where PII
  is already masked unless the caller holds ``pii:reveal``;
* the document paginates itself: long item lists continue on extra pages.
"""

from __future__ import annotations

import io
from datetime import UTC, datetime
from decimal import Decimal

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import simpleSplit
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

from app.utils.money import amount_in_words, fmt_inr

PAGE_W, PAGE_H = A4
MARGIN = 15 * mm

INK = (0.13, 0.15, 0.24)          # near-black titles
MUTED = (0.42, 0.46, 0.55)        # secondary text
ACCENT = (0.16, 0.24, 0.58)       # brand indigo
LINE = (0.85, 0.87, 0.91)         # hairlines
ZEBRA = (0.96, 0.97, 0.99)        # alternate rows
TABLE_HEAD = (0.16, 0.24, 0.58)   # table header fill
TOTAL_FILL = (0.93, 0.95, 1.0)    # grand-total strip

STATUS_COLORS = {
    "DRAFT": (0.42, 0.46, 0.55),
    "ISSUED": (0.13, 0.45, 0.85),
    "PARTIALLY_PAID": (0.85, 0.56, 0.08),
    "PAID": (0.05, 0.59, 0.32),
    "OVERDUE": (0.80, 0.20, 0.24),
    "CANCELLED": (0.55, 0.57, 0.62),
}


def _rupees(value: Decimal | float | str) -> str:
    return f"Rs. {fmt_inr(value)}"


class _InvoicePDF:
    """Cursor-based painter: every primitive advances ``self.y``."""

    def __init__(self, payload: dict) -> None:
        self.payload = payload
        self.invoice = payload["invoice"]
        self.buffer = io.BytesIO()
        self.pdf = canvas.Canvas(self.buffer, pagesize=A4)
        self.pdf.setTitle(f"Tax invoice {self.invoice['invoice_number']}")
        self.pdf.setAuthor(payload["company"].get("name") or "")
        self.pdf.setSubject("Tax invoice / bill")
        self.y = PAGE_H - MARGIN
        self.page = 1

    # ------------------------------------------------------------- helpers
    def _text(self, x: float, y: float, text: str, *, size=9, color=INK,
              bold=False, align="left") -> None:
        font = "Helvetica-Bold" if bold else "Helvetica"
        if align == "right":
            x -= stringWidth(text, font, size)
        elif align == "center":
            x -= stringWidth(text, font, size) / 2
        self.pdf.setFillColorRGB(*color)
        self.pdf.setFont(font, size)
        self.pdf.drawString(x, y, text)

    def _wrap(self, text: str, *, size=9, bold=False, width: float) -> list[str]:
        return simpleSplit(str(text or ""), "Helvetica-Bold" if bold else "Helvetica", size, width)

    def _paragraph(self, x: float, y: float, text: str, *, size=9, color=INK, bold=False,
                   width: float, leading: float | None = None) -> None:
        lead = leading or size + 2.5
        self.y = y
        for line in self._wrap(text, size=size, bold=bold, width=width)[:12]:
            self._text(x, self.y, line, size=size, color=color, bold=bold)
            self.y -= lead

    def _hr(self, *, y: float | None = None, color=LINE, weight: float = 0.7) -> None:
        self.pdf.setStrokeColorRGB(*color)
        self.pdf.setLineWidth(weight)
        yy = self.y if y is None else y
        self.pdf.line(MARGIN, yy, PAGE_W - MARGIN, yy)

    def _box(self, x: float, y: float, w: float, h: float, *, fill=None,
             stroke=LINE, radius=3) -> None:
        if fill is not None:
            self.pdf.setFillColorRGB(*fill)
        self.pdf.setStrokeColorRGB(*stroke)
        self.pdf.roundRect(x, y, w, h, radius, stroke=1, fill=1 if fill else 0)

    def _new_page(self) -> None:
        self._footer()
        self.pdf.showPage()
        self.page += 1
        self.y = PAGE_H - MARGIN
        self._continuation_header()

    def _ensure(self, needed: float) -> None:
        if self.y - needed < MARGIN + 18 * mm:
            self._new_page()

    # --------------------------------------------------------------- header
    def _header(self) -> None:
        company = self.payload["company"]
        status = str(self.invoice.get("status", "DRAFT"))

        self._text(MARGIN, self.y, company.get("name", ""), size=16, bold=True, color=ACCENT)
        self.y -= 13
        # Only print what the organisation has actually filled in (no empty "GSTIN:" lines).
        letterhead = (
            company.get("address", ""),
            f"GSTIN: {company['gstin']}" if company.get("gstin") else "",
            f"Phone: {company['phone']}" if company.get("phone") else "",
            f"E-mail: {company['email']}" if company.get("email") else "",
        )
        for line in letterhead:
            if line:
                self._text(MARGIN, self.y, line, size=8, color=MUTED)
                self.y -= 10.5

        title_y = PAGE_H - MARGIN - 16
        self._text(PAGE_W - MARGIN, title_y, "TAX INVOICE", size=18, bold=True, align="right")
        # Status stamp.
        color = STATUS_COLORS.get(status, MUTED)
        label = f"  {status.replace('_', ' ')}  "
        stamp_w = stringWidth(label, "Helvetica-Bold", 9) + 6
        stamp_h = 14
        self._box(PAGE_W - MARGIN - stamp_w, title_y - 22, stamp_w, stamp_h, fill=color, stroke=color)
        self._text(PAGE_W - MARGIN - stamp_w / 2, title_y - 17.5, label, size=9,
                   color=(1, 1, 1), bold=True, align="center")

        self.y = min(self.y, title_y - 40)
        self._hr(weight=1.1, color=ACCENT)
        self.y -= 14

    def _continuation_header(self) -> None:
        invoice = self.invoice
        self._text(MARGIN, self.y, f"{self.payload['company'].get('name', '')} — Tax invoice "
                    f"{invoice['invoice_number']} (continued)", size=9, bold=True, color=ACCENT)
        self.y -= 6
        self._hr()
        self.y -= 12

    # ------------------------------------------------------------ meta grid
    def _meta_grid(self) -> None:
        invoice = self.invoice
        customer = self.payload["customer"]
        booking = self.payload["booking"]

        box_h = 78
        gap = 8
        box_w = (PAGE_W - 2 * MARGIN - gap) / 2
        top = self.y
        self._box(MARGIN, top - box_h, box_w, box_h, fill=(0.976, 0.98, 0.992))
        self._box(MARGIN + box_w + gap, top - box_h, box_w, box_h, fill=(0.976, 0.98, 0.992))

        # Bill-to block.
        x = MARGIN + 8
        y = top - 14
        self._text(x, y, "BILL TO", size=7.5, color=MUTED, bold=True)
        y -= 13
        self._text(x, y, customer.get("name", "-"), size=10.5, bold=True)
        y -= 12
        for line in (customer.get("phone", ""), customer.get("email", ""), customer.get("address", "")):
            if line and line != "***":
                self._text(x, y, str(line), size=8, color=MUTED)
                y -= 10.5

        # Invoice facts block.
        x = MARGIN + box_w + gap + 8
        y = top - 14
        self._text(x, y, "INVOICE DETAILS", size=7.5, color=MUTED, bold=True)
        y -= 13
        facts = [
            ("Invoice no.", invoice["invoice_number"]),
            ("Issue date", str(invoice["issue_date"])),
            ("Due date", str(invoice.get("due_date") or "—")),
            ("Booking", booking.get("booking_number") or "—"),
        ]
        for label, value in facts:
            self._text(x, y, f"{label}:", size=8, color=MUTED)
            self._text(MARGIN + box_w + gap + box_w - 8, y, str(value), size=8, bold=True, align="right")
            y -= 11

        # Property strip.
        self.y = top - box_h - 8
        strip_h = 34
        self._box(MARGIN, self.y - strip_h, PAGE_W - 2 * MARGIN, strip_h, fill=(0.992, 0.949, 0.902))
        x = MARGIN + 10
        y = self.y - 13
        self._text(x, y, "PROPERTY", size=7.5, color=MUTED, bold=True)
        y -= 12
        property_bits = " · ".join(
            str(part) for part in (
                booking.get("project"),
                f"Plot {booking['plot']}" if booking.get("plot") else None,
                f"{booking['area_sqft']} sq.ft" if booking.get("area_sqft") else None,
                booking.get("payment_plan"),
            ) if part
        )
        self._text(x, y, property_bits or "—", size=9, bold=True)
        self.y -= strip_h + 16

    # ---------------------------------------------------------- items table
    def _items_table(self) -> None:
        items = self.invoice.get("items") or []
        columns = (
            ("#", 18, "left"),
            ("DESCRIPTION", 175, "left"),
            ("HSN/SAC", 48, "center"),
            ("QTY", 40, "right"),
            ("RATE", 66, "right"),
            ("DISCOUNT", 60, "right"),
            ("AMOUNT", 68, "right"),
        )

        row_h = 16
        head_h = 18
        self._ensure(head_h + 3 * row_h + 90)
        # Header.
        self.pdf.setFillColorRGB(*TABLE_HEAD)
        self.pdf.rect(MARGIN, self.y - head_h, PAGE_W - 2 * MARGIN, head_h, stroke=0, fill=1)
        x = MARGIN
        for title, width, align in columns:
            if align == "left":
                self._text(x + 4, self.y - 12, title, size=7.5, color=(1, 1, 1), bold=True)
            elif align == "center":
                self._text(x + width / 2, self.y - 12, title, size=7.5, color=(1, 1, 1),
                           bold=True, align="center")
            else:
                self._text(x + width - 4, self.y - 12, title, size=7.5, color=(1, 1, 1),
                           bold=True, align="right")
            x += width
        self.y -= head_h

        # Rows.
        for index, item in enumerate(items, start=1):
            desc_lines = self._wrap(item["description"], size=8.5, width=columns[1][1] - 8)[:3]
            height = max(row_h, len(desc_lines) * 11 + 7)
            self._ensure(height)
            if index % 2 == 0:
                self.pdf.setFillColorRGB(*ZEBRA)
                self.pdf.rect(MARGIN, self.y - height, PAGE_W - 2 * MARGIN, height, stroke=0, fill=1)
            baseline = self.y - 11.5
            x = MARGIN
            values = (
                str(index),
                None,  # description column (wrapped separately below)
                str(item.get("hsn_sac") or "—"),
                f"{fmt_inr(item['quantity'])} {item.get('unit', '')}".strip(),
                _rupees(item["unit_price"]),
                _rupees(item.get("discount_amount", 0)) if item.get("discount_amount") else "—",
                _rupees(item["line_total"]),
            )
            for value, (title, width, align) in zip(values, columns, strict=True):
                if value is None:  # description column (may wrap)
                    yy = baseline
                    for line in desc_lines:
                        self._text(x + 4, yy, line, size=8.5)
                        yy -= 11
                elif align == "right":
                    self._text(x + width - 4, baseline, value, size=8.5,
                               bold=(title == "AMOUNT"), align="right")
                elif align == "center":
                    self._text(x + width / 2, baseline, value, size=8.5, align="center")
                else:
                    self._text(x + 4, baseline, value, size=8.5, align="left")
                x += width
            self.y -= height

        self.pdf.setStrokeColorRGB(*LINE)
        self.pdf.setLineWidth(0.7)
        self.pdf.rect(MARGIN, self.y, PAGE_W - 2 * MARGIN, 0.1, stroke=1, fill=0)
        self.y -= 12

    # ------------------------------------------------------------- totals
    def _totals_block(self) -> None:
        invoice = self.invoice
        rows = [
            ("Subtotal", _rupees(invoice["subtotal"]), False),
            ("Less: discount", f"- {_rupees(invoice['discount_amount'])}", False)
            if Decimal(str(invoice.get("discount_amount", 0))) > 0 else None,
            ("Taxable value", _rupees(invoice["taxable_value"]), False),
        ]
        rate = Decimal(str(invoice.get("gst_rate", 0)))
        if rate > 0:
            half = (rate / 2 * 100)
            rows.append((f"CGST @ {half.normalize():f}%", _rupees(invoice["cgst_amount"]), False))
            rows.append((f"SGST @ {half.normalize():f}%", _rupees(invoice["sgst_amount"]), False))
        if Decimal(str(invoice.get("round_off", 0))) != 0:
            rows.append(("Round off", _rupees(invoice["round_off"]), False))
        rows = [row for row in rows if row]
        paid = Decimal(str(invoice.get("amount_paid", 0)))

        block_w = 220
        block_h = 13 * len(rows) + (26 if paid else 0) + 18
        self._ensure(block_h + 60)
        top = self.y
        x_label = PAGE_W - MARGIN - block_w
        y = top - 12
        for label, value, strong in rows:
            self._text(x_label, y, label, size=8.5, color=MUTED, bold=strong)
            self._text(PAGE_W - MARGIN - 6, y, value, size=8.5, bold=strong, align="right")
            y -= 13

        # Grand total strip.
        strip_h = 18
        self._box(PAGE_W - MARGIN - block_w, y - strip_h + 4, block_w, strip_h, fill=TOTAL_FILL, stroke=ACCENT)
        self._text(x_label, y - 9, "TOTAL PAYABLE", size=9.5, bold=True, color=ACCENT)
        self._text(PAGE_W - MARGIN - 6, y - 9, _rupees(invoice["total_amount"]), size=10,
                   bold=True, color=ACCENT, align="right")
        y -= strip_h + 6

        if paid > 0:
            self._text(x_label, y, "Paid to date", size=8.5, color=MUTED)
            self._text(PAGE_W - MARGIN - 6, y, _rupees(paid), size=8.5, align="right")
            y -= 12
            self._text(x_label, y, "Balance due", size=9, bold=True)
            self._text(PAGE_W - MARGIN - 6, y, _rupees(invoice["balance_amount"]), size=9,
                       bold=True, align="right")
            y -= 14

        # Amount in words, left of the totals block.
        words_top = top - 4
        words = f"Amount in words: {amount_in_words(Decimal(str(invoice['total_amount'])))}"
        self._paragraph(MARGIN, words_top, words, size=8.5, bold=True,
                        width=PAGE_W - 2 * MARGIN - block_w - 16, leading=11)
        self.y = min(y, self.y - 8) - 12

    # ------------------------------------------------------------ payments
    def _payments_block(self) -> None:
        payments = self.payload.get("payments") or []
        if not payments:
            return
        head = "PAYMENTS RECEIVED AGAINST THIS INVOICE"
        self._ensure(30 + 15 * len(payments))
        self._text(MARGIN, self.y, head, size=7.5, color=MUTED, bold=True)
        self.y -= 4
        self._hr()
        self.y -= 11
        for payment in payments:
            bits = " · ".join(
                str(part) for part in (
                    payment.get("received_on"),
                    _rupees(payment["amount"]),
                    payment.get("mode"),
                    payment.get("reference"),
                    f"Receipt {payment['receipt']}" if payment.get("receipt") else None,
                ) if part
            )
            self._text(MARGIN, self.y, bits, size=8)
            self.y -= 12
        self.y -= 8

    # --------------------------------------------------------- notes/terms
    def _notes_block(self) -> None:
        invoice = self.invoice
        for title, body in (("NOTES", invoice.get("notes")), ("TERMS", invoice.get("terms"))):
            if not body:
                continue
            self._ensure(40)
            self._text(MARGIN, self.y, title, size=7.5, color=MUTED, bold=True)
            self.y -= 11
            self._paragraph(MARGIN, self.y, body, size=8, color=MUTED,
                            width=PAGE_W - 2 * MARGIN, leading=10.5)
            self.y -= 10
        if invoice.get("status") == "CANCELLED" and invoice.get("cancellation_reason"):
            self._text(MARGIN, self.y, "CANCELLED — ", size=8.5, bold=True,
                       color=STATUS_COLORS["CANCELLED"])
            self._text(MARGIN + stringWidth("CANCELLED — ", "Helvetica-Bold", 8.5), self.y,
                       str(invoice["cancellation_reason"]), size=8.5, color=STATUS_COLORS["CANCELLED"])
            self.y -= 16

    # ----------------------------------------------------------- signature
    def _signatures(self) -> None:
        self._ensure(70)
        self.y = max(self.y, MARGIN + 58)
        self._hr()
        baseline = self.y - 34
        self._text(MARGIN + 6, baseline, "Customer signature", size=8, color=MUTED)
        owner = self.payload["company"].get("name")
        self._text(PAGE_W - MARGIN - 6, baseline, f"For {owner} — Authorised signatory" if owner else "Authorised signatory",
                   size=8, color=MUTED, align="right")
        self._text(MARGIN + 6, baseline - 12, "________________________", size=8, color=MUTED)
        self._text(PAGE_W - MARGIN - 6, baseline - 12, "________________________", size=8,
                   color=MUTED, align="right")
        self.y = baseline - 24

    def _footer(self) -> None:
        y = MARGIN / 2 + 4
        self._hr(y=y + 12, color=LINE, weight=0.5)
        generated = datetime.now(UTC).strftime("%d %b %Y, %H:%M UTC")
        self._text(MARGIN, y, f"Computer-generated tax invoice · generated {generated} · "
                              f"{self.invoice['invoice_number']}", size=7, color=MUTED)
        self._text(PAGE_W - MARGIN, y, f"Page {self.page}", size=7, color=MUTED, align="right")

    # ----------------------------------------------------------------- draw
    def render(self) -> bytes:
        self._header()
        self._meta_grid()
        self._items_table()
        self._totals_block()
        self._payments_block()
        self._notes_block()
        self._signatures()
        self._footer()
        self.pdf.showPage()
        self.pdf.save()
        return self.buffer.getvalue()


def render_invoice_pdf(payload: dict) -> bytes:
    """Build the invoice PDF (returns raw bytes; caller streams them)."""
    return _InvoicePDF(payload).render()
