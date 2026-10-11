export const authTables = [
  "user",
  "session",
  "account",
  "verification",
  "rate_limit",
]
export const tenantTables = [
  "assistants",
  "knowledge_sources",
  "knowledge_revisions",
  "knowledge_chunks",
  "widget_installations",
  "visitor_sessions",
  "conversations",
  "messages",
  "citations",
  "ai_invocations",
  "monthly_usage",
]
export function identifier(value) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(value))
    throw new Error("Invalid role identifier")
  return `"${value}"`
}

async function validateProfiles(pool, migrationRole, runtimeRoles) {
  const principal = (
    await pool.query(`SELECT current_user AS current_role, session_user AS login_role,
    datdba = (SELECT oid FROM pg_roles WHERE rolname = current_user) AS owns_database
    FROM pg_database WHERE datname = current_database()`)
  ).rows[0]
  if (
    !principal?.owns_database ||
    principal.current_role !== principal.login_role ||
    (migrationRole && principal.current_role !== migrationRole)
  )
    throw new Error(
      "Role provisioning requires the named migrator database owner"
    )
  const names = [migrationRole ?? principal.current_role, ...runtimeRoles]
  if (new Set(names).size !== names.length)
    throw new Error("Database role profiles must be distinct")
  names.forEach(identifier)
  const rows = (
    await pool.query(
      `SELECT r.rolname AS name, r.rolsuper, r.rolbypassrls, r.rolcreatedb,
    r.rolcreaterole, r.rolreplication, r.rolinherit, r.rolcanlogin,
    EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member = r.oid) AS memberships,
    EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspowner = r.oid AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema') AS owns_schema,
    EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relowner = r.oid AND n.nspname IN ('public', 'app_private', 'drizzle', 'pgboss')) AS owns_tables,
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.proowner = r.oid AND n.nspname IN ('public', 'app_private', 'drizzle', 'pgboss')) AS owns_functions,
    EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typowner = r.oid AND n.nspname IN ('public', 'app_private', 'drizzle', 'pgboss')) AS owns_types
    FROM pg_roles r WHERE r.rolname = ANY($1::text[])`,
      [names]
    )
  ).rows
  if (
    rows.length !== names.length ||
    rows.some(
      (role) =>
        role.rolsuper ||
        role.rolbypassrls ||
        role.rolcreatedb ||
        role.rolcreaterole ||
        role.rolreplication ||
        role.rolinherit ||
        !role.rolcanlogin ||
        role.memberships ||
        (runtimeRoles.includes(role.name) &&
          (role.owns_schema ||
            role.owns_tables ||
            role.owns_functions ||
            role.owns_types))
    )
  )
    throw new Error("Unsafe database role profile")
}

async function revokeColumnPrivileges(pool, schema, roles) {
  const columns = (
    await pool.query(
      `SELECT c.relname AS table_name, array_agg(a.attname::text ORDER BY a.attnum) AS columns
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = $1 AND c.relkind IN ('r', 'p', 'v', 'm', 'f') AND a.attnum > 0 AND NOT a.attisdropped
    GROUP BY c.relname`,
      [schema]
    )
  ).rows
  const grantees = ["PUBLIC", ...roles.map(identifier)].join(", ")
  for (const table of columns)
    await pool.query(
      `REVOKE ALL (${table.columns.map(identifier).join(", ")}) ON TABLE ${identifier(schema)}.${identifier(table.table_name)} FROM ${grantees}`
    )
}

// Run as the schema owner after migration. Credentials and role creation are a
// separate administrator operation; runtime roles never belong to each other.
export async function provisionRuntimeRoles(pool, roles) {
  identifier(roles.migrator)
  await validateProfiles(pool, roles.migrator, [
    roles.auth,
    roles.business,
    roles.jobs,
  ])
  const runtime = [roles.auth, roles.business, roles.jobs]
    .map(identifier)
    .join(", ")
  const temporaryRevocation = (
    await pool.query(
      "SELECT format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC, %I, %I, %I', current_database(), $1::text, $2::text, $3::text) AS statement",
      [roles.auth, roles.business, roles.jobs]
    )
  ).rows[0].statement
  await pool.query(temporaryRevocation)
  await pool.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC")
  const schemas = (
    await pool.query(
      "SELECT nspname AS name FROM pg_namespace WHERE nspname IN ('public', 'app_private', 'drizzle', 'pgboss')"
    )
  ).rows
  for (const schema of schemas)
    await pool.query(
      `REVOKE CREATE ON SCHEMA ${identifier(schema.name)} FROM PUBLIC, ${runtime}`
    )
  await pool.query("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC")
  await pool.query("REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC")
  await pool.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${runtime}`)
  await revokeColumnPrivileges(pool, "public", [
    roles.auth,
    roles.business,
    roles.jobs,
  ])
  await pool.query(
    `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${runtime}`
  )
  await pool.query(
    `REVOKE ALL ON ALL TABLES IN SCHEMA drizzle FROM PUBLIC, ${runtime}`
  )
  await pool.query(
    `REVOKE ALL ON ALL SEQUENCES IN SCHEMA drizzle FROM PUBLIC, ${runtime}`
  )
  await revokeColumnPrivileges(pool, "drizzle", [
    roles.auth,
    roles.business,
    roles.jobs,
  ])
  if (schemas.some((schema) => schema.name === "pgboss")) {
    const api = [roles.auth, roles.business].map(identifier).join(", ")
    await pool.query(
      `REVOKE ALL ON ALL TABLES IN SCHEMA pgboss FROM PUBLIC, ${api}`
    )
    await pool.query(
      `REVOKE ALL ON ALL SEQUENCES IN SCHEMA pgboss FROM PUBLIC, ${api}`
    )
    await revokeColumnPrivileges(pool, "pgboss", [roles.auth, roles.business])
  }
  await pool.query(
    `GRANT USAGE ON SCHEMA public, app_private TO ${identifier(roles.auth)}, ${identifier(roles.business)}`
  )
  await pool.query(
    `GRANT USAGE ON SCHEMA drizzle TO ${identifier(roles.auth)}, ${identifier(roles.business)}`
  )
  await pool.query(
    `GRANT SELECT ON drizzle.__drizzle_migrations TO ${identifier(roles.auth)}, ${identifier(roles.business)}`
  )
  await pool.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ${authTables.map((name) => `public.${identifier(name)}`).join(", ")} TO ${identifier(roles.auth)}`
  )
  await pool.query(
    `GRANT SELECT, UPDATE ON public.workspaces TO ${identifier(roles.business)}`
  )
  await pool.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ${tenantTables.map((name) => `public.${identifier(name)}`).join(", ")} TO ${identifier(roles.business)}`
  )
  await validateProfiles(pool, roles.migrator, [
    roles.auth,
    roles.business,
    roles.jobs,
  ])
}

export async function provisionJobsSchema(pool, role) {
  await validateProfiles(pool, undefined, [role])
  const name = identifier(role)
  await pool.query("REVOKE ALL ON SCHEMA pgboss FROM PUBLIC")
  await pool.query(`REVOKE ALL ON SCHEMA pgboss FROM ${name}`)
  await pool.query(
    `REVOKE ALL ON ALL TABLES IN SCHEMA pgboss FROM PUBLIC, ${name}`
  )
  await pool.query(
    `REVOKE ALL ON ALL SEQUENCES IN SCHEMA pgboss FROM PUBLIC, ${name}`
  )
  await pool.query(
    `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss FROM PUBLIC, ${name}`
  )
  // Table REVOKE does not remove separately granted column privileges. Remove
  // them too, including old bam.command grants, before applying the allowlist.
  await revokeColumnPrivileges(pool, "pgboss", [role])
  await pool.query(`GRANT USAGE ON SCHEMA pgboss TO ${name}`)
  await pool.query(`GRANT SELECT ON pgboss.version, pgboss.queue TO ${name}`)
  const jobs = (
    await pool.query(`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'pgboss' AND c.relkind IN ('r', 'p') AND
      (c.relname IN ('job', 'job_common', 'job_dependency') OR EXISTS
        (SELECT 1 FROM pg_inherits i WHERE i.inhrelid = c.oid AND i.inhparent = 'pgboss.job'::regclass))`)
  ).rows
  for (const table of jobs)
    await pool.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON pgboss.${identifier(table.name)} TO ${name}`
    )
  // pg-boss 12.35 worker DML needs only the invoker clock helper. Queue DDL,
  // version writes and bam's stored commands stay exclusively with migrator.
  await pool.query(`GRANT EXECUTE ON FUNCTION pgboss.job_now() TO ${name}`)
}
