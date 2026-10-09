import assert from "node:assert/strict"
import test from "node:test"

import { cleanupTestContainers } from "./check-api-image.mjs"

const names = ["nthawi-step3-test", "nthawi-step3-invalid-test"]

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
