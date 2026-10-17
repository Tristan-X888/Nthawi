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
      url.username !== expectedRole ||
      !password ||
      password.includes("\0") ||
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
 * Neon endpoints require the complete approved test-branch configuration.
 * Unselected connections are limited to ordinary local loopback URLs.
 *
 * Existing local PostgreSQL / Docker migration commands
 * remain compatible with this guard.
 *
 * Returns:
 * - true: Approved Neon test environment.
 * - false: Local loopback connection without NEON_TARGET.
 */
export function guardNeonMigrationTarget(env) {
  let url

  try {
    url = new URL(env.DATABASE_MIGRATION_URL)
  } catch {
    reject()
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "")

  if (hostname.endsWith(".neon.tech") || env.NEON_TARGET !== undefined) {
    assertNeonTestEnvironment(env)
    return true
  }

  // pg accepts connection options in the query string, including a host that
  // overrides the URL authority. Only ordinary local URLs may bypass Neon checks.
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(hostname) ||
    [...url.searchParams.keys()].some((key) => key !== "sslmode") ||
    url.hash !== ""
  ) {
    reject()
  }

  return false
}

// Do not combine sslmode in a connectionString with an ssl object: pg parses
// the URL last and overwrites the ssl object. Build explicit fields instead.
export function neonTestConnectionOptions(
  env,
  variable = "DATABASE_MIGRATION_URL"
) {
  const target = assertNeonTestEnvironment(env)
  if (!connections.some(([name]) => name === variable)) reject()
  const url = new URL(env[variable])

  try {
    return {
      host: target.host,
      port: 5432,
      database: target.database,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      ssl: { rejectUnauthorized: true, servername: target.host },
      connectionTimeoutMillis: 10_000,
    }
  } catch {
    reject()
  }
}

export function assertVerifiedNeonClient(client) {
  const stream = client.connection?.stream
  if (
    stream?.encrypted !== true ||
    stream.authorized !== true ||
    client.ssl === false ||
    client.ssl?.rejectUnauthorized === false
  ) {
    throw new Error("NEON_TLS_SESSION_REJECTED")
  }
}

export async function withVerifiedNeonClient(pool, callback) {
  const client = await pool.connect()
  let discard = false

  try {
    assertVerifiedNeonClient(client)
    return await callback(client)
  } catch (error) {
    discard = true
    throw error
  } finally {
    client.release(discard)
  }
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
 * - Certificate-verified client TLS session.
 * - Database ownership.
 * - pgvector extension availability.
 *
 * No database passwords or connection strings are returned.
 */
export async function assertNeonTestSession(client) {
  assertVerifiedNeonClient(client)
  const result = await client.query(`
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

  const checks = [
    "database_matches",
    "current_role_matches",
    "session_role_matches",
    "version_matches",
    "ownership_matches",
    "vector_available",
  ]
  if (!row || checks.some((check) => row[check] !== true)) {
    throw new Error("NEON_TEST_SESSION_REJECTED")
  }
}
