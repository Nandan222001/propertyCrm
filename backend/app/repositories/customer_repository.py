"""Customer repository — encrypts on write, decrypts behind a permission check."""

from __future__ import annotations

from sqlalchemy import or_, select

from app.core.constants import ApprovalStatus
from app.core.crypto import decrypt, encrypt
from app.core.security import blind_index
from app.db.base import utcnow
from app.models.audit import DataSubjectRequest
from app.models.customer import Customer, CustomerConsent
from app.repositories.base_repository import BaseRepository

#: Columns that must never be written or read in clear text.
PII_COLUMNS = ("email", "phone", "address", "kyc_reference", "pan_number")


class CustomerRepository(BaseRepository[Customer]):
    model = Customer
    searchable = ("name", "city", "pincode")  # PII columns are searchable only via blind index
    sortable = {
        "id": Customer.id,
        "name": Customer.name,
        "status": Customer.status,
        "created_at": Customer.created_at,
    }
    default_sort = "created_at"

    # ------------------------------------------------------------ encryption
    def prepare_pii(self, payload: dict) -> dict:
        """Encrypt PII fields and maintain the blind indexes in one place."""
        data = dict(payload)
        if "email" in data and data["email"] is not None:
            email = (data["email"] or "").strip().lower()
            data["email_index"] = blind_index(email) if email else None
            data["email"] = encrypt(email) if email else None
        if "phone" in data and data["phone"] is not None:
            phone = "".join(ch for ch in str(data["phone"]) if ch.isdigit())
            data["phone_index"] = blind_index(phone) if phone else None
            data["phone"] = encrypt(phone) if phone else None
        for column in ("address", "kyc_reference", "pan_number"):
            if column in data and data[column] is not None:
                data[column] = encrypt(str(data[column]))
        return data

    def decrypt_pii(self, customer: Customer) -> dict:
        """Return display fields; callers decide whether to mask them."""
        return {
            "email": decrypt(customer.email),
            "phone": decrypt(customer.phone),
            "address": decrypt(customer.address),
            "kyc_reference": decrypt(customer.kyc_reference),
            "pan_number": decrypt(customer.pan_number),
        }

    def find_by_email(self, email: str) -> Customer | None:
        return self.get_by(email_index=blind_index((email or "").strip().lower()))

    def find_by_phone(self, phone: str) -> Customer | None:
        digits = "".join(ch for ch in str(phone) if ch.isdigit())
        return self.get_by(phone_index=blind_index(digits))

    # ------------------------------------------------------------- scoping
    def scope_clause_for(self, *, agent_id: int | None, self_customer_id: int | None):
        """Row-level security expressed as a SQL predicate (never client-side)."""
        if self_customer_id is not None:
            return Customer.id == self_customer_id
        if agent_id is not None:
            return Customer.agent_id == agent_id
        return None

    def pending_approval(self) -> list[Customer]:
        return self.list(filters={"status": ApprovalStatus.PENDING_APPROVAL.value}, sort="created_at:asc")

    def anonymise(self, customer: Customer, *, keep_city: bool = True) -> Customer:
        """Right-to-erasure: strip identifiers, preserve statutory financial data."""
        customer.name = f"Erased customer #{customer.id}"
        customer.email = None
        customer.phone = None
        customer.address = None
        customer.kyc_reference = None
        customer.pan_number = None
        customer.email_index = None
        customer.phone_index = None
        if not keep_city:
            customer.city = None
        customer.notes = None
        customer.anonymised_at = utcnow()
        customer.consent_given = False
        self.db.flush()
        return customer

    def search_candidates(self, *, status: str | None = None, agent_id: int | None = None) -> list[Customer]:
        stmt = select(Customer).where(Customer.is_deleted == 0)
        if status:
            stmt = stmt.where(Customer.status == status)
        if agent_id is not None:
            stmt = stmt.where(or_(Customer.agent_id == agent_id, Customer.agent_id.is_(None)))
        return list(self.db.execute(stmt).scalars().all())


class CustomerConsentRepository(BaseRepository[CustomerConsent]):
    model = CustomerConsent
    sortable = {"id": CustomerConsent.id, "created_at": CustomerConsent.created_at}
    default_sort = "created_at"

    def history_for(self, customer_id: int) -> list[CustomerConsent]:
        return self.list(filters={"customer_id": customer_id}, sort="created_at:desc")


class DataSubjectRequestRepository(BaseRepository[DataSubjectRequest]):
    model = DataSubjectRequest
    sortable = {"id": DataSubjectRequest.id, "created_at": DataSubjectRequest.created_at}
    default_sort = "created_at"
