# =============================================================================
# Application tier: security groups, IAM (least privilege), ECS Fargate service.
# =============================================================================

# ------------------------------------------------------------------ security groups
resource "aws_security_group" "alb" {
  name        = "lalita-erp-alb-${var.environment}"
  description = "Public HTTPS entrypoint"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTPS from the internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "HTTP (redirects to HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    description = "To application tasks only"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = [var.vpc_cidr]
  }
}

resource "aws_security_group" "app" {
  name        = "lalita-erp-app-${var.environment}"
  description = "API/web tasks"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Traffic from the load balancer only"
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  ingress {
    description     = "API port from the load balancer only"
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  # Scoped by the database subnet CIDRs instead of the DB security group:
  # referencing the DB SG here while the DB SG references this SG would be a
  # dependency cycle (terraform validate: "Cycle: aws_security_group.app,
  # aws_security_group.db"). Rules may only reference across one direction.
  egress {
    description = "MySQL to the database tier"
    from_port   = 3306
    to_port     = 3306
    protocol    = "tcp"
    cidr_blocks = aws_subnet.private[*].cidr_block
  }
  egress {
    description = "TLS to AWS APIs (Secrets Manager, ECR, CloudWatch, S3)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    description = "Redis to the cache tier"
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    self        = true
  }
}

resource "aws_security_group" "db" {
  name        = "lalita-erp-db-${var.environment}"
  description = "MySQL - reachable from application tasks only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "MySQL from the application tier (TLS enforced by the parameter group)"
    from_port       = 3306
    to_port         = 3306
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }
  # No egress rules: the database never initiates outbound connections.
}

# ----------------------------------------------------------------------- IAM
data "aws_iam_policy_document" "ecs_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "lalita-erp-execution-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy" "execution" {
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken", "ecr:BatchCheckLayerAvailability", "ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.api.arn}:*"
      },
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = aws_secretsmanager_secret.app.arn
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = aws_kms_key.data.arn
      },
    ]
  })
}

# Task role: the *application's* identity — S3 documents only, no AWS admin.
resource "aws_iam_role" "task" {
  name               = "lalita-erp-task-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy" "task" {
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DocumentsBucketOnly"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
        Resource = [
          aws_s3_bucket.documents.arn,
          "${aws_s3_bucket.documents.arn}/*",
        ]
      },
      {
        Sid      = "EncryptWithProjectKey"
        Effect   = "Allow"
        Action   = ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey", "kms:DescribeKey"]
        Resource = aws_kms_key.data.arn
      },
    ]
  })
}

# --------------------------------------------------------------------- ECS
resource "aws_ecs_cluster" "main" {
  name = "lalita-erp-${var.environment}"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "lalita-erp-api-${var.environment}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "1024"
  memory                   = "2048"
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name                   = "api"
      image                  = var.app_image
      essential              = true
      user                   = "1001:1001"
      readonlyRootFilesystem = true
      environment = [
        { name = "ENVIRONMENT", value = var.environment },
        { name = "DB_HOST", value = aws_db_instance.main.address },
        { name = "DB_NAME", value = "lalita_erp" },
        { name = "DB_USER", value = "lalita_app" },
        { name = "DB_SSL_MODE", value = "verify_identity" },
        { name = "DB_SSL_CA", value = "/etc/ssl/certs/rds-ca-global-bundle.pem" },
        { name = "FORCE_HTTPS", value = "true" },
        { name = "RATE_LIMIT_BACKEND", value = "redis" },
        { name = "ALLOWED_HOSTS", value = "erp.lalitarealestate.example" },
        { name = "CORS_ALLOWED_ORIGINS", value = "https://erp.lalitarealestate.example" },
      ]
      secrets = [
        { name = "SECRET_KEY", valueFrom = "${aws_secretsmanager_secret.app.arn}:SECRET_KEY::" },
        { name = "INDEX_PEPPER", valueFrom = "${aws_secretsmanager_secret.app.arn}:INDEX_PEPPER::" },
        { name = "FIELD_ENCRYPTION_KEY", valueFrom = "${aws_secretsmanager_secret.app.arn}:FIELD_ENCRYPTION_KEY::" },
        { name = "DB_PASSWORD", valueFrom = "${aws_secretsmanager_secret.app.arn}:DB_PASSWORD::" },
      ]
      portMappings = [{ containerPort = 8000, protocol = "tcp" }]
      healthCheck = {
        command     = ["CMD-SHELL", "curl -fsS http://127.0.0.1:8000/api/v1/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 20
      }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.api.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "api"
          "mode"                  = "non-blocking"
        }
      }
      stopTimeout = 30
    },
  ])
}

resource "aws_ecs_service" "api" {
  name            = "lalita-erp-api-${var.environment}"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = 2
  launch_type     = "FARGATE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "api"
    container_port   = 8000
  }

  lifecycle {
    ignore_changes = [desired_count] # autoscaling owns this
  }
}

resource "aws_lb_target_group" "web" {
  name        = "lalita-erp-tg-${var.environment}"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    path                = "/api/v1/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 5
    matcher             = "200"
  }

  # Terminate 30 s early so ECS drains connections before the task stops.
  deregistration_delay = 30
}

resource "aws_lb_listener_rule" "api" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }

  condition {
    path_pattern { values = ["/api/*"] }
  }
}

# Serve the SPA for every other path.
resource "aws_lb_listener_rule" "spa" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 200

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }

  condition {
    path_pattern { values = ["/*"] }
  }
}

resource "aws_appautoscaling_target" "api" {
  max_capacity       = 6
  min_capacity       = 2
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "lalita-erp-cpu-${var.environment}"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 60
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
