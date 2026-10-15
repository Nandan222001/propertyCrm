"""SQLAlchemy models. Importing this package registers every table on ``Base``."""

from app.db.base import Base
from app.models.audit import (
    AppSetting,
    AuditLog,
    DataSubjectRequest,
    LoginAttempt,
    Notification,
    SecurityEvent,
)
from app.models.billing import Invoice, InvoiceItem, InvoiceStatusHistory
from app.models.booking import Booking, BookingStatusHistory
from app.models.customer import Customer, CustomerConsent
from app.models.expense import Expense
from app.models.payment import Agent, Commission, Payment, Receipt
from app.models.payment_plan import BookingInstallment, PaymentPlan
from app.models.property import Document, Plot, Project
from app.models.tenant import Tenant
from app.models.user import AuthToken, User, UserPermissionGrant

__all__ = [
    "Agent",
    "AppSetting",
    "AuditLog",
    "AuthToken",
    "Base",
    "Booking",
    "BookingInstallment",
    "BookingStatusHistory",
    "Commission",
    "Expense",
    "Customer",
    "CustomerConsent",
    "DataSubjectRequest",
    "Document",
    "Invoice",
    "InvoiceItem",
    "InvoiceStatusHistory",
    "LoginAttempt",
    "Notification",
    "Payment",
    "PaymentPlan",
    "Plot",
    "Project",
    "Receipt",
    "SecurityEvent",
    "Tenant",
    "User",
    "UserPermissionGrant",
]
