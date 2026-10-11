output "instance_id" {
  description = "Set as GitHub variable EC2_INSTANCE_ID. Shell: aws ssm start-session --target <id>"
  value       = aws_instance.bot.id
}

output "ecr_repository" {
  description = "Set as GitHub variable ECR_REPOSITORY."
  value       = aws_ecr_repository.bot.name
}

output "github_deploy_role_arn" {
  description = "github_deploy_auth = oidc: set as GitHub variable AWS_DEPLOY_ROLE_ARN."
  value       = one(aws_iam_role.github_deploy[*].arn)
}

output "github_deploy_user" {
  description = "github_deploy_auth = iam_user: create its access key and store it as GitHub secrets."
  value       = one(aws_iam_user.github_deploy[*].name)
}

output "region" {
  description = "Set as GitHub variable AWS_REGION."
  value       = var.region
}

output "secrets_prefix" {
  description = "Put the bot secrets under this SSM Parameter Store path (SecureString)."
  value       = local.param_prefix
}

output "log_group" {
  description = "Container logs: aws logs tail <group> --follow"
  value       = aws_cloudwatch_log_group.bot.name
}

output "reports_url" {
  description = "CloudFront base URL of published /scan reports."
  value       = var.enable_reports ? "https://${aws_cloudfront_distribution.reports[0].domain_name}" : null
}
