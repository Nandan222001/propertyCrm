"""Agent commissions: slab-based calculation, approval and payout."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.orm import Session

from app.core.constants import TDS_RATE, AuditAction, Permission
from app.core.context import ActorContext, PaginationContext
from app.core.exceptions import BusinessRuleError, PermissionDeniedError
from app.core.responses import Paginated
from app.models.payment import Commission
from app.repositories.finance_repository import AgentRepository, CommissionRepository
from app.schemas.finance import CommissionCreate, CommissionDecision, CommissionResponse
from app.services.base_service import BaseService

MONEY = Decimal("0.01")


def commission_rate_for(override: Decimal | None, default: Decimal) -> Decimal:
    """The agent's own rate; the organisation's default rate when the agent has none."""
    if override is not None and override > 0:
        return Decimal(override)
    return default


def split_commission(deal_value: Decimal, rate: Decimal, tds_rate: float | Decimal = TDS_RATE) -> tuple[Decimal, Decimal, Decimal]:
    """Return ``(gross, tds, net)`` rounded to paise using half-up rounding."""
    gross = (Decimal(deal_value) * Decimal(rate)).quantize(MONEY, rounding=ROUND_HALF_UP)
    tds = (gross * Decimal(str(tds_rate))).quantize(MONEY, rounding=ROUND_HALF_UP)
    return gross, tds, (gross - tds).quantize(MONEY, rounding=ROUND_HALF_UP)


class CommissionService(BaseService[Commission]):
    resource = "commission"
    repository_class = CommissionRepository
    permissions = {
        "view": Permission.COMMISSION_VIEW,
        "create": Permission.COMMISSION_APPROVE,
        "update": Permission.COMMISSION_APPROVE,
        "delete": Permission.COMMISSION_APPROVE,
    }

    def __init__(self, db: Session, actor: ActorContext) -> None:
        super().__init__(db, actor)
        self.commissions: CommissionRepository = self.repository  # type: ignore[assignment]
        self.agents = AgentRepository(db)

    # --------------------------------------------------------------- scoping
    def scope_clause(self):
        # Approvers, payers and read-only oversight roles see every commission; an agent only their own.
        if (self.actor.can(Permission.COMMISSION_APPROVE) or self.actor.can(Permission.COMMISSION_PAYOUT)
                or self.actor.can(Permission.BOOKING_VIEW_ALL)):
            return None
        return Commission.agent_id == (self.actor.agent_id or -1)

    def _tds_rate(self) -> Decimal:
        """TDS withheld on commission: the organisation's own setting (percent), else the default."""
        from app.services.org_settings import get_value

        try:
            percent = Decimal(get_value(self.db, "tax.tdsRate", str(Decimal(str(TDS_RATE)) * 100)))
        except Exception:
            return Decimal(str(TDS_RATE))
        return percent / 100 if 0 <= percent <= 30 else Decimal(str(TDS_RATE))

    # ----------------------------------------------------------------- read
    def paginate(self, page: PaginationContext) -> Paginated[Commission]:
        self._authorise("view")
        return self.commissions.paginate(
            page=page.page, page_size=page.page_size, search=page.search, sort=page.sort,
            filters=page.filters, scope_clause=self.scope_clause(),
        )

    def serialise(self, commission: Commission) -> CommissionResponse:
        from app.models.payment import Agent, Payment

        from app.models.application import Application

        payment = self.db.get(Payment, commission.payment_id) if commission.payment_id else None
        source = self.db.get(Agent, commission.source_agent_id) if commission.source_agent_id else None
        application = self.db.get(Application, commission.application_id) if commission.application_id else None
        received_on = payment.received_on if payment is not None else (application.received_on if application is not None else None)
        return CommissionResponse(
            received_on=received_on,
            application_id=commission.application_id,
            project_name=application.project.name if application is not None and application.project else None,
            id=commission.id,
            public_id=commission.public_id,
            agent_id=commission.agent_id,
            agent_name=commission.agent.name if commission.agent else None,
            booking_id=commission.booking_id,
            payment_id=commission.payment_id,
            source_agent_id=commission.source_agent_id,
            source_agent_name=source.name if source is not None else None,
            is_override=commission.source_agent_id is not None and commission.source_agent_id != commission.agent_id,
            deal_value=commission.deal_value,
            rate=commission.rate,
            gross_amount=commission.gross_amount,
            tds_amount=commission.tds_amount,
            net_amount=commission.net_amount,
            status=commission.status,
            payout_reference=commission.payout_reference,
            paid_at=commission.paid_at,
            created_at=commission.created_at,
            updated_at=commission.updated_at,
        )

    def totals(self) -> dict:
        totals = self.commissions.totals(self.scope_clause())
        return {key: str(value) for key, value in totals.items()}

    # --------------------------------------------------------------- create
    def accrue_for_payment(self, booking, payment) -> Commission | None:
        """The agent earns their rate on every payment the customer makes, until the booking is paid up.

        A hierarchy is one commission pool, and a deal pays only the one path that brought it: the selling
        agent earns the slice they hold, and each upline earns what is left of their own rate on that deal.
        Parallel agents (the other branches of the same pool holder) earn nothing, and the path never pays out
        more than the pool.

        Example: the pool holder holds 20% and gives one agent 14%, who gives their own agent 8%. The 14% agent
        keeps 6% on that branch, so the bottom agent's deal pays 8% + 6% + 6% = 20%; a deal by the 14% agent
        pays 14% + 6% = 20%; and if another agent under the pool holder holds 4%, their deals pay 4% + 16%.

        Idempotent per payment. A booking that still carries an older whole-deal commission is left alone so the
        same money is never commissioned twice. Returns the booking agent's own commission."""
        if booking.agent_id is None:
            return None
        existing = self.commissions.list(filters={"booking_id": booking.id}, limit=1000)
        if any(c.payment_id is None for c in existing):
            return None
        already = [c for c in existing if c.payment_id == payment.id]
        if already:
            return next((c for c in already if c.agent_id == booking.agent_id), already[0])

        agent = self.agents.get(booking.agent_id)
        if agent is None:
            raise BusinessRuleError("Booking references an unknown agent")
        return self._accrue(agent, Decimal(payment.amount), booking_id=booking.id, payment_id=payment.id,
                            on=f"a ₹{Decimal(payment.amount)} payment")

    def accrue_for_application(self, application) -> Commission | None:
        """The agent earns their rate on the enrollment fee too (the application fee never earns commission).

        Same hierarchy rules as a payment: the selling agent earns the slice they hold and each upline what is left
        of their own rate. Idempotent per application; nothing accrues for a cancelled application or a zero fee."""
        fee = Decimal(application.enrollment_fee or 0)
        if application.agent_id is None or fee <= 0 or application.status == "CANCELLED":
            return None
        existing = self.commissions.list(filters={"application_id": application.id}, limit=100)
        if existing:
            return next((c for c in existing if c.agent_id == application.agent_id), existing[0])
        agent = self.agents.get(application.agent_id)
        if agent is None:
            return None
        return self._accrue(agent, fee, application_id=application.id, on=f"a ₹{fee} enrollment fee")

    def _accrue(self, agent, received: Decimal, *, booking_id: int | None = None, payment_id: int | None = None,
                application_id: int | None = None, on: str = "a payment") -> Commission | None:
        """One commission row per person on the selling chain, for money the customer paid."""
        from app.services.org_settings import setting_text

        default_rate = Decimal(setting_text(self.db, "tax", "defaultCommission")) / 100
        tds_rate = self._tds_rate()

        # The seller earns their slice; each upline earns what is left of their own rate on this one path.
        earners: list[tuple[object, Decimal]] = [(agent, commission_rate_for(Decimal(agent.commission_rate), default_rate))]
        child = agent
        for upline_agent in self.agents.upline(agent):
            held = Decimal(upline_agent.commission_rate)
            promised = Decimal(child.assigned_rate if child.assigned_rate is not None else child.commission_rate)
            kept = held - promised
            if kept > 0:
                earners.append((upline_agent, kept.quantize(Decimal("0.0001"))))
            child = upline_agent

        own: Commission | None = None
        for earner, rate in earners:
            gross, tds, net = split_commission(received, rate, tds_rate)
            commission = Commission(
                agent_id=earner.id,
                source_agent_id=agent.id,
                booking_id=booking_id,
                payment_id=payment_id,
                application_id=application_id,
                deal_value=received,
                rate=rate,
                gross_amount=gross,
                tds_amount=tds,
                net_amount=net,
                status="PAYABLE",
            )
            self.commissions.create(commission)
            if own is None:
                own = commission
            what = "accrued" if earner is agent else f"team override accrued (deal by {agent.name})"
            self.audit.log(
                action=AuditAction.CREATE, resource=self.resource, resource_id=commission.public_id,
                summary=f"Commission ₹{net} {what} on {on} at {rate}", actor=self.actor,
            )
        return own

    def withdraw_for_application(self, application, *, delete: bool) -> None:
        """The application's fee was cancelled or corrected: its commissions are cancelled (or removed, to be
        re-accrued). Refused once any of them has been paid out."""
        from sqlalchemy import select

        rows = list(self.db.execute(select(Commission).where(
            Commission.application_id == application.id, Commission.is_deleted == 0)).scalars())
        if any(c.status == "PAID" for c in rows):
            raise BusinessRuleError("The agent's commission on this enrollment fee has already been paid out, so it cannot be changed")
        for commission in rows:
            if delete:
                self.db.delete(commission)
            else:
                commission.status = "CANCELLED"
        self.db.flush()

    def create_manual(self, payload: CommissionCreate) -> Commission:
        self._authorise("create")
        agent = self.agents.get_or_404(payload.agent_id)
        if payload.booking_id and self.commissions.list(filters={"booking_id": payload.booking_id}, limit=1):
            raise BusinessRuleError("A commission already exists for this booking")
        gross, tds, net = split_commission(payload.deal_value, payload.rate, self._tds_rate())
        commission = Commission(
            agent_id=agent.id,
            booking_id=payload.booking_id,
            deal_value=payload.deal_value,
            rate=payload.rate,
            gross_amount=gross,
            tds_amount=tds,
            net_amount=net,
            status="PAYABLE",
        )
        self.commissions.create(commission)
        self._audit(AuditAction.CREATE, commission, summary=f"Manual commission ₹{net}")
        return commission

    # ------------------------------------------------------------- workflow
    def decide(self, commission_id: int, payload: CommissionDecision) -> Commission:
        status = payload.status
        permission = (
            Permission.COMMISSION_PAYOUT
            if status in ("PAID", "PROCESSING")
            else Permission.COMMISSION_APPROVE
        )
        if not self.actor.can(permission):
            raise PermissionDeniedError(f"{permission.value} is required for {status}")
        commission = self.commissions.get_or_404(commission_id)
        transitions = {
            "PAYABLE": {"APPROVED", "ON_HOLD", "PROCESSING"},
            "PROCESSING": {"APPROVED", "ON_HOLD"},
            "APPROVED": {"PROCESSING", "PAID", "ON_HOLD"},
            "ON_HOLD": {"APPROVED", "REJECTED"},
            "PAID": set(),
            "REJECTED": set(),
        }
        if payload.status != commission.status and payload.status not in transitions.get(commission.status, set()):
            raise BusinessRuleError(f"Cannot move a commission from {commission.status} to {payload.status}")

        before = commission.status
        commission.status = payload.status
        if payload.status == "PAID":
            if not payload.payout_reference:
                raise BusinessRuleError("A bank payout reference is required to mark a commission paid")
            commission.payout_reference = payload.payout_reference
            commission.paid_at = self.commissions.now()
        if payload.status == "APPROVED":
            commission.approved_by_id = self.actor.user_id
            commission.approved_at = self.commissions.now()
        self.db.flush()
        self._audit(
            AuditAction.APPROVE if payload.status in ("APPROVED", "PAID") else AuditAction.REJECT,
            commission,
            before={"status": before},
            after={"status": commission.status},
            summary=f"Commission {payload.status}: {payload.reason or 'no reason given'}",
        )
        return commission

    def payable(self) -> list[CommissionResponse]:
        self._authorise("view")
        return [self.serialise(c) for c in self.commissions.payable()]
