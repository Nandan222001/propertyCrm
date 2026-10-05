# Lalita Realestate Infra — Plot Sales & Collections ERP

Full-stack ERP for plot inventory, bookings, collections and commissions:

| Layer | Stack | Location |
| --- | --- | --- |
| API | FastAPI (Python 3.12), SQLAlchemy 2.0, MySQL 8.4, Alembic | [`backend/`](backend) |
| Web | React 19 + Redux Toolkit + React Router 7 + Vite 6 | [`src/`](src) |
| Infra | Docker, nginx, Terraform (AWS), GitHub Actions | [`infra/`](infra), [`deploy/`](deploy), [`.github/`](.github) |
| Ops | Security register, DR runbook, privacy programme | [`docs/`](docs) |

The frontend keeps working **offline in demo mode** (seeded data, browser
storage) and switches to the live API automatically once `/api/v1` answers —
so the same UI serves as a client demo and as the production console.

---

## Quick start

```bash
# 1 — web app (http://localhost:5173)
npm ci
npm run dev

# 2 — API (http://localhost:8000, docs at /docs)
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env                 # fill SECRET_KEY / INDEX_PEPPER / FIELD_ENCRYPTION_KEY
python -m app.db.init_db             # schema + demo seed (SQLite by default)
uvicorn app.main:app --reload
```

Or with containers (MySQL + Redis + API + nginx on <http://localhost:8080>):

```bash
cp backend/.env.example backend/.env
docker compose up --build
```

`make help` lists every developer task (`make dev`, `make test`, `make verify`,
`make security`, `make seed`, …).

### Demo sign-in (development seed only)

| Role | E-mail | Password |
| --- | --- | --- |
| Super admin | `superadmin@nmtsolution.demo` | `Demo@12345` |
| Admin | `admin@nmtsolution.demo` | `Demo@12345` |
| Sales manager | `manager@nmtsolution.demo` | `Demo@12345` |
| Sales agent | `agent@nmtsolution.demo` | `Demo@12345` |
| Accounts | `accounts@nmtsolution.demo` | `Demo@12345` |
| Management | `management@nmtsolution.demo` | `Demo@12345` |
| Customer portal | `customer@nmtsolution.demo` | `Demo@12345` |

The customer portal is read-only: it exposes only that customer's bookings,
receipts, dues, registry status and documents.

---

## What the system does

* **Inventory** — projects, plots, pricing per sqft, holds, 3D layout, documents.
* **Bookings** — agent booking → admin approval (maker/checker) → allotment →
  agreement → registration, with an immutable status timeline.
* **Collections** — token advance, instalments, receipts (office + customer copy),
  ageing buckets, over-collection protection, ledger and daily reconciliation.
* **Commissions** — accrual on confirmation, TDS split, approval and payout.
* **Customers** — master data, per-customer 360° profile, portal access, consent,
  data-subject requests.
* **Governance** — audit trail, security events, notification follow-ups,
  role/permission administration, operational reports.

All money is `Decimal` end-to-end (₹ Indian formatting and amount-in-words on
receipts); every mutation is attributed to an actor in the audit log.

---

## Security

The 16 required control areas are implemented, tested and documented in the
[Security Controls Register](docs/SECURITY.md). Highlights:

* **Limited authentication** — short-lived JWT access tokens (30 min) with
  rotating single-use refresh tokens (replay revokes the family), progressive
  login throttling, lockout after 5 failures, session revocation on password
  change, and consent-gated customer portal access.
* **RBAC everywhere** — ~60 granular permissions enforced in the service layer,
  SQL-level row scoping (agent sees own deals, customer sees only itself),
  maker/checker approvals, and escalation guards on role administration.
* **Sensitive data** — bcrypt passwords, Fernet field encryption for PAN/bank
  details, peppered blind indexes for lookups, PII masked by default and only
  unmasked for `pii:reveal` roles (with an audit row per reveal), redaction in
  every log record.
* **Middleware hardening** — trusted hosts, explicit CORS allowlist, security
  headers + CSP, HSTS/HTTPS redirect, 2 MB body cap, correlation ids.
* **Abuse control** — token-bucket rate limits (auth 10/min), WAF managed rules
  and per-IP rate limiting at the edge, strict pagination caps.
* **Auditability** — append-only `audit_logs` (who/what/when/before/after) plus
  `security_events` for 401/403/423/429, lockouts and token reuse, retained
  10 years and surfaced through admin reports and CloudWatch alarms.
* **Supply chain** — pinned dependencies, pip-audit/npm audit/Dependabot,
  gitleaks, CodeQL, trivy image scans, SBOM per release.
* **Content unavailable to customers until approved** — agents' records are
  `PENDING_APPROVAL` and plots are held, not sold, until an approver confirms.

Verification: **110 backend tests**, a **render smoke test for all 7 roles**,
plus SAST/dependency/IaC gates in CI — `make verify` runs everything locally.

---

## Project structure

```
backend/
├── app/
│   ├── routes/         HTTP surface + OpenAPI
│   ├── controllers/    request/response orchestration
│   ├── services/       business rules, RBAC, transactions, audit
│   ├── repositories/   the only place that builds queries
│   ├── models/         20 SQLAlchemy entities
│   ├── schemas/        Pydantic request/response contracts
│   ├── core/           config, security, middleware, rate limit, exceptions
│   ├── db/             engine, metadata, seed
│   └── utils/          money (Indian formatting/words)
├── migrations/         Alembic revisions (upgrade + downgrade verified)
├── tests/              110 tests across 8 security-focused modules
└── scripts/            create_db.sql (least privilege), backup/restore

src/
├── app/App.jsx         shell composition
├── store/              Redux Toolkit: auth · domain · ui slices, selectors, thunks
├── api/                fetch client (envelope, single-flight refresh) + resource map
├── constants/          roles, routes/navigation, endpoint table
├── utils/              money · names · date · status · id · csv · storage · whatsapp · permissions · security
├── hooks/              useAuth · useNotify · useDebouncedValue · useAsync
├── components/         common primitives + layout (Sidebar, Topbar)
└── features/           auth, dashboard, projects, bookings, payments, customers,
                        documents, agents, plots, approvals, notifications, users, admin

infra/terraform/        VPC, RDS, S3, ECS, ALB, WAF, KMS, alarms (modular, encrypted state)
deploy/                 nginx config + web image
docs/                   security register, architecture, deployment, DR, privacy, testing
```

Design rules that keep the codebase maintainable (SOLID + DRY):

1. **One clear direction of dependency** — routes → controllers → services →
   repositories → models. Controllers never hold a session; services never build SQL.
2. **Authorisation cannot be forgotten** — every mutation passes through
   `BaseService._authorise` with a per-action permission map.
3. **Anything repeated three times is extracted** — one filter bar, one status
   colour function, one CSV exporter, one modal frame, one money formatter, one
   date formatter, one permission helper, one storage wrapper, one HTTP client.
4. **State lives in Redux** — components render; selectors derive; thunks mutate.
   Only `store/persistence.js` touches `localStorage`.
5. **Contracts are explicit** — Pydantic schemas on the way in, response envelope
   on the way out, typed selectors on the client.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the request lifecycle and
[`docs/SECURITY.md`](docs/SECURITY.md) for the control register.

---

## Verification commands

```bash
make verify                 # tests + lint + security + build + render smoke
make test-api               # backend: 109 pytest cases (~10 s, SQLite)
make test-web               # frontend build + jsdom render smoke for every role
make security               # bandit + pip-audit + npm audit

cd backend
alembic upgrade head        # apply migrations
alembic upgrade head --sql  # review the MySQL DDL without a database
python -m app.db.seed       # reload demo data
```

## Compliance notes

* PII is processed under consent/contract/legal-obligation bases; consent is
  recorded with timestamp + notice version (`docs/DATA_PRIVACY.md`).
* Data-subject requests (access, correction, erasure, portability) are exposed as
  audited API operations; retention defaults to 7 years for transactions and 10
  years for security evidence.
* RPO ≤ 5 minutes, RTO ≤ 4 hours with documented restore drills
  (`docs/BACKUP_AND_DR.md`).
* Vulnerability disclosure policy: [`SECURITY.md`](SECURITY.md).

_Illustrative demo data only; no real customer records are stored in this
repository._
