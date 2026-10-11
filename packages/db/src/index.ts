import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema/index.js"

export { withTenantTransaction } from "./tenant.js"
export type { TenantContext } from "./tenant.js"

// Pool construction is lazy: schema generation never needs a database connection.
export interface DatabaseOptions {
  max?: number
  connectionTimeoutMillis?: number
  queryTimeoutMillis?: number
  statementTimeoutMillis?: number
  onIdleError?: (error: { code: "database_idle_error" }) => void
}

export function createDatabase(
  connectionString: string,
  options: DatabaseOptions = {}
) {
  for (const [key, value] of Object.entries(options)) {
    if (
      key !== "onIdleError" &&
      (!Number.isSafeInteger(value) ||
        Number(value) < 1 ||
        Number(value) > (key === "max" ? 100 : 60_000))
    ) {
      throw new Error("Invalid database pool option")
    }
  }
  const pool = new Pool({
    connectionString,
    max: options.max ?? 10,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 2_000,
    query_timeout: options.queryTimeoutMillis ?? 2_000,
    statement_timeout: options.statementTimeoutMillis ?? 2_000,
  })
  pool.on("error", () => {
    try {
      options.onIdleError?.({ code: "database_idle_error" })
    } catch {
      /* Logging cannot turn an idle connection failure into a crash. */
    }
  })
  return { pool, db: drizzle(pool, { schema }) }
}
export type DatabaseHandle = ReturnType<typeof createDatabase>
export type DatabaseCapability = "auth" | "business"
export { probeDatabase } from "./probe.js"
export type AppDatabase = ReturnType<typeof createDatabase>["db"]
