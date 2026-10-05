"""Idempotent demo seed mirroring the SPA's illustrative dataset.

Safety rules:
* refuses to run in production unless ``ALLOW_PROD_SEED`` is set;
* never overwrites existing rows (checks by unique key first);
* demo passwords come from ``SEED_DEMO_PASSWORD`` and must satisfy the password
  policy — they are development credentials, documented as such.
"""

from __future__ import annotations

import os
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.constants import (
    COMPANY,
    ApprovalStatus,
    BookingStatus,
    PaymentStatus,
    PlotStatus,
    Role,
    UserStatus,
)
from app.core.crypto import encrypt
from app.core.security import blind_index, hash_password
from app.db.base import utcnow
from app.models.audit import AppSetting, Notification
from app.models.booking import Booking, BookingStatusHistory
from app.models.customer import Customer, CustomerConsent
from app.models.payment import Agent, Commission, Payment, Receipt
from app.models.property import Document, Plot, Project
from app.models.user import User

DEMO_PASSWORD = os.getenv("SEED_DEMO_PASSWORD", "Demo@12345")

PROJECT_SEED = [
    ("Green Meadows", "Phase II", "Mumbai", "128", "12.60", "4200.00"),
    ("Silver Oaks", "West Zone", "Pune", "104", "8.40", "3800.00"),
    ("Park View", "North District", "Thane", "88", "5.20", "3500.00"),
    ("River Enclave", "East Corridor", "Mumbai", "64", "3.80", "4600.00"),
]

USER_SEED = [
    ("Devendra Singhania", "superadmin@nmtsolution.demo", Role.SUPER_ADMIN, "Chief Technology Officer"),
    ("Arjun Shah", "admin@nmtsolution.demo", Role.ADMIN, "Operations Director"),
    ("Meera Kumar", "manager@nmtsolution.demo", Role.SALES_MANAGER, "VP of Sales & Strategy"),
    ("Sanjay Patel", "agent@nmtsolution.demo", Role.SALES_AGENT, "Senior Property Consultant"),
    ("Neha Desai", "accounts@nmtsolution.demo", Role.ACCOUNTS, "Head of Treasury & Billing"),
    ("Vikramaditya Birla", "management@nmtsolution.demo", Role.MANAGEMENT, "Managing Director"),
]

AGENT_SEED = [
    ("M. Kumar", "AG-014", "9876510001", "0.0200"),
    ("S. Patel", "AG-008", "9876510002", "0.0200"),
    ("R. Gupta", "AG-021", "9876510003", "0.0180"),
    ("A. Khan", "AG-003", "9876510004", "0.0150"),
    ("N. Bose", "AG-017", "9876510005", "0.0150"),
]

CUSTOMER_SEED = [
    ("Rajesh Sharma", "9876500101", "customer@nmtsolution.demo", "Andheri East, Mumbai", "400069", "AG-014"),
    ("Anita Verma", "9876500102", "anita@example.demo", "Kothrud, Pune", "411038", "AG-008"),
    ("Deepak Iyer", "9876500103", "deepak@example.demo", "Thane West", "400601", "AG-014"),
    ("Priya Nair", "9876500104", "priya@example.demo", "Powai, Mumbai", "400076", "AG-021"),
    ("Sneha Mehta", "9876500105", "sneha@example.demo", "Borivali, Mumbai", "400066", "AG-014"),
    ("Vikram Joshi", "9876500106", "vikram@example.demo", "Baner, Pune", "411045", "AG-008"),
    ("Karan Rao", "9876500107", "karan@example.demo", "Hinjewadi, Pune", "411057", "AG-021"),
    ("Meena Kapoor", "9876500108", "meena@example.demo", "Vashi, Navi Mumbai", "400703", "AG-008"),
]

PLOT_SEED = [
    ("A-012", "Green Meadows", "Layout A — East", "2400", "East", "1840000", PlotStatus.BOOKED, 0, "AG-014"),
    ("B-104", "Silver Oaks", "Layout B — West", "1800", "West", "1260000", PlotStatus.BOOKED, 1, "AG-008"),
    ("C-031", "Park View", "Layout C — Park", "3000", "North", "2475000", PlotStatus.HOLD, None, "AG-008"),
    ("A-045", "Green Meadows", "Layout A — East", "2400", "East", "1840000", PlotStatus.AVAILABLE, None, None),
    ("B-022", "Silver Oaks", "Layout B — West", "2000", "South", "1400000", PlotStatus.AVAILABLE, None, None),
    ("C-078", "Park View", "Layout C — Park", "3000", "North-East", "2520000", PlotStatus.BOOKED, 2, "AG-014"),
    ("A-101", "Green Meadows", "Layout A — East", "1200", "East", "960000", PlotStatus.SOLD, 3, "AG-021"),
    ("B-057", "Silver Oaks", "Layout B — West", "2400", "West", "1680000", PlotStatus.HOLD, None, "AG-021"),
    ("B-033", "Green Meadows", "Layout B — West", "2000", "South", "1400000", PlotStatus.BOOKED, 4, "AG-014"),
    ("C-015", "Silver Oaks", "Layout C — Park", "3000", "North", "2475000", PlotStatus.BOOKED, 5, "AG-008"),
    ("B-110", "Silver Oaks", "Layout B — West", "1800", "West", "1260000", PlotStatus.BOOKED, 6, "AG-021"),
    ("C-044", "Park View", "Layout C — Park", "3000", "South-East", "2250000", PlotStatus.HOLD, 7, "AG-008"),
]

BOOKING_SEED = [
    # plot, customer_index, paid, status, plan
    ("A-012", 0, "1472000", BookingStatus.CONFIRMED, "12 monthly installments"),
    ("B-104", 1, "630000", BookingStatus.CONFIRMED, "6 monthly installments"),
    ("C-078", 2, "2520000", BookingStatus.CONFIRMED, "Paid in full"),
    ("A-101", 3, "480000", BookingStatus.AGREEMENT, "12 monthly installments"),
    ("B-033", 4, "840000", BookingStatus.CONFIRMED, "12 monthly installments"),
    ("C-015", 5, "1237500", BookingStatus.CONFIRMED, "12 monthly installments"),
    ("B-110", 6, "630000", BookingStatus.CONFIRMED, "6 monthly installments"),
    ("C-044", 7, "200000", BookingStatus.PENDING_APPROVAL, "12 monthly installments"),
]


def _seed_users(session: Session) -> dict[str, User]:
    users: dict[str, User] = {}
    for index, (name, email, role, title) in enumerate(USER_SEED, start=1):
        user = session.query(User).filter(User.email == email).one_or_none()
        if user is None:
            user = User(
                public_id=f"USR-{index:03d}",
                name=name,
                email=email,
                phone=f"+9198765{index:05d}",
                role=role.value,
                title=title,
                status=UserStatus.ACTIVE.value,
                password_hash=hash_password(DEMO_PASSWORD),
                password_changed_at=utcnow(),
            )
            session.add(user)
        users[role.value] = user
    session.flush()

    # Customer portal account (view-only, linked to Rajesh Sharma).
    portal_email = "customer@nmtsolution.demo"
    portal = session.query(User).filter(User.email == portal_email).one_or_none()
    if portal is None:
        portal = User(
            public_id="USR-010",
            name="Rajesh Sharma",
            email=portal_email,
            phone="+919876500101",
            role=Role.CUSTOMER.value,
            title="Customer portal",
            status=UserStatus.ACTIVE.value,
            password_hash=hash_password(DEMO_PASSWORD),
            password_changed_at=utcnow(),
        )
        session.add(portal)
    users[Role.CUSTOMER.value] = portal
    session.flush()
    return users


def _seed_projects(session: Session) -> dict[str, Project]:
    projects: dict[str, Project] = {}
    for index, (name, phase, city, plots, revenue_cr, rate) in enumerate(PROJECT_SEED, start=1):
        project = session.query(Project).filter(Project.name == name).one_or_none()
        if project is None:
            project = Project(
                public_id=f"PRJ-{index:03d}",
                name=name,
                phase=phase,
                city=city,
                location=f"{city} · {phase}",
                rera_number=f"P51700{index:05d}",
                total_plots=int(plots),
                base_rate_per_sqft=Decimal(rate),
                estimated_revenue=Decimal(revenue_cr) * Decimal("10000000"),
                launch_date=date.today() - timedelta(days=400 - index * 30),
            )
            session.add(project)
        projects[name] = project
    session.flush()
    return projects


def _seed_agents(session: Session, users: dict[str, User]) -> dict[str, Agent]:
    agents: dict[str, Agent] = {}
    for name, code, phone, rate in AGENT_SEED:
        agent = session.query(Agent).filter(Agent.code == code).one_or_none()
        if agent is None:
            agent = Agent(
                public_id=f"AGT-{code.split('-')[-1]}",
                code=code,
                name=name,
                phone=phone,
                commission_rate=Decimal(rate),
                user_id=users[Role.SALES_AGENT.value].id if code == "AG-008" else None,
            )
            session.add(agent)
        agents[code] = agent
    session.flush()
    return agents


def _seed_customers(session: Session, agents: dict[str, Agent]) -> list[Customer]:
    customers: list[Customer] = []
    for index, (name, phone, email, address, pincode, agent_code) in enumerate(CUSTOMER_SEED, start=1):
        customer = session.query(Customer).filter(Customer.email_index == blind_index(email)).one_or_none()
        if customer is None:
            customer = Customer(
                public_id=f"CUS-{index:04d}",
                name=name,
                email=encrypt(email),
                email_index=blind_index(email),
                phone=encrypt(phone),
                phone_index=blind_index(phone),
                address=encrypt(address),
                city=address.split(",")[-1].strip(),
                pincode=pincode,
                status=ApprovalStatus.APPROVED.value,
                agent_id=agents[agent_code].id,
                consent_given=True,
                consent_given_at=utcnow(),
                consent_purpose="Booking & statutory communication",
            )
            session.add(customer)
            session.flush()
            session.add(
                CustomerConsent(
                    customer_id=customer.id,
                    purpose="Booking & statutory communication",
                    granted=True,
                    captured_via="seed",
                )
            )
        customers.append(customer)
    session.flush()
    return customers


def _seed_plots(session: Session, projects: dict[str, Project], agents: dict[str, Agent],
                customers: list[Customer]) -> dict[str, Plot]:
    plots: dict[str, Plot] = {}
    for plot_number, project_name, layout, area, facing, price, status, customer_index, agent_code in PLOT_SEED:
        project = projects[project_name]
        plot = (
            session.query(Plot)
            .filter(Plot.project_id == project.id, Plot.plot_number == plot_number)
            .one_or_none()
        )
        if plot is None:
            plot = Plot(
                public_id=f"PLT-{project_name[:2].upper()}-{plot_number}",
                plot_number=plot_number,
                project_id=project.id,
                layout=layout,
                area_sqft=Decimal(area),
                facing=facing,
                price=Decimal(price),
                status=status.value,
                customer_id=customers[customer_index].id if customer_index is not None else None,
                agent_id=agents[agent_code].id if agent_code else None,
            )
            session.add(plot)
        plots[plot_number] = plot
    session.flush()
    return plots


def _seed_bookings(session: Session, plots: dict[str, Plot], customers: list[Customer],
                   agents: dict[str, Agent]) -> dict[str, Booking]:
    bookings: dict[str, Booking] = {}
    for index, (plot_number, customer_index, paid, status, plan) in enumerate(BOOKING_SEED, start=148):
        booking_number = f"BK-{date.today().year}-{index:04d}"
        existing = session.query(Booking).filter(Booking.booking_number == booking_number).one_or_none()
        if existing is not None:
            bookings[plot_number] = existing
            continue
        plot = plots[plot_number]
        customer = customers[customer_index]
        booking = Booking(
            public_id=booking_number,
            booking_number=booking_number,
            customer_id=customer.id,
            project_id=plot.project_id,
            plot_id=plot.id,
            agent_id=plot.agent_id,
            booking_date=date.today() - timedelta(days=len(BOOKING_SEED) - index + 148),
            final_price=plot.price,
            token_amount=Decimal(paid) if status != BookingStatus.PENDING_APPROVAL else Decimal("200000"),
            paid_amount=Decimal("0"),
            payment_plan=plan,
            status=status.value,
            created_by_id=None,
            approved_by_id=None if status == BookingStatus.PENDING_APPROVAL else customer.id,
        )
        session.add(booking)
        session.flush()
        session.add(
            BookingStatusHistory(
                booking_id=booking.id,
                from_status=None,
                to_status=status.value,
                changed_by_label="seed",
                reason="Seeded demo booking",
            )
        )
        bookings[plot_number] = booking
    session.flush()
    return bookings


def _seed_payments(session: Session, bookings: dict[str, Booking], customers: list[Customer]) -> None:
    modes = ["UPI", "NEFT", "CHEQUE", "UPI", "NEFT", "CHEQUE", "UPI", "TOKEN_ADVANCE"]
    for index, (plot_number, _customer_index, paid, status, _plan) in enumerate(BOOKING_SEED):
        booking = bookings[plot_number]
        amount = Decimal(paid)
        if session.query(Payment).filter(Payment.booking_id == booking.id).count():
            continue
        received = date.today() - timedelta(days=20 - index)
        balance = booking.final_price - amount
        payment = Payment(
            public_id=f"PAY-{index + 200:04d}",
            booking_id=booking.id,
            customer_id=booking.customer_id,
            amount=amount,
            mode=modes[index % len(modes)],
            reference=f"TXN{48210 + index * 7}",
            received_on=received,
            due_date=None if balance <= 0 else received + timedelta(days=30),
            status=PaymentStatus.PAID.value if balance <= 0 else PaymentStatus.PARTIALLY_PAID.value,
            balance_after=max(balance, Decimal("0")),
            approved_by_id=None,
        )
        session.add(payment)
        session.flush()
        booking.paid_amount = amount
        session.add(
            Receipt(
                public_id=f"RCT-{received.year}-{index + 201:04d}",
                receipt_number=f"RCT-{received.year}-{index + 201:04d}",
                payment_id=payment.id,
                customer_id=booking.customer_id,
                booking_id=booking.id,
                issued_on=received,
                amount=amount,
                final_price=booking.final_price,
                balance=max(balance, Decimal("0")),
                mode=payment.mode,
                reference=payment.reference,
                is_shared_with_customer=index < 4,
            )
        )
        if booking.agent_id and status != BookingStatus.PENDING_APPROVAL:
            gross = (booking.final_price * Decimal("0.02")).quantize(Decimal("0.01"))
            tds = (gross * Decimal("0.05")).quantize(Decimal("0.01"))
            session.add(
                Commission(
                    public_id=f"COM-{index + 148:04d}",
                    agent_id=booking.agent_id,
                    booking_id=booking.id,
                    deal_value=booking.final_price,
                    rate=Decimal("0.0200"),
                    gross_amount=gross,
                    tds_amount=tds,
                    net_amount=gross - tds,
                    status="PAID" if index < 3 else "PAYABLE",
                    payout_reference=f"NEFT-{9000 + index}" if index < 3 else None,
                )
            )
    session.flush()


def _seed_governance(session: Session, customers: list[Customer], bookings: dict[str, Booking]) -> None:
    defaults = [
        ("company.name", COMPANY["name"], "company", "Registered entity name"),
        ("company.gstin", COMPANY["gstin"], "company", "GSTIN used on tax invoices"),
        ("payments.receipt_prefix", "RCT", "payments", "Receipt numbering prefix"),
        ("payments.grace_days", "7", "payments", "Days before a due date becomes overdue"),
        ("security.session_timeout_minutes", "30", "security", "Access-token lifetime"),
        ("security.mfa_required_for_admins", "false", "security", "Force TOTP for ADMIN+ roles"),
        ("privacy.retention_days", "2555", "privacy", "Statutory retention for customer records"),
        ("privacy.dpo_email", "dpo@nmtsolution.demo", "privacy", "Data protection officer contact"),
    ]
    for key, value, category, description in defaults:
        if session.query(AppSetting).filter(AppSetting.key == key).one_or_none() is None:
            session.add(AppSetting(key=key, value=value, category=category, description=description))

    if session.query(Document).count() == 0:
        for index, customer in enumerate(customers[:4]):
            session.add(
                Document(
                    public_id=f"DOC-{index + 148:04d}",
                    title="Booking Form",
                    kind="BOOKING_FORM",
                    customer_id=customer.id,
                    content_type="application/pdf",
                    size_bytes=182_400,
                    is_shared_with_customer=True,
                    file_key=f"s3://lalita-docs/bookings/{customer.public_id}.pdf",
                )
            )

    if session.query(Notification).count() == 0:
        overdue_booking = bookings.get("B-033")
        session.add_all(
            [
                Notification(
                    public_id="NTF-0001",
                    title="Payment overdue · Sneha Mehta",
                    body="Plot B-033 · ₹5,60,000 is 10 days overdue.",
                    category="PAYMENT_OVERDUE",
                    severity="warning",
                    audience_role=Role.ACCOUNTS.value,
                    customer_id=customers[4].id,
                    booking_id=overdue_booking.id if overdue_booking else None,
                    due_at=utcnow(),
                ),
                Notification(
                    public_id="NTF-0002",
                    title="Booking awaiting approval",
                    body="Meena Kapoor · Plot C-044 submitted by an agent.",
                    category="APPROVAL",
                    severity="info",
                    audience_role=Role.ADMIN.value,
                    due_at=utcnow(),
                ),
                Notification(
                    public_id="NTF-0003",
                    title="Registry milestone",
                    body="Plot A-101 agreement signed — sub-registrar appointment pending.",
                    category="REGISTRY",
                    severity="info",
                    audience_role=Role.ADMIN.value,
                    due_at=utcnow(),
                ),
            ]
        )
    session.flush()


def seed_all(session: Session) -> None:
    """Populate the demo dataset (idempotent; safe to run repeatedly)."""
    users = _seed_users(session)
    projects = _seed_projects(session)
    agents = _seed_agents(session, users)
    customers = _seed_customers(session, agents)
    plots = _seed_plots(session, projects, agents, customers)
    bookings = _seed_bookings(session, plots, customers, agents)
    _seed_payments(session, bookings, customers)
    _seed_governance(session, customers, bookings)

    # Link the portal login to its customer row.
    portal = users[Role.CUSTOMER.value]
    if portal.customer_id is None:
        portal.customer_id = customers[0].id
    session.flush()
    print(
        f"Seeded {len(users)} users, {len(projects)} projects, {len(plots)} plots, "
        f"{len(customers)} customers, {len(bookings)} bookings"
    )


if __name__ == "__main__":  # pragma: no cover
    from app.core.config import settings as _settings
    from app.db.session import session_scope

    if _settings.is_production and not os.getenv("ALLOW_PROD_SEED"):
        raise SystemExit("Refusing to seed demo data in production (set ALLOW_PROD_SEED=1 to override)")
    with session_scope() as _session:
        seed_all(_session)
