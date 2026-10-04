"""Money helpers: Indian digit grouping, amount-in-words, GST/TDS maths."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from app.core.constants import GST_RATE, TDS_RATE

ONES = ("", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
        "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
        "Eighteen", "Nineteen")
TENS = ("", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety")
PAISE = Decimal("0.01")


def fmt_inr(value: Decimal | float | int | str) -> str:
    """``1840000`` → ``'18,40,000'`` (Indian lakh/crore grouping)."""
    amount = Decimal(str(value or 0)).quantize(PAISE, rounding=ROUND_HALF_UP)
    negative = amount < 0
    whole, _, fraction = f"{abs(amount):.2f}".partition(".")
    last_three, rest = whole[-3:], whole[:-3]
    groups = []
    while len(rest) > 2:
        groups.insert(0, rest[-2:])
        rest = rest[:-2]
    if rest:
        groups.insert(0, rest)
    formatted = ",".join([*groups, last_three])
    if fraction != "00":
        formatted = f"{formatted}.{fraction}"
    return f"-{formatted}" if negative else formatted


def parse_inr(text: str | int | float | Decimal | None) -> Decimal:
    """Parse ``'₹18,40,000.50'`` (the format the UI sends back) to ``Decimal``."""
    cleaned = "".join(ch for ch in str(text or "0") if ch.isdigit() or ch in ".-")
    try:
        return Decimal(cleaned or "0").quantize(PAISE, rounding=ROUND_HALF_UP)
    except Exception:
        return Decimal("0.00")


def _below_hundred(n: int) -> str:
    return ONES[n] if n < 20 else f"{TENS[n // 10]}{' ' + ONES[n % 10] if n % 10 else ''}"


def _below_thousand(n: int) -> str:
    if n >= 100:
        return f"{ONES[n // 100]} Hundred{' ' + _below_hundred(n % 100) if n % 100 else ''}"
    return _below_hundred(n)


def amount_in_words(value: Decimal | float | int) -> str:
    """``1840000`` → ``'Eighteen Lakh Forty Thousand Rupees Only'``."""
    amount = Decimal(str(value or 0)).quantize(PAISE, rounding=ROUND_HALF_UP)
    whole = int(abs(amount))
    paise = int((abs(amount) - whole) * 100)
    if whole == 0 and paise == 0:
        return "Zero Rupees Only"
    parts: list[str] = []
    crore, whole = divmod(whole, 10_000_000)
    lakh, whole = divmod(whole, 100_000)
    thousand, whole = divmod(whole, 1_000)
    if crore:
        parts.append(f"{_below_thousand(crore)} Crore")
    if lakh:
        parts.append(f"{_below_hundred(lakh)} Lakh")
    if thousand:
        parts.append(f"{_below_hundred(thousand)} Thousand")
    if whole:
        parts.append(_below_thousand(whole))
    words = f"{' '.join(parts)} Rupees"
    if paise:
        words += f" and {_below_hundred(paise)} Paise"
    return f"{words} Only"


def with_gst(base_amount: Decimal, *, inclusive: bool = False, rate: Decimal | None = None) -> Decimal:
    """GST calculator used by receipts and tax invoices."""
    gst_rate = Decimal(str(rate if rate is not None else GST_RATE))
    if inclusive:
        return (Decimal(base_amount) / (1 + gst_rate)).quantize(PAISE, rounding=ROUND_HALF_UP)
    return (Decimal(base_amount) * gst_rate).quantize(PAISE, rounding=ROUND_HALF_UP)


def with_tds(gross_amount: Decimal, *, rate: Decimal | None = None) -> Decimal:
    """TDS withheld on agent commissions (194H style)."""
    tds_rate = Decimal(str(rate if rate is not None else TDS_RATE))
    return (Decimal(gross_amount) * tds_rate).quantize(PAISE, rounding=ROUND_HALF_UP)
