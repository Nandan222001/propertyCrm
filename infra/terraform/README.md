# Infrastructure as Code — Lalita ERP

Terraform for the production/staging estate. Everything is code-reviewed before
apply; nothing is clicked in the console (change control + reproducible audit).

## What it provisions

| Area | Resources | Security control |
| ---- | --------- | ---------------- |
| Network | VPC, public/private subnets, NAT, VPC flow logs | DB and tasks live in private subnets, flow logs retained 400 days |
| Data | RDS MySQL 8.4 (Multi-AZ, encrypted, 35-day PITR), S3 documents, S3 backups | KMS CMK with yearly rotation, `require_secure_transport=ON`, no public buckets |
| Edge | ALB (TLS 1.2+/1.3, drop invalid headers, access logs), WAFv2 | Managed rule sets (common, SQLi, bad inputs) + per-IP rate limiting |
| Compute | ECS Fargate service (2-6 tasks), autoscaling | Read-only root FS, non-root user, least-privilege task role, circuit-breaker rollback |
| Secrets | Secrets Manager + random 40-char DB password | Secrets never in state files, images or env files |
| Observability | CloudWatch log group (KMS), metric filters, alarms, SNS | Alarms for failed logins (>20/5 min), denied requests, RDS CPU, ALB 5xx |
| DR | Cross-region replicated backup bucket | RPO ≤ 5 min (PITR), RTO documented in `docs/BACKUP_AND_DR.md` |

## Usage

```bash
cd infra/terraform
terraform init                       # remote state: S3 + DynamoDB lock + KMS
terraform plan  -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars
```

Pipeline order on release:

```bash
terraform plan -out=tf.plan && terraform apply tf.plan     # infra first
alembic upgrade head                                        # then schema
# then roll the ECS service to the new immutable image tag
```

## Guardrails in CI

`terraform fmt -check`, `terraform validate`, `tflint`, `tfsec`/`checkov`
(misconfiguration scan) and `terraform plan` are required checks on every PR —
see `.github/workflows/security.yml`.

## Rules

1. Never commit `*.tfstate`, `.terraform/` or a filled `terraform.tfvars`.
2. Destructive changes (`deletion_protection`, bucket lifecycle) need a second
   reviewer and a written justification in the PR.
3. Secrets are read from Secrets Manager at runtime; adding one to `environment`
   in a task definition is a review blocker.
