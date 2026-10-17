// All statements are fixed catalog reads. Keep the batch free of parameters,
// names and connection values so pg uses one simple-protocol round trip.
export const probeCatalogQueries = {
  role: `SELECT current_user = session_user AS same_role,
      r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb, r.rolreplication, r.rolinherit, r.rolcanlogin,
      EXISTS (SELECT 1 FROM pg_auth_members WHERE member = r.oid) AS memberships,
      EXISTS (SELECT 1 FROM pg_class c WHERE c.relowner = r.oid AND c.relnamespace IN
        (SELECT oid FROM pg_namespace WHERE nspname IN ('public', 'app_private', 'drizzle', 'pgboss'))) AS owns_tables,
      EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspowner = r.oid AND n.nspname IN
        ('public', 'app_private', 'drizzle', 'pgboss')) AS owns_schemas,
      has_schema_privilege(current_user, 'public', 'CREATE') AS creates_public,
      has_schema_privilege(current_user, 'public', 'USAGE') AS uses_public,
      has_schema_privilege(current_user, 'app_private', 'USAGE') AS uses_context
      FROM pg_roles r WHERE r.rolname = current_user`,
  tables: `SELECT c.relname AS name, c.relrowsecurity AS rls,
      c.relforcerowsecurity AS force FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'`,
  columns: `SELECT c.relname AS table_name, a.attname AS name,
      format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS not_null
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped`,
  policies:
    "SELECT tablename, policyname, cmd, qual, with_check, permissive, roles::text[] AS roles FROM pg_policies WHERE schemaname = 'public'",
  indexes: `SELECT table_row.relname AS table_name, index_row.relname AS name,
      i.indisunique AS unique, i.indisprimary AS primary, i.indisvalid AS valid, i.indisready AS ready,
      i.indnullsnotdistinct AS nulls_not_distinct, method.amname AS method,
      i.indpred IS NULL AS full_index, i.indexprs IS NULL AS simple_index, constraint_row.contype AS constraint_type,
      ARRAY(SELECT pg_get_indexdef(i.indexrelid, k.ord::integer, true) FROM unnest(i.indkey) WITH ORDINALITY k(attnum, ord) WHERE k.ord <= i.indnkeyatts ORDER BY k.ord) AS columns
      FROM pg_index i JOIN pg_class table_row ON table_row.oid = i.indrelid
      JOIN pg_class index_row ON index_row.oid = i.indexrelid JOIN pg_am method ON method.oid = index_row.relam
      LEFT JOIN pg_constraint constraint_row ON constraint_row.conindid = i.indexrelid AND constraint_row.conrelid = table_row.oid
      JOIN pg_namespace n ON n.oid = table_row.relnamespace WHERE n.nspname = 'public'`,
  enums: `SELECT t.typname AS name, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS values
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' GROUP BY t.typname`,
  foreignKeys: `SELECT source.relname AS table_name, constraint_row.conname AS name, target.relname AS foreign_table,
      ARRAY(SELECT a.attname::text FROM unnest(constraint_row.conkey) WITH ORDINALITY k(attnum, ord) JOIN pg_attribute a ON a.attrelid = source.oid AND a.attnum = k.attnum ORDER BY ord) AS columns,
      ARRAY(SELECT a.attname::text FROM unnest(constraint_row.confkey) WITH ORDINALITY k(attnum, ord) JOIN pg_attribute a ON a.attrelid = target.oid AND a.attnum = k.attnum ORDER BY ord) AS foreign_columns,
      constraint_row.confdeltype AS on_delete, constraint_row.confupdtype AS on_update, constraint_row.convalidated AS validated
      FROM pg_constraint constraint_row JOIN pg_class source ON source.oid = constraint_row.conrelid
      JOIN pg_class target ON target.oid = constraint_row.confrelid JOIN pg_namespace n ON n.oid = source.relnamespace
      WHERE n.nspname = 'public' AND constraint_row.contype = 'f'`,
  grants: `SELECT c.relname AS name, p.privilege,
      has_table_privilege(current_user, c.oid, p.privilege) AS allowed
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']::text[]) p(privilege)
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')`,
  forbidden: `SELECT
      EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname IN ('app_private', 'drizzle', 'pgboss') AND has_schema_privilege(current_user, n.oid, 'CREATE')) AS creates_schema,
      EXISTS (SELECT 1 FROM pg_database d WHERE d.datname = current_database() AND d.datdba = (SELECT oid FROM pg_roles WHERE rolname = current_user)) AS owns_database,
      EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'pgboss' AND c.relkind IN ('r', 'p', 'v', 'm', 'f') AND has_table_privilege(current_user, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS queue_access,
      has_table_privilege(current_user, 'drizzle.__drizzle_migrations', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS edits_migrations,
      has_database_privilege(current_user, current_database(), 'TEMPORARY') AS creates_temporary,
      EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname IN ('public', 'app_private', 'drizzle', 'pgboss') AND p.prosecdef AND has_function_privilege(current_user, p.oid, 'EXECUTE')) AS privileged_functions`,
  columnGrants: `SELECT n.nspname AS schema_name, c.relname AS name, p.privilege,
      has_any_column_privilege(current_user, c.oid, p.privilege) AS allowed
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) p(privilege)
      WHERE n.nspname IN ('public', 'drizzle', 'pgboss') AND c.relkind IN ('r', 'p', 'v', 'm', 'f')`,
  migrations:
    "SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at",
  extensions: "SELECT 1 FROM pg_extension WHERE extname = 'vector'",
  helpers: `SELECT p.proname, p.provolatile, p.prosecdef, p.proconfig, p.prosrc,
        p.pronargs, p.prorettype::regtype::text AS returns, l.lanname AS language,
        has_function_privilege(current_user, p.oid, 'EXECUTE') AS executable,
        p.proowner = (SELECT oid FROM pg_roles WHERE rolname = current_user) AS owned
        FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
        WHERE p.pronamespace = 'app_private'::regnamespace AND p.proname IN ('current_owner_id', 'current_workspace_id')`,
} as const

export const probeCatalogSql = [
  "BEGIN READ ONLY",
  "SET LOCAL statement_timeout = '1000ms'",
  ...Object.values(probeCatalogQueries),
  "ROLLBACK",
].join(";\n")
