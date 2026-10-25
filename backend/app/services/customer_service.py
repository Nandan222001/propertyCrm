"""Customer service: creation with encrypted PII, approvals, masking, erasure."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.constants import ApprovalStatus, AuditAction, BookingStatus, Permission, Role, UserStatus
from app.core.context import ActorContext, PaginationContext
from app.core.exceptions import BusinessRuleError, ConflictError, PermissionDeniedError, ValidationError
from app.core.passwords import initial_password
from app.core.responses import Paginated
from app.core.security import hash_password
from app.core.validators import mask_address, mask_email, mask_name, mask_phone
from app.db.base import utcnow
from app.models.booking import Booking
from app.models.customer import Customer, CustomerConsent
from app.models.property import Project
from app.models.user import User
from app.repositories.customer_repository import (
    CustomerConsentRepository,
    CustomerRepository,
    DataSubjectRequestRepository,
)
from app.repositories.finance_repository import AgentRepository
from app.repositories.user_repository import AuthTokenRepository, UserRepository
from app.schemas.customer import (
    CustomerCreate,
    CustomerDecision,
    CustomerResponse,
    CustomerUpdate,
    DataSubjectRequestCreate,
)
from app.services.base_service import BaseService
from app.services.notification_service import agent_user_id, emit


class CustomerService(BaseService[Customer]):
    resource = "customer"
    repository_class = CustomerRepository
    permissions = {
        "view": (Permission.CUSTOMER_VIEW_ALL, Permission.CUSTOMER_VIEW_OWN),
        "create": Permission.CUSTOMER_CREATE,
        "update": Permission.CUSTOMER_UPDATE,
        "delete": Permission.CUSTOMER_DELETE,
        "approve": Permission.CUSTOMER_APPROVE,
    }

    def __init__(self, db: Session, actor: ActorContext) -> None:
        super().__init__(db, actor)
        self.customers: CustomerRepository = self.repository  # type: ignore[assignment]
        self.consents = CustomerConsentRepository(db)
        self.requests = DataSubjectRequestRepository(db)
        self.agents = AgentRepository(db)
        #: Plain-language result of the portal-login step of the last ``create_customer`` call.
        self.portal_login = ""

    # ------------------------------------------------------------ scope hint
    def scope_clause(self):
        """Row-level security: agents see their book, customers see themselves."""
        if self.actor.can(Permission.CUSTOMER_VIEW_ALL):
            return None
        if self.actor.is_customer_portal:
            return self.customers.scope_clause_for(agent_id=None, self_customer_id=self.actor.customer_id)
        return self.customers.scope_clause_for(agent_id=self.actor.agent_id, self_customer_id=None)

    # ------------------------------------------------------------------ read
    def paginate(self, page: PaginationContext) -> Paginated[Customer]:
        self._authorise("view")
        return self.customers.paginate(
            page=page.page, page_size=page.page_size, search=page.search, sort=page.sort,
            filters=page.filters, scope_clause=self.scope_clause(),
        )

    def get_customer(self, customer_id: int) -> Customer:
        self._authorise("view")
        return self.get(customer_id, scope_clause=self.scope_clause())

    def pending(self) -> list[Customer]:
        self._authorise("approve")
        return self.customers.pending_approval()

    def consent_history(self, customer_id: int) -> list[CustomerConsent]:
        return self.consents.history_for(customer_id)

    # ---------------------------------------------------------------- serialise
    def serialise(self, customer: Customer, *, mask: bool | None = None) -> CustomerResponse:
        """Masked by default; full PII only for roles holding ``pii:reveal``."""
        pii = self.customers.decrypt_pii(customer)
        reveal = self.actor.can(Permission.PII_REVEAL)
        # Default: masked. A caller may force masking (portal views); only roles
        # holding pii:reveal ever see raw values.
        should_mask = (not reveal) if mask is None else mask
        agent = self.agents.get(customer.agent_id) if customer.agent_id else None

        if should_mask:
            name = mask_name(customer.name) if self.actor.is_customer_portal or not reveal else customer.name
            email = mask_email(pii["email"])
            phone = mask_phone(pii["phone"])
            address = mask_address(pii["address"])
        else:
            name = customer.name
            email = pii["email"]
            phone = pii["phone"]
            address = pii["address"]

        bookings = customer.bookings or []
        outstanding = sum(float(b.balance) for b in bookings if b.is_deleted == 0)
        return CustomerResponse(
            id=customer.id,
            public_id=customer.public_id,
            name=name,
            email=email,
            phone=phone,
            city=customer.city,
            pincode=customer.pincode,
            address=address,
            status=customer.status,
            source=customer.source,
            agent_id=customer.agent_id,
            agent_name=agent.name if agent else None,
            project_id=customer.project_id,
            project_name=customer.project.name if customer.project else None,
            consent_given=customer.consent_given,
            marketing_opt_in=customer.marketing_opt_in,
            anonymised_at=customer.anonymised_at,
            masked=should_mask,
            booking_count=len(bookings),
            outstanding=outstanding,
            created_at=customer.created_at,
            updated_at=customer.updated_at,
        )

    # ---------------------------------------------------------------- create
    def create_customer(self, payload: CustomerCreate) -> Customer:
        self._authorise("create")
        if self.customers.find_by_email(payload.email):
            raise ConflictError("A customer with this e-mail already exists")
        if self.customers.find_by_phone(payload.phone):
            raise ConflictError("A customer with this mobile number already exists")

        agent_id = self.actor.agent_id
        if payload.agent_code and not self.actor.is_customer_portal:
            agent = self.agents.get_by_code(payload.agent_code)
            if agent is None:
                raise BusinessRuleError(f"Unknown agent code {payload.agent_code}")
            agent_id = agent.id

        if payload.project_id is not None and self.db.get(Project, payload.project_id) is None:
            raise BusinessRuleError("Unknown project")

        values = payload.model_dump(exclude={"agent_code"})
        values["agent_id"] = agent_id
        # Agents must never be able to self-approve their own data entry; an approver's own entry is approved at once.
        by_approver = self.actor.can(Permission.CUSTOMER_APPROVE)
        values["status"] = (ApprovalStatus.APPROVED if by_approver else ApprovalStatus.PENDING_APPROVAL).value
        if by_approver:
            values["approved_by_id"] = self.actor.user_id
            values["approved_at"] = utcnow()
        values["consent_given_at"] = utcnow() if payload.consent_given else None

        customer = Customer(**self.customers.prepare_pii(values))
        self.customers.create(customer)

        if payload.consent_given:
            self.consents.create(
                CustomerConsent(
                    customer_id=customer.id,
                    purpose=payload.consent_purpose or "Booking & statutory communication",
                    granted=True,
                    captured_via="staff-entry",
                    ip_address=self.actor.ip_address,
                    user_agent=self.actor.user_agent,
                )
            )
        self._audit(AuditAction.CREATE, customer, after={"status": customer.status, "agent_id": agent_id},
                    summary="Customer created" + ("" if by_approver else " (pending approval)"))
        self.portal_login = self._provision_portal_login(customer, payload.email, payload.phone)
        # Tell the approvers — and only them — that something is waiting for sign-off.
        if not by_approver:
            emit(self.db, title="Customer awaiting approval",
                 body=f"{customer.name} was added by {self.actor.name} and needs admin approval.",
                 category="APPROVAL", audience_role=Role.ADMIN.value)
        return customer

    # ---------------------------------------------------------- portal login
    def _portal_user(self, customer: Customer) -> User | None:
        return self.db.execute(
            select(User).where(User.customer_id == customer.id, User.role == Role.CUSTOMER.value,
                               User.is_deleted.is_(False))
        ).scalars().first()

    def _provision_portal_login(self, customer: Customer, email: str, phone: str) -> str:
        """Give a new customer a sign-in: their e-mail + the starting password (never displayed)."""
        email = email.lower().strip()
        if UserRepository(self.db).get_by_email(email):
            return "no login created: this e-mail already belongs to another account"
        try:
            password = initial_password(customer.name, phone)
        except ValidationError as problem:
            return f"no login created: {problem.message}"
        self.db.add(User(
            name=customer.name, email=email, phone=phone, role=Role.CUSTOMER.value,
            title="Customer", status=UserStatus.INVITED.value, password_hash=hash_password(password),
            must_change_password=True, password_changed_at=utcnow(), customer_id=customer.id,
        ))
        self.db.flush()
        return "login created: e-mail + starting password (first 4 letters of the name + last 5 digits of the mobile)"

    def _drop_portal_login(self, customer: Customer, *, suspend_only: bool = False) -> None:
        user = self._portal_user(customer)
        if user is None:
            return
        AuthTokenRepository(self.db).revoke_all_for_user(user.id)
        if suspend_only:
            user.status = UserStatus.SUSPENDED.value
        else:
            user.soft_delete(self.actor.name)
        self.db.flush()

    def delete_customer(self, customer_id: int) -> Customer:
        """Remove a customer file. Agents may only remove their own, not-yet-approved entries."""
        self._authorise("delete")
        customer = self.get(customer_id, scope_clause=self.scope_clause())
        if not self.actor.can(Permission.CUSTOMER_APPROVE) and customer.status == ApprovalStatus.APPROVED.value:
            raise PermissionDeniedError("An approved customer can only be removed by an administrator")
        live = self.db.execute(
            select(func.count(Booking.id)).where(
                Booking.customer_id == customer.id, Booking.is_deleted.is_(False),
                Booking.status.notin_([BookingStatus.CANCELLED.value, BookingStatus.REJECTED.value]),
            )
        ).scalar_one()
        if live:
            raise BusinessRuleError("This customer still has active bookings — cancel or remove those first")
        self.customers.delete(customer, actor=self.actor.name)
        self._drop_portal_login(customer)
        self._audit(AuditAction.DELETE, customer, before=self._snapshot(customer), summary="Customer removed")
        return customer

    def update_customer(self, customer_id: int, payload: CustomerUpdate) -> Customer:
        self._authorise("update")
        customer = self.get(customer_id, scope_clause=self.scope_clause())
        if customer.anonymised_at is not None:
            raise BusinessRuleError("This record was erased and can no longer be edited")
        values = payload.model_dump(exclude_unset=True, exclude_none=True)

        if "email" in values:
            existing = self.customers.find_by_email(values["email"])
            if existing and existing.id != customer.id:
                raise ConflictError("Another customer already uses this e-mail")
        if "phone" in values:
            existing = self.customers.find_by_phone(values["phone"])
            if existing and existing.id != customer.id:
                raise ConflictError("Another customer already uses this mobile number")

        if "consent_given" in values:
            granted = bool(values.pop("consent_given"))
            if granted != customer.consent_given:
                customer.consent_given = granted
                customer.consent_given_at = utcnow() if granted else None
                self.consents.create(
                    CustomerConsent(
                        customer_id=customer.id,
                        purpose=payload.consent_purpose or "Booking & statutory communication",
                        granted=granted,
                        captured_via="staff-update",
                        ip_address=self.actor.ip_address,
                    )
                )
        self.customers.update(customer, self.customers.prepare_pii(values))
        portal = self._portal_user(customer)
        if portal is not None and "email" in values and not UserRepository(self.db).get_by_email(values["email"]):
            portal.email = values["email"].lower().strip()   # the customer signs in with their current e-mail
        self._audit(AuditAction.UPDATE, customer, summary="Customer updated")
        return customer

    # -------------------------------------------------------------- workflow
    def decide(self, customer_id: int, payload: CustomerDecision) -> Customer:
        self._authorise("approve")
        customer = self.customers.get_or_404(customer_id)
        if customer.is_pending_approval is False and payload.status == ApprovalStatus.APPROVED:
            return customer
        previous = customer.status
        customer.status = payload.status.value
        customer.approved_by_id = self.actor.user_id if payload.status == ApprovalStatus.APPROVED else None
        customer.approved_at = utcnow() if payload.status == ApprovalStatus.APPROVED else None
        self.db.flush()
        portal = self._portal_user(customer)
        if portal is not None:
            if payload.status == ApprovalStatus.REJECTED:
                self._drop_portal_login(customer, suspend_only=True)
            elif portal.status == UserStatus.SUSPENDED.value:
                portal.status = UserStatus.INVITED.value if portal.must_change_password else UserStatus.ACTIVE.value
        self._audit(
            AuditAction.APPROVE if payload.status == ApprovalStatus.APPROVED else AuditAction.REJECT,
            customer,
            before={"status": previous},
            after={"status": customer.status},
            summary=f"Customer {payload.status.value}: {payload.reason or 'no reason given'}",
        )
        # The agent who added this customer hears the outcome (nobody else does).
        agent = self.agents.get(customer.agent_id) if customer.agent_id else None
        agent_user = agent_user_id(self.db, agent)
        if agent_user is not None:
            outcome = "approved" if payload.status == ApprovalStatus.APPROVED else "rejected"
            emit(self.db, title=f"Customer {outcome}", body=f"{customer.name} was {outcome} by {self.actor.name}.",
                 category="APPROVAL", severity="info" if outcome == "approved" else "warning",
                 user_id=agent_user)
        return customer

    # --------------------------------------------------------------- privacy
    def erase(self, customer_id: int, *, reason: str) -> Customer:
        """Right to erasure: irreversible scrubbing, financial rows preserved."""
        if not self.actor.can(Permission.DATA_ERASURE):
            raise PermissionDeniedError("Your role cannot execute erasure requests")
        customer = self.customers.get_or_404(customer_id)
        before = {"name": customer.name, "status": customer.status}
        self.customers.anonymise(customer)
        self._drop_portal_login(customer)
        self._audit(AuditAction.ERASURE, customer, before=before,
                    after={"anonymised_at": str(customer.anonymised_at)},
                    summary=f"Customer erased: {reason}")
        self.audit.security_event(
            "privacy.erasure",
            f"Customer {customer.public_id} anonymised",
            severity="info",
            actor=self.actor,
            context={"reason": reason},
        )
        return customer

    def create_data_request(self, payload: DataSubjectRequestCreate) -> object:
        from datetime import timedelta

        from app.models.audit import DataSubjectRequest

        request = DataSubjectRequest(
            request_type=payload.request_type,
            details=payload.details,
            status="RECEIVED",
            due_by=utcnow() + timedelta(days=30),  # DPDP/GDPR one-month SLA
        )
        self.requests.create(request)
        self._audit(AuditAction.CREATE, request, summary=f"Data subject request {payload.request_type}")
        return request

    def export_personal_data(self, customer_id: int) -> dict:
        """Right of access: machine-readable export of everything we hold."""
        if not self.actor.can(Permission.DATA_EXPORT):
            raise PermissionDeniedError("Your role cannot export personal data")
        customer = self.customers.get_or_404(customer_id)
        return {
            "customer": {
                "public_id": customer.public_id,
                **self.customers.decrypt_pii(customer),
                "city": customer.city,
                "status": customer.status,
                "created_at": customer.created_at,
            },
            "bookings": [
                {
                    "booking_number": b.booking_number,
                    "status": b.status,
                    "final_price": str(b.final_price),
                    "paid_amount": str(b.paid_amount),
                }
                for b in customer.bookings
            ],
            "consents": [
                {"purpose": c.purpose, "granted": c.granted, "at": c.created_at}
                for c in self.consents.history_for(customer.id)
            ],
            "documents": [{"title": d.title, "kind": d.kind} for d in customer.documents],
            "generated_at": utcnow().isoformat(),
        }

    # ------------------------------------------------------------- reporting
    def counts_by_status(self) -> dict[str, int]:
        rows = self.customers.list()
        summary = {status.value: 0 for status in ApprovalStatus}
        for customer in rows:
            summary[customer.status] = summary.get(customer.status, 0) + 1
        return summary

    def assert_agent_owns(self, customer: Customer) -> None:
        """Guards agent workflows (booking creation) against cross-agent access."""
        if self.actor.can(Permission.CUSTOMER_VIEW_ALL):
            return
        if self.actor.resolved_role == Role.SALES_AGENT and customer.agent_id != self.actor.agent_id:
            raise PermissionDeniedError("This customer belongs to another agent")
