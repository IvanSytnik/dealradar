# Security policy

## Supported versions

Only the current `main` branch is supported. It is what the Deploy workflow ships to the production bot ([@dealradar_austria_bot](https://t.me/dealradar_austria_bot)); there are no maintained release branches.

## Reporting a vulnerability

**Do not open a public issue.** Report privately through GitHub: **Security → Report a vulnerability** on this repository, or open [a new private advisory](https://github.com/IvanSytnik/dealradar/security/advisories/new) directly.

Please include:

- what is affected (file, command, workflow or AWS resource) and the impact;
- steps to reproduce, ideally against your own bot token and AWS account;
- whether the issue is already public anywhere.

Never paste real secrets into a report: no Telegram bot tokens, Anthropic API keys, AWS keys or `.env` / `terraform.tfstate` contents. If you found a leaked secret, say where it is, not what it is.

## Scope

In scope:

- the bot code in `src/` (command handling, authorisation of admin commands, data erasure, the HTML report and Mini App);
- the infrastructure in `infra/terraform` (IAM policies, S3 + CloudFront report hosting, SSM secrets handling);
- the GitHub Actions workflows in `.github/workflows` (deploy credentials, OIDC trust policy).

Out of scope: vulnerabilities in Telegram, Willhaben, Kleinanzeigen, Anthropic or AWS themselves (report those to the vendor), rate limiting by the marketplaces, and findings that need a compromised Telegram account or AWS account to begin with.

Please do not test against the production bot in a way that affects other users or sends load to the marketplaces.
