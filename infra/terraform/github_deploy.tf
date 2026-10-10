# Deploy identity for GitHub Actions. Same least-privilege policy either way:
# push one ECR repository, run AWS-RunShellScript on one instance, read the result.

locals {
  use_oidc = var.github_deploy_auth == "oidc"
}

# ---------- OIDC (preferred): short-lived credentials, nothing stored in GitHub ----------

resource "aws_iam_openid_connect_provider" "github" {
  count          = local.use_oidc && var.create_github_oidc_provider ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  # AWS no longer relies on the thumbprint for this provider, but the API still requires a value
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"]
}

data "aws_iam_openid_connect_provider" "github" {
  count = local.use_oidc && !var.create_github_oidc_provider ? 1 : 0
  url   = "https://token.actions.githubusercontent.com"
}

data "aws_iam_policy_document" "github_assume" {
  count = local.use_oidc ? 1 : 0
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type = "Federated"
      identifiers = [var.create_github_oidc_provider
        ? aws_iam_openid_connect_provider.github[0].arn
      : data.aws_iam_openid_connect_provider.github[0].arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    # only workflows running on main of this repository
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  count              = local.use_oidc ? 1 : 0
  name               = "${var.project}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_assume[0].json
}

resource "aws_iam_role_policy" "github_deploy" {
  count  = local.use_oidc ? 1 : 0
  name   = "deploy"
  role   = aws_iam_role.github_deploy[0].id
  policy = data.aws_iam_policy_document.github_deploy.json
}

# ---------- IAM user fallback: for accounts where an SCP denies iam:*Provider* ----------
# The access key is created out of band (aws iam create-access-key) and piped straight into
# GitHub secrets, so the secret never lands in Terraform state.

resource "aws_iam_user" "github_deploy" {
  count = local.use_oidc ? 0 : 1
  name  = "${var.project}-github-deploy"
}

resource "aws_iam_user_policy" "github_deploy" {
  count  = local.use_oidc ? 0 : 1
  name   = "deploy"
  user   = aws_iam_user.github_deploy[0].name
  policy = data.aws_iam_policy_document.github_deploy.json
}

# ---------- shared permissions ----------

data "aws_iam_policy_document" "github_deploy" {
  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrPush"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [aws_ecr_repository.bot.arn]
  }

  statement {
    sid     = "RunDeployOnTheInstance"
    actions = ["ssm:SendCommand"]
    resources = [
      aws_instance.bot.arn,
      "arn:aws:ssm:${var.region}::document/AWS-RunShellScript",
    ]
  }

  statement {
    sid       = "ReadDeployResult"
    actions   = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"]
    resources = ["*"]
  }
}
