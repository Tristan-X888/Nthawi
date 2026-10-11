import assert from "node:assert/strict"
import test from "node:test"

import {
  cleanupTestContainers,
  verifyOfflineHealth,
} from "./check-api-image.mjs"

const names = ["nthawi-step3-test", "nthawi-step3-invalid-test"]

function healthFetch(liveStatus = 200, readyStatus = 503, cache = "no-store") {
  return async (url, options) => {
    assert.ok(options.signal instanceof AbortSignal)
    return Response.json(
      url.endsWith("/health/live")
        ? { status: "ok" }
        : { status: "not_ready", code: "API_NOT_READY" },
      {
        status: url.endsWith("/health/live") ? liveStatus : readyStatus,
        headers: { "Cache-Control": cache },
      }
    )
  }
}

test("rejects incomplete or sensitive public health response fields", async () => {
  for (const body of [
    {},
    { status: "not_ready", code: "API_NOT_READY", details: "secret-sentinel" },
  ]) {
    await assert.rejects(
      verifyOfflineHealth(async (url) =>
        Response.json(url.endsWith("/health/live") ? { status: "ok" } : body, {
          status: url.endsWith("/health/live") ? 200 : 503,
          headers: { "Cache-Control": "no-store" },
        })
      )
    )
  }
})

test("the isolated image remains live while readiness reports unavailable databases", async () => {
  await verifyOfflineHealth(healthFetch())
})

test("offline health fails on broken liveness, accidental readiness, or cacheable health", async () => {
  await assert.rejects(verifyOfflineHealth(healthFetch(503, 503)))
  await assert.rejects(verifyOfflineHealth(healthFetch(200, 200)))
  await assert.rejects(verifyOfflineHealth(healthFetch(200, 503, "public")))
})

test("cleans each owned name, including the invalid-startup container", () => {
  const calls = []
  const failures = cleanupTestContainers(names, (args, allowFailure) => {
    calls.push(args)
    assert.equal(allowFailure, true)
    return { status: 0, stdout: "" }
  })

  assert.deepEqual(failures, [])
  assert.deepEqual(
    calls,
    names.map((name) => ["rm", "--force", name])
  )
})

test("accepts an already auto-removed container after confirming absence", () => {
  const calls = []
  const failures = cleanupTestContainers([names[1]], (args) => {
    calls.push(args)
    return args[0] === "rm"
      ? { status: 1, stderr: "localized not-found message" }
      : { status: 0, stdout: "" }
  })

  assert.deepEqual(failures, [])
  assert.deepEqual(calls[1], [
    "container",
    "ls",
    "--all",
    "--filter",
    `name=^/${names[1]}$`,
    "--format",
    "{{.ID}}",
  ])
})

test("fails cleanup if a container remains after removal timed out", () => {
  const failures = cleanupTestContainers([names[0]], (args) =>
    args[0] === "rm"
      ? { error: new Error("timed out"), status: null }
      : { status: 0, stdout: "remaining-container-id\n" }
  )

  assert.equal(failures.length, 1)
  assert.equal(failures[0].message, "API image test container cleanup failed")
})

test("does not mistake a daemon failure for confirmed container removal", () => {
  const secret = "sensitive-output-sentinel"
  const calls = []
  const failures = cleanupTestContainers(names, (args) => {
    calls.push(args)
    return { status: 1, stdout: secret, stderr: secret }
  })

  assert.equal(failures.length, names.length)
  assert.equal(calls.length, names.length * 2)
  assert.ok(failures.every((error) => !error.message.includes(secret)))
})
