# Conditional Phase 6 identity and workspace handoff

Status: **not ready; Phase 5 remains in progress**. This file does not start
Phase 6 or authorize deployment, migrations, purchases or provider changes.

The owner must issue a separate Phase 6 command after accepting the Phase 5
HTTPS/recreation evidence. Use `C:/Users/USER/Desktop/Nthawi/Nthawi` and preserve
private environment files, `.anchor/` and existing unrelated changes. Do not
use the older replacement-worktree instructions.

Before starting, recheck Phase 5's exact accepted master commit, independent
approval, strict required checks, active protections and unresolved threads.
Read the approved v0.3 release contract, Phase 4 database/recovery rules and
the complete Phase 5 evidence. Reconcile current staging project, branch,
endpoint, deployed digest, site IDs and signed context from provider records.
The current staging candidate is not the synthetic test branch.

Carry the signed ingress interface unchanged unless separately approved:

- Owner calls stay same-origin at `/api/auth/*` and `/api/v1/*`.
- API verifies Netlify `x-nf-sign` HS256 with exact issuer, site URL, site ID,
  deployment context and bounded expiry before authentication/database work.
- `NETLIFY_PROXY_SIGNING_SECRET` stays in API runtime and owner Netlify Runtime
  only. An optional previous key requires an explicit bounded cutoff; never
  put either key into a build or browser environment.
- Local HTTP journeys can use `scripts/dev-signed-proxy.mjs` with matching
  loopback identity and secret. It intentionally does not support WebSocket HMR.
- Preserve restricted roles, distinct generated credentials, verified TLS,
  FORCE RLS, target guards, table-classification/recovery rules and no-store
  owner responses. Do not enable Neon Managed Better Auth.
- Keep Better Auth self-service deletion disabled on every internet-reachable
  artifact until its complete deletion workflow is independently accepted.

Required handoff fields still missing: accepted Phase 5 SHA/review/check URLs;
real API digest/provenance/SBOM; Render workspace/environment/service IDs;
Netlify team/site/deployment IDs and exact signed tuple; approved Neon settings
and role acceptance; staging DNS/TLS receipts; storage/recovery access; OAuth
and email domain readiness; telemetry dashboards/probe results; recreation and
rollback evidence; remaining product dependencies. Never replace a missing
field with a guessed value or call a starter page a completed journey.

No Phase 6 work was implemented by this Phase 5 execution. The inherited local
P0 commit and pre-existing marketing/product work remain separate, unaccepted
dependencies until their independent repository evidence proves otherwise.
Production RPO/RTO targets remain unproven by staging.
