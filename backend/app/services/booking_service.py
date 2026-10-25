"""Booking workflow service.

Domain rules enforced here (not in controllers, not in the UI):

* a plot can hold only one live booking — enforced by a DB unique constraint
  *and* a pre-check that returns a friendly message;
* agents create bookings that stay ``PENDING_APPROVAL`` with the plot on hold;
  only approvers move them to ``CONFIRMED`` (maker/checker separation);
* every transition writes an append-only ``booking_status_history`` row and an
  audit entry with before/after state;
* cancelling/rejecting releases the plot back to ``AVAILABLE``;
* financial totals are recomputed from the ledger, never trusted from input.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.constants import BookingStatus, Permission, PlotStatus, Role
from app.core.context import ActorContext, PaginationContext
from app.core.exceptions import BusinessRuleError, ConflictError, PermissionDeniedError
from app.core.responses import Paginated
from app.models.booking import Booking
from app.repositories.booking_repository import BookingRepository, BookingStatusHistoryRepository
from app.repositories.customer_repository import CustomerRepository
from app.repositories.finance_repository import AgentRepository, PaymentRepository, ReceiptRepository
from app.repositories.property_repository import PlotRepository
from app.schemas.booking import (
    BookingCreate,
    BookingDecision,
    BookingDetailResponse,
    BookingResponse,
    BookingStatusUpdate,
    BookingTimelineEntry,
    BookingUpdate,
)
from app.services.base_service import BaseService
from app.services.notification_service import agent_user_id, emit

#: Plot state implied by each booking state.
PLOT_STATUS_FOR_BOOKING = {
    BookingStatus.PENDING_APPROVAL.value: PlotStatus.HOLD.value,
    BookingStatus.CONFIRMED.value: PlotStatus.BOOKED.value,
    BookingStatus.AGREEMENT.value: PlotStatus.BOOKED.value,
    BookingStatus.REGISTERED.value: PlotStatus.SOLD.value,
    BookingStatus.REJECTED.value: PlotStatus.AVAILABLE.value,
    BookingStatus.CANCELLED.value: PlotStatus.AVAILABLE.value,
}


class BookingService(BaseService[Booking]):
    resource = "booking"
    repository_class = BookingRepository
    permissions = {
        "view": (Permission.BOOKING_VIEW_ALL, Permission.BOOKING_VIEW_OWN),
        "create": Permission.BOOKING_CREATE,
        "update": Permission.BOOKING_UPDATE,
        "delete": Permission.BOOKING_DELETE,
        "approve": Permission.BOOKING_APPROVE,
    }

    def __init__(self, db: Session, actor: ActorContext) -> None:
        super().__init__(db, actor)
        self.bookings: BookingRepository = self.repository  # type: ignore[assignment]
        self.history = BookingStatusHistoryRepository(db)
        self.plots = PlotRepository(db)
        self.customers = CustomerRepository(db)
        self.agents = AgentRepository(db)
        self.payments = PaymentRepository(db)
        self.receipts = ReceiptRepository(db)

    # -------------------------------------------------------------- scoping
    def scope_clause(self):
        """Agents see their own deals; portal customers see their own bookings."""
        if self.actor.can(Permission.BOOKING_VIEW_ALL):
            return None
        if self.actor.is_customer_portal:
            return self.bookings.scope_clause_for(agent_id=None, customer_id=self.actor.customer_id)
        return self.bookings.scope_clause_for(agent_id=self.actor.agent_id, customer_id=None)

    # ----------------------------------------------------------------- read
    def paginate(self, page: PaginationContext) -> Paginated[Booking]:
        self._authorise("view")
        return self.bookings.paginate(
            page=page.page, page_size=page.page_size, search=page.search, sort=page.sort,
            filters=page.filters, scope_clause=self.scope_clause(),
        )

    def detail(self, booking_id: int) -> BookingDetailResponse:
        booking = self.get(booking_id, scope_clause=self.scope_clause())
        base = self.serialise(booking)
        return BookingDetailResponse(
            **base.model_dump(),
            timeline=[
                BookingTimelineEntry(
                    from_status=entry.from_status,
                    to_status=entry.to_status,
                    changed_by_label=entry.changed_by_label,
                    reason=entry.reason,
                    created_at=entry.created_at,
                )
                for entry in self.history.for_booking(booking.id)
            ],
            receipts=[
                {
                    "receipt_number": payment.receipt.receipt_number,
                    "amount": str(payment.amount),
                    "issued_on": payment.receipt.issued_on.isoformat(),
                }
                for payment in self.payments.list(filters={"booking_id": booking.id}, sort="received_on:desc")
                if payment.receipt is not None
            ],
        )

    def serialise(self, booking: Booking) -> BookingResponse:
        return BookingResponse(
            id=booking.id,
            public_id=booking.public_id,
            booking_number=booking.booking_number,
            customer_id=booking.customer_id,
            customer_name=booking.customer.name if booking.customer else None,
            project_id=booking.project_id,
            project_name=booking.project.name if booking.project else None,
            plot_id=booking.plot_id,
            plot_number=booking.plot.plot_number if booking.plot else None,
            agent_id=booking.agent_id,
            agent_name=booking.agent.name if booking.agent else None,
            booking_date=booking.booking_date,
            final_price=booking.final_price,
            token_amount=booking.token_amount,
            paid_amount=booking.paid_amount,
            balance=booking.balance,
            status=booking.status,
            payment_plan=booking.payment_plan,
            plan_id=booking.plan_id,
            approved_at=booking.approved_at,
            rejection_reason=booking.rejection_reason,
            registry_stage=booking.registry_stage or "NOT_STARTED",
            created_at=booking.created_at,
            updated_at=booking.updated_at,
        )

    def pending_queue(self) -> list[Booking]:
        self._authorise("approve")
        return self.bookings.pending_approval()

    # --------------------------------------------------------------- create
    def create_booking(self, payload: BookingCreate) -> Booking:
        self._authorise("create")
        plot = self.plots.get_or_404(payload.plot_id)
        customer = self.customers.get_or_404(payload.customer_id)

        if plot.status != PlotStatus.AVAILABLE.value:
            raise ConflictError(f"Plot {plot.plot_number} is currently {plot.status} and cannot be booked")
        if self.bookings.for_plot(plot.id) is not None:
            raise ConflictError(f"Plot {plot.plot_number} already has an active booking")
        # The price comes from the plot (plus its premiums) and the payment scheme chosen for the project. Only an
        # approver may agree a different total; everyone else books at exactly what the scheme works out to.
        from app.services.plan_calculator import PlanTerms, build_quote, plot_total_price
        from app.services.plan_service import PlanService

        plans = PlanService(self.db, self.actor)
        approver = self.actor.can(Permission.BOOKING_APPROVE)
        list_price = plot_total_price(plot.project, plot)
        booking_day = payload.booking_date or date.today()
        plan = quote = None
        if payload.plan_id is not None:
            plan = plans.get_plan(payload.plan_id)
            if plan.project_id != plot.project_id or not plan.is_active:
                raise BusinessRuleError("This payment scheme is not available for the plot's project")
        if plan is not None:
            quote = build_quote(PlanTerms.from_model(plan), list_price, booking_day)
            expected = quote["total_payable"]
            if payload.final_price != expected:
                if not approver:
                    raise BusinessRuleError(
                        f"The final price is fixed at ₹{expected:,.2f} for the '{plan.name}' scheme on plot "
                        f"{plot.plot_number}. Only an admin can set a different price.")
                quote = build_quote(PlanTerms.from_model(plan), list_price, booking_day, total_override=payload.final_price)
            if not approver and payload.token_amount != quote["upfront_total"]:
                raise BusinessRuleError(
                    f"The amount due at booking is fixed at ₹{quote['upfront_total']:,.2f} for the '{plan.name}' scheme.")
        elif not approver and payload.final_price != list_price:
            raise BusinessRuleError(
                f"The final price is fixed at the listed price of ₹{list_price:,.2f} for plot {plot.plot_number}. "
                "Only an admin can set a different price.")
        if customer.is_deleted:
            raise BusinessRuleError("This customer record is not available for booking")
        if customer.is_pending_approval:
            raise BusinessRuleError("Customer approval is pending — an admin must approve first")

        # Agents may only book their own customers (row-level authorisation).
        if not self.actor.can(Permission.CUSTOMER_VIEW_ALL) and customer.agent_id != self.actor.agent_id:
            raise PermissionDeniedError("This customer belongs to another agent")

        agent_id = customer.agent_id or self.actor.agent_id
        if payload.agent_code and self.actor.can(Permission.BOOKING_APPROVE):
            agent = self.agents.get_by_code(payload.agent_code)
            if agent is None:
                raise BusinessRuleError(f"Unknown agent code {payload.agent_code}")
            agent_id = agent.id

        approved = self.actor.can(Permission.BOOKING_APPROVE)
        status = BookingStatus.CONFIRMED.value if approved else BookingStatus.PENDING_APPROVAL.value
        booking_date = payload.booking_date or date.today()

        booking = Booking(
            booking_number=self.bookings.next_number(prefix="BK", year=booking_date.year),
            customer_id=customer.id,
            project_id=plot.project_id,
            plot_id=plot.id,
            agent_id=agent_id,
            booking_date=booking_date,
            final_price=payload.final_price,
            token_amount=payload.token_amount,
            token_payment_mode=payload.payment_mode,
            token_payment_reference=(payload.payment_reference or None),
            discount_amount=payload.discount_amount,
            paid_amount=Decimal("0.00"),
            payment_plan=plan.name if plan is not None else payload.payment_plan,
            notes=payload.notes,
            status=status,
            created_by_id=self.actor.user_id,
            approved_by_id=self.actor.user_id if approved else None,
        )
        self.bookings.create(booking)
        if plan is not None:
            plans.attach_schedule(booking, plan, quote)
        self._transition_plot(plot, status, customer_id=customer.id, agent_id=agent_id,
                              hold_days=None if approved else self._hold_days())
        self.history.record(
            booking_id=booking.id, from_status=None, to_status=status,
            actor_id=self.actor.user_id, actor_label=self.actor.name,
            reason="Booked by approver" if approved else "Awaiting admin approval",
            ip_address=self.actor.ip_address,
        )
        self._audit(
            "crud.create" if approved else "workflow.submit",
            booking,
            after={"status": status, "plot": plot.plot_number, "final_price": str(booking.final_price)},
            summary=f"Booking {booking.booking_number} {'confirmed' if approved else 'submitted for approval'}",
        )

        if not approved:
            emit(self.db, title="Booking awaiting approval",
                 body=f"{booking.booking_number} · Plot {plot.plot_number} was submitted by {self.actor.name}.",
                 category="APPROVAL", audience_role=Role.ADMIN.value, booking_id=booking.id)

        # An admin-confirmed booking accrues the commission immediately.
        if approved and booking.agent_id is not None:
            from app.services.commission_service import CommissionService

            CommissionService(self.db, self.actor).ensure_for_booking(booking)

        # Token advance received at booking time becomes a ledger entry.
        if approved and payload.token_amount > 0:
            from app.schemas.finance import PaymentCreate
            from app.services.payment_service import PaymentService

            PaymentService(self.db, self.actor).record_payment(
                PaymentCreate(
                    booking_id=booking.id,
                    amount=payload.token_amount,
                    mode=payload.payment_mode or "TOKEN_ADVANCE",
                    reference=(payload.payment_reference or None) if payload.payment_mode else "Token advance at booking",
                    notes="Auto-generated token receipt",
                )
            )
        return booking

    # --------------------------------------------------------------- update
    def update_booking(self, booking_id: int, payload: BookingUpdate) -> Booking:
        booking = self.get(booking_id, scope_clause=self.scope_clause())
        if not self.actor.can(Permission.BOOKING_APPROVE) and booking.status != BookingStatus.PENDING_APPROVAL.value:
            raise PermissionDeniedError("Only bookings still awaiting approval can be edited by you")
        # Price revisions are an approval-level capability.
        price_changed = payload.final_price is not None and payload.final_price != booking.final_price
        if price_changed and not self.actor.can(Permission.BOOKING_APPROVE):
            raise PermissionDeniedError("Only an approver can revise the final price")
        values = payload.model_dump(exclude_unset=True, exclude_none=True)
        if payload.agent_code:
            agent = self.agents.get_by_code(payload.agent_code)
            if agent is None:
                raise BusinessRuleError(f"Unknown agent code {payload.agent_code}")
            if not self.actor.can(Permission.BOOKING_APPROVE):
                raise PermissionDeniedError("Only an approver can reassign an agent")
            values.pop("agent_code", None)
            values["agent_id"] = agent.id
        self._authorise("update")
        before = {"final_price": str(booking.final_price), "status": booking.status}
        self.bookings.update(booking, values)
        if price_changed and booking.plan_id is not None:
            from app.services.plan_service import PlanService

            PlanService(self.db, self.actor).rescale(booking, booking.final_price)
        self._audit("crud.update", booking, before=before,
                    after={"final_price": str(booking.final_price), "status": booking.status},
                    summary="Booking updated")
        return booking

    def delete_booking(self, booking_id: int, password: str, delete_payments: bool = False) -> Booking:
        """Remove a booking that never turned into money; otherwise it must be cancelled, not erased.

        Admin only, and only after the admin re-enters their own password."""
        from sqlalchemy import func, select

        from app.models.billing import Invoice
        from app.models.payment import Payment

        self._authorise("delete")
        from app.core.security import verify_password
        from app.models.user import User

        user = self.db.get(User, self.actor.user_id)
        if user is None or not verify_password(password, user.password_hash):
            raise PermissionDeniedError("Your password is not correct — the booking was not deleted")
        booking = self.get(booking_id, scope_clause=self.scope_clause())
        money = self.db.execute(select(func.count(Payment.id)).where(
            Payment.booking_id == booking.id, Payment.is_deleted.is_(False))).scalar_one()
        bills = self.db.execute(select(func.count(Invoice.id)).where(
            Invoice.booking_id == booking.id, Invoice.is_deleted.is_(False))).scalar_one()
        if (money or bills) and not delete_payments:
            raise BusinessRuleError(
                "This booking has payments or invoices — cancel it instead, or delete them along with the booking",
                code="booking_has_payments", details={"payments": money, "invoices": bills})
        if money or bills:
            self._delete_money_records(booking)
        if booking.status in (BookingStatus.PENDING_APPROVAL.value, BookingStatus.CONFIRMED.value,
                              BookingStatus.AGREEMENT.value, BookingStatus.REGISTERED.value):
            self._transition_plot(self.plots.get_or_404(booking.plot_id), BookingStatus.CANCELLED.value,
                                  customer_id=None, agent_id=booking.agent_id)
        self.bookings.delete(booking, actor=self.actor.name)
        self._audit("crud.delete", booking, before={"status": booking.status}, summary="Booking deleted")
        return booking

    def _delete_money_records(self, booking: Booking) -> None:
        """Admin chose to erase the booking's payments, invoices and commission along with it (soft-delete)."""
        from sqlalchemy import select

        from app.models.billing import Invoice
        from app.models.payment import Commission, Payment

        for model in (Payment, Invoice, Commission):
            for row in self.db.execute(select(model).where(
                    model.booking_id == booking.id, model.is_deleted.is_(False))).scalars().all():
                row.soft_delete(self.actor.name)
        booking.paid_amount = Decimal("0.00")
        self.db.flush()

    # ------------------------------------------------------------- workflow
    def approve(self, booking_id: int, payload: BookingDecision) -> Booking:
        self._authorise("approve")
        booking = self.bookings.get_or_404(booking_id)
        if booking.status != BookingStatus.PENDING_APPROVAL.value:
            raise BusinessRuleError(f"Booking is already {booking.status}")

        previous = booking.status
        if payload.final_price is not None and payload.final_price != booking.final_price:
            booking.final_price = payload.final_price
            if booking.plan_id is not None:
                from app.services.plan_service import PlanService

                PlanService(self.db, self.actor).rescale(booking, payload.final_price)
        booking.status = BookingStatus.CONFIRMED.value
        booking.approved_by_id = self.actor.user_id
        booking.approved_at = self.bookings.now()
        booking.rejection_reason = None
        self.db.flush()

        plot = self.plots.get_or_404(booking.plot_id)
        self._transition_plot(plot, booking.status, customer_id=booking.customer_id, agent_id=booking.agent_id)
        self.history.record(booking_id=booking.id, from_status=previous, to_status=booking.status,
                            actor_id=self.actor.user_id, actor_label=self.actor.name,
                            reason=payload.reason or "Approved by admin", ip_address=self.actor.ip_address)
        self._audit("workflow.approve", booking, before={"status": previous},
                    after={"status": booking.status}, summary=f"Booking {booking.booking_number} approved")
        self._tell_agent(booking, "approved", "info")

        # Accrue the agent commission on confirmation (idempotent).
        if booking.agent_id is not None:
            from app.services.commission_service import CommissionService

            CommissionService(self.db, self.actor).ensure_for_booking(booking)

        if booking.token_amount > 0 and not self.payments.list(filters={"booking_id": booking.id}, limit=1):
            from app.schemas.finance import PaymentCreate
            from app.services.payment_service import PaymentService

            PaymentService(self.db, self.actor).record_payment(
                PaymentCreate(booking_id=booking.id, amount=booking.token_amount,
                              mode=booking.token_payment_mode or "TOKEN_ADVANCE",
                              reference=booking.token_payment_reference if booking.token_payment_mode else "Token advance on approval", notes="Token receipt on approval")
            )
        return booking

    def _tell_agent(self, booking: Booking, outcome: str, severity: str) -> None:
        """The booking's own agent hears the decision; no other agent does."""
        agent = self.agents.get(booking.agent_id) if booking.agent_id else None
        agent_user = agent_user_id(self.db, agent)
        if agent_user is not None:
            emit(self.db, title=f"Booking {outcome}", body=f"{booking.booking_number} was {outcome} by {self.actor.name}.",
                 category="APPROVAL", severity=severity, user_id=agent_user, booking_id=booking.id)

    def reject(self, booking_id: int, payload: BookingDecision) -> Booking:
        self._authorise("approve")
        booking = self.bookings.get_or_404(booking_id)
        if booking.status not in (BookingStatus.PENDING_APPROVAL.value, BookingStatus.CONFIRMED.value):
            raise BusinessRuleError(f"A {booking.status} booking cannot be rejected")
        previous = booking.status
        booking.status = BookingStatus.REJECTED.value
        booking.rejection_reason = payload.reason or "Rejected by admin"
        self.db.flush()
        plot = self.plots.get_or_404(booking.plot_id)
        self._transition_plot(plot, booking.status, customer_id=None, agent_id=booking.agent_id)
        self.history.record(booking_id=booking.id, from_status=previous, to_status=booking.status,
                            actor_id=self.actor.user_id, actor_label=self.actor.name,
                            reason=booking.rejection_reason, ip_address=self.actor.ip_address)
        self._audit("workflow.reject", booking, before={"status": previous},
                    after={"status": booking.status}, summary=f"Booking rejected: {booking.rejection_reason}")
        self._tell_agent(booking, "rejected", "warning")
        return booking

    def change_status(self, booking_id: int, payload: BookingStatusUpdate) -> Booking:
        """Lifecycle moves (agreement → registered) or cancellation."""
        self._authorise("approve")
        booking = self.bookings.get_or_404(booking_id)
        previous = booking.status
        if previous == payload.status:
            return booking
        allowed = {
            BookingStatus.CONFIRMED.value: {BookingStatus.AGREEMENT.value, BookingStatus.CANCELLED.value},
            BookingStatus.AGREEMENT.value: {BookingStatus.REGISTERED.value, BookingStatus.CANCELLED.value},
            BookingStatus.REGISTERED.value: set(),
            BookingStatus.PENDING_APPROVAL.value: {BookingStatus.CANCELLED.value},
        }
        if payload.status not in allowed.get(previous, set()):
            raise BusinessRuleError(f"Cannot move a booking from {previous} to {payload.status}")
        if payload.status == BookingStatus.CANCELLED.value and booking.paid_amount > 0:
            raise BusinessRuleError("Cancel after a refund/adjustment entry — money has been collected")

        booking.status = payload.status
        self.db.flush()
        plot = self.plots.get_or_404(booking.plot_id)
        self._transition_plot(plot, payload.status, customer_id=booking.customer_id, agent_id=booking.agent_id)
        self.history.record(booking_id=booking.id, from_status=previous, to_status=payload.status,
                            actor_id=self.actor.user_id, actor_label=self.actor.name,
                            reason=payload.reason, ip_address=self.actor.ip_address)
        self._audit("workflow.status", booking, before={"status": previous}, after={"status": payload.status},
                    summary=f"Status {previous} → {payload.status}")
        return booking

    def set_registry_stage(self, booking_id: int, stage: str, reason: str | None = None) -> Booking:
        """Registration progress. Reaching the agreement / registered stages also moves the booking itself."""
        if not self.actor.can(Permission.BOOKING_APPROVE):
            raise PermissionDeniedError("Only an approver can change the registry stage")
        booking = self.bookings.get_or_404(booking_id)
        if booking.status not in (BookingStatus.CONFIRMED.value, BookingStatus.AGREEMENT.value,
                                  BookingStatus.REGISTERED.value):
            raise BusinessRuleError("Registry work starts once the booking is confirmed")
        if booking.status == BookingStatus.REGISTERED.value and stage != "REGISTERED":
            raise BusinessRuleError("A registered booking cannot go back")
        # Lifecycle in step with the stage (CONFIRMED -> AGREEMENT -> REGISTERED).
        if stage in ("AGREEMENT_SIGNED", "SUB_REGISTRAR_APPOINTMENT", "REGISTERED") \
                and booking.status == BookingStatus.CONFIRMED.value:
            self.change_status(booking_id, BookingStatusUpdate(status=BookingStatus.AGREEMENT.value, reason=reason))
        if stage == "REGISTERED" and booking.status != BookingStatus.REGISTERED.value:
            self.change_status(booking_id, BookingStatusUpdate(status=BookingStatus.REGISTERED.value, reason=reason))
        booking = self.bookings.get_or_404(booking_id)
        previous = booking.registry_stage
        booking.registry_stage = stage
        self.db.flush()
        self._audit("workflow.registry", booking, before={"registry_stage": previous},
                    after={"registry_stage": stage}, summary=f"Registry stage {previous} → {stage}")
        return booking

    def _hold_days(self) -> int:
        from app.services.org_settings import setting_int

        return setting_int(self.db, "tax", "holdDays")

    def release_expired_holds(self, *, grace_days: int | None = None) -> int:
        """Scheduled job: release plots whose approval hold has lapsed."""
        cutoff = self.bookings.now() - timedelta(days=grace_days if grace_days is not None else self._hold_days())
        stale = [
            booking for booking in self.bookings.pending_approval()
            if booking.created_at <= cutoff
        ]
        for booking in stale:
            plot = self.plots.get(booking.plot_id)
            if plot is not None:
                self.plots.release(plot)
            self.history.record(booking_id=booking.id, from_status=booking.status,
                                to_status=BookingStatus.REJECTED.value, actor_id=None,
                                actor_label="system", reason="Approval window lapsed")
        return len(stale)

    # --------------------------------------------------------------- helpers
    def _transition_plot(self, plot, booking_status: str, *, customer_id: int | None, agent_id: int | None,
                         hold_days: int | None = None) -> None:
        target = PLOT_STATUS_FOR_BOOKING.get(booking_status, PlotStatus.AVAILABLE.value)
        plot.status = target
        if target == PlotStatus.AVAILABLE.value:
            plot.customer_id = None
            plot.hold_expires_at = None
        else:
            plot.customer_id = customer_id
            plot.agent_id = agent_id
            plot.hold_expires_at = (
                self.bookings.now() + timedelta(days=hold_days) if hold_days else None
            )
        self.db.flush()

    def summary(self) -> dict:
        scope = self.scope_clause()
        totals = self.bookings.totals(scope)
        return {
            "status_counts": self.bookings.status_counts(scope),
            "contract_value": str(totals["contract_value"]),
            "collected": str(totals["collected"]),
            "outstanding": str(totals["outstanding"]),
            "deals": int(totals["deals"]),
        }
