import assert from "node:assert/strict"
import test from "node:test"
import { readNeonConnections } from "./verify-neon-database.mjs"

const host = "ep-wild-leaf-za09k0vy.c-2.eu-west-2.aws.neon.tech"

function environment() {
  const result = {}

  for (const [kind, variable] of [
    ["migrator", "DATABASE_MIGRATION_URL"],
    ["auth", "AUTH_DATABASE_URL"],
    ["business", "DATABASE_URL"],
    ["jobs", "JOBS_DATABASE_URL"],
  ]) {
    const role = `nthawi_${kind}`
    result[`DATABASE_${kind.toUpperCase()}_ROLE`] = role
    result[variable] =
      `postgresql://${role}:synthetic-password@${host}:5432/` +
      "neondb?sslmode=verify-full"
  }

  return result
}

test("accepts the four exact direct restricted-role connections", () => {
  const connections = readNeonConnections(environment())

  assert.deepEqual(
    connections.map(({ role }) => role),
    ["nthawi_migrator", "nthawi_auth", "nthawi_business", "nthawi_jobs"]
  )
})

for (const [name, change] of [
  ["another endpoint", (value) => value.replace(host, "another.example")],
  [
    "a pooled endpoint",
    (value) => value.replace(host, host.replace(".", "-pooler.")),
  ],
  ["another database", (value) => value.replace("/neondb?", "/postgres?")],
  [
    "an administrator login",
    (value) => value.replace("nthawi_auth:", "neondb_owner:"),
  ],
  ["weaker TLS", (value) => value.replace("verify-full", "require")],
  ["connection options", (value) => value + "&options=unsafe"],
  ["duplicate TLS parameters", (value) => value + "&sslmode=disable"],
]) {
  test(`rejects ${name}`, () => {
    const values = environment()
    values.AUTH_DATABASE_URL = change(values.AUTH_DATABASE_URL)

    assert.throws(() => readNeonConnections(values), {
      name: "NeonVerificationError",
      message: "NEON_CONNECTION_CONFIGURATION_INVALID",
      code: "NEON_CONNECTION_CONFIGURATION_INVALID",
    })
  })
}

test("rejects missing credentials without echoing their values", () => {
  const values = environment()
  delete values.DATABASE_URL

  assert.throws(() => readNeonConnections(values), {
    name: "NeonVerificationError",
    message: "NEON_CONNECTION_CONFIGURATION_INVALID",
    code: "NEON_CONNECTION_CONFIGURATION_INVALID",
  })
})

test("rejects mismatched provisioning role names", () => {
  const values = environment()
  values.DATABASE_BUSINESS_ROLE = "neondb_owner"

  assert.throws(() => readNeonConnections(values), {
    name: "NeonVerificationError",
    message: "NEON_CONNECTION_CONFIGURATION_INVALID",
    code: "NEON_CONNECTION_CONFIGURATION_INVALID",
  })
})

import {
  NeonVerificationError,
  formatNeonError,
} from "./verify-neon-database.mjs"

test("reports a failed stage without exposing secrets", () => {
  const secret = "synthetic-private-password"

  const underlying = Object.assign(new Error(`Connection failed: ${secret}`), {
    code: "28P01",
  })

  const error = new NeonVerificationError(
    "NEON_ACCEPTANCE_FAILED",
    "role:auth",
    underlying
  )

  const message = formatNeonError(error)

  assert.match(message, /stage=role:auth/)

  assert.match(message, /postgres_code=28P01/)

  assert.equal(message.includes(secret), false)
})

test("reports unsafe migrator ownership", () => {
  const error = new NeonVerificationError(
    "NEON_ROLE_PROFILE_UNSAFE",
    "role:migrator:database_ownership"
  )

  const message = formatNeonError(error)

  assert.match(message, /NEON_ROLE_PROFILE_UNSAFE/)

  assert.match(message, /database_ownership/)
})

test("rejects an invalid verification mode", async () => {
  const { verifyNeonDatabase } = await import("./verify-neon-database.mjs")

  await assert.rejects(() => verifyNeonDatabase({}, "--invalid"), {
    message: "NEON_VERIFICATION_MODE_INVALID",
  })
})
