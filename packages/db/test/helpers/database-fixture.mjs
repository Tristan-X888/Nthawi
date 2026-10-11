import { randomBytes, randomUUID } from "node:crypto"
import { fileURLToPath } from "node:url"
import { Pool } from "pg"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import {
  identifier,
  provisionRuntimeRoles,
  provisionJobsSchema,
} from "../../scripts/role-profiles.mjs"

export function validateTestAdminUrl(value) {
  const url = new URL(value)
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.search ||
    url.hash ||
    !url.username ||
    !url.password
  ) {
    throw new Error(
      "Test administrator must use a literal loopback PostgreSQL URL without connection options"
    )
  }
  return url
}

export async function createDatabaseTestFixture(adminUrl, options = {}) {
  const url = validateTestAdminUrl(adminUrl)
  const databaseName = `step4_${randomUUID().replaceAll("-", "")}`
  const roles = Object.fromEntries(
    ["migrator", "auth", "business", "jobs"].map((kind) => [
      kind,
      `${databaseName}_${kind}`,
    ])
  )
  const control = new Pool({
    connectionString: url.toString(),
    max: 1,
    connectionTimeoutMillis: 2_000,
  })
  const pools = {}
  const urls = {}
  const createdRoles = []
  let createdDatabase = false
  let closePromise
  const close = () =>
    (closePromise ??= (async () => {
      const results = await Promise.allSettled(
        Object.values(pools).map((pool) => pool.end())
      )
      try {
        if (createdDatabase)
          await control.query(`DROP DATABASE ${identifier(databaseName)}`)
        for (const role of createdRoles)
          await control.query(`DROP ROLE ${identifier(role)}`)
      } finally {
        await control.end()
      }
      if (results.some((result) => result.status === "rejected"))
        throw new Error("Test pool cleanup failed")
    })())
  try {
    const flags = (
      await control.query(
        "SELECT rolsuper FROM pg_roles WHERE rolname = session_user"
      )
    ).rows[0]
    if (!flags?.rolsuper)
      throw new Error("Disposable test administrator must be a superuser")
    for (const [kind, role] of Object.entries(roles)) {
      const password = randomBytes(32).toString("hex")
      await control.query(
        `CREATE ROLE ${identifier(role)} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION`
      )
      createdRoles.push(role)
      const login = new URL(url)
      login.pathname = `/${databaseName}`
      login.username = role
      login.password = password
      urls[kind] = login.toString()
    }
    await control.query(
      `CREATE DATABASE ${identifier(databaseName)} OWNER ${identifier(roles.migrator)}`
    )
    createdDatabase = true
    url.pathname = `/${databaseName}`
    urls.admin = url.toString()
    for (const [kind, connectionString] of Object.entries(urls))
      pools[kind] = new Pool({
        connectionString,
        max: 1,
        connectionTimeoutMillis: 2_000,
        statement_timeout: 5_000,
      })
    await pools.admin.query("CREATE EXTENSION vector")
    await pools.admin.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC")
    await pools.admin.query(
      `REVOKE CONNECT, TEMPORARY ON DATABASE ${identifier(databaseName)} FROM PUBLIC`
    )
    await pools.admin.query(
      `GRANT CONNECT ON DATABASE ${identifier(databaseName)} TO ${Object.values(roles).map(identifier).join(", ")}`
    )
    const migrateDatabase = async () => {
      await migrate(drizzle(pools.migrator), {
        migrationsFolder: fileURLToPath(
          new URL("../../drizzle/", import.meta.url)
        ),
      })
      await provisionRuntimeRoles(pools.migrator, roles)
    }
    if (options.migrate !== false) await migrateDatabase()
    return {
      databaseName,
      roles,
      urls,
      pools,
      migrate: migrateDatabase,
      provisionJobsSchema: () =>
        provisionJobsSchema(pools.migrator, roles.jobs),
      close,
    }
  } catch (error) {
    await close()
    throw error
  }
}
