# Phase 4 — Neon target inventory

**Observed:** 2026-11-05 UTC (project-level metadata, 23:50:49Z; assessor passed)
**Status:** targets, settings and final-commit live proofs verified; review pending
**Project:** Nthawi, `delicate-feather-83629956`, `aws-eu-west-2`, PostgreSQL 18

## Production target

- Branch: `br-lively-darkness-zahxet6z` ("production"), ready, **protected**
- Direct endpoint: `ep-wild-leaf-za09k0vy.c-2.eu-west-2.aws.neon.tech`, port 5432,
  `sslmode=verify-full`
- Database: `neondb`; initial-empty (no application roles or schema)
- Plan: Launch (`launch_v3`); history 604800 seconds
- Compute: 0.25–1 CU; scale to zero disabled (`suspend_timeout_seconds` −1)

## Synthetic acceptance target

- Branch: `br-rapid-brook-zao6uwya` ("test/nthawi-database-bootstrap"), ready,
  unprotected
- Direct endpoint: `ep-cold-shadow-zaqw3flo.c-2.eu-west-2.aws.neon.tech`
- Database: `neondb`; migrated 0000–0002; four SQL-created restricted roles plus
  the provider-created `nthawi_export` login
- Compute: 0.25–1 CU; 300-second suspension
- Data: synthetic fixtures only, removed by key after each run

## Staging candidate (Phase 5)

- Separate project `calm-math-03562419` ("nthawi-staging"), created 2026-11-05
  with owner approval. Not bootstrapped, not in `scripts/neon-targets.mjs`.
  Project defaults 0.25–8 CU and one-day history; its configuration is Phase 5.

## Verification status

- [x] Effective compute settings for both endpoints (provider metadata)
- [x] Plan, history and production protection (provider metadata)
- [x] Direct-connection role authentication (2026-11-05, before final code)
- [x] Migration checksums and manifest (2026-11-05, before final code)
- [x] Forced-RLS tenant isolation (2026-11-05, before final code)
- [x] Privileged full export and verified restore (2026-11-05, before final code)
- [x] Capacity headroom at minimum compute (2026-11-05, 446 usable)
- [x] Promotion implementation and offline tests
- [x] Test-role password rotation (P4-D08; 2026-11-05T23:34Z, after removing
      the out-of-session Neon Auth enablement)
- [x] Final-commit live re-proofs (P4-D10; code commit `debac37`)
- [ ] Final-head CI, technical review and independent human approval
- [ ] Separately instructed merge

**Phase 4 result: NOT YET ACCEPTED.**
