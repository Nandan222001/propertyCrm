"""Role-aware dashboards and business-intelligence reports.

One entry point per concern so the SPA never computes KPIs client-side (that was
the demo's weakness: numbers lived in the browser). Each role receives only the
metrics it is permitted to see, assembled with aggregate queries.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.constants import (
    COMPANY,
    Permission,
    PlotStatus,
    Role,
)
from app.core.context import ActorContext
from app.core.exceptions import PermissionDeniedError
from app.core.responses import Paginated
from app.db.base import utcnow
from app.repositories.booking_repository import BookingRepository
from app.repositories.customer_repository import CustomerRepository
from app.repositories.finance_repository import AgentRepository, CommissionRepository, PaymentRepository
from app.repositories.property_repository import PlotRepository, ProjectRepository
from app.repositories.user_repository import UserRepository
from app.schemas.governance import DashboardMetric, DashboardResponse, ReportResponse, ReportRow
from app.services.base_service import BaseService


class DashboardService(BaseService):
    resource = "dashboard"
    repository_class = ProjectRepository  # dashboards read across modules
    permissions = {"view": Permission.DASHBOARD_VIEW}

    def __init__(self, db: Session, actor: ActorContext) -> None:
        super().__init__(db, actor)
        self.bookings = BookingRepository(db)
        self.payments = PaymentRepository(db)
        self.plots = PlotRepository(db)
        self.projects = ProjectRepository(db)
        self.customers = CustomerRepository(db)
        self.agents = AgentRepository(db)
        self.commissions = CommissionRepository(db)
        self.users = UserRepository(db)

    # --------------------------------------------------------------- helpers
    def _scope(self):
        if self.actor.can(Permission.BOOKING_VIEW_ALL):
            return None
        if self.actor.agent_id:
            return self.bookings.scope_clause_for(agent_id=self.actor.agent_id, customer_id=None)
        return self.bookings.scope_clause_for(agent_id=None, customer_id=self.actor.customer_id)

    def _metric(self, key: str, label: str, value: Decimal | float | int, unit: str = "INR",
                trend: float | None = None) -> DashboardMetric:
        return DashboardMetric(key=key, label=label, value=float(value), unit=unit, trend=trend)

    # ------------------------------------------------------------ dashboards
    def build(self) -> DashboardResponse:
        role = self.actor.resolved_role
        if not self.actor.can(Permission.DASHBOARD_VIEW):
            raise PermissionDeniedError("Dashboards are not available for your role")

        scope = self._scope()
        totals = self.bookings.totals(scope)
        inventory = self.plots.status_summary()
        metrics: list[DashboardMetric] = []
        charts: dict[str, list[dict]] = {}
        alerts: list[dict] = []

        if role in (Role.SUPER_ADMIN, Role.ADMIN):
            metrics = [
                self._metric("contract_value", "Contract value", totals["contract_value"]),
                self._metric("collected", "Collected", totals["collected"]),
                self._metric("outstanding", "Outstanding", totals["outstanding"]),
                self._metric("deals", "Active deals", totals["deals"], unit="count"),
            ]
            charts["inventory_by_status"] = [
                {"label": status, "value": count} for status, count in inventory.items()
            ]
            charts["collections_trend"] = self._collections_trend()
            alerts = self._alerts()
        elif role == Role.SALES_MANAGER:
            leaderboard = self.agents.leaderboard(limit=10)
            metrics = [
                self._metric("contract_value", "Team contract value", totals["contract_value"]),
                self._metric("collected", "Team collected", totals["collected"]),
                self._metric("deals", "Team deals", totals["deals"], unit="count"),
                self._metric("avg_deal", "Average deal size",
                             (totals["contract_value"] / totals["deals"]) if totals["deals"] else 0),
            ]
            charts["agent_leaderboard"] = [
                {"label": row["name"], "value": float(row["sales"] or 0)} for row in leaderboard
            ]
        elif role == Role.SALES_AGENT:
            metrics = [
                self._metric("my_sales", "My sales value", totals["contract_value"]),
                self._metric("my_collected", "My collections", totals["collected"]),
                self._metric("my_deals", "My deals", totals["deals"], unit="count"),
                self._metric("my_commission", "My commission (net)",
                             self.commissions.totals(self._commission_scope())["net"]),
            ]
            charts["my_pipeline"] = self._agent_pipeline()
        elif role == Role.ACCOUNTS:
            overdue = self.payments.aging_buckets().get("90+", Decimal("0"))
            metrics = [
                self._metric("collected", "Collected", totals["collected"]),
                self._metric("outstanding", "Outstanding", totals["outstanding"]),
                self._metric("overdue_90", "Overdue 90+ days", overdue),
                self._metric("receipts_month", "Receipts this month", self._receipt_count_month(), unit="count"),
            ]
            charts["aging"] = [
                {"label": bucket, "value": float(value)} for bucket, value in self.payments.aging_buckets().items()
            ]
            alerts = self._alerts()
        elif role == Role.MANAGEMENT:
            values = self.plots.inventory_value()
            metrics = [
                self._metric("gdv", "Gross development value", sum(values.values())),
                self._metric("collected", "Collected to date", totals["collected"]),
                self._metric("outstanding", "Receivable pipeline", totals["outstanding"]),
                self._metric("unsold_value", "Unsold inventory", values.get(PlotStatus.AVAILABLE.value, 0)),
            ]
            charts["inventory_by_status"] = [
                {"label": status, "value": count} for status, count in inventory.items()
            ]
            charts["absorption"] = self._collections_trend()
        else:  # customer portal
            portal = self.bookings.totals(
                self.bookings.scope_clause_for(agent_id=None, customer_id=self.actor.customer_id)
            )
            metrics = [
                self._metric("my_contracts", "My contract value", portal["contract_value"]),
                self._metric("my_paid", "Paid", portal["collected"]),
                self._metric("my_due", "Balance due", portal["outstanding"]),
            ]

        return DashboardResponse(
            role=role.value,
            metrics=metrics,
            charts=charts,
            alerts=alerts,
            generated_at=utcnow(),
        )

    def _commission_scope(self):
        from app.models.payment import Commission

        return Commission.agent_id == (self.actor.agent_id or -1)

    def _collections_trend(self, *, months: int = 6) -> list[dict]:
        today = date.today().replace(day=1)
        points: list[dict] = []
        for offset in range(months - 1, -1, -1):
            month_start = (today - timedelta(days=offset * 30)).replace(day=1)
            month_end = (month_start + timedelta(days=31)).replace(day=1) - timedelta(days=1)
            points.append({
                "label": month_start.strftime("%b %Y"),
                "value": float(self.payments.collected_between(month_start, month_end)),
            })
        return points

    def _agent_pipeline(self) -> list[dict]:
        counts = self.bookings.status_counts(self._scope())
        return [{"label": status, "value": count} for status, count in counts.items()]

    def _receipt_count_month(self) -> int:
        from sqlalchemy import func, select

        from app.models.payment import Receipt

        start = date.today().replace(day=1)
        return int(
            self.db.execute(
                select(func.count(Receipt.id)).where(Receipt.issued_on >= start)
            ).scalar_one()
            or 0
        )

    def _alerts(self) -> list[dict]:
        alerts: list[dict] = []
        pending_bookings = len(self.bookings.pending_approval())
        if pending_bookings:
            alerts.append({"severity": "warning", "title": f"{pending_bookings} booking(s) awaiting approval"})
        pending_customers = len(self.customers.pending_approval())
        if pending_customers:
            alerts.append({"severity": "info", "title": f"{pending_customers} customer(s) awaiting approval"})
        overdue = self.payments.aging_buckets()
        if overdue.get("90+", Decimal("0")) > 0:
            alerts.append({
                "severity": "critical",
                "title": f"₹{overdue['90+']} overdue beyond 90 days",
            })
        return alerts


class ReportService(BaseService):
    """Report library. Same shape for every report so the UI stays generic."""

    resource = "report"
    repository_class = BookingRepository
    permissions = {"view": Permission.REPORT_VIEW}

    def __init__(self, db: Session, actor: ActorContext) -> None:
        super().__init__(db, actor)
        self.bookings = BookingRepository(db)
        self.payments = PaymentRepository(db)
        self.plots = PlotRepository(db)
        self.agents = AgentRepository(db)
        self.customers = CustomerRepository(db)

    def _range(self, start: date | None, end: date | None) -> tuple[date, date]:
        end = end or date.today()
        start = start or (end.replace(day=1))
        if start > end:
            from app.core.exceptions import ValidationError

            raise ValidationError("Report start date must be before the end date", code="invalid_range")
        return start, end

    def _envelope(self, name: str, start: date, end: date, totals: dict, rows: list[ReportRow]) -> ReportResponse:
        return ReportResponse(
            report=name,
            generated_at=utcnow(),
            range={"start": start, "end": end},
            totals=totals,
            rows=rows,
        )

    # ------------------------------------------------------------- reports
    def sales(self, start: date | None = None, end: date | None = None) -> ReportResponse:
        self._authorise("view")
        start, end = self._range(start, end)
        rows_in_range = [
            booking for booking in self.bookings.list(sort="booking_date:asc")
            if start <= booking.booking_date <= end
        ]
        totals = {
            "bookings": len(rows_in_range),
            "contract_value": sum((b.final_price for b in rows_in_range), Decimal("0")),
            "collected": sum((b.paid_amount for b in rows_in_range), Decimal("0")),
        }
        rows = [
            ReportRow(label=booking.booking_number, values={
                "customer": booking.customer.name if booking.customer else None,
                "project": booking.project.name if booking.project else None,
                "plot": booking.plot.plot_number if booking.plot else None,
                "status": booking.status,
                "value": float(booking.final_price),
                "paid": float(booking.paid_amount),
                "balance": float(booking.balance),
                "date": booking.booking_date.isoformat(),
            })
            for booking in rows_in_range
        ]
        return self._envelope("sales", start, end, totals, rows)

    def collections(self, start: date | None = None, end: date | None = None) -> ReportResponse:
        self._authorise("view")
        start, end = self._range(start, end)
        payments = [
            payment for payment in self.payments.list(sort="received_on:asc")
            if start <= payment.received_on <= end
        ]
        totals = {
            "receipts": len(payments),
            "collected": sum((p.amount for p in payments), Decimal("0")),
        }
        rows = [
            ReportRow(label=payment.public_id, values={
                "date": payment.received_on.isoformat(),
                "amount": float(payment.amount),
                "mode": payment.mode,
                "booking": payment.booking.booking_number if payment.booking else None,
                "status": payment.status,
            })
            for payment in payments
        ]
        return self._envelope("collections", start, end, totals, rows)

    def inventory(self) -> ReportResponse:
        self._authorise("view")
        summary = self.plots.status_summary()
        values = self.plots.inventory_value()
        rows = [
            ReportRow(label=project.name, values={
                **{f"plots_{status.lower()}": count for status, count in counts.items()},
                "total_plots": sum(counts.values()),
            })
            for project, counts in self.projects.with_plot_counts()
        ]
        return self._envelope(
            "inventory", date.today(), date.today(),
            {**{f"plots_{k.lower()}": v for k, v in summary.items()},
             "inventory_value": sum(Decimal(str(v)) for v in values.values())},
            rows,
        )

    def ageing(self) -> ReportResponse:
        self._authorise("view")
        buckets = self.payments.aging_buckets()
        rows = [ReportRow(label=bucket, values={"amount": float(amount)}) for bucket, amount in buckets.items()]
        return self._envelope("ageing", date.today(), date.today(),
                              {"total_receivable": sum(buckets.values())}, rows)

    def agent_performance(self) -> ReportResponse:
        self._authorise("view")
        leaderboard = self.agents.leaderboard(limit=50)
        rows = [
            ReportRow(label=row["name"], values={
                "code": row["code"],
                "deals": row["deals"],
                "sales": float(row["sales"] or 0),
                "collected": float(row["collected"] or 0),
                "outstanding": float((row["sales"] or 0) - (row["collected"] or 0)),
            })
            for row in leaderboard
        ]
        return self._envelope("agent_performance", date.today(), date.today(),
                              {"agents": len(leaderboard)}, rows)

    def daily(self, *, as_of: date | None = None) -> ReportResponse:
        self._authorise("view")
        day = as_of or date.today()
        bookings_today = [
            booking for booking in self.bookings.list(sort="booking_date:desc")
            if booking.booking_date == day
        ]
        collected = self.payments.collected_between(day, day)
        totals = {
            "bookings": len(bookings_today),
            "collected": collected,
            "company_gstin": COMPANY["gstin"],
        }
        rows = [ReportRow(label="Collections", values={"amount": float(collected)})]
        rows += [
            ReportRow(label=booking.booking_number, values={"status": booking.status,
                                                            "value": float(booking.final_price)})
            for booking in bookings_today
        ]
        return self._envelope("daily", day, day, totals, rows)

    def audit_trail(self, *, days: int = 7) -> dict:
        if not self.actor.can(Permission.AUDIT_VIEW):
            raise PermissionDeniedError("Audit trail access requires audit:view")
        from app.services.audit_service import AuditService

        return AuditService(self.db).activity_summary(days=days)

    def paginated_passthrough(self, page) -> Paginated:
        """Generic hook for future report types without breaking the envelope."""
        self._authorise("view")
        return self.bookings.paginate(page=page.page, page_size=page.page_size)
