variable "project" {
  description = "Name prefix for every resource."
  type        = string
  default     = "dealradar"
}

variable "region" {
  description = "AWS region. Stockholm: the account's home region (new-experience accounts only allow it plus us-east-1/us-west-2), and close enough to Austria."
  type        = string
  default     = "eu-north-1"
}

variable "instance_type" {
  description = "Graviton (ARM) instance. The bot needs ~150 MB RAM; t4g.micro has 1 GiB."
  type        = string
  default     = "t4g.micro"
}

variable "root_volume_gb" {
  description = "Root EBS volume (OS, Docker images, SQLite database)."
  type        = number
  default     = 10
}

variable "github_repository" {
  description = "owner/repo allowed to deploy through GitHub Actions OIDC."
  type        = string
  default     = "IvanSytnik/dealradar"
}

variable "github_deploy_auth" {
  description = <<-EOT
    How GitHub Actions authenticates to AWS.
    "oidc": short-lived credentials via the GitHub OIDC provider (preferred, no stored keys).
    "iam_user": a dedicated least-privilege IAM user whose access key is stored as GitHub secrets.
    Use "iam_user" when an organization SCP denies iam:*Provider* (e.g. AWS new-experience / Free plan accounts).
  EOT
  type        = string
  default     = "oidc"
  validation {
    condition     = contains(["oidc", "iam_user"], var.github_deploy_auth)
    error_message = "github_deploy_auth must be \"oidc\" or \"iam_user\"."
  }
}

variable "create_github_oidc_provider" {
  description = "Set to false if the account already has the token.actions.githubusercontent.com provider."
  type        = bool
  default     = true
}

variable "budget_usd" {
  description = "Monthly cost budget. Alerts at 80 % actual and 100 % forecast."
  type        = number
  default     = 15
}

variable "alert_email" {
  description = "Where budget alerts go."
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch log retention for the bot container."
  type        = number
  default     = 14
}
