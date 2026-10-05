# Incident Response & Security Awareness

## 1. Roles

| Role | Who | Responsibility |
| --- | --- | --- |
| Incident commander | on-call platform engineer | owns the incident, decisions, and comms cadence |
| Security lead | engineering lead | containment strategy, evidence, regulator/vendor liaison |
| Scribe | any engineer | timeline, actions, decisions in the incident channel |
| Communications | product owner | customer and internal updates, status page |
| Data protection officer | named in `docs/DATA_PRIVACY.md` | breach assessment and DPDP/GDPR notification decision |

On-call rota and escalation numbers live in the internal runbook; the SNS alert
topic (`lalita-erp-alerts-<env>`) pages the primary on-call.

## 2. Severity matrix

| Severity | Definition | Examples | Response | Update cadence |
| --- | --- | --- | --- | --- |
| **SEV-1** | Active data breach, auth bypass, service down, data loss | credential stuffing succeeding, PII exposure, ransomware, RDS unreachable | page immediately, all hands | every 30 min |
| **SEV-2** | Degraded security posture or partial outage | rate limiter failing open, one role cannot work, elevated 5xx | page primary, fix within business hours | every 2 h |
| **SEV-3** | Suspicious but unconfirmed | repeated 403s from one account, unusual export volume | ticket + triage same day | daily |
| **SEV-4** | Hardening opportunity | scanner finding, missing header on a static asset | backlog with owner | weekly |

## 3. Lifecycle

**Detect → Triage → Contain → Eradicate → Recover → Review**

1. **Detect** — CloudWatch alarms (failed logins, RBAC denials, RDS CPU, ALB 5xx), WAF blocks, customer report, or a `security_events` review.
2. **Triage** — declare severity, open the incident channel, assign the commander, start the timeline. Preserve evidence *before* changes: export the relevant `audit_logs`/`security_events` rows and CloudWatch queries.
3. **Contain** — smallest action that stops the bleeding: revoke sessions (`logout` all / rotate `SECRET_KEY` to invalidate all JWTs), lock the account, block the offending IP at the WAF, scale to zero.
4. **Eradicate** — patch the root cause, rotate exposed credentials (Secrets Manager versioning), re-scan dependencies, add a regression test.
5. **Recover** — restore service, verify with the smoke checklist, monitor the security dashboard for 48 h.
6. **Review** — blameless post-incident review within 5 working days; actions tracked with owners and dates.

## 4. Playbooks

### 4.1 Credential stuffing / brute force
* Signals: `FailedLogins` alarm, many `auth.account_locked` events, 429s from one ASN.
* Actions: confirm the rate limiter and lockout are working (`security_events` count), block the source at WAF, force password resets for targeted accounts, enable MFA rollout for staff, notify affected users if any login succeeded.

### 4.2 Suspected account takeover
* Signals: impossible-travel sign-ins, mass export, role-preview abuse, permission changes outside change windows.
* Actions: revoke all refresh tokens for the user, rotate the account password, review `audit_logs` for the actor, restore any tampered rows from PITR, decide on notification.

### 4.3 PII exposure
* Signals: `pii:reveal` spikes, documents bucket policy change, misconfigured CORS, unexpected `GET /customers` volume.
* Actions: stop the exposure (revert config/policy), identify the dataset and subjects, notify the DPO within 24 h, breach assessment within 72 h, preserve evidence, document the notification decision either way.

### 4.4 Ransomware / destructive attack
* Signals: sudden mass deletes, RDS deletions, unusual IAM activity.
* Actions: isolate the task/role, do **not** delete the backups bucket contents, restore from the cross-region replica into a clean account, rotate every secret and key, engage AWS support and law enforcement as advised, full postmortem.

### 4.5 Third-party / dependency compromise
* Signals: Dependabot/`pip-audit` critical advisory, typosquat in a PR, unexpected post-install script.
* Actions: pin the last known-good version, rebuild the image, rotate any secret the package could read, review CI logs for exfiltration, add the advisory to the weekly report.

## 5. Evidence preservation

* `audit_logs` and `security_events` are append-only for the application user; keep a copy in the backups bucket with a legal-hold prefix.
* CloudWatch log groups are KMS-encrypted and retained 400 days; VPC flow logs and ALB access logs go to the logs bucket.
* Snapshot the RDS instance before any recovery that could overwrite evidence.
* Record every command run during containment in the incident channel (the scribe owns this).

## 6. Breach notification clock (DPDP Act 2023 / GDPR art. 33)

| Elapsed | Action |
| --- | --- |
| < 24 h | DPO informed; scope and categories of data assessed |
| < 72 h | Regulator notified if the breach is likely to result in risk (Data Protection Board / supervisory authority) |
| Without undue delay | Affected individuals informed when the risk is high, with plain-language guidance |
| < 5 days | Written incident report with root cause and remediation plan |

## 7. Post-incident review template

```
Incident: <id/title>            Severity: SEV-x          Date:
Commander / Scribe / Responders:
Impact (users, data, money, duration):
Detection (how, how long until detected):
Timeline (UTC, one line per event):
Root cause (5 whys):
What worked / what did not:
Action items: <owner> <due date> <ticket>
Evidence location:
Detection improvement (which alarm/test would catch this sooner):
```

## 8. Security awareness programme

| Activity | Audience | Cadence | Owner |
| --- | --- | --- | --- |
| Secure-coding onboarding (OWASP Top 10 + this repo's controls) | every engineer | on joining | Eng lead |
| Quarterly phishing simulation + debrief | all staff | quarterly | Security lead |
| Secret-handling & PII handling refresher | all staff with data access | annual | DPO |
| Incident tabletop exercise | engineering + product | semi-annual | Commander rota |
| Security requirements in the PR checklist | contributors | every PR | Reviewers |

**Non-negotiable habits:** never commit secrets (`.env` is ignored; a leaked key
is rotated immediately), never share customer PII outside the system, never
disable a security control without a written, time-boxed exception approved by
the security lead, and report anything suspicious early — a false alarm costs
minutes, a missed breach costs the business.
