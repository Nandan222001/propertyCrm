"""The letterhead of the *signed-in organisation* (invoices, receipts, PDFs).

Never a global constant: each tenant prints its own name; address / GSTIN / phone / e-mail come from
the tenant's ``company.*`` settings (falling back to the tenant's contact details).
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.audit import AppSetting
from app.models.tenant import Tenant


def company_profile(db: Session, tenant_id: int | None) -> dict[str, str]:
    tenant = db.get(Tenant, tenant_id) if tenant_id else None
    if tenant is None:
        return {"name": "", "address": "", "gstin": "", "phone": "", "email": ""}
    base = {
        "name": tenant.name, "address": "", "gstin": "",
        "phone": tenant.contact_phone or "", "email": tenant.contact_email or "",
    }
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
