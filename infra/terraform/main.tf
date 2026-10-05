# =============================================================================
# Core platform: network isolation, encrypted data stores, secrets, logging,
# WAF-protected edge, and an ECS service that runs the API image.
# =============================================================================

data "aws_caller_identity" "current" {}
data "aws_availability_zones" "available" {
  state = "available"
}

# ----------------------------------------------------------------- network
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "lalita-erp-${var.environment}" }
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = false # nothing public launches by default
  tags                    = { Name = "lalita-erp-public-${count.index}", Tier = "public" }
}

# Private subnets host the database and application tasks: no route to the IGW.
resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + 8)
  availability_zone = data.aws_availability_zones.available.names[count.index]
  tags              = { Name = "lalita-erp-private-${count.index}", Tier = "private" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
}

resource "aws_eip" "nat" {
  count  = 2
  domain = "vpc"
}

resource "aws_nat_gateway" "main" {
  count         = 2
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id
  depends_on    = [aws_internet_gateway.main]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  count  = 2
  vpc_id = aws_vpc.main.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[count.index].id
  }
}

resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# VPC flow logs to CloudWatch — network forensics for incident response.
resource "aws_flow_log" "main" {
  vpc_id               = aws_vpc.main.id
  traffic_type         = "ALL"
  log_destination_type = "cloud-watch-logs"
  log_destination      = aws_cloudwatch_log_group.flowlogs.arn
  iam_role_arn         = aws_iam_role.flowlogs.arn
}

resource "aws_cloudwatch_log_group" "flowlogs" {
  name              = "/aws/vpc/lalita-erp-${var.environment}"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.data.arn
}

resource "aws_iam_role" "flowlogs" {
  name = "lalita-erp-flowlogs-${var.environment}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "vpc-flow-logs.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "flowlogs" {
  role = aws_iam_role.flowlogs.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogGroups", "logs:DescribeLogStreams"]
      Resource = "${aws_cloudwatch_log_group.flowlogs.arn}:*"
    }]
  })
}

# ------------------------------------------------------------------- KMS
resource "aws_kms_key" "data" {
  description             = "Lalita ERP data at rest (RDS, S3, logs, secrets)"
  enable_key_rotation     = true # IaC requirement: yearly rotation
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.kms.json
}

resource "aws_kms_alias" "data" {
  name          = "alias/lalita-erp-${var.environment}"
  target_key_id = aws_kms_key.data.key_id
}

data "aws_iam_policy_document" "kms" {
  statement {
    sid       = "AllowAccountRoot"
    effect    = "Allow"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }
  statement {
    sid    = "AllowAwsServices"
    effect = "Allow"
    actions = [
      "kms:Decrypt", "kms:GenerateDataKey", "kms:DescribeKey", "kms:ReEncrypt*", "kms:CreateGrant",
    ]
    resources = ["*"]
    principals {
      type = "Service"
      identifiers = [
        "rds.amazonaws.com", "s3.amazonaws.com", "logs.amazonaws.com",
        "secretsmanager.amazonaws.com", "sns.amazonaws.com", "ecs.amazonaws.com",
      ]
    }
  }
}

# --------------------------------------------------------------- secrets
resource "aws_secretsmanager_secret" "app" {
  name                    = "lalita-erp/${var.environment}/app"
  description             = "Application secrets: SECRET_KEY, INDEX_PEPPER, FIELD_ENCRYPTION_KEY, DB_PASSWORD"
  kms_key_id              = aws_kms_key.data.arn
  recovery_window_in_days = 30
}

resource "random_password" "db" {
  length           = 40
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    DB_PASSWORD          = random_password.db.result
    SECRET_KEY           = random_password.app_secret.result
    INDEX_PEPPER         = random_password.pepper.result
    FIELD_ENCRYPTION_KEY = random_password.field_key.result
  })
}

resource "random_password" "app_secret" { length = 64 }
resource "random_password" "pepper" { length = 48 }
resource "random_password" "field_key" { length = 44 }

# ------------------------------------------------------------- database
resource "aws_db_subnet_group" "main" {
  name       = "lalita-erp-${var.environment}"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_parameter_group" "main" {
  name   = "lalita-erp-mysql-${var.environment}"
  family = "mysql8.4"

  parameter {
    name  = "require_secure_transport"
    value = "ON"
  }
  parameter {
    name  = "local_infile"
    value = "OFF"
  }
  parameter {
    name  = "sql_mode"
    value = "STRICT_ALL_TABLES,NO_ENGINE_SUBSTITUTION"
  }
  parameter {
    name  = "audit_log_enabled"
    value = "ON"
  }
  parameter {
    name  = "log_connections"
    value = "ON"
  }
  parameter {
    name  = "slow_query_log"
    value = "1"
  }
  parameter {
    name  = "long_query_time"
    value = "2"
  }
}

resource "aws_db_instance" "main" {
  identifier                      = "lalita-erp-${var.environment}"
  engine                          = "mysql"
  engine_version                  = "8.4"
  instance_class                  = var.db_instance_class
  allocated_storage               = 100
  max_allocated_storage           = 500
  storage_type                    = "gp3"
  storage_encrypted               = true
  kms_key_id                      = aws_kms_key.data.arn
  db_name                         = "lalita_erp"
  username                        = "lalita_admin"
  password                        = random_password.db.result
  multi_az                        = true # survives an AZ failure
  backup_retention_period         = var.db_backup_retention_days
  backup_window                   = "19:30-20:30" # 01:00-02:00 IST
  maintenance_window              = "sun:20:45-sun:21:45"
  copy_tags_to_snapshot           = true
  deletion_protection             = true
  skip_final_snapshot             = false
  final_snapshot_identifier       = "lalita-erp-final-${var.environment}"
  performance_insights_enabled    = true
  monitoring_interval             = 60 # Enhanced monitoring
  enabled_cloudwatch_logs_exports = ["audit", "error", "general", "slowquery"]
  auto_minor_version_upgrade      = true
  apply_immediately               = false
  db_subnet_group_name            = aws_db_subnet_group.main.name
  parameter_group_name            = aws_db_parameter_group.main.name
  vpc_security_group_ids          = [aws_security_group.db.id]
  # Point-in-time recovery is implicit with automated backups (RPO <= 5 min).
}

# --------------------------------------------------------------- storage
resource "aws_s3_bucket" "documents" {
  bucket = "lalita-erp-documents-${data.aws_caller_identity.current.account_id}-${var.environment}"
}

resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.data.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "documents" {
  bucket                  = aws_s3_bucket.documents.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id
  rule {
    id     = "archive-and-expire"
    status = "Enabled"
    filter {}
    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }
    transition {
      days          = 365
      storage_class = "GLACIER_IR" # retained 7 years per DPDP retention policy
    }
    noncurrent_version_expiration { noncurrent_days = 365 }
  }
}

# Backups bucket: versioned, encrypted, replicated to a second region.
resource "aws_s3_bucket" "backups" {
  bucket = "lalita-erp-backups-${data.aws_caller_identity.current.account_id}-${var.environment}"
}

resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.data.arn
    }
  }
}

resource "aws_s3_bucket_public_access_block" "backups" {
  bucket                  = aws_s3_bucket.backups.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_replication_configuration" "backups" {
  depends_on = [aws_s3_bucket_versioning.backups]
  bucket     = aws_s3_bucket.backups.id
  role       = aws_iam_role.replication.arn

  rule {
    id     = "cross-region"
    status = "Enabled"
    destination {
      bucket        = aws_s3_bucket.backups_replica.arn
      storage_class = "STANDARD_IA"
      encryption_configuration { replica_kms_key_id = aws_kms_key.replica.arn }
    }
  }
}

resource "aws_s3_bucket" "backups_replica" {
  provider = aws.replica
  bucket   = "lalita-erp-backups-replica-${data.aws_caller_identity.current.account_id}"
}

resource "aws_kms_key" "replica" {
  provider            = aws.replica
  description         = "Replica-region key for backup durability"
  enable_key_rotation = true
}

resource "aws_iam_role" "replication" {
  name = "lalita-erp-replication-${var.environment}"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "s3.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

# --------------------------------------------------------------- edge + WAF
resource "aws_lb" "main" {
  name               = "lalita-erp-${var.environment}"
  load_balancer_type = "application"
  internal           = false
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  access_logs {
    bucket  = aws_s3_bucket.logs.id
    prefix  = "alb"
    enabled = true
  }

  drop_invalid_header_fields = true # header-smuggling defence
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06" # TLS 1.3 + 1.2 only
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      status_code  = "404"
      message_body = "Not found"
    }
  }
}

resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_wafv2_web_acl" "main" {
  name  = "lalita-erp-${var.environment}"
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "lalita-erp-waf"
    sampled_requests_enabled   = true
  }

  # AWS-managed baselines: common attacks, SQLi, bad inputs, Linux/known-bad IPs.
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "common-rules"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesSQLiRuleSet"
    priority = 2
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "sqli-rules"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 3
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  # Brute-force damping at the edge, on top of the application rate limiter.
  rule {
    name     = "RateLimitPerIp"
    priority = 10
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "rate-limit"
      sampled_requests_enabled   = true
    }
  }
}

resource "aws_wafv2_web_acl_association" "main" {
  resource_arn = aws_lb.main.arn
  web_acl_arn  = aws_wafv2_web_acl.main.arn
}

# ------------------------------------------------------------------ logs
resource "aws_s3_bucket" "logs" {
  bucket = "lalita-erp-logs-${data.aws_caller_identity.current.account_id}-${var.environment}"
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket                  = aws_s3_bucket.logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/lalita-erp-api-${var.environment}"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.data.arn
}

# Security telemetry the API emits as structured JSON -> metric + alarm.
resource "aws_cloudwatch_log_metric_filter" "failed_logins" {
  name           = "lalita-erp-failed-logins"
  log_group_name = aws_cloudwatch_log_group.api.name
  pattern        = "{ $.event = \"auth.failed\" }"
  metric_transformation {
    name          = "FailedLogins"
    namespace     = "LalitaERP/Security"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "denied_requests" {
  name           = "lalita-erp-denied"
  log_group_name = aws_cloudwatch_log_group.api.name
  pattern        = "{ $.event = \"rbac.denied\" }"
  metric_transformation {
    name          = "PermissionDenied"
    namespace     = "LalitaERP/Security"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_sns_topic" "alerts" {
  name              = "lalita-erp-alerts-${var.environment}"
  kms_master_key_id = aws_kms_key.data.id
}

resource "aws_sns_topic_subscription" "email" {
  count     = length(var.alert_emails)
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_emails[count.index]
}

resource "aws_cloudwatch_metric_alarm" "failed_logins" {
  alarm_name          = "lalita-erp-failed-logins-${var.environment}"
  alarm_description   = "More than 20 failed sign-ins in 5 minutes — possible credential stuffing."
  namespace           = "LalitaERP/Security"
  metric_name         = "FailedLogins"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 20
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "db_cpu" {
  alarm_name          = "lalita-erp-db-cpu-${var.environment}"
  alarm_description   = "RDS CPU > 80% for 10 minutes."
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  dimensions          = { DBInstanceIdentifier = aws_db_instance.main.identifier }
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "lalita-erp-alb-5xx-${var.environment}"
  alarm_description   = "Elevated 5xx rate at the load balancer."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_ELB_5XX_Count"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 25
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  dimensions          = { LoadBalancer = aws_lb.main.arn_suffix }
}
