"""Customer master data — the most PII-dense table in the system.

Privacy engineering applied here (see ``docs/DATA_PRIVACY.md``):
* ``email``/``phone``/``address``/``kyc_reference`` are Fernet-encrypted at rest;
* ``email_index`` / ``phone_index`` are HMAC blind indexes so uniqueness and
  search work without decrypting or storing plaintext;
* ``consent_*`` columns record lawful basis and can be flipped off by the data
  subject (DPDP/GDPR "right to withdraw consent");
* ``anonymised_at`` marks rows scrubbed by the erasure workflow, which keeps the
  financial history intact while removing identifying details.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.constants import ApprovalStatus
from app.db.base import Base, PkMixin, PublicIdMixin, SoftDeleteMixin, TimestampMixin, UTCDateTime


class Customer(Base, PkMixin, PublicIdMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "customers"

    name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    legal_entity: Mapped[str | None] = mapped_column(String(160))

    # ---- encrypted PII (ciphertext only) -------------------------------
    email: Mapped[str | None] = mapped_column(String(512))
    phone: Mapped[str | None] = mapped_column(String(512))
    address: Mapped[str | None] = mapped_column(Text)
    kyc_reference: Mapped[str | None] = mapped_column(String(512))
    # ---- blind indexes for lookup/uniqueness ---------------------------
    email_index: Mapped[str | None] = mapped_column(String(80), index=True)
    phone_index: Mapped[str | None] = mapped_column(String(80), index=True)

    city: Mapped[str | None] = mapped_column(String(80))
    pincode: Mapped[str | None] = mapped_column(String(10))
    pan_number: Mapped[str | None] = mapped_column(String(512))

    status: Mapped[str] = mapped_column(
        String(24), default=ApprovalStatus.PENDING_APPROVAL.value, index=True
    )
    source: Mapped[str | None] = mapped_column(String(60))
    notes: Mapped[str | None] = mapped_column(Text)

    agent_id: Mapped[int | None] = mapped_column(
        ForeignKey("agents.id", ondelete="SET NULL"), index=True
    )
    approved_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    approved_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    # ---- privacy / compliance -----------------------------------------
    consent_given: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    consent_given_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    consent_purpose: Mapped[str | None] = mapped_column(String(160))
    marketing_opt_in: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    anonymised_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    agent = relationship("Agent", back_populates="customers", lazy="joined")
    bookings = relationship("Booking", back_populates="customer", lazy="selectin")
    documents = relationship("Document", back_populates="customer", lazy="selectin")

    @property
    def is_pending_approval(self) -> bool:
        return self.status == ApprovalStatus.PENDING_APPROVAL.value


class CustomerConsent(Base, PkMixin, TimestampMixin):
    """Append-only consent ledger (auditors ask *when* consent was captured)."""

    __tablename__ = "customer_consents"

    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    purpose: Mapped[str] = mapped_column(String(160), nullable=False)
    granted: Mapped[bool] = mapped_column(Boolean, nullable=False)
    policy_version: Mapped[str] = mapped_column(String(24), nullable=False, default="v1")
    captured_via: Mapped[str | None] = mapped_column(String(60))
    ip_address: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(255))
