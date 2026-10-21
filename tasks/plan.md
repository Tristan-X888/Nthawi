# Baseline recovery and Neon completion

Requested 2026-10-17. Scope follows delivery gates 1 and 2; deployment and frontend work wait for their completion.

## Decisions

- Preserve existing work and migration history. Use pnpm 10.16.1 and its managed Node 24.21.0.
- Restore the verifier against the shared, explicit Neon target registry. Live operations remain restricted to the registered test branch.
- Verify client certificate and hostname validation on the actual connection; do not infer it from the proxy-to-Postgres connection.
- Run disposable local PostgreSQL integration and Docker checks separately from live Neon acceptance.
- Publish reviewed changes to the existing PR. Respect required GitHub reviews and prepare a concrete production promotion before requesting any required final approval.

## Ordered tasks

1. Repair the verifier and add meaningful regression coverage. Accept configuration-only execution without a database build; reject incorrect targets, unsafe TLS, malformed credentials, and production execution.
2. Complete baseline verification coverage. Run lockfile regression and API end-to-end checks locally and in CI, preserving the existing required job name.
3. Run the complete baseline runner, inspect the isolated Neon branch, and finish authorized migrations/grants and compiled API acceptance when prerequisites permit.
4. Independently review changes, run CodeRabbit, update operational documentation, publish the exact tested commit, and inspect hosted checks and required reviews.
5. Record evidence and prepare production promotion. Close gates only when their actual acceptance criteria, required reviews, and promotion are complete.

## Risks

- Existing private credentials may not match server roles. Diagnose without echoing credentials or changing passwords silently.
- Production bootstrap and promotion must preserve existing objects and use a reviewed operation; test success alone is insufficient.
- GitHub requires a reviewer distinct from the PR author. Do not bypass branch rules or claim a merge that has not happened.

See `tasks/todo.md` for acceptance and verification status.
