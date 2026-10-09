import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema/index.js"

export { withTenantTransaction } from "./tenant.js"
export type { TenantContext } from "./tenant.js"

// Pool construction is lazy: schema generation never needs a database connection.
export function createDatabase(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 10_000,
  })
  return { pool, db: drizzle(pool, { schema }) }
}
export type AppDatabase = ReturnType<typeof createDatabase>["db"]
