# Data Privacy & Compliance (DPDP Act 2023, GDPR-aligned)

## 1. Roles and lawful basis

| Party | Role | Notes |
| --- | --- | --- |
| Lalita Realestate Infra | Data Fiduciary / Controller | decides purpose and means |
| Customers (buyers, prospects) | Data Principal / Data Subject | consent recorded at intake |
| Agents & staff | Data Principal (employees) | processed for contract/employment + legitimate interest |
| Cloud provider (AWS, ap-south-1) | Data Processor | infra only, no independent use; DPA in place |
| WhatsApp (click-to-chat) | Third party | staff-initiated; no automatic transfer from our systems |

Lawful bases used: **consent** (marketing, portal access, follow-ups), **contract**
(booking, payment, registry), **legal obligation** (tax, RERA, books of account),
**legitimate interest** (security logging, fraud prevention).

## 2. What we collect and why (data inventory)

| Category | Examples | Purpose | Storage | Retention |
| --- | --- | --- | --- | --- |
| Identity | name, e-mail, mobile, address, PAN, GSTIN | sell/mortgage a property, invoicing | MySQL, encrypted/PAN hashed | 7 years after the last transaction |
| Financial | booking value, instalments, receipts, TDS | accounting and tax | MySQL | 7 years (statutory) |
| Documents | booking form, allotment letter, agreement scans | contract performance | S3 (KMS, versioned, private) | 7 years |
| Access & security | login attempts, audit trail, security events | security, fraud prevention | MySQL (append-only) | 10 years |
| Portal preferences | consent timestamp/version, last login | consent evidence | MySQL | life of the account + 3 years |
| Support notes | follow-up remarks | service quality | MySQL | 3 years |

Data minimisation: only the fields required for the transaction are collected;
free-text fields are length-bounded; nothing sensitive is captured "just in case".

## 3. Data-subject rights (implemented)

| Right | Implementation | API |
| --- | --- | --- |
| Access / portability | full JSON export of the customer's records and documents index | `POST /customers/{id}/data-requests` (`type=access` or `portability`) |
| Correction | update request creates an audit-stamped correction task | `type=correction` |
| Erasure | anonymisation: identifiers replaced, financial records preserved in aggregate (legal obligation) | `type=erasure` |
| Consent withdrawal | clears `consent_given_at`, blocks portal sign-in, keeps the evidence of the withdrawal | `PATCH /customers/{id}` (consent flag) |
| Grievance | DPO contact published in the portal footer + `security@`/`privacy@` mailboxes | — |

Service level: acknowledge in 48 h, complete in 30 days (extension with written
reason for complex requests).

## 4. Consent

* Consent is captured with timestamp, version of the notice, and the source.
* `CONSENT_REQUIRED=true` means a customer portal account cannot be used until
  consent exists; sign-in returns a clear error otherwise.
* Withdrawal is as easy as giving consent and is recorded in `audit_logs`.
* Marketing follow-ups reference consent; anything not covered is not sent.

## 5. Retention and deletion

* `DATA_RETENTION_DAYS=2555` (7 years) for customer and transaction data.
* `AUDIT_RETENTION_DAYS=3650` (10 years) for security evidence — retained under
  the legal-obligation basis and because erasing it would defeat fraud detection.
* `POST /ops/retention-sweep` anonymises/expires eligible records and returns the
  counts; the operation is audited and runs on a scheduled task.
* Backups age out automatically (35-day RDS window, 90-day dumps); a deleted
  record therefore disappears from backups within the retention window.
* Soft deletes keep the row recoverable for 30 days before the sweep anonymises it.

## 6. Security of processing

* Encryption in transit (TLS 1.2+/1.3) and at rest (KMS CMK; PAN/bank fields
  additionally encrypted at the column level with a Fernet key from Secrets Manager).
* Masked by default across the API and UI; unmasking requires the `pii:reveal`
  permission and is written to the audit trail with the actor and the record.
* Access is role-scoped in SQL (an agent cannot read another agent's customers).
* Administrator access to audit logs is limited to the super-admin role.
* Vendors/contractors get time-boxed, least-privilege access only.

## 7. Cross-border transfer

Primary processing region is **ap-south-1 (Mumbai)**. Encrypted backups replicate
to a second region (`backup_replica_region`, default ap-southeast-1) purely for
durability; no production traffic or support access happens there. Any new
sub-processor or region requires a DPIA update and a customer notice.

## 8. Breach handling

See `docs/INCIDENT_RESPONSE.md` — DPO informed within 24 h, regulator within 72 h
when risk is likely, individuals informed without undue delay when risk is high,
written report within 5 working days.

## 9. Governance

* Privacy notice + consent wording are versioned in this repository.
* A DPIA is required for any feature that adds a new data category, a new
  processor, profiling/AI scoring, or a new cross-border flow.
* Annual internal audit of access rights, retention compliance, and DSR handling.
* Records of processing (this document) are reviewed twice a year and after any
  material change.
