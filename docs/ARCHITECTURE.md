# Architecture

## 1. System overview

```
Browser (React 19 + Redux Toolkit)
   │  relative /api/v1/*  (dev: vite proxy · prod: ALB → nginx same-origin)
   ▼
FastAPI (routes → controllers → services → repositories → models)
   │  SQLAlchemy 2.0 + PyMySQL (TLS, least-privilege user)
   ▼
MySQL 8.4 (Multi-AZ, encrypted, PITR)        Redis (rate limits, token store)
```

Two deployables: `backend/` (API container) and the SPA (nginx / Vercel). They
share one origin in production, so there is no CORS surface to misconfigure.

## 2. Backend layering (MVC-style, one direction only)

```
app/
├── routes/         HTTP surface: paths, status codes, dependencies, OpenAPI
├── controllers/    request/response orchestration; translate service results into envelopes
├── services/       business rules, transactions, authorisation, audit
├── repositories/   the only place that builds queries (SQLAlchemy)
├── models/         ORM entities (23 tables, mixins for pk/public-id/timestamps/soft-delete)
├── schemas/        Pydantic request/response contracts (validation lives here)
├── core/           config, security (JWT/crypto), permissions, exceptions, responses,
│                   middleware, rate limiting, logging, request context, dependencies
├── db/             engine/session factory, metadata base, bootstrap, seed
├── utils/          money (Indian formatting/words), helpers
└── main.py         application factory: middleware order, routers, lifespan
migrations/         Alembic revisions (initial + security hardening + billing)
tests/              pytest cases across security, workflow and billing modules
```

Rules that keep it honest:

1. **Controllers never touch a session or a repository.** They call one service
   method and wrap the result with `success(...)`.
2. **Services never build SQL.** They call repositories and own the transaction.
3. **Authorisation is enforced in the service layer** (`BaseService._authorise`
   with a per-action permission map). A controller cannot skip it, because
   nothing else can reach a repository.
4. **Money is `Decimal` end-to-end**, converted only at the formatting boundary
   (`app/utils/money.py` mirrors `src/utils/money.js`).

## 3. Frontend structure

```
src/
├── main.jsx                  bootstrap: Redux Provider + Router + ErrorBoundary
├── app/App.jsx               shell composition (layout + page switch + modals)
├── store/                    Redux Toolkit store
│   ├── index.js              configureStore + persistence middleware
│   ├── slices/               auth · domain · ui
│   ├── selectors.js          derived/role-scoped data (createSelector memoised)
│   ├── persistence.js        the only localStorage writer
│   └── thunks.js             workflows: local-first update + optional API sync
├── api/                      fetch client (envelope, JWT refresh single-flight) + resource client
├── constants/                roles · navigation/routes · API endpoint table
├── utils/                    money · names · date · status · id · csv · storage · whatsapp ·
│                             permissions · security · billing (invoice maths) · pdf (offline bill renderer)
├── hooks/                    useAuth · useNotify · useDebouncedValue · useAsync · typed store hooks
├── components/
│   ├── common/               Button-less primitives: Toast, PageHeader, FilterBar, Panel,
│   │                         EmptyState, ModalShell, DataTable, StatTile, Badge, Avatar, ErrorBoundary
│   └── layout/               Sidebar, Topbar, RoleContextBanner
└── features/                 one folder per domain: auth, dashboard, projects, bookings,
                              payments, billing (tax invoices + PDF bills), customers,
                              documents, agents, plots, approvals, notifications, users, admin
```

### SOLID / DRY in practice

* **Single responsibility** — components render; selectors derive; thunks mutate.
  No component reads `localStorage` or builds an API URL.
* **Open/closed** — adding a collection means adding a key to `ENDPOINTS` and a
  selector; the generic `rowUpserted`/`rowPatched` reducers already handle it.
* **Liskov / interface segregation** — every page receives only the props it
  uses; shared primitives keep one signature used by every caller.
* **Dependency inversion** — features depend on hooks/selectors, not on the
  store's shape; swapping demo data for the live API changes only `store/thunks.js`.

Anything repeated more than three times was extracted: filter bar, status badge
tone, CSV export, money/date formatting, permission checks, toast, empty state,
modal frame, table shell.

## 4. Request lifecycle (write path)

1. `RequestContextMiddleware` assigns a request id, redacts and starts the timer.
2. Security headers, HTTPS redirect, body-size and rate-limit middleware run.
3. Route parses the payload into a Pydantic schema (422 on failure).
4. `get_current_user` verifies the JWT, loads the actor into `ActorContext`
   (role, permissions, scope, IP, user-agent).
5. Controller calls the service; the service authorises (`_authorise`), applies
   business rules, writes through repositories, then writes an audit row.
6. `get_db` commits on success (rolls back on exception); security telemetry for
   401/403/423/429 is committed in an isolated session so rejection is evidence.
7. Response is wrapped by `success()`/`error_handler` with the envelope and
   request id; metrics/log fields are emitted as one JSON line.

## 5. Environments

| Env | Database | Notes |
| --- | --- | --- |
| local | SQLite (`var/demo.sqlite3`) or Docker MySQL | docs enabled, demo seed, permissive hosts |
| test | in-process SQLite/MySQL | `ENVIRONMENT=test`, secrets from CI vars |
| staging | managed MySQL, TLS required | production-like, docs disabled, seeded test data |
| production | Multi-AZ RDS, TLS + IAM-secreted credentials | docs disabled, HSTS, wildcard CORS rejected at startup |
