# Security Controls Register — Lalita Realestate Infra ERP

This document is the single map of **what security control exists, where it lives
in the code, and how it is verified**. It is written against the 16 control areas
the business asked for. Anything marked *Owner* is an operational commitment, not
code — those run through the checklists in `docs/INCIDENT_RESPONSE.md` and
`docs/BACKUP_AND_DR.md`.

Legend — **Verified by**: the automated check that fails if the control regresses.

---

## 1. Middleware protection

| Control | Implementation | Verified by |
| --- | --- | --- |
| Trusted hosts | `TrustedHostMiddleware` + `ALLOWED_HOSTS` (wildcards rejected in prod) | `tests/test_security_controls.py::test_trusted_host_rejects_unknown_host` |
| CORS allowlist | `CORSMiddleware`, explicit origins only, no `*` in prod | `test_production_baseline_rejects_wildcard_cors` (config guard) |
| Security headers | `SecurityHeadersMiddleware` → `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referential-Policy`, `Permissions-Policy`, HSTS (prod), CSP | `test_security_headers_present_on_every_response` |
| Request size cap | `BodySizeLimitMiddleware` (`MAX_REQUEST_BYTES`, 2 MB) → `413` | `test_oversized_body_is_rejected` |
| HTTPS enforcement | `HTTPSRedirectMiddleware` (only when `FORCE_HTTPS`), HSTS with preload | `test_https_redirect_and_hsts` |
| Correlation ids | `RequestContextMiddleware` sets `X-Request-Id`, echoed in every envelope | `test_request_id_is_returned` |
| Proxy trust | `client_ip()` honours `X-Forwarded-For` only for `TRUSTED_PROXIES` | `test_rate_limit_uses_forwarded_address_for_trusted_proxy` |
| Server banner | `--no-server-header`, `server` header stripped | `test_server_header_is_not_disclosed` |

## 2. Role-based access control (RBAC)

* Roles: SUPER_ADMIN, ADMIN, SALES_MANAGER, SALES_AGENT, ACCOUNTS, CUSTOMER (`app/core/constants.py`).
* Permission catalogue (`app/core/permissions.py`) — ~60 granular permissions (`booking:approve`, `payment:create`, `pii:reveal`, `audit:view`, …).
* Enforcement happens **in the service layer** (`BaseService._authorise`) — a new route cannot forget the check because the repository is never called directly by a controller.
* Row-level scoping: agents see their own deals, customers only their own records (`scope_clause`), enforced in SQL, not in the UI.
* Maker/checker: agent-entered bookings/customers land in `PENDING_APPROVAL` and only an approver can confirm them.
* Escalation guards: only a super admin can create/suspend super admins or edit permission grants (`UserService`).

**Verified by** `tests/test_rbac.py` (role matrix ↔ code parity, customer portal is view-only, cross-scope reads return 403/404), `tests/test_workflows.py::test_price_revision_requires_approval_permission`.

## 3. Sensitive data handling

| Data | At rest | In transit | In responses |
| --- | --- | --- | --- |
| Passwords | bcrypt (cost ≥ 12, `PASSWORD_HASH_ROUNDS`) | TLS | never returned, never logged |
| PAN / GSTIN / Aadhaar-shaped | Fernet field encryption (`app/core/crypto.py`) | TLS | masked (`XXXXX1234F`) unless the role holds `pii:reveal` |
| Mobile / e-mail | peppered blind index (`INDEX_PEPPER`) for lookups | TLS | masked by default (`PII_MASK_BY_DEFAULT`) |
| Refresh tokens | SHA-256 digest only, rotation + family revocation on reuse | TLS | single-use |
| Bank details | encrypted column, revealed only to ACCOUNTS/ADMIN on detail screens | TLS | masked in lists |
| Logs | `_redact()` scrubber removes tokens, passwords, PAN, e-mail, phone before a record is written | — | — |

**Verified by** `tests/test_sensitive_data.py` (masked by default, `pii:reveal` reveals, redaction of logs), `tests/test_database_security.py` (crypto round-trip, blind index).

## 4. Error handling

* One exception hierarchy (`app/core/exceptions.py`) → one JSON error envelope:
  `{"success": false, "error": {"code", "message", "details"}, "request_id"}`.
* Clients never see stack traces or SQL: `IntegrityError` → generic `409`,
  unexpected `Exception` → `500` with a correlation id only (`debug` off in prod).
* Validation failures are field-level `422` payloads with `error.details[]`.
* Every `4xx`/`5xx` is written to the security event stream with the correlation id.

**Verified by** `tests/test_input_validation.py`, `test_error_envelope_has_request_id`, `test_internal_errors_do_not_leak_details`.

## 5. Input validation

* Pydantic v2 models with `extra="forbid"`, length/pattern constraints, `Decimal` for money, enum coercion for statuses (`app/schemas/`).
* Domain validators: mobile (Indian E.164), e-mail (normalised + lower-cased), PAN, GSTIN (checksum), pincode, positive money, page-size caps.
* Stored-value safety: text is stripped and length-bounded (`SafeText`), addresses normalised; SQL injection is structurally impossible (SQLAlchemy Core/ORM parameter binding, zero string-built SQL).
* File/document uploads: content-type allowlist + size cap.

**Verified by** `tests/test_input_validation.py` (14 invalid-payload cases), `test_database_security.py::test_queries_are_parameterised`.

## 6. Database security

* Least privilege in code: the runtime user (`lalita_app`) has DML on business tables and **INSERT/SELECT only** on `audit_logs`, `security_events`, `login_attempts` (`backend/scripts/create_db.sql`).
* Migrations run as a separate DDL user (`lalita_migrate`); the app user cannot alter schema.
* TLS to MySQL (`DB_SSL_MODE=verify_identity` with CA bundle), `require_secure_transport=ON` server-side; production refuses `disabled`.
* Hardening: `sql_mode=STRICT_ALL_TABLES`, `local_infile=OFF`, per-session `MAX_EXECUTION_TIME`, connection pooling with recycle, `SELECT … FOR UPDATE` for plot holds.
* Soft deletes + `data_anonymised_at` marker; PII anonymisation is a single UPDATE path (`retention sweep`).
* No credentials in the repo: environment/secret manager only, `.env` git-ignored, `.env.example` documents every key.

**Verified by** `tests/test_database_security.py` (bootstrap script exists and grants the right verbs, soft delete, anonymisation, parameterisation).

## 7. Hosting

* Containers run as non-root (`uid 1001`), read-only root filesystem, `cap_drop: ALL`, `no-new-privileges`, tmpfs for `/tmp`.
* Private subnets only; the database has no route to the internet; the ALB is the only public surface.
* Static SPA served by nginx with `server_tokens off` and an explicit header policy; Vercel deployment carries the same headers via `vercel.json`.
* Environment promotion: image built once, promoted by immutable tag (no rebuilds between environments).

**Verified by** `deploy/web.Dockerfile`, `backend/Dockerfile`, `docker-compose.yml`, `infra/terraform/compute.tf`; TF checks in `security.yml`.

## 8. Secure communications

* TLS 1.2+/1.3 only at the ALB (`ELBSecurityPolicy-TLS13-1-2-2021-06`), HTTP → HTTPS 301, HSTS `max-age=63072000; includeSubDomains; preload`.
* Database TLS enforced (`require_secure_transport=ON`) with certificate verification.
* CSP, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, no inline scripts, fonts explicitly allowlisted.
* JWT access tokens are short-lived (30 min) and carried in the `Authorization` header; refresh tokens are rotated and stored only as digests; tokens are kept in memory/sessionStorage — never in URLs or localStorage.
* Cookies (if enabled) are `Secure`, `HttpOnly`, `SameSite=Strict`; no third-party trackers or analytics scripts are loaded.

**Verified by** `test_security_headers_present_on_every_response`, `test_https_redirect_and_hsts`, `test_refresh_token_rotation_detects_reuse`, `tests/test_auth.py`.

## 9. Logging and monitoring

* Structured JSON logs (`LOG_JSON=true`) with request id, user id, IP, route, latency; PII redacted by the formatter.
* Append-only `audit_logs` (who/what/when/before/after) for every create/update/delete; `security_events` for auth failures, lockouts, RBAC denials, rate limits, token reuse, oversized bodies.
* Business events mirrored into the same stream (`booking.approved`, `payment.recorded`, …) so an auditor can reconstruct a deal end-to-end.
* CloudWatch metric filters + alarms: failed logins > 20/5 min, RBAC denials, RDS CPU, ALB 5xx; SNS email to the owners.
* `/api/v1/health` (liveness) and `/ready` (DB connectivity) for probes; `GET /reports/audit-trail` exposes the security counters to admins.
* Log retention 400 days online, 10 years for audit rows (`AUDIT_RETENTION_DAYS`); retention sweep endpoint removes expired rows and reports counts.

**Verified by** `tests/test_audit_and_ops.py` (audit written for each mutation, security events for 401/403/423/429, retention sweep, audit access gated to super admin).

## 10. Security testing and audits

See `docs/SECURITY_TESTING.md` for the full matrix. Summary:

| Layer | Tool | Gate |
| --- | --- | --- |
| Unit/integration (110 tests) | pytest | PR blocker |
| Lint / style / bug patterns | ruff | PR blocker |
| SAST | bandit | PR blocker (high severity) |
| Dependency CVEs | pip-audit, npm audit, Dependabot | PR + weekly |
| Secrets | gitleaks | PR blocker |
| SAST | Semgrep (`p/ci`, `p/secrets`) + bandit | PR blocker |
| Container | trivy | PR blocker (HIGH/CRITICAL) |
| IaC | terraform validate, tfsec | PR blocker |
| Client render smoke | esbuild + jsdom (all 7 roles) | PR blocker |
| Access control review | RBAC matrix ↔ code parity test | PR blocker |
| Penetration test | external vendor | annual + before major launch |
| Backup restore drill | `scripts/restore_mysql.sh --verify` | quarterly (Owner: Platform) |

## 11. Backup and disaster recovery

* RDS: automated snapshots, 35-day retention, Multi-AZ, point-in-time recovery to any second in the window (RPO ≤ 5 min).
* Logical dumps (`scripts/backup_mysql.sh`) are GPG-encrypted, checksummed and uploaded to the versioned backup bucket, which replicates cross-region.
* S3 documents: versioning + lifecycle to Glacier IR at 365 days; noncurrent versions retained 365 days.
* Documented RTO 4 h / RPO 5 min with a step-by-step recovery runbook and a quarterly restore drill (`docs/BACKUP_AND_DR.md`).
* Deletion protection on the database and both buckets; Terraform state in an encrypted, locked bucket.

## 12. Dependency management

See `docs/DEPENDENCY_MANAGEMENT.md`: exact pinning, weekly grouped updates, CVE SLAs (critical 72 h, high 7 d, medium 30 d), `--ignore-scripts` installs, `pip-audit --strict`, licenses denied for AGPL/SSPL, SBOM generation on release.

## 13. Rate limiting and anti-abuse

* Token-bucket limiter (`app/core/rate_limit.py`): default 300/min, auth 10/min per IP+account, writes 120/min; Redis backend for multi-node.
* Progressive login delay + account lockout after 5 failures (15 min) and permanent lock for repeated abuse; lockout events are audited.
* Request-size cap, strict pagination caps (page_size ≤ 200), no unbounded list endpoints.
* WAF at the edge: AWS managed rule sets plus a 2000 req/5 min per-IP rate rule.
* Security telemetry counts 429s so abuse is visible in `/reports/audit-trail`.

**Verified by** `test_rate_limited_after_repeated_requests`, `test_login_lockout_after_max_failures`, `test_throttle_delay_grows_with_failures`.

## 14. Data privacy compliance (DPDP Act 2023 / GDPR-aligned)

* Lawful basis recorded: consent timestamp + version on the customer record (`consent_given_at`), required for portal sign-in.
* Data minimisation: only fields the business needs; masked by default; `pii:reveal` is a named permission and every reveal is audited.
* Data-subject rights API: access (export), correction, erasure (anonymisation), portability (`POST /customers/{id}/data-requests`); retention sweep honours `DATA_RETENTION_DAYS`.
* Breach notification runbook with 72-hour regulatory clock (`docs/INCIDENT_RESPONSE.md`).
* Data residency: primary region `ap-south-1` (India); cross-border transfer only to the DR replica region, documented.
* Sub-processors and purpose limitation recorded in `docs/DATA_PRIVACY.md`.

**Verified by** `tests/test_sensitive_data.py` (masking/reveal/consent), `test_privacy_data_subject_request_workflow`.

## 15. Incident response and security awareness

* Severity matrix, on-call rota, and per-incident playbooks (credential compromise, data exposure, ransomware, DDoS, insider misuse) in `docs/INCIDENT_RESPONSE.md`.
* Evidence preservation: security events + audit trail are append-only and retained 10 years; VPC flow logs and ALB access logs are kept in the logs bucket.
* Post-incident review template with a 5-working-day deadline and tracked action items.
* Awareness programme: secure-coding onboarding for every engineer, quarterly phishing simulation, an annual refresher, and a written secret-handling policy. Security requirements are part of the PR checklist.

## 16. Infrastructure as Code (IaC) security

* All infrastructure is Terraform (`infra/terraform`) — no console changes; PR review + plan output required.
* State: S3 with KMS encryption, versioning and DynamoDB locking; state files git-ignored.
* Encrypted-by-default: KMS CMK with rotation for RDS, S3, logs, SNS and secrets; public access blocked on every bucket.
* Network isolation: private subnets for data and compute, security groups scoped by reference (not CIDR), no public IP on tasks, flow logs on.
* Least-privilege IAM: separate execution and task roles; no `*` actions on data resources; secrets read at runtime from Secrets Manager.
* Guardrails in CI: `terraform fmt/validate`, tfsec, and manual review for destructive changes.

---

## Reporting a vulnerability

See `SECURITY.md` at the repository root. Do not open a public issue for a
suspected vulnerability; email `security@lalitarealestate.example` with steps to
reproduce. We acknowledge within 2 business days and aim to remediate critical
issues within 72 hours.
