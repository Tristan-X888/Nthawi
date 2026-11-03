import type { PoolClient, QueryResult } from "pg"
import type { DatabaseCapability, DatabaseHandle } from "./index.js"
import { probeCatalogQueries, probeCatalogSql } from "./probe-catalog.js"
import { schemaManifest } from "./schema-manifest.js"

const identity = new Set([
  "user",
  "session",
  "account",
  "verification",
  "rate_limit",
])
const operational = new Set([
  "audit_events",
  "global_monthly_ai_usage",
  "deletion_journal",
])
const require = (condition: unknown) => {
  if (!condition) throw new Error("incompatible")
}

// A total deadline bounds both pool acquisition and catalog work. Errors never
// retain a driver cause, SQL text, database names, role names, or credentials.
export async function probeDatabase(
  handle: DatabaseHandle,
  capability: DatabaseCapability
): Promise<void> {
  let client: PoolClient | undefined
  let expired = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const run = async () => {
    const acquired = await handle.pool.connect()
    if (expired) {
      acquired.release(true)
      return
    }
    client = acquired
    // pg returns one QueryResult per command for a simple-protocol batch.
    // Static SQL avoids a separate network round trip for every catalog read.
    const batch: unknown = await client.query(probeCatalogSql)
    const names = Object.keys(probeCatalogQueries)
    if (!Array.isArray(batch) || batch.length !== names.length + 3)
      throw new Error("incompatible")
    require(
      batch[0]?.command === "BEGIN" &&
        batch[1]?.command === "SET" &&
        batch.at(-1)?.command === "ROLLBACK"
    )
    const catalog = Object.fromEntries(
      names.map((name, index) => {
        const result = batch[index + 2] as QueryResult
        require(result?.command === "SELECT" && Array.isArray(result.rows))
        return [name, result]
      })
    ) as Record<keyof typeof probeCatalogQueries, QueryResult>
    const role = catalog.role.rows[0]
    require(
      role?.same_role &&
        !role.rolsuper &&
        !role.rolbypassrls &&
        !role.rolcreaterole &&
        !role.rolcreatedb &&
        !role.rolreplication &&
        !role.rolinherit &&
        role.rolcanlogin &&
        !role.memberships &&
        !role.owns_tables &&
        !role.owns_schemas &&
        !role.creates_public &&
        role.uses_public &&
        role.uses_context
    )
    const tables = catalog.tables.rows
    const columns = catalog.columns.rows
    const policies = catalog.policies.rows
    const indexes = catalog.indexes.rows
    const enums = catalog.enums.rows
    for (const type of schemaManifest.enums)
      require(
        JSON.stringify(enums.find((row) => row.name === type.name)?.values) ===
          JSON.stringify(type.values)
      )
    const foreignKeys = catalog.foreignKeys.rows
    const actions: Record<string, string> = {
      cascade: "c",
      "no action": "a",
      restrict: "r",
      "set null": "n",
      "set default": "d",
    }
    const normalize = (expression: string | null) =>
      expression
        ?.replace(/[\s"()]/g, "")
        .replace(/\b[a-z_]+\./g, (qualifier) =>
          qualifier === "app_private." ? qualifier : ""
        ) ?? null
    for (const table of schemaManifest.tables) {
      const actual = tables.find((row) => row.name === table.name)
      require(
        actual &&
          actual.rls === Boolean(table.rls) &&
          actual.force === Boolean(table.rls)
      )
      const tableIndexes = indexes.filter(
        (row) => row.table_name === table.name
      )
      const sameColumns = (actual: string[], expected: readonly string[]) =>
        JSON.stringify(actual.map((column) => column.replaceAll('"', ""))) ===
        JSON.stringify(expected)
      if (table.primaryKey.length)
        require(
          tableIndexes.some(
            (index) =>
              index.primary &&
              index.constraint_type === "p" &&
              index.full_index &&
              index.simple_index &&
              index.unique &&
              index.valid &&
              index.ready &&
              sameColumns(index.columns, table.primaryKey)
          )
        )
      for (const unique of table.uniqueConstraints)
        require(
          tableIndexes.some(
            (index) =>
              index.name === unique.name &&
              index.constraint_type === "u" &&
              index.full_index &&
              index.simple_index &&
              index.unique &&
              index.valid &&
              index.ready &&
              index.nulls_not_distinct === unique.nullsNotDistinct &&
              sameColumns(index.columns, unique.columns)
          )
        )
      for (const required of table.indexes)
        require(
          tableIndexes.some(
            (index) =>
              index.name === required.name &&
              index.full_index &&
              index.simple_index &&
              index.unique === required.unique &&
              index.method === required.method &&
              index.valid &&
              index.ready &&
              sameColumns(index.columns, required.columns)
          )
        )
      for (const required of table.foreignKeys) {
        const key = foreignKeys.find(
          (row) => row.table_name === table.name && row.name === required.name
        )
        require(
          key?.foreign_table === required.table &&
            key.validated &&
            JSON.stringify(key.columns) === JSON.stringify(required.columns) &&
            JSON.stringify(key.foreign_columns) ===
              JSON.stringify(required.foreignColumns) &&
            key.on_delete === actions[required.onDelete] &&
            key.on_update === actions[required.onUpdate]
        )
      }
      const tablePolicies = policies.filter(
        (row) => row.tablename === table.name
      )
      require(tablePolicies.length === table.policies.length)
      for (const required of table.policies) {
        const policy = tablePolicies.find(
          (row) => row.policyname === required.name
        )
        require(
          policy &&
            policy.cmd === required.command &&
            policy.permissive === "PERMISSIVE" &&
            JSON.stringify(policy.roles) === '["public"]' &&
            normalize(policy.qual) === normalize(required.using) &&
            normalize(policy.with_check) === normalize(required.check)
        )
      }
      for (const column of table.columns) {
        const actualColumn = columns.find(
          (row) => row.table_name === table.name && row.name === column.name
        )
        require(
          actualColumn?.type === column.type &&
            actualColumn.not_null === column.notNull
        )
      }
    }
    const grants = catalog.grants.rows
    for (const grant of grants) {
      const known = schemaManifest.tables.some(
        (table) => table.name === grant.name
      )
      const allowed =
        known &&
        !operational.has(grant.name) &&
        (capability === "auth"
          ? identity.has(grant.name) &&
            ["SELECT", "INSERT", "UPDATE", "DELETE"].includes(grant.privilege)
          : !identity.has(grant.name) &&
            (grant.name === "workspaces"
              ? ["SELECT", "UPDATE"].includes(grant.privilege)
              : ["SELECT", "INSERT", "UPDATE", "DELETE"].includes(
                  grant.privilege
                )))
      require(grant.allowed === allowed)
    }
    const forbidden = catalog.forbidden.rows[0]
    require(
      forbidden && Object.values(forbidden).every((value) => value === false)
    )
    const columnGrants = catalog.columnGrants.rows
    for (const grant of columnGrants)
      require(
        grant.allowed ===
          (grant.schema_name === "public"
            ? grants.find(
                (tableGrant) =>
                  tableGrant.name === grant.name &&
                  tableGrant.privilege === grant.privilege
              )?.allowed
            : grant.schema_name === "drizzle" &&
              grant.name === "__drizzle_migrations" &&
              grant.privilege === "SELECT")
      )
    const migrations = catalog.migrations.rows
    for (const required of schemaManifest.migrations)
      require(
        migrations.some(
          (row) =>
            row.hash === required.hash &&
            Number(row.created_at) === required.createdAt
        )
      )
    require(catalog.extensions.rowCount === 1)
    const helpers = catalog.helpers.rows
    require(helpers.length === schemaManifest.helpers.length)
    for (const required of schemaManifest.helpers) {
      const helper = helpers.find((row) => row.proname === required.name)
      require(
        helper &&
          helper.provolatile === "s" &&
          !helper.prosecdef &&
          JSON.stringify(helper.proconfig) === '["search_path=pg_catalog"]' &&
          helper.pronargs === 0 &&
          helper.returns === required.returns &&
          helper.language === "sql" &&
          helper.executable &&
          !helper.owned &&
          helper.prosrc.trim().replace(/\s+/g, " ") === required.source
      )
    }
  }
  try {
    await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          expired = true
          reject(new Error("deadline"))
        }, 3_000)
      }),
    ])
  } catch {
    expired = true
    throw new Error("Database capability check failed")
  } finally {
    if (timer) clearTimeout(timer)
    client?.release(expired)
  }
}
