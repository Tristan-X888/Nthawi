import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"
import { test } from "node:test"
import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client, Pool } from "pg"
import { knowledgeSources } from "../src/schema/app.ts"
import { withTenantTransaction } from "../src/tenant.ts"
import { createDatabaseTestFixture } from "./helpers/database-fixture.mjs"

const adminUrl = process.env.RLS_TEST_ADMIN_URL
if (!adminUrl) {
  throw new Error(
    "Set RLS_TEST_ADMIN_URL to a local disposable PostgreSQL superuser connection (see packages/db/README.md)."
  )
}

const tenantTables = [
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
const protectedTables = ["workspaces", ...tenantTables]
const identityTables = [
  "user",
  "session",
  "account",
  "verification",
  "rate_limit",
]
const operationalTables = [
  "audit_events",
  "global_monthly_ai_usage",
  "deletion_journal",
]
const workspaceA = randomUUID()
const workspaceB = randomUUID()
const ownerA = "owner-a"
const ownerB = "owner-b"

// Real rows in every protected table, including the composite foreign-key graph.
function fixtures(workspaceId: string) {
  const source = randomUUID()
  const revision = randomUUID()
  const chunk = randomUUID()
  const visitor = randomUUID()
  const conversation = randomUUID()
  const message = randomUUID()
  return new Map<string, Record<string, unknown>>([
    [
      "assistants",
      { workspace_id: workspaceId, name: "Assistant", greeting: "Hello" },
    ],
    [
      "knowledge_sources",
      { id: source, workspace_id: workspaceId, type: "text", title: "Source" },
    ],
    [
      "knowledge_revisions",
      {
        id: revision,
        workspace_id: workspaceId,
        source_id: source,
        ordinal: 1,
        content_hash: "hash",
      },
    ],
    [
      "knowledge_chunks",
      {
        id: chunk,
        workspace_id: workspaceId,
        revision_id: revision,
        ordinal: 1,
        content: "Text",
        token_count: 1,
        embedding_model: "test",
        embedding_dimensions: 1536,
        embedding: JSON.stringify(Array(1536).fill(0)),
      },
    ],
    [
      "widget_installations",
      {
        workspace_id: workspaceId,
        public_id: randomUUID(),
        allowed_origin: "https://example.test",
      },
    ],
    [
      "visitor_sessions",
      {
        id: visitor,
        workspace_id: workspaceId,
        credential_hash: randomUUID(),
        privacy_notice_version: "1",
        expires_at: "2099-01-01",
      },
    ],
    [
      "conversations",
      {
        id: conversation,
        workspace_id: workspaceId,
        visitor_session_id: visitor,
      },
    ],
    [
      "messages",
      {
        id: message,
        workspace_id: workspaceId,
        conversation_id: conversation,
        sequence: "1",
        sender: "visitor",
        body: "Hello",
      },
    ],
    [
      "citations",
      {
        workspace_id: workspaceId,
        message_id: message,
        source_id: source,
        revision_id: revision,
        chunk_id: chunk,
        display_title: "Source",
        reviewed_at: "2026-01-01",
      },
    ],
    [
      "ai_invocations",
      {
        workspace_id: workspaceId,
        conversation_id: conversation,
        provider: "test",
        model: "test",
        prompt_version: "1",
        price_version: "1",
        state: "reserved",
        reserved_cost_micros: "0",
        request_id: randomUUID(),
      },
    ],
    ["monthly_usage", { workspace_id: workspaceId, period: "2026-09" }],
  ])
}

// All identifiers come from the fixed fixtures above or locally generated names.
function insertRow(table: string, row: Record<string, unknown>) {
  return {
    text: `INSERT INTO public."${table}" (${Object.keys(row)
      .map((key) => `"${key}"`)
      .join(", ")}) VALUES (${Object.keys(row)
      .map((_, i) => `$${i + 1}`)
      .join(", ")})`,
    values: Object.values(row),
  }
}

await test("tenant RLS against PostgreSQL", async (t) => {
  const fixture = await createDatabaseTestFixture(adminUrl)
  const database = fixture.databaseName
  const runtimeRole = fixture.roles.business
  const ownerRole = `${database}_owner`
  const bypassRole = `${database}_bypass`
  const admin = new Client({ connectionString: adminUrl })
  const pools: Pool[] = []
  const roles: string[] = []
  await admin.connect()
  try {
    assert.equal(
      (
        await admin.query(
          "SELECT rolsuper FROM pg_roles WHERE rolname = current_user"
        )
      ).rows[0].rolsuper,
      true,
      "test setup requires a local superuser"
    )
    const setup = fixture.pools.admin
    const roleUrls = new Map([[runtimeRole, fixture.urls.business]])
    for (const role of [ownerRole, bypassRole]) {
      const password = randomBytes(32).toString("hex")
      await admin.query(
        `CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT ${role === bypassRole ? "BYPASSRLS" : "NOBYPASSRLS"}`
      )
      roles.push(role)
      const login = new URL(fixture.urls.business)
      login.username = role
      login.password = password
      roleUrls.set(role, login.toString())
      await setup.query(`GRANT CONNECT ON DATABASE "${database}" TO "${role}"`)
      await setup.query(`GRANT USAGE ON SCHEMA public TO "${role}"`)
      for (const table of protectedTables) {
        await setup.query(
          `GRANT SELECT, INSERT, UPDATE, DELETE ON public."${table}" TO "${role}"`
        )
      }
    }
    await setup.query(
      "INSERT INTO workspaces (id, owner_id, name, website_origin) VALUES ($1, $2, 'A', 'https://a.test'), ($3, $4, 'B', 'https://b.test')",
      [workspaceA, ownerA, workspaceB, ownerB]
    )
    const rowsA = fixtures(workspaceA)
    const rowsB = fixtures(workspaceB)
    for (const rows of [rowsA, rowsB]) {
      for (const [table, row] of rows) await setup.query(insertRow(table, row))
    }
    for (const table of protectedTables) {
      await setup.query(`ALTER TABLE public."${table}" OWNER TO "${ownerRole}"`)
    }
    const connectAs = (role: string) => {
      const pool = new Pool({
        connectionString: roleUrls.get(role),
        max: 1,
      })
      pools.push(pool)
      return pool
    }
    const runtime = connectAs(runtimeRole)
    const db = drizzle(runtime)
    const asTenant = <T>(
      callback: Parameters<typeof withTenantTransaction<T>>[2]
    ) =>
      withTenantTransaction(
        db,
        { ownerId: ownerA, workspaceId: workspaceA },
        callback
      )

    await t.test(
      "catalog flags and policy scope match the reviewed boundary",
      async () => {
        const flags = await setup.query(
          "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'"
        )
        for (const table of protectedTables) {
          const row = flags.rows.find((row) => row.relname === table)
          assert.equal(row?.relrowsecurity, true, table)
          assert.equal(row?.relforcerowsecurity, true, table)
        }
        for (const table of [...identityTables, ...operationalTables]) {
          const row = flags.rows.find((row) => row.relname === table)
          assert.equal(row?.relrowsecurity, false, table)
          assert.equal(row?.relforcerowsecurity, false, table)
          assert.equal(
            (
              await setup.query(
                "SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = $1",
                [table]
              )
            ).rowCount,
            0
          )
          await assert.rejects(
            runtime.query(`SELECT * FROM public."${table}"`),
            { code: "42501" }
          )
        }
        const role = (
          await runtime.query(
            "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user"
          )
        ).rows[0]
        assert.deepEqual(role, { rolsuper: false, rolbypassrls: false })
        const helpers = await setup.query(
          "SELECT provolatile, prosecdef, proconfig FROM pg_proc WHERE pronamespace = 'app_private'::regnamespace"
        )
        assert.equal(helpers.rowCount, 2)
        for (const helper of helpers.rows) {
          assert.equal(helper.provolatile, "s")
          assert.equal(helper.prosecdef, false)
          assert.deepEqual(helper.proconfig, ["search_path=pg_catalog"])
        }
      }
    )

    await t.test(
      "missing, empty, and malformed context fail closed",
      async () => {
        for (const table of protectedTables)
          assert.equal(
            (await runtime.query(`SELECT * FROM public."${table}"`)).rowCount,
            0,
            table
          )
        await withTenantTransaction(
          db,
          { ownerId: "", workspaceId: "" },
          async (tx) => {
            for (const table of protectedTables)
              assert.equal(
                (await tx.execute(sql.raw(`SELECT * FROM public."${table}"`)))
                  .rowCount,
                0,
                table
              )
          }
        )
        await assert.rejects(
          withTenantTransaction(
            db,
            { ownerId: ownerA, workspaceId: "invalid-uuid" },
            (tx) => tx.execute(sql`SELECT * FROM monthly_usage`)
          ),
          (error: unknown) => {
            return (
              (error as { cause?: { code?: string } }).cause?.code === "22P02"
            )
          }
        )
      }
    )

    await t.test("workspaces permit owner reads and updates only", async () => {
      await asTenant(async (tx) => {
        assert.deepEqual(
          (await tx.execute(sql`SELECT id FROM workspaces`)).rows,
          [{ id: workspaceA }]
        )
        assert.equal(
          (
            await tx.execute(
              sql`UPDATE workspaces SET name = 'Updated' WHERE id = ${workspaceA}`
            )
          ).rowCount,
          1
        )
        assert.equal(
          (
            await tx.execute(
              sql`UPDATE workspaces SET name = 'Hidden' WHERE id = ${workspaceB}`
            )
          ).rowCount,
          0
        )
      })
      for (const query of [
        sql`DELETE FROM workspaces`,
        sql`UPDATE workspaces SET owner_id = ${ownerB} WHERE id = ${workspaceA}`,
        sql`INSERT INTO workspaces (owner_id, name, website_origin) VALUES (${ownerA}, 'Denied', 'https://new.test')`,
      ]) {
        await assert.rejects(
          asTenant((tx) => tx.execute(query)),
          (error: unknown) =>
            (error as { cause?: { code?: string } }).cause?.code === "42501"
        )
      }
      await withTenantTransaction(db, { ownerId: ownerB }, async (tx) => {
        assert.deepEqual(
          (await tx.execute(sql`SELECT id FROM workspaces`)).rows,
          [{ id: workspaceB }]
        )
      })
    })

    await t.test(
      "same-owner workspaces still isolate tenant content",
      async () => {
        const sameOwnerWorkspace = randomUUID()
        await setup.query(
          "INSERT INTO workspaces (id, owner_id, name, website_origin) VALUES ($1, $2, 'Same owner', 'https://same-owner.test')",
          [sameOwnerWorkspace, ownerA]
        )
        await setup.query(
          "INSERT INTO knowledge_sources (workspace_id, type, title) VALUES ($1, 'text', 'Same-owner secret')",
          [sameOwnerWorkspace]
        )
        try {
          await asTenant(async (tx) => {
            assert.equal(
              (await tx.execute(sql`SELECT id FROM workspaces`)).rowCount,
              2
            )
            assert.deepEqual(
              (
                await tx.execute(
                  sql`SELECT workspace_id FROM knowledge_sources`
                )
              ).rows,
              [{ workspace_id: workspaceA }]
            )
          })
          await withTenantTransaction(
            db,
            { ownerId: ownerA, workspaceId: sameOwnerWorkspace },
            async (tx) => {
              assert.deepEqual(
                (await tx.execute(sql`SELECT title FROM knowledge_sources`))
                  .rows,
                [{ title: "Same-owner secret" }]
              )
            }
          )
        } finally {
          await setup.query("DELETE FROM workspaces WHERE id = $1", [
            sameOwnerWorkspace,
          ])
        }
      }
    )

    await t.test(
      "composite foreign keys reject cross-workspace relationships",
      async () => {
        for (const query of [
          sql`INSERT INTO knowledge_revisions (workspace_id, source_id, ordinal, content_hash) VALUES (${workspaceA}, ${rowsB.get("knowledge_sources")!.id}, 99, 'cross-workspace')`,
          sql`INSERT INTO knowledge_chunks (workspace_id, revision_id, ordinal, content, token_count, embedding_model, embedding_dimensions, embedding) VALUES (${workspaceA}, ${rowsB.get("knowledge_revisions")!.id}, 99, 'cross-workspace', 1, 'test', 1536, ${JSON.stringify(Array(1536).fill(0))}::vector)`,
          sql`INSERT INTO messages (workspace_id, conversation_id, sequence, sender, body) VALUES (${workspaceA}, ${rowsB.get("conversations")!.id}, 99, 'visitor', 'cross-workspace')`,
        ]) {
          await assert.rejects(
            asTenant((tx) => tx.execute(query)),
            (error: unknown) =>
              (error as { cause?: { code?: string } }).cause?.code === "23503"
          )
        }
      }
    )

    for (const table of tenantTables) {
      await t.test(
        `${table}: isolates reads, inserts, updates, and deletes`,
        async () => {
          const client = await runtime.connect()
          try {
            await client.query("BEGIN")
            await client.query(
              "SELECT set_config('app.workspace_id', $1, true)",
              [workspaceA]
            )
            // Business policies intentionally also work without an owner context.
            assert.deepEqual(
              (await client.query(`SELECT workspace_id FROM public."${table}"`))
                .rows,
              [{ workspace_id: workspaceA }]
            )
            assert.equal(
              (
                await client.query(
                  `UPDATE public."${table}" SET workspace_id = workspace_id WHERE workspace_id = $1`,
                  [workspaceB]
                )
              ).rowCount,
              0
            )
            assert.equal(
              (
                await client.query(
                  `DELETE FROM public."${table}" WHERE workspace_id = $1`,
                  [workspaceB]
                )
              ).rowCount,
              0
            )
            assert.equal(
              (
                await client.query(
                  `UPDATE public."${table}" SET workspace_id = workspace_id`
                )
              ).rowCount,
              1
            )
            for (const query of [
              {
                text: `UPDATE public."${table}" SET workspace_id = $1`,
                values: [workspaceB],
              },
              insertRow(table, rowsB.get(table)!),
            ]) {
              await client.query("SAVEPOINT denied_write")
              await assert.rejects(client.query(query), { code: "42501" })
              await client.query("ROLLBACK TO SAVEPOINT denied_write")
            }
            assert.equal(
              (await client.query(`DELETE FROM public."${table}"`)).rowCount,
              1
            )
            assert.equal(
              (await client.query(insertRow(table, rowsA.get(table)!)))
                .rowCount,
              1
            )
          } finally {
            await client.query("ROLLBACK")
            client.release()
          }
        }
      )
    }

    await t.test(
      "FORCE constrains ordinary owners; superuser and BYPASSRLS still bypass",
      async () => {
        const owner = connectAs(ownerRole)
        const bypass = connectAs(bypassRole)
        for (const table of protectedTables) {
          assert.equal(
            (await owner.query(`SELECT * FROM public."${table}"`)).rowCount,
            0,
            table
          )
          assert.equal(
            (await bypass.query(`SELECT * FROM public."${table}"`)).rowCount,
            2,
            table
          )
          assert.equal(
            (await setup.query(`SELECT * FROM public."${table}"`)).rowCount,
            2,
            table
          )
        }
        await withTenantTransaction(
          drizzle(owner),
          { ownerId: ownerB, workspaceId: workspaceB },
          async (tx) => {
            for (const table of protectedTables)
              assert.equal(
                (await tx.execute(sql.raw(`SELECT * FROM public."${table}"`)))
                  .rowCount,
                1,
                table
              )
          }
        )
      }
    )

    await t.test(
      "transaction context resets after commit and rollback on a reused connection",
      async () => {
        await asTenant((tx) => tx.execute(sql`SELECT * FROM monthly_usage`))
        const assertCleared = async () => {
          assert.deepEqual(
            (
              await runtime.query(
                "SELECT app_private.current_owner_id() AS owner, app_private.current_workspace_id() AS workspace"
              )
            ).rows,
            [{ owner: null, workspace: null }]
          )
        }
        await assertCleared()
        await assert.rejects(
          asTenant(async () => {
            throw new Error("rollback-test")
          }),
          /rollback-test/
        )
        await assertCleared()
        await withTenantTransaction(
          db,
          { ownerId: ownerB, workspaceId: workspaceB },
          async (tx) => {
            assert.deepEqual(
              (await tx.execute(sql`SELECT workspace_id FROM monthly_usage`))
                .rows,
              [{ workspace_id: workspaceB }]
            )
          }
        )
        await assertCleared()
      }
    )

    await t.test(
      "does not leak workspace context across reused pooled connections",
      async () => {
        // Fresh workspaces keep B empty, so the SELECT needs no tenant filter.
        const tenantA = { ownerId: randomUUID(), workspaceId: randomUUID() }
        const tenantB = { ownerId: randomUUID(), workspaceId: randomUUID() }
        await setup.query(
          "INSERT INTO workspaces (id, owner_id, name, website_origin) VALUES ($1, $2, 'Pool A', 'https://pool-a.test'), ($3, $4, 'Pool B', 'https://pool-b.test')",
          [
            tenantA.workspaceId,
            tenantA.ownerId,
            tenantB.workspaceId,
            tenantB.ownerId,
          ]
        )
        const pool = connectAs(runtimeRole) // max: 1 forces sequential reuse.
        const pooledDb = drizzle(pool)
        const secretId = randomUUID()
        const expectedSource = [{ id: secretId, title: "Owner A secret" }]

        const pidA = await withTenantTransaction(
          pooledDb,
          tenantA,
          async (tx) => {
            const {
              rows: [backend],
            } = await tx.execute<{ pid: number }>(
              sql`SELECT pg_backend_pid() AS pid`
            )
            assert.ok(backend)
            await tx.insert(knowledgeSources).values({
              id: secretId,
              workspaceId: tenantA.workspaceId,
              type: "text",
              title: "Owner A secret",
            })
            return backend.pid
          }
        )

        const assertReleasedWithoutContext = async () => {
          // Borrow outside the helper BEFORE another tenant overwrites settings.
          // An A -> B transaction alone would also pass with session-global GUCs.
          const borrowed = await pool.connect()
          try {
            const context = await borrowed.query(
              `SELECT pg_backend_pid() AS pid,
                NULLIF(current_setting('app.owner_id', true), '') AS owner,
                NULLIF(current_setting('app.workspace_id', true), '') AS workspace`
            )
            assert.deepEqual(context.rows, [
              { pid: pidA, owner: null, workspace: null },
            ])
            assert.deepEqual(
              (await borrowed.query("SELECT * FROM knowledge_sources")).rows,
              []
            )
            assert.deepEqual(
              (await borrowed.query("SELECT * FROM workspaces")).rows,
              []
            )
          } finally {
            borrowed.release()
          }
        }
        await assertReleasedWithoutContext()

        const visibleToB = await withTenantTransaction(
          pooledDb,
          tenantB,
          async (tx) => {
            const {
              rows: [backend],
            } = await tx.execute<{ pid: number }>(
              sql`SELECT pg_backend_pid() AS pid`
            )
            assert.equal(
              backend?.pid,
              pidA,
              "B must reuse A's physical connection"
            )
            return tx.select().from(knowledgeSources)
          }
        )
        assert.deepEqual(visibleToB, [])
        await assertReleasedWithoutContext()

        // Prove the secret was committed and remains readable only in A's scope.
        const visibleToA = await withTenantTransaction(
          pooledDb,
          tenantA,
          async (tx) => {
            const {
              rows: [backend],
            } = await tx.execute<{ pid: number }>(
              sql`SELECT pg_backend_pid() AS pid`
            )
            assert.equal(backend?.pid, pidA)
            return tx
              .select({
                id: knowledgeSources.id,
                title: knowledgeSources.title,
              })
              .from(knowledgeSources)
          }
        )
        assert.deepEqual(visibleToA, expectedSource)
        await assertReleasedWithoutContext()
      }
    )

    await t.test(
      "owner-only transactions shadow a stale session workspace",
      async () => {
        await runtime.query(
          "SELECT set_config('app.workspace_id', $1, false)",
          [workspaceB]
        )
        try {
          await withTenantTransaction(db, { ownerId: ownerA }, async (tx) => {
            assert.equal(
              (await tx.execute(sql`SELECT * FROM monthly_usage`)).rowCount,
              0
            )
            assert.deepEqual(
              (await tx.execute(sql`SELECT id FROM workspaces`)).rows,
              [{ id: workspaceA }]
            )
          })
        } finally {
          await runtime.query("RESET app.workspace_id")
        }
      }
    )
  } finally {
    await Promise.all(pools.map((pool) => pool.end()))
    // Only this run's generated database and roles are removed.
    try {
      await fixture.close()
      for (const role of roles) await admin.query(`DROP ROLE "${role}"`)
    } finally {
      await admin.end()
    }
  }
})
