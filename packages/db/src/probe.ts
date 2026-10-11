import type { PoolClient } from "pg"
import type { DatabaseCapability, DatabaseHandle } from "./index.js"
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
const privileges = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "REFERENCES",
  "TRIGGER",
]
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
    await client.query("BEGIN READ ONLY")
    await client.query("SET LOCAL statement_timeout = '1000ms'")
    const role = (
      await client.query(`SELECT current_user = session_user AS same_role,
      r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb, r.rolreplication, r.rolinherit, r.rolcanlogin,
      EXISTS (SELECT 1 FROM pg_auth_members WHERE member = r.oid) AS memberships,
      EXISTS (SELECT 1 FROM pg_class c WHERE c.relowner = r.oid AND c.relnamespace IN
        (SELECT oid FROM pg_namespace WHERE nspname IN ('public', 'app_private', 'drizzle', 'pgboss'))) AS owns_tables,
      EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspowner = r.oid AND n.nspname IN
        ('public', 'app_private', 'drizzle', 'pgboss')) AS owns_schemas,
      has_schema_privilege(current_user, 'public', 'CREATE') AS creates_public,
      has_schema_privilege(current_user, 'public', 'USAGE') AS uses_public,
      has_schema_privilege(current_user, 'app_private', 'USAGE') AS uses_context
      FROM pg_roles r WHERE r.rolname = current_user`)
    ).rows[0]
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
    const tables = (
      await client.query(`SELECT c.relname AS name, c.relrowsecurity AS rls,
      c.relforcerowsecurity AS force FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'`)
    ).rows
    const columns = (
      await client.query(`SELECT c.relname AS table_name, a.attname AS name,
      format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS not_null
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped`)
    ).rows
    const policies = (
      await client.query(
        "SELECT tablename, policyname, cmd, qual, with_check, permissive, roles::text[] AS roles FROM pg_policies WHERE schemaname = 'public'"
      )
    ).rows
    const indexes = (
      await client.query(`SELECT table_row.relname AS table_name, index_row.relname AS name,
      i.indisunique AS unique, i.indisprimary AS primary, i.indisvalid AS valid, i.indisready AS ready,
      i.indnullsnotdistinct AS nulls_not_distinct, method.amname AS method,
      i.indpred IS NULL AS full_index, i.indexprs IS NULL AS simple_index, constraint_row.contype AS constraint_type,
      ARRAY(SELECT pg_get_indexdef(i.indexrelid, k.ord::integer, true) FROM unnest(i.indkey) WITH ORDINALITY k(attnum, ord) WHERE k.ord <= i.indnkeyatts ORDER BY k.ord) AS columns
      FROM pg_index i JOIN pg_class table_row ON table_row.oid = i.indrelid
      JOIN pg_class index_row ON index_row.oid = i.indexrelid JOIN pg_am method ON method.oid = index_row.relam
      LEFT JOIN pg_constraint constraint_row ON constraint_row.conindid = i.indexrelid AND constraint_row.conrelid = table_row.oid
      JOIN pg_namespace n ON n.oid = table_row.relnamespace WHERE n.nspname = 'public'`)
    ).rows
    const enums = (
      await client.query(`SELECT t.typname AS name, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS values
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' GROUP BY t.typname`)
    ).rows
    for (const type of schemaManifest.enums)
      require(
        JSON.stringify(enums.find((row) => row.name === type.name)?.values) ===
          JSON.stringify(type.values)
      )
    const foreignKeys = (
      await client.query(`SELECT source.relname AS table_name, constraint_row.conname AS name, target.relname AS foreign_table,
      ARRAY(SELECT a.attname::text FROM unnest(constraint_row.conkey) WITH ORDINALITY k(attnum, ord) JOIN pg_attribute a ON a.attrelid = source.oid AND a.attnum = k.attnum ORDER BY ord) AS columns,
      ARRAY(SELECT a.attname::text FROM unnest(constraint_row.confkey) WITH ORDINALITY k(attnum, ord) JOIN pg_attribute a ON a.attrelid = target.oid AND a.attnum = k.attnum ORDER BY ord) AS foreign_columns,
      constraint_row.confdeltype AS on_delete, constraint_row.confupdtype AS on_update, constraint_row.convalidated AS validated
      FROM pg_constraint constraint_row JOIN pg_class source ON source.oid = constraint_row.conrelid
      JOIN pg_class target ON target.oid = constraint_row.confrelid JOIN pg_namespace n ON n.oid = source.relnamespace
      WHERE n.nspname = 'public' AND constraint_row.contype = 'f'`)
    ).rows
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
    const grants = (
      await client.query(
        `SELECT c.relname AS name, p.privilege,
      has_table_privilege(current_user, c.oid, p.privilege) AS allowed
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN unnest($1::text[]) p(privilege)
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')`,
        [privileges]
      )
    ).rows
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
    const forbidden = (
      await client.query(`SELECT
      EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname IN ('app_private', 'drizzle', 'pgboss') AND has_schema_privilege(current_user, n.oid, 'CREATE')) AS creates_schema,
      EXISTS (SELECT 1 FROM pg_database d WHERE d.datname = current_database() AND d.datdba = (SELECT oid FROM pg_roles WHERE rolname = current_user)) AS owns_database,
      EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'pgboss' AND c.relkind IN ('r', 'p', 'v', 'm', 'f') AND has_table_privilege(current_user, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS queue_access,
      has_table_privilege(current_user, 'drizzle.__drizzle_migrations', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS edits_migrations,
      has_database_privilege(current_user, current_database(), 'TEMPORARY') AS creates_temporary,
      EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname IN ('public', 'app_private', 'drizzle', 'pgboss') AND p.prosecdef AND has_function_privilege(current_user, p.oid, 'EXECUTE')) AS privileged_functions`)
    ).rows[0]
    require(
      forbidden && Object.values(forbidden).every((value) => value === false)
    )
    const columnGrants = (
      await client.query(`SELECT n.nspname AS schema_name, c.relname AS name, p.privilege,
      has_any_column_privilege(current_user, c.oid, p.privilege) AS allowed
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) p(privilege)
      WHERE n.nspname IN ('public', 'drizzle', 'pgboss') AND c.relkind IN ('r', 'p', 'v', 'm', 'f')`)
    ).rows
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
    const migrations = (
      await client.query(
        "SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at"
      )
    ).rows
    for (const required of schemaManifest.migrations)
      require(
        migrations.some(
          (row) =>
            row.hash === required.hash &&
            Number(row.created_at) === required.createdAt
        )
      )
    require(
      (
        await client.query(
          "SELECT 1 FROM pg_extension WHERE extname = 'vector'"
        )
      ).rowCount === 1
    )
    const helpers = (
      await client.query(`SELECT p.proname, p.provolatile, p.prosecdef, p.proconfig, p.prosrc,
        p.pronargs, p.prorettype::regtype::text AS returns, l.lanname AS language,
        has_function_privilege(current_user, p.oid, 'EXECUTE') AS executable,
        p.proowner = (SELECT oid FROM pg_roles WHERE rolname = current_user) AS owned
        FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
        WHERE p.pronamespace = 'app_private'::regnamespace AND p.proname IN ('current_owner_id', 'current_workspace_id')`)
    ).rows
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
    await client.query("ROLLBACK")
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
