# Baseline and Neon acceptance checklist

- [x] Restore verifier configuration, branch, role, TLS, cleanup, and diagnostic contracts; run focused Node and PowerShell regressions.
- [x] Include lockfile regression and API end-to-end tests in the complete gate; verify orchestration.
- [x] Run frozen dependency install with unchanged lockfile, formatting, lint, types, unit tests, builds, integration, boundaries, compiled exports, production audit, and Docker image checks.
- [x] Verify isolated Neon branch identity and prerequisites; apply reviewed migrations/grants if needed; verify roles, schema, tenant boundaries, vector, and compiled API readiness/shutdown.
- [x] Complete independent review and authenticated CodeRabbit review; resolve actionable issues.
- [ ] Publish exact tested commit to PR #4 and verify hosted checks and required reviews.
- [ ] Prepare and review production promotion, execute only within approved scope, and record post-promotion acceptance.
- [ ] Merge the baseline PR when required checks/reviews permit; document exact commands and remaining gate status.

Gate 3 (Render) starts only after all applicable gate 1 and gate 2 criteria pass. Unavailable external approvals remain explicit open items.
