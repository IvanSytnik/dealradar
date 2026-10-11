# /scan reports as web pages. Telegram's in-app preview on iOS runs no JavaScript, so a report sent
# only as a file loses sorting and filters on a phone. The bot uploads each report to a private bucket
# under a random 128-bit key and sends a CloudFront link that opens in the real browser.
# No public bucket: CloudFront reads it through origin access control (OAC).

locals {
  reports_bucket = "${var.project}-reports-${local.account_id}"
}

resource "aws_s3_bucket" "reports" {
  count         = var.enable_reports ? 1 : 0
  bucket        = local.reports_bucket
  force_destroy = true # only generated reports live here
}

resource "aws_s3_bucket_public_access_block" "reports" {
  count                   = var.enable_reports ? 1 : 0
  bucket                  = aws_s3_bucket.reports[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "reports" {
  count  = var.enable_reports ? 1 : 0
  bucket = aws_s3_bucket.reports[0].id
  rule {
    id     = "expire-reports"
    status = "Enabled"
    filter {
      prefix = "reports/"
    }
    expiration {
      days = var.report_ttl_days # keep in sync with REPORT_TTL_DAYS in src/report/publish.ts
    }
  }
}

resource "aws_cloudfront_origin_access_control" "reports" {
  count                             = var.enable_reports ? 1 : 0
  name                              = "${var.project}-reports"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_response_headers_policy" "reports" {
  count = var.enable_reports ? 1 : 0
  name  = "${var.project}-reports"

  security_headers_config {
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "no-referrer" # report URLs are capabilities: do not leak them to Willhaben
      override        = true
    }
    strict_transport_security {
      access_control_max_age_sec = 31536000
      override                   = true
    }
  }

  custom_headers_config {
    items {
      header   = "X-Robots-Tag"
      value    = "noindex, nofollow"
      override = true
    }
  }
}

resource "aws_cloudfront_distribution" "reports" {
  count           = var.enable_reports ? 1 : 0
  enabled         = true
  comment         = "${var.project} market reports"
  price_class     = "PriceClass_100" # Europe + North America edges are enough
  is_ipv6_enabled = true

  origin {
    domain_name              = aws_s3_bucket.reports[0].bucket_regional_domain_name
    origin_id                = "reports"
    origin_access_control_id = aws_cloudfront_origin_access_control.reports[0].id
  }

  default_cache_behavior {
    target_origin_id           = "reports"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6" # AWS managed: CachingOptimized
    response_headers_policy_id = aws_cloudfront_response_headers_policy.reports[0].id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

data "aws_iam_policy_document" "reports_bucket" {
  count = var.enable_reports ? 1 : 0
  statement {
    sid       = "CloudFrontReadsReports"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.reports[0].arn}/reports/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.reports[0].arn]
    }
  }
}

resource "aws_s3_bucket_policy" "reports" {
  count  = var.enable_reports ? 1 : 0
  bucket = aws_s3_bucket.reports[0].id
  policy = data.aws_iam_policy_document.reports_bucket[0].json
  # the public access block must exist first, or S3 may reject the policy call ordering
  depends_on = [aws_s3_bucket_public_access_block.reports]
}

# The bot writes reports; nothing else.
data "aws_iam_policy_document" "bot_reports" {
  count = var.enable_reports ? 1 : 0
  statement {
    sid       = "WriteReports"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.reports[0].arn}/reports/*"]
  }
}

resource "aws_iam_role_policy" "bot_reports" {
  count  = var.enable_reports ? 1 : 0
  name   = "reports"
  role   = aws_iam_role.bot.id
  policy = data.aws_iam_policy_document.bot_reports[0].json
}

# Non-secret settings for the container: run.sh turns every parameter under the prefix into an env var.
resource "aws_ssm_parameter" "reports" {
  for_each = var.enable_reports ? {
    REPORTS_BUCKET   = aws_s3_bucket.reports[0].bucket
    REPORTS_BASE_URL = "https://${aws_cloudfront_distribution.reports[0].domain_name}"
    REPORTS_REGION   = var.region
  } : {}
  name  = "${local.param_prefix}${each.key}"
  type  = "String"
  value = each.value
}
