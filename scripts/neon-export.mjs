import { createHash, randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import { createReadStream } from "node:fs"
import { mkdir, open, readFile, stat } from "node:fs/promises"
import { createRequire } from "node:module"
import { isAbsolute, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { schemaManifest } from "../packages/db/dist/schema-manifest.js"
import {
  assertClassificationCurrent,
  assertExportCatalog,
  exportCatalogSql,
  inspectContentBarrier,
  recoveryDumpExclusions,
  transientRelations,
} from "./neon-content-barrier.mjs"
import {
  assertNeonAcceptanceEnvironment,
  assertPrivilegedAcceptanceSession,
  neonAcceptanceAdminOptions,
  probeNeonSuperuserSwitch,
} from "./neon-live-isolation.mjs"
import {
  canonicalRecoveryJson,
  recoveryPolicy,
} from "./neon-recovery-contract.mjs"
import {
  cleanupSyntheticFixtures,
  createSyntheticFixtures,
  insertSyntheticFixtures,
} from "./neon-synthetic-fixtures.mjs"
import { neonTestConnectionOptions } from "./neon-targets.mjs"
import { verifyRestoredExport } from "./neon-export-restore.mjs"
import {
  assertExtensionInventory,
  assertMigrationLedger,
  captureSyntheticCoverage,
  extensionSql,
  migrationLedgerSql,
} from "./neon-export-verification.mjs"

// Shared checks live in neon-export-verification.mjs so the restore module
// never imports this entry point (a cycle deadlocks top-level await).
export {
  assertExtensionCompatibility,
  assertExtensionInventory,
  assertMigrationLedger,
  assertRestoredCounts,
  captureSyntheticCoverage,
  compareRestoredSyntheticCoverage,
  extensionSql,
  migrationLedgerSql,
  readRelationCounts,
} from "./neon-export-verification.mjs"

// Phase 4 export proof (P3-D15 checkpoint protocol, steps 1-2). Runs only on
// the registered test branch with fresh synthetic tenants. It proves the
// privileged export path and the pre-export barrier; it is not the Phase 5
// recovery job and it never uploads anything.

function reject(code = "NEON_EXPORT_REJECTED") {
  throw new Error(code)
}
const sha256 = (value) => createHash("sha256").update(value).digest("hex")

// Roles and grants are not part of a single-database pg_dump (PG-01), so they
// are captured separately. Password verifiers are never selected.
const rolesAndGrantsQueries = Object.freeze({
  roles: `SELECT rolname AS name, rolsuper AS superuser, rolinherit AS inherit, rolcreaterole AS create_role,
    rolcreatedb AS create_db, rolcanlogin AS login, rolreplication AS replication, rolbypassrls AS bypass_rls,
    rolconnlimit AS connection_limit, rolvaliduntil IS NOT NULL AS expires
    FROM pg_roles WHERE rolname !~ '^pg_' ORDER BY rolname`,
  memberships: `SELECT r.rolname AS role, m.rolname AS member, g.rolname AS grantor,
    am.admin_option, am.inherit_option, am.set_option
    FROM pg_auth_members am JOIN pg_roles r ON r.oid = am.roleid JOIN pg_roles m ON m.oid = am.member
    LEFT JOIN pg_roles g ON g.oid = am.grantor WHERE m.rolname !~ '^pg_' ORDER BY r.rolname, m.rolname`,
  database: `SELECT datname AS name, pg_get_userbyid(datdba) AS owner, datacl::text AS acl
    FROM pg_database WHERE datname = current_database()`,
  namespaces: `SELECT nspname AS name, pg_get_userbyid(nspowner) AS owner, nspacl::text AS acl
    FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema' ORDER BY nspname`,
  relations: `SELECT n.nspname AS schema, c.relname AS name, c.relkind AS kind, pg_get_userbyid(c.relowner) AS owner,
    c.relacl::text AS acl FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'app_private', 'drizzle', 'pgboss') AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
    ORDER BY n.nspname, c.relname`,
  columns: `SELECT n.nspname AS schema, c.relname AS relation, a.attname AS name, a.attacl::text AS acl
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE a.attacl IS NOT NULL AND a.attnum > 0 AND NOT a.attisdropped
    AND n.nspname IN ('public', 'app_private', 'drizzle', 'pgboss') ORDER BY 1, 2, 3`,
  defaultPrivileges: `SELECT pg_get_userbyid(d.defaclrole) AS role, n.nspname AS schema, d.defaclobjtype AS kind,
    d.defaclacl::text AS acl FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
    ORDER BY 1, 2, 3`,
  functions: `SELECT n.nspname AS schema, p.proname AS name, pg_get_userbyid(p.proowner) AS owner,
    p.proacl::text AS acl, p.prosecdef AS security_definer FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'app_private', 'drizzle', 'pgboss')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
    ORDER BY 1, 2`,
  policies: `SELECT schemaname AS schema, tablename AS relation, policyname AS name, cmd AS command,
    permissive, roles::text[] AS roles, qual AS using, with_check AS check
    FROM pg_policies ORDER BY 1, 2, 3`,
})

export async function captureRolesAndGrants(client) {
  const capture = {}
  for (const [name, text] of Object.entries(rolesAndGrantsQueries))
    capture[name] = (await client.query(text)).rows
  return capture
}

const journalWatermarkSql =
  "SELECT count(*)::text AS entries, max(deleted_at) AS latest FROM public.deletion_journal"

/**
 * One privileged snapshot: the holder session first proves its effective
 * role bypasses row security (the export login's own BYPASSRLS on Neon), then
 * the catalog, extensions, migration ledger, content barrier, journal
 * watermark, synthetic coverage and role/grant capture are all read from that
 * exported snapshot BEFORE pg_dump starts. pg_dump logs in as the same role.
 */
export async function exportConsistentSnapshot(
  client,
  {
    fixture,
    runDump,
    now = () => new Date(),
    manifest = schemaManifest,
    assertSession = assertPrivilegedAcceptanceSession,
  }
) {
  assertClassificationCurrent(manifest)
  let transaction = false
  let primaryError
  try {
    await assertSession(client)
    await client.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
    )
    transaction = true
    // Default pg_dump behaviour: a row hidden by RLS raises an error.
    await client.query("SET LOCAL row_security = off")
    await client.query("SET LOCAL timezone = 'UTC'")
    await client.query("SET LOCAL statement_timeout = '30s'")
    const snapshot = (
      await client.query(
        "SELECT pg_export_snapshot() AS snapshot, transaction_timestamp() AS at"
      )
    ).rows[0]
    if (!/^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+$/.test(snapshot?.snapshot ?? ""))
      reject("NEON_EXPORT_SNAPSHOT_INVALID")
    const snapshotAt = new Date(snapshot.at).toISOString()
    const catalogSha256 = assertExportCatalog(
      manifest,
      (await client.query(exportCatalogSql)).rows
    )
    const extensions = assertExtensionInventory(
      (await client.query(extensionSql)).rows
    )
    const migrations = assertMigrationLedger(
      (await client.query(migrationLedgerSql)).rows,
      manifest
    )
    const barrier = await inspectContentBarrier(client, snapshotAt, {
      manifest,
    })
    const watermark = (await client.query(journalWatermarkSql)).rows[0]
    const syntheticCoverage = await captureSyntheticCoverage(client, fixture)
    const rolesAndGrants = JSON.parse(
      JSON.stringify(await captureRolesAndGrants(client))
    )
    const rolesAndGrantsSha256 = sha256(canonicalRecoveryJson(rolesAndGrants))
    // Transient counters are excluded by reviewed classification (P4-D09);
    // the restore check then requires those tables to restore empty.
    const dump = await runDump(snapshot.snapshot, {
      exclusions: recoveryDumpExclusions(),
    })
    if (
      now().getTime() - Date.parse(snapshotAt) >
      recoveryPolicy.checkpointDeadlineMs
    )
      reject("NEON_EXPORT_DEADLINE_EXCEEDED")
    return {
      version: "phase4-synthetic-export-v3",
      snapshotAt,
      catalogSha256,
      extensions,
      migrations,
      barrier,
      excludedTableData: [...transientRelations],
      journalWatermark: {
        entries: watermark?.entries ?? null,
        latest: watermark?.latest
          ? new Date(watermark.latest).toISOString()
          : null,
      },
      syntheticCoverage,
      rolesAndGrants,
      rolesAndGrantsSha256,
      dumpSha256: dump.sha256,
      dumpBytes: dump.bytes,
      restoredCopyVerified: false,
      independentRecoveryOperational: false,
    }
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    if (transaction) {
      try {
        await client.query("ROLLBACK")
      } catch {
        if (!primaryError) reject("NEON_EXPORT_SNAPSHOT_CLEANUP_FAILED")
      }
    }
  }
}

// Diagnostics can contain object names, credentials or row content, so only a
// coarse class leaves memory.
export function classifyToolFailure(text) {
  const value = typeof text === "string" ? text : ""
  if (/row-level security/i.test(value)) return "row-security-blocked"
  if (/permission denied/i.test(value)) return "permission-denied"
  if (/authentication failed/i.test(value)) return "authentication-failed"
  return "other-failure"
}

export function runPostgresTool(
  program,
  args,
  { env, timeout = 30_000, signal, captureStdout = false } = {}
) {
  return new Promise((resolveRun, rejectRun) => {
    let child
    try {
      child = spawn(program, args, {
        env,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        timeout,
        signal,
      })
    } catch {
      rejectRun(new Error("NEON_EXPORT_TOOL_UNAVAILABLE"))
      return
    }
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (data) => {
      if (captureStdout) stdout = (stdout + data.toString()).slice(0, 4096)
    })
    child.stderr.on("data", (data) => {
      stderr = (stderr + data.toString()).slice(-65_536)
    })
    child.once("error", () =>
      rejectRun(new Error("NEON_EXPORT_TOOL_UNAVAILABLE"))
    )
    child.once("close", (code) => {
      const failure = code === 0 ? null : classifyToolFailure(stderr)
      stderr = ""
      resolveRun({ code: code ?? -1, stdout, failure })
    })
  })
}

async function requirePostgres18Tool(program, env) {
  const result = await runPostgresTool(program, ["--version"], {
    env,
    captureStdout: true,
  })
  if (
    result.code !== 0 ||
    !/^(pg_dump|pg_restore) \(PostgreSQL\) 18(?:\.|\s)/.test(result.stdout)
  )
    reject("NEON_EXPORT_POSTGRES_18_REQUIRED")
  return result.stdout.trim()
}

async function fileSha256(path) {
  const digest = createHash("sha256")
  for await (const bytes of createReadStream(path)) digest.update(bytes)
  return { sha256: digest.digest("hex"), bytes: (await stat(path)).size }
}

async function writePrivateJson(path, value) {
  const handle = await open(path, "wx", 0o600)
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`)
    await handle.sync()
  } finally {
    await handle.close()
  }
}

function toolEnvironment({ host, database, user, password, caFile }) {
  return {
    SystemRoot: process.env.SystemRoot,
    PATH: process.env.PATH,
    PGHOST: host,
    PGPORT: "5432",
    PGDATABASE: database,
    PGUSER: user,
    PGPASSWORD: password,
    PGSSLMODE: "verify-full",
    PGSSLROOTCERT: caFile,
    PGCONNECT_TIMEOUT: "15",
    PGAPPNAME: "nthawi-phase4-export",
  }
}

const dumpArgs = (target, user, file, extra = []) => [
  "--no-password",
  "--host",
  target.host,
  "--port",
  "5432",
  "--username",
  user,
  "--dbname",
  target.database,
  ...extra,
  "--format=custom",
  `--file=${file}`,
]

/**
 * Negative evidence: no restricted runtime role may produce an all-tenant
 * dump under default row_security=off. (The partial-dump hazard of
 * --enable-row-security is proven with a non-bypass reader in the local
 * integration test; on Neon every Console/API login has BYPASSRLS itself.)
 */
export async function runNegativeExports({
  env,
  target,
  pgDump,
  caFile,
  directory,
  run = runPostgresTool,
}) {
  const attempts = [
    ["business-runtime-role", "DATABASE_URL"],
    ["auth-runtime-role", "AUTH_DATABASE_URL"],
    ["jobs-runtime-role", "JOBS_DATABASE_URL"],
  ].map(([name, variable]) => {
    const options = neonTestConnectionOptions(env, variable)
    return { name, user: options.user, password: options.password }
  })
  const results = []
  for (const attempt of attempts) {
    const file = join(directory, `${attempt.name}.dump`)
    const result = await run(pgDump, dumpArgs(target, attempt.user, file), {
      env: toolEnvironment({ ...target, ...attempt, caFile }),
      timeout: recoveryPolicy.checkpointDeadlineMs,
    })
    if (result.code === 0) reject("NEON_EXPORT_RESTRICTED_DUMP_SUCCEEDED")
    // A wrong password, unavailable endpoint, timeout or tool failure says
    // nothing about the authenticated role's data boundary.
    if (!["row-security-blocked", "permission-denied"].includes(result.failure))
      reject("NEON_EXPORT_RESTRICTED_DUMP_EVIDENCE_INVALID")
    results.push({
      name: attempt.name,
      role: attempt.user,
      exitCode: result.code,
      failure: result.failure,
    })
  }
  return results
}

async function createExportClient(options) {
  const { Client } = createRequire(
    new URL("../packages/db/package.json", import.meta.url)
  )("pg")
  const client = new Client({ ...options, query_timeout: 35_000 })
  client.on("error", () => {})
  return client
}

/** Live synthetic export on the registered test branch only. */
export async function runSyntheticExport(
  env,
  { outputDirectory, pgDump, pgRestore, caFile, verifyRestore }
) {
  const target = assertNeonAcceptanceEnvironment(env, "synthetic-export")
  if (
    ![outputDirectory, pgDump, pgRestore, caFile].every(
      (path) => typeof path === "string" && isAbsolute(path)
    ) ||
    outputDirectory.split(/[\\/]/).includes(".anchor")
  )
    reject()
  if (
    !(await stat(caFile)).isFile() ||
    !(await stat(outputDirectory)).isDirectory()
  )
    reject()
  assertClassificationCurrent(schemaManifest)
  const options = neonAcceptanceAdminOptions(env, "synthetic-export")
  const exportEnv = toolEnvironment({
    ...target,
    user: "nthawi_export",
    password: options.password,
    caFile,
  })
  const tools = {
    pgDump: await requirePostgres18Tool(pgDump, exportEnv),
    pgRestore: await requirePostgres18Tool(pgRestore, {
      SystemRoot: process.env.SystemRoot,
      PATH: process.env.PATH,
    }),
  }
  const fixture = createSyntheticFixtures()
  const runId = randomUUID()
  const directory = join(outputDirectory, `phase4-export-${runId}`)
  await mkdir(directory, { mode: 0o700 })
  // Generated keys are durable before any connection or fixture write, so an
  // interrupted run can be reconciled without touching other rows.
  await writePrivateJson(join(directory, "attempt.json"), {
    version: "phase4-synthetic-export-attempt-v2",
    complete: false,
    createdAt: new Date().toISOString(),
    authorizationId: env.NEON_ACCEPTANCE_AUTHORIZATION_ID,
    target,
    tools,
    fixtureRunId: fixture.runId,
    fixtureKeys: fixture.tenants.map((tenant) => ({
      workspaceId: tenant.workspaceId,
      ownerId: tenant.ownerId,
      rows: Object.fromEntries(
        [...tenant.rows].map(([table, row]) => [
          table,
          table === "monthly_usage"
            ? { workspace_id: row.workspace_id, period: row.period }
            : { id: row.id },
        ])
      ),
    })),
  })
  const client = await createExportClient(options)
  const cancellation = new AbortController()
  // A lost snapshot holder must stop a dump that relies on its snapshot.
  client.on("error", () => cancellation.abort())
  let seeded = false
  let manifest
  let negatives
  let roleSwitch
  let failureStage = "connect"
  const cleanup = {
    fixtureRunId: fixture.runId,
    connectionEstablished: false,
    fixtureWriteAttempted: false,
    cleanupVerified: false,
  }
  try {
    await client.connect()
    cleanup.connectionEstablished = true
    failureStage = "privilege"
    await assertPrivilegedAcceptanceSession(client)
    // Evidence only: the Phase 3 SET ROLE design is not available on Neon.
    roleSwitch = await probeNeonSuperuserSwitch(client)
    failureStage = "seed"
    seeded = true
    cleanup.fixtureWriteAttempted = true
    await client.query("BEGIN")
    try {
      await insertSyntheticFixtures(client, fixture)
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {})
      throw error
    }
    failureStage = "snapshot-export"
    const dumpPath = join(directory, "database.dump")
    manifest = await exportConsistentSnapshot(client, {
      fixture,
      runDump: async (snapshot, { exclusions }) => {
        // Same login as the verified holder, so the same effective role.
        const result = await runPostgresTool(
          pgDump,
          dumpArgs(target, "nthawi_export", dumpPath, [
            `--snapshot=${snapshot}`,
            ...exclusions,
          ]),
          {
            env: exportEnv,
            timeout: recoveryPolicy.checkpointDeadlineMs,
            signal: cancellation.signal,
          }
        )
        if (result.code !== 0)
          reject(`NEON_EXPORT_DUMP_FAILED:${result.failure}`)
        return fileSha256(dumpPath)
      },
    })
    await writePrivateJson(join(directory, "roles-and-grants.json"), {
      snapshotAt: manifest.snapshotAt,
      sha256: manifest.rolesAndGrantsSha256,
      capture: manifest.rolesAndGrants,
    })
    failureStage = "negative-exports"
    negatives = await runNegativeExports({
      env,
      target,
      pgDump,
      caFile,
      directory,
    })
    await writePrivateJson(join(directory, "negative-exports.json"), negatives)
  } catch (error) {
    error.stage ??= failureStage
    error.evidenceDirectory = directory
    throw error
  } finally {
    // Remove synthetic rows from Neon before the slower local restore.
    if (seeded) {
      try {
        await client.query("ROLLBACK").catch(() => {})
        await assertPrivilegedAcceptanceSession(client)
        await cleanupSyntheticFixtures(client, fixture)
        cleanup.cleanupVerified = true
      } catch {
        cleanup.cleanupVerified = false
      }
    } else cleanup.cleanupVerified = true
    // Even a rejected connect can leave a partially initialized socket.
    try {
      await client.end()
    } catch {
      cleanup.cleanupVerified = false
    }
    cleanup.observedAt = new Date().toISOString()
    await writePrivateJson(join(directory, "cleanup.json"), cleanup).catch(
      () => {
        cleanup.cleanupVerified = false
      }
    )
  }
  if (!cleanup.cleanupVerified) {
    const error = new Error("NEON_EXPORT_FIXTURE_CLEANUP_FAILED")
    error.evidenceDirectory = directory
    throw error
  }
  // The role/grant capture is kept in its own private file, referenced by hash.
  // eslint-disable-next-line no-unused-vars
  const { rolesAndGrants, ...manifestWithoutCapture } = manifest
  const restore = await verifyRestore({
    pgRestore,
    directory,
    manifest: manifestWithoutCapture,
  })
  const finalManifest = {
    ...manifestWithoutCapture,
    target,
    fixtureRunId: fixture.runId,
    effectiveRole: {
      login: "nthawi_export",
      ownBypassRls: true,
      readsAllData: true,
      neonSuperuserSwitch: roleSwitch,
    },
    negativeExports: negatives,
    restore,
    restoredCopyVerified: restore.fullRestoreVerified === true,
  }
  await writePrivateJson(join(directory, "manifest.json"), finalManifest)
  return { directory, manifest: finalManifest }
}

const isCommand =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isCommand) {
  try {
    if (process.argv.length !== 6) reject()
    const compose = await readFile(
      new URL("../infra/compose.test.yml", import.meta.url),
      "utf8"
    )
    const result = await runSyntheticExport(process.env, {
      outputDirectory: process.argv[2],
      pgDump: process.argv[3],
      pgRestore: process.argv[4],
      caFile: process.argv[5],
      verifyRestore: (input) => verifyRestoredExport({ ...input, compose }),
    })
    const m = result.manifest
    console.log(
      [
        "NEON_SYNTHETIC_EXPORT_PASSED",
        `snapshot_at=${m.snapshotAt}`,
        `relations=${m.barrier.length}`,
        `synthetic_relations=${m.syntheticCoverage.length}`,
        `dump_bytes=${m.dumpBytes}`,
        `set_role_neon_superuser=${m.effectiveRole.neonSuperuserSwitch.switchAvailable ? "available" : `refused:${m.effectiveRole.neonSuperuserSwitch.sqlstate}`}`,
        `negative_exports=${m.negativeExports.map((entry) => `${entry.name}:${entry.failure}`).join(",")}`,
        `restore_verified=${m.restoredCopyVerified}`,
        `restored_relations=${m.restore.restoredRelationCounts}`,
        `restored_synthetic_rows=${m.restore.matchedSyntheticRelations}`,
      ].join(" ")
    )
    console.log(`Evidence directory: ${result.directory}`)
  } catch (error) {
    console.error(
      `NEON_SYNTHETIC_EXPORT_FAILED code=${/^[A-Z0-9_:-]{1,80}$/.test(error?.message ?? "") ? error.message : "UNEXPECTED"} stage=${/^[a-z-]{1,40}$/.test(error?.stage ?? "") ? error.stage : "unknown"}`
    )
    if (error?.evidenceDirectory)
      console.error(`Evidence directory: ${error.evidenceDirectory}`)
    process.exitCode = 1
  }
}
