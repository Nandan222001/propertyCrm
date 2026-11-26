# ruff: noqa: F811
"""Payment schemes as a brochure describes them: price, upfront amounts, discount, EMIs, premiums."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal as D

import pytest

from app.core.exceptions import BusinessRuleError
from app.services.plan_calculator import PlanTerms, add_months, build_quote
from tests.test_workflows import agent_approved_customer  # noqa: F401

ALLOT = D("100000")        # paid at booking (the allotment); the discount applies to the rest
OUTRIGHT = {"name": "Outright", "kind": "OUTRIGHT", "discount_percent": "10", "outright_days": 30}
EMI6 = {"name": "6 Months EMI", "kind": "EMI", "discount_percent": "8", "emi_count": 6}
EMI44 = {"name": "44 Months EMI", "kind": "EMI", "emi_count": 44}
SPECIAL = {"name": "44 Months With Special EMI", "kind": "EMI_SPECIAL", "emi_count": 44, "special_count": 10,
           "special_percent": "33.67", "special_months": list(range(4, 44, 4))}


def terms(body):
    return PlanTerms(
        name=body["name"], kind=body["kind"], discount_percent=D(body.get("discount_percent", 0)),
        outright_days=body.get("outright_days"), emi_count=body.get("emi_count"), special_count=body.get("special_count"),
        special_percent=D(body["special_percent"]) if body.get("special_percent") else None,
        special_months=tuple(body.get("special_months", ())),
    )


# ------------------------------------------------------------------ the arithmetic
def test_outright_pays_the_balance_once_with_the_discount():
    q = build_quote(terms(OUTRIGHT), D("1100000"), date(2026, 1, 31), allotment=ALLOT)
    assert q["balance"] == D("1000000") and q["discount_amount"] == D("100000.00")          # the discount is on what is left
    assert q["total_payable"] == D("1000000.00") and q["upfront_total"] == D("100000.00")
    labels = [(row["label"], row["amount"], row["due_date"]) for row in q["schedule"]]
    assert labels[0] == ("Allotment amount", D("100000"), date(2026, 1, 31))
    assert labels[1][1] == D("900000.00") and labels[1][2] == date(2026, 3, 2)   # 30 days after booking
    assert len(labels) == 2


def test_emi_schemes_split_the_balance_and_always_add_up_exactly():
    six = build_quote(terms(EMI6), D("1100000"), date(2026, 1, 15), allotment=ALLOT)
    assert six["total_payable"] == D("1020000.00")                    # 100000 + 1000000 - 8% of 1000000
    emis = [row for row in six["schedule"] if row["kind"] == "EMI"]
    assert len(emis) == 6 and abs(emis[0]["amount"] - D("153333.33")) < D("0.02")
    assert sum(row["amount"] for row in six["schedule"]) == six["total_payable"]
    assert [row["due_date"] for row in emis][:2] == [date(2026, 2, 15), date(2026, 3, 15)]

    long = build_quote(terms(EMI44), D("1100000"), date(2026, 1, 31), allotment=ALLOT)
    assert long["total_payable"] == D("1100000.00") and len([row for row in long["schedule"] if row["kind"] == "EMI"]) == 44
    assert sum(row["amount"] for row in long["schedule"]) == long["total_payable"]
    assert long["schedule"][-1]["due_date"] == add_months(date(2026, 1, 31), 44)


def test_special_emi_lands_only_in_the_chosen_months():
    q = build_quote(terms(SPECIAL), D("1100000"), date(2026, 1, 1), allotment=ALLOT)
    emis = [row for row in q["schedule"] if row["kind"] == "EMI"]
    special = [row for row in emis if "special" in row["label"]]
    assert [int(row["label"].split()[1]) for row in special] == list(range(4, 44, 4))
    regular = emis[0]["amount"]
    assert abs(regular - D("15075")) < D("5") and all(row["amount"] > regular * 3 for row in special)
    assert sum(row["amount"] for row in q["schedule"]) == q["total_payable"] == D("1100000.00")


def test_a_negotiated_total_scales_the_schedule_and_still_adds_up():
    q = build_quote(terms(EMI6), D("1100000"), date(2026, 1, 15), allotment=ALLOT, total_override=D("1000000"))
    assert q["total_payable"] == D("1000000.00") and sum(row["amount"] for row in q["schedule"]) == D("1000000.00")


@pytest.mark.parametrize("bad", [
    {**OUTRIGHT, "outright_days": None},
    {**EMI6, "emi_count": None},
    {**SPECIAL, "special_months": [4, 8]},
    {**SPECIAL, "special_months": [4, 4, 8, 12, 16, 20, 24, 28, 32, 36]},
    {**SPECIAL, "special_months": list(range(40, 50))},
    {**EMI6, "discount_percent": "60"},
])
def test_invalid_schemes_are_refused(bad):
    with pytest.raises(BusinessRuleError):
        build_quote(terms(bad), D("1100000"), date(2026, 1, 1), allotment=ALLOT)


def test_the_schemes_own_allotment_comes_off_first_and_the_discount_applies_only_to_the_rest():
    scheme = PlanTerms(name="Outright", kind="OUTRIGHT", allotment_amount=ALLOT, discount_percent=D("10"), outright_days=30)
    for paid_at_booking in (D("0"), D("50000"), ALLOT, D("250000")):          # whatever is typed at booking, the scheme decides
        q = build_quote(scheme, D("1100000"), date(2026, 1, 31), allotment=paid_at_booking)
        assert q["allotment_amount"] == D("100000.00") and q["balance"] == D("1000000.00")
        assert q["discount_amount"] == D("100000.00")                           # 10% of (11,00,000 - 1,00,000), not of 11,00,000
        assert q["total_payable"] == D("1000000.00") and q["upfront_total"] == D("100000.00")
    # a scheme that sets no allotment still goes by what is paid at booking
    open_scheme = PlanTerms(name="Outright", kind="OUTRIGHT", discount_percent=D("10"), outright_days=30)
    assert build_quote(open_scheme, D("1100000"), date(2026, 1, 31), allotment=D("0"))["discount_amount"] == D("110000.00")


def test_the_application_and_enrollment_fees_come_off_with_the_allotment_before_the_discount():
    scheme = PlanTerms(name="Outright", kind="OUTRIGHT", allotment_amount=ALLOT, discount_percent=D("10"), outright_days=30)
    q = build_quote(scheme, D("1100000"), date(2026, 1, 31), fees=D("5500"))                  # 500 application + 5,000 enrollment
    assert q["discount_base"] == D("994500.00") and q["fees_considered"] == D("5500.00")      # 11,00,000 - 1,00,000 - 5,500
    assert q["discount_amount"] == D("99450.00")                                               # 10% of 9,94,500
    assert q["balance"] == D("1000000.00") and q["total_payable"] == D("1000550.00")           # the fees are not credited against the price
    assert sum(row["amount"] for row in q["schedule"]) == q["total_payable"]
    # no fees -> exactly as before; fees larger than the balance leave nothing to discount (never a negative discount)
    assert build_quote(scheme, D("1100000"), date(2026, 1, 31))["discount_amount"] == D("100000.00")
    tiny = build_quote(scheme, D("150000"), date(2026, 1, 31), fees=D("80000"))
    assert tiny["discount_base"] == D("0.00") and tiny["discount_amount"] == D("0.00")


def test_the_allotment_must_fit_inside_the_price():
    with pytest.raises(BusinessRuleError):
        build_quote(terms(EMI6), D("90000"), date(2026, 1, 1), allotment=ALLOT)


# ------------------------------------------------------------------ through the API
@pytest.fixture()
def project_with_plot(client, admin_headers):
    project = client.post("/api/v1/projects", headers=admin_headers, json={
        "name": f"Brochure {uuid.uuid4().hex[:6]}", "city": "Patna", "total_plots": 4, "base_rate_per_sqft": "1100"}).json()["data"]
    plots = client.post("/api/v1/plots/bulk", headers=admin_headers, json={
        "project_id": project["id"], "prefix": "R-", "start": 1, "count": 3, "facing": "East", "area_sqft": "1000",
        "price": "1100000"}).json()["data"]
    return project, plots


def make_plan(client, headers, project_id, body):
    r = client.post(f"/api/v1/projects/{project_id}/plans", headers=headers, json=body)
    assert r.status_code == 201, r.text
    return r.json()["data"]


def test_admin_manages_schemes_and_agents_can_only_read_them(client, admin_headers, agent_headers, project_with_plot):
    project, _ = project_with_plot
    plan = make_plan(client, admin_headers, project["id"], EMI6)
    assert client.post(f"/api/v1/projects/{project['id']}/plans", headers=agent_headers, json=EMI44).status_code == 403
    assert client.patch(f"/api/v1/plans/{plan['id']}", headers=agent_headers, json={"discount_percent": "1"}).status_code == 403
    assert client.delete(f"/api/v1/plans/{plan['id']}", headers=agent_headers).status_code == 403
    assert [p["name"] for p in client.get(f"/api/v1/projects/{project['id']}/plans", headers=agent_headers).json()["data"]] == ["6 Months EMI"]
    assert client.post(f"/api/v1/projects/{project['id']}/plans", headers=admin_headers, json=EMI6).status_code == 409
    bad = client.post(f"/api/v1/projects/{project['id']}/plans", headers=admin_headers, json={**SPECIAL, "special_months": [1, 2]})
    assert bad.status_code in (400, 409, 422) and "special" in bad.text.lower()
    edited = client.patch(f"/api/v1/plans/{plan['id']}", headers=admin_headers, json={"discount_percent": "9", "emi_count": 12})
    assert edited.status_code == 200 and edited.json()["data"]["emi_count"] == 12 and float(edited.json()["data"]["discount_percent"]) == 9


def test_premiums_are_added_to_the_plot_price(client, admin_headers, project_with_plot):
    project, plots = project_with_plot                                  # the plots face East, with no feature ticked
    patched = client.patch(f"/api/v1/projects/{project['id']}", headers=admin_headers, json={
        "premium_corner": "47000", "premium_commercial": "57000", "premium_east_facing": "27000", "premium_park_facing": "17000"})
    assert patched.status_code == 200, patched.text
    assert client.patch(f"/api/v1/plots/{plots[0]['id']}", headers=admin_headers, json={"is_corner": True}).status_code == 200
    assert client.patch(f"/api/v1/plots/{plots[1]['id']}", headers=admin_headers, json={"is_east_facing": True}).status_code == 200
    listed = {p["plot_number"]: p for p in client.get("/api/v1/plots?page_size=200", headers=admin_headers).json()["data"]
              if p["project_id"] == project["id"]}
    assert float(listed["R-1"]["premium"]) == 47000                      # corner ticked; it faces East but East-facing is not ticked
    assert float(listed["R-1"]["total_price"]) == 1_100_000 + 47_000
    assert float(listed["R-2"]["premium"]) == 27000 and float(listed["R-2"]["total_price"]) == 1_127_000      # East-facing ticked
    assert float(listed["R-3"]["premium"]) == 0 and float(listed["R-3"]["total_price"]) == 1_100_000          # East, nothing ticked


def test_facing_is_optional_and_never_adds_a_charge_by_itself(client, admin_headers, project_with_plot):
    project, _ = project_with_plot
    assert client.patch(f"/api/v1/projects/{project['id']}", headers=admin_headers, json={
        "premium_east_facing": "27000", "premium_ne_facing": "33000"}).status_code == 200
    base = {"project_id": project["id"], "layout": "L", "area_sqft": "1000", "price": "1100000", "count": 1}
    made = {}
    for label, extra in (("none", {}), ("east", {"facing": "East"}), ("ne", {"facing": "North-East"}), ("west", {"facing": "West"})):
        r = client.post("/api/v1/plots/bulk", headers=admin_headers, json={**base, "prefix": f"{label[0].upper()}{len(made)}-", "start": 1, **extra})
        assert r.status_code == 201, r.text
        made[label] = r.json()["data"][0]
    assert made["none"]["facing"] in (None, "")                                                    # facing is optional
    for label in ("none", "east", "ne", "west"):                                                   # choosing a facing adds nothing
        assert float(made[label]["premium"]) == 0 and made[label]["is_east_facing"] is False and made[label]["is_ne_facing"] is False
    # the charge is added only when the feature is ticked on the plot (the edit form's "features that carry a premium")
    east = client.patch(f"/api/v1/plots/{made['east']['id']}", headers=admin_headers, json={"is_east_facing": True}).json()["data"]
    assert float(east["premium"]) == 27_000 and float(east["total_price"]) == 1_127_000
    ne = client.patch(f"/api/v1/plots/{made['ne']['id']}", headers=admin_headers, json={"is_ne_facing": True}).json()["data"]
    assert float(ne["premium"]) == 33_000
    # changing the facing text does not change the charge either way; unticking removes it
    moved = client.patch(f"/api/v1/plots/{made['east']['id']}", headers=admin_headers, json={"facing": "West"}).json()["data"]
    assert float(moved["premium"]) == 27_000
    plain = client.patch(f"/api/v1/plots/{made['east']['id']}", headers=admin_headers, json={"is_east_facing": False}).json()["data"]
    assert float(plain["premium"]) == 0 and float(plain["total_price"]) == 1_100_000
    cleared = client.patch(f"/api/v1/plots/{made['none']['id']}", headers=admin_headers, json={"facing": ""})
    assert cleared.status_code == 200 and float(cleared.json()["data"]["premium"]) == 0


def test_booking_follows_the_chosen_scheme_end_to_end(client, admin_headers, agent_headers, accounts_headers,
                                                       agent_approved_customer, project_with_plot):
    project, plots = project_with_plot
    plan = make_plan(client, admin_headers, project["id"], EMI6)
    plot = plots[0]

    # a scheme is optional: with none chosen the plot is simply booked at its listed price (no schedule)
    plain = client.post("/api/v1/bookings", headers=agent_headers, json={
        "customer_id": agent_approved_customer["id"], "plot_id": plots[2]["id"], "final_price": plots[2]["total_price"]})
    assert plain.status_code == 201, plain.text
    assert plain.json()["data"]["plan_id"] is None
    assert client.get(f"/api/v1/bookings/{plain.json()['data']['id']}/installments", headers=agent_headers).json()["data"] == []
    wrong = client.post("/api/v1/bookings", headers=agent_headers, json={
        "customer_id": agent_approved_customer["id"], "plot_id": plots[1]["id"], "final_price": "1"})
    assert wrong.status_code in (400, 409, 422) and "fixed at" in wrong.text      # still locked to the listed price

    quote = client.post("/api/v1/plans/quote", headers=agent_headers, json={"plan_id": plan["id"], "plot_id": plot["id"], "allotment_amount": "100000"})
    assert quote.status_code == 200, quote.text
    q = quote.json()["data"]
    assert float(q["total_payable"]) == 1_020_000 and float(q["upfront_total"]) == 100_000
    assert len(q["schedule"]) == 7 and q["schedule"][0]["label"] == "Allotment amount"

    body = {"customer_id": agent_approved_customer["id"], "plot_id": plot["id"], "plan_id": plan["id"],
            "final_price": q["total_payable"], "token_amount": "100000"}
    # an agent cannot book at any other price or amount due at booking
    cheaper = client.post("/api/v1/bookings", headers=agent_headers, json={**body, "final_price": "900000"})
    assert cheaper.status_code in (400, 409, 422) and "fixed at" in cheaper.text
    assert client.post("/api/v1/bookings", headers=agent_headers, json={**body, "token_amount": "1000"}).status_code in (400, 409, 422)

    created = client.post("/api/v1/bookings", headers=agent_headers, json=body)
    assert created.status_code == 201, created.text
    booking = created.json()["data"]
    assert booking["payment_plan"] == "6 Months EMI" and booking["plan_id"] == plan["id"] and float(booking["final_price"]) == 1_020_000
    schedule = client.get(f"/api/v1/bookings/{booking['id']}/installments", headers=agent_headers).json()["data"]
    assert len(schedule) == 7 and sum(float(i["amount"]) for i in schedule) == pytest.approx(1_020_000)
    assert {i["status"] for i in schedule} == {"PENDING"}

    # the admin approves: the allotment paid at booking is collected and its line is paid
    assert client.post(f"/api/v1/bookings/{booking['id']}/approve", headers=admin_headers, json={}).status_code == 200
    schedule = client.get(f"/api/v1/bookings/{booking['id']}/installments", headers=admin_headers).json()["data"]
    assert schedule[0]["status"] == "PAID" and schedule[1]["status"] == "PENDING"

    # accounts records an EMI: it goes to the next unpaid line, and the ledger's next due date follows the schedule
    emi = float(schedule[1]["amount"])
    paid = client.post("/api/v1/payments", headers=accounts_headers, json={"booking_id": booking["id"], "amount": str(emi), "mode": "NEFT", "reference": "UTR1"})
    assert paid.status_code == 201, paid.text
    schedule = client.get(f"/api/v1/bookings/{booking['id']}/installments", headers=admin_headers).json()["data"]
    assert [i["status"] for i in schedule[:2]] == ["PAID"] * 2 and schedule[2]["status"] == "PENDING"
    ledger = {r["booking_number"]: r for r in client.get("/api/v1/ledger?page_size=200", headers=accounts_headers).json()["data"]}
    assert ledger[booking["booking_number"]]["due_date"] == schedule[2]["due_date"]
    assert client.post(f"/api/v1/ledger/{booking['booking_number']}/due-date", headers=accounts_headers,
                       json={"due_date": "2030-01-01"}).status_code in (400, 409, 422)

    # deleting the scheme later does not touch the booking: it keeps its own copy
    assert client.delete(f"/api/v1/plans/{plan['id']}", headers=admin_headers).status_code == 200
    assert len(client.get(f"/api/v1/bookings/{booking['id']}/installments", headers=admin_headers).json()["data"]) == 7


def test_scheme_must_belong_to_the_plots_project_and_an_admin_may_negotiate(client, admin_headers, agent_headers,
                                                                          agent_approved_customer, project_with_plot):
    project, plots = project_with_plot
    plan = make_plan(client, admin_headers, project["id"], EMI44)
    other = client.post("/api/v1/projects", headers=admin_headers, json={"name": f"Other {uuid.uuid4().hex[:6]}", "total_plots": 1}).json()["data"]
    foreign = make_plan(client, admin_headers, other["id"], OUTRIGHT)
    wrong = client.post("/api/v1/bookings", headers=admin_headers, json={
        "customer_id": agent_approved_customer["id"], "plot_id": plots[1]["id"], "plan_id": foreign["id"], "final_price": "1000000"})
    assert wrong.status_code in (400, 409, 422)
    negotiated = client.post("/api/v1/bookings", headers=admin_headers, json={
        "customer_id": agent_approved_customer["id"], "plot_id": plots[1]["id"], "plan_id": plan["id"],
        "final_price": "1000000", "token_amount": "105500"})
    assert negotiated.status_code == 201, negotiated.text
    lines = client.get(f"/api/v1/bookings/{negotiated.json()['data']['id']}/installments", headers=admin_headers).json()["data"]
    assert sum(float(i["amount"]) for i in lines) == pytest.approx(1_000_000) and float(negotiated.json()["data"]["final_price"]) == 1_000_000


def test_customer_sees_only_their_own_schedule(client, admin_headers, agent_headers, customer_headers):
    mine = client.get("/api/v1/bookings?page_size=200", headers=customer_headers).json()["data"]
    others = [b for b in client.get("/api/v1/bookings?page_size=200", headers=admin_headers).json()["data"] if b["id"] not in {m["id"] for m in mine}]
    assert others and client.get(f"/api/v1/bookings/{others[0]['id']}/installments", headers=customer_headers).status_code == 403
    assert client.get(f"/api/v1/bookings/{mine[0]['id']}/installments", headers=customer_headers).status_code == 200


def test_a_scheme_with_an_allotment_discounts_only_what_is_left_even_when_nothing_is_paid_at_booking(
        client, admin_headers, agent_approved_customer, project_with_plot):
    project, plots = project_with_plot
    plan = make_plan(client, admin_headers, project["id"], {**OUTRIGHT, "name": "Outright with allotment", "allotment_amount": "100000"})
    assert float(plan["allotment_amount"]) == 100_000
    plot = plots[0]                                                      # listed at 11,00,000
    quote = client.post("/api/v1/plans/quote", headers=admin_headers,
                        json={"plan_id": plan["id"], "plot_id": plot["id"], "allotment_amount": "0"}).json()["data"]
    assert float(quote["allotment_amount"]) == 100_000 and float(quote["balance"]) == 1_000_000
    assert float(quote["discount_amount"]) == 100_000 and float(quote["total_payable"]) == 1_000_000     # not 1,10,000 off
    assert quote["schedule"][0]["label"] == "Allotment amount" and float(quote["schedule"][0]["amount"]) == 100_000

    booked = client.post("/api/v1/bookings", headers=admin_headers, json={
        "customer_id": agent_approved_customer["id"], "plot_id": plot["id"], "plan_id": plan["id"],
        "final_price": quote["total_payable"], "token_amount": "0"})
    assert booked.status_code == 201, booked.text
    lines = client.get(f"/api/v1/bookings/{booked.json()['data']['id']}/installments", headers=admin_headers).json()["data"]
    assert [round(float(i["amount"])) for i in lines] == [100_000, 900_000]


def test_the_customers_application_fees_reduce_the_discount_base_in_the_quote_and_the_booking(
        client, admin_headers, agent_headers, agent_approved_customer, project_with_plot):
    project, plots = project_with_plot
    plan = make_plan(client, admin_headers, project["id"], {**OUTRIGHT, "name": "Outright with allotment", "allotment_amount": "100000"})
    application = client.post("/api/v1/applications", headers=admin_headers, json={
        "customer_id": agent_approved_customer["id"], "project_id": project["id"], "application_fee": "500", "enrollment_fee": "5000",
        "payment_mode": "UPI"}).json()["data"]
    plot = plots[0]                                                                  # 11,00,000
    asked = {"plan_id": plan["id"], "plot_id": plot["id"], "allotment_amount": "100000"}
    plain = client.post("/api/v1/plans/quote", headers=admin_headers, json=asked).json()["data"]
    assert float(plain["discount_amount"]) == 100_000                                 # no application given: as before
    quote = client.post("/api/v1/plans/quote", headers=admin_headers, json={**asked, "application_id": application["id"]}).json()["data"]
    assert float(quote["fees_considered"]) == 5_500 and float(quote["discount_base"]) == 994_500
    assert float(quote["discount_amount"]) == 99_450 and float(quote["total_payable"]) == 1_000_550

    body = {"customer_id": agent_approved_customer["id"], "plot_id": plot["id"], "plan_id": plan["id"],
            "application_id": application["id"], "token_amount": "100000"}
    # an agent must book at exactly the scheme's price: the old figure (discount on 10,00,000) is refused
    refused = client.post("/api/v1/bookings", headers=agent_headers, json={**body, "final_price": plain["total_payable"]})
    assert refused.status_code in (400, 409, 422) and "fixed at" in refused.text, refused.text
    booked = client.post("/api/v1/bookings", headers=agent_headers, json={**body, "final_price": quote["total_payable"]})
    assert booked.status_code == 201, booked.text
    lines = client.get(f"/api/v1/bookings/{booked.json()['data']['id']}/installments", headers=agent_headers).json()["data"]
    assert [float(i["amount"]) for i in lines] == [100_000, 900_550]                  # allotment, then the balance after the discount


def test_a_scheme_that_states_its_fees_uses_them_in_the_preview_and_the_booking(
        client, admin_headers, agent_headers, agent_approved_customer, project_with_plot):
    project, plots = project_with_plot
    stated = {**OUTRIGHT, "name": "Outright with fees", "allotment_amount": "100000", "application_fee": "500", "enrollment_fee": "5000"}
    # the preview while the scheme is still being written (no saved scheme, no application): same numbers as a booking
    preview = client.post("/api/v1/plans/quote", headers=admin_headers, json={"plan": stated, "price": "1100000"}).json()["data"]
    assert float(preview["fees_considered"]) == 5_500 and float(preview["discount_base"]) == 994_500
    assert float(preview["discount_amount"]) == 99_450 and float(preview["total_payable"]) == 1_000_550

    plan = make_plan(client, admin_headers, project["id"], stated)
    assert float(plan["application_fee"]) == 500 and float(plan["enrollment_fee"]) == 5_000
    # the customer paid different fees, but the scheme decides what is taken off before the discount
    application = client.post("/api/v1/applications", headers=admin_headers, json={
        "customer_id": agent_approved_customer["id"], "project_id": project["id"], "application_fee": "200", "enrollment_fee": "3000",
        "payment_mode": "UPI"}).json()["data"]
    quote = client.post("/api/v1/plans/quote", headers=admin_headers, json={
        "plan_id": plan["id"], "plot_id": plots[0]["id"], "application_id": application["id"]}).json()["data"]
    assert float(quote["fees_considered"]) == 5_500 and float(quote["discount_amount"]) == 99_450
    booked = client.post("/api/v1/bookings", headers=agent_headers, json={
        "customer_id": agent_approved_customer["id"], "plot_id": plots[0]["id"], "plan_id": plan["id"],
        "application_id": application["id"], "token_amount": "100000", "final_price": quote["total_payable"]})
    assert booked.status_code == 201, booked.text
