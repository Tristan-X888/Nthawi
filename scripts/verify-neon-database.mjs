import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { createDatabase, probeDatabase } from "../packages/db/dist/index.js"

const TARGET_HOST = "ep-wild-leaf-za09k0vy.c-2.eu-west-2.aws.neon.tech"

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

function validateConnection(environment, profile) {
  const value = environment[profile.variable]

  if (typeof value !== "string" || !value.trim()) {
    fail(
      "NEON_CONNECTION_CONFIGURATION_INVALID",
      `configuration:${profile.kind}`
    )
  }

  let url

  try {
    url = new URL(value)
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
    url.hostname === TARGET_HOST &&
    (url.port === "" || url.port === "5432") &&
    decodeURIComponent(url.pathname.slice(1)) === TARGET_DATABASE &&
    decodeURIComponent(url.username) === profile.role &&
    url.password.length > 0 &&
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
  return PROFILES.map((profile) => validateConnection(environment, profile))
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
      ) AS owns_objects,

      EXISTS (
        SELECT 1
        FROM pg_stat_ssl
        WHERE pid = pg_backend_pid()
          AND ssl
      ) AS tls

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
    no_memberships: !row.memberships,
    tls: row.tls,
    database_ownership: row.owns_database === isMigrator,
  }

  if (!isMigrator) {
    requiredChecks.no_temporary_privilege = !row.temporary_privilege

    requiredChecks.no_public_create = !row.creates_public

    requiredChecks.no_object_ownership = !row.owns_objects
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

async function verifyApplicationReadiness(handles) {
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

export async function verifyNeonDatabase(environment, mode) {
  if (!["--before-migrate", "--after-migrate"].includes(mode)) {
    fail("NEON_VERIFICATION_MODE_INVALID", "arguments")
  }

  const connections = readNeonConnections(environment)
  const handles = []

  let currentStage = "initialization"
  let primaryError

  try {
    for (const profile of connections) {
      currentStage = `connection:${profile.kind}`

      const handle = createDatabase(profile.connectionString, {
        max: 1,
        connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
        queryTimeoutMillis: QUERY_TIMEOUT_MS,
        statementTimeoutMillis: STATEMENT_TIMEOUT_MS,
      })

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

      await verifyApplicationReadiness(handles)

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
