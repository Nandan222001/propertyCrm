variable "region" {
  description = "AWS region (keep data resident in India for DPDP compliance)."
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Deployment environment: staging or production."
  type        = string
  default     = "production"
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}

variable "owner" {
  description = "Team that owns the stack (used for alert routing and tags)."
  type        = string
  default     = "platform@lalitarealestate.example"
}

variable "vpc_cidr" {
  description = "CIDR block for the application VPC."
  type        = string
  default     = "10.42.0.0/16"
}

variable "app_image" {
  description = "Container image URI for the API (immutable tag or digest)."
  type        = string
}

variable "web_image" {
  description = "Container image URI for the web/nginx tier."
  type        = string
}

variable "acm_certificate_arn" {
  description = "ACM certificate for the public HTTPS listener."
  type        = string
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.medium"
}

variable "db_backup_retention_days" {
  description = "Automated backup retention (>= 14 for financial data)."
  type        = number
  default     = 35
}

variable "alert_emails" {
  description = "Recipients for CloudWatch alarm notifications."
  type        = list(string)
  default     = []
}

variable "backup_replica_region" {
  description = "Second region that receives replicated backups (DR)."
  type        = string
  default     = "ap-southeast-1"
}

variable "log_retention_days" {
  description = "CloudWatch log retention."
  type        = number
  default     = 400
}
