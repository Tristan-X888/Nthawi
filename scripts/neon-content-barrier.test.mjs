import assert from "node:assert/strict"
import test from "node:test"
import { schemaManifest } from "../packages/db/dist/schema-manifest.js"
import {
  assertBarrierFindings,
  assertClassificationCurrent,
  assertExportCatalog,
  barrierQueries,
  classificationFingerprint,
  contentCategories,
  expectedExportCatalog,
  recoveryDumpExclusions,
  relationClassification,
  transientRelations,
} from "./neon-content-barrier.mjs"

const clone = (value) => JSON.parse(JSON.stringify(value))

// Hand-listed from migrations 0000-0002: 20 public tables plus Drizzle's
// migration ledger. A schema change must update this list deliberately.
const currentRelations = [
  "drizzle.__drizzle_migrations",
  "public.account",
  "public.ai_invocations",
  "public.assistants",
  "public.audit_events",
  "public.citations",
  "public.conversations",
  "public.deletion_journal",
  "public.global_monthly_ai_usage",
  "public.knowledge_chunks",
  "public.knowledge_revisions",
  "public.knowledge_sources",
  "public.messages",
  "public.monthly_usage",
  "public.rate_limit",
  "public.session",
  "public.user",
  "public.verification",
  "public.visitor_sessions",
  "public.widget_installations",
  "public.workspaces",
]

test("every current relation has exactly one reviewed category", () => {
  assert.deepEqual(
    assertClassificationCurrent(schemaManifest),
    currentRelations
  )
  assert.deepEqual(Object.keys(relationClassification).sort(), currentRelations)
})

test("schema drift fails closed until the classification is reviewed", () => {
  const mutations = {
    "added table": (manifest) =>
      manifest.tables.push({
        name: "uploaded_documents",
        rls: true,
        columns: [{ name: "id", type: "uuid", notNull: true }],
      }),
    "dropped table": (manifest) =>
      manifest.tables.splice(
        manifest.tables.findIndex((table) => table.name === "messages"),
        1
      ),
    "added content column": (manifest) =>
      manifest.tables
        .find((table) => table.name === "workspaces")
        .columns.push({ name: "notes", type: "text", notNull: false }),
    "retyped column": (manifest) => {
      manifest.tables
        .find((table) => table.name === "messages")
        .columns.find((column) => column.name === "body").type = "jsonb"
    },
    "nullability change": (manifest) => {
      manifest.tables
        .find((table) => table.name === "knowledge_sources")
        .columns.find((column) => column.name === "deleted_at").notNull = true
    },
    "row security removed": (manifest) => {
      manifest.tables.find((table) => table.name === "citations").rls = false
    },
  }
  for (const [name, mutate] of Object.entries(mutations)) {
    const manifest = clone(schemaManifest)
    mutate(manifest)
    assert.throws(
      () => assertClassificationCurrent(manifest),
      /NEON_EXPORT_CLASSIFICATION_STALE/,
      name
    )
  }
})

test("unknown categories and rules inconsistent with their category are rejected", () => {
  const cases = {
    "unknown category": {
      "public.messages": { category: "future-documents", rules: [] },
    },
    "content without a deletion rule": {
      "public.messages": { category: "tenant-content", rules: [] },
    },
    "accounting with a purge rule": {
      "public.monthly_usage": {
        category: "minimal-accounting",
        rules: [{ kind: "due", column: "updated_at" }],
      },
    },
    "ungoverned rows not blocking": {
      "public.audit_events": {
        category: "ungoverned-operational",
        rules: [{ kind: "due", column: "created_at" }],
      },
    },
    "transient counters given a blocking rule": {
      "public.rate_limit": {
        category: "transient-security",
        rules: [{ kind: "always" }],
      },
    },
    "transient counters given a purge rule": {
      "public.rate_limit": {
        category: "transient-security",
        rules: [{ kind: "due", column: "last_request" }],
      },
    },
    "unknown rule kind": {
      "public.messages": {
        category: "tenant-content",
        rules: [{ kind: "expired-somehow", column: "created_at" }],
      },
    },
    "unsafe identifier": {
      "public.messages": {
        category: "tenant-content",
        rules: [{ kind: "due", column: 'created_at" OR true --' }],
      },
    },
    "unknown journal scope": {
      "public.messages": {
        category: "tenant-content",
        rules: [{ kind: "journal", scope: "tenant", column: "id" }],
      },
    },
  }
  for (const [name, override] of Object.entries(cases)) {
    const classification = { ...relationClassification, ...override }
    assert.throws(
      () =>
        assertClassificationCurrent(schemaManifest, {
          classification,
          fingerprint: classificationFingerprint(schemaManifest),
        }),
      /NEON_EXPORT_CLASSIFICATION_INVALID/,
      name
    )
  }
})

test("a declared later content category is enforced by the same engine", () => {
  // Fixture only: models a future uploaded-document table without adding it.
  const manifest = clone(schemaManifest)
  manifest.tables.push({
    name: "uploaded_documents",
    rls: true,
    columns: [
      { name: "deleted_at", type: "timestamp with time zone", notNull: false },
      { name: "id", type: "uuid", notNull: true },
      { name: "workspace_id", type: "uuid", notNull: true },
    ],
  })
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
  const options = {
    classification,
    fingerprint: classificationFingerprint(manifest),
  }
  assert.ok(
    assertClassificationCurrent(manifest, options).includes(
      "public.uploaded_documents"
    )
  )
  const query = barrierQueries(classification, manifest)[
    "public.uploaded_documents"
  ]
  assert.match(query, /FROM "public"\."uploaded_documents" t/)
  // The reviewed fingerprint still rejects the same table by default.
  assert.throws(
    () => assertClassificationCurrent(manifest),
    /NEON_EXPORT_CLASSIFICATION_STALE/
  )
})

test("barrier findings block on any overdue row and on incomplete evidence", () => {
  const findings = currentRelations.map((relation) => ({
    relation,
    total: "3",
    overdue: "0",
  }))
  assert.deepEqual(assertBarrierFindings(findings), findings)
  for (const relation of currentRelations) {
    const blocked = findings.map((row) =>
      row.relation === relation ? { ...row, overdue: "1" } : row
    )
    assert.throws(
      () => assertBarrierFindings(blocked),
      (error) =>
        /NEON_EXPORT_CONTENT_BARRIER_BLOCKED/.test(error.message) &&
        error.blockedRelations.length === 1 &&
        error.blockedRelations[0] === relation
    )
  }
  for (const incomplete of [
    findings.slice(1),
    [...findings, { relation: "public.documents", total: "1", overdue: "0" }],
    [findings[1], ...findings.slice(1)],
    findings.map((row, index) =>
      index === 0 ? { ...row, overdue: "-1" } : row
    ),
    findings.map((row, index) =>
      index === 0 ? { ...row, overdue: "unknown" } : row
    ),
  ])
    assert.throws(
      () => assertBarrierFindings(incomplete),
      /NEON_EXPORT_CONTENT_BARRIER_INCOMPLETE/
    )
})

test("the live catalog must equal the manifest exactly, in every schema", () => {
  const valid = expectedExportCatalog(schemaManifest)
  assert.match(assertExportCatalog(schemaManifest, valid), /^[a-f0-9]{64}$/)
  const cases = {
    "queue table": (rows) =>
      rows.push({
        schema: "pgboss",
        name: "job",
        kind: "r",
        rls: false,
        forced: false,
        columns: [{ name: "data", type: "jsonb", notNull: false }],
      }),
    "view exposing content": (rows) =>
      rows.push({
        schema: "public",
        name: "all_messages",
        kind: "v",
        rls: false,
        forced: false,
        columns: [{ name: "body", type: "text", notNull: false }],
      }),
    "extra column": (rows) =>
      rows
        .find((row) => row.name === "messages")
        .columns.push({ name: "draft", type: "text", notNull: false }),
    "missing table": (rows) =>
      rows.splice(
        rows.findIndex((row) => row.name === "citations"),
        1
      ),
    "force row security off": (rows) => {
      rows.find((row) => row.name === "messages").forced = false
    },
  }
  for (const [name, mutate] of Object.entries(cases)) {
    const rows = clone(valid)
    mutate(rows)
    assert.throws(
      () => assertExportCatalog(schemaManifest, rows),
      /NEON_EXPORT_CATALOG_DRIFT/,
      name
    )
  }
})

test("rate-limit counters are transient: they never block and never enter a recovery copy", () => {
  assert.deepEqual(relationClassification["public.rate_limit"], {
    category: "transient-security",
    rules: [],
  })
  assert.deepEqual(transientRelations, ["public.rate_limit"])
  assert.ok(Object.isFrozen(transientRelations))
  // Exact quoted identifiers: no pattern wildcard can widen the exclusion.
  assert.deepEqual(recoveryDumpExclusions(), [
    '--exclude-table-data="public"."rate_limit"',
  ])
  assert.match(
    barrierQueries()["public.rate_limit"],
    /count\(\*\) FILTER \(WHERE false\)::text AS overdue/
  )
})

test("audit events still block every export until their content contract is reviewed", () => {
  assert.equal(
    relationClassification["public.audit_events"].category,
    "ungoverned-operational"
  )
  assert.match(
    barrierQueries()["public.audit_events"],
    /count\(\*\) FILTER \(WHERE \(true\)\)::text AS overdue/
  )
})

test("dump exclusions follow the classification and reject unsafe names", () => {
  const classification = {
    ...relationClassification,
    "public.monthly_usage": { category: "transient-security", rules: [] },
  }
  assert.deepEqual(recoveryDumpExclusions(classification), [
    '--exclude-table-data="public"."monthly_usage"',
    '--exclude-table-data="public"."rate_limit"',
  ])
  assert.throws(
    () =>
      recoveryDumpExclusions({
        'public.rate_limit" OR "x': {
          category: "transient-security",
          rules: [],
        },
      }),
    /NEON_EXPORT_CLASSIFICATION_INVALID/
  )
})

test("every category is documented and every relation names one of them", () => {
  for (const [relation, entry] of Object.entries(relationClassification)) {
    assert.ok(contentCategories[entry.category], relation)
    assert.equal(typeof contentCategories[entry.category], "string")
  }
})
