# Deployment & Operations Guide

## 1. Environments

| Environment | Purpose | Database | API docs | Notes |
| --- | --- | --- | --- | --- |
| local | developer laptop | SQLite (`backend/var/demo.sqlite3`) or Docker MySQL | enabled | permissive hosts |
| test | CI | MySQL 8.4 service container / in-process SQLite | enabled | `ENVIRONMENT=test`, fixtures only |
| staging | pre-production | managed MySQL, TLS | disabled | production-like, synthetic data |
| production | live | Multi-AZ RDS MySQL 8.4, TLS + `verify_identity` | disabled | HSTS, wildcard CORS rejected at startup |

## 2. First-time local setup

```bash
# 1 — frontend
npm ci
npm run dev                       # http://localhost:5173 (proxies /api → :8000)

# 2 — backend
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env              # fill SECRET_KEY / INDEX_PEPPER / FIELD_ENCRYPTION_KEY
python -m app.db.init_db          # create the schema (SQLite by default) — no data is loaded
python -m app.db.create_platform_admin --name "Your Name" --email you@example.com --phone 9XXXXXXXXX
uvicorn app.main:app --reload --port 8000
```

Generate the three secrets with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"                       # SECRET_KEY
python -c "import secrets; print(secrets.token_urlsafe(36))"                       # INDEX_PEPPER
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### First sign-in

The application ships with **no sample data and no default accounts**. Create the platform owner once
(`python -m app.db.create_platform_admin …`, shown above; it asks for a password). Then:

1. The platform owner signs in and creates an organisation together with its administrator
   (Tenants → Add organisation).
2. That administrator creates the organisation's other users; agents add customers.
3. Anyone created by someone else starts with a password built from their name and mobile number
   (first four letters + last five digits, never displayed) and must change it at first sign-in.

## 3. Database provisioning (MySQL)

```bash
mysql -u root -p < backend/scripts/create_db.sql   # database, users, grants, TLS requirement
```

This creates the least-privilege runtime user `lalita_app` (DML only, append-only
on audit tables) and the DDL user `lalita_migrate`. Verify with the queries at the
bottom of the script — the app user must **not** be able to `DROP` or `ALTER`.

## 4. Schema migration

```bash
cd backend
alembic current                    # what is applied
alembic upgrade head               # apply
alembic downgrade -1               # roll back one revision
alembic upgrade head --sql         # render MySQL DDL for review (no DB needed)
```

Rules: migrations are reviewed like code, must be reversible, never edit an
applied revision, and run **before** the new application version starts.

## 5. Release procedure (zero downtime)

1. Merge to `main` → CI green (lint, tests, SAST, dependency and container scans).
2. Build once; push immutable tags (`api:1.4.0`, `web:1.4.0`) to ECR.
3. `terraform apply` (infra changes only) from the pipeline.
4. Run `alembic upgrade head` as a one-off ECS task (backward-compatible change).
5. Roll the ECS service to the new task definition (rolling deploy, min 100%
   healthy / max 200%). Circuit breaker auto-rolls back on health-check failure.
6. Smoke test: `/api/v1/health`, sign-in, one booking read, one audit read.
7. Tag the release and attach the SBOM + dependency scan report to it.

## 6. Rollback

| Situation | Action |
| --- | --- |
| Bad application release | redeploy the previous task definition (ECS keeps the revision) |
| Bad migration (additive) | `alembic downgrade -1` after stopping writers, or roll forward with a fix |
| Data corruption | point-in-time restore to a new instance, then re-point via parameter change (`docs/BACKUP_AND_DR.md`) |

Never roll back by editing rows by hand in production.

## 7. Configuration checklist before production

- [ ] `ENVIRONMENT=production`, `DEBUG=false`
- [ ] `SECRET_KEY`, `INDEX_PEPPER`, `FIELD_ENCRYPTION_KEY`, `DB_PASSWORD` set from Secrets Manager
- [ ] `ALLOWED_HOSTS` = real hostnames (no `*`), `CORS_ALLOWED_ORIGINS` = real origins
- [ ] `DB_SSL_MODE=verify_identity` with a mounted CA bundle
- [ ] `FORCE_HTTPS=true`, `RATE_LIMIT_BACKEND=redis`, `REDIS_URL` reachable
- [ ] `LOG_JSON=true`, CloudWatch alarms subscribed to on-call
- [ ] `CONSENT_REQUIRED=true`, `PII_MASK_BY_DEFAULT=true`
- [ ] Backup retention ≥ 14 days, deletion protection on, restore drill date recorded
- [ ] Audit log retention and access reviewed (super admin only)

## 8. Health, metrics and troubleshooting

| Endpoint | Meaning |
| --- | --- |
| `GET /api/v1/health` | liveness + version + uptime |
| `GET /api/v1/ready` | DB connectivity (503 when the database is unreachable) |

Common issues:

* **423 on sign-in** — account locked after 5 failures; an admin unlocks it from *User & role management*.
* **429 during testing** — rate limiter; raise `RATE_LIMIT_AUTH` for the load test window (never in production).
* **`OperationalError: database is locked`** — SQLite-only artefact of concurrent writers; use MySQL.
* **Empty workspace in the UI** — the SPA fell back to demo mode because `/api/v1` was unreachable; check the proxy target (`VITE_PROXY_TARGET`).

## 9. Running the containers

```bash
cp backend/.env.example backend/.env     # fill the secrets
docker compose up --build                # → http://localhost:8080
docker compose exec api alembic current  # verify the schema inside the container
```
