"""Create the first platform owner (Super Admin) of a fresh installation.

The application ships with no sample data and no default accounts. After the schema exists, run this
once; the platform owner then creates organisations (each with its own administrator) from the
Tenants console, and administrators create everyone else.

    python -m app.db.create_platform_admin --name "Full Name" --email owner@example.com

The password is asked for interactively (or taken from the ``PLATFORM_ADMIN_PASSWORD`` environment
variable for automated installs). It must satisfy the password policy.
"""

from __future__ import annotations

import argparse
import getpass
import os
import sys

from app.core.constants import Role, UserStatus
from app.core.logging import configure_logging
from app.core.security import hash_password
from app.core.validators import normalise_mobile, validate_email, validate_password
from app.db.base import utcnow
from app.db.session import session_scope
from app.db.tenancy import clear_scope
from app.models.user import User


def create_platform_admin(name: str, email: str, phone: str | None, password: str) -> User:
    email = validate_email(email).lower().strip()
    validate_password(password)
    with session_scope() as session:
        clear_scope(session)
        if session.query(User).filter(User.email == email).first():
            raise SystemExit(f"An account with {email} already exists.")
        user = User(
            name=name.strip(), email=email, phone=normalise_mobile(phone) if phone else None, role=Role.SUPER_ADMIN.value,
            title="Platform owner", status=UserStatus.ACTIVE.value, password_hash=hash_password(password),
            password_changed_at=utcnow(), tenant_id=None,
        )
        session.add(user)
        session.flush()
        return user


def main(argv: list[str] | None = None) -> None:  # pragma: no cover - CLI entry point
    configure_logging()
    parser = argparse.ArgumentParser(description="Create the first platform owner (Super Admin).")
    parser.add_argument("--name", required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--phone", default=None, help="optional")
    args = parser.parse_args(argv)
    password = os.getenv("PLATFORM_ADMIN_PASSWORD") or getpass.getpass("Password: ")
    if not os.getenv("PLATFORM_ADMIN_PASSWORD") and getpass.getpass("Repeat password: ") != password:
        sys.exit("The passwords do not match.")
    user = create_platform_admin(args.name, args.email, args.phone, password)
    print(f"Platform owner {user.email} created. Sign in and create the first organisation.")


if __name__ == "__main__":  # pragma: no cover
    main()
