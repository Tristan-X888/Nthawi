import assert from "node:assert/strict"
import test from "node:test"
import { createRequire } from "node:module"

import {
  assertNeonTestEnvironment,
  assertNeonTestSession,
  guardNeonMigrationTarget,
  resolveNeonTarget,
  neonTestConnectionOptions,
  withVerifiedNeonClient,
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
  [
    "invalid password encoding",
    (e) => {
      e.JOBS_DATABASE_URL = e.JOBS_DATABASE_URL.replace(
        "synthetic-password",
        "%ZZ"
      )
    },
  ],
  [
    "NUL password",
    (e) => {
      e.JOBS_DATABASE_URL = e.JOBS_DATABASE_URL.replace(
        "synthetic-password",
        "%00"
      )
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

for (const connectionString of [
  `postgresql://user:synthetic@localhost/neondb?host=${host}`,
  `postgresql://user:synthetic@${host.toUpperCase()}:5432/neondb`,
  `postgresql://user:synthetic@${host}.:5432/neondb`,
  "postgresql://user:synthetic@localhost/neondb?host=%2Ftmp",
]) {
  test("rejects unselected targets and connection overrides", () => {
    assert.throws(
      () =>
        guardNeonMigrationTarget({ DATABASE_MIGRATION_URL: connectionString }),
      { message: "NEON_TEST_TARGET_CONFIGURATION_INVALID" }
    )
  })
}

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
      "ownership_matches",
      "vector_available",
    ].map((key) => [key, true])
  )

  const pool = {
    connection: { stream: { encrypted: true, authorized: true } },
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
    connection: { stream: { encrypted: true, authorized: true } },
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

test("enforces certificate and hostname validation in the actual pg configuration", () => {
  const require = createRequire(
    new URL("../packages/db/package.json", import.meta.url)
  )
  const { Client } = require("pg")
  const config = neonTestConnectionOptions(env())
  const client = new Client(config)
  assert.equal(client.connectionParameters.ssl.rejectUnauthorized, true)
  assert.equal(client.connectionParameters.ssl.servername, host)
  assert.equal(client.connectionParameters.host, host)
  assert.equal(config.connectionString, undefined)
})

test("runs work on the verified client and releases that same connection", async () => {
  const releases = []
  const client = {
    connection: { stream: { encrypted: true, authorized: true } },
    release: (discard) => releases.push(discard),
  }
  const result = await withVerifiedNeonClient(
    { connect: async () => client },
    async (checked) => {
      assert.equal(checked, client)
      return "checked"
    }
  )
  assert.equal(result, "checked")
  assert.deepEqual(releases, [false])
})

for (const stream of [{}, { encrypted: true, authorized: false }]) {
  test("refuses SQL over an unverified client connection", async () => {
    let queried = false
    let discarded = false
    const client = {
      connection: { stream },
      release: (discard) => {
        discarded = discard
      },
    }
    await assert.rejects(
      () =>
        withVerifiedNeonClient({ connect: async () => client }, async () => {
          queried = true
        }),
      { message: "NEON_TLS_SESSION_REJECTED" }
    )
    assert.equal(queried, false)
    assert.equal(discarded, true)
  })
}

test("discards the checked connection when work fails", async () => {
  let discarded = false
  const client = {
    connection: { stream: { encrypted: true, authorized: true } },
    release: (discard) => {
      discarded = discard
    },
  }
  await assert.rejects(
    () =>
      withVerifiedNeonClient({ connect: async () => client }, async () => {
        throw new Error("synthetic failure")
      }),
    { message: "synthetic failure" }
  )
  assert.equal(discarded, true)
})

test("rejects incomplete PostgreSQL session identity results", async () => {
  const client = {
    connection: { stream: { encrypted: true, authorized: true } },
    query: async () => ({ rows: [{ database_matches: true }] }),
  }
  await assert.rejects(() => assertNeonTestSession(client), {
    message: "NEON_TEST_SESSION_REJECTED",
  })
})
