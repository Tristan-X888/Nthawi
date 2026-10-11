import { Pool } from "pg"
import { provisionRuntimeRoles, provisionJobsSchema } from "./role-profiles.mjs"

const connectionString = process.env.DATABASE_MIGRATION_URL
const roles = Object.fromEntries(
  ["migrator", "auth", "business", "jobs"].map((kind) => [
    kind,
    process.env[`DATABASE_${kind.toUpperCase()}_ROLE`],
  ])
)
if (!connectionString || Object.values(roles).some((role) => !role))
  throw new Error(
    "DATABASE_MIGRATION_URL and DATABASE_{MIGRATOR,AUTH,BUSINESS,JOBS}_ROLE are required"
  )
const pool = new Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 2_000,
  statement_timeout: 5_000,
})
pool.on("error", () => {})
try {
  await provisionRuntimeRoles(pool, roles)
  if (process.argv.includes("--jobs"))
    await provisionJobsSchema(pool, roles.jobs)
  console.log("Database runtime grants provisioned")
} catch {
  throw new Error("Database runtime role provisioning failed")
} finally {
  await pool.end()
}
