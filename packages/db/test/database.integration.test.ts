import assert from "node:assert/strict"
import { test } from "node:test"
import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import type { PoolClient } from "pg"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { createDatabase, probeDatabase } from "../dist/index.js"
import {
  createDatabaseTestFixture,
  validateTestAdminUrl,
} from "./helpers/database-fixture.mjs"
import { provisionRuntimeRoles } from "../scripts/role-profiles.mjs"

const adminUrl = process.env.RLS_TEST_ADMIN_URL
if (!adminUrl)
  throw new Error(
    "RLS_TEST_ADMIN_URL is required for disposable database tests"
  )

test("test fixture rejects remote hosts and role connection options", () => {
  for (const url of [
    "postgresql://admin:secret@example.com/db",
    "postgresql://admin:secret@localhost/db",
    "postgresql://admin:secret@127.0.0.1/db?options=-c%20role%3Dadmin",
  ])
    assert.throws(() => validateTestAdminUrl(url))
})

test("readiness preserves its deadline and privilege checks over a latent connection", async () => {
  const fixture = await createDatabaseTestFixture(adminUrl)
  const profiles = ["auth", "business"] as const
  const handles = {
    auth: createDatabase(fixture.urls.auth, { max: 1 }),
    business: createDatabase(fixture.urls.business, { max: 1 }),
  }
  const queryCounts = { auth: 0, business: 0 }
  const connections = {
    auth: handles.auth.pool.connect.bind(handles.auth.pool),
    business: handles.business.pool.connect.bind(handles.business.pool),
  }
  for (const profile of profiles) {
    handles[profile].pool.connect = async () => {
      // Model a cold remote connection plus one 200ms network round trip for
      // each query call. The former sequential probe exceeded 3s on this path.
      await delay(1_000)
      const client = await connections[profile]()
      return {
        async query(text: string) {
          queryCounts[profile]++
          await delay(200)
          return client.query(text)
        },
        release: client.release.bind(client),
      } as PoolClient
    }
  }
  try {
    await Promise.all(
      profiles.map(async (profile) => {
        const started = Date.now()
        await probeDatabase(handles[profile], profile)
        assert.ok(Date.now() - started < 3_000)
        assert.equal(queryCounts[profile], 1)
        const client = await connections[profile]()
        try {
          const settings = await client.query(
            "SELECT current_setting('transaction_read_only') AS read_only, current_setting('statement_timeout') AS timeout"
          )
          assert.deepEqual(settings.rows[0], {
            read_only: "off",
            timeout: "2s",
          })
        } finally {
          client.release()
        }
      })
    )
    await fixture.pools.admin.query(
      `GRANT SELECT ON public."user" TO "${fixture.roles.business}"`
    )
    try {
      await assert.rejects(probeDatabase(handles.business, "business"), {
        message: "Database capability check failed",
      })
    } finally {
      await fixture.pools.admin.query(
        `REVOKE SELECT ON public."user" FROM "${fixture.roles.business}"`
      )
    }
    assert.equal(queryCounts.business, 2)
    await probeDatabase(handles.business, "business")
    assert.equal(queryCounts.business, 3)
  } finally {
    await Promise.all(Object.values(handles).map((handle) => handle.pool.end()))
    await fixture.close()
  }
})

test("real LOGIN roles and compatibility probe enforce capability boundaries", async (t) => {
  const fixture = await createDatabaseTestFixture(adminUrl)
  const auth = createDatabase(fixture.urls.auth, { max: 2 })
  const business = createDatabase(fixture.urls.business, { max: 2 })
  try {
    await t.test(
      "auth and business authenticate without changing session role",
      async () => {
        for (const kind of ["auth", "business", "migrator", "jobs"] as const) {
          const row = (
            await fixture.pools[kind].query("SELECT current_user, session_user")
          ).rows[0]
          assert.equal(row.current_user, fixture.roles[kind])
          assert.equal(row.session_user, fixture.roles[kind])
        }
        await Promise.all([
          probeDatabase(auth, "auth"),
          probeDatabase(business, "business"),
        ])
        await assert.rejects(probeDatabase(auth, "business"))
        await assert.rejects(probeDatabase(business, "auth"))
        await assert.rejects(
          fixture.pools.auth.query("SELECT * FROM workspaces"),
          { code: "42501" }
        )
        await assert.rejects(
          fixture.pools.business.query('SELECT * FROM public."user"'),
          { code: "42501" }
        )
        for (const pool of [
          fixture.pools.auth,
          fixture.pools.business,
          fixture.pools.jobs,
        ]) {
          await assert.rejects(pool.query("SELECT * FROM audit_events"), {
            code: "42501",
          })
          await assert.rejects(
            pool.query("CREATE TABLE public.runtime_ddl (id int)"),
            { code: "42501" }
          )
          await assert.rejects(
            pool.query("CREATE TEMP TABLE runtime_temp_ddl (id int)"),
            { code: "42501" }
          )
          await assert.rejects(
            pool.query(`SET ROLE "${fixture.roles.migrator}"`),
            { code: "42501" }
          )
        }
      }
    )
    await t.test("repeated migrations preserve data and hashes", async () => {
      await fixture.pools.admin.query(
        "INSERT INTO workspaces (owner_id, name, website_origin) VALUES ('owner', 'Preserved', 'https://preserve.test')"
      )
      await fixture.migrate()
      assert.equal(
        (await fixture.pools.admin.query("SELECT name FROM workspaces")).rows[0]
          .name,
        "Preserved"
      )
      assert.equal(
        (
          await fixture.pools.admin.query(
            "SELECT * FROM drizzle.__drizzle_migrations"
          )
        ).rowCount,
        3
      )
    })
    const mutation = async (
      name: string,
      change: string,
      restore: string,
      handle = business,
      capability: "auth" | "business" = "business"
    ) =>
      t.test(name, async () => {
        await fixture.pools.admin.query(change)
        try {
          await assert.rejects(probeDatabase(handle, capability), {
            message: "Database capability check failed",
          })
        } finally {
          await fixture.pools.admin.query(restore)
        }
        await probeDatabase(handle, capability)
      })
    await mutation(
      "prohibited identity grants fail readiness",
      `GRANT SELECT ON public."user" TO "${fixture.roles.business}"`,
      `REVOKE SELECT ON public."user" FROM "${fixture.roles.business}"`
    )
    await mutation(
      "unsafe role flags fail readiness",
      `ALTER ROLE "${fixture.roles.auth}" BYPASSRLS`,
      `ALTER ROLE "${fixture.roles.auth}" NOBYPASSRLS`,
      auth,
      "auth"
    )
    await mutation(
      "role membership fails readiness",
      `GRANT "${fixture.roles.migrator}" TO "${fixture.roles.business}"`,
      `REVOKE "${fixture.roles.migrator}" FROM "${fixture.roles.business}"`
    )
    await mutation(
      "inheriting role profiles fail readiness",
      `ALTER ROLE "${fixture.roles.business}" INHERIT`,
      `ALTER ROLE "${fixture.roles.business}" NOINHERIT`
    )
    await mutation(
      "disabled LOGIN profiles fail readiness on an existing connection",
      `ALTER ROLE "${fixture.roles.business}" NOLOGIN`,
      `ALTER ROLE "${fixture.roles.business}" LOGIN`
    )
    await mutation(
      "missing FORCE RLS fails readiness",
      "ALTER TABLE workspaces NO FORCE ROW LEVEL SECURITY",
      "ALTER TABLE workspaces FORCE ROW LEVEL SECURITY"
    )
    await mutation(
      "missing composite foreign key fails readiness",
      "ALTER TABLE knowledge_revisions DROP CONSTRAINT knowledge_revision_source_workspace_fk",
      "ALTER TABLE knowledge_revisions ADD CONSTRAINT knowledge_revision_source_workspace_fk FOREIGN KEY (workspace_id, source_id) REFERENCES knowledge_sources (workspace_id, id) ON DELETE CASCADE"
    )
    await mutation(
      "altered enum labels fail readiness",
      "ALTER TYPE knowledge_source_type RENAME VALUE 'faq' TO 'unexpected'",
      "ALTER TYPE knowledge_source_type RENAME VALUE 'unexpected' TO 'faq'"
    )
    await mutation(
      "altered tenant policy fails readiness",
      "ALTER POLICY monthly_usage_tenant_policy ON monthly_usage USING (true)",
      "ALTER POLICY monthly_usage_tenant_policy ON monthly_usage USING (workspace_id = app_private.current_workspace_id())"
    )
    const helperDefinition = (
      await fixture.pools.admin.query(
        "SELECT pg_get_functiondef('app_private.current_workspace_id()'::regprocedure) AS definition"
      )
    ).rows[0].definition
    await mutation(
      "constant workspace context helper fails readiness",
      "CREATE OR REPLACE FUNCTION app_private.current_workspace_id() RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$ SELECT '11111111-1111-4111-8111-111111111111'::uuid; $$",
      helperDefinition
    )
    const ownerHelperDefinition = (
      await fixture.pools.admin.query(
        "SELECT pg_get_functiondef('app_private.current_owner_id()'::regprocedure) AS definition"
      )
    ).rows[0].definition
    await mutation(
      "constant owner context helper fails readiness",
      "CREATE OR REPLACE FUNCTION app_private.current_owner_id() RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$ SELECT 'foreign-owner'::text; $$",
      ownerHelperDefinition
    )
    for (const name of ["current_owner_id", "current_workspace_id"])
      await mutation(
        `missing ${name} EXECUTE fails readiness`,
        `REVOKE EXECUTE ON FUNCTION app_private.${name}() FROM PUBLIC`,
        `GRANT EXECUTE ON FUNCTION app_private.${name}() TO PUBLIC`
      )
    await mutation(
      "temporary database privileges fail readiness",
      `GRANT TEMPORARY ON DATABASE "${fixture.databaseName}" TO "${fixture.roles.business}"`,
      `REVOKE TEMPORARY ON DATABASE "${fixture.databaseName}" FROM "${fixture.roles.business}"`
    )
    await mutation(
      "missing identity email uniqueness fails readiness",
      'ALTER TABLE public."user" DROP CONSTRAINT user_email_unique',
      'ALTER TABLE public."user" ADD CONSTRAINT user_email_unique UNIQUE (email)',
      auth,
      "auth"
    )
    await mutation(
      "missing identity session token uniqueness fails readiness",
      "ALTER TABLE public.session DROP CONSTRAINT session_token_unique",
      "ALTER TABLE public.session ADD CONSTRAINT session_token_unique UNIQUE (token)",
      auth,
      "auth"
    )
    await mutation(
      "missing identity rate limit key uniqueness fails readiness",
      "ALTER TABLE public.rate_limit DROP CONSTRAINT rate_limit_key_unique",
      "ALTER TABLE public.rate_limit ADD CONSTRAINT rate_limit_key_unique UNIQUE (key)",
      auth,
      "auth"
    )
    await mutation(
      "identity column grants fail readiness",
      `GRANT SELECT (email) ON public."user" TO "${fixture.roles.business}"`,
      `REVOKE SELECT (email) ON public."user" FROM "${fixture.roles.business}"`
    )
    await mutation(
      "wrong vector dimension fails readiness",
      "ALTER TABLE knowledge_chunks ALTER COLUMN embedding TYPE vector(3)",
      "ALTER TABLE knowledge_chunks ALTER COLUMN embedding TYPE vector(1536)"
    )
    await mutation(
      "table ownership fails readiness",
      `ALTER TABLE monthly_usage OWNER TO "${fixture.roles.business}"`,
      `ALTER TABLE monthly_usage OWNER TO "${fixture.roles.migrator}"; REVOKE ALL ON monthly_usage FROM "${fixture.roles.business}"; GRANT SELECT, INSERT, UPDATE, DELETE ON monthly_usage TO "${fixture.roles.business}"`
    )
    await mutation(
      "migration hash mismatch fails readiness",
      "UPDATE drizzle.__drizzle_migrations SET hash = 'altered' WHERE id = 1",
      "UPDATE drizzle.__drizzle_migrations SET hash = '" +
        (
          await fixture.pools.admin.query(
            "SELECT hash FROM drizzle.__drizzle_migrations WHERE id = 1"
          )
        ).rows[0].hash +
        "' WHERE id = 1"
    )
  } finally {
    await Promise.all([auth.pool.end(), business.pool.end()])
    await fixture.close()
  }
})

test("supported initial-schema upgrade preserves tenant data", async () => {
  const fixture = await createDatabaseTestFixture(adminUrl, { migrate: false })
  const directory = await mkdtemp(join(tmpdir(), "nthawi-upgrade-"))
  try {
    await mkdir(join(directory, "meta"))
    const source = new URL("../drizzle/", import.meta.url)
    const journal = JSON.parse(
      await readFile(new URL("meta/_journal.json", source), "utf8")
    )
    journal.entries = journal.entries.slice(0, 1)
    await writeFile(
      join(directory, "meta/_journal.json"),
      JSON.stringify(journal)
    )
    await writeFile(
      join(directory, "0000_initial_app.sql"),
      await readFile(new URL("0000_initial_app.sql", source))
    )
    await migrate(drizzle(fixture.pools.migrator), {
      migrationsFolder: directory,
    })
    await fixture.pools.migrator.query(
      "INSERT INTO workspaces (owner_id, name, website_origin) VALUES ('upgrade-owner', 'Upgrade preserved', 'https://upgrade.test')"
    )
    await fixture.migrate()
    assert.equal(
      (await fixture.pools.admin.query("SELECT name FROM workspaces")).rows[0]
        .name,
      "Upgrade preserved"
    )
    assert.equal(
      (
        await fixture.pools.admin.query(
          "SELECT * FROM drizzle.__drizzle_migrations"
        )
      ).rowCount,
      3
    )
    const business = createDatabase(fixture.urls.business)
    try {
      await probeDatabase(business, "business")
    } finally {
      await business.pool.end()
    }
  } finally {
    await fixture.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test("role provisioning verifies profile safety and removes residual grants", async (t) => {
  const fixture = await createDatabaseTestFixture(adminUrl)
  try {
    await t.test("unsafe role flags reject provisioning", async () => {
      await fixture.pools.admin.query(
        `ALTER ROLE "${fixture.roles.auth}" BYPASSRLS`
      )
      try {
        await assert.rejects(
          provisionRuntimeRoles(fixture.pools.migrator, fixture.roles)
        )
      } finally {
        await fixture.pools.admin.query(
          `ALTER ROLE "${fixture.roles.auth}" NOBYPASSRLS`
        )
      }
    })
    await t.test("role memberships reject provisioning", async () => {
      await fixture.pools.admin.query(
        `GRANT "${fixture.roles.migrator}" TO "${fixture.roles.business}"`
      )
      try {
        await assert.rejects(
          provisionRuntimeRoles(fixture.pools.migrator, fixture.roles)
        )
      } finally {
        await fixture.pools.admin.query(
          `REVOKE "${fixture.roles.migrator}" FROM "${fixture.roles.business}"`
        )
      }
    })
    await t.test(
      "duplicate profiles and the wrong migrator reject provisioning",
      async () => {
        await assert.rejects(
          provisionRuntimeRoles(fixture.pools.migrator, {
            ...fixture.roles,
            business: fixture.roles.auth,
          })
        )
        await assert.rejects(
          provisionRuntimeRoles(fixture.pools.admin, fixture.roles)
        )
      }
    )
    await t.test(
      "column grants and schema CREATE are revoked before success",
      async () => {
        await fixture.pools.admin.query(
          `GRANT SELECT (email) ON public."user" TO "${fixture.roles.business}"; GRANT CREATE ON SCHEMA public, app_private TO "${fixture.roles.business}"`
        )
        await provisionRuntimeRoles(fixture.pools.migrator, fixture.roles)
        const grants = (
          await fixture.pools.business.query(
            "SELECT has_any_column_privilege(current_user, 'public.\"user\"', 'SELECT') AS identity, has_schema_privilege(current_user, 'public', 'CREATE') AS ddl"
          )
        ).rows[0]
        assert.deepEqual(grants, { identity: false, ddl: false })
        const handle = createDatabase(fixture.urls.business)
        try {
          await probeDatabase(handle, "business")
        } finally {
          await handle.pool.end()
        }
      }
    )
  } finally {
    await fixture.close()
  }
})

test("metadata and queue column permissions fail readiness and are reconciled", async (t) => {
  const fixture = await createDatabaseTestFixture(adminUrl)
  const handles = {
    auth: createDatabase(fixture.urls.auth),
    business: createDatabase(fixture.urls.business),
  }
  try {
    await fixture.pools.migrator.query(
      "CREATE TABLE drizzle.permission_probe (id integer); CREATE SCHEMA pgboss; CREATE TABLE pgboss.permission_probe (id integer)"
    )
    for (const profile of ["auth", "business"] as const) {
      for (const [table, privilege, column] of [
        ["drizzle.__drizzle_migrations", "INSERT", "hash"],
        ["drizzle.__drizzle_migrations", "UPDATE", "hash"],
        ["drizzle.__drizzle_migrations", "REFERENCES", "hash"],
        ["drizzle.permission_probe", "SELECT", "id"],
        ["pgboss.permission_probe", "SELECT", "id"],
      ])
        await t.test(
          `${profile}: ${table} ${privilege} column grant fails readiness`,
          async () => {
            await fixture.pools.migrator.query(
              `GRANT ${privilege} (${column}) ON ${table} TO "${fixture.roles[profile]}"`
            )
            try {
              await assert.rejects(probeDatabase(handles[profile], profile), {
                message: "Database capability check failed",
              })
            } finally {
              await fixture.pools.migrator.query(
                `REVOKE ${privilege} (${column}) ON ${table} FROM "${fixture.roles[profile]}"`
              )
            }
            await probeDatabase(handles[profile], profile)
          }
        )
    }
    await t.test(
      "reprovision removes residual metadata and API queue grants",
      async () => {
        const runtime = Object.values(fixture.roles)
          .filter((role) => role !== fixture.roles.migrator)
          .map((role) => `"${role}"`)
          .join(", ")
        await fixture.pools.migrator.query(
          `GRANT UPDATE (hash) ON drizzle.__drizzle_migrations TO ${runtime}; GRANT SELECT, UPDATE ON drizzle.permission_probe TO ${runtime}; GRANT SELECT (id) ON pgboss.permission_probe TO "${fixture.roles.auth}", "${fixture.roles.business}"`
        )
        await provisionRuntimeRoles(fixture.pools.migrator, fixture.roles)
        for (const profile of ["auth", "business", "jobs"] as const) {
          const permissions = (
            await fixture.pools.migrator.query(
              "SELECT has_any_column_privilege($1, 'drizzle.__drizzle_migrations', 'UPDATE') AS journal_write, has_any_column_privilege($1, 'drizzle.permission_probe', 'SELECT') AS extra_metadata, has_any_column_privilege($1, 'pgboss.permission_probe', 'SELECT') AS queue_read",
              [fixture.roles[profile]]
            )
          ).rows[0]
          assert.deepEqual(permissions, {
            journal_write: false,
            extra_metadata: false,
            queue_read: false,
          })
        }
        await Promise.all([
          probeDatabase(handles.auth, "auth"),
          probeDatabase(handles.business, "business"),
        ])
      }
    )
  } finally {
    await Promise.all(Object.values(handles).map((handle) => handle.pool.end()))
    await fixture.close()
  }
})
