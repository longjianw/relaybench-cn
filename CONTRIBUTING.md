# Contributing

Contributions are welcome, especially deterministic benchmark cases, provider compatibility fixes, and clearer Chinese documentation.

Before opening a pull request:

1. Do not include API keys, local configuration, patient data, or proprietary prompts.
2. Add an objective evaluator or hidden acceptance test for new benchmark tasks.
3. Run `npm run typecheck`, `npm test`, and `npm run build`.
4. Describe what the new task measures and what it cannot prove.

Medical benchmark cases must be fully synthetic or irreversibly de-identified and must not provide diagnosis or treatment decisions.
