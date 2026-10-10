"""The letterhead of the *signed-in organisation* (invoices, receipts, PDFs).

Never a global constant: each tenant prints its own name; address / GSTIN / phone / e-mail come from
the tenant's ``company.*`` settings (falling back to the tenant's contact details). Only the seeded
sample organisation (slug ``lalita``) keeps the sample letterhead as a default.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.constants import COMPANY
from app.models.audit import AppSetting
from app.models.tenant import Tenant

SAMPLE_SLUG = "lalita"


def company_profile(db: Session, tenant_id: int | None) -> dict[str, str]:
    tenant = db.get(Tenant, tenant_id) if tenant_id else None
    if tenant is None:
        return dict(COMPANY)
    base = dict(COMPANY) if tenant.slug == SAMPLE_SLUG else {
        "name": tenant.name, "address": "", "gstin": "",
        "phone": tenant.contact_phone or "", "email": tenant.contact_email or "",
    }
    base["name"] = base["name"] if tenant.slug == SAMPLE_SLUG else tenant.name
    rows = db.execute(
        select(AppSetting.key, AppSetting.value)
        .where(AppSetting.key.like("company.%"), AppSetting.tenant_id == tenant.id)
        .execution_options(all_tenants=True)
    ).all()
    for key, value in rows:
        field = key.split(".", 1)[1]
        if field in base and value:
            base[field] = value
    return base
