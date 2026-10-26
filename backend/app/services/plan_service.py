"""Payment schemes per project, quotes, and the instalment schedule of each booking."""

from __future__ import annotations

import json
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.constants import AuditAction
from app.core.context import ActorContext
from app.core.exceptions import BusinessRuleError, ConflictError, NotFoundError
from app.models.booking import Booking
from app.models.payment_plan import BookingInstallment, PaymentPlan
from app.models.property import Plot, Project
from app.schemas.payment_plan import InstallmentResponse, PlanCreate, PlanResponse, PlanUpdate, QuoteRequest
from app.services.audit_service import AuditService
from app.services.plan_calculator import (
    PlanTerms,
    build_quote,
    money,
    parse_months,
    plot_total_price,
    validate_terms,
)


def jsonable(value):
    """Decimals and dates -> JSON-safe values (for the booking's frozen copy of its scheme)."""
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(v) for v in value]
    return value


def terms_from_payload(payload: PlanCreate | PlanUpdate, base: PlanTerms | None = None) -> PlanTerms:
    data = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if base is not None:
        merged = {f: getattr(base, f) for f in base.__dataclass_fields__}
        merged.update(data)
        data = merged
    return PlanTerms(
        name=data["name"], kind=data["kind"],
        application_fee=Decimal(data.get("application_fee", 0)), enrollment_fee=Decimal(data.get("enrollment_fee", 0)),
        allotment_amount=Decimal(data.get("allotment_amount", 0)), discount_percent=Decimal(data.get("discount_percent", 0)),
        outright_days=data.get("outright_days"), emi_count=data.get("emi_count"),
        special_count=data.get("special_count"),
        special_percent=Decimal(data["special_percent"]) if data.get("special_percent") is not None else None,
        special_months=tuple(int(m) for m in data.get("special_months", ())),
    )


class PlanService:
    def __init__(self, db: Session, actor: ActorContext) -> None:
        self.db = db
        self.actor = actor
        self.audit = AuditService(db)

    # ----------------------------------------------------------------- read
    def serialise(self, plan: PaymentPlan) -> PlanResponse:
        return PlanResponse(
            id=plan.id, public_id=plan.public_id, project_id=plan.project_id, name=plan.name, kind=plan.kind,
            application_fee=plan.application_fee, enrollment_fee=plan.enrollment_fee,
            allotment_amount=plan.allotment_amount, discount_percent=plan.discount_percent,
            outright_days=plan.outright_days, emi_count=plan.emi_count, special_count=plan.special_count,
            special_percent=plan.special_percent, special_months=parse_months(plan.special_months),
            is_active=plan.is_active, sort_order=plan.sort_order,
        )

    def _project(self, project_id: int) -> Project:
        project = self.db.get(Project, project_id)
        if project is None or project.is_deleted:
            raise NotFoundError("Project not found")
        return project

    def get_plan(self, plan_id: int) -> PaymentPlan:
        plan = self.db.get(PaymentPlan, plan_id)
        if plan is None or plan.is_deleted:
            raise NotFoundError("Payment scheme not found")
        return plan

    def list_for_project(self, project_id: int) -> list[PaymentPlan]:
        self._project(project_id)
        return list(self.db.execute(
            select(PaymentPlan).where(PaymentPlan.project_id == project_id, PaymentPlan.is_deleted.is_(False))
            .order_by(PaymentPlan.sort_order, PaymentPlan.id)
        ).scalars())

    # ---------------------------------------------------------------- write
    def create(self, project_id: int, payload: PlanCreate) -> PaymentPlan:
        self._project(project_id)
        terms = terms_from_payload(payload)
        validate_terms(terms)
        if any(p.name.lower() == terms.name.lower() for p in self.list_for_project(project_id)):
            raise ConflictError(f"This project already has a scheme called '{terms.name}'")
        plan = PaymentPlan(
            project_id=project_id, name=terms.name, kind=terms.kind, application_fee=terms.application_fee,
            enrollment_fee=terms.enrollment_fee, allotment_amount=terms.allotment_amount,
            discount_percent=terms.discount_percent, outright_days=terms.outright_days, emi_count=terms.emi_count,
            special_count=terms.special_count, special_percent=terms.special_percent,
            special_months=json.dumps(list(terms.special_months)) if terms.special_months else None,
            is_active=payload.is_active, sort_order=payload.sort_order,
        )
        self.db.add(plan)
        self.db.flush()
        self._audit(plan, "created")
        return plan

    def update(self, plan_id: int, payload: PlanUpdate) -> PaymentPlan:
        plan = self.get_plan(plan_id)
        terms = terms_from_payload(payload, base=PlanTerms.from_model(plan))
        validate_terms(terms)
        clash = [p for p in self.list_for_project(plan.project_id) if p.id != plan.id and p.name.lower() == terms.name.lower()]
        if clash:
            raise ConflictError(f"This project already has a scheme called '{terms.name}'")
        plan.name, plan.kind = terms.name, terms.kind
        plan.application_fee, plan.enrollment_fee, plan.allotment_amount = terms.application_fee, terms.enrollment_fee, terms.allotment_amount
        plan.discount_percent, plan.outright_days, plan.emi_count = terms.discount_percent, terms.outright_days, terms.emi_count
        plan.special_count, plan.special_percent = terms.special_count, terms.special_percent
        plan.special_months = json.dumps(list(terms.special_months)) if terms.special_months else None
        fields = payload.model_dump(exclude_unset=True)
        if "is_active" in fields and fields["is_active"] is not None:
            plan.is_active = fields["is_active"]
        if "sort_order" in fields and fields["sort_order"] is not None:
            plan.sort_order = fields["sort_order"]
        self.db.flush()
        self._audit(plan, "updated")
        return plan

    def delete(self, plan_id: int) -> None:
        plan = self.get_plan(plan_id)
        plan.soft_delete(self.actor.name)     # bookings keep their own frozen copy, so nothing already agreed changes
        self.db.flush()
        self._audit(plan, "deleted")

    def _audit(self, plan: PaymentPlan, what: str) -> None:
        self.audit.log(action=AuditAction.CONFIG_CHANGE, resource="payment_plan", resource_id=plan.public_id,
                       summary=f"Payment scheme '{plan.name}' {what}", actor=self.actor)

    # --------------------------------------------------------------- quotes
    def price_of(self, plot: Plot) -> Decimal:
        return plot_total_price(plot.project, plot)

    def quote(self, request: QuoteRequest) -> dict:
        if request.plan_id is not None:
            terms = PlanTerms.from_model(self.get_plan(request.plan_id))
        elif request.plan is not None:
            terms = terms_from_payload(request.plan)
        else:
            raise BusinessRuleError("Choose a payment scheme")
        if request.plot_id is not None:
            plot = self.db.get(Plot, request.plot_id)
            if plot is None or plot.is_deleted:
                raise NotFoundError("Plot not found")
            price = self.price_of(plot)
        elif request.price is not None:
            price = request.price
        else:
            raise BusinessRuleError("Give a plot or a price to calculate on")
        return build_quote(terms, price, request.booking_date or date.today(), allotment=request.allotment_amount)

    # ------------------------------------------------------------ schedules
    def attach_schedule(self, booking: Booking, plan: PaymentPlan, quote: dict) -> None:
        """Freeze the scheme and its schedule on the booking, and create its instalment lines."""
        booking.plan_id = plan.id
        booking.payment_plan = plan.name
        booking.plan_snapshot = json.dumps(jsonable({k: v for k, v in quote.items() if k != "schedule"}) | {
            "terms": {f: jsonable(getattr(PlanTerms.from_model(plan), f)) for f in PlanTerms.__dataclass_fields__}})
        for line in quote["schedule"]:
            self.db.add(BookingInstallment(
                booking_id=booking.id, sequence=line["sequence"], label=line["label"], kind=line["kind"],
                due_date=line["due_date"], amount=line["amount"], paid_amount=Decimal("0"),
            ))
        self.db.flush()

    def installments(self, booking_id: int) -> list[BookingInstallment]:
        return list(self.db.execute(
            select(BookingInstallment).where(BookingInstallment.booking_id == booking_id)
            .order_by(BookingInstallment.sequence)
        ).scalars())

    @staticmethod
    def status_of(line: BookingInstallment, today: date | None = None) -> str:
        today = today or date.today()
        if line.paid_amount >= line.amount:
            return "PAID"
        if line.due_date < today:
            return "OVERDUE"
        return "PARTIAL" if line.paid_amount > 0 else "PENDING"

    def serialise_installment(self, line: BookingInstallment) -> InstallmentResponse:
        return InstallmentResponse(
            id=line.id, sequence=line.sequence, label=line.label, kind=line.kind, due_date=line.due_date,
            amount=line.amount, paid_amount=line.paid_amount, balance=money(line.amount - line.paid_amount),
            status=self.status_of(line),
        )

    def allocate_payment(self, booking_id: int, amount: Decimal) -> None:
        """Apply money received to the earliest unpaid lines of the schedule."""
        remaining = Decimal(amount)
        for line in self.installments(booking_id):
            if remaining <= 0:
                break
            room = line.amount - line.paid_amount
            if room <= 0:
                continue
            take = min(room, remaining)
            line.paid_amount = money(line.paid_amount + take)
            remaining -= take
        self.db.flush()

    def release_payment(self, booking_id: int, amount: Decimal) -> None:
        """A payment was cancelled: take its money back off the latest paid lines of the schedule."""
        remaining = Decimal(amount)
        for line in reversed(self.installments(booking_id)):
            if remaining <= 0:
                break
            take = min(line.paid_amount, remaining)
            if take <= 0:
                continue
            line.paid_amount = money(line.paid_amount - take)
            remaining -= take
        self.db.flush()

    def rescale(self, booking: Booking, new_total) -> None:
        """The agreed total changed: scale the lines nobody has paid on so the schedule still adds up."""
        lines = self.installments(booking.id)
        open_lines = [line for line in lines if line.paid_amount == 0]
        if not open_lines:
            return
        locked = sum((line.amount for line in lines if line.paid_amount > 0), Decimal("0"))
        target = money(new_total) - locked
        current = sum((line.amount for line in open_lines), Decimal("0"))
        if target <= 0 or current <= 0:
            return
        factor = target / current
        for line in open_lines:
            line.amount = money(line.amount * factor)
        open_lines[-1].amount = money(open_lines[-1].amount + (target - sum((line.amount for line in open_lines), Decimal("0"))))
        self.db.flush()

    def next_due(self, booking_id: int) -> date | None:
        for line in self.installments(booking_id):
            if line.paid_amount < line.amount:
                return line.due_date
        return None
