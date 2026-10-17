import { resolve } from "node:path"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import {
  assertNeonTestEnvironment,
  assertVerifiedNeonClient,
  neonTestConnectionOptions,
  resolveNeonTarget,
  withVerifiedNeonClient,
} from "./neon-targets.mjs"

const TARGET_DATABASE = "neondb"
const TARGET_VERSION = 18

const CONNECTION_TIMEOUT_MS = 10_000
const QUERY_TIMEOUT_MS = 15_000
const STATEMENT_TIMEOUT_MS = 15_000

const PROFILES = Object.freeze([
  {
    kind: "migrator",
    variable: "DATABASE_MIGRATION_URL",
    roleVariable: "DATABASE_MIGRATOR_ROLE",
    role: "nthawi_migrator",
  },
  {
    kind: "auth",
    variable: "AUTH_DATABASE_URL",
    roleVariable: "DATABASE_AUTH_ROLE",
    role: "nthawi_auth",
  },
  {
    kind: "business",
    variable: "DATABASE_URL",
    roleVariable: "DATABASE_BUSINESS_ROLE",
    role: "nthawi_business",
  },
  {
    kind: "jobs",
    variable: "JOBS_DATABASE_URL",
    roleVariable: "DATABASE_JOBS_ROLE",
    role: "nthawi_jobs",
  },
])

export class NeonVerificationError extends Error {
  constructor(code, stage, cause) {
    super(code, { cause })
    this.name = "NeonVerificationError"
    this.code = code
    this.stage = stage
  }
}

function fail(code, stage, cause) {
  throw new NeonVerificationError(code, stage, cause)
}

function validateConnection(environment, profile, target) {
  const value = environment[profile.variable]

  if (typeof value !== "string" || !value.trim()) {
    fail(
      "NEON_CONNECTION_CONFIGURATION_INVALID",
      `configuration:${profile.kind}`
    )
  }

  let url, username, password, database

  try {
    url = new URL(value)
    username = decodeURIComponent(url.username)
    password = decodeURIComponent(url.password)
    database = decodeURIComponent(url.pathname.slice(1))
  } catch {
    fail(
      "NEON_CONNECTION_CONFIGURATION_INVALID",
      `configuration:${profile.kind}`
    )
  }

  const parameters = [...url.searchParams.entries()]

  const valid =
    environment[profile.roleVariable] === profile.role &&
    ["postgres:", "postgresql:"].includes(url.protocol) &&
    url.hostname === target.host &&
    url.port === "5432" &&
    database === target.database &&
    username === profile.role &&
    password.length > 0 &&
    !password.includes("\0") &&
    url.hash === "" &&
    parameters.length === 1 &&
    parameters[0][0] === "sslmode" &&
    parameters[0][1] === "verify-full"

  if (!valid) {
    fail(
      "NEON_CONNECTION_CONFIGURATION_INVALID",
      `configuration:${profile.kind}`
    )
  }

  return {
    ...profile,
    connectionString: value,
  }
}

export function readNeonConnections(environment) {
  let target
  try {
    target = resolveNeonTarget(environment)
  } catch {
    fail("NEON_CONNECTION_CONFIGURATION_INVALID", "configuration:target")
  }
  return PROFILES.map((profile) =>
    validateConnection(environment, profile, target)
  )
}

async function verifyProfile(handle, profile) {
  const result = await handle.pool.query(
    `
    SELECT
      current_database() = $1 AS database_matches,

      current_user = $2
        AND session_user = $2 AS login_matches,

      current_setting('server_version_num')::integer
        / 10000 = $3::integer AS version_matches,

      r.rolcanlogin AND NOT (
        r.rolsuper
        OR r.rolbypassrls
        OR r.rolcreatedb
        OR r.rolcreaterole
        OR r.rolreplication
        OR r.rolinherit
      ) AS safe_flags,

      EXISTS (
        SELECT 1
        FROM pg_auth_members m
        WHERE m.member = r.oid
      ) AS memberships,

      d.datdba = r.oid AS owns_database,

      has_database_privilege(
        current_user,
        current_database(),
        'TEMPORARY'
      ) AS temporary_privilege,

      has_schema_privilege(
        current_user,
        'public',
        'CREATE'
      ) AS creates_public,

      (
        EXISTS (
          SELECT 1
          FROM pg_namespace n
          WHERE n.nspowner = r.oid
            AND n.nspname !~ '^pg_'
            AND n.nspname <> 'information_schema'
        )
        OR EXISTS (
          SELECT 1
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relowner = r.oid
            AND n.nspname IN (
              'public',
              'app_private',
              'drizzle',
              'pgboss'
            )
        )
        OR EXISTS (
          SELECT 1
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE p.proowner = r.oid
            AND n.nspname IN (
              'public',
              'app_private',
              'drizzle',
              'pgboss'
            )
        )
        OR EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typowner = r.oid
            AND n.nspname IN (
              'public',
              'app_private',
              'drizzle',
              'pgboss'
            )
        )
      ) AS owns_objects

    FROM pg_roles r

    JOIN pg_database d
      ON d.datname = current_database()

    WHERE r.rolname = current_user
    `,
    [TARGET_DATABASE, profile.role, TARGET_VERSION]
  )

  const row = result.rows[0]
  const isMigrator = profile.kind === "migrator"

  if (!row) {
    fail("NEON_ROLE_PROFILE_UNSAFE", `role:${profile.kind}:missing`)
  }

  const requiredChecks = {
    database_matches: row.database_matches,
    login_matches: row.login_matches,
    version_matches: row.version_matches,
    safe_flags: row.safe_flags,
    no_memberships: row.memberships === false,
    database_ownership: row.owns_database === isMigrator,
  }

  if (!isMigrator) {
    requiredChecks.no_temporary_privilege = row.temporary_privilege === false

    requiredChecks.no_public_create = row.creates_public === false

    requiredChecks.no_object_ownership = row.owns_objects === false
  }

  for (const [check, passed] of Object.entries(requiredChecks)) {
    if (passed !== true) {
      fail("NEON_ROLE_PROFILE_UNSAFE", `role:${profile.kind}:${check}`)
    }
  }
}

async function verifyEmptyTarget(handle) {
  const result = await handle.pool.query(`
    SELECT
      NOT EXISTS (
        SELECT 1
        FROM pg_namespace
        WHERE nspname IN (
          'app_private',
          'drizzle',
          'pgboss'
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n
          ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN (
            'r', 'p', 'v', 'm', 'S', 'f'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM pg_depend d
            WHERE d.classid = 'pg_class'::regclass
              AND d.objid = c.oid
              AND d.deptype = 'e'
          )
      ) AS empty,

      EXISTS (
        SELECT 1
        FROM pg_extension e
        JOIN pg_namespace n
          ON n.oid = e.extnamespace
        WHERE e.extname = 'vector'
          AND n.nspname = 'public'
      ) AS vector_ready
  `)

  const row = result.rows[0]

  if (row?.empty !== true) {
    fail("NEON_EMPTY_TARGET_REQUIRED", "before-migrate:target-not-empty")
  }

  if (row.vector_ready !== true) {
    fail("NEON_VECTOR_EXTENSION_MISSING", "before-migrate:vector")
  }
}

async function verifyApplicationReadiness(handles, probeDatabase) {
  for (const capability of ["auth", "business"]) {
    const entry = handles.find(({ profile }) => profile.kind === capability)

    if (!entry) {
      fail("NEON_ROLE_PROFILE_MISSING", `after-migrate:${capability}`)
    }

    try {
      await probeDatabase(entry.handle, capability)
    } catch (error) {
      fail(
        "NEON_APPLICATION_READINESS_FAILED",
        `after-migrate:${capability}`,
        error
      )
    }
  }

  const business = handles.find(({ profile }) => profile.kind === "business")

  const result = await business.handle.pool.query(`
    SELECT vector_dims(
      array_fill(
        0::real,
        ARRAY[1536]
      )::vector(1536)
    ) = 1536 AS valid
  `)

  if (result.rows[0]?.valid !== true) {
    fail("NEON_VECTOR_CHECK_FAILED", "after-migrate:vector")
  }
}

export async function verifyNeonDatabase(environment, mode, dependencies) {
  if (
    !["--check-config", "--before-migrate", "--after-migrate"].includes(mode)
  ) {
    fail("NEON_VERIFICATION_MODE_INVALID", "arguments")
  }

  // Production resolution is available for configuration inspection only.
  // Every executable verifier mode is confined to the isolated test branch.
  try {
    assertNeonTestEnvironment(environment)
  } catch {
    fail("NEON_CONNECTION_CONFIGURATION_INVALID", "configuration:test-target")
  }
  const connections = readNeonConnections(environment)
  if (mode === "--check-config") {
    console.log("NEON_CONFIGURATION_VERIFIED target=test")
    return
  }
  if (environment.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    fail("NEON_TLS_CONFIGURATION_UNSAFE", "configuration:tls")
  }
  const handles = []

  let currentStage = "initialization"
  let primaryError

  try {
    currentStage = "initialization:database-package"
    // Configuration checks work on a fresh checkout without compiled packages.
    const { Pool, probeDatabase } = dependencies ?? {
      Pool: createRequire(
        new URL("../packages/db/package.json", import.meta.url)
      )("pg").Pool,
      probeDatabase: (await import("../packages/db/dist/index.js"))
        .probeDatabase,
    }
    for (const profile of connections) {
      currentStage = `connection:${profile.kind}`

      const pool = new Pool({
        ...neonTestConnectionOptions(environment, profile.variable),
        max: 1,
        connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
        query_timeout: QUERY_TIMEOUT_MS,
        statement_timeout: STATEMENT_TIMEOUT_MS,
      })
      pool.on("error", () => {})
      // All queries, including application probes after reconnect, use a
      // certificate-verified client. pg_stat_ssl describes Neon's internal hop.
      const handle = {
        pool: {
          query: (...args) =>
            withVerifiedNeonClient(pool, (client) => client.query(...args)),
          connect: async () => {
            const client = await pool.connect()
            try {
              assertVerifiedNeonClient(client)
              return client
            } catch (error) {
              client.release(true)
              throw error
            }
          },
          end: () => pool.end(),
        },
      }

      handles.push({ profile, handle })

      currentStage = `role:${profile.kind}`

      await verifyProfile(handle, profile)

      console.log(`NEON_ROLE_VERIFIED kind=${profile.kind}`)
    }

    if (mode === "--before-migrate") {
      currentStage = "before-migrate:empty-target"
      await verifyEmptyTarget(handles[0].handle)

      console.log("NEON_EMPTY_TARGET_VERIFIED")
    } else {
      currentStage = "after-migrate:readiness"

      await verifyApplicationReadiness(handles, probeDatabase)

      console.log("NEON_APPLICATION_READINESS_VERIFIED")
    }
  } catch (error) {
    primaryError =
      error instanceof NeonVerificationError
        ? error
        : new NeonVerificationError(
            "NEON_ACCEPTANCE_FAILED",
            currentStage,
            error
          )
  } finally {
    const cleanup = await Promise.allSettled(
      handles.map(({ handle }) => handle.pool.end())
    )

    const cleanupFailed = cleanup.some((result) => result.status === "rejected")

    if (cleanupFailed && !primaryError) {
      primaryError = new NeonVerificationError(
        "NEON_CONNECTION_CLEANUP_FAILED",
        "cleanup"
      )
    }
  }

  if (primaryError) {
    throw primaryError
  }

  console.log("NEON_ACCEPTANCE_PASSED")
}

export function formatNeonError(error) {
  if (!(error instanceof NeonVerificationError)) {
    return "code=NEON_ACCEPTANCE_FAILED stage=unknown"
  }

  const underlying = error.cause

  const postgresCode =
    typeof underlying?.code === "string" &&
    /^[A-Z0-9]{5}$/.test(underlying.code)
      ? underlying.code
      : "none"

  const networkCode =
    typeof underlying?.code === "string" &&
    /^(E[A-Z0-9_]+)$/.test(underlying.code)
      ? underlying.code
      : "none"

  return [
    `code=${error.code}`,
    `stage=${error.stage}`,
    `postgres_code=${postgresCode}`,
    `network_code=${networkCode}`,
  ].join(" ")
}

const isCommand =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isCommand) {
  try {
    if (process.argv.length !== 3) {
      fail("NEON_VERIFICATION_MODE_INVALID", "arguments")
    }

    await verifyNeonDatabase(process.env, process.argv[2])
  } catch (error) {
    console.error(formatNeonError(error))
    process.exitCode = 1
  }
}
