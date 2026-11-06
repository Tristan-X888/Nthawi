import assert from "node:assert/strict"
import test from "node:test"
import { schemaManifest } from "../packages/db/dist/schema-manifest.js"
import { expectedExportCatalog } from "./neon-content-barrier.mjs"
import {
  assertExtensionInventory,
  assertExtensionCompatibility,
  assertMigrationLedger,
  assertRestoredCounts,
  captureSyntheticCoverage,
  classifyToolFailure,
  compareRestoredSyntheticCoverage,
  exportConsistentSnapshot,
  runNegativeExports,
} from "./neon-export.mjs"
import { createSyntheticFixtures } from "./neon-synthetic-fixtures.mjs"
import { NEON_TARGETS } from "./neon-targets.mjs"

const at = "2026-11-05T12:00:00.000Z"
const extensions = () => [
  { name: "plpgsql", schema: "pg_catalog", version: "1.0" },
  { name: "vector", schema: "public", version: "0.8.1" },
]
const ledger = () =>
  schemaManifest.migrations.map((migration) => ({
    hash: migration.hash,
    created_at: String(migration.createdAt),
  }))

function fixtureClient(
  fixture,
  {
    overdueRelation,
    drift,
    extraExtension,
    missingMigration,
    bypass = true,
    dumpError,
    rollbackError,
  } = {}
) {
  const calls = []
  let active = false
  let dumped = false
  const client = {
    ssl: { rejectUnauthorized: true },
    connection: { stream: { encrypted: true, authorized: true } },
    query: async (text, values) => {
      calls.push(text)
      if (text.startsWith("SELECT current_database()"))
        return {
          rows: [
            {
              database_matches: true,
              login_matches: true,
              current_matches: true,
              version_matches: true,
              bypasses_rls: bypass,
              not_superuser: true,
              reads_all_data: true,
            },
          ],
        }
      // Observed on Neon 2026-11-05: the switch is refused with XX000.
      if (text === "SET ROLE neon_superuser")
        throw Object.assign(new Error("internal secret"), { code: "XX000" })
      if (text.startsWith("BEGIN")) active = true
      if (text === "ROLLBACK") {
        active = false
        if (rollbackError) throw new Error("private driver error")
      }
      if (text.startsWith("SELECT pg_export_snapshot"))
        return { rows: [{ snapshot: "00000004-00000012-1", at }] }
      if (text.includes("json_agg")) {
        const rows = expectedExportCatalog(schemaManifest)
        if (drift)
          rows.push({
            schema: "public",
            name: "unclassified_payloads",
            kind: "r",
            rls: false,
            forced: false,
            columns: [{ name: "body", type: "text", notNull: false }],
          })
        return { rows }
      }
      if (text.includes("FROM pg_extension"))
        return {
          rows: extraExtension
            ? [...extensions(), { name: "dblink", schema: "public" }]
            : extensions(),
        }
      if (text.includes("FROM drizzle.__drizzle_migrations"))
        return { rows: missingMigration ? ledger().slice(0, -1) : ledger() }
      if (text.includes("FILTER (WHERE")) {
        const relation = text.match(/ FROM "([a-z_]+)"\."([a-z_]+)" t WHERE/)
        const name = `${relation[1]}.${relation[2]}`
        return {
          rows: [{ total: "2", overdue: name === overdueRelation ? "1" : "0" }],
        }
      }
      if (text.includes("FROM public.deletion_journal"))
        return { rows: [{ entries: "0", latest: null }] }
      if (text.startsWith("SELECT * FROM")) {
        const table = text.match(/"public"\."([a-z_]+)"/)[1]
        const column = text.includes('"workspace_id" = $1')
          ? "workspace_id"
          : "id"
        const row = fixture.tenants
          .map((tenant) => tenant.rows.get(table))
          .find((candidate) => candidate[column] === values[0])
        return { rows: row ? [row] : [] }
      }
      return { rows: [] }
    },
  }
  return {
    client,
    calls,
    active: () => active,
    dumped: () => dumped,
    runDump: async (snapshot, options) => {
      assert.equal(snapshot, "00000004-00000012-1")
      // Transient rate-limit counters never enter a recovery copy.
      assert.deepEqual(options?.exclusions, [
        '--exclude-table-data="public"."rate_limit"',
      ])
      assert.equal(active, true, "holder must stay open during pg_dump")
      assert.equal(
        calls.filter((text) =>
          / FROM "[a-z_]+"\."[a-z_]+" t WHERE \$1::timestamptz IS NOT NULL$/.test(
            text
          )
        ).length,
        21,
        "barrier covers every classified relation before the dump"
      )
      assert.ok(calls.includes("SET LOCAL row_security = off"))
      dumped = true
      if (dumpError) throw new Error("private dump error")
      return { sha256: "a".repeat(64), bytes: 1024 }
    },
  }
}

const exportWith = (fake, fixture, now = () => new Date(at)) =>
  exportConsistentSnapshot(fake.client, {
    fixture,
    runDump: fake.runDump,
    now,
  })

test("export holds the privileged snapshot through the dump and records evidence", async () => {
  const fixture = createSyntheticFixtures()
  const fake = fixtureClient(fixture)
  const result = await exportWith(fake, fixture)
  assert.equal(fake.dumped(), true)
  assert.equal(fake.active(), false)
  assert.equal(fake.calls.at(-1), "ROLLBACK")
  assert.equal(result.snapshotAt, at)
  assert.equal(result.syntheticCoverage.length, 24)
  assert.equal(result.barrier.length, 21)
  assert.match(result.rolesAndGrantsSha256, /^[a-f0-9]{64}$/)
  assert.equal(result.dumpSha256, "a".repeat(64))
  assert.equal(result.restoredCopyVerified, false)
  assert.equal(result.version, "phase4-synthetic-export-v3")
  assert.deepEqual(result.excludedTableData, ["public.rate_limit"])
  // The login's own BYPASSRLS is verified on the holder session before the
  // snapshot transaction; no role switch is attempted (Neon refuses it).
  const verification = fake.calls.findIndex((text) =>
    text.includes("rolbypassrls")
  )
  assert.ok(verification >= 0)
  assert.ok(
    verification < fake.calls.findIndex((text) => text.startsWith("BEGIN"))
  )
  assert.ok(fake.calls.every((text) => !text.startsWith("SET ROLE")))
})

test("privilege, content, catalog, extension and migration failures stop before the dump", async () => {
  const fixture = createSyntheticFixtures()
  for (const options of [
    { bypass: false },
    { overdueRelation: "public.messages" },
    { overdueRelation: "public.user" },
    { drift: true },
    { extraExtension: true },
    { missingMigration: true },
  ]) {
    const fake = fixtureClient(fixture, options)
    await assert.rejects(exportWith(fake, fixture), undefined, options)
    assert.equal(fake.dumped(), false, JSON.stringify(options))
    assert.equal(fake.active(), false, JSON.stringify(options))
  }
})

test("dump failure, late completion and rollback failure all fail and close the snapshot", async () => {
  const fixture = createSyntheticFixtures()
  for (const options of [{ dumpError: true }, { rollbackError: true }]) {
    const fake = fixtureClient(fixture, options)
    await assert.rejects(exportWith(fake, fixture))
    assert.equal(fake.calls.at(-1), "ROLLBACK")
  }
  const fake = fixtureClient(fixture)
  await assert.rejects(
    exportWith(fake, fixture, () => new Date(Date.parse(at) + 20 * 60_000 + 1)),
    /NEON_EXPORT_DEADLINE_EXCEEDED/
  )
  assert.equal(fake.active(), false)
})

test("tool failures are classified without retaining diagnostic text", () => {
  assert.equal(
    classifyToolFailure(
      'pg_dump: error: query failed: ERROR:  query would be affected by row-level security policy for table "workspaces"'
    ),
    "row-security-blocked"
  )
  assert.equal(
    classifyToolFailure(
      "pg_dump: error: query failed: ERROR:  permission denied for table account"
    ),
    "permission-denied"
  )
  assert.equal(
    classifyToolFailure(
      'connection to server at "x" failed: password authentication failed'
    ),
    "authentication-failed"
  )
  assert.equal(classifyToolFailure("something else"), "other-failure")
  assert.equal(classifyToolFailure(""), "other-failure")
})

test("restricted dump evidence requires an authenticated privilege/RLS rejection", async () => {
  const target = NEON_TARGETS.test
  const env = { NEON_TARGET: "test", NEON_EXPECTED_BRANCH_ID: target.branchId }
  for (const [urlKey, roleKey, role] of [
    ["DATABASE_MIGRATION_URL", "DATABASE_MIGRATOR_ROLE", "nthawi_migrator"],
    ["AUTH_DATABASE_URL", "DATABASE_AUTH_ROLE", "nthawi_auth"],
    ["DATABASE_URL", "DATABASE_BUSINESS_ROLE", "nthawi_business"],
    ["JOBS_DATABASE_URL", "DATABASE_JOBS_ROLE", "nthawi_jobs"],
  ]) {
    env[roleKey] = role
    env[urlKey] =
      `postgresql://${role}:synthetic-${role}@${target.host}:5432/${target.database}?sslmode=verify-full`
  }
  const options = {
    env,
    target,
    pgDump: "pg_dump",
    caFile: "synthetic.pem",
    directory: "synthetic",
  }
  for (const failure of ["row-security-blocked", "permission-denied"]) {
    const evidence = await runNegativeExports({
      ...options,
      run: async () => ({ code: 1, failure }),
    })
    assert.equal(evidence.length, 3)
  }
  for (const failure of ["authentication-failed", "other-failure", null])
    await assert.rejects(
      runNegativeExports({
        ...options,
        run: async () => ({ code: 1, failure }),
      }),
      /EVIDENCE_INVALID/
    )
  await assert.rejects(
    runNegativeExports({
      ...options,
      run: async () => ({ code: 0, failure: null }),
    }),
    /RESTRICTED_DUMP_SUCCEEDED/
  )
})

test("extension inventory must be exactly plpgsql and vector in their schemas", () => {
  assert.deepEqual(assertExtensionInventory(extensions()), [
    { name: "plpgsql", schema: "pg_catalog", version: "1.0" },
    { name: "vector", schema: "public", version: "0.8.1" },
  ])
  for (const rows of [
    [...extensions(), { name: "dblink", schema: "public" }],
    extensions().slice(0, 1),
    extensions().map((row) =>
      row.name === "vector" ? { ...row, schema: "extensions" } : row
    ),
    [],
    extensions().map((row) => ({ ...row, version: undefined })),
  ])
    assert.throws(
      () => assertExtensionInventory(rows),
      /NEON_EXPORT_EXTENSION_DRIFT/
    )
})

test("restored extension versions follow the reviewed exact-version compatibility policy", () => {
  assert.deepEqual(
    assertExtensionCompatibility(extensions(), extensions()),
    extensions()
  )
  const changed = extensions().map((row) =>
    row.name === "vector" ? { ...row, version: "0.8.2" } : row
  )
  assert.throws(
    () => assertExtensionCompatibility(extensions(), changed),
    /NEON_EXPORT_EXTENSION_VERSION_DRIFT/
  )
})

test("the migration ledger must equal the reviewed manifest in order", () => {
  assert.equal(assertMigrationLedger(ledger(), schemaManifest), 3)
  const cases = [
    ledger().slice(0, -1),
    [...ledger(), { hash: "b".repeat(64), created_at: "1790900000000" }],
    [...ledger()].reverse(),
    ledger().map((row, index) =>
      index === 1 ? { ...row, hash: "c".repeat(64) } : row
    ),
    ledger().map((row, index) =>
      index === 0 ? { ...row, created_at: "1" } : row
    ),
  ]
  for (const rows of cases)
    assert.throws(
      () => assertMigrationLedger(rows, schemaManifest),
      /NEON_EXPORT_MIGRATION_DRIFT/
    )
})

test("restored per-relation counts must match the exported snapshot exactly", () => {
  const source = [
    { relation: "public.messages", total: "2", overdue: "0" },
    { relation: "public.workspaces", total: "2", overdue: "0" },
  ]
  assert.equal(
    assertRestoredCounts(source, [
      { relation: "public.workspaces", total: "2" },
      { relation: "public.messages", total: "2" },
    ]),
    2
  )
  for (const restored of [
    [{ relation: "public.messages", total: "2" }],
    [
      { relation: "public.messages", total: "1" },
      { relation: "public.workspaces", total: "2" },
    ],
    [
      { relation: "public.messages", total: "2" },
      { relation: "public.workspaces", total: "2" },
      { relation: "public.user", total: "0" },
    ],
  ])
    assert.throws(
      () => assertRestoredCounts(source, restored),
      /NEON_EXPORT_RESTORED_COUNTS_MISMATCH/
    )
})

test("an excluded transient relation must restore empty, whatever the snapshot held", () => {
  const source = [
    { relation: "public.messages", total: "2", overdue: "0" },
    { relation: "public.rate_limit", total: "3", overdue: "0" },
  ]
  const empty = [
    { relation: "public.messages", total: "2" },
    { relation: "public.rate_limit", total: "0" },
  ]
  const excluded = { excludedTableData: ["public.rate_limit"] }
  assert.equal(assertRestoredCounts(source, empty, excluded), 2)
  // Rows that should have been excluded mean the dump did not apply the rule.
  assert.throws(
    () =>
      assertRestoredCounts(
        source,
        [
          { relation: "public.messages", total: "2" },
          { relation: "public.rate_limit", total: "3" },
        ],
        excluded
      ),
    /NEON_EXPORT_RESTORED_COUNTS_MISMATCH/
  )
  // Without the reviewed exclusion, an empty restore is a loss of data.
  assert.throws(
    () => assertRestoredCounts(source, empty),
    /NEON_EXPORT_RESTORED_COUNTS_MISMATCH/
  )
  assert.throws(
    () =>
      assertRestoredCounts(source, empty, {
        excludedTableData: ["public.unknown"],
      }),
    /NEON_EXPORT_RESTORED_COUNTS_MISMATCH/
  )
})

test("restored synthetic row hashes detect omission and corruption", async () => {
  const fixture = createSyntheticFixtures()
  const fake = fixtureClient(fixture)
  const syntheticCoverage = await captureSyntheticCoverage(fake.client, fixture)
  await assert.rejects(
    compareRestoredSyntheticCoverage(fake.client, { syntheticCoverage: [] }),
    /RESTORED_COVERAGE/
  )
  await assert.rejects(
    compareRestoredSyntheticCoverage(fake.client, {
      syntheticCoverage: [syntheticCoverage[1], ...syntheticCoverage.slice(1)],
    }),
    /RESTORED_COVERAGE/
  )
  assert.deepEqual(
    await compareRestoredSyntheticCoverage(fake.client, { syntheticCoverage }),
    { matchedSyntheticRelations: 24 }
  )
  fixture.tenants[0].rows.get("messages").body = "Corrupted restored body"
  await assert.rejects(
    compareRestoredSyntheticCoverage(fake.client, { syntheticCoverage }),
    /RESTORED_COVERAGE_MISMATCH/
  )
})

test("the command entry point reaches its guard without a module cycle", async () => {
  const { spawnSync } = await import("node:child_process")
  const { fileURLToPath } = await import("node:url")
  // Six argv entries and no acceptance environment: the guard must reject
  // with a coded line. A circular import would instead leave top-level await
  // unsettled and exit 13 with no coded diagnostic.
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL("./neon-export.mjs", import.meta.url)),
      "C:/missing/evidence",
      "C:/missing/pg_dump.exe",
      "C:/missing/pg_restore.exe",
      "C:/missing/ca.pem",
    ],
    {
      env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH },
      encoding: "utf8",
      timeout: 60_000,
    }
  )
  assert.equal(result.status, 1)
  assert.match(
    result.stderr,
    /^NEON_SYNTHETIC_EXPORT_FAILED code=NEON_[A-Z_]+ stage=/m
  )
  assert.doesNotMatch(result.stderr, /unsettled top-level await/)
})
