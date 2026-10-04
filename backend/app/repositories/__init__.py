"""Data access layer. Only this package issues queries."""

from app.repositories.base_repository import BaseRepository
from app.repositories.booking_repository import BookingRepository, BookingStatusHistoryRepository
from app.repositories.customer_repository import CustomerConsentRepository, CustomerRepository
from app.repositories.finance_repository import (
    AgentRepository,
    CommissionRepository,
    PaymentRepository,
    ReceiptRepository,
)
from app.repositories.governance_repository import (
    AppSettingRepository,
    AuditLogRepository,
    NotificationRepository,
    SecurityEventRepository,
)
from app.repositories.property_repository import DocumentRepository, PlotRepository, ProjectRepository
from app.repositories.user_repository import (
    AuthTokenRepository,
    LoginAttemptRepository,
    UserPermissionGrantRepository,
    UserRepository,
)

__all__ = [
    "AgentRepository",
    "AppSettingRepository",
    "AuditLogRepository",
    "AuthTokenRepository",
    "BaseRepository",
    "BookingRepository",
    "BookingStatusHistoryRepository",
    "CommissionRepository",
    "CustomerConsentRepository",
    "CustomerRepository",
    "DocumentRepository",
    "LoginAttemptRepository",
    "NotificationRepository",
    "PaymentRepository",
    "PlotRepository",
    "ProjectRepository",
    "ReceiptRepository",
    "SecurityEventRepository",
    "UserPermissionGrantRepository",
    "UserRepository",
]
