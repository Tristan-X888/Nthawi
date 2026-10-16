import { fileURLToPath } from "node:url"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Pool } from "pg"

import {
  guardNeonMigrationTarget,
  assertNeonTestSession,
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

// Preserve the existing PostgreSQL connection configuration.
const pool = new Pool({
  connectionString: process.env.DATABASE_MIGRATION_URL,
  max: 1,
})

try {
  // Before applying migrations to Neon, verify the actual
  // PostgreSQL session and required database prerequisites.
  //
  // This confirms:
  // - The expected database and migrator identity.
  // - PostgreSQL 18 compatibility.
  // - An active TLS session.
  // - Expected database ownership.
  // - Availability of the pgvector extension.
  if (isNeonTest) {
    await assertNeonTestSession(pool)
  }

  // Apply existing Drizzle migrations.
  //
  // Do not regenerate, replace, or rewrite migration history.
  await migrate(drizzle(pool), {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  })
} finally {
  // Always release the database pool, including on failure.
  await pool.end()
}
