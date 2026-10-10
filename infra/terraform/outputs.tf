output "instance_id" {
  description = "Set as GitHub variable EC2_INSTANCE_ID. Shell: aws ssm start-session --target <id>"
  value       = aws_instance.bot.id
}

output "ecr_repository" {
  description = "Set as GitHub variable ECR_REPOSITORY."
  value       = aws_ecr_repository.bot.name
}

output "github_deploy_role_arn" {
  description = "Set as GitHub variable AWS_DEPLOY_ROLE_ARN."
  value       = aws_iam_role.github_deploy.arn
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
