# Security

## Secrets

- Never commit API keys, bearer tokens, `.env` files, or local Codex configuration.
- The custom API key field is intended for the current request only.
- Exported reports intentionally omit API keys.

If a secret is committed, rotate it at the provider first, then remove it from Git history. Deleting only the latest file is not sufficient.

## Data

- Do not use identifiable patient information in benchmark prompts or reports.
- The included medical task is fully synthetic and is not clinical advice.
- Review exported model outputs before sharing them publicly.

## Execution

Workspace tasks run in temporary directories and may execute generated code. Run this project only on a machine and account you control.

## Reporting

Please open a private security advisory in the GitHub repository for vulnerabilities that could expose secrets or execute outside the intended temporary workspace.
