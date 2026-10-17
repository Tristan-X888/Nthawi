import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { readFile, stat } from "node:fs/promises"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { NEON_TARGETS } from "./neon-targets.mjs"
import {
  createNeonApiEnvironment,
  formatNeonApiError,
  NeonApiVerificationError,
  prepareCompiledApi,
  verifyApiEndpoints,
  verifyNeonApi,
} from "./verify-neon-api.mjs"

function environment() {
  const result = {
    NEON_TARGET: "test",
    NEON_EXPECTED_BRANCH_ID: NEON_TARGETS.test.branchId,
    NODE_OPTIONS: "--import=do-not-load-private-file.mjs",
    PGHOST: "production-do-not-use",
    PGSSLMODE: "disable",
    PRIVATE_ADMIN_SECRET: "do-not-disclose-admin",
    GOOGLE_CLIENT_SECRET: "do-not-use-live-google",
    RESEND_API_KEY: "do-not-use-live-resend",
    BETTER_AUTH_API_KEY: "do-not-use-live-dashboard",
  }
  for (const [variable, roleVariable, role] of [
    ["DATABASE_MIGRATION_URL", "DATABASE_MIGRATOR_ROLE", "nthawi_migrator"],
    ["AUTH_DATABASE_URL", "DATABASE_AUTH_ROLE", "nthawi_auth"],
    ["DATABASE_URL", "DATABASE_BUSINESS_ROLE", "nthawi_business"],
    ["JOBS_DATABASE_URL", "DATABASE_JOBS_ROLE", "nthawi_jobs"],
  ]) {
    result[roleVariable] = role
    result[variable] =
      `postgresql://${role}:do-not-disclose-${role}@${NEON_TARGETS.test.host}:5432/neondb?sslmode=verify-full`
  }
  return result
}

function responses(url, options) {
  assert.ok(options.signal instanceof AbortSignal)
  assert.equal(options.redirect, "error")
  const headers = { "Cache-Control": "no-store" }
  if (url.endsWith("/health/live")) {
    return Response.json({ status: "ok" }, { headers })
  }
  if (url.endsWith("/health/ready")) {
    return Response.json({ status: "ready" }, { headers })
  }
  assert.ok(url.endsWith("/api/v1/me"))
  if (options.headers.Origin === "https://widget.example.test") {
    return Response.json(
      { code: "INVALID_ORIGIN", message: "Invalid origin" },
      { status: 403, headers }
    )
  }
  assert.deepEqual(options.headers, {})
  return Response.json(
    { code: "UNAUTHORIZED", message: "A valid owner session is required." },
    { status: 401, headers }
  )
}

function harness({ mode = "graceful", platform = "linux", cleanupError } = {}) {
  const calls = []
  const child = new EventEmitter()
  child.kill = (signal) => {
    calls.push(signal)
    if (signal === "SIGKILL") {
      queueMicrotask(() => child.emit("close", null, signal))
    } else if (mode === "graceful") {
      queueMicrotask(() => {
        child.emit("message", { type: "NEON_API_POOL_CLOSED" })
        child.emit("message", { type: "NEON_API_POOL_CLOSED" })
        child.emit("close", null, "SIGTERM")
      })
    } else if (mode === "premature") {
      queueMicrotask(() => child.emit("close", null, "SIGTERM"))
    }
    return true
  }
  child.send = (message, callback) => {
    calls.push(message.type)
    queueMicrotask(() => {
      child.emit("message", { type: "NEON_API_POOL_CLOSED" })
      child.emit("message", { type: "NEON_API_POOL_CLOSED" })
      child.emit("close", 1, null)
      callback()
    })
  }
  const signals = new EventEmitter()
  const options = {
    platform,
    signals,
    stopTimeout: 10,
    selectPort: async () => {
      calls.push("port")
      return 41234
    },
    prepare: async () => {
      calls.push("prepare")
      return {
        args: ["--import", "observer.mjs", "dist/main.js"],
        cwd: "staged-api",
        cleanup: async () => {
          calls.push("cleanup")
          if (cleanupError) throw new Error("do-not-disclose-cleanup")
        },
      }
    },
    spawnProcess: (executable, args, options_) => {
      calls.push("spawn")
      assert.equal(executable, process.execPath)
      assert.deepEqual(args, ["--import", "observer.mjs", "dist/main.js"])
      assert.equal(options_.shell, false)
      assert.equal(options_.windowsHide, true)
      assert.deepEqual(options_.stdio, ["ignore", "ignore", "ignore", "ipc"])
      assert.equal(options_.env.DATABASE_MIGRATION_URL, undefined)
      assert.equal(options_.env.JOBS_DATABASE_URL, undefined)
      assert.equal(options_.env.NODE_OPTIONS, undefined)
      return child
    },
    fetchResponse: responses,
  }
  return { calls, child, signals, options }
}

test("child receives approved runtime URLs and synthetic auth, with no operator or inherited provider secrets", () => {
  const values = environment()
  const result = createNeonApiEnvironment(values, 41234)
  assert.equal(result.DATABASE_URL, values.DATABASE_URL)
  assert.equal(result.AUTH_DATABASE_URL, values.AUTH_DATABASE_URL)
  assert.equal(result.API_PORT, "41234")
  assert.equal(result.NODE_ENV, "production")
  assert.equal(result.BETTER_AUTH_API_KEY, "")
  assert.equal(result.WEB_ORIGIN, result.BETTER_AUTH_URL)
  assert.ok(result.BETTER_AUTH_SECRET.length >= 32)
  for (const name of [
    "DATABASE_MIGRATION_URL",
    "JOBS_DATABASE_URL",
    "PRIVATE_ADMIN_SECRET",
    "NODE_OPTIONS",
    "PGHOST",
    "PGSSLMODE",
  ]) {
    assert.equal(result[name], undefined)
  }
  assert.doesNotMatch(
    JSON.stringify(result),
    /do-not-use|do-not-disclose-admin/
  )
  assert.notEqual(
    result.BETTER_AUTH_SECRET,
    createNeonApiEnvironment(values, 41234).BETTER_AUTH_SECRET
  )
})

test("production, wrong branches, and any invalid role fail before all side effects", async () => {
  for (const change of [
    { NEON_TARGET: "production" },
    { NEON_EXPECTED_BRANCH_ID: NEON_TARGETS.production.branchId },
    {
      DATABASE_URL: environment().DATABASE_URL.replace(
        NEON_TARGETS.test.host,
        NEON_TARGETS.production.host
      ),
    },
    { DATABASE_JOBS_ROLE: "neondb_owner" },
    { JOBS_DATABASE_URL: "do-not-disclose-private-value" },
  ]) {
    const fixture = harness()
    await assert.rejects(
      verifyNeonApi({ ...environment(), ...change }, fixture.options),
      { message: "NEON_API_ACCEPTANCE_FAILED", stage: "configuration" }
    )
    assert.deepEqual(fixture.calls, [])
    assert.equal(fixture.signals.eventNames().length, 0)
  }
})

test("compiled main is staged away from repository dotenv and removed afterward", async () => {
  const prepared = await prepareCompiledApi()
  const temporaryRoot = dirname(dirname(prepared.cwd))
  try {
    const main = await readFile(prepared.args.at(-1), "utf8")
    assert.match(main, /createApiApplication/)
    assert.match(main, /enableShutdownHooks/)
    const auth = await readFile(
      join(prepared.cwd, "dist", "auth", "auth.js"),
      "utf8"
    )
    assert.match(auth, /\.\.\/\.\.\/\.\.\/\.\.\/\.env/)
    await assert.rejects(stat(join(temporaryRoot, ".env")), { code: "ENOENT" })
    const observer = await readFile(fileURLToPath(prepared.args[1]), "utf8")
    assert.doesNotMatch(observer, /postgres(?:ql)?:|do-not-disclose/)
    assert.match(observer, /NEON_API_POOL_CLOSED/)
  } finally {
    await prepared.cleanup()
  }
  await assert.rejects(stat(temporaryRoot), { code: "ENOENT" })
})

test("health and anonymous owner endpoints enforce exact sanitized contracts", async () => {
  await verifyApiEndpoints("http://127.0.0.1:41234", responses)
  for (const response of [
    Response.json({ status: "ready", connection: "do-not-disclose-url" }),
    Response.json({ status: "ready" }, { status: 503 }),
    Response.json(
      { status: "ready" },
      { headers: { "Cache-Control": "public" } }
    ),
    new Response("do-not-disclose-html", {
      headers: { "Cache-Control": "no-store" },
    }),
  ]) {
    await assert.rejects(
      verifyApiEndpoints("http://127.0.0.1:41234", (url, options) =>
        url.endsWith("/health/ready") ? response : responses(url, options)
      ),
      { stage: "health/ready" }
    )
  }
})

test("Linux acceptance requires actual SIGTERM and completed closure of both pools", async () => {
  const fixture = harness()
  assert.deepEqual(await verifyNeonApi(environment(), fixture.options), {
    shutdownMode: "os-sigterm",
  })
  assert.deepEqual(fixture.calls, [
    "port",
    "prepare",
    "spawn",
    "SIGTERM",
    "cleanup",
  ])
  assert.equal(fixture.signals.eventNames().length, 0)
})

test("Windows labels hook invocation over IPC without claiming an OS-signal test", async () => {
  const fixture = harness({ platform: "win32" })
  assert.deepEqual(await verifyNeonApi(environment(), fixture.options), {
    shutdownMode: "ipc-sigterm-hook",
  })
  assert.ok(fixture.calls.includes("NEON_API_STOP"))
  assert.ok(!fixture.calls.includes("SIGTERM"))
})

test("actual compiled production startup and shutdown run without contacting a database", async () => {
  // Only liveness uses the real local HTTP listener. Readiness and owner bodies
  // are supplied here so this lifecycle test never opens the approved remote
  // database; the operator gate uses real responses for every endpoint.
  const result = await verifyNeonApi(environment(), {
    prepare: () => prepareCompiledApi({ preventDatabaseConnections: true }),
    fetchResponse: (url, options) =>
      url.endsWith("/health/live")
        ? fetch(url, options)
        : responses(url, options),
  })
  assert.deepEqual(result, {
    shutdownMode:
      process.platform === "win32" ? "ipc-sigterm-hook" : "os-sigterm",
  })
})

test("forced exit without pool closure cannot satisfy graceful shutdown", async () => {
  const fixture = harness({ mode: "premature" })
  await assert.rejects(verifyNeonApi(environment(), fixture.options), {
    stage: "shutdown",
  })
  assert.equal(fixture.calls.at(-1), "cleanup")
})

test("a hung shutdown is force-killed, awaited, and cleaned within a deadline", async () => {
  const fixture = harness({ mode: "hung" })
  await assert.rejects(verifyNeonApi(environment(), fixture.options), {
    stage: "shutdown",
  })
  assert.deepEqual(fixture.calls.slice(-3), ["SIGTERM", "SIGKILL", "cleanup"])
  assert.equal(fixture.signals.eventNames().length, 0)
})

test("HTTP failures and parent interruption kill the child before cleaning artifacts", async () => {
  for (const interruption of [false, true]) {
    const fixture = harness()
    fixture.options.fetchResponse = (url, options) => {
      if (url.endsWith("/health/live")) return responses(url, options)
      if (interruption) fixture.signals.emit("SIGINT")
      throw new Error("do-not-disclose-postgresql://private")
    }
    await assert.rejects(
      verifyNeonApi(environment(), fixture.options),
      (error) => {
        assert.doesNotMatch(
          formatNeonApiError(error),
          /do-not-disclose|postgresql/
        )
        return true
      }
    )
    assert.deepEqual(fixture.calls.slice(-2), ["SIGKILL", "cleanup"])
    assert.equal(fixture.signals.eventNames().length, 0)
  }
})

test("artifact cleanup failure cannot be reported as acceptance", async () => {
  const fixture = harness({ cleanupError: true })
  await assert.rejects(verifyNeonApi(environment(), fixture.options), {
    stage: "artifact-cleanup",
  })
})

test("error output cannot disclose arbitrary messages, causes, or forged stages", () => {
  const secret = "postgresql://private:password@production"
  for (const error of [
    new Error(secret),
    new NeonApiVerificationError(secret),
    { stage: secret, cause: new Error(secret) },
  ]) {
    assert.equal(
      formatNeonApiError(error),
      "code=NEON_API_ACCEPTANCE_FAILED stage=unknown"
    )
  }
})
