"""Agent commissions: slab-based calculation, approval and payout."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.orm import Session

from app.core.constants import COMMISSION_SLABS, TDS_RATE, AuditAction, Permission
from app.core.context import ActorContext, PaginationContext
from app.core.exceptions import BusinessRuleError, PermissionDeniedError
from app.core.responses import Paginated
from app.models.payment import Commission
from app.repositories.finance_repository import AgentRepository, CommissionRepository
from app.schemas.finance import CommissionCreate, CommissionDecision, CommissionResponse
from app.services.base_service import BaseService

MONEY = Decimal("0.01")


def commission_rate_for(deals_closed: int, override: Decimal | None = None) -> Decimal:
    """Slab table in one place: 10+ deals → 2%, 5+ → 1.8%, else 1.5%."""
    if override is not None and override > 0:
        return Decimal(override)
    for threshold, rate in COMMISSION_SLABS:
        if deals_closed >= threshold:
            return Decimal(str(rate))
    return Decimal(str(COMMISSION_SLABS[-1][1]))


def split_commission(deal_value: Decimal, rate: Decimal) -> tuple[Decimal, Decimal, Decimal]:
    """Return ``(gross, tds, net)`` rounded to paise using half-up rounding."""
    gross = (Decimal(deal_value) * Decimal(rate)).quantize(MONEY, rounding=ROUND_HALF_UP)
    tds = (gross * Decimal(str(TDS_RATE))).quantize(MONEY, rounding=ROUND_HALF_UP)
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
        if self.actor.can(Permission.COMMISSION_APPROVE) or self.actor.can(Permission.COMMISSION_PAYOUT):
            return None
        return Commission.agent_id == (self.actor.agent_id or -1)

    # ----------------------------------------------------------------- read
    def paginate(self, page: PaginationContext) -> Paginated[Commission]:
        self._authorise("view")
        return self.commissions.paginate(
            page=page.page, page_size=page.page_size, search=page.search, sort=page.sort,
            filters=page.filters, scope_clause=self.scope_clause(),
        )

    def serialise(self, commission: Commission) -> CommissionResponse:
        return CommissionResponse(
            id=commission.id,
            public_id=commission.public_id,
            agent_id=commission.agent_id,
            agent_name=commission.agent.name if commission.agent else None,
            booking_id=commission.booking_id,
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
    def ensure_for_booking(self, booking) -> Commission | None:
        """Idempotent: called on every confirmed booking, creates at most one row."""
        if booking.agent_id is None:
            return None
        existing = self.commissions.get_by(booking_id=booking.id)
        if existing is not None:
            return existing

        agent = self.agents.get(booking.agent_id)
        if agent is None:
            raise BusinessRuleError("Booking references an unknown agent")
        deals = self.agents.leaderboard(limit=100)  # includes computed deal counts
        deals_closed = next((row["deals"] for row in deals if row["id"] == agent.id), 0)
        rate = commission_rate_for(deals_closed, Decimal(agent.commission_rate))
        gross, tds, net = split_commission(Decimal(booking.final_price), rate)

        commission = Commission(
            agent_id=agent.id,
            booking_id=booking.id,
            deal_value=Decimal(booking.final_price),
            rate=rate,
            gross_amount=gross,
            tds_amount=tds,
            net_amount=net,
            status="PAYABLE",
        )
        self.commissions.create(commission)
        self.audit.log(
            action=AuditAction.CREATE, resource=self.resource, resource_id=commission.public_id,
            summary=f"Commission ₹{net} accrued at {rate}", actor=self.actor,
        )
        return commission

    def create_manual(self, payload: CommissionCreate) -> Commission:
        self._authorise("create")
        agent = self.agents.get_or_404(payload.agent_id)
        if payload.booking_id and self.commissions.get_by(booking_id=payload.booking_id):
            raise BusinessRuleError("A commission already exists for this booking")
        gross, tds, net = split_commission(payload.deal_value, payload.rate)
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
