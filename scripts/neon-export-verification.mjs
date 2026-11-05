import { createHash } from "node:crypto"
import { schemaManifest } from "../packages/db/dist/schema-manifest.js"
import { canonicalRecoveryJson } from "./neon-recovery-contract.mjs"
import { protectedTables } from "./neon-synthetic-fixtures.mjs"

// Checks shared by the export (source snapshot) and the restore (restored
// copy). Kept separate so neither module imports the other's entry point.

function reject(code = "NEON_EXPORT_REJECTED") {
  throw new Error(code)
}
const sha256 = (value) => createHash("sha256").update(value).digest("hex")
const byCodePoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
function quote(value) {
  if (typeof value !== "string" || !/^[a-z_][a-z0-9_]{0,62}$/.test(value))
    reject()
  return `"${value}"`
}

const allowedExtensions = Object.freeze({
  plpgsql: "pg_catalog",
  vector: "public",
})
export const extensionSql =
  "SELECT e.extname AS name, n.nspname AS schema, e.extversion AS version FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace ORDER BY e.extname"

export function assertExtensionInventory(rows) {
  if (!Array.isArray(rows)) reject("NEON_EXPORT_EXTENSION_DRIFT")
  const actual = rows.map((row) => `${row?.schema}.${row?.name}`).sort()
  const expected = Object.entries(allowedExtensions)
    .map(([name, schema]) => `${schema}.${name}`)
    .sort()
  if (
    canonicalRecoveryJson(actual) !== canonicalRecoveryJson(expected) ||
    rows.some(
      (row) =>
        typeof row?.version !== "string" ||
        !/^[0-9]+\.[0-9]+(?:\.[0-9]+)?$/.test(row.version)
    )
  )
    reject("NEON_EXPORT_EXTENSION_DRIFT")
  return rows
    .map(({ name, schema, version }) => ({ name, schema, version }))
    .sort((a, b) => byCodePoint(a.name, b.name))
}

/**
 * Current reviewed restore policy is exact extension-version equality. A
 * cross-version restore needs its own reviewed compatibility decision and
 * pinned restore image; a successful row-count comparison cannot replace it.
 */
export function assertExtensionCompatibility(source, restored) {
  const expected = assertExtensionInventory(source)
  const actual = assertExtensionInventory(restored)
  if (canonicalRecoveryJson(expected) !== canonicalRecoveryJson(actual))
    reject("NEON_EXPORT_EXTENSION_VERSION_DRIFT")
  return actual
}

export const migrationLedgerSql =
  "SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at, id"

export function assertMigrationLedger(rows, manifest = schemaManifest) {
  if (!Array.isArray(rows)) reject("NEON_EXPORT_MIGRATION_DRIFT")
  const actual = rows.map((row) => ({
    hash: row?.hash,
    createdAt: Number(row?.created_at),
  }))
  const expected = manifest.migrations.map((migration) => ({
    hash: migration.hash,
    createdAt: migration.createdAt,
  }))
  if (
    actual.some((row) => !Number.isSafeInteger(row.createdAt)) ||
    canonicalRecoveryJson(actual) !== canonicalRecoveryJson(expected)
  )
    reject("NEON_EXPORT_MIGRATION_DRIFT")
  return actual.length
}

export async function captureSyntheticCoverage(client, fixture) {
  const coverage = []
  for (const tenant of fixture.tenants) {
    for (const [table, row] of tenant.rows) {
      const column = table === "monthly_usage" ? "workspace_id" : "id"
      const result = await client.query(
        `SELECT * FROM "public".${quote(table)} WHERE ${quote(column)} = $1`,
        [row[column]]
      )
      if (result.rows.length !== 1)
        reject("NEON_EXPORT_SYNTHETIC_COVERAGE_MISSING")
      coverage.push({
        tenant: tenant.workspaceId,
        table,
        key: { column, value: row[column] },
        count: result.rows.length,
        sha256: sha256(
          canonicalRecoveryJson(JSON.parse(JSON.stringify(result.rows)))
        ),
      })
    }
  }
  if (coverage.length !== protectedTables.length * 2)
    reject("NEON_EXPORT_SYNTHETIC_COVERAGE_MISSING")
  return coverage
}

// Restored-copy comparison. The caller restores into its own isolated target.
export async function compareRestoredSyntheticCoverage(client, manifest) {
  if (
    !Array.isArray(manifest?.syntheticCoverage) ||
    manifest.syntheticCoverage.length !== protectedTables.length * 2
  )
    reject("NEON_EXPORT_RESTORED_COVERAGE_MISMATCH")
  const tenants = new Map()
  for (const expected of manifest.syntheticCoverage) {
    if (!tenants.has(expected.tenant)) tenants.set(expected.tenant, new Set())
    const tables = tenants.get(expected.tenant)
    if (
      tables.has(expected.table) ||
      expected.count !== 1 ||
      !/^[a-f0-9]{64}$/.test(expected.sha256)
    )
      reject("NEON_EXPORT_RESTORED_COVERAGE_MISMATCH")
    tables.add(expected.table)
  }
  if (
    tenants.size !== 2 ||
    [...tenants.values()].some(
      (tables) =>
        tables.size !== protectedTables.length ||
        [...tables].some((table) => !protectedTables.includes(table))
    )
  )
    reject("NEON_EXPORT_RESTORED_COVERAGE_MISMATCH")
  for (const expected of manifest.syntheticCoverage) {
    if (!["id", "workspace_id"].includes(expected.key?.column))
      reject("NEON_EXPORT_RESTORED_COVERAGE_MISMATCH")
    const result = await client.query(
      `SELECT * FROM "public".${quote(expected.table)} WHERE ${quote(expected.key.column)} = $1`,
      [expected.key.value]
    )
    if (
      result.rows.length !== expected.count ||
      sha256(canonicalRecoveryJson(JSON.parse(JSON.stringify(result.rows)))) !==
        expected.sha256
    )
      reject("NEON_EXPORT_RESTORED_COVERAGE_MISMATCH")
  }
  return { matchedSyntheticRelations: manifest.syntheticCoverage.length }
}

/**
 * Every relation restores exactly its snapshot row count, except reviewed
 * transient relations whose data the dump excluded: those restore empty.
 */
export function assertRestoredCounts(
  source,
  restored,
  { excludedTableData = [] } = {}
) {
  const normalize = (rows) =>
    Array.isArray(rows)
      ? rows
          .map((row) => ({
            relation: row?.relation,
            total: String(row?.total),
          }))
          .sort((a, b) => byCodePoint(String(a.relation), String(b.relation)))
      : null
  const expected = normalize(source)
  const actual = normalize(restored)
  if (
    !expected ||
    !actual ||
    !Array.isArray(excludedTableData) ||
    excludedTableData.some(
      (relation) => !expected.some((row) => row.relation === relation)
    )
  )
    reject("NEON_EXPORT_RESTORED_COUNTS_MISMATCH")
  const excluded = new Set(excludedTableData)
  const required = expected.map((row) =>
    excluded.has(row.relation) ? { ...row, total: "0" } : row
  )
  if (canonicalRecoveryJson(required) !== canonicalRecoveryJson(actual))
    reject("NEON_EXPORT_RESTORED_COUNTS_MISMATCH")
  return expected.length
}

export async function readRelationCounts(client, relations) {
  const counts = []
  for (const relation of relations) {
    const [schema, name] = relation.split(".")
    const row = (
      await client.query(
        `SELECT count(*)::text AS total FROM ${quote(schema)}.${quote(name)}`
      )
    ).rows[0]
    counts.push({ relation, total: row?.total })
  }
  return counts
}
