output "vpc_id" {
  description = "Application VPC id."
  value       = aws_vpc.main.id
}

output "load_balancer_dns" {
  description = "Public DNS name of the HTTPS entrypoint (alias erp.lalitarealestate.example to it)."
  value       = aws_lb.main.dns_name
}

output "database_endpoint" {
  description = "RDS writer endpoint (private)."
  value       = aws_db_instance.main.endpoint
  sensitive   = true
}

output "app_secret_arn" {
  description = "Secrets Manager ARN holding SECRET_KEY, INDEX_PEPPER, FIELD_ENCRYPTION_KEY and DB_PASSWORD."
  value       = aws_secretsmanager_secret.app.arn
}

output "documents_bucket" {
  description = "S3 bucket for customer documents."
  value       = aws_s3_bucket.documents.bucket
}

output "backups_bucket" {
  description = "Versioned, cross-region-replicated backup bucket."
  value       = aws_s3_bucket.backups.bucket
}

output "log_group" {
  description = "CloudWatch log group that feeds the security alarms."
  value       = aws_cloudwatch_log_group.api.name
}
