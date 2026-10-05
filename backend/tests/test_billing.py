"""Billing workflows: draft → issue → settle, PDF generation, RBAC scoping."""

from __future__ import annotations

import uuid

import pytest


@pytest.fixture()
def approved_customer(client, admin_headers, unique_email, unique_phone):
    """Customer created and approved by an admin (no owning agent)."""
    created = client.post(
        "/api/v1/customers",
        json={
            "name": "Billing Customer",
            "email": unique_email,
            "phone": unique_phone,
            "city": "Mumbai",
            "pincode": "400001",
            "consent_given": True,
        },
        headers=admin_headers,
    )
    assert created.status_code == 201, created.text
    customer = created.json()["data"]
    decided = client.post(
        f"/api/v1/customers/{customer['id']}/decision",
        json={"status": "APPROVED", "reason": "KYC verified"},
        headers=admin_headers,
    )
    assert decided.status_code == 200
    return customer


@pytest.fixture()
def available_plot(client, admin_headers):
    """A guaranteed-fresh AVAILABLE plot."""
    projects = client.get("/api/v1/projects", headers=admin_headers).json()["data"]
    created = client.post(
        "/api/v1/plots",
        json={
            "plot_number": f"B-{uuid.uuid4().hex[:6].upper()}",
            "project_id": projects[0]["id"],
            "layout": "Layout B — Billing tests",
            "area_sqft": "2400",
            "facing": "East",
            "price": "1000000",
            "status": "AVAILABLE",
        },
        headers=admin_headers,
    )
    assert created.status_code == 201, created.text
    return created.json()["data"]


@pytest.fixture()
def billing_booking(client, admin_headers, approved_customer, available_plot):
    """A confirmed booking with a known contract value (₹10,00,000, token ₹1,00,000)."""
    created = client.post(
        "/api/v1/bookings",
        json={
            "customer_id": approved_customer["id"],
            "plot_id": available_plot["id"],
            "final_price": "1000000",
            "token_amount": "100000",
            "payment_plan": "10 monthly installments",
        },
        headers=admin_headers,
    )
    assert created.status_code == 201, created.text
    return created.json()["data"]


def _invoice_payload(booking_id: int, **overrides) -> dict:
    payload = {
        "booking_id": booking_id,
        "gst_rate": "0.18",
        "discount_amount": "0",
        "items": [
            {
                "description": "Instalment 1 — plot sale consideration",
                "hsn_sac": "995461",
                "quantity": "1",
                "unit": "NOS",
                "unit_price": "100000",
            },
            {
                "description": "Development charges — Phase II",
                "quantity": "1200",
                "unit": "SQFT",
                "unit_price": "25",
                "discount_amount": "2000",
            },
        ],
    }
    payload.update(overrides)
    return payload


def _create_invoice(client, headers, booking_id: int, **overrides) -> dict:
    response = client.post("/api/v1/invoices", json=_invoice_payload(booking_id, **overrides),
                           headers=headers)
    assert response.status_code == 201, response.text
    return response.json()["data"]


def test_invoice_creation_computes_totals_server_side(client, accounts_headers, billing_booking):
    invoice = _create_invoice(client, accounts_headers, billing_booking["id"])
    assert invoice["status"] == "DRAFT"
    assert invoice["invoice_number"].startswith("INV-")
    # line 1: 1 x 1,00,000; line 2: 1200 x 25 - 2,000 = 28,000 -> subtotal 1,28,000
    assert float(invoice["subtotal"]) == 128000.0
    assert float(invoice["taxable_value"]) == 128000.0
    assert float(invoice["gst_amount"]) == 23040.0
    assert float(invoice["cgst_amount"]) == 11520.0
    assert float(invoice["sgst_amount"]) == 11520.0
    assert float(invoice["total_amount"]) == 151040.0
    assert float(invoice["balance_amount"]) == 151040.0
    assert invoice["item_count"] == 2
    assert [entry["to_status"] for entry in invoice["history"]] == ["DRAFT"]


def test_invoice_totals_apply_discount_and_rounding(client, accounts_headers, billing_booking):
    invoice = _create_invoice(
        client, accounts_headers, billing_booking["id"],
        gst_rate="0.12", discount_amount="8333",
        items=[
            {"description": "Instalment 2 — plot sale consideration", "quantity": "1",
             "unit_price": "99999.99"},
        ],
    )
    # taxable = 99999.99 - 8333 = 91666.99; GST 12% = 11000.04 (rounded)
    assert float(invoice["taxable_value"]) == 91666.99
    assert float(invoice["gst_amount"]) == 11000.04
    # exact 102667.03 → rounded to the whole rupee with round_off booked
    assert float(invoice["total_amount"]) == 102667.0
    assert float(invoice["round_off"]) == -0.03


def test_draft_edit_replaces_items_and_recomputes(client, accounts_headers, billing_booking):
    invoice = _create_invoice(client, accounts_headers, billing_booking["id"])
    patched = client.patch(
        f"/api/v1/invoices/{invoice['id']}",
        json={"discount_amount": "8000"},
        headers=accounts_headers,
    )
    assert patched.status_code == 200, patched.text
    data = patched.json()["data"]
    assert float(data["discount_amount"]) == 8000.0
    assert float(data["taxable_value"]) == 120000.0
    assert float(data["total_amount"]) == 141600.0


def test_issue_invoice_sets_default_due_date_and_freezes_editing(
    client, accounts_headers, billing_booking
):
    invoice = _create_invoice(client, accounts_headers, billing_booking["id"])
    issued = client.post(f"/api/v1/invoices/{invoice['id']}/issue", json={}, headers=accounts_headers)
    assert issued.status_code == 200, issued.text
    data = issued.json()["data"]
    assert data["status"] == "ISSUED"
    assert data["due_date"], "issuing must set a payment due date"

    frozen = client.patch(
        f"/api/v1/invoices/{invoice['id']}",
        json={"discount_amount": "0"},
        headers=accounts_headers,
    )
    assert frozen.status_code == 409, "issued invoices must not be editable"
    assert issued.json()["data"]["history"][0]["to_status"] == "ISSUED"


def test_invoice_pdf_is_a_valid_print_ready_document(client, accounts_headers, billing_booking):
    invoice = _create_invoice(client, accounts_headers, billing_booking["id"])
    issued = client.post(f"/api/v1/invoices/{invoice['id']}/issue", json={}, headers=accounts_headers)
    assert issued.status_code == 200

    pdf = client.get(f"/api/v1/invoices/{invoice['id']}/pdf", headers=accounts_headers)
    assert pdf.status_code == 200, pdf.text
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content[:5] == b"%PDF-"
    assert len(pdf.content) > 2000
    assert "attachment" not in pdf.headers.get("content-disposition", "")


def test_payment_against_invoice_flows_through_the_ledger(
    client, session, accounts_headers, admin_headers, billing_booking
):
    invoice = _create_invoice(client, accounts_headers, billing_booking["id"])
    client.post(f"/api/v1/invoices/{invoice['id']}/issue", json={}, headers=accounts_headers)

    first = client.post(
        f"/api/v1/invoices/{invoice['id']}/payments",
        json={"amount": "50000", "mode": "UPI", "reference": "UPI-TEST-1"},
        headers=accounts_headers,
    )
    assert first.status_code == 200, first.text
    data = first.json()["data"]
    assert data["status"] == "PARTIALLY_PAID"
    assert float(data["amount_paid"]) == 50000.0
    assert float(data["balance_amount"]) == 101040.0

    # The ledger row is linked to the invoice and issued a numbered receipt.
    from app.models.payment import Payment

    linked = session.query(Payment).filter(Payment.invoice_id == invoice["id"]).all()
    assert len(linked) == 1
    assert float(linked[0].amount) == 50000.0
    assert linked[0].receipt is not None

    # Booking ledger advanced by the same amount.
    booking = client.get(f"/api/v1/bookings/{billing_booking['id']}", headers=admin_headers).json()["data"]
    assert float(booking["paid_amount"]) == 150000.0

    # The second PDF now carries the payment history block.
    pdf = client.get(f"/api/v1/invoices/{invoice['id']}/pdf", headers=accounts_headers)
    assert pdf.status_code == 200

    # Over-collection is blocked at the invoice balance.
    too_much = client.post(
        f"/api/v1/invoices/{invoice['id']}/payments",
        json={"amount": "999999", "mode": "NEFT"},
        headers=accounts_headers,
    )
    assert too_much.status_code == 409

    settle = client.post(
        f"/api/v1/invoices/{invoice['id']}/payments",
        json={"amount": "101040", "mode": "NEFT", "reference": "NEFT-TEST-2"},
        headers=accounts_headers,
    )
    assert settle.status_code == 200, settle.text
    assert settle.json()["data"]["status"] == "PAID"
    assert float(settle.json()["data"]["balance_amount"]) == 0.0


def test_collections_are_capped_by_the_booking_contract(
    client, accounts_headers, billing_booking
):
    invoice = _create_invoice(
        client, accounts_headers, billing_booking["id"],
        items=[{"description": "Full consideration bill", "quantity": "1", "unit_price": "900000"}],
    )
    client.post(f"/api/v1/invoices/{invoice['id']}/issue", json={}, headers=accounts_headers)
    # Booking outstanding is 9,00,000 here, invoice balance 9,00,000 — 1 ok, 2nd blocked.
    first = client.post(f"/api/v1/invoices/{invoice['id']}/payments",
                        json={"amount": "500000", "mode": "UPI"}, headers=accounts_headers)
    assert first.status_code == 200
    second = client.post(f"/api/v1/invoices/{invoice['id']}/payments",
                         json={"amount": "400001", "mode": "UPI"}, headers=accounts_headers)
    assert second.status_code == 409


def test_cancellation_rules(client, accounts_headers, billing_booking):
    # Draft with no money → cancellable.
    draft = _create_invoice(client, accounts_headers, billing_booking["id"])
    cancelled = client.post(
        f"/api/v1/invoices/{draft['id']}/cancel",
        json={"reason": "Raised against the wrong booking"},
        headers=accounts_headers,
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["data"]["status"] == "CANCELLED"
    assert float(cancelled.json()["data"]["balance_amount"]) == 0.0

    # Issued + partially collected → cancellation refused.
    invoice = _create_invoice(client, accounts_headers, billing_booking["id"])
    client.post(f"/api/v1/invoices/{invoice['id']}/issue", json={}, headers=accounts_headers)
    client.post(f"/api/v1/invoices/{invoice['id']}/payments",
                json={"amount": "10000", "mode": "CASH"}, headers=accounts_headers)
    denied = client.post(
        f"/api/v1/invoices/{invoice['id']}/cancel",
        json={"reason": "Try to cancel a collected bill"},
        headers=accounts_headers,
    )
    assert denied.status_code == 409

    # Cancelling an already-cancelled invoice is refused too.
    again = client.post(
        f"/api/v1/invoices/{draft['id']}/cancel", json={"reason": "Twice cancelled"},
        headers=accounts_headers,
    )
    assert again.status_code == 409


def test_overdue_sweep_flags_past_due_invoices(client, accounts_headers, billing_booking):
    from datetime import date, timedelta

    invoice = _create_invoice(client, accounts_headers, billing_booking["id"])
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    client.post(f"/api/v1/invoices/{invoice['id']}/issue",
                json={"due_date": yesterday}, headers=accounts_headers)

    sweep = client.post("/api/v1/invoices/overdue-sweep", headers=accounts_headers)
    assert sweep.status_code == 200
    assert sweep.json()["data"]["overdue_marked"] >= 1

    refreshed = client.get(f"/api/v1/invoices/{invoice['id']}", headers=accounts_headers).json()["data"]
    assert refreshed["status"] == "OVERDUE"
    assert refreshed["days_overdue"] >= 1


def test_billing_summary_and_status_filters(client, admin_headers, accounts_headers, billing_booking):
    _create_invoice(client, accounts_headers, billing_booking["id"])
    summary = client.get("/api/v1/invoices/summary", headers=admin_headers).json()["data"]
    for key in ("billed", "collected", "outstanding", "overdue", "gst_charged",
                "draft_value", "invoice_count", "status_counts", "overdue_count"):
        assert key in summary
    assert summary["invoice_count"] >= 7, "seeded demo invoices must be visible"

    drafts = client.get("/api/v1/invoices?status=DRAFT", headers=admin_headers).json()["data"]
    assert drafts and all(row["status"] == "DRAFT" for row in drafts)


def test_seeded_demo_invoices_span_the_lifecycle(client, admin_headers):
    invoices = client.get("/api/v1/invoices?page_size=100", headers=admin_headers).json()["data"]
    statuses = {row["status"] for row in invoices}
    assert {"ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED", "DRAFT"} <= statuses
    numbers = [row["invoice_number"] for row in invoices]
    assert len(numbers) == len(set(numbers)), "invoice numbers must be unique"
    for row in invoices:
        assert row["items"], f"{row['invoice_number']} must carry line items"
        assert float(row["total_amount"]) > 0


def test_customer_portal_sees_only_own_invoices(client, customer_headers):
    visible = client.get("/api/v1/invoices", headers=customer_headers)
    assert visible.status_code == 200
    rows = visible.json()["data"]
    assert rows, "the portal customer owns seeded invoices"
    assert all(row["customer_name"] == "Rajesh Sharma" for row in rows)

    denied = client.post(
        "/api/v1/invoices",
        json={"booking_id": 1, "items": [{"description": "x", "quantity": "1", "unit_price": "1"}]},
        headers=customer_headers,
    )
    assert denied.status_code == 403


def test_role_matrix_for_billing(client, agent_headers, admin_headers):
    # Sales agents hold no billing permission at all.
    assert client.get("/api/v1/invoices", headers=agent_headers).status_code == 403
    # Managers can review the book but cannot raise bills.
    manager = client.post(
        "/api/v1/auth/login",
        json={"email": "manager@nmtsolution.demo", "password": "Demo@12345"},
    ).json()["data"]["tokens"]["access_token"]
    manager_headers = {"Authorization": f"Bearer {manager}"}
    assert client.get("/api/v1/invoices", headers=manager_headers).status_code == 200
    assert client.post(
        "/api/v1/invoices",
        json={"booking_id": 1, "items": [{"description": "x", "quantity": "1", "unit_price": "1"}]},
        headers=manager_headers,
    ).status_code == 403
    # Admin can share a bill (receipt:manage) and download the PDF.
    invoices = client.get("/api/v1/invoices", headers=admin_headers).json()["data"]
    target = invoices[0]
    shared = client.post(f"/api/v1/invoices/{target['id']}/share", headers=admin_headers)
    assert shared.status_code == 200
    assert shared.json()["data"]["shared"] is True


@pytest.mark.parametrize(
    "payload, expected_status",
    [
        ({"items": []}, 422),                                    # no line items
        ({"discount_amount": "9999999"}, 422),                    # discount above subtotal
        ({"gst_rate": "0.33"}, 422),                              # GST rate not offered
        ({"items": [{"description": "x", "quantity": "1", "unit_price": "100",
                     "discount_amount": "500"}]}, 422),           # line discount above amount
    ],
)
def test_invoice_validation_errors(client, accounts_headers, billing_booking,
                                   payload, expected_status):
    body = _invoice_payload(billing_booking["id"], **payload)
    response = client.post("/api/v1/invoices", json=body, headers=accounts_headers)
    assert response.status_code == expected_status, response.text
