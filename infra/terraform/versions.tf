# =============================================================================
# Provider + remote state configuration.
#
# The state file contains infrastructure metadata, so it is encrypted with a
# customer-managed KMS key, versioned, and locked (DynamoDB) to prevent two
# pipelines applying at once. Never commit .tfstate — see ../../.gitignore.
# =============================================================================
terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  backend "s3" {
    bucket         = "lalita-erp-tfstate"
    key            = "prod/terraform.tfstate"
    region         = "ap-south-1"
    encrypt        = true
    kms_key_id     = "alias/lalita-erp-tfstate"
    dynamodb_table = "lalita-erp-tfstate-lock"
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "lalita-erp"
      Environment = var.environment
      Owner       = var.owner
      DataClass   = "confidential-pii"
      ManagedBy   = "terraform"
    }
  }
}

# Replica-region provider used by the cross-region backup replication.
provider "aws" {
  alias  = "replica"
  region = var.backup_replica_region

  default_tags {
    tags = {
      Project     = "lalita-erp"
      Environment = var.environment
      Role        = "backup-replica"
      ManagedBy   = "terraform"
    }
  }
}
