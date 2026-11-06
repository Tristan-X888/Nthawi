import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtemp, readdir, unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import {
  pinnedTestImage,
  verifyRestoredCopy,
  verifyRestoredExport,
} from "./neon-export-restore.mjs"

const image = `pgvector/pgvector:pg18@sha256:${"2".repeat(64)}`
const compose = `services:\n  postgres:\n    image: ${image}\n`
const containerId = "f".repeat(64)

function dependencies({
  fullExit = 0,
  partialExit = 0,
  verifyFull = async () => ({ catalogSha256: "c".repeat(64), counts: 21 }),
  partialComplete = false,
  ownedLabel = true,
} = {}) {
  const events = []
  return {
    events,
    docker: async (args) => {
      events.push(`docker ${args[0]}`)
      if (args[0] === "run") return { code: 0, stdout: `${containerId}\n` }
      if (args[0] === "port") return { code: 0, stdout: "127.0.0.1:49152\n" }
      if (args[0] === "ps")
        return { code: 0, stdout: ownedLabel ? `${containerId}\n` : "" }
      if (args[0] === "stop") return { code: 0, stdout: "" }
      return { code: 1, stdout: "" }
    },
    restoreTool: async (args) => {
      const database = args[args.indexOf("--dbname") + 1]
      events.push(`restore ${database}`)
      return {
        code: database === "restore_full" ? fullExit : partialExit,
        stderr: "",
      }
    },
    connect: async (database) => {
      events.push(`connect ${database}`)
      return {
        query: async () => ({ rows: [] }),
        end: async () => events.push(`end ${database}`),
      }
    },
    verifyFull,
    comparePartial: async () => {
      events.push("compare partial")
      if (partialComplete) return { matchedSyntheticRelations: 24 }
      throw new Error("NEON_EXPORT_RESTORED_COVERAGE_MISMATCH")
    },
  }
}

const input = async (overrides = {}) => {
  const directory = await mkdtemp(join(tmpdir(), "nthawi-restore-test-"))
  const dump = Buffer.from("synthetic-restore-unit-fixture")
  await writeFile(join(directory, "database.dump"), dump, {
    flag: "wx",
    mode: 0o600,
  })
  return {
    pgRestore: "C:/pg/pg_restore.exe",
    directory,
    manifest: {
      snapshotAt: "2026-11-05T12:00:00.000Z",
      barrier: [],
      dumpSha256: createHash("sha256").update(dump).digest("hex"),
      dumpBytes: dump.length,
    },
    partialDump: "C:/evidence/partial.dump",
    compose,
    ...overrides,
  }
}

test("a manifest whose data exclusions differ from the reviewed list is rejected before reading the copy", async () => {
  let queries = 0
  const client = {
    query: async () => {
      queries++
      throw new Error("must not query the restored copy")
    },
  }
  for (const excludedTableData of [
    undefined,
    [],
    ["public.rate_limit", "public.messages"],
    ["public.messages"],
    "public.rate_limit",
  ])
    await assert.rejects(
      verifyRestoredCopy(client, {
        snapshotAt: "2026-11-05T12:00:00.000Z",
        barrier: [],
        excludedTableData,
      }),
      /NEON_EXPORT_RESTORE_EXCLUSIONS_MISMATCH/
    )
  assert.equal(queries, 0)
})

test("only the digest-pinned test image is accepted", () => {
  assert.equal(pinnedTestImage(compose), image)
  assert.throws(
    () => pinnedTestImage("image: pgvector/pgvector:pg18\n"),
    /NEON_RESTORE_IMAGE_REJECTED/
  )
})

test("missing, corrupted, substituted and wrong-length dumps fail before any container", async () => {
  for (const change of [
    async (options) => {
      delete options.manifest.dumpSha256
    },
    async (options) => {
      delete options.manifest.dumpBytes
    },
    async (options) => {
      options.manifest.dumpBytes += 1
    },
    async (options) => {
      options.manifest.dumpSha256 = "f".repeat(64)
    },
    async (options) => {
      await unlink(join(options.directory, "database.dump"))
    },
    async (options) => {
      await writeFile(
        join(options.directory, "database.dump"),
        Buffer.alloc(options.manifest.dumpBytes, 0x78)
      )
    },
  ]) {
    const options = await input()
    await change(options)
    const deps = dependencies()
    await assert.rejects(
      verifyRestoredExport(options, deps),
      /NEON_EXPORT_RESTORE_(HASH|DUMP)/
    )
    assert.deepEqual(
      deps.events,
      [],
      "hash rejection must precede resource creation"
    )
  }
})

test("a verified full restore and an incomplete partial restore pass", async () => {
  const deps = dependencies()
  const result = await verifyRestoredExport(await input(), deps)
  assert.equal(result.fullRestoreVerified, true)
  assert.equal(result.partialDumpIncomplete, true)
  assert.equal(result.containerRemoved, true)
  assert.equal(result.image, image)
  // Restore happens into separate databases, then the owned container stops.
  assert.deepEqual(
    deps.events.filter((event) => /^(restore|docker stop)/.test(event)),
    ["restore restore_full", "restore restore_partial", "docker stop"]
  )
})

test("a partial dump that restores every synthetic row is rejected", async () => {
  const deps = dependencies({ partialComplete: true })
  await assert.rejects(
    verifyRestoredExport(await input(), deps),
    /NEON_EXPORT_PARTIAL_DUMP_UNEXPECTEDLY_COMPLETE/
  )
  assert.ok(deps.events.includes("docker stop"))
})

test("restore and comparison failures still remove the owned container", async () => {
  for (const overrides of [
    { fullExit: 1 },
    {
      verifyFull: async () => {
        throw new Error("NEON_EXPORT_RESTORED_COUNTS_MISMATCH")
      },
    },
  ]) {
    const deps = dependencies(overrides)
    await assert.rejects(verifyRestoredExport(await input(), deps))
    assert.ok(deps.events.includes("docker stop"), JSON.stringify(overrides))
  }
})

test("a container without the ownership label is never stopped", async () => {
  const deps = dependencies({ ownedLabel: false })
  await assert.rejects(
    verifyRestoredExport(await input(), deps),
    /NEON_RESTORE_CONTAINER_OWNERSHIP_UNCONFIRMED/
  )
  assert.ok(!deps.events.includes("docker stop"))
})

test("restore diagnostics stay in the private evidence directory", async () => {
  const deps = dependencies({ fullExit: 1 })
  deps.restoreTool = async () => ({
    code: 1,
    stderr: "pg_restore: error: could not execute query: object detail",
  })
  const options = await input()
  await assert.rejects(
    verifyRestoredExport(options, deps),
    /NEON_EXPORT_RESTORE_FAILED/
  )
  assert.deepEqual(await readdir(options.directory), [
    "database.dump",
    "restore-full.stderr.txt",
  ])
})
