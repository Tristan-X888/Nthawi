import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, before, test } from "node:test"
import { schemaManifest } from "../packages/db/dist/schema-manifest.js"
import { createDatabaseTestFixture } from "../packages/db/test/helpers/database-fixture.mjs"
import {
  assertExportCatalog,
  classificationFingerprint,
  exportCatalogSql,
  inspectContentBarrier,
  relationClassification,
} from "./neon-content-barrier.mjs"
import {
  createSyntheticFixtures,
  insertSyntheticFixtures,
} from "./neon-synthetic-fixtures.mjs"

// Local disposable PostgreSQL 18 only. The shared helper accepts a literal
// loopback superuser URL and creates/drops its own database and roles. It is
// never pointed at Neon (RLS_TEST_ADMIN_URL stays a local-only variable).
const adminUrl = process.env.RLS_TEST_ADMIN_URL
if (!adminUrl)
  throw new Error("RLS_TEST_ADMIN_URL is required for this integration test")

const at = new Date()
const T = at.toISOString()
let fixture
let client
let synthetic

before(async () => {
  fixture = await createDatabaseTestFixture(adminUrl)
  client = await fixture.pools.admin.connect()
  synthetic = createSyntheticFixtures()
  await insertSyntheticFixtures(client, synthetic)
})

after(async () => {
  client?.release(true)
  await fixture?.close()
})

const tenant = () => synthetic.tenants[0]
const row = (table) => tenant().rows.get(table)

async function blockedBy(setup, options) {
  await client.query("BEGIN")
  try {
    await setup()
    await inspectContentBarrier(client, T, options)
    return []
  } catch (error) {
    if (!error.blockedRelations) throw error
    return error.blockedRelations
  } finally {
    await client.query("ROLLBACK")
  }
}
const journal = (scope, resourceId, offset) =>
  client.query(
    `INSERT INTO deletion_journal (scope, resource_id, deleted_at) VALUES ($1, $2, $3::timestamptz - $4::interval)`,
    [scope, resourceId, T, offset]
  )
// 15 minutes plus or minus one second, relative to the snapshot instant.
const overdue = "15 minutes 1 second"
const withinLag = "14 minutes 59 seconds"

const workspaceContent = [
  "public.assistants",
  "public.citations",
  "public.conversations",
  "public.knowledge_chunks",
  "public.knowledge_revisions",
  "public.knowledge_sources",
  "public.messages",
  "public.visitor_sessions",
  "public.widget_installations",
  "public.workspaces",
]

test("the real migrated catalog equals the reviewed manifest", async () => {
  const catalog = (await client.query(exportCatalogSql)).rows
  assert.match(assertExportCatalog(schemaManifest, catalog), /^[a-f0-9]{64}$/)
})

test("clean synthetic tenants pass and only counts are returned", async () => {
  const findings = await inspectContentBarrier(client, T)
  assert.equal(findings.length, 21)
  const counts = Object.fromEntries(
    findings.map((finding) => [finding.relation, finding.total])
  )
  assert.equal(counts["public.messages"], "2")
  assert.equal(counts["public.workspaces"], "2")
  assert.ok(findings.every((finding) => finding.overdue === "0"))
})

test("workspace deletion journal blocks every workspace content relation after the lag", async () => {
  assert.deepEqual(
    await blockedBy(() => journal("workspace", tenant().workspaceId, overdue)),
    workspaceContent
  )
  assert.deepEqual(
    await blockedBy(() =>
      journal("workspace", tenant().workspaceId, withinLag)
    ),
    []
  )
  // Resource identifiers are compared case-insensitively.
  assert.deepEqual(
    await blockedBy(() =>
      journal("workspace", tenant().workspaceId.toUpperCase(), overdue)
    ),
    workspaceContent
  )
})

test("account deletion reaches owned workspaces and identity rows", async () => {
  assert.deepEqual(
    await blockedBy(() => journal("account", tenant().ownerId, overdue)),
    workspaceContent
  )
  const user = randomUUID()
  const identity = async (offset) => {
    await client.query(
      `INSERT INTO "user" (id, name, email) VALUES ($1, 'Synthetic', $2)`,
      [user, `${user}@example.test`]
    )
    await client.query(
      `INSERT INTO account (account_id, provider_id, user_id, updated_at) VALUES ('synthetic', 'credential', $1, now())`,
      [user]
    )
    await client.query(
      `INSERT INTO session (user_id, token, expires_at, updated_at) VALUES ($1, $2, now() + interval '1 day', now())`,
      [user, randomUUID()]
    )
    await journal("account", user, offset)
  }
  assert.deepEqual(await blockedBy(() => identity(overdue)), [
    "public.account",
    "public.session",
    "public.user",
  ])
  assert.deepEqual(await blockedBy(() => identity(withinLag)), [])
})

test("verification rows with unproven lineage block after any account deletion lag", async () => {
  const verification = (createdOffset) =>
    client.query(
      `INSERT INTO verification (identifier, value, expires_at, created_at) VALUES ('synthetic@example.test', 'synthetic', now() + interval '1 hour', ($1::timestamptz - $2::interval) AT TIME ZONE 'UTC')`,
      [T, createdOffset]
    )
  assert.deepEqual(
    await blockedBy(async () => {
      await verification("20 minutes")
      await journal("account", randomUUID(), overdue)
    }),
    ["public.verification"]
  )
  // A late stale write can still belong to the deleted identity; creation time
  // cannot substitute for reviewed user lineage and lifecycle fencing.
  assert.deepEqual(
    await blockedBy(async () => {
      await verification("1 minute")
      await journal("account", randomUUID(), overdue)
    }),
    ["public.verification"]
  )
  assert.deepEqual(
    await blockedBy(async () => {
      await verification("1 minute")
      await journal("account", randomUUID(), withinLag)
    }),
    []
  )
})

test("unclassified extension-member tables cannot hide from the export catalog", async () => {
  await client.query("BEGIN")
  try {
    await client.query("CREATE TABLE extension_payload_fixture (body text)")
    await client.query(
      "ALTER EXTENSION vector ADD TABLE extension_payload_fixture"
    )
    const catalog = (await client.query(exportCatalogSql)).rows
    assert.ok(
      catalog.some(
        (row) =>
          row.schema === "public" && row.name === "extension_payload_fixture"
      )
    )
    assert.throws(
      () => assertExportCatalog(schemaManifest, catalog),
      /NEON_EXPORT_CATALOG_DRIFT/
    )
  } finally {
    await client.query("ROLLBACK")
  }
})

test("source deletion timestamp blocks the source, its revisions, chunks and citations", async () => {
  const deleteSource = (offset) =>
    client.query(
      `UPDATE knowledge_sources SET deleted_at = $1::timestamptz - $2::interval WHERE id = $3`,
      [T, offset, row("knowledge_sources").id]
    )
  assert.deepEqual(await blockedBy(() => deleteSource(overdue)), [
    "public.citations",
    "public.knowledge_chunks",
    "public.knowledge_revisions",
    "public.knowledge_sources",
  ])
  assert.deepEqual(await blockedBy(() => deleteSource(withinLag)), [])
})

test("source, revision, conversation and message journal scopes reach dependants", async () => {
  const cases = [
    [
      "source",
      row("knowledge_sources").id,
      [
        "public.citations",
        "public.knowledge_chunks",
        "public.knowledge_revisions",
        "public.knowledge_sources",
      ],
    ],
    [
      "revision",
      row("knowledge_revisions").id,
      [
        "public.citations",
        "public.knowledge_chunks",
        "public.knowledge_revisions",
      ],
    ],
    [
      "conversation",
      row("conversations").id,
      ["public.citations", "public.conversations", "public.messages"],
    ],
    ["message", row("messages").id, ["public.citations", "public.messages"]],
  ]
  for (const [scope, id, expected] of cases) {
    assert.deepEqual(
      await blockedBy(() => journal(scope, id, overdue)),
      expected,
      scope
    )
    assert.deepEqual(
      await blockedBy(() => journal(scope, id, withinLag)),
      [],
      scope
    )
  }
  // Revocation intents are valid journal records but never content removal.
  for (const scope of ["credential", "grant"])
    assert.deepEqual(
      await blockedBy(() => journal(scope, row("messages").id, overdue)),
      [],
      scope
    )
})

test("messages expire 2160 hours after creation, with the same lag", async () => {
  const age = (offset) =>
    client.query(
      `UPDATE messages SET created_at = $1::timestamptz - interval '2160 hours' - $2::interval WHERE id = $3`,
      [T, offset, row("messages").id]
    )
  assert.deepEqual(await blockedBy(() => age(overdue)), [
    "public.citations",
    "public.messages",
  ])
  assert.deepEqual(await blockedBy(() => age(withinLag)), [])
})

test("dangling references block immediately; accounting rows are retained", async () => {
  // Cascades remove the workspace's sources and installations, leaving rows
  // in tables without a workspace foreign key.
  assert.deepEqual(
    await blockedBy(() =>
      client.query("DELETE FROM workspaces WHERE id = $1", [
        tenant().workspaceId,
      ])
    ),
    [
      "public.citations",
      "public.conversations",
      "public.messages",
      "public.visitor_sessions",
    ]
  )
  assert.deepEqual(
    await blockedBy(() =>
      client.query("DELETE FROM knowledge_chunks WHERE id = $1", [
        row("knowledge_chunks").id,
      ])
    ),
    ["public.citations"]
  )
  assert.deepEqual(
    await blockedBy(() =>
      client.query(
        `INSERT INTO ai_invocations (workspace_id, provider, model, prompt_version, price_version, state, reserved_cost_micros, request_id) VALUES ($1, 'synthetic', 'synthetic', 'v1', 'v1', 'completed', 0, $2)`,
        [randomUUID(), randomUUID()]
      )
    ),
    []
  )
})

test("malformed journal records and ungoverned audit rows block; transient counters do not", async () => {
  assert.deepEqual(
    await blockedBy(() => journal("tenant", randomUUID(), overdue)),
    ["public.deletion_journal"]
  )
  assert.deepEqual(
    await blockedBy(() => journal("workspace", randomUUID(), "-1 minute")),
    ["public.deletion_journal"]
  )
  assert.deepEqual(
    await blockedBy(() =>
      client.query(
        `INSERT INTO audit_events (action, resource_type, outcome, request_id) VALUES ('synthetic', 'synthetic', 'success', 'synthetic')`
      )
    ),
    ["public.audit_events"]
  )
  // P4-D09: a rate-limit counter, even a stale one, never blocks an export;
  // its data is excluded from the recovery copy instead.
  assert.deepEqual(
    await blockedBy(() =>
      client.query(
        `INSERT INTO rate_limit (key, count, last_request) VALUES ($1, 1, 1)`,
        [randomUUID()]
      )
    ),
    []
  )
})

test("a future content table fails the reviewed catalog and is enforced once declared", async () => {
  await client.query("BEGIN")
  try {
    await client.query(
      "CREATE TABLE uploaded_documents (id uuid PRIMARY KEY, workspace_id uuid NOT NULL, deleted_at timestamptz)"
    )
    const catalog = (await client.query(exportCatalogSql)).rows
    assert.throws(
      () => assertExportCatalog(schemaManifest, catalog),
      /NEON_EXPORT_CATALOG_DRIFT/
    )
    const manifest = JSON.parse(JSON.stringify(schemaManifest))
    manifest.tables.push({
      name: "uploaded_documents",
      rls: false,
      columns: [
        {
          name: "deleted_at",
          type: "timestamp with time zone",
          notNull: false,
        },
        { name: "id", type: "uuid", notNull: true },
        { name: "workspace_id", type: "uuid", notNull: true },
      ],
    })
    assert.match(assertExportCatalog(manifest, catalog), /^[a-f0-9]{64}$/)
    const classification = {
      ...relationClassification,
      "public.uploaded_documents": {
        category: "tenant-content",
        rules: [
          { kind: "journal", scope: "workspace", column: "workspace_id" },
          { kind: "due", column: "deleted_at" },
        ],
      },
    }
    const options = { classification, manifest }
    assert.equal(
      classificationFingerprint(manifest).length,
      64,
      "fixture manifest fingerprints"
    )
    await client.query(
      `INSERT INTO uploaded_documents (id, workspace_id, deleted_at) VALUES ($1, $2, $3::timestamptz - interval '15 minutes 1 second')`,
      [randomUUID(), tenant().workspaceId, T]
    )
    await assert.rejects(
      inspectContentBarrier(client, T, options),
      (error) =>
        JSON.stringify(error.blockedRelations) ===
        JSON.stringify(["public.uploaded_documents"])
    )
  } finally {
    await client.query("ROLLBACK")
  }
})
