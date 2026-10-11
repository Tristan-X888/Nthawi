import assert from "node:assert/strict"
import { test } from "node:test"
import { cp, mkdtemp, mkdir, appendFile, rm } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDatabase, probeDatabase } from "../dist/index.js"

test("database pools are lazy, bounded, and sanitize idle errors", async () => {
  const errors: unknown[] = []
  const handle = createDatabase(
    "postgresql://unused:secret@127.0.0.1:1/unused",
    {
      max: 1,
      connectionTimeoutMillis: 50,
      queryTimeoutMillis: 75,
      statementTimeoutMillis: 100,
      onIdleError: (error) => errors.push(error),
    }
  )
  assert.equal(handle.pool.totalCount, 0)
  handle.pool.emit("error", new Error("secret connection URL"))
  assert.deepEqual(errors, [{ code: "database_idle_error" }])
  await handle.pool.end()
  assert.throws(() => createDatabase("unused", { max: 0 }), /pool option/)
})

test("a failed database probe exposes a stable sanitized error", async () => {
  const handle = createDatabase(
    "postgresql://unused:secret@127.0.0.1:1/unused",
    {
      connectionTimeoutMillis: 50,
    }
  )
  try {
    await assert.rejects(probeDatabase(handle, "business"), {
      message: "Database capability check failed",
    })
  } finally {
    await handle.pool.end()
  }
})

test("probe deadline releases a connection that arrives after timeout", async () => {
  const handle = createDatabase("postgresql://unused:secret@127.0.0.1:1/unused")
  let resolveConnection: (client: { release(destroy: boolean): void }) => void
  handle.pool.connect = () =>
    new Promise((resolve) => {
      resolveConnection = resolve
    })
  const released: boolean[] = []
  const started = Date.now()
  await assert.rejects(probeDatabase(handle, "business"), {
    message: "Database capability check failed",
  })
  assert.ok(
    Date.now() - started < 5_000,
    "the total probe deadline must bound pool acquisition"
  )
  resolveConnection!({ release: (destroy) => released.push(destroy) })
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(released, [true])
  await handle.pool.end()
})

test("build-time manifest checker rejects migration drift", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nthawi-manifest-"))
  try {
    await cp(new URL("../src/", import.meta.url), join(directory, "src"), {
      recursive: true,
    })
    await cp(
      new URL("../drizzle/", import.meta.url),
      join(directory, "drizzle"),
      { recursive: true }
    )
    await mkdir(join(directory, "scripts"))
    const script = join(directory, "scripts/schema-manifest.mjs")
    await cp(new URL("../scripts/schema-manifest.mjs", import.meta.url), script)
    assert.equal(
      spawnSync(process.execPath, [script], { encoding: "utf8" }).status,
      0
    )
    await appendFile(
      join(directory, "drizzle/0002_better_auth.sql"),
      "\n-- unexpected historical change\n"
    )
    const result = spawnSync(process.execPath, [script], { encoding: "utf8" })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /schema manifest is stale/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
