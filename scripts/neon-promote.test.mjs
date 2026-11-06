import assert from "node:assert/strict"
import { createHash, generateKeyPairSync, sign } from "node:crypto"
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { NEON_TARGETS } from "./neon-targets.mjs"
import {
  canonicalPromotionJson,
  promotionConfirmation,
} from "./neon-promotion-plan.mjs"
import {
  executionConfirmation,
  inspectInitialProduction,
  productionConnectionOptions,
  runProductionPromotion,
  validateExecutionAuthority,
} from "./neon-promote.mjs"

const now = Date.parse("2026-11-05T02:00:00.000Z")
const iso = (offset) => new Date(now + offset).toISOString()
const keypair = generateKeyPairSync("ed25519")
const publicKey = keypair.publicKey.export({ type: "spki", format: "pem" })
const hash = (value) => createHash("sha256").update(value).digest("hex")
const envelope = (payload) =>
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
const roleNames = {
  migrator: "nthawi_migrator",
  auth: "nthawi_auth",
  business: "nthawi_business",
  jobs: "nthawi_jobs",
}

function environment() {
  const env = {
    NEON_TARGET: "production",
    NEON_EXPECTED_PROJECT_ID: NEON_TARGETS.production.projectId,
    NEON_EXPECTED_BRANCH_ID: NEON_TARGETS.production.branchId,
  }
  for (const [kind, variable] of [
    ["migrator", "DATABASE_MIGRATION_URL"],
    ["auth", "AUTH_DATABASE_URL"],
    ["business", "DATABASE_URL"],
    ["jobs", "JOBS_DATABASE_URL"],
  ]) {
    env[`DATABASE_${kind.toUpperCase()}_ROLE`] = roleNames[kind]
    // Distinct per role: promotion refuses shared production credentials.
    env[variable] =
      `postgresql://${roleNames[kind]}:synthetic-password-${kind}@${NEON_TARGETS.production.host}:5432/neondb?sslmode=verify-full`
  }
  return env
}

function contracts() {
  const plan = {
    id: "11111111-1111-4111-8111-111111111111",
    sourceCommit: "a".repeat(40),
    artifactSha256: "b".repeat(64),
    sourceManifestSha256: "c".repeat(64),
    target: {
      environment: "production",
      ...NEON_TARGETS.production,
      port: 5432,
      postgresMajor: 18,
      tls: "verify-full",
      pooled: false,
    },
    migrations: [
      {
        name: "0000_initial_app",
        createdAt: 1790604466879,
        sha256: "d".repeat(64),
      },
    ],
    evidence: [
      { sha256: "e".repeat(64) },
      { sha256: "f".repeat(64) },
      { sha256: "1".repeat(64) },
    ],
  }
  const receiptBytes = Buffer.from(
    JSON.stringify({
      code: "NEON_PROMOTION_OFFLINE_CHECK_PASSED",
      planId: plan.id,
      sourceCommit: plan.sourceCommit,
      artifactSha256: plan.artifactSha256,
      target: plan.target.branchId,
      evidenceSha256: plan.evidence.map((entry) => entry.sha256),
      mode: "offline-attestation-check",
      productionExecutionAvailable: false,
      checkedAt: iso(-60_000),
    })
  )
  const authority = {
    version: 1,
    id: "22222222-2222-4222-8222-222222222222",
    scope: "initial-production-migration",
    planId: plan.id,
    sourceCommit: plan.sourceCommit,
    artifactSha256: plan.artifactSha256,
    sourceManifestSha256: plan.sourceManifestSha256,
    productionTarget: plan.target,
    offlineReceiptSha256: hash(receiptBytes),
    expectedEmptyCatalogSha256: "2".repeat(64),
    operator: "Shane Viyazhi",
    issuedAt: iso(-60_000),
    expiresAt: iso(10 * 60_000),
  }
  return { plan, receiptBytes, authority, authorityBytes: envelope(authority) }
}

test("production credentials become explicit verified TLS fields without URL or inherited host overrides", () => {
  const config = productionConnectionOptions(environment())
  assert.equal(config.migrator.host, NEON_TARGETS.production.host)
  assert.equal(config.migrator.ssl.rejectUnauthorized, true)
  assert.equal(config.migrator.ssl.servername, NEON_TARGETS.production.host)
  assert.equal(config.migrator.connectionString, undefined)
  assert.equal(config.auth.user, roleNames.auth)
})

for (const [label, mutate] of [
  ["missing explicit production", (env) => delete env.NEON_TARGET],
  ["test misuse", (env) => (env.NEON_TARGET = "test")],
  ["wrong project", (env) => (env.NEON_EXPECTED_PROJECT_ID = "wrong")],
  [
    "wrong branch",
    (env) => (env.NEON_EXPECTED_BRANCH_ID = NEON_TARGETS.test.branchId),
  ],
  [
    "pooled URL",
    (env) =>
      (env.DATABASE_URL = env.DATABASE_URL.replace(".c-2", "-pooler.c-2")),
  ],
  [
    "wrong DB",
    (env) =>
      (env.DATABASE_URL = env.DATABASE_URL.replace("/neondb?", "/postgres?")),
  ],
  [
    "wrong login",
    (env) =>
      (env.DATABASE_URL = env.DATABASE_URL.replace(
        "nthawi_business:",
        "neondb_owner:"
      )),
  ],
  [
    "non-verifying TLS",
    (env) =>
      (env.DATABASE_URL = env.DATABASE_URL.replace("verify-full", "require")),
  ],
  ["host override", (env) => (env.DATABASE_URL += "&host=localhost")],
  ["PGHOST inherited", (env) => (env.PGHOST = "wrong")],
  ["PGOPTIONS inherited", (env) => (env.PGOPTIONS = "-c role=neon_superuser")],
  ["NODE preload", (env) => (env.NODE_OPTIONS = "--import untrusted.mjs")],
  ["TLS disable", (env) => (env.NODE_TLS_REJECT_UNAUTHORIZED = "0")],
  [
    "a runtime role sharing the migrator password",
    (env) =>
      (env.DATABASE_URL = env.DATABASE_URL.replace(
        "synthetic-password-business",
        "synthetic-password-migrator"
      )),
  ],
  [
    "two runtime roles sharing one password",
    (env) =>
      (env.JOBS_DATABASE_URL = env.JOBS_DATABASE_URL.replace(
        "synthetic-password-jobs",
        "synthetic-password-auth"
      )),
  ],
])
  test(`production configuration rejects ${label}`, () => {
    const env = environment()
    mutate(env)
    assert.throws(() => productionConnectionOptions(env), {
      message: "NEON_PRODUCTION_PROMOTION_REJECTED",
    })
  })

test("separate signed execution authority binds readiness receipt and exact operator confirmation", () => {
  const f = contracts()
  assert.equal(
    validateExecutionAuthority(
      f.authorityBytes,
      publicKey,
      f.plan,
      f.receiptBytes,
      executionConfirmation(f.authority),
      now
    ).scope,
    "initial-production-migration"
  )
  assert.throws(() =>
    validateExecutionAuthority(
      f.authorityBytes,
      publicKey,
      f.plan,
      f.receiptBytes,
      promotionConfirmation(f.plan),
      now
    )
  )
  assert.throws(() =>
    validateExecutionAuthority(
      f.authorityBytes,
      publicKey,
      f.plan,
      Buffer.from("different receipt"),
      executionConfirmation(f.authority),
      now
    )
  )
})
for (const [label, mutate] of [
  [
    "readiness-only approval",
    (a) => (a.scope = "production-promotion-readiness-only"),
  ],
  ["wrong source", (a) => (a.sourceCommit = "9".repeat(40))],
  ["wrong artifact", (a) => (a.artifactSha256 = "9".repeat(64))],
  ["wrong target", (a) => (a.productionTarget = NEON_TARGETS.test)],
  ["stale authorization", (a) => (a.expiresAt = iso(-1))],
  ["future authorization", (a) => (a.issuedAt = iso(1))],
  ["overlong authorization", (a) => (a.expiresAt = iso(16 * 60_000))],
  ["missing catalog hash", (a) => (a.expectedEmptyCatalogSha256 = "")],
  ["unexpected URL field", (a) => (a.connectionString = "private")],
])
  test(`signed execution authority rejects ${label}`, () => {
    const f = contracts()
    mutate(f.authority)
    assert.throws(() =>
      validateExecutionAuthority(
        envelope(f.authority),
        publicKey,
        f.plan,
        f.receiptBytes,
        executionConfirmation(f.authority),
        now
      )
    )
  })

async function fixture(t) {
  const temp = await mkdtemp(path.join(tmpdir(), "nthawi-promote-test-"))
  t.after(async () => {
    assert.equal(path.dirname(temp), path.resolve(tmpdir()))
    await rm(temp, { recursive: true, force: true })
  })
  const f = contracts()
  const options = {
    mode: "execute",
    environment: environment(),
    repositoryRoot: temp,
    auditDirectory: path.join(temp, "audit"),
    authorizationPath: path.join(temp, "authority.json"),
    receiptPath: path.join(temp, "receipt.json"),
    trustedPublicKeyPath: path.join(temp, "public.pem"),
    planConfirmation: promotionConfirmation(f.plan),
    confirmation: executionConfirmation(f.authority),
    now,
  }
  await writeFile(options.authorizationPath, f.authorityBytes)
  await writeFile(options.receiptPath, f.receiptBytes)
  await writeFile(options.trustedPublicKeyPath, publicKey)
  const calls = []
  const client = {
    connection: { stream: { encrypted: true, authorized: true } },
    ssl: { rejectUnauthorized: true },
    query: async (sql) => {
      calls.push(sql)
      return { rows: [{ locked: true }] }
    },
    end: async () => {
      calls.push("end")
    },
  }
  let loads = 0
  const dependencies = {
    now: () => now,
    loadContract: async (input) => {
      loads++
      calls.push("load")
      assert.equal(input.confirmation, options.planConfirmation)
      return { plan: f.plan }
    },
    connect: async () => {
      calls.push("connect")
      return client
    },
    inspect: async (sameClient) => {
      assert.equal(sameClient, client)
      calls.push("inspect")
      return { fingerprint: f.authority.expectedEmptyCatalogSha256 }
    },
    migrate: async (sameClient) => {
      assert.equal(sameClient, client)
      calls.push("migrate")
    },
    provision: async (sameClient) => {
      assert.equal(sameClient, client)
      calls.push("provision")
    },
    verify: async (sameClient) => {
      assert.equal(sameClient, client)
      calls.push("verify")
    },
  }
  const events = async () =>
    (
      await readFile(
        path.join(options.auditDirectory, `${f.authority.id}.jsonl`),
        "utf8"
      )
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
  return {
    ...f,
    options,
    dependencies,
    client,
    calls,
    events,
    get loads() {
      return loads
    },
  }
}

test("check mode validates contract and authorization without connecting or creating execution audit", async (t) => {
  const f = await fixture(t)
  f.options.mode = "check"
  assert.deepEqual(await runProductionPromotion(f.options, f.dependencies), {
    code: "NEON_PRODUCTION_PROMOTION_CHECK_PASSED",
    planId: f.plan.id,
    connected: false,
    executed: false,
  })
  assert.deepEqual(f.calls, ["load"])
  await assert.rejects(stat(f.options.auditDirectory), { code: "ENOENT" })
})

test("same-client lock, fresh preflight/source recheck, migration, provisioning and postprobe complete with one-use audit", async (t) => {
  const f = await fixture(t)
  const result = await runProductionPromotion(f.options, f.dependencies)
  assert.equal(result.executed, true)
  assert.equal(f.loads, 2)
  assert.deepEqual(
    f.calls.filter((value) => !value.startsWith("SELECT")),
    [
      "load",
      "connect",
      "inspect",
      "load",
      "migrate",
      "provision",
      "verify",
      "end",
    ]
  )
  assert.match(f.calls[2], /pg_try_advisory_lock/)
  assert.ok(f.calls.some((value) => value.includes("pg_advisory_unlock")))
  assert.deepEqual(
    (await f.events()).map((event) => event.code),
    [
      "NEON_PRODUCTION_PROMOTION_STARTED",
      "NEON_PRODUCTION_PROMOTION_PREFLIGHT_PASSED",
      "NEON_PRODUCTION_PROMOTION_MIGRATIONS_APPLIED",
      "NEON_PRODUCTION_PROMOTION_COMPLETED",
    ]
  )
  await assert.rejects(runProductionPromotion(f.options, f.dependencies))
  assert.equal(f.calls.filter((value) => value === "migrate").length, 1)
  assert.equal(
    JSON.stringify(await f.events()).includes("synthetic-password"),
    false
  )
})

for (const stage of ["connect", "inspect", "migrate", "provision", "verify"])
  test(`${stage} failure writes failed evidence, closes owned connection and never blindly reruns`, async (t) => {
    const f = await fixture(t)
    f.dependencies[stage] = async () => {
      f.calls.push(`failed-${stage}`)
      throw new Error("postgresql://secret:password@private/db")
    }
    await assert.rejects(runProductionPromotion(f.options, f.dependencies), {
      message: "NEON_PRODUCTION_PROMOTION_REJECTED",
    })
    assert.equal(
      (await f.events()).at(-1).code,
      "NEON_PRODUCTION_PROMOTION_FAILED"
    )
    assert.equal(
      (await f.events()).some((event) => event.code.includes("COMPLETED")),
      false
    )
    assert.equal(JSON.stringify(await f.events()).includes("password"), false)
    if (stage !== "connect") assert.ok(f.calls.includes("end"))
    if (["connect", "inspect"].includes(stage))
      assert.equal(f.calls.includes("migrate"), false)
    if (stage === "migrate") assert.equal(f.calls.includes("provision"), false)
    await assert.rejects(runProductionPromotion(f.options, f.dependencies))
  })

for (const reason of ["tls", "lock", "catalog", "source", "expired", "cleanup"])
  test(`fails closed for ${reason} and preserves audit`, async (t) => {
    const f = await fixture(t)
    if (reason === "tls") f.client.connection.stream.authorized = false
    if (reason === "lock")
      f.client.query = async (sql) => {
        f.calls.push(sql)
        return { rows: [{ locked: false }] }
      }
    if (reason === "catalog")
      f.dependencies.inspect = async () => ({ fingerprint: "0".repeat(64) })
    if (reason === "source")
      f.dependencies.loadContract = async () => {
        f.calls.push("load")
        if (f.calls.includes("inspect")) throw new Error("changed source")
        return { plan: f.plan }
      }
    if (reason === "expired") f.dependencies.now = () => now + 11 * 60_000
    if (reason === "cleanup")
      f.client.end = async () => {
        throw new Error("private details")
      }
    await assert.rejects(runProductionPromotion(f.options, f.dependencies), {
      message: "NEON_PRODUCTION_PROMOTION_REJECTED",
    })
    assert.ok((await f.events()).at(-1).code.endsWith("FAILED"))
    if (reason !== "cleanup") assert.equal(f.calls.includes("migrate"), false)
  })

function catalogClient(change = () => {}) {
  const catalog = {
    identity: {
      database: "neondb",
      role: "nthawi_migrator",
      login: "nthawi_migrator",
      major: 18,
      owner: "nthawi_migrator",
    },
    profiles: Object.values(roleNames)
      .sort()
      .map((name) => ({
        name,
        rolcanlogin: true,
        rolsuper: false,
        rolbypassrls: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolreplication: false,
        rolinherit: false,
        memberships: false,
        owns_schema: false,
        owns_objects: false,
      })),
    schemas: [{ name: "public", owner: "pg_database_owner", acl: null }],
    objects: [],
    extensions: [{ name: "vector", version: "0.8.1", schema: "public" }],
    valid: true,
    auxiliary: {
      large_objects: false,
      publications: false,
      subscriptions: false,
      event_triggers: false,
    },
  }
  change(catalog)
  const calls = []
  return {
    calls,
    connection: { stream: { encrypted: true, authorized: true } },
    ssl: { rejectUnauthorized: true },
    query: async (sql) => {
      calls.push(sql)
      if (sql.includes("current_database() AS database"))
        return { rows: [catalog.identity] }
      if (sql.includes("FROM pg_roles r")) return { rows: catalog.profiles }
      if (sql.includes("nspacl::text")) return { rows: catalog.schemas }
      if (sql.includes("'relation' AS kind")) return { rows: catalog.objects }
      if (sql.includes("FROM pg_extension")) return { rows: catalog.extensions }
      if (sql.includes("vector_dims"))
        return { rows: [{ valid: catalog.valid }] }
      if (sql.includes("FROM pg_largeobject_metadata"))
        return { rows: [catalog.auxiliary] }
      return { rows: [] }
    },
  }
}

test("fresh catalog fingerprint is deterministic, read-only and includes ACL/extension state", async () => {
  const client = catalogClient()
  const result = await inspectInitialProduction(client)
  assert.match(result.fingerprint, /^[a-f0-9]{64}$/)
  assert.equal(
    client.calls[0],
    "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"
  )
  assert.equal(client.calls.at(-1), "ROLLBACK")
  const changed = await inspectInitialProduction(
    catalogClient((catalog) => (catalog.schemas[0].acl = "{changed}"))
  )
  assert.notEqual(result.fingerprint, changed.fingerprint)
})
for (const [label, mutate] of [
  ["wrong PG major", (c) => (c.identity.major = 17)],
  ["wrong login", (c) => (c.identity.login = "neondb_owner")],
  ["wrong ownership", (c) => (c.identity.owner = "neondb_owner")],
  ["missing role", (c) => c.profiles.pop()],
  ["runtime bypass", (c) => (c.profiles[0].rolbypassrls = true)],
  ["runtime membership", (c) => (c.profiles[0].memberships = true)],
  ["runtime object ownership", (c) => (c.profiles[0].owns_objects = true)],
  ["existing app namespace", (c) => c.schemas.push({ name: "app_private" })],
  [
    "existing migration/data object",
    (c) =>
      c.objects.push({ kind: "relation", schema: "public", name: "messages" }),
  ],
  ["missing vector", (c) => (c.extensions = [])],
  ["invalid vector dimensions", (c) => (c.valid = false)],
  ["existing large object data", (c) => (c.auxiliary.large_objects = true)],
  ["existing publication", (c) => (c.auxiliary.publications = true)],
  ["existing subscription", (c) => (c.auxiliary.subscriptions = true)],
  ["DDL event trigger", (c) => (c.auxiliary.event_triggers = true)],
])
  test(`initial-target preflight rejects ${label} and rolls back read-only inspection`, async () => {
    const client = catalogClient(mutate)
    await assert.rejects(inspectInitialProduction(client))
    assert.equal(client.calls.at(-1), "ROLLBACK")
  })
