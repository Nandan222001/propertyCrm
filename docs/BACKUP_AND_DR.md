# Backup & Disaster Recovery

## 1. Objectives

| Metric | Target | How it is met |
| --- | --- | --- |
| **RPO** (max data loss) | ≤ 5 minutes | RDS automated backups + binary logs → point-in-time recovery |
| **RTO** (time to restore service) | ≤ 4 hours | Multi-AZ RDS (AZ failure ≈ 60-120 s), documented restore runbook, pre-built images |
| Backup retention | 35 days | `db_backup_retention_days` (Terraform), plus 90-day logical dumps |
| Off-site copy | Cross-region | S3 backup bucket replicated to a second region |
| Restore verification | Quarterly | `scripts/restore_mysql.sh --verify` drill with a signed record |

## 2. What is backed up

| Asset | Method | Frequency | Retention | Location |
| --- | --- | --- | --- | --- |
| MySQL (all business + audit tables) | RDS automated snapshot + PITR | continuous / daily snapshot | 35 days | RDS, ap-south-1 |
| MySQL logical dump | `scripts/backup_mysql.sh` (GPG + SHA-256) | daily 01:15 IST | 90 days | S3 backups bucket → replicated |
| Customer documents | S3 versioning + lifecycle (Glacier IR at 365 d) | continuous | 7 years | S3 documents bucket |
| Application config / IaC | Git + Terraform state (encrypted, versioned, locked) | every change | forever | S3 tfstate bucket |
| Secrets | AWS Secrets Manager (versioned, 30-day recovery window) | on rotation | — | Secrets Manager |
| Logs / audit evidence | CloudWatch + ALB access logs | continuous | 400 days online, 10 years audit rows | CloudWatch / S3 logs |

## 3. Daily automated backup

```bash
# installed as a cron / ECS scheduled task (01:15 IST daily)
backend/scripts/backup_mysql.sh --database lalita_erp --out /var/backups/lalita
```

The script:

1. takes a consistent `mysqldump --single-transaction --routines --triggers`
   (no table locks on InnoDB),
2. compresses, encrypts with GPG (recipient from `BACKUP_GPG_RECIPIENT`) and
   writes a SHA-256 checksum file,
3. uploads dump + checksum to `s3://…-backups/<env>/mysql/YYYY-MM-DD/` with SSE-KMS,
4. verifies the upload (`aws s3api head-object`) and prunes local files older than 7 days.

Failures raise a CloudWatch alarm through the same SNS topic as the security alarms.

## 4. Restore runbook (data loss / corruption)

**Step 0 — declare the incident** (`docs/INCIDENT_RESPONSE.md`, severity SEV-1) and
freeze writes by scaling the ECS service to 0 (or enabling the maintenance
listener on the ALB).

**Option A — point-in-time recovery (preferred, ≤ 5 min loss):**

1. RDS console/CLI → *Restore to point in time*, target time = last known good
   timestamp (use the audit log around the incident window).
2. Restore into the **private** subnets with the same parameter group, instance
   class and security group; encryption with the same KMS key.
3. Validate: row counts on `bookings`, `payments`, `audit_logs`; newest audit row
   timestamp; smoke sign-in against the restored instance.
4. Repoint the application (`DB_HOST` parameter) and scale the service back to 2 tasks.
5. Replay anything lost from the logical dumps or application logs, and document
   the exact data gap in the incident record.

**Option B — restore a logical dump:**

```bash
backend/scripts/restore_mysql.sh \
  --dump s3://lalita-erp-backups-<account>-production/mysql/2026-10-03/lalita_erp.sql.gz.gpg \
  --target-host lalita-erp-restore.xxxx.ap-south-1.rds.amazonaws.com \
  --verify
```

`--verify` restores into a scratch schema, runs row-count and referential-integrity
checks, and drops the scratch schema only after the checks pass.

## 5. Disaster scenarios

| Scenario | Expected behaviour | Action |
| --- | --- | --- |
| Single AZ outage | Multi-AZ failover, ~60-120 s of failed writes | verify failover, watch alarms, no manual action |
| Region outage | Service down (single-region primary) | restore latest snapshot in the DR region, repoint DNS, notify customers; cross-region replicas provide the data |
| Accidental data deletion (app or human) | Soft deletes recoverable instantly; hard deletes via PITR | `deleted_at` restore for soft case, PITR for the rest; check `audit_logs` for the actor |
| Ransomware / credential compromise | Immutable backups + versioning prevent overwrite | isolate, rotate secrets, restore from an unaffected snapshot, follow SEV-1 playbook |
| Corruption discovered days later | Logical dumps from 90 days available | restore the nearest good dump, reconcile from audit trail |

## 6. Drill schedule (Owner: Platform on-call)

| Cadence | Drill | Evidence |
| --- | --- | --- |
| Monthly | Verify the latest backup is restorable (checksum + `--verify` against scratch schema) | ticket with row counts |
| Quarterly | Full restore into a scratch instance and a smoke test against it | signed drill record + measured RTO |
| Semi-annual | Region-loss tabletop: restore in the DR region | updated runbook + timing |
| Annual | Full DR game day with the business (comms + reconciliation) | post-drill report with action items |

Record every drill outcome in the operations log. If a drill fails, the failing
step becomes a tracked task and is retested within 30 days.
