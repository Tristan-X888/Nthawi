import { fileURLToPath } from "node:url"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Pool } from "pg"

import {
  guardNeonMigrationTarget,
  assertNeonTestSession,
  neonTestConnectionOptions,
  withVerifiedNeonClient,
} from "../../../scripts/neon-targets.mjs"

// Require a dedicated migration database connection.
if (!process.env.DATABASE_MIGRATION_URL) {
  throw new Error(
    "DATABASE_MIGRATION_URL is required; use a dedicated migration role."
  )
}

// Validate the intended migration target before opening a connection.
//
// For Neon:
// - Only the explicitly approved test branch is accepted.
// - Production, pooled, or mismatched connections are rejected.
// - All four restricted-role connection settings must be valid.
//
// For existing local development:
// - The original local PostgreSQL migration path is preserved.
const isNeonTest = guardNeonMigrationTarget(process.env)

// Use explicit verified TLS for Neon and preserve the local connection path.
const pool = new Pool({
  ...(isNeonTest
    ? neonTestConnectionOptions(process.env)
    : { connectionString: process.env.DATABASE_MIGRATION_URL }),
  max: 1,
})

try {
  // Before applying migrations to Neon, verify the actual
  // PostgreSQL session and required database prerequisites.
  //
  // This confirms:
  // - The expected database and migrator identity.
  // - PostgreSQL 18 compatibility.
  // - A certificate-verified TLS session.
  // - Expected database ownership.
  // - Availability of the pgvector extension.
  // Apply existing Drizzle migrations on the same checked client.
  //
  // Do not regenerate, replace, or rewrite migration history.
  const applyMigrations = async (connection) => {
    if (isNeonTest) {
      await assertNeonTestSession(connection)
    }
    await migrate(drizzle(connection), {
      migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
    })
  }

  if (isNeonTest) {
    await withVerifiedNeonClient(pool, applyMigrations)
  } else {
    await applyMigrations(pool)
  }
} finally {
  // Always release the database pool, including on failure.
  await pool.end()
}
