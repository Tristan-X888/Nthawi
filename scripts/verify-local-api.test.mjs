import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { EventEmitter } from "node:events"
import test from "node:test"
import { fileURLToPath } from "node:url"

import {
  createLocalApiEnvironment,
  formatLocalApiError,
  verifyLocalApi,
} from "./verify-local-api.mjs"

function environment(host = "127.0.0.1") {
  return {
    DATABASE_URL: `postgresql://nthawi_business:synthetic-business@${host}:55433/nthawi`,
    AUTH_DATABASE_URL: `postgresql://nthawi_auth:synthetic-auth@${host}:55433/nthawi`,
    DATABASE_MIGRATION_URL: "do-not-inherit-operator-secret",
    JOBS_DATABASE_URL: "do-not-inherit-jobs-secret",
    NODE_OPTIONS: "--import=do-not-load-private-file.mjs",
    PGHOST: "production-do-not-use",
    PGSSLMODE: "disable",
    PRIVATE_ADMIN_SECRET: "do-not-inherit-admin-secret",
    GOOGLE_CLIENT_SECRET: "do-not-inherit-provider-secret",
    BETTER_AUTH_API_KEY: "do-not-inherit-dashboard-secret",
  }
}

function harness({ platform = "linux", closedPools = 2 } = {}) {
  const calls = []
  const requests = []
  const child = new EventEmitter()
  const finish = () => {
    for (let index = 0; index < closedPools; index++) {
      child.emit("message", { type: "NEON_API_POOL_CLOSED" })
    }
    child.emit(
      "close",
      platform === "win32" ? 0 : null,
      platform === "win32" ? null : "SIGTERM"
    )
  }
  child.kill = (signal) => {
    calls.push(signal)
    queueMicrotask(finish)
    return true
  }
  child.send = (message, callback) => {
    calls.push(message.type)
    queueMicrotask(() => {
      finish()
      callback()
    })
  }
  const signals = new EventEmitter()
  return {
    calls,
    requests,
    signals,
    options: {
      platform,
      signals,
      stopTimeout: 20,
      selectPort: async () => {
        calls.push("port")
        return 41234
      },
      prepare: async () => {
        calls.push("prepare")
        return {
          args: ["compiled-main.js"],
          cwd: "staged-api",
          cleanup: async () => calls.push("cleanup"),
        }
      },
      spawnProcess: (executable, args, options) => {
        calls.push("spawn")
        assert.equal(executable, process.execPath)
        assert.equal(options.env.DATABASE_URL, environment().DATABASE_URL)
        assert.equal(
          options.env.AUTH_DATABASE_URL,
          environment().AUTH_DATABASE_URL
        )
        assert.equal(options.env.DATABASE_MIGRATION_URL, undefined)
        assert.equal(options.env.NODE_OPTIONS, undefined)
        assert.equal(options.shell, false)
        assert.equal(options.windowsHide, true)
        return child
      },
      fetchResponse: async (url, options) => {
        requests.push([new URL(url).pathname, options.headers?.Origin])
        assert.equal(options.redirect, "error")
        assert.ok(options.signal instanceof AbortSignal)
        let body = { status: "ok" }
        let status = 200
        if (url.endsWith("/health/ready")) body = { status: "ready" }
        if (url.endsWith("/api/v1/me")) {
          if (options.headers.Origin) {
            assert.equal(options.headers.Origin, "https://widget.example.test")
            status = 403
            body = { code: "INVALID_ORIGIN", message: "Invalid origin" }
          } else {
            assert.deepEqual(options.headers, {})
            status = 401
            body = {
              code: "UNAUTHORIZED",
              message: "A valid owner session is required.",
            }
          }
        }
        return Response.json(body, {
          status,
          headers: { "Cache-Control": "no-store" },
        })
      },
    },
  }
}

test("local acceptance allows only the preserved loopback database and runtime roles", () => {
  for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
    const values = environment(host)
    const child = createLocalApiEnvironment(values, 41234)
    assert.equal(child.DATABASE_URL, values.DATABASE_URL)
    assert.equal(child.AUTH_DATABASE_URL, values.AUTH_DATABASE_URL)
    assert.equal(child.API_PORT, "41234")
    assert.equal(child.NODE_ENV, "production")
    assert.ok(child.BETTER_AUTH_SECRET.length >= 32)
    assert.doesNotMatch(
      JSON.stringify(child),
      /do-not-inherit|do-not-load|production-do-not-use/
    )
    for (const name of [
      "DATABASE_MIGRATION_URL",
      "JOBS_DATABASE_URL",
      "NODE_OPTIONS",
      "PGHOST",
      "PGSSLMODE",
    ]) {
      assert.equal(child[name], undefined)
    }
  }
})

test("wrong targets, roles, options and credentials fail before lifecycle side effects", async () => {
  const good = environment()
  const invalidUrls = [
    good.DATABASE_URL.replace("127.0.0.1", "db.example.test"),
    good.DATABASE_URL.replace("127.0.0.1", "127.1"),
    good.DATABASE_URL.replace("127.0.0.1", "127.0.0.1.example.test"),
    good.DATABASE_URL.replace("55433", "5432"),
    good.DATABASE_URL.replace("/nthawi", "/other"),
    good.DATABASE_URL.replace("nthawi_business", "nthawi_migrator"),
    good.DATABASE_URL.replace("nthawi_business", "nthawi_auth"),
    good.DATABASE_URL.replace("synthetic-business", ""),
    good.DATABASE_URL.replace("synthetic-business", "%00"),
    good.DATABASE_URL.replace("synthetic-business", "%broken"),
    good.DATABASE_URL + "?host=production.example.test",
    good.DATABASE_URL + "?sslmode=disable",
    good.DATABASE_URL + "#private",
    "do-not-disclose-invalid-url",
  ]
  for (const change of [
    ...invalidUrls.map((DATABASE_URL) => ({ DATABASE_URL })),
    { AUTH_DATABASE_URL: good.DATABASE_URL },
    {
      AUTH_DATABASE_URL: good.AUTH_DATABASE_URL.replace(
        "127.0.0.1",
        "db.example.test"
      ),
    },
    { NEON_TARGET: "test" },
    { NEON_TARGET: "" },
    { NEON_EXPECTED_BRANCH_ID: "br-do-not-use" },
  ]) {
    const fixture = harness()
    await assert.rejects(
      verifyLocalApi(
        { ...good, ...change },
        {
          ...fixture.options,
          createEnvironment: () => good,
          validateEnvironment: () => {},
        }
      ),
      { stage: "configuration" }
    )
    assert.deepEqual(fixture.calls, [])
    assert.deepEqual(fixture.requests, [])
    assert.equal(fixture.signals.eventNames().length, 0)
  }
})

test("local acceptance validates the selected HTTP port before creating child configuration", () => {
  for (const port of [0, 65536, 1.5, "4000", undefined]) {
    assert.throws(() => createLocalApiEnvironment(environment(), port), {
      stage: "configuration",
    })
  }
})

test("local acceptance shares real endpoint contracts and both platform shutdown paths", async () => {
  for (const platform of ["linux", "win32"]) {
    const fixture = harness({ platform })
    assert.deepEqual(await verifyLocalApi(environment(), fixture.options), {
      shutdownMode: platform === "win32" ? "ipc-sigterm-hook" : "os-sigterm",
    })
    assert.deepEqual(fixture.requests.slice(-4), [
      ["/health/live", undefined],
      ["/health/ready", undefined],
      ["/api/v1/me", undefined],
      ["/api/v1/me", "https://widget.example.test"],
    ])
    assert.deepEqual(fixture.calls, [
      "port",
      "prepare",
      "spawn",
      platform === "win32" ? "NEON_API_STOP" : "SIGTERM",
      "cleanup",
    ])
    assert.equal(fixture.signals.eventNames().length, 0)
  }
})

test("local acceptance cannot pass without closing both runtime pools", async () => {
  const fixture = harness({ closedPools: 1 })
  await assert.rejects(verifyLocalApi(environment(), fixture.options), {
    stage: "shutdown",
  })
  assert.equal(fixture.calls.at(-1), "cleanup")
})

test("local diagnostic output never includes arbitrary messages or forged stages", () => {
  assert.equal(
    formatLocalApiError(new Error("postgresql://private:secret@remote")),
    "code=LOCAL_API_ACCEPTANCE_FAILED stage=unknown"
  )
  assert.equal(
    formatLocalApiError({ stage: "private-secret" }),
    "code=LOCAL_API_ACCEPTANCE_FAILED stage=unknown"
  )
})

test("local CLI rejects extra arguments with a sanitized nonzero result", () => {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL("./verify-local-api.mjs", import.meta.url)),
      "do-not-disclose",
    ],
    {
      encoding: "utf8",
      env: { SystemRoot: process.env.SystemRoot },
      timeout: 10000,
      windowsHide: true,
    }
  )
  assert.equal(result.status, 1)
  assert.match(
    result.stderr,
    /^code=LOCAL_API_ACCEPTANCE_FAILED stage=configuration\s*$/
  )
  assert.doesNotMatch(result.stderr + result.stdout, /do-not-disclose/)
})
