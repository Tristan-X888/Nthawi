import { createHash } from "node:crypto"
import { readFile, writeFile, readdir } from "node:fs/promises"

const root = new URL("../", import.meta.url)
const hash = (data) => createHash("sha256").update(data).digest("hex")
const journal = JSON.parse(
  await readFile(new URL("drizzle/meta/_journal.json", root), "utf8")
)
const snapshot = JSON.parse(
  await readFile(
    new URL(
      `drizzle/meta/${String(journal.entries.at(-1).idx).padStart(4, "0")}_snapshot.json`,
      root
    ),
    "utf8"
  )
)
const paths = [
  "drizzle/meta/_journal.json",
  ...journal.entries.flatMap((entry) => [
    `drizzle/${entry.tag}.sql`,
    `drizzle/meta/${String(entry.idx).padStart(4, "0")}_snapshot.json`,
  ]),
  ...(await readdir(new URL("src/schema/", root)))
    .filter((name) => name.endsWith(".ts"))
    .map((name) => `src/schema/${name}`),
]
const sources = Object.fromEntries(
  await Promise.all(
    paths.map(async (path) => [path, hash(await readFile(new URL(path, root)))])
  )
)
const migrations = journal.entries.map((entry) => ({
  hash: sources[`drizzle/${entry.tag}.sql`],
  createdAt: entry.when,
}))
const tables = Object.values(snapshot.tables).map((table) => ({
  name: table.name,
  rls: table.isRLSEnabled,
  primaryKey:
    Object.values(table.compositePrimaryKeys ?? {})[0]?.columns ??
    Object.values(table.columns)
      .filter((column) => column.primaryKey)
      .map((column) => column.name),
  uniqueConstraints: Object.values(table.uniqueConstraints ?? {}).map(
    (constraint) => ({
      name: constraint.name,
      columns: constraint.columns,
      nullsNotDistinct: constraint.nullsNotDistinct,
    })
  ),
  indexes: Object.values(table.indexes ?? {}).map((index) => ({
    name: index.name,
    columns: index.columns.map((column) => column.expression),
    unique: index.isUnique,
    method: index.method,
  })),
  foreignKeys: Object.values(table.foreignKeys ?? {}).map((key) => ({
    name: key.name,
    table: key.tableTo,
    columns: key.columnsFrom,
    foreignColumns: key.columnsTo,
    onDelete: key.onDelete,
    onUpdate: key.onUpdate,
  })),
  policies: Object.values(table.policies ?? {}).map((policy) => ({
    name: policy.name,
    command: policy.for.toUpperCase(),
    using: policy.using ?? null,
    check: policy.withCheck ?? null,
  })),
  columns: Object.values(table.columns).map((column) => ({
    name: column.name,
    type: column.type.replace(/^timestamp$/, "timestamp without time zone"),
    notNull: column.notNull,
  })),
}))
const enums = Object.values(snapshot.enums).map((type) => ({
  name: type.name,
  values: type.values,
}))
const helperDefinitions = new Map()
for (const entry of journal.entries) {
  const migration = await readFile(
    new URL(`drizzle/${entry.tag}.sql`, root),
    "utf8"
  )
  for (const match of migration.matchAll(
    /CREATE OR REPLACE FUNCTION app_private\.(current_owner_id|current_workspace_id)\(\)\s+RETURNS (text|uuid)[\s\S]*?\bAS \$\$([\s\S]*?)\$\$;/g
  ))
    helperDefinitions.set(match[1], {
      name: match[1],
      returns: match[2],
      source: match[3].trim().replace(/\s+/g, " "),
    })
}
const helpers = Array.from(helperDefinitions.values())
if (helpers.length !== 2)
  throw new Error("Reviewed context helper definitions are required")
const content = `// Generated from reviewed migrations and schema. Runtime never reads source files.\nexport const schemaManifest = ${JSON.stringify({ sources, migrations, tables, enums, helpers }, null, 2)} as const\n`
const destination = new URL("src/schema-manifest.ts", root)
if (process.argv.includes("--write")) await writeFile(destination, content)
else {
  // Ignore harmless formatting while checking the entire compiled contract.
  const actual = await import(destination.href + `?check=${Date.now()}`)
  if (
    JSON.stringify(actual.schemaManifest) !==
    JSON.stringify({ sources, migrations, tables, enums, helpers })
  )
    throw new Error(
      "Database schema manifest is stale; review migration/schema changes, then run db:manifest:update"
    )
}
