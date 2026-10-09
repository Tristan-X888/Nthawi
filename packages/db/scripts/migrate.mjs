import { fileURLToPath } from "node:url"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Pool } from "pg"

if (!process.env.DATABASE_MIGRATION_URL) {
  throw new Error(
    "DATABASE_MIGRATION_URL is required; use a dedicated migration role."
  )
}
const pool = new Pool({
  connectionString: process.env.DATABASE_MIGRATION_URL,
  max: 1,
})
try {
  await migrate(drizzle(pool), {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  })
} finally {
  await pool.end()
}
