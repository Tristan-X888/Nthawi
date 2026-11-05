import { createRequire } from "node:module"
import { mkdir, open, stat } from "node:fs/promises"
import { isAbsolute, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import {
  assertNeonTestEnvironment,
  assertVerifiedNeonClient,
  hasDistinctPasswords,
  neonTestConnectionOptions,
} from "./neon-targets.mjs"
import {
  cleanupSyntheticFixtures,
  createSyntheticFixtures,
  insertSyntheticFixtures,
  protectedTables,
  syntheticInsert,
  syntheticPredicate,
} from "./neon-synthetic-fixtures.mjs"

const operations = new Set(["synthetic-isolation", "synthetic-export"])

function reject(code = "NEON_ACCEPTANCE_CONFIGURATION_INVALID") {
  throw new Error(code)
}

/** Offline guard: operation selection does not itself grant remote authority. */
export function assertNeonAcceptanceEnvironment(
  env,
  operation = "synthetic-isolation"
) {
  const target = assertNeonTestEnvironment(env)
  if (
    !operations.has(operation) ||
    env.NEON_EXPECTED_PROJECT_ID !== target.projectId ||
    env.NEON_ACCEPTANCE_CONFIRMATION !==
      `${operation}:${target.projectId}:${target.branchId}` ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(
      env.NEON_ACCEPTANCE_AUTHORIZATION_ID ?? ""
    ) ||
    env.NODE_TLS_REJECT_UNAUTHORIZED === "0"
  )
    reject()
  if (
    operation === "synthetic-isolation" &&
    (typeof env.NEON_ACCEPTANCE_EVIDENCE_DIRECTORY !== "string" ||
      !isAbsolute(env.NEON_ACCEPTANCE_EVIDENCE_DIRECTORY) ||
      env.NEON_ACCEPTANCE_EVIDENCE_DIRECTORY.split(/[\\/]/).includes(".anchor"))
  )
    reject()
  let url
  try {
    url = new URL(env.NEON_ACCEPTANCE_ADMIN_URL)
  } catch {
    reject()
  }
  let password
  try {
    password = decodeURIComponent(url.password)
  } catch {
    reject()
  }
  const params = [...url.searchParams.entries()]
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== target.host ||
    url.port !== "5432" ||
    url.pathname !== `/${target.database}` ||
    url.username !== "nthawi_export" ||
    !password ||
    password.includes("\0") ||
    url.hash ||
    params.length !== 1 ||
    params[0][0] !== "sslmode" ||
    params[0][1] !== "verify-full"
  )
    reject()
  // The privileged export login may not share a secret with any runtime or
  // migration role (the role URLs were validated above).
  const rolePasswords = [
    "DATABASE_MIGRATION_URL",
    "AUTH_DATABASE_URL",
    "DATABASE_URL",
    "JOBS_DATABASE_URL",
  ].map((name) => decodeURIComponent(new URL(env[name]).password))
  if (!hasDistinctPasswords([...rolePasswords, password])) reject()
  return target
}

export function neonAcceptanceAdminOptions(
  env,
  operation = "synthetic-isolation"
) {
  const target = assertNeonAcceptanceEnvironment(env, operation)
  const url = new URL(env.NEON_ACCEPTANCE_ADMIN_URL)
  return {
    host: target.host,
    port: 5432,
    database: target.database,
    user: "nthawi_export",
    password: decodeURIComponent(url.password),
    ssl: { rejectUnauthorized: true, servername: target.host },
    connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000,
    query_timeout: 20_000,
  }
}

/**
 * Proves the effective privileged role on this exact verified session.
 *
 * Observed on Neon (test branch, 2026-11-05): a Console/API-created login has
 * BYPASSRLS as its own attribute and reads all data through its inherited
 * neon_superuser membership, while SET ROLE neon_superuser is refused with
 * SQLSTATE XX000. Membership never confers BYPASSRLS, so the login's own
 * attribute is what is checked; no role switch is attempted.
 */
export async function assertPrivilegedAcceptanceSession(client) {
  assertVerifiedNeonClient(client)
  const session = (
    await client.query(
      `SELECT current_database() = 'neondb' AS database_matches, session_user = 'nthawi_export' AS login_matches, current_user = 'nthawi_export' AS current_matches, current_setting('server_version_num')::integer / 10000 = 18 AS version_matches, r.rolbypassrls AS bypasses_rls, NOT r.rolsuper AS not_superuser, pg_has_role(current_user, 'pg_read_all_data', 'USAGE') AS reads_all_data FROM pg_roles r WHERE r.rolname = current_user`
    )
  ).rows[0]
  if (
    !session ||
    [
      "database_matches",
      "login_matches",
      "current_matches",
      "version_matches",
    ].some((name) => session[name] !== true)
  )
    reject("NEON_ACCEPTANCE_OPERATOR_REJECTED")
  if (
    session.bypasses_rls !== true ||
    session.not_superuser !== true ||
    session.reads_all_data !== true
  )
    reject("NEON_ACCEPTANCE_PRIVILEGED_ROLE_UNAVAILABLE")
}

/**
 * Evidence only: records whether the provider permits switching into
 * neon_superuser. Never relied on for access. Runs outside any transaction.
 */
export async function probeNeonSuperuserSwitch(client) {
  try {
    await client.query("SET ROLE neon_superuser")
    await client.query("RESET ROLE")
    return { switchAvailable: true, sqlstate: null }
  } catch (error) {
    return {
      switchAvailable: false,
      sqlstate: /^[A-Z0-9]{5}$/.test(error?.code ?? "") ? error.code : null,
    }
  }
}

export class NeonIsolationError extends Error {
  constructor(stage, runId, cleanupCompleted, evidenceDirectory) {
    super("NEON_SYNTHETIC_ISOLATION_FAILED")
    this.stage = stage
    this.runId = runId
    this.cleanupCompleted = cleanupCompleted
    this.evidenceDirectory = evidenceDirectory
  }
}

async function durableJson(filename, payload) {
  const handle = await open(filename, "wx", 0o600)
  try {
    await handle.writeFile(`${JSON.stringify(payload, null, 2)}\n`)
    await handle.sync()
  } finally {
    await handle.close()
  }
}

/** Save only generated fixture keys, before connecting or writing any row. */
export async function persistIsolationAttempt(env, target, fixture) {
  const parent = env.NEON_ACCEPTANCE_EVIDENCE_DIRECTORY
  if (!(await stat(parent)).isDirectory()) reject()
  const directory = join(parent, `isolation-${fixture.runId}`)
  await mkdir(directory, { mode: 0o700 })
  const attempt = {
    version: "phase4-synthetic-isolation-attempt-v1",
    complete: false,
    operation: "synthetic-isolation",
    createdAt: new Date().toISOString(),
    authorizationId: env.NEON_ACCEPTANCE_AUTHORIZATION_ID,
    target,
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
  }
  await durableJson(join(directory, "attempt.json"), attempt)
  return {
    directory,
    finish: (result) => durableJson(join(directory, "result.json"), result),
  }
}

async function context(client, tenant) {
  await client.query(
    "SELECT set_config('app.owner_id', $1, true), set_config('app.workspace_id', $2, true)",
    [tenant?.ownerId ?? "", tenant?.workspaceId ?? ""]
  )
}

async function transaction(client, tenant, callback, commit = false) {
  await client.query("BEGIN")
  try {
    await context(client, tenant)
    const result = await callback()
    await client.query(commit ? "COMMIT" : "ROLLBACK")
    return result
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  }
}

function requireCount(result, expected) {
  if (result.rows[0]?.count !== expected) reject("NEON_SYNTHETIC_RLS_MISMATCH")
}

async function countRow(client, table, tenant) {
  const predicate = syntheticPredicate(table, tenant)
  return client.query(
    `SELECT count(*)::integer AS count FROM public."${table}" WHERE ${predicate.text}`,
    predicate.values
  )
}

async function denied(client, statement, values) {
  try {
    await client.query(statement, values)
  } catch (error) {
    if (error?.code === "42501") return
    throw error
  }
  reject("NEON_SYNTHETIC_PERMISSION_EXPECTED")
}

async function assertRuntimeSession(client, role) {
  assertVerifiedNeonClient(client)
  const row = (
    await client.query(
      `SELECT current_database() = 'neondb' AS database_matches, current_user = $1 AND session_user = $1 AS login_matches, NOT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication OR rolinherit) AND rolcanlogin AS safe_flags, NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member = r.oid) AS no_memberships FROM pg_roles r WHERE rolname = current_user`,
      [role]
    )
  ).rows[0]
  if (
    !row ||
    ["database_matches", "login_matches", "safe_flags", "no_memberships"].some(
      (name) => row[name] !== true
    )
  )
    reject("NEON_SYNTHETIC_RUNTIME_ROLE_UNSAFE")
}

async function affected(client, statement, predicate) {
  return (
    await client.query(`${statement} WHERE ${predicate.text}`, predicate.values)
  ).rowCount
}

/**
 * Forced-RLS isolation for the business runtime role on every protected
 * table: same-tenant read, update and delete; no cross-tenant or no-context
 * read, update, delete or insert. Every write runs in a rolled-back
 * transaction, so fixture rows are unchanged afterwards.
 */
export async function verifyTenantIsolation(client, own, other) {
  for (const table of protectedTables) {
    const column = table === "workspaces" ? "name" : "workspace_id"
    const touch = `UPDATE public."${table}" SET "${column}" = "${column}"`
    const remove = `DELETE FROM public."${table}"`
    const ownWhere = syntheticPredicate(table, own)
    const otherWhere = syntheticPredicate(table, other)
    await transaction(client, own, async () => {
      requireCount(await countRow(client, table, own), 1)
      requireCount(await countRow(client, table, other), 0)
      if ((await affected(client, touch, ownWhere)) !== 1)
        reject("NEON_SYNTHETIC_POSITIVE_WRITE_FAILED")
      if ((await affected(client, touch, otherWhere)) !== 0)
        reject("NEON_SYNTHETIC_CROSS_WRITE_ALLOWED")
      // workspaces has no runtime DELETE grant; that refusal is checked below.
      if (
        table !== "workspaces" &&
        (await affected(client, remove, otherWhere)) !== 0
      )
        reject("NEON_SYNTHETIC_CROSS_WRITE_ALLOWED")
    })
    await transaction(client, own, async () => {
      if (table === "workspaces")
        await denied(
          client,
          `${remove} WHERE ${ownWhere.text}`,
          ownWhere.values
        )
      else if ((await affected(client, remove, ownWhere)) !== 1)
        reject("NEON_SYNTHETIC_POSITIVE_WRITE_FAILED")
    })
    await transaction(client, null, async () => {
      requireCount(await countRow(client, table, own), 0)
      requireCount(await countRow(client, table, other), 0)
      if ((await affected(client, touch, ownWhere)) !== 0)
        reject("NEON_SYNTHETIC_CROSS_WRITE_ALLOWED")
      if (
        table !== "workspaces" &&
        (await affected(client, remove, ownWhere)) !== 0
      )
        reject("NEON_SYNTHETIC_CROSS_WRITE_ALLOWED")
    })
    // Each deliberately failed INSERT runs in its own rolled-back transaction.
    await transaction(client, own, async () => {
      const insert = syntheticInsert(table, other.rows.get(table))
      await denied(client, insert.text, insert.values)
    })
    await transaction(client, null, async () => {
      const insert = syntheticInsert(table, own.rows.get(table))
      await denied(client, insert.text, insert.values)
    })
  }
}

/** Context set with set_config(..., true) must not survive its transaction. */
export async function verifyTransactionLocalContext(client, tenant) {
  await transaction(client, tenant, async () => {}, true)
  for (const table of protectedTables)
    requireCount(await countRow(client, table, tenant), 0)
}

/** A runtime write that is rolled back must leave the committed row intact. */
export async function verifyRollbackIsolation(client, reader, tenant) {
  const predicate = syntheticPredicate("workspaces", tenant)
  await transaction(client, tenant, async () => {
    if (
      (await affected(
        client,
        `UPDATE public.workspaces SET name = 'synthetic-rollback-probe'`,
        predicate
      )) !== 1
    )
      reject("NEON_SYNTHETIC_POSITIVE_WRITE_FAILED")
  })
  const restored = (
    await reader.query(
      "SELECT name FROM public.workspaces WHERE id = $1::uuid",
      [tenant.workspaceId]
    )
  ).rows[0]
  if (restored?.name !== tenant.rows.get("workspaces").name)
    reject("NEON_SYNTHETIC_ROLLBACK_FAILED")
}

export async function verifyRestrictedProfile(client, fixture) {
  for (const tenant of [null, ...fixture.tenants]) {
    for (const table of protectedTables) {
      await transaction(client, tenant, () =>
        denied(client, `SELECT 1 FROM public."${table}" WHERE false`)
      )
    }
  }
}

/**
 * Writes only fresh synthetic rows on the registered test target. The caller
 * must obtain specific lifecycle/write authority before invoking this function.
 * Inject createClient for deterministic offline guard/cleanup failure tests.
 */
export async function runNeonLiveIsolation(env, dependencies = {}) {
  const target = assertNeonAcceptanceEnvironment(env)
  const fixture = createSyntheticFixtures()
  let evidence
  try {
    evidence = await (dependencies.persistAttempt ?? persistIsolationAttempt)(
      env,
      target,
      fixture
    )
  } catch {
    throw new NeonIsolationError("attempt-evidence", fixture.runId, true)
  }
  const clients = []
  let stage = "connect-operator"
  let admin
  let fixturesAttempted = false
  let cleanupCompleted = false
  let failure
  const createClient =
    dependencies.createClient ??
    ((options) => {
      const { Client } = createRequire(
        new URL("../packages/db/package.json", import.meta.url)
      )("pg")
      return new Client(options)
    })
  const open = async (options) => {
    const client = createClient(options)
    clients.push(client)
    client.on?.("error", () => {})
    await client.connect()
    assertVerifiedNeonClient(client)
    return client
  }
  try {
    admin = await open(neonAcceptanceAdminOptions(env))
    stage = "operator-privilege"
    await assertPrivilegedAcceptanceSession(admin)
    stage = "catalog-coverage"
    const catalog = (
      await admin.query(
        `SELECT relname AS name, relrowsecurity AS enabled, relforcerowsecurity AS forced FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r','p') AND (relrowsecurity OR relforcerowsecurity) ORDER BY relname`
      )
    ).rows
    if (
      catalog.length !== protectedTables.length ||
      catalog.some(
        (row) =>
          !protectedTables.includes(row.name) ||
          row.enabled !== true ||
          row.forced !== true
      )
    )
      reject("NEON_SYNTHETIC_TABLE_COVERAGE_CHANGED")
    stage = "create-fixtures"
    // A lost COMMIT response is ambiguous: cleanup must still prove absence.
    fixturesAttempted = true
    await admin.query("BEGIN")
    try {
      await insertSyntheticFixtures(admin, fixture)
      await admin.query("COMMIT")
    } catch (error) {
      await admin.query("ROLLBACK").catch(() => {})
      throw error
    }
    const profiles = [
      ["business", "DATABASE_URL", "nthawi_business"],
      ["businessConcurrent", "DATABASE_URL", "nthawi_business"],
      ["auth", "AUTH_DATABASE_URL", "nthawi_auth"],
      ["jobs", "JOBS_DATABASE_URL", "nthawi_jobs"],
    ]
    const runtime = {}
    for (const [kind, variable, role] of profiles) {
      stage = `runtime-login:${kind}`
      runtime[kind] = await open({
        ...neonTestConnectionOptions(env, variable),
        statement_timeout: 15_000,
        query_timeout: 20_000,
      })
      await assertRuntimeSession(runtime[kind], role)
    }
    stage = "business-isolation-reuse"
    // The same session serves both tenants in turn: no context may persist.
    await verifyTenantIsolation(
      runtime.business,
      fixture.tenants[0],
      fixture.tenants[1]
    )
    await verifyTenantIsolation(
      runtime.business,
      fixture.tenants[1],
      fixture.tenants[0]
    )
    stage = "business-concurrency"
    const concurrent = await Promise.allSettled([
      verifyTenantIsolation(
        runtime.business,
        fixture.tenants[0],
        fixture.tenants[1]
      ),
      verifyTenantIsolation(
        runtime.businessConcurrent,
        fixture.tenants[1],
        fixture.tenants[0]
      ),
    ])
    if (concurrent.some((result) => result.status === "rejected"))
      reject("NEON_SYNTHETIC_CONCURRENCY_FAILED")
    stage = "transaction-local-context"
    await verifyTransactionLocalContext(runtime.business, fixture.tenants[0])
    stage = "rollback-proof"
    await verifyRollbackIsolation(runtime.business, admin, fixture.tenants[0])
    stage = "auth-profile"
    await runtime.auth.query('SELECT 1 FROM public."user" WHERE false')
    await verifyRestrictedProfile(runtime.auth, fixture)
    stage = "jobs-profile"
    // The jobs role has no grants until the Phase 8 worker reviews them.
    await verifyRestrictedProfile(runtime.jobs, fixture)
  } catch {
    failure = stage
  } finally {
    if (admin && fixturesAttempted) {
      try {
        await admin.query("ROLLBACK")
        await cleanupSyntheticFixtures(admin, fixture)
        cleanupCompleted = true
      } catch {
        failure = "fixture-cleanup"
      }
    } else cleanupCompleted = true
    const closed = await Promise.allSettled(
      clients.map((client) => Promise.resolve().then(() => client.end()))
    )
    if (closed.some((result) => result.status === "rejected"))
      failure ??= "connection-cleanup"
  }
  const result = {
    status: failure ? "failed" : "passed",
    observedUtc: new Date().toISOString(),
    operation: "synthetic-isolation",
    authorizationId: env.NEON_ACCEPTANCE_AUTHORIZATION_ID,
    projectId: target.projectId,
    branchId: target.branchId,
    runId: fixture.runId,
    provenance: "fresh-synthetic-only",
    // Failed attempts must not present planned checks as completed evidence.
    ...(failure
      ? { checksCompleted: false }
      : {
          tables: [...protectedTables],
          tenants: 2,
          fixtureRows: 24,
          runtimeRoles: ["nthawi_business", "nthawi_auth", "nthawi_jobs"],
          reuse: true,
          concurrency: true,
          rollback: true,
        }),
    cleanupCompleted,
    evidenceDirectory: evidence.directory,
  }
  try {
    await evidence.finish({ ...result, stage: failure, complete: !failure })
  } catch {
    failure ??= "result-evidence"
  }
  if (failure)
    throw new NeonIsolationError(
      failure,
      fixture.runId,
      cleanupCompleted,
      evidence.directory
    )
  return result
}

const isCommand =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isCommand) {
  try {
    if (process.argv.length !== 2) reject()
    console.log(JSON.stringify(await runNeonLiveIsolation(process.env)))
  } catch (error) {
    console.error(
      JSON.stringify({
        status: "failed",
        code:
          error instanceof NeonIsolationError
            ? error.message
            : "NEON_ACCEPTANCE_CONFIGURATION_INVALID",
        stage:
          error instanceof NeonIsolationError ? error.stage : "configuration",
        runId: error instanceof NeonIsolationError ? error.runId : undefined,
        cleanupCompleted:
          error instanceof NeonIsolationError
            ? error.cleanupCompleted
            : undefined,
        evidenceDirectory:
          error instanceof NeonIsolationError
            ? error.evidenceDirectory
            : undefined,
      })
    )
    process.exitCode = 1
  }
}
