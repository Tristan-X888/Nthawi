import { createHash } from "node:crypto"
import { schemaManifest } from "../packages/db/dist/schema-manifest.js"
import {
  canonicalRecoveryJson,
  recoveryPolicy,
} from "./neon-recovery-contract.mjs"

// Pre-export content barrier (Phase 3 data-and-recovery design, P3-D15).
// Every relation an export can contain is classified. In the exported
// snapshot, any row whose deleted or expired content should already have been
// removed (15 minutes after its policy event) blocks the export before pg_dump
// starts. Unknown relations, columns, categories or rules fail closed.

if (recoveryPolicy.contentCleanupMs !== 15 * 60_000)
  throw new Error("NEON_EXPORT_CLASSIFICATION_INVALID")
const cleanupLag = "interval '15 minutes'"
// Conversation content is retained 90 x 24 hours from message creation (D-19).
const messageRetentionHours = 2160

export const contentScopes = Object.freeze([
  "account",
  "workspace",
  "source",
  "revision",
  "conversation",
  "message",
])
// Revocation intents share the journal but never imply content removal.
export const journalScopes = Object.freeze([
  ...contentScopes,
  "credential",
  "grant",
])

export const contentCategories = Object.freeze({
  "tenant-content":
    "Owner, visitor or knowledge content and owner-entered workspace configuration. Removed from database rows within 15 minutes of its deletion or expiry event.",
  "identity-pii":
    "Account identity data. Removed within 15 minutes of account deletion.",
  "identity-credential":
    "Sessions, provider tokens, password hashes and verification tokens. Removed within 15 minutes of account deletion.",
  "minimal-accounting":
    "Usage and cost metadata without message or document content. Retained under the separately approved financial and audit policy (Phase 7 gate).",
  "deletion-intent":
    "Minimal deletion and revocation intent records kept so a restore can replay them. Malformed records block an export.",
  "migration-history": "Schema migration bookkeeping without customer data.",
  "ungoverned-operational":
    "Operational rows whose payload has no reviewed content contract yet. Any row blocks an export until a rule is reviewed.",
  "transient-security":
    "Short-lived security counters (rate-limit windows keyed by client address and route). Never a recovery source: their data is excluded from every recovery copy, a restore starts the table empty, and rows never block an export.",
})

const categoryRules = Object.freeze({
  "tenant-content": "content",
  "identity-pii": "content",
  "identity-credential": "content",
  "minimal-accounting": "none",
  "migration-history": "none",
  "deletion-intent": "journal-shape",
  "ungoverned-operational": "always",
  "transient-security": "none",
})

const workspaceHop = (column = "workspace_id") => ({
  relation: "public.workspaces",
  column,
  key: "id",
})
// Workspace deletion, account deletion through the owning workspace, and a
// dangling workspace reference all make a workspace-scoped row overdue.
const workspaceRules = (column = "workspace_id") => [
  { kind: "journal", scope: "workspace", column },
  {
    kind: "journal",
    scope: "account",
    column: "owner_id",
    through: [workspaceHop(column)],
  },
  { kind: "missing-parent", relation: "public.workspaces", column, key: "id" },
]
const revisionHop = {
  relation: "public.knowledge_revisions",
  column: "revision_id",
  key: "id",
}
const sourceHop = {
  relation: "public.knowledge_sources",
  column: "source_id",
  key: "id",
}
const messageHop = {
  relation: "public.messages",
  column: "message_id",
  key: "id",
}

const entry = (category, rules = []) => Object.freeze({ category, rules })

export const relationClassification = Object.freeze({
  "drizzle.__drizzle_migrations": entry("migration-history"),
  "public.account": entry("identity-credential", [
    { kind: "journal", scope: "account", column: "user_id" },
  ]),
  "public.ai_invocations": entry("minimal-accounting"),
  "public.assistants": entry("tenant-content", workspaceRules()),
  "public.audit_events": entry("ungoverned-operational", [{ kind: "always" }]),
  "public.citations": entry("tenant-content", [
    ...workspaceRules(),
    { kind: "journal", scope: "message", column: "message_id" },
    { kind: "journal", scope: "source", column: "source_id" },
    { kind: "journal", scope: "revision", column: "revision_id" },
    {
      kind: "journal",
      scope: "conversation",
      column: "conversation_id",
      through: [messageHop],
    },
    { kind: "due", column: "deleted_at", through: [sourceHop] },
    {
      kind: "age",
      column: "created_at",
      hours: messageRetentionHours,
      through: [messageHop],
    },
    {
      kind: "missing-parent",
      relation: "public.messages",
      column: "message_id",
      key: "id",
    },
    {
      kind: "missing-parent",
      relation: "public.knowledge_sources",
      column: "source_id",
      key: "id",
    },
    {
      kind: "missing-parent",
      relation: "public.knowledge_revisions",
      column: "revision_id",
      key: "id",
    },
    {
      kind: "missing-parent",
      relation: "public.knowledge_chunks",
      column: "chunk_id",
      key: "id",
    },
  ]),
  "public.conversations": entry("tenant-content", [
    ...workspaceRules(),
    { kind: "journal", scope: "conversation", column: "id" },
  ]),
  "public.deletion_journal": entry("deletion-intent", [
    { kind: "journal-shape" },
  ]),
  "public.global_monthly_ai_usage": entry("minimal-accounting"),
  "public.knowledge_chunks": entry("tenant-content", [
    ...workspaceRules(),
    { kind: "journal", scope: "revision", column: "revision_id" },
    {
      kind: "journal",
      scope: "source",
      column: "source_id",
      through: [revisionHop],
    },
    { kind: "due", column: "deleted_at", through: [revisionHop, sourceHop] },
  ]),
  "public.knowledge_revisions": entry("tenant-content", [
    ...workspaceRules(),
    { kind: "journal", scope: "revision", column: "id" },
    { kind: "journal", scope: "source", column: "source_id" },
    { kind: "due", column: "deleted_at", through: [sourceHop] },
  ]),
  "public.knowledge_sources": entry("tenant-content", [
    ...workspaceRules(),
    { kind: "journal", scope: "source", column: "id" },
    { kind: "due", column: "deleted_at" },
  ]),
  "public.messages": entry("tenant-content", [
    ...workspaceRules(),
    { kind: "journal", scope: "message", column: "id" },
    { kind: "journal", scope: "conversation", column: "conversation_id" },
    { kind: "age", column: "created_at", hours: messageRetentionHours },
  ]),
  "public.monthly_usage": entry("minimal-accounting"),
  // Better Auth's database rate limiter: key (client address + route), count,
  // last request. Restoring stale windows has no value, and excluding them
  // keeps client addresses out of the eight-day recovery copies (P4-D09).
  "public.rate_limit": entry("transient-security"),
  "public.session": entry("identity-credential", [
    { kind: "journal", scope: "account", column: "user_id" },
  ]),
  "public.user": entry("identity-pii", [
    { kind: "journal", scope: "account", column: "id" },
  ]),
  // Verification rows carry no user key or lifecycle generation in the current
  // schema. Creation after deletion does not prove unrelated identity: a stale
  // queued write can arrive later. Until lineage/fencing is implemented and
  // reviewed, any verification row blocks once any account deletion is overdue.
  "public.verification": entry("identity-credential", [
    { kind: "journal-any", scope: "account" },
  ]),
  "public.visitor_sessions": entry("tenant-content", workspaceRules()),
  "public.widget_installations": entry("tenant-content", workspaceRules()),
  "public.workspaces": entry("tenant-content", [
    { kind: "journal", scope: "workspace", column: "id" },
    { kind: "journal", scope: "account", column: "owner_id" },
  ]),
})

// Drizzle's ledger is created by the migrator, so it is not in the manifest.
const migrationLedger = Object.freeze({
  schema: "drizzle",
  name: "__drizzle_migrations",
  kind: "r",
  rls: false,
  forced: false,
  columns: [
    { name: "created_at", type: "bigint", notNull: false },
    { name: "hash", type: "text", notNull: true },
    { name: "id", type: "integer", notNull: true },
  ],
})

// Reviewed with this classification. Any change to a table, column, type,
// nullability or RLS flag makes exports fail until the classification is
// reviewed and this value is updated in the same change.
export const reviewedClassificationFingerprint =
  "c3d5550c9cb1696aae953c97086308967b0a4de6f070b98ab623c8292d884a4a"

class NeonContentBarrierError extends Error {
  constructor(code, blockedRelations = []) {
    super(code)
    this.name = "NeonContentBarrierError"
    this.blockedRelations = blockedRelations
  }
}
const invalid = () => {
  throw new NeonContentBarrierError("NEON_EXPORT_CLASSIFICATION_INVALID")
}
const stale = () => {
  throw new NeonContentBarrierError("NEON_EXPORT_CLASSIFICATION_STALE")
}
const sha256 = (value) => createHash("sha256").update(value).digest("hex")
const byCodePoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const identifierPattern = /^[a-z_][a-z0-9_]{0,62}$/

function quote(name) {
  if (typeof name !== "string" || !identifierPattern.test(name)) invalid()
  return `"${name}"`
}
function splitRelation(relation) {
  const parts = typeof relation === "string" ? relation.split(".") : []
  if (parts.length !== 2) invalid()
  parts.forEach(quote)
  return { schema: parts[0], name: parts[1] }
}
const relationSql = (relation) => {
  const { schema, name } = splitRelation(relation)
  return `${quote(schema)}.${quote(name)}`
}

function transientRelationsOf(classification) {
  return Object.keys(classification ?? {})
    .filter(
      (relation) => classification[relation]?.category === "transient-security"
    )
    .map((relation) => {
      splitRelation(relation)
      return relation
    })
    .sort(byCodePoint)
}

/** Relations whose data no recovery copy may contain. */
export const transientRelations = Object.freeze(
  transientRelationsOf(relationClassification)
)

/**
 * pg_dump arguments for every recovery dump. Quoted identifiers match exactly
 * one table each; a pattern wildcard can never widen the exclusion. Restore
 * verification expects each excluded table to restore empty.
 */
export function recoveryDumpExclusions(
  classification = relationClassification
) {
  return transientRelationsOf(classification).map(
    (relation) => `--exclude-table-data=${relationSql(relation)}`
  )
}

function normalizedTables(manifest) {
  if (!Array.isArray(manifest?.tables)) stale()
  return manifest.tables
    .map((table) => ({
      name: table.name,
      rls: table.rls === true,
      columns: (table.columns ?? [])
        .map((column) => ({
          name: column.name,
          type: column.type,
          notNull: column.notNull === true,
        }))
        .sort((a, b) => byCodePoint(a.name, b.name)),
    }))
    .sort((a, b) => byCodePoint(a.name, b.name))
}

export function classificationFingerprint(manifest) {
  return sha256(canonicalRecoveryJson(normalizedTables(manifest)))
}

function columnTypes(manifest) {
  const types = new Map()
  for (const table of normalizedTables(manifest))
    types.set(
      `public.${table.name}`,
      new Map(table.columns.map((column) => [column.name, column.type]))
    )
  types.set(
    "drizzle.__drizzle_migrations",
    new Map(migrationLedger.columns.map((column) => [column.name, column.type]))
  )
  return types
}

function columnType(types, relation, column) {
  quote(column)
  const type = types.get(relation)?.get(column)
  if (!type) invalid()
  return type
}

// Database timestamps without a zone are written by Better Auth in UTC.
function instant(types, relation, column, alias) {
  const type = columnType(types, relation, column)
  if (type === "timestamp with time zone") return `${alias}.${quote(column)}`
  if (type === "timestamp without time zone")
    return `(${alias}.${quote(column)} AT TIME ZONE 'UTC')`
  invalid()
}

// Follows reviewed foreign-key-shaped hops from t to the final row alias.
function hops(types, relation, path, column, condition) {
  if (!Array.isArray(path) || path.length === 0) invalid()
  let current = relation
  let previousAlias = "t"
  let joins = ""
  let first
  path.forEach((hop, index) => {
    columnType(types, current, hop.column)
    columnType(types, hop.relation, hop.key)
    const alias = `p${index + 1}`
    if (index === 0)
      first = `${alias}.${quote(hop.key)} = t.${quote(hop.column)}`
    else
      joins += ` JOIN ${relationSql(hop.relation)} ${alias} ON ${alias}.${quote(hop.key)} = ${previousAlias}.${quote(hop.column)}`
    previousAlias = alias
    current = hop.relation
  })
  columnType(types, current, column)
  return `EXISTS (SELECT 1 FROM ${relationSql(path[0].relation)} p1${joins} WHERE ${first} AND ${condition(current, previousAlias)})`
}

function journalMatch(scope, expression) {
  if (!journalScopes.includes(scope)) invalid()
  return `EXISTS (SELECT 1 FROM "public"."deletion_journal" j WHERE j."scope" = '${scope}' AND lower(j."resource_id") = lower((${expression})::text) AND j."deleted_at" <= $1::timestamptz - ${cleanupLag})`
}

function ruleSql(types, relation, rule) {
  if (!rule || typeof rule !== "object") invalid()
  switch (rule.kind) {
    case "journal":
      if (rule.through)
        return hops(types, relation, rule.through, rule.column, (_, alias) =>
          journalMatch(rule.scope, `${alias}.${quote(rule.column)}`)
        )
      columnType(types, relation, rule.column)
      return journalMatch(rule.scope, `t.${quote(rule.column)}`)
    case "due": {
      const condition = (target, alias) =>
        `${instant(types, target, rule.column, alias)} <= $1::timestamptz - ${cleanupLag}`
      return rule.through
        ? hops(types, relation, rule.through, rule.column, condition)
        : condition(relation, "t")
    }
    case "age": {
      if (!Number.isSafeInteger(rule.hours) || rule.hours < 1) invalid()
      const condition = (target, alias) =>
        `${instant(types, target, rule.column, alias)} <= $1::timestamptz - interval '${rule.hours} hours' - ${cleanupLag}`
      return rule.through
        ? hops(types, relation, rule.through, rule.column, condition)
        : condition(relation, "t")
    }
    case "missing-parent":
      columnType(types, relation, rule.column)
      columnType(types, rule.relation, rule.key)
      return `(t.${quote(rule.column)} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${relationSql(rule.relation)} parent WHERE parent.${quote(rule.key)} = t.${quote(rule.column)}))`
    case "journal-any":
      if (!journalScopes.includes(rule.scope)) invalid()
      return `EXISTS (SELECT 1 FROM "public"."deletion_journal" j WHERE j."scope" = '${rule.scope}' AND j."deleted_at" <= $1::timestamptz - ${cleanupLag})`
    case "journal-shape":
      if (relation !== "public.deletion_journal") invalid()
      return `(t."scope" IS NULL OR t."scope" NOT IN (${journalScopes.map((scope) => `'${scope}'`).join(", ")}) OR t."resource_id" IS NULL OR t."resource_id" = '' OR t."deleted_at" IS NULL OR t."deleted_at" > $1::timestamptz)`
    case "always":
      return "true"
    default:
      invalid()
  }
}

function validateEntry(relation, value) {
  splitRelation(relation)
  if (!value || typeof value !== "object") invalid()
  const expectation = categoryRules[value.category]
  if (!contentCategories[value.category] || !expectation) invalid()
  if (!Array.isArray(value.rules)) invalid()
  const kinds = value.rules.map((rule) => rule?.kind)
  if (expectation === "none" && kinds.length !== 0) invalid()
  if (expectation === "always" && (kinds.length !== 1 || kinds[0] !== "always"))
    invalid()
  if (
    expectation === "journal-shape" &&
    (kinds.length !== 1 || kinds[0] !== "journal-shape")
  )
    invalid()
  if (
    expectation === "content" &&
    (kinds.length === 0 ||
      kinds.some((kind) => kind === "always" || kind === "journal-shape"))
  )
    invalid()
}

export function barrierQueries(
  classification = relationClassification,
  manifest = schemaManifest
) {
  const types = columnTypes(manifest)
  return Object.fromEntries(
    Object.keys(classification)
      .sort(byCodePoint)
      .map((relation) => {
        const value = classification[relation]
        validateEntry(relation, value)
        const predicate = value.rules.length
          ? value.rules
              .map((rule) => `(${ruleSql(types, relation, rule)})`)
              .join(" OR ")
          : "false"
        return [
          relation,
          `SELECT count(*)::text AS total, count(*) FILTER (WHERE ${predicate})::text AS overdue FROM ${relationSql(relation)} t WHERE $1::timestamptz IS NOT NULL`,
        ]
      })
  )
}

/**
 * Proves the classification covers exactly the reviewed schema. Returns the
 * sorted relation list. Test fixtures may pass an explicit classification and
 * fingerprint; production callers use the reviewed defaults only.
 */
export function assertClassificationCurrent(
  manifest,
  {
    classification = relationClassification,
    fingerprint = reviewedClassificationFingerprint,
  } = {}
) {
  const tables = normalizedTables(manifest).map(
    (table) => `public.${table.name}`
  )
  const relations = Object.keys(classification ?? {}).sort(byCodePoint)
  const expected = [...tables, "drizzle.__drizzle_migrations"].sort(byCodePoint)
  if (
    new Set(tables).size !== tables.length ||
    canonicalRecoveryJson(relations) !== canonicalRecoveryJson(expected) ||
    classificationFingerprint(manifest) !== fingerprint
  )
    stale()
  barrierQueries(classification, manifest)
  return relations
}

export function expectedExportCatalog(manifest = schemaManifest) {
  return [
    ...normalizedTables(manifest).map((table) => ({
      schema: "public",
      name: table.name,
      kind: "r",
      rls: table.rls,
      forced: table.rls,
      columns: table.columns,
    })),
    migrationLedger,
  ]
}

function canonicalCatalog(rows) {
  if (!Array.isArray(rows))
    throw new NeonContentBarrierError("NEON_EXPORT_CATALOG_DRIFT")
  return rows
    .map((row) => ({
      schema: row?.schema,
      name: row?.name,
      kind: row?.kind,
      rls: row?.rls === true,
      forced: row?.forced === true,
      columns: (Array.isArray(row?.columns) ? row.columns : [])
        .map((column) => ({
          name: column?.name,
          type: column?.type,
          notNull: column?.notNull === true,
        }))
        .sort((a, b) => byCodePoint(String(a.name), String(b.name))),
    }))
    .sort((a, b) =>
      byCodePoint(`${a.schema}.${a.name}`, `${b.schema}.${b.name}`)
    )
}

export function assertExportCatalog(manifest, catalog) {
  const actual = canonicalRecoveryJson(canonicalCatalog(catalog))
  if (
    actual !==
    canonicalRecoveryJson(canonicalCatalog(expectedExportCatalog(manifest)))
  )
    throw new NeonContentBarrierError("NEON_EXPORT_CATALOG_DRIFT")
  return sha256(actual)
}

// Every non-system relation, including extension members, views and foreign
// tables. Extension name/version alone does not classify member-table payloads.
export const exportCatalogSql = `SELECT n.nspname AS schema, c.relname AS name, c.relkind AS kind,
  c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
  COALESCE(json_agg(json_build_object('name', a.attname, 'type', format_type(a.atttypid, a.atttypmod),
    'notNull', a.attnotnull) ORDER BY a.attname COLLATE "C") FILTER (WHERE a.attnum IS NOT NULL), '[]'::json) AS columns
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    AND n.nspname !~ '^pg_(temp|toast_temp)_[0-9]+$'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  GROUP BY n.nspname, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity`

const countPattern = /^(0|[1-9][0-9]{0,18})$/
export function assertBarrierFindings(
  findings,
  classification = relationClassification
) {
  const relations = Object.keys(classification).sort(byCodePoint)
  if (
    !Array.isArray(findings) ||
    findings.length !== relations.length ||
    canonicalRecoveryJson(
      findings.map((row) => row?.relation).sort(byCodePoint)
    ) !== canonicalRecoveryJson(relations) ||
    findings.some(
      (row) =>
        !countPattern.test(String(row.total)) ||
        !countPattern.test(String(row.overdue)) ||
        BigInt(row.overdue) > BigInt(row.total)
    )
  )
    throw new NeonContentBarrierError("NEON_EXPORT_CONTENT_BARRIER_INCOMPLETE")
  const blocked = findings
    .filter((row) => BigInt(row.overdue) !== 0n)
    .map((row) => row.relation)
    .sort(byCodePoint)
  if (blocked.length)
    throw new NeonContentBarrierError(
      "NEON_EXPORT_CONTENT_BARRIER_BLOCKED",
      blocked
    )
  return findings
}

/**
 * Runs inside the caller's exported snapshot transaction, before pg_dump.
 * Returns per-relation row counts only; never row content.
 */
export async function inspectContentBarrier(
  client,
  snapshotAt,
  { classification = relationClassification, manifest = schemaManifest } = {}
) {
  const at = new Date(snapshotAt)
  if (!Number.isFinite(at.getTime()))
    throw new NeonContentBarrierError("NEON_EXPORT_CONTENT_BARRIER_INCOMPLETE")
  const findings = []
  for (const [relation, text] of Object.entries(
    barrierQueries(classification, manifest)
  )) {
    const row = (await client.query(text, [at.toISOString()])).rows[0]
    findings.push({ relation, total: row?.total, overdue: row?.overdue })
  }
  return assertBarrierFindings(findings, classification)
}
