"""Re-express unapproved whole-deal commissions as one commission per payment received.

Commissions that were already approved or paid keep their whole-deal row (the money was agreed or paid out), and no
further commission accrues on those bookings.

Revision ID: d4f8b1c3e5a7
Revises: c3e7a9b2d4f6
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

import sqlalchemy as sa
from alembic import context, op

revision = "d4f8b1c3e5a7"
down_revision = "c3e7a9b2d4f6"
branch_labels = None
depends_on = None

MONEY = Decimal("0.01")


def upgrade() -> None:
    if context.is_offline_mode():   # a data fix: nothing to render as static SQL
        return
    bind = op.get_bind()
    meta = sa.MetaData()
    commissions = sa.Table("commissions", meta, autoload_with=bind)
    payments = sa.Table("payments", meta, autoload_with=bind)
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    legacy = bind.execute(sa.select(commissions).where(
        commissions.c.payment_id.is_(None), commissions.c.booking_id.isnot(None),
        commissions.c.status == "PAYABLE", commissions.c.is_deleted == 0)).mappings().all()
    for row in legacy:
        gross_total = Decimal(row["gross_amount"])
        tds_share = (Decimal(row["tds_amount"]) / gross_total) if gross_total else Decimal("0")
        paid = bind.execute(sa.select(payments.c.id, payments.c.amount).where(
            payments.c.booking_id == row["booking_id"], payments.c.is_deleted == 0)).all()
        bind.execute(commissions.update().where(commissions.c.id == row["id"]).values(is_deleted=1, deleted_at=now))
        for payment_id, amount in paid:
            amount = Decimal(amount)
            gross = (amount * Decimal(row["rate"])).quantize(MONEY, rounding=ROUND_HALF_UP)
            tds = (gross * tds_share).quantize(MONEY, rounding=ROUND_HALF_UP)
            bind.execute(commissions.insert().values(
                tenant_id=row["tenant_id"], public_id=f"COM-{uuid.uuid4().hex[:10].upper()}",
                agent_id=row["agent_id"], booking_id=row["booking_id"], payment_id=payment_id,
                deal_value=amount, rate=row["rate"], gross_amount=gross, tds_amount=tds, net_amount=gross - tds,
                status="PAYABLE", is_deleted=0, created_at=now, updated_at=now))


def downgrade() -> None:
    pass
