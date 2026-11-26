"""Give agents the commission they have earned on enrollment fees received before commission was calculated on them.

Safe to run again: an application that already has its commissions is skipped, and cancelled applications, zero
enrollment fees and applications without an agent earn nothing.

    cd backend && PYTHONPATH=. .venv/bin/python scripts/backfill_enrollment_commissions.py
"""

from __future__ import annotations

from sqlalchemy import func, select

from app.core.context import ActorContext
from app.db.session import session_scope
from app.db.tenancy import set_scope
from app.models.application import Application
from app.models.payment import Commission
from app.models.tenant import Tenant
from app.models.user import User
from app.services.commission_service import CommissionService
from app.services.rbac_service import RBACService


def main() -> None:
    with session_scope() as db:
        tenant_ids = [t.id for t in db.execute(select(Tenant)).scalars()]
    for tenant_id in tenant_ids:
        with session_scope() as db:
            set_scope(db, tenant_id)
            admin = db.execute(select(User).where(User.tenant_id == tenant_id, User.role == "ADMIN", User.is_deleted == 0)).scalars().first()
            if admin is None:
                continue
            rbac = RBACService(db)
            granted, revoked = rbac.overrides(admin)
            actor = ActorContext(user_id=admin.id, public_id=admin.public_id, name=admin.name, email=admin.email, role=admin.role,
                                 customer_id=None, agent_id=None, tenant_id=tenant_id, tenant_name=None,
                                 extra_permissions=granted, revoked_permissions=revoked, ip_address="127.0.0.1",
                                 user_agent="backfill", request_id="backfill")
            service = CommissionService(db, actor)
            count = lambda: db.execute(select(func.count(Commission.id)).where(  # noqa: E731
                Commission.application_id.is_not(None), Commission.is_deleted == 0)).scalar_one()
            before = count()
            for application in db.execute(select(Application).where(Application.is_deleted == 0, Application.status != "CANCELLED")).scalars().all():
                service.accrue_for_application(application)
            db.flush()
            made = count() - before
            print(f"tenant {tenant_id}: {made} commission row(s) created")


if __name__ == "__main__":
    main()
