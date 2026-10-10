"""Organisation settings shown on every receipt / invoice: company profile, bank details, tax rules.

Stored per tenant in ``app_settings`` as ``<section>.<field>`` so every user and device of an
organisation prints the same letterhead. Reading is open to any signed-in member of the
organisation (accounts staff print receipts); writing needs ``settings:manage``.
"""

from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.constants import AuditAction
from app.core.context import ActorContext
from app.core.exceptions import ValidationError
from app.models.audit import AppSetting
from app.repositories.governance_repository import AppSettingRepository
from app.services.audit_service import AuditService
from app.services.company_profile import company_profile

SECTIONS: dict[str, dict[str, int]] = {
    "company": {"name": 160, "address": 400, "gstin": 15, "phone": 24, "email": 190},
    "bank": {"bankName": 120, "accountName": 160, "accountNumber": 18, "ifsc": 11, "upi": 80},
    "tax": {"receiptPrefix": 6, "defaultGst": 6, "tdsRate": 6, "dueDays": 4},
}
DEFAULTS = {
    "bank": {"bankName": "", "accountName": "", "accountNumber": "", "ifsc": "", "upi": ""},
    "tax": {"receiptPrefix": "RCT", "defaultGst": "0.18", "tdsRate": "5", "dueDays": "15"},
}
PATTERNS = {
    ("company", "gstin"): r"^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$",
    ("bank", "accountNumber"): r"^\d{9,18}$",
    ("bank", "ifsc"): r"^[A-Z]{4}0[A-Z0-9]{6}$",
    ("bank", "upi"): r"^[\w.\-]+@[\w\-]+$",
    ("tax", "receiptPrefix"): r"^[A-Za-z]{2,6}$",
    ("tax", "tdsRate"): r"^\d{1,2}(\.\d+)?$",
    ("tax", "dueDays"): r"^\d{1,3}$",
    ("company", "email"): r"^[^@\s]+@[^@\s]+\.[^@\s]+$",
}
_CONTROL = re.compile(r"[\x00-\x1f<>]")


def read_all(db: Session, tenant_id: int | None) -> dict[str, dict[str, str]]:
    result = {section: dict(DEFAULTS.get(section, {})) for section in SECTIONS}
    result["company"] = company_profile(db, tenant_id)
    rows = db.execute(select(AppSetting.key, AppSetting.value)).all()
    for key, value in rows:
        section, _, field = key.partition(".")
        if section in SECTIONS and field in SECTIONS[section] and value is not None and section != "company":
            result[section][field] = value
    return result


def write_section(db: Session, actor: ActorContext, section: str, values: dict[str, object]) -> dict[str, str]:
    if section not in SECTIONS:
        raise ValidationError("Unknown settings section", code="invalid_section")
    allowed = SECTIONS[section]
    clean: dict[str, str] = {}
    for field, limit in allowed.items():
        raw = values.get(field, "")
        text = "" if raw is None else str(raw).strip()
        if len(text) > limit or _CONTROL.search(text):
            raise ValidationError(f"{field}: invalid or too long", code="invalid_value")
        pattern = PATTERNS.get((section, field))
        if text and pattern and not re.match(pattern, text.upper() if field in ("gstin", "ifsc") else text):
            raise ValidationError(f"{field}: invalid format", code="invalid_value")
        clean[field] = text.upper() if field in ("gstin", "ifsc", "receiptPrefix") else text
    if section == "company" and not clean["name"]:
        raise ValidationError("Company name is required", code="invalid_value")
    repo = AppSettingRepository(db)
    last = None
    for field, text in clean.items():
        last = repo.upsert(f"{section}.{field}", text, category=section, updated_by_id=actor.user_id)
    if last is not None:
        AuditService(db).log(
            action=AuditAction.CONFIG_CHANGE, resource="setting", resource_id=f"{section}.*",
            summary=f"Organisation {section} settings updated", actor=actor,
        )
    return clean


def get_value(db: Session, key: str, default: str) -> str:
    """One setting of the current organisation (the ORM tenant filter scopes the lookup)."""
    row = db.execute(select(AppSetting.value).where(AppSetting.key == key)).scalars().first()
    return row if row else default
