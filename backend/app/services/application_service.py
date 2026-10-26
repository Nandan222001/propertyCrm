"""Applications — step 1 of a booking: the application fee and enrollment fee are taken before any plot is allotted."""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.core.constants import AuditAction, Permission
from app.core.context import ActorContext, PaginationContext
from app.core.exceptions import BusinessRuleError, PermissionDeniedError
from app.core.responses import Paginated
from app.models.application import Application
from app.repositories.application_repository import ApplicationRepository
from app.repositories.customer_repository import CustomerRepository
from app.repositories.property_repository import ProjectRepository
from app.schemas.application import ApplicationCreate, ApplicationResponse
from app.services.base_service import BaseService


class ApplicationService(BaseService[Application]):
    resource = "application"
    repository_class = ApplicationRepository
    permissions = {
        "view": (Permission.BOOKING_VIEW_ALL, Permission.BOOKING_VIEW_OWN),
        "create": Permission.BOOKING_CREATE,
        "update": Permission.BOOKING_UPDATE,
        "delete": Permission.BOOKING_DELETE,
    }

    def __init__(self, db: Session, actor: ActorContext) -> None:
        super().__init__(db, actor)
        self.applications: ApplicationRepository = self.repository  # type: ignore[assignment]
        self.customers = CustomerRepository(db)
        self.projects = ProjectRepository(db)

    def scope_clause(self):
        # Everyone who sees all bookings sees every application; an agent only the ones for their own customers.
        if self.actor.can(Permission.BOOKING_VIEW_ALL):
            return None
        return Application.agent_id == (self.actor.agent_id or -1)

    def serialise(self, application: Application) -> ApplicationResponse:
        return ApplicationResponse(
            id=application.id, public_id=application.public_id, receipt_number=application.receipt_number,
            customer_id=application.customer_id,
            customer_name=application.customer.name if application.customer else None,
            project_id=application.project_id, project_name=application.project.name if application.project else None,
            agent_id=application.agent_id,
            application_fee=application.application_fee, enrollment_fee=application.enrollment_fee, total=application.total,
            payment_mode=application.payment_mode, reference=application.reference, paid_to=application.paid_to,
            received_on=application.received_on, status=application.status, booking_id=application.booking_id,
            booking_number=application.booking.booking_number if application.booking else None,
            created_at=application.created_at, updated_at=application.updated_at,
        )

    def paginate(self, page: PaginationContext) -> Paginated[Application]:
        return self.list(page, scope_clause=self.scope_clause())

    def record(self, payload: ApplicationCreate) -> Application:
        """Take the application fee and enrollment fee from a customer, and issue the receipt."""
        self._authorise("create")
        customer = self.customers.get_or_404(payload.customer_id)
        project = self.projects.get_or_404(payload.project_id)
        if customer.is_deleted:
            raise BusinessRuleError("This customer record is not available")
        if customer.is_pending_approval:
            raise BusinessRuleError("Customer approval is pending — an admin must approve first")
        if not self.actor.can(Permission.CUSTOMER_VIEW_ALL) and customer.agent_id != self.actor.agent_id:
            raise PermissionDeniedError("This customer belongs to another agent")
        received_on = payload.received_on or date.today()
        application = Application(
            receipt_number=self.applications.next_number(year=received_on.year),
            customer_id=customer.id, project_id=project.id, agent_id=customer.agent_id or self.actor.agent_id,
            application_fee=payload.application_fee, enrollment_fee=payload.enrollment_fee,
            payment_mode=payload.payment_mode, reference=(payload.reference or None),
            paid_to=(payload.paid_to or "").strip() or None, received_on=received_on, status="OPEN",
            recorded_by_id=self.actor.user_id,
        )
        self.applications.create(application)
        self._audit(AuditAction.CREATE, application, after={"receipt": application.receipt_number, "total": str(application.total)},
                    summary=f"Application {application.receipt_number}: ₹{application.total} received for {project.name}")
        return application

    def allot(self, application_id: int, booking) -> Application:
        """The customer has been allotted a plot: close the application against that booking."""
        application = self.applications.get_or_404(application_id)
        if application.customer_id != booking.customer_id:
            raise BusinessRuleError("This application belongs to a different customer")
        if application.status != "OPEN":
            raise BusinessRuleError(f"Application {application.receipt_number} is already {application.status.lower()}")
        application.status = "ALLOTTED"
        application.booking_id = booking.id
        self.db.flush()
        return application

    def reopen_for_booking(self, booking_id: int) -> None:
        """The booking fell through (rejected or deleted): the customer's application is open again for another plot."""
        for application in self.applications.list(filters={"booking_id": booking_id}, limit=50):
            application.status = "OPEN"
            application.booking_id = None
        self.db.flush()
