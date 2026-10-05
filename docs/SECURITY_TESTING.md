# Security Testing Strategy

## 1. Test pyramid in this repository

| Layer | Location | Count | Purpose |
| --- | --- | --- | --- |
| Unit + integration (API) | `backend/tests/*.py` | 110 tests | every security control and business rule |
| Migration verification | `tests/test_audit_and_ops.py` | upgrade + downgrade + offline MySQL DDL render | schema is reversible and MySQL-correct |
| Client render smoke | `scripts/render-smoke.mjs` | login screen + 7 roles + 5 deep links | the SPA cannot silently break for a role |
| Static analysis | ruff, bandit, Semgrep, tfsec | CI | bug patterns, insecure APIs, IaC misconfiguration |
| Dependency audit | pip-audit, npm audit, Dependabot, trivy | CI + weekly | known CVEs in our supply chain |
| Secret scanning | gitleaks (full history) | CI | no credential ever enters git |
| Dynamic (manual) | OWASP ZAP baseline against staging | per release | headers, auth flows, injection surface |
| Penetration test | external vendor | annual + before major launch | adversarial validation |

## 2. Control → test mapping

| Control area | Test module / case |
| --- | --- |
| Middleware protection (hosts, headers, size, HTTPS) | `test_security_controls.py` |
| RBAC matrix + row scoping | `test_rbac.py`, `test_workflows.py` |
| Sensitive data (masking, encryption, redaction) | `test_sensitive_data.py`, `test_database_security.py` |
| Error envelope + no leakage | `test_input_validation.py`, `test_audit_and_ops.py` |
| Input validation | `test_input_validation.py` (mobile, e-mail, PAN, GSTIN, money, enums, pagination) |
| Database least privilege + soft delete | `test_database_security.py` |
| Secure communications (headers, HSTS, TLS config) | `test_security_controls.py` |
| Logging, audit, security events | `test_audit_and_ops.py` |
| Rate limiting + lockout + anti-abuse | `test_security_controls.py`, `test_auth.py` |
| Privacy (consent, DSR, retention) | `test_sensitive_data.py`, `test_audit_and_ops.py` |
| Auth lifecycle (rotation, reuse detection, logout) | `test_auth.py` |

Run everything locally with:

```bash
cd backend && python -m pytest tests -q          # 110 tests, ~10 s
npm run verify                                    # build + render smoke
ruff check app tests && bandit -c bandit.yaml -r app
pip-audit -r requirements.txt
```

## 3. What the tests intentionally assert (highlights)

* A role **without** a permission gets `403` *and* a `rbac.denied` security event — denial is evidence, not silence.
* A locked account returns `423` only after `MAX_FAILED_LOGINS`, and the earlier attempts are throttled instead of insta-locking (usability vs. security).
* Refresh tokens are single-use: replaying an old one returns `401` and revokes the whole family.
* PII is masked by default; only `pii:reveal` roles see raw values, and the reveal is audited.
* Over-collection beyond the contract value is rejected with `409` — money rules are tested as strictly as auth rules.
* The least-privilege bootstrap script exists and grants `SELECT/INSERT/UPDATE/DELETE` on business tables but only `INSERT/SELECT` on audit tables.
* Validations fail with a field-level `422` payload (`error.details[]`), never with a stack trace.

## 4. Environment and data rules for testing

* Tests never run against production data or production credentials.
* Fixtures create their own records with unique e-mail/mobile values (the schema
  enforces uniqueness, so shared constants would create false failures).
* SQLite is used for fast feedback; the MySQL path is validated separately with
  `alembic upgrade head --sql` plus a real MySQL service container in CI.
* Destructive tests (anonymisation, retention sweep, lockout) operate only on
  records they created in the same test.

## 5. Cadence

| Activity | Frequency | Owner |
| --- | --- | --- |
| Full test + scanner suite | every PR | CI |
| Weekly dependency drift scan | Monday 03:00 | CI schedule |
| OWASP ZAP baseline on staging | every release | Eng |
| Access review (who holds `pii:reveal`, `audit:view`, admin roles) | quarterly | DPO + Eng lead |
| External penetration test | annual + before major launch | Security lead |
| Restore drill | quarterly | Platform |

## 6. Test quality bar

A new security control is only "done" when it has:

1. a test that fails without the control and passes with it,
2. a documented entry in `docs/SECURITY.md`,
3. telemetry (audit or security event) when it triggers a rejection,
4. a written note in the PR template checklist.

Exceptions to the bar (e.g. an infra-only control) must state the compensating
verification in the PR.
