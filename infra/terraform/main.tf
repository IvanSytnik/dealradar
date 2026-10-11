data "aws_caller_identity" "current" {}

locals {
  account_id   = data.aws_caller_identity.current.account_id
  param_prefix = "/${var.project}/"
  log_group    = "/${var.project}/bot"
}

# ---------- network: default VPC, no inbound traffic at all ----------

data "aws_vpc" "default" {
  default = true
}

resource "aws_security_group" "bot" {
  name        = "${var.project}-bot"
  description = "DealRadar bot: outbound only. Access via SSM Session Manager, no SSH."
  vpc_id      = data.aws_vpc.default.id

  egress {
    description      = "Telegram, Anthropic, Willhaben, ECR, SSM"
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }
}

# ---------- container registry ----------

resource "aws_ecr_repository" "bot" {
  name                 = var.project
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "bot" {
  repository = aws_ecr_repository.bot.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 10 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 10 }
      action       = { type = "expire" }
    }]
  })
}

# ---------- logs ----------

resource "aws_cloudwatch_log_group" "bot" {
  name              = local.log_group
  retention_in_days = var.log_retention_days
}

# ---------- the server ----------

data "aws_ssm_parameter" "al2023_arm64" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

resource "aws_instance" "bot" {
  ami                    = data.aws_ssm_parameter.al2023_arm64.value
  instance_type          = var.instance_type
  iam_instance_profile   = aws_iam_instance_profile.bot.name
  vpc_security_group_ids = [aws_security_group.bot.id]

  # Needed for outbound internet in the default VPC (no NAT gateway, which would cost ~$35/month)
  associate_public_ip_address = true

  metadata_options {
    http_tokens   = "required" # IMDSv2 only
    http_endpoint = "enabled"
    # 2 hops: the bot runs in a Docker container and reads the instance role (S3 report uploads)
    http_put_response_hop_limit = 2
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_gb
    encrypted             = true
    delete_on_termination = false # keep the SQLite database if the instance is replaced
  }

  user_data = templatefile("${path.module}/user_data.sh.tftpl", {
    region       = var.region
    registry     = "${local.account_id}.dkr.ecr.${var.region}.amazonaws.com"
    repository   = aws_ecr_repository.bot.name
    param_prefix = local.param_prefix
    log_group    = local.log_group
  })
  user_data_replace_on_change = true

  tags = { Name = "${var.project}-bot" }

  lifecycle {
    # a new AMI release must not silently replace the server and its data
    ignore_changes = [ami]
  }
}

# ---------- cost guardrail ----------

resource "aws_budgets_budget" "monthly" {
  name         = "${var.project}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }
}
