import { Pool } from "pg"

import { provisionRuntimeRoles, provisionJobsSchema } from "./role-profiles.mjs"

import {
  guardNeonMigrationTarget,
  assertNeonTestSession,
} from "../../../scripts/neon-targets.mjs"

// Obtain the dedicated migration database connection.
const connectionString = process.env.DATABASE_MIGRATION_URL

// Resolve the four explicitly configured PostgreSQL roles.
const roles = Object.fromEntries(
  ["migrator", "auth", "business", "jobs"].map((kind) => [
    kind,
    process.env[`DATABASE_${kind.toUpperCase()}_ROLE`],
  ])
)

// Require the migration connection and every restricted-role name.
if (!connectionString || Object.values(roles).some((role) => !role)) {
  throw new Error(
    "DATABASE_MIGRATION_URL and DATABASE_{MIGRATOR,AUTH,BUSINESS,JOBS}_ROLE are required"
  )
}

// Validate the database target before opening a connection.
//
// Neon migrations and role provisioning must use the approved
// test branch with the expected credentials and role identities.
//
// Existing local PostgreSQL development remains supported.
const isNeonTest = guardNeonMigrationTarget(process.env)

// Preserve the existing controlled PostgreSQL pool.
const pool = new Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 2_000,
  statement_timeout: 5_000,
})

// Preserve the existing pool error-event handler.
// Operational error logging should be addressed separately.
pool.on("error", () => {})

try {
  // Verify the actual Neon PostgreSQL session before executing
  // any runtime-role provisioning statements.
  //
  // This check is only required for the approved Neon test branch.
  if (isNeonTest) {
    await assertNeonTestSession(pool)
  }

  // Provision application runtime grants using the existing
  // reviewed role-profiles implementation.
  await provisionRuntimeRoles(pool, roles)

  // Preserve explicit jobs-schema provisioning.
  //
  // Jobs schema provisioning is only executed when --jobs
  // is provided to the script.
  if (process.argv.includes("--jobs")) {
    await provisionJobsSchema(pool, roles.jobs)
  }

  console.log("Database runtime grants provisioned")
} catch {
  // Preserve the existing sanitized provisioning error contract.
  throw new Error("Database runtime role provisioning failed")
} finally {
  // Close the PostgreSQL pool in success and failure cases.
  await pool.end()
}
