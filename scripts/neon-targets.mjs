const projectId = "delicate-feather-83629956"

export const NEON_TARGETS = Object.freeze({
  test: Object.freeze({
    projectId,
    branchId: "br-rapid-brook-zao6uwya",
    host: "ep-cold-shadow-zaqw3flo.c-2.eu-west-2.aws.neon.tech",
    database: "neondb",
  }),

  production: Object.freeze({
    projectId,
    branchId: "br-lively-darkness-zahxet6z",
    host: "ep-wild-leaf-za09k0vy.c-2.eu-west-2.aws.neon.tech",
    database: "neondb",
  }),
})

const connections = Object.freeze([
  ["DATABASE_MIGRATION_URL", "DATABASE_MIGRATOR_ROLE", "nthawi_migrator"],
  ["AUTH_DATABASE_URL", "DATABASE_AUTH_ROLE", "nthawi_auth"],
  ["DATABASE_URL", "DATABASE_BUSINESS_ROLE", "nthawi_business"],
  ["JOBS_DATABASE_URL", "DATABASE_JOBS_ROLE", "nthawi_jobs"],
])

function reject() {
  throw new Error("NEON_TEST_TARGET_CONFIGURATION_INVALID")
}

/**
 * Resolve a Neon target from an explicitly selected environment.
 *
 * Supported targets:
 * - test
 * - production
 *
 * The supplied branch ID must match the registered target.
 */
export function resolveNeonTarget(env) {
  if (env.NEON_TARGET !== "test" && env.NEON_TARGET !== "production") {
    reject()
  }

  const target = NEON_TARGETS[env.NEON_TARGET]

  if (env.NEON_EXPECTED_BRANCH_ID !== target.branchId) {
    reject()
  }

  return target
}

/**
 * Validate the complete test-branch connection configuration.
 *
 * Requirements:
 * - Explicit test target.
 * - Exact approved branch ID.
 * - Exact direct Neon hostname.
 * - PostgreSQL port 5432.
 * - Expected database name.
 * - Four individual restricted roles.
 * - Non-empty database passwords.
 * - Exactly one sslmode=verify-full parameter.
 * - No pooled endpoint or additional connection parameters.
 *
 * This function does not connect to PostgreSQL.
 */
export function assertNeonTestEnvironment(env) {
  if (env.NEON_TARGET !== "test") {
    reject()
  }

  const target = resolveNeonTarget(env)

  for (const [urlName, roleName, expectedRole] of connections) {
    if (env[roleName] !== expectedRole) {
      reject()
    }

    let url

    try {
      url = new URL(env[urlName])
    } catch {
      reject()
    }

    const params = [...url.searchParams.entries()]

    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      url.hostname !== target.host ||
      url.port !== "5432" ||
      url.pathname !== `/${target.database}` ||
      url.username !== expectedRole ||
      !url.password ||
      url.hash !== "" ||
      params.length !== 1 ||
      params[0][0] !== "sslmode" ||
      params[0][1] !== "verify-full"
    ) {
      reject()
    }
  }

  return target
}

/**
 * Protect Neon-specific migration operations.
 *
 * When a Neon endpoint or explicit NEON_TARGET is detected,
 * require the complete approved test-branch configuration.
 *
 * Existing local PostgreSQL / Docker migration commands
 * remain compatible with this guard.
 *
 * Returns:
 * - true: Approved Neon test environment.
 * - false: Local/non-Neon connection without NEON_TARGET.
 */
export function guardNeonMigrationTarget(env) {
  let hostname

  try {
    hostname = new URL(env.DATABASE_MIGRATION_URL).hostname
  } catch {
    reject()
  }

  if (hostname.endsWith(".neon.tech") || env.NEON_TARGET !== undefined) {
    assertNeonTestEnvironment(env)
    return true
  }

  return false
}

/**
 * Verify the PostgreSQL server session before a Neon migration.
 *
 * This query is read-only.
 *
 * It verifies:
 * - Expected database.
 * - Expected migrator identity.
 * - PostgreSQL 18.
 * - Active TLS session.
 * - Database ownership.
 * - pgvector extension availability.
 *
 * No database passwords or connection strings are returned.
 */
export async function assertNeonTestSession(pool) {
  const result = await pool.query(`
    SELECT
      current_database() = 'neondb'
        AS database_matches,

      current_user = 'nthawi_migrator'
        AS current_role_matches,

      session_user = 'nthawi_migrator'
        AS session_role_matches,

      current_setting('server_version_num')::integer / 10000 = 18
        AS version_matches,

      EXISTS (
        SELECT 1
        FROM pg_stat_ssl
        WHERE pid = pg_backend_pid()
          AND ssl
      ) AS tls_enabled,

      EXISTS (
        SELECT 1
        FROM pg_database
        WHERE datname = current_database()
          AND pg_get_userbyid(datdba) = 'nthawi_migrator'
      ) AS ownership_matches,

      EXISTS (
        SELECT 1
        FROM pg_extension
        WHERE extname = 'vector'
      ) AS vector_available
  `)

  const row = result.rows[0]

  if (!row || Object.values(row).some((value) => value !== true)) {
    throw new Error("NEON_TEST_SESSION_REJECTED")
  }
}
