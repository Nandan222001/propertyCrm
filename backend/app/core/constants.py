"""Domain constants shared by models, services and the RBAC layer.

Kept in ``core`` (not in models) so services, schemas and tests can import them
without pulling in SQLAlchemy.
"""

from __future__ import annotations

from enum import StrEnum as _StrEnum


class StrEnum(_StrEnum):
    """String enum that serialises to its value (JSON clean, ``str()``-safe)."""

    def __str__(self) -> str:  # pragma: no cover - trivial
        return str(self.value)


class Role(StrEnum):
    SUPER_ADMIN = "SUPER_ADMIN"
    ADMIN = "ADMIN"
    SALES_MANAGER = "SALES_MANAGER"
    SALES_AGENT = "SALES_AGENT"
    ACCOUNTS = "ACCOUNTS"
    MANAGEMENT = "MANAGEMENT"
    CUSTOMER = "CUSTOMER"


class Permission(StrEnum):
    """Fine-grained capabilities. Routes never check roles directly."""

    # property / inventory
    PROJECT_VIEW = "project:view"
    PROJECT_WRITE = "project:write"
    PLOT_VIEW = "plot:view"
    PLOT_WRITE = "plot:write"
    # sales
    BOOKING_VIEW_ALL = "booking:view_all"
    BOOKING_VIEW_OWN = "booking:view_own"
    BOOKING_CREATE = "booking:create"
    BOOKING_UPDATE = "booking:update"
    BOOKING_APPROVE = "booking:approve"
    BOOKING_DELETE = "booking:delete"
    # customers
    CUSTOMER_VIEW_ALL = "customer:view_all"
    CUSTOMER_VIEW_OWN = "customer:view_own"
    CUSTOMER_CREATE = "customer:create"
    CUSTOMER_UPDATE = "customer:update"
    CUSTOMER_APPROVE = "customer:approve"
    CUSTOMER_DELETE = "customer:delete"
    # finance
    PAYMENT_VIEW_ALL = "payment:view_all"
    PAYMENT_VIEW_OWN = "payment:view_own"
    PAYMENT_CREATE = "payment:create"
    PAYMENT_APPROVE = "payment:approve"
    RECEIPT_MANAGE = "receipt:manage"
    COMMISSION_VIEW = "commission:view"
    COMMISSION_APPROVE = "commission:approve"
    COMMISSION_PAYOUT = "commission:payout"
    # analytics
    REPORT_VIEW = "report:view"
    REPORT_EXPORT = "report:export"
    DASHBOARD_VIEW = "dashboard:view"
    # governance
    DOCUMENT_VIEW = "document:view"
    DOCUMENT_UPLOAD = "document:upload"
    NOTIFICATION_VIEW = "notification:view"
    NOTIFICATION_MANAGE = "notification:manage"
    USER_VIEW = "user:view"
    USER_MANAGE = "user:manage"
    ROLE_MANAGE = "role:manage"
    AUDIT_VIEW = "audit:view"
    SETTINGS_MANAGE = "settings:manage"
    # privacy
    PII_REVEAL = "pii:reveal"          # unmasked phone / e-mail / address
    DATA_EXPORT = "data:export"
    DATA_ERASURE = "data:erase"        # GDPR/DPDP right-to-erasure execution


#: Role → permission matrix. This is the only place privileges are declared;
#: ``core.permissions.require`` and the /me endpoint both consume it.
ROLE_PERMISSIONS: dict[Role, frozenset[Permission]] = {
    Role.SUPER_ADMIN: frozenset(Permission),
    Role.ADMIN: frozenset(
        {
            Permission.PROJECT_VIEW, Permission.PROJECT_WRITE,
            Permission.PLOT_VIEW, Permission.PLOT_WRITE,
            Permission.BOOKING_VIEW_ALL, Permission.BOOKING_CREATE,
            Permission.BOOKING_UPDATE, Permission.BOOKING_APPROVE, Permission.BOOKING_DELETE,
            Permission.CUSTOMER_VIEW_ALL, Permission.CUSTOMER_CREATE,
            Permission.CUSTOMER_UPDATE, Permission.CUSTOMER_APPROVE, Permission.CUSTOMER_DELETE,
            Permission.PAYMENT_VIEW_ALL, Permission.PAYMENT_CREATE, Permission.PAYMENT_APPROVE,
            Permission.RECEIPT_MANAGE, Permission.COMMISSION_VIEW, Permission.COMMISSION_APPROVE,
            Permission.REPORT_VIEW, Permission.REPORT_EXPORT, Permission.DASHBOARD_VIEW,
            Permission.DOCUMENT_VIEW, Permission.DOCUMENT_UPLOAD,
            Permission.NOTIFICATION_VIEW, Permission.NOTIFICATION_MANAGE,
            Permission.USER_VIEW, Permission.USER_MANAGE, Permission.PII_REVEAL,
        }
    ),
    Role.SALES_MANAGER: frozenset(
        {
            Permission.PROJECT_VIEW, Permission.PLOT_VIEW, Permission.PLOT_WRITE,
            Permission.BOOKING_VIEW_ALL, Permission.BOOKING_CREATE, Permission.BOOKING_UPDATE,
            Permission.CUSTOMER_VIEW_ALL, Permission.CUSTOMER_UPDATE,
            Permission.PAYMENT_VIEW_ALL, Permission.COMMISSION_VIEW, Permission.COMMISSION_APPROVE,
            Permission.REPORT_VIEW, Permission.REPORT_EXPORT, Permission.DASHBOARD_VIEW,
            Permission.DOCUMENT_VIEW, Permission.NOTIFICATION_VIEW, Permission.USER_VIEW,
            Permission.PII_REVEAL,
        }
    ),
    Role.SALES_AGENT: frozenset(
        {
            Permission.PROJECT_VIEW, Permission.PLOT_VIEW,
            Permission.BOOKING_VIEW_OWN, Permission.BOOKING_CREATE,
            Permission.CUSTOMER_VIEW_OWN, Permission.CUSTOMER_CREATE, Permission.CUSTOMER_UPDATE,
            Permission.COMMISSION_VIEW, Permission.DASHBOARD_VIEW,
            Permission.DOCUMENT_VIEW, Permission.NOTIFICATION_VIEW,
        }
    ),
    Role.ACCOUNTS: frozenset(
        {
            Permission.PROJECT_VIEW, Permission.PLOT_VIEW,
            Permission.BOOKING_VIEW_ALL, Permission.CUSTOMER_VIEW_ALL,
            Permission.PAYMENT_VIEW_ALL, Permission.PAYMENT_CREATE, Permission.PAYMENT_APPROVE,
            Permission.RECEIPT_MANAGE, Permission.COMMISSION_VIEW, Permission.COMMISSION_PAYOUT,
            Permission.REPORT_VIEW, Permission.REPORT_EXPORT, Permission.DASHBOARD_VIEW,
            Permission.DOCUMENT_VIEW, Permission.DOCUMENT_UPLOAD, Permission.NOTIFICATION_VIEW,
            Permission.PII_REVEAL,
        }
    ),
    Role.MANAGEMENT: frozenset(
        {
            Permission.PROJECT_VIEW, Permission.PLOT_VIEW,
            Permission.BOOKING_VIEW_ALL, Permission.CUSTOMER_VIEW_ALL, Permission.PAYMENT_VIEW_ALL,
            Permission.COMMISSION_VIEW, Permission.REPORT_VIEW, Permission.REPORT_EXPORT,
            Permission.DASHBOARD_VIEW, Permission.DOCUMENT_VIEW, Permission.NOTIFICATION_VIEW,
        }
    ),
    Role.CUSTOMER: frozenset(
        {
            Permission.PROJECT_VIEW, Permission.PLOT_VIEW, Permission.BOOKING_VIEW_OWN,
            Permission.PAYMENT_VIEW_OWN, Permission.DOCUMENT_VIEW, Permission.NOTIFICATION_VIEW,
        }
    ),
}

#: Roles that are allowed to reach staff-only surfaces (everything but the portal).
STAFF_ROLES = frozenset(
    {Role.SUPER_ADMIN, Role.ADMIN, Role.SALES_MANAGER, Role.SALES_AGENT, Role.ACCOUNTS, Role.MANAGEMENT}
)


class UserStatus(StrEnum):
    ACTIVE = "ACTIVE"
    INVITED = "INVITED"
    SUSPENDED = "SUSPENDED"
    LOCKED = "LOCKED"


class PlotStatus(StrEnum):
    AVAILABLE = "AVAILABLE"
    HOLD = "HOLD"
    BOOKED = "BOOKED"
    SOLD = "SOLD"


class BookingStatus(StrEnum):
    PENDING_APPROVAL = "PENDING_APPROVAL"
    CONFIRMED = "CONFIRMED"
    AGREEMENT = "AGREEMENT"
    REGISTERED = "REGISTERED"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"


class PaymentStatus(StrEnum):
    PENDING = "PENDING"
    PARTIALLY_PAID = "PARTIALLY_PAID"
    PAID = "PAID"
    OVERDUE = "OVERDUE"


class ApprovalStatus(StrEnum):
    PENDING_APPROVAL = "PENDING_APPROVAL"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class AuditAction(StrEnum):
    LOGIN = "auth.login"
    LOGIN_FAILED = "auth.login_failed"
    LOGOUT = "auth.logout"
    TOKEN_REFRESH = "auth.token_refresh"
    PASSWORD_CHANGE = "auth.password_change"
    ACCOUNT_LOCKED = "auth.account_locked"
    PERMISSION_DENIED = "rbac.denied"
    RATE_LIMITED = "security.rate_limited"
    CREATE = "crud.create"
    READ = "crud.read"
    UPDATE = "crud.update"
    DELETE = "crud.delete"
    APPROVE = "workflow.approve"
    REJECT = "workflow.reject"
    EXPORT = "data.export"
    PII_REVEAL = "privacy.pii_reveal"
    ERASURE = "privacy.erasure"
    BACKUP = "ops.backup"
    CONFIG_CHANGE = "ops.config_change"


class DocumentKind(StrEnum):
    BOOKING_FORM = "BOOKING_FORM"
    ALLOTMENT_LETTER = "ALLOTMENT_LETTER"
    AGREEMENT = "AGREEMENT"
    RECEIPT = "RECEIPT"
    KYC = "KYC"
    TAX_INVOICE = "TAX_INVOICE"
    OTHER = "OTHER"


#: Indian number formatting / commission and tax defaults (single source for services).
COMMISSION_SLABS: tuple[tuple[int, float], ...] = ((10, 0.02), (5, 0.018), (0, 0.015))
TDS_RATE = 0.05
GST_RATE = 0.18
COMPANY = {
    "name": "Lalita Realestate Infra",
    "address": "Head Office, Mumbai, Maharashtra",
    "gstin": "27AAACL1234K1ZV",
    "phone": "+91 98765 00001",
    "email": "accounts@nmtsolution.demo",
}
