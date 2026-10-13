"""The arithmetic of a payment scheme — pure functions, no database.

Given a scheme and the price of a plot (including any premium) this produces the breakdown and the dated
instalment schedule a booking is made on. The shape follows a developer's brochure:

    price                       what the plot costs (rate x area, plus premiums)
    application fee             charged ON TOP of the price
    enrollment + allotment      paid at booking and COUNTED towards the price
    balance                     price - enrollment - allotment, paid as the scheme says
    discount                    a % of the balance (e.g. for paying outright or in a few EMIs)

    total payable = application fee + enrollment + allotment + (balance - discount)

Rounding is to the paisa and the *last* instalment absorbs the remainder, so the schedule always adds up to
the total payable exactly.
"""

from __future__ import annotations

import calendar
import json
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from app.core.exceptions import BusinessRuleError

PAISA = Decimal("0.01")
KINDS = ("OUTRIGHT", "EMI", "EMI_SPECIAL")


def money(value) -> Decimal:
    return Decimal(str(value)).quantize(PAISA, rounding=ROUND_HALF_UP)


def add_months(start: date, months: int) -> date:
    """The same day-of-month ``months`` later (clamped to the month's last day)."""
    index = start.month - 1 + months
    year, month = start.year + index // 12, index % 12 + 1
    return date(year, month, min(start.day, calendar.monthrange(year, month)[1]))


def parse_months(raw) -> list[int]:
    if raw is None or raw == "":
        return []
    if isinstance(raw, str):
        raw = json.loads(raw)
    return [int(m) for m in raw]


@dataclass(frozen=True)
class PlanTerms:
    name: str
    kind: str
    application_fee: Decimal = Decimal("0")
    enrollment_fee: Decimal = Decimal("0")
    allotment_amount: Decimal = Decimal("0")
    discount_percent: Decimal = Decimal("0")
    outright_days: int | None = None
    emi_count: int | None = None
    special_count: int | None = None
    special_percent: Decimal | None = None
    special_months: tuple[int, ...] = field(default_factory=tuple)

    @classmethod
    def from_model(cls, plan) -> PlanTerms:
        return cls(
            name=plan.name, kind=plan.kind, application_fee=Decimal(plan.application_fee),
            enrollment_fee=Decimal(plan.enrollment_fee), allotment_amount=Decimal(plan.allotment_amount),
            discount_percent=Decimal(plan.discount_percent), outright_days=plan.outright_days,
            emi_count=plan.emi_count, special_count=plan.special_count,
            special_percent=Decimal(plan.special_percent) if plan.special_percent is not None else None,
            special_months=tuple(parse_months(plan.special_months)),
        )


def validate_terms(terms: PlanTerms) -> None:
    """The rules a scheme must satisfy, whoever supplies it (the API schema also calls this)."""
    if terms.kind not in KINDS:
        raise BusinessRuleError("Choose how the balance is paid: outright, EMI, or EMI with special EMIs")
    if min(terms.application_fee, terms.enrollment_fee, terms.allotment_amount) < 0:
        raise BusinessRuleError("Fees cannot be negative")
    if not (Decimal("0") <= terms.discount_percent <= Decimal("50")):
        raise BusinessRuleError("The discount must be between 0% and 50%")
    if terms.kind == "OUTRIGHT" and not (terms.outright_days and 1 <= terms.outright_days <= 365):
        raise BusinessRuleError("Say within how many days (1-365) the balance must be paid")
    if terms.kind in ("EMI", "EMI_SPECIAL") and not (terms.emi_count and 1 <= terms.emi_count <= 360):
        raise BusinessRuleError("Say how many monthly EMIs there are (1-360)")
    if terms.kind == "EMI_SPECIAL":
        count, months = terms.special_count or 0, list(terms.special_months)
        if not (1 <= count <= (terms.emi_count or 0)):
            raise BusinessRuleError("The number of special EMIs must be between 1 and the number of EMIs")
        if not terms.special_percent or not (Decimal("0") < terms.special_percent < Decimal("100")):
            raise BusinessRuleError("The special EMIs' share of the balance must be between 0% and 100%")
        if len(months) != count or len(set(months)) != count or any(not (1 <= m <= terms.emi_count) for m in months):
            raise BusinessRuleError(
                f"Choose exactly {count} different EMI numbers (between 1 and {terms.emi_count}) for the special EMIs")


def build_quote(terms: PlanTerms, price, booking_date: date, *, total_override=None) -> dict:
    """The breakdown and schedule for one booking. ``price`` includes premiums.

    ``total_override`` (an admin's negotiated total) scales every amount proportionally."""
    validate_terms(terms)
    price = money(price)
    upfront_in_price = terms.enrollment_fee + terms.allotment_amount
    balance = price - upfront_in_price
    if balance <= 0:
        raise BusinessRuleError(
            f"Enrollment and allotment (₹{upfront_in_price:,.2f}) must be less than the plot price (₹{price:,.2f})")
    discount = money(balance * terms.discount_percent / 100)
    payable_balance = balance - discount

    lines: list[dict] = []

    def add(label: str, kind: str, due: date, amount: Decimal) -> None:
        lines.append({"label": label, "kind": kind, "due_date": due, "amount": money(amount)})

    if terms.application_fee > 0:
        add("Application fee", "UPFRONT", booking_date, terms.application_fee)
    if terms.enrollment_fee > 0:
        add("Enrollment", "UPFRONT", booking_date, terms.enrollment_fee)
    if terms.allotment_amount > 0:
        add("Allotment amount", "UPFRONT", booking_date, terms.allotment_amount)

    if terms.kind == "OUTRIGHT":
        add(f"Balance (within {terms.outright_days} days)", "BALANCE",
            booking_date + timedelta(days=terms.outright_days), payable_balance)
    else:
        n = terms.emi_count
        special_total = Decimal("0")
        special_each = Decimal("0")
        if terms.kind == "EMI_SPECIAL":
            special_total = money(payable_balance * terms.special_percent / 100)
            special_each = money(special_total / terms.special_count)
        regular_each = money((payable_balance - special_each * (terms.special_count or 0)) / n)
        emi_lines = []
        for k in range(1, n + 1):
            special = terms.kind == "EMI_SPECIAL" and k in terms.special_months
            amount = regular_each + (special_each if special else Decimal("0"))
            label = f"EMI {k} of {n}" + (" (incl. special EMI)" if special else "")
            emi_lines.append({"label": label, "kind": "EMI", "due_date": add_months(booking_date, k), "amount": amount})
        lines.extend(emi_lines)

    total = sum((line["amount"] for line in lines), Decimal("0"))
    expected = terms.application_fee + upfront_in_price + payable_balance
    if lines and lines[-1]["kind"] in ("EMI", "BALANCE"):
        lines[-1]["amount"] = money(lines[-1]["amount"] + (expected - total))   # the last line absorbs rounding
    total = sum((line["amount"] for line in lines), Decimal("0"))

    if total_override is not None and money(total_override) != total:
        factor = money(total_override) / total
        for line in lines:
            line["amount"] = money(line["amount"] * factor)
        drift = money(total_override) - sum((line["amount"] for line in lines), Decimal("0"))
        lines[-1]["amount"] = money(lines[-1]["amount"] + drift)
        total = money(total_override)

    for index, line in enumerate(lines, start=1):
        line["sequence"] = index
    upfront = sum((row["amount"] for row in lines if row["kind"] == "UPFRONT"), Decimal("0"))
    return {
        "plan_name": terms.name, "kind": terms.kind, "price": price,
        "application_fee": terms.application_fee, "enrollment_fee": terms.enrollment_fee,
        "allotment_amount": terms.allotment_amount, "balance": balance,
        "discount_percent": terms.discount_percent, "discount_amount": discount,
        "total_payable": total, "upfront_total": upfront, "schedule": lines,
    }


def plot_premium(project, plot) -> Decimal:
    """Extras for a plot's features, using the project's premium charges (each applies once)."""
    total = Decimal("0")
    if plot.is_commercial and project.premium_commercial:
        total += Decimal(project.premium_commercial)
    if plot.is_corner and project.premium_corner:
        total += Decimal(project.premium_corner)
    if plot.is_park_facing and project.premium_park_facing:
        total += Decimal(project.premium_park_facing)
    facing = (plot.facing or "").strip().lower().replace("-", " ")
    if facing in ("north east", "ne") and project.premium_ne_facing:
        total += Decimal(project.premium_ne_facing)
    elif facing == "east" and project.premium_east_facing:
        total += Decimal(project.premium_east_facing)
    return money(total)


def plot_total_price(project, plot) -> Decimal:
    return money(Decimal(plot.price) + plot_premium(project, plot))
