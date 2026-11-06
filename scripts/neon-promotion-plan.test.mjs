import assert from "node:assert/strict"
import { createHash, generateKeyPairSync, sign } from "node:crypto"
import { execFileSync } from "node:child_process"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { NEON_TARGETS, guardNeonMigrationTarget } from "./neon-targets.mjs"
import {
  canonicalPromotionJson,
  checkPromotionFile,
  promotionConfirmation,
  readPromotionSource,
  validatePromotionPlan,
} from "./neon-promotion-plan.mjs"

const hash = (value) => createHash("sha256").update(value).digest("hex")
const now = Date.parse("2026-11-04T16:00:00.000Z")
const iso = (offset) => new Date(now + offset).toISOString()
const keypair = generateKeyPairSync("ed25519")
const publicKey = keypair.publicKey.export({ type: "spki", format: "pem" })

function fixture(
  context = {
    sourceCommit: "a".repeat(40),
    sourceManifestSha256: "b".repeat(64),
    migrations: [
      {
        name: "0000_initial_app",
        createdAt: 1790604466879,
        sha256: "c".repeat(64),
      },
    ],
  }
) {
  context = { artifactSha256: "d".repeat(64), ...context }
  const plan = {
    version: 1,
    id: "11111111-1111-4111-8111-111111111111",
    ...context,
    target: {
      environment: "production",
      ...NEON_TARGETS.production,
      port: 5432,
      postgresMajor: 18,
      tls: "verify-full",
      pooled: false,
    },
    roles: {
      migrator: "nthawi_migrator",
      auth: "nthawi_auth",
      business: "nthawi_business",
      jobs: "nthawi_jobs",
    },
    approval: {
      scope: "production-promotion-readiness-only",
      operator: "Shane Viyazhi",
      issuedAt: iso(-60_000),
      expiresAt: iso(30 * 60_000),
    },
    evidence: [],
  }
  const details = [
    {
      target: NEON_TARGETS.test,
      syntheticOnly: true,
      migrationChecksums: "passed",
      runtimeRoles: "passed",
      forcedRls: "passed",
      compiledApi: "passed",
      cleanup: "passed",
    },
    {
      readOnly: true,
      postgresMajor: 18,
      appliedMigrations: [],
      schemaDrift: "none",
      roleProfiles: "passed",
      tls: "verify-full",
      protected: true,
      plan: "Launch",
      historySeconds: 604800,
      minCu: 0.25,
      maxCu: 1,
      suspendTimeoutSeconds: -1,
      usableConnections: 97,
    },
    {
      dumpSha256: "e".repeat(64),
      manifestSha256: "f".repeat(64),
      rolesCaptureSha256: "1".repeat(64),
      restoredTargetId: "br-synthetic-restore-123",
      twoTenantCoverage: "passed",
      sameSnapshotBarrier: "passed",
      restoredManifest: "passed",
      cleanup: "passed",
    },
  ]
  const payloads = [
    "isolated-rehearsal",
    "production-preflight",
    "recovery-round-trip",
  ].map((kind, index) => ({
    version: 1,
    kind,
    planId: plan.id,
    sourceCommit: plan.sourceCommit,
    artifactSha256: plan.artifactSha256,
    sourceManifestSha256: plan.sourceManifestSha256,
    productionTarget: structuredClone(plan.target),
    migrations: structuredClone(plan.migrations),
    roles: structuredClone(plan.roles),
    approval: structuredClone(plan.approval),
    issuedAt: iso(-60_000),
    expiresAt: iso(10 * 60_000),
    result: "passed",
    details: structuredClone(details[index]),
  }))
  const value = { plan, context, payloads, bytes: [], publicKey }
  value.resign = () => {
    value.bytes = payloads.map((payload) =>
      Buffer.from(
        JSON.stringify({
          payload,
          signature: sign(
            null,
            Buffer.from(canonicalPromotionJson(payload)),
            keypair.privateKey
          ).toString("base64"),
        })
      )
    )
    plan.evidence = payloads.map((payload, index) => ({
      kind: payload.kind,
      file: `${payload.kind}.json`,
      sha256: hash(value.bytes[index]),
    }))
  }
  value.resign()
  return value
}

function validate(f, confirmation = promotionConfirmation(f.plan)) {
  return validatePromotionPlan(
    f.plan,
    f.context,
    f.bytes,
    f.publicKey,
    confirmation,
    now
  )
}

test("valid signed prerequisites produce only an offline receipt, never execution authority", () => {
  const result = validate(fixture())
  assert.equal(result.code, "NEON_PROMOTION_OFFLINE_CHECK_PASSED")
  assert.equal(result.productionExecutionAvailable, false)
  assert.equal(result.mode, "offline-attestation-check")
  assert.equal(JSON.stringify(result).includes("DATABASE"), false)
})

for (const [label, mutate] of [
  ["wrong project", (f) => (f.plan.target.projectId = "other")],
  [
    "wrong branch",
    (f) => (f.plan.target.branchId = NEON_TARGETS.test.branchId),
  ],
  ["wrong host", (f) => (f.plan.target.host = NEON_TARGETS.test.host)],
  ["wrong database", (f) => (f.plan.target.database = "postgres")],
  ["wrong port", (f) => (f.plan.target.port = 6543)],
  ["wrong role", (f) => (f.plan.roles.business = "neondb_owner")],
  ["wrong TLS", (f) => (f.plan.target.tls = "require")],
  [
    "pooled host",
    (f) =>
      (f.plan.target.host = f.plan.target.host.replace(".c-2", "-pooler.c-2")),
  ],
  ["pooling enabled", (f) => (f.plan.target.pooled = true)],
  ["host override", (f) => (f.plan.target.hostaddr = "127.0.0.1")],
  ["missing selection", (f) => delete f.plan.target.environment],
  [
    "credential URL field",
    (f) => (f.plan.connectionString = "postgresql://secret:private@wrong/db"),
  ],
  [
    "unreviewed source",
    (f) => (f.context = { ...f.context, sourceCommit: "e".repeat(40) }),
  ],
  [
    "source checksum drift",
    (f) => (f.context = { ...f.context, sourceManifestSha256: "e".repeat(64) }),
  ],
  [
    "artifact bytes differ",
    (f) => (f.context = { ...f.context, artifactSha256: "9".repeat(64) }),
  ],
  [
    "migration checksum drift",
    (f) =>
      (f.plan.migrations = [
        { ...f.plan.migrations[0], sha256: "e".repeat(64) },
      ]),
  ],
  ["migration order drift", (f) => (f.plan.migrations = [])],
  ["expired approval", (f) => (f.plan.approval.expiresAt = iso(-1))],
  ["overlong approval", (f) => (f.plan.approval.expiresAt = iso(61 * 60_000))],
  ["future approval", (f) => (f.plan.approval.issuedAt = iso(1))],
  ["execution scope", (f) => (f.plan.approval.scope = "execute-production")],
  [
    "unsigned operator substitution",
    (f) => (f.plan.approval.operator = "Another Operator"),
  ],
  ["missing evidence", (f) => f.plan.evidence.pop()],
  ["path traversal", (f) => (f.plan.evidence[0].file = "../.env.json")],
  ["changed evidence bytes", (f) => (f.bytes[0] = Buffer.from("tampered"))],
  [
    "untrusted signing key",
    (f) =>
      (f.publicKey = generateKeyPairSync("ed25519").publicKey.export({
        type: "spki",
        format: "pem",
      })),
  ],
]) {
  test(`rejects ${label} without exposing supplied fields`, () => {
    const f = fixture()
    mutate(f)
    assert.throws(() => validate(f), {
      message: "NEON_PROMOTION_PLAN_REJECTED",
    })
  })
}

for (const [label, mutate] of [
  [
    "failed isolated rehearsal",
    (f) => (f.payloads[0].details.forcedRls = "failed"),
  ],
  [
    "production used as rehearsal",
    (f) => (f.payloads[0].details.target = NEON_TARGETS.production),
  ],
  [
    "non-synthetic rehearsal",
    (f) => (f.payloads[0].details.syntheticOnly = false),
  ],
  [
    "different artifact evidence",
    (f) => (f.payloads[0].artifactSha256 = "2".repeat(64)),
  ],
  [
    "stale production observation",
    (f) => (f.payloads[1].issuedAt = iso(-16 * 60_000)),
  ],
  ["future observation", (f) => (f.payloads[1].issuedAt = iso(1))],
  [
    "unsigned future lifetime",
    (f) => (f.payloads[1].expiresAt = iso(60 * 60_000)),
  ],
  ["schema drift", (f) => (f.payloads[1].details.schemaDrift = "unknown")],
  ["role drift", (f) => (f.payloads[1].details.roleProfiles = "failed")],
  ["six-hour history", (f) => (f.payloads[1].details.historySeconds = 21600)],
  ["Free plan", (f) => (f.payloads[1].details.plan = "Free")],
  [
    "default suspension",
    (f) => (f.payloads[1].details.suspendTimeoutSeconds = 0),
  ],
  ["unprotected production", (f) => (f.payloads[1].details.protected = false)],
  [
    "insufficient headroom",
    (f) => (f.payloads[1].details.usableConnections = 87),
  ],
  [
    "diverged applied migration",
    (f) => (f.payloads[1].details.appliedMigrations = [{ name: "unknown" }]),
  ],
  [
    "partial tenant dump",
    (f) => (f.payloads[2].details.twoTenantCoverage = "failed"),
  ],
  [
    "missing snapshot barrier",
    (f) => (f.payloads[2].details.sameSnapshotBarrier = "unknown"),
  ],
  [
    "production restore",
    (f) =>
      (f.payloads[2].details.restoredTargetId =
        NEON_TARGETS.production.branchId),
  ],
  [
    "restore overwrote acceptance",
    (f) =>
      (f.payloads[2].details.restoredTargetId = NEON_TARGETS.test.branchId),
  ],
  ["no roles capture", (f) => (f.payloads[2].details.rolesCaptureSha256 = "")],
]) {
  test(`rejects even a trusted signed attestation containing ${label}`, () => {
    const f = fixture()
    mutate(f)
    f.resign()
    assert.throws(() => validate(f), {
      message: "NEON_PROMOTION_PLAN_REJECTED",
    })
  })
}

test("exact operator confirmation required; test migrator still rejects production", () => {
  const f = fixture()
  assert.throws(() => validate(f, "yes"), /REJECTED/)
  assert.throws(
    () =>
      guardNeonMigrationTarget({
        NEON_TARGET: "production",
        NEON_EXPECTED_BRANCH_ID: NEON_TARGETS.production.branchId,
        DATABASE_MIGRATION_URL: `postgresql://nthawi_migrator:synthetic@${NEON_TARGETS.production.host}:5432/neondb?sslmode=verify-full`,
      }),
    /INVALID/
  )
})

test("real source inspection, concurrent one-use check and dirty tracked-source failure", async (t) => {
  const temp = await mkdtemp(path.join(tmpdir(), "nthawi-promotion-test-"))
  t.after(async () => {
    assert.equal(path.dirname(temp), path.resolve(tmpdir()))
    await rm(temp, { recursive: true, force: true })
  })
  const repo = path.join(temp, "repository")
  const files = {
    "packages/db/drizzle/meta/_journal.json": JSON.stringify({
      entries: [{ idx: 0, tag: "0000_initial_app", when: 1790604466879 }],
    }),
    "packages/db/drizzle/0000_initial_app.sql": "SELECT 1;\n",
    "packages/db/drizzle/meta/0000_snapshot.json": "{}\n",
    "packages/db/src/schema/tables.ts": "export const schema = {}\n",
    "packages/db/src/schema-manifest.ts": "export const schemaManifest = {}\n",
    "packages/db/scripts/provision-runtime.mjs":
      "// synthetic provisioning fixture\n",
    "packages/db/scripts/role-profiles.mjs": "// synthetic role fixture\n",
    "packages/db/dist/index.js": "// synthetic built artifact fixture\n",
    "scripts/neon-targets.mjs": "// synthetic registry fixture\n",
  }
  for (const [name, contents] of Object.entries(files)) {
    const filename = path.join(repo, name)
    await mkdir(path.dirname(filename), { recursive: true })
    await writeFile(filename, contents)
  }
  const git = (...args) =>
    execFileSync("git", args, { cwd: repo, stdio: "pipe" })
  git("init")
  git("add", ".")
  git(
    "-c",
    "user.name=Synthetic Test",
    "-c",
    "user.email=test@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-m",
    "synthetic fixture"
  )
  const artifactPath = path.join(temp, "artifact.tar")
  await writeFile(artifactPath, "synthetic immutable deployment artifact")
  const f = fixture({
    ...(await readPromotionSource(repo)),
    artifactSha256: hash(await readFile(artifactPath)),
  })
  const planPath = path.join(temp, "plan.json")
  const trustedPublicKeyPath = path.join(temp, "trusted-public.pem")
  await writeFile(planPath, JSON.stringify(f.plan))
  await writeFile(trustedPublicKeyPath, publicKey)
  for (const [index, entry] of f.plan.evidence.entries())
    await writeFile(path.join(temp, entry.file), f.bytes[index])
  const options = {
    planPath,
    artifactPath,
    trustedPublicKeyPath,
    confirmation: promotionConfirmation(f.plan),
    auditDirectory: path.join(temp, "audit"),
    repositoryRoot: repo,
    now,
  }
  const outcomes = await Promise.allSettled([
    checkPromotionFile(options),
    checkPromotionFile(options),
  ])
  assert.equal(
    outcomes.filter((result) => result.status === "fulfilled").length,
    1
  )
  assert.equal(
    outcomes.filter((result) => result.status === "rejected").length,
    1
  )
  const receipt = JSON.parse(
    await readFile(path.join(temp, "audit", `${f.plan.id}.json`), "utf8")
  )
  assert.equal(receipt.productionExecutionAvailable, false)
  await assert.rejects(checkPromotionFile(options))
  await writeFile(
    path.join(repo, "packages/db/drizzle/0000_initial_app.sql"),
    "SELECT 2;\n"
  )
  await assert.rejects(readPromotionSource(repo), /REJECTED/)
})
