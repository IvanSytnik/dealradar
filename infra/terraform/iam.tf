# ---------- role of the EC2 instance ----------

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "bot" {
  name               = "${var.project}-bot-instance"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

# Session Manager (shell access without SSH) and Run Command (used by the deploy pipeline)
resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.bot.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "ecr_read" {
  role       = aws_iam_role.bot.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

data "aws_iam_policy_document" "bot_runtime" {
  statement {
    sid       = "ReadBotSecrets"
    actions   = ["ssm:GetParametersByPath", "ssm:GetParameters", "ssm:GetParameter"]
    resources = ["arn:aws:ssm:${var.region}:${local.account_id}:parameter${trimsuffix(local.param_prefix, "/")}*"]
  }

  statement {
    sid       = "DecryptSecureStrings"
    actions   = ["kms:Decrypt"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${var.region}.amazonaws.com"]
    }
  }

  statement {
    sid       = "ShipContainerLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
    resources = ["${aws_cloudwatch_log_group.bot.arn}:*"]
  }
}

resource "aws_iam_role_policy" "bot_runtime" {
  name   = "runtime"
  role   = aws_iam_role.bot.id
  policy = data.aws_iam_policy_document.bot_runtime.json
}

resource "aws_iam_instance_profile" "bot" {
  name = "${var.project}-bot"
  role = aws_iam_role.bot.name
}
