# Security Policy — Lalita Realestate Infra ERP

## Supported versions

| Version | Supported |
| --- | --- |
| `main` (and the current release tag) | ✅ security fixes |
| Older tags | ❌ upgrade required |

## Reporting a vulnerability

**Please do not open a public issue.** Email `security@lalitarealestate.example`
with:

* affected component/version and environment,
* reproduction steps or a proof-of-concept,
* impact assessment (what data or capability is exposed),
* your contact details for follow-up.

If you need to encrypt the report, request our PGP key in the first e-mail.
We will acknowledge receipt within **2 business days** and share a remediation
plan within **5 business days**.

## Our commitments

| Severity | Acknowledge | Fix target |
| --- | --- | --- |
| Critical (auth bypass, data breach, RCE) | 4 h | 72 h |
| High (privilege escalation, PII exposure) | 1 business day | 7 days |
| Medium | 3 business days | 30 days |
| Low / hardening | 5 business days | next release |

We will credit reporters (with permission) in the release notes, and we will not
pursue legal action for good-faith research that respects privacy and does not
degrade the service. Please do not access data that is not yours, do not run
automated scanners against production, and give us reasonable time to fix before
disclosure.

## What we already do

See [`docs/SECURITY.md`](docs/SECURITY.md) for the full control register —
middleware hardening, RBAC, PII encryption/masking, audit logging, rate limiting,
dependency scanning, IaC guardrails, backup/DR and privacy operations.
