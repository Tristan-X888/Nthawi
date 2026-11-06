import assert from "node:assert/strict"
import { createHash, randomBytes } from "node:crypto"
import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createRequire } from "node:module"
import { after, before, test } from "node:test"
import { createDatabaseTestFixture } from "../packages/db/test/helpers/database-fixture.mjs"
import { recoveryDumpExclusions } from "./neon-content-barrier.mjs"
import { verifyRestoredExport } from "./neon-export-restore.mjs"
import { exportConsistentSnapshot, runPostgresTool } from "./neon-export.mjs"
import {
  cleanupSyntheticFixtures,
  createSyntheticFixtures,
  insertSyntheticFixtures,
} from "./neon-synthetic-fixtures.mjs"

// LOCAL ONLY, on a disposable loopback PostgreSQL 18 (shared guard), with
// PostgreSQL 18 client tools. It models what was observed on Neon on
// 2026-11-05: the export login holds BYPASSRLS itself and reads every table
// through an inherited pg_read_all_data membership; no SET ROLE is used.
// A second login that can read every table but lacks BYPASSRLS proves the
// fail-closed default and the incompleteness of --enable-row-security dumps.
const adminUrl = process.env.RLS_TEST_ADMIN_URL
const pgBin = process.env.NEON_EXPORT_TEST_PG_BIN
if (!adminUrl || !pgBin)
  throw new Error(
    "RLS_TEST_ADMIN_URL and NEON_EXPORT_TEST_PG_BIN are required for this local integration test"
  )
const exe = process.platform === "win32" ? ".exe" : ""
const pgDump = join(pgBin, `pg_dump${exe}`)
const pgRestore = join(pgBin, `pg_restore${exe}`)
const { Client } = createRequire(
  new URL("../packages/db/package.json", import.meta.url)
)("pg")

let fixture
let synthetic
let admin
let control
let directory
let roles
const passwords = {
  exporter: randomBytes(24).toString("hex"),
  reader: randomBytes(24).toString("hex"),
}

before(async () => {
  fixture = await createDatabaseTestFixture(adminUrl)
  roles = {
    group: `${fixture.databaseName}_superuser`,
    exporter: `${fixture.databaseName}_export`,
    reader: `${fixture.databaseName}_reader`,
  }
  control = new Client({ connectionString: adminUrl })
  control.on("error", () => {})
  await control.connect()
  await control.query(`CREATE ROLE "${roles.group}" NOLOGIN BYPASSRLS`)
  await control.query(`GRANT pg_read_all_data TO "${roles.group}"`)
  await control.query(
    `CREATE ROLE "${roles.exporter}" LOGIN INHERIT BYPASSRLS PASSWORD '${passwords.exporter}'`
  )
  await control.query(
    `GRANT "${roles.group}" TO "${roles.exporter}" WITH INHERIT TRUE`
  )
  await control.query(
    `CREATE ROLE "${roles.reader}" LOGIN INHERIT NOBYPASSRLS PASSWORD '${passwords.reader}'`
  )
  await control.query(`GRANT pg_read_all_data TO "${roles.reader}"`)
  await control.query(
    `GRANT CONNECT ON DATABASE "${fixture.databaseName}" TO "${roles.exporter}", "${roles.reader}"`
  )
  admin = await fixture.pools.admin.connect()
  synthetic = createSyntheticFixtures()
  await insertSyntheticFixtures(admin, synthetic)
  // One transient rate-limit counter: it must never reach a recovery copy.
  await admin.query(
    "INSERT INTO public.rate_limit (key, count, last_request) VALUES ($1, 1, $2)",
    [`phase4-synthetic:${synthetic.runId}`, Date.now()]
  )
  directory = await mkdtemp(join(tmpdir(), "nthawi-phase4-export-it-"))
})

after(async () => {
  if (admin && synthetic)
    await admin.query("DELETE FROM public.rate_limit WHERE key = $1", [
      `phase4-synthetic:${synthetic.runId}`,
    ])
  if (admin && synthetic) await cleanupSyntheticFixtures(admin, synthetic)
  admin?.release(true)
  await fixture?.close()
  if (control) {
    for (const role of [roles?.exporter, roles?.reader, roles?.group].filter(
      Boolean
    ))
      await control.query(`DROP ROLE IF EXISTS "${role}"`)
    await control.end()
  }
})

const local = () => {
  const url = new URL(adminUrl)
  return { host: url.hostname, port: url.port || "5432" }
}
const toolEnv = (user, password) => ({
  SystemRoot: process.env.SystemRoot,
  PATH: process.env.PATH,
  PGHOST: local().host,
  PGPORT: local().port,
  PGUSER: user,
  PGPASSWORD: password,
  PGDATABASE: fixture.databaseName,
  PGSSLMODE: "disable",
})
const dumpArgs = (file, extra = []) => [
  "--no-password",
  "--dbname",
  fixture.databaseName,
  ...extra,
  "--format=custom",
  `--file=${file}`,
]

// Local equivalent of the Neon session assertion, without TLS.
async function assertLocalPrivilegedSession(client) {
  const row = (
    await client.query(
      "SELECT current_user = $1 AND session_user = $1 AS login_matches, r.rolbypassrls AS bypasses_rls, pg_has_role(current_user, 'pg_read_all_data', 'USAGE') AS reads_all_data FROM pg_roles r WHERE r.rolname = current_user",
      [roles.exporter]
    )
  ).rows[0]
  assert.equal(row?.login_matches, true)
  assert.equal(row?.bypasses_rls, true)
  assert.equal(row?.reads_all_data, true)
}

test("a reader without BYPASSRLS, and a restricted runtime role, cannot export", async () => {
  const blocked = await runPostgresTool(
    pgDump,
    dumpArgs(join(directory, "reader-default.dump")),
    { env: toolEnv(roles.reader, passwords.reader) }
  )
  assert.notEqual(blocked.code, 0)
  assert.equal(blocked.failure, "row-security-blocked")
  const restricted = new URL(fixture.urls.business)
  const runtime = await runPostgresTool(
    pgDump,
    dumpArgs(join(directory, "business.dump")),
    {
      env: toolEnv(
        decodeURIComponent(restricted.username),
        decodeURIComponent(restricted.password)
      ),
    }
  )
  assert.notEqual(runtime.code, 0)
  assert.ok(
    ["row-security-blocked", "permission-denied"].includes(runtime.failure)
  )
})

test("one exported snapshot, a same-role dump, and an exact local restore", async () => {
  const holder = new Client({
    host: local().host,
    port: Number(local().port),
    user: roles.exporter,
    password: passwords.exporter,
    database: fixture.databaseName,
  })
  holder.on("error", () => {})
  await holder.connect()
  const dumpPath = join(directory, "database.dump")
  let manifest
  try {
    manifest = await exportConsistentSnapshot(holder, {
      fixture: synthetic,
      assertSession: assertLocalPrivilegedSession,
      runDump: async (snapshot, { exclusions }) => {
        assert.deepEqual(exclusions, recoveryDumpExclusions())
        const result = await runPostgresTool(
          pgDump,
          dumpArgs(dumpPath, [`--snapshot=${snapshot}`, ...exclusions]),
          {
            env: toolEnv(roles.exporter, passwords.exporter),
            timeout: 120_000,
          }
        )
        assert.equal(result.code, 0, `dump failed: ${result.failure}`)
        return {
          sha256: createHash("sha256")
            .update(await readFile(dumpPath))
            .digest("hex"),
          bytes: (await stat(dumpPath)).size,
        }
      },
    })
  } finally {
    await holder.end()
  }
  assert.equal(manifest.syntheticCoverage.length, 24)
  assert.equal(manifest.barrier.length, 21)
  assert.ok(manifest.rolesAndGrants.memberships.length > 0)
  // The counter exists in the snapshot and never blocks the export.
  assert.deepEqual(
    manifest.barrier.find((row) => row.relation === "public.rate_limit"),
    { relation: "public.rate_limit", total: "1", overdue: "0" }
  )
  assert.deepEqual(manifest.excludedTableData, ["public.rate_limit"])
  // The non-bypass reader's row-security dump succeeds but omits tenants.
  const partialPath = join(directory, "reader-row-security.dump")
  const partial = await runPostgresTool(
    pgDump,
    dumpArgs(partialPath, ["--enable-row-security"]),
    { env: toolEnv(roles.reader, passwords.reader) }
  )
  assert.equal(partial.code, 0)
  const compose = await readFile(
    new URL("../infra/compose.test.yml", import.meta.url),
    "utf8"
  )
  const result = await verifyRestoredExport({
    pgRestore,
    directory,
    manifest,
    partialDump: partialPath,
    compose,
  })
  assert.equal(result.fullRestoreVerified, true)
  assert.equal(result.matchedSyntheticRelations, 24)
  assert.equal(result.restoredRelationCounts, 21)
  assert.equal(result.partialDumpIncomplete, true)
  assert.equal(result.containerRemoved, true)
})

test("a dump that ignores the transient exclusion fails restore verification", async () => {
  const holder = new Client({
    host: local().host,
    port: Number(local().port),
    user: roles.exporter,
    password: passwords.exporter,
    database: fixture.databaseName,
  })
  holder.on("error", () => {})
  await holder.connect()
  const unsafeDirectory = await mkdtemp(
    join(tmpdir(), "nthawi-phase4-export-unsafe-it-")
  )
  const dumpPath = join(unsafeDirectory, "database.dump")
  let manifest
  try {
    manifest = await exportConsistentSnapshot(holder, {
      fixture: synthetic,
      assertSession: assertLocalPrivilegedSession,
      // Deliberately drops the reviewed exclusions.
      runDump: async (snapshot) => {
        const result = await runPostgresTool(
          pgDump,
          dumpArgs(dumpPath, [`--snapshot=${snapshot}`]),
          {
            env: toolEnv(roles.exporter, passwords.exporter),
            timeout: 120_000,
          }
        )
        assert.equal(result.code, 0, `dump failed: ${result.failure}`)
        return {
          sha256: createHash("sha256")
            .update(await readFile(dumpPath))
            .digest("hex"),
          bytes: (await stat(dumpPath)).size,
        }
      },
    })
  } finally {
    await holder.end()
  }
  const compose = await readFile(
    new URL("../infra/compose.test.yml", import.meta.url),
    "utf8"
  )
  try {
    await assert.rejects(
      verifyRestoredExport({
        pgRestore,
        directory: unsafeDirectory,
        manifest,
        compose,
      }),
      /NEON_EXPORT_RESTORED_COUNTS_MISMATCH/
    )
  } finally {
    await rm(unsafeDirectory, { recursive: true, force: true })
  }
})
