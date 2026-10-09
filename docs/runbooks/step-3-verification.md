# Step 3: repository and compiled runtime verification

Date: 8 October 2026. Run commands from the repository root in PowerShell.

This implements Step 3 of the
[reconciled Nthawi plan](../superpowers/plans/2026-10-08-nthawi-reconciled-implementation.md).
It preserves the NestJS/Fastify modular monolith, Better Auth behavior, Next.js
owner app, separate Vite widget, and source-exported shared UI. It does not deploy
the application, publish an image, change DNS, or implement Step 4 business/API
boundaries.

## Implementation

- Contracts, DB and tooling expose compiled JavaScript and declaration files.
  Contracts intentionally contains `export {}` until real feature contracts are
  specified. The API runtime test builds shared dependencies before importing
  their public entry points, including `@nthawi/db/schema/auth`.
- The browser checker parses TypeScript module references and follows local,
  aliased and workspace source imports. It checks every widget/UI/contracts
  source and every module reachable from a Next.js `"use client"` boundary.
  Backend workspaces are forbidden throughout the owner web app. Node APIs and
  server authentication entry points are forbidden in browser graphs. Approved
  Better Auth browser entry points, including `@better-auth/infra/client`, remain
  allowed. Missing source/configuration and parse/resolution failures fail the gate.
- The multi-stage image prunes the API workspace and shared configuration packages.
  Build and production installations independently use a frozen pruned lockfile.
  BuildKit caches downloaded package contents; it does not reuse a host installed
  workspace. The final image preserves pnpm links, overlays compiled output, runs
  as `node`, and starts with `node apps/api/dist/main.js`.
- `.dockerignore` excludes environment files and host build/dependency artifacts
  from the build context. The image checker uses only synthetic configuration,
  disables external networking, runs with a read-only filesystem, and checks
  compiled imports, non-root execution, private-file/source exclusions, HTTP
  startup, shutdown and sanitized invalid configuration. It cleans only containers
  it creates and fails when cleanup cannot be confirmed.
- GitHub Actions verifies a fresh frozen installation, root checks, production
  dependency audit and the actual Linux image. Actions, Node and pnpm are pinned.
  The workflow uses no provider credentials and does not publish or deploy.
- Shared ESLint rules keep their configured severities. The `only-warn` runtime
  patch was removed because it converted errors to warnings and could let broken
  code pass CI. Local `.serena` metadata is excluded from repository formatting.
- API type-aware lint builds its compiled workspace dependencies first, so a
  fresh checkout resolves the same database/tooling/contracts types as local development.

## Dependency decisions

The initial production audit reported 12 high-severity affected findings.
Necessary repairs preserve existing dependency major versions:

- Web Next.js moves from `16.3.6` to `16.3.8`.
- Scoped `pnpm-workspace.yaml` overrides pin Next.js's Sharp to `0.35.5` and
  `baseline-browser-mapping` to `2.11.27`. A version-scoped override updates
  vulnerable `source-map-js` 1.x requirements below `1.2.2` to `1.2.2` across
  PostCSS, coverage tooling and Tailwind. All five current parent requirements are
  `^1.2.1`; the patch satisfies each one. Revalidate the pins during dependency
  updates. The override does not replace unrelated major versions.
- The UI package uses shadcn as a CLI and build-time CSS source, with no runtime
  JavaScript imports. It belongs in `devDependencies`; the emitted frontend assets
  retain their styles. Frontend builds must install development dependencies.
  This does not declare the CLI's development dependency tree vulnerability-free.

Security references:
[Next.js advisory](https://github.com/vercel/next.js/security/advisories/GHSA-cjq9-62q9-8jv4),
[Sharp advisory](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w),
[source-map-js patched release](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2),
[baseline mapping advisory](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv).

The audit gate rejects high/critical production findings. Any remaining lower
severity advisories must be reported and assessed; do not bypass or suppress the
audit. In particular the legacy esbuild development-server advisory inherited via
Better Auth's Drizzle tooling is not repaired by an unverified incompatible esbuild
major upgrade.

## Verification commands

```powershell
Set-Location -LiteralPath 'C:\Users\USER\Desktop\Nthawi\Nthawi'

pnpm.cmd --version
if ($LASTEXITCODE -ne 0) { throw 'pnpm is unavailable.' }
pnpm.cmd exec node --version
if ($LASTEXITCODE -ne 0) { throw 'Workspace Node is unavailable.' }
```

Expected versions: pnpm `10.16.1`, workspace Node `v24.21.0`.

For an existing reviewed lockfile, use a frozen installation:

```powershell
pnpm.cmd install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'Frozen dependency installation failed.' }

pnpm.cmd check:step3
if ($LASTEXITCODE -ne 0) { throw 'Step 3 repository gate failed.' }

pnpm.cmd audit --prod --audit-level high
if ($LASTEXITCODE -ne 0) { throw 'Production dependency audit failed.' }
```

`check:step3` runs formatting, lint, types, existing unit tests, all application
builds, boundary regression tests, image-checker regression tests, the repository
boundary scan, and compiled API/package export checks. Web font generation requires
download connectivity. Do not change fonts or skip checks to hide a network error.

Docker Desktop must be running with Linux containers:

```powershell
docker info
if ($LASTEXITCODE -ne 0) { throw 'Docker is unavailable.' }

docker build --pull --file infra/docker/api.Dockerfile --tag nthawi-api:step3 .
if ($LASTEXITCODE -ne 0) { throw 'API image build failed.' }

pnpm.cmd check:api-image nthawi-api:step3
if ($LASTEXITCODE -ne 0) { throw 'API image verification failed.' }
```

For a deliberate manifest/configuration change only, run `pnpm.cmd install
--lockfile-only`, inspect the resulting lockfile diff against the pre-change
baseline, and then repeat the frozen installation and gates. Preserve unrelated
staged and unstaged work. Routine verification must not rewrite the lockfile.

The container checks `GET /` returning `Hello World!`. It must not use
`/api/auth/ok` as a database-free probe: the current authentication configuration
uses database-backed rate limiting. Health/readiness and real database/provider
integration remain later gates.

## Acceptance evidence

The following results apply to the final security-patched dependency graph:

| Check                        | Result                         | Evidence                                                                                                                           |
| ---------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Frozen installation          | Passed                         | All 10 projects; lockfile hash unchanged                                                                                           |
| Root `check:step3`           | Passed                         | Formatting, lint, types, unit tests and all application builds                                                                     |
| Existing unit tests          | 55 passed                      | 33 tooling and 22 API tests                                                                                                        |
| Boundary regression suite    | 34 passed                      | Browser/server policy, aliases, transitive references and fail-closed cases                                                        |
| Image-checker cleanup suite  | 4 passed                       | Owned-container cleanup and failure handling                                                                                       |
| Runtime export suite         | 4 passed                       | Compiled contracts, DB, auth schema and tooling                                                                                    |
| Contracts artifacts          | Present                        | `dist/index.js` and `dist/index.d.ts`                                                                                              |
| Production audit             | Passed high/critical threshold | Zero high/critical; one moderate esbuild advisory remains                                                                          |
| Vulnerable source-map leaf   | Removed                        | All five parent snapshots use `source-map-js@1.2.2`                                                                                |
| Fresh Linux API image        | Build passed                   | Independent frozen trees: 304 production and 732 build packages; all four compiled targets passed                                  |
| Actual image smoke test      | Passed                         | Startup, compiled imports, Node version, non-root user, source/environment exclusions, sanitized invalid configuration and SIGTERM |
| Image provenance and cleanup | Passed                         | Five retained manifests match the workspace; no owned test containers remain                                                       |
| Independent local review     | Repairs resolved               | Dependency ranges verified; a synthetic lint violation produced exit 1 with an error                                               |
| Hosted GitHub Actions run    | Pending                        | Workflow authored; no source push performed                                                                                        |
| New Step 3 CodeRabbit review | Not run                        | User chose to finish without external review; no Step 3 source was uploaded                                                        |

Final lockfile SHA-256:

```text
EC92B335F33511507849E4EC39AE0FBF081F0203BA5B022E151411DDF815DA00
```

Verified local image `nthawi-api:step3`:

```text
sha256:8929613851c2bbc5536c10cb436c883833352fa0b395f30771f7143bc45af27c
```

The initial audit failed with 12 high, 11 moderate and two low affected findings.
Successive audits exposed multiple paths to the same vulnerable source-map leaf;
the final version-scoped override covers all five compatible parent requirements.
The remaining moderate advisory is
[esbuild's development-server exposure](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99),
inherited through Better Auth's legacy Drizzle tooling. It is recorded rather than
hidden or repaired with an unverified incompatible major override.

The earlier execution-service interruption was resolved, and verification resumed
against the final lockfile. Local Step 3 implementation checks now pass. A
successful hosted workflow run is still required before closing the complete
Step 3 gate and starting Step 4. Publishing the reviewed changes is a separate
action; no Git commit, push, deployment or real provider request was performed.
