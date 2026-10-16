import assert from "node:assert/strict"
import test from "node:test"

import {
  assertNeonTestEnvironment,
  assertNeonTestSession,
  guardNeonMigrationTarget,
  resolveNeonTarget,
} from "./neon-targets.mjs"

const host = "ep-cold-shadow-zaqw3flo.c-2.eu-west-2.aws.neon.tech"

/**
 * Create a synthetic Neon test environment.
 *
 * These are test-only credentials.
 * No production credentials are used.
 */
const env = () => ({
  NEON_TARGET: "test",

  NEON_EXPECTED_BRANCH_ID: "br-rapid-brook-zao6uwya",

  DATABASE_MIGRATION_URL:
    `postgresql://nthawi_migrator:synthetic-password@${host}:5432/` +
    "neondb?sslmode=verify-full",

  AUTH_DATABASE_URL:
    `postgresql://nthawi_auth:synthetic-password@${host}:5432/` +
    "neondb?sslmode=verify-full",

  DATABASE_URL:
    `postgresql://nthawi_business:synthetic-password@${host}:5432/` +
    "neondb?sslmode=verify-full",

  JOBS_DATABASE_URL:
    `postgresql://nthawi_jobs:synthetic-password@${host}:5432/` +
    "neondb?sslmode=verify-full",

  DATABASE_MIGRATOR_ROLE: "nthawi_migrator",

  DATABASE_AUTH_ROLE: "nthawi_auth",

  DATABASE_BUSINESS_ROLE: "nthawi_business",

  DATABASE_JOBS_ROLE: "nthawi_jobs",
})

/**
 * Test 1:
 * Accept the approved test environment.
 */
test("accepts only approved test target and complete roles", () => {
  assert.equal(
    assertNeonTestEnvironment(env()).branchId,
    "br-rapid-brook-zao6uwya"
  )

  assert.equal(guardNeonMigrationTarget(env()), true)
})

/**
 * Test 2:
 * Resolve the production target for explicit inspection.
 *
 * This does not authorize production migration.
 */
test("resolves production for read-only inspection", () => {
  const target = resolveNeonTarget({
    NEON_TARGET: "production",
    NEON_EXPECTED_BRANCH_ID: "br-lively-darkness-zahxet6z",
  })

  assert.equal(target.database, "neondb")
})

/**
 * Tests 3–11:
 * Reject invalid or unsafe connection configurations.
 */
for (const [name, transform] of [
  [
    "production target",
    (e) => {
      e.NEON_TARGET = "production"

      e.NEON_EXPECTED_BRANCH_ID = "br-lively-darkness-zahxet6z"
    },
  ],

  [
    "production endpoint",
    (e) => {
      e.DATABASE_MIGRATION_URL = e.DATABASE_MIGRATION_URL.replace(
        host,
        "ep-wild-leaf-za09k0vy.c-2.eu-west-2.aws.neon.tech"
      )
    },
  ],

  [
    "pooler endpoint",
    (e) => {
      e.DATABASE_MIGRATION_URL = e.DATABASE_MIGRATION_URL.replace(
        host,
        host.replace(".", "-pooler.")
      )
    },
  ],

  [
    "weak TLS",
    (e) => {
      e.DATABASE_MIGRATION_URL = e.DATABASE_MIGRATION_URL.replace(
        "verify-full",
        "require"
      )
    },
  ],

  [
    "duplicate TLS",
    (e) => {
      e.AUTH_DATABASE_URL += "&sslmode=disable"
    },
  ],

  [
    "wrong role",
    (e) => {
      e.DATABASE_BUSINESS_ROLE = "neondb_owner"
    },
  ],

  [
    "wrong database",
    (e) => {
      e.DATABASE_URL = e.DATABASE_URL.replace("/neondb?", "/postgres?")
    },
  ],

  [
    "missing password",
    (e) => {
      e.JOBS_DATABASE_URL = e.JOBS_DATABASE_URL.replace(
        "synthetic-password",
        ""
      )
    },
  ],

  [
    "wrong branch ID",
    (e) => {
      e.NEON_EXPECTED_BRANCH_ID = "bad"
    },
  ],
]) {
  test(`rejects ${name}`, () => {
    const e = env()

    transform(e)

    assert.throws(() => guardNeonMigrationTarget(e), {
      message: "NEON_TEST_TARGET_CONFIGURATION_INVALID",
    })
  })
}

/**
 * Test 12:
 * Preserve the original local PostgreSQL migration path.
 */
test("leaves existing local migration path intact", () => {
  const result = guardNeonMigrationTarget({
    DATABASE_MIGRATION_URL:
      "postgresql://local:password@127.0.0.1:55433/nthawi",
  })

  assert.equal(result, false)
})

/**
 * Test 13:
 * Accept the expected PostgreSQL session identity.
 */
test("accepts the expected PostgreSQL session identity", async () => {
  const row = Object.fromEntries(
    [
      "database_matches",
      "current_role_matches",
      "session_role_matches",
      "version_matches",
      "tls_enabled",
      "ownership_matches",
      "vector_available",
    ].map((key) => [key, true])
  )

  const pool = {
    query: async () => ({
      rows: [row],
    }),
  }

  await assert.doesNotReject(() => assertNeonTestSession(pool))
})

/**
 * Test 14:
 * Reject an unsafe PostgreSQL session identity.
 */
test("rejects unsafe PostgreSQL session identity", async () => {
  const pool = {
    query: async () => ({
      rows: [
        {
          tls_enabled: false,
        },
      ],
    }),
  }

  await assert.rejects(() => assertNeonTestSession(pool), {
    message: "NEON_TEST_SESSION_REJECTED",
  })
})
