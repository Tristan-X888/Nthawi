import { createHash, randomBytes, randomUUID } from "node:crypto"
import { createReadStream } from "node:fs"
import { spawn } from "node:child_process"
import { lstat, open } from "node:fs/promises"
import { createRequire } from "node:module"
import { join } from "node:path"
import { schemaManifest } from "../packages/db/dist/schema-manifest.js"
import {
  assertExportCatalog,
  exportCatalogSql,
  inspectContentBarrier,
  relationClassification,
  transientRelations,
} from "./neon-content-barrier.mjs"
import { canonicalRecoveryJson } from "./neon-recovery-contract.mjs"
import {
  assertExtensionInventory,
  assertExtensionCompatibility,
  assertMigrationLedger,
  assertRestoredCounts,
  compareRestoredSyntheticCoverage,
  extensionSql,
  migrationLedgerSql,
  readRelationCounts,
} from "./neon-export-verification.mjs"

// Restores a Phase 4 synthetic export into an OWNED, disposable local
// PostgreSQL 18 container (the digest-pinned test image, tmpfs storage,
// loopback-only port) and compares it with the export manifest. Nothing is
// restored into Neon, and no container without this run's label is stopped.

const ownerLabel = "nthawi.owner=phase4-restore"

function reject(code) {
  throw new Error(code)
}

export function pinnedTestImage(compose) {
  const match = /image: (pgvector\/pgvector:pg18@sha256:[a-f0-9]{64})/.exec(
    typeof compose === "string" ? compose : ""
  )
  if (!match) reject("NEON_RESTORE_IMAGE_REJECTED")
  return match[1]
}

function runCommand(program, args, { env, timeout = 120_000 } = {}) {
  return new Promise((resolveRun, rejectRun) => {
    let child
    try {
      child = spawn(program, args, {
        env,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        timeout,
      })
    } catch {
      rejectRun(new Error("NEON_RESTORE_TOOL_UNAVAILABLE"))
      return
    }
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (data) => {
      stdout = (stdout + data.toString()).slice(0, 65_536)
    })
    child.stderr.on("data", (data) => {
      stderr = (stderr + data.toString()).slice(-65_536)
    })
    child.once("error", () =>
      rejectRun(new Error("NEON_RESTORE_TOOL_UNAVAILABLE"))
    )
    child.once("close", (code) =>
      resolveRun({ code: code ?? -1, stdout, stderr })
    )
  })
}

async function writePrivateText(path, text) {
  const handle = await open(path, "wx", 0o600)
  try {
    await handle.writeFile(text)
    await handle.sync()
  } finally {
    await handle.close()
  }
}

/** Check actual bytes before creating any restore resource or reading SQL. */
export async function assertDumpIntegrity(directory, manifest) {
  if (
    !/^[a-f0-9]{64}$/.test(manifest?.dumpSha256 ?? "") ||
    !Number.isSafeInteger(manifest?.dumpBytes) ||
    manifest.dumpBytes < 1
  )
    reject("NEON_EXPORT_RESTORE_HASH_MISSING")
  try {
    const path = join(directory, "database.dump")
    const before = await lstat(path)
    if (!before.isFile() || before.size !== manifest.dumpBytes)
      reject("NEON_EXPORT_RESTORE_HASH_MISMATCH")
    const digest = createHash("sha256")
    for await (const bytes of createReadStream(path)) digest.update(bytes)
    const actual = digest.digest("hex")
    const after = await lstat(path)
    if (
      !after.isFile() ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ino !== before.ino ||
      actual !== manifest.dumpSha256
    )
      reject("NEON_EXPORT_RESTORE_HASH_MISMATCH")
    return { dumpSha256: actual, dumpBytes: before.size }
  } catch (error) {
    if (error?.message === "NEON_EXPORT_RESTORE_HASH_MISMATCH") throw error
    reject("NEON_EXPORT_RESTORE_DUMP_UNAVAILABLE")
  }
}

function defaultDependencies() {
  const { Client } = createRequire(
    new URL("../packages/db/package.json", import.meta.url)
  )("pg")
  return {
    docker: (args, extraEnv = {}) =>
      runCommand("docker", args, { env: { ...process.env, ...extraEnv } }),
    restoreTool: (args, { pgRestore, env }) =>
      runCommand(pgRestore, args, { env, timeout: 600_000 }),
    connect: async (database, connection, { wait = false } = {}) => {
      for (let attempt = 0; ; attempt++) {
        const client = new Client({
          ...connection,
          database,
          ssl: false,
          connectionTimeoutMillis: 2_000,
        })
        client.on("error", () => {})
        try {
          await client.connect()
          return client
        } catch (error) {
          await client.end().catch(() => {})
          if (!wait || attempt >= 60) throw error
          await new Promise((resolveWait) => setTimeout(resolveWait, 500))
        }
      }
    },
    verifyFull: verifyRestoredCopy,
    comparePartial: compareRestoredSyntheticCoverage,
  }
}

/**
 * Every restored relation, row count and synthetic row must match exactly.
 * Only the reviewed transient relations may (and must) restore empty.
 */
export async function verifyRestoredCopy(client, manifest) {
  if (
    !Array.isArray(manifest?.excludedTableData) ||
    canonicalRecoveryJson(manifest.excludedTableData) !==
      canonicalRecoveryJson(transientRelations)
  )
    reject("NEON_EXPORT_RESTORE_EXCLUSIONS_MISMATCH")
  const catalogSha256 = assertExportCatalog(
    schemaManifest,
    (await client.query(exportCatalogSql)).rows
  )
  const extensions = assertExtensionInventory(
    (await client.query(extensionSql)).rows
  )
  assertExtensionCompatibility(manifest.extensions, extensions)
  const migrations = assertMigrationLedger(
    (await client.query(migrationLedgerSql)).rows
  )
  const relations = Object.keys(relationClassification).sort()
  const counts = assertRestoredCounts(
    manifest.barrier,
    await readRelationCounts(client, relations),
    { excludedTableData: manifest.excludedTableData }
  )
  const { matchedSyntheticRelations } = await compareRestoredSyntheticCoverage(
    client,
    manifest
  )
  // Restored content must satisfy the same barrier as the exported snapshot.
  await inspectContentBarrier(client, manifest.snapshotAt)
  return {
    restoredCatalogSha256: catalogSha256,
    restoredExtensions: extensions,
    restoredMigrations: migrations,
    restoredRelationCounts: counts,
    matchedSyntheticRelations,
  }
}

async function restore(
  deps,
  { pgRestore, connection, database, dump, stderrFile }
) {
  const outcome = await deps.restoreTool(
    [
      "--no-password",
      "--host",
      connection.host,
      "--port",
      String(connection.port),
      "--username",
      connection.user,
      "--dbname",
      database,
      "--no-owner",
      "--no-privileges",
      "--exit-on-error",
      dump,
    ],
    {
      pgRestore,
      env: {
        SystemRoot: process.env.SystemRoot,
        PATH: process.env.PATH,
        PGPASSWORD: connection.password,
        PGSSLMODE: "disable",
        PGCONNECT_TIMEOUT: "15",
      },
    }
  )
  // Local synthetic-only diagnostics are kept privately for review.
  if (outcome.stderr) await writePrivateText(stderrFile, outcome.stderr)
  if (outcome.code !== 0) reject(`NEON_EXPORT_RESTORE_FAILED:${database}`)
}

export async function verifyRestoredExport(
  { pgRestore, directory, manifest, partialDump, compose },
  deps = defaultDependencies()
) {
  const image = pinnedTestImage(compose)
  const dumpIntegrity = await assertDumpIntegrity(directory, manifest)
  const name = `nthawi-phase4-restore-${randomUUID().replaceAll("-", "")}`
  const password = randomBytes(24).toString("hex")
  const result = {
    image,
    dumpIntegrity,
    fullRestoreVerified: false,
    partialDumpIncomplete: null,
    containerRemoved: false,
  }
  let id
  let primaryError
  try {
    const started = await deps.docker(
      [
        "run",
        "--rm",
        "--detach",
        "--name",
        name,
        "--label",
        ownerLabel,
        "--tmpfs",
        "/var/lib/postgresql",
        "--publish",
        "127.0.0.1::5432",
        "--env",
        "POSTGRES_USER=restoreadmin",
        // The value comes from the docker client's environment, not argv.
        "--env",
        "POSTGRES_PASSWORD",
        "--env",
        "POSTGRES_DB=restore_control",
        "--env",
        "POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256",
        image,
      ],
      { POSTGRES_PASSWORD: password }
    )
    const startedId = started.stdout.trim()
    if (started.code !== 0 || !/^[a-f0-9]{64}$/.test(startedId))
      reject("NEON_RESTORE_CONTAINER_FAILED")
    id = startedId
    const port = /^127\.0\.0\.1:(\d+)$/m.exec(
      (await deps.docker(["port", id, "5432/tcp"])).stdout
    )?.[1]
    if (!port) reject("NEON_RESTORE_PORT_REJECTED")
    const connection = {
      host: "127.0.0.1",
      port: Number(port),
      user: "restoreadmin",
      password,
    }
    const control = await deps.connect("restore_control", connection, {
      wait: true,
    })
    try {
      await control.query('CREATE DATABASE "restore_full"')
      if (partialDump) await control.query('CREATE DATABASE "restore_partial"')
    } finally {
      await control.end()
    }
    await restore(deps, {
      pgRestore,
      connection,
      database: "restore_full",
      dump: join(directory, "database.dump"),
      stderrFile: join(directory, "restore-full.stderr.txt"),
    })
    const full = await deps.connect("restore_full", connection)
    try {
      Object.assign(result, await deps.verifyFull(full, manifest))
      result.fullRestoreVerified = true
    } finally {
      await full.end()
    }
    if (partialDump) {
      await restore(deps, {
        pgRestore,
        connection,
        database: "restore_partial",
        dump: partialDump,
        stderrFile: join(directory, "restore-partial.stderr.txt"),
      })
      const partial = await deps.connect("restore_partial", connection)
      try {
        let complete = false
        try {
          await deps.comparePartial(partial, manifest)
          complete = true
        } catch {
          complete = false
        }
        // An --enable-row-security dump must never pass as a complete backup.
        if (complete) reject("NEON_EXPORT_PARTIAL_DUMP_UNEXPECTEDLY_COMPLETE")
        result.partialDumpIncomplete = true
      } finally {
        await partial.end()
      }
    }
    return result
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    if (id) {
      const owned = await deps.docker([
        "ps",
        "-a",
        "--filter",
        `id=${id}`,
        "--filter",
        `label=${ownerLabel}`,
        "--format",
        "{{.ID}}",
      ])
      const listed = owned.stdout.trim()
      if (owned.code === 0 && listed && id.startsWith(listed)) {
        const stopped = await deps.docker(["stop", "--time", "5", id])
        result.containerRemoved = stopped.code === 0
      }
      if (!result.containerRemoved && !primaryError)
        reject("NEON_RESTORE_CONTAINER_OWNERSHIP_UNCONFIRMED")
    }
  }
}
