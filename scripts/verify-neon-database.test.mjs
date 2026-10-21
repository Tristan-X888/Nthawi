import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import {
  readNeonConnections,
  verifyNeonDatabase,
} from "./verify-neon-database.mjs"
import { NEON_TARGETS } from "./neon-targets.mjs"

const host = "ep-wild-leaf-za09k0vy.c-2.eu-west-2.aws.neon.tech"

function environment() {
  const result = {
    NEON_TARGET: "production",
    NEON_EXPECTED_BRANCH_ID: NEON_TARGETS.production.branchId,
  }

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

function testEnvironment() {
  const values = environment()
  values.NEON_TARGET = "test"
  values.NEON_EXPECTED_BRANCH_ID = NEON_TARGETS.test.branchId

  for (const name of [
    "DATABASE_MIGRATION_URL",
    "AUTH_DATABASE_URL",
    "DATABASE_URL",
    "JOBS_DATABASE_URL",
  ]) {
    values[name] = values[name].replace(host, NEON_TARGETS.test.host)
  }

  return values
}

const invalidConfiguration = {
  name: "NeonVerificationError",
  message: "NEON_CONNECTION_CONFIGURATION_INVALID",
  code: "NEON_CONNECTION_CONFIGURATION_INVALID",
}

test("accepts all four approved test connections", () => {
  const connections = readNeonConnections(testEnvironment())

  assert.deepEqual(
    connections.map(({ role }) => role),
    ["nthawi_migrator", "nthawi_auth", "nthawi_business", "nthawi_jobs"]
  )
  assert.ok(
    connections.every(
      ({ connectionString }) =>
        new URL(connectionString).hostname === NEON_TARGETS.test.host
    )
  )
})

test("rejects production credentials mixed into the test environment", () => {
  const values = testEnvironment()
  values.AUTH_DATABASE_URL = environment().AUTH_DATABASE_URL

  assert.throws(() => readNeonConnections(values), invalidConfiguration)
})

test("requires the approved test branch ID", () => {
  for (const branchId of [
    undefined,
    NEON_TARGETS.production.branchId,
    "br-unapproved",
  ]) {
    const values = testEnvironment()
    if (branchId === undefined) delete values.NEON_EXPECTED_BRANCH_ID
    else values.NEON_EXPECTED_BRANCH_ID = branchId

    assert.throws(() => readNeonConnections(values), invalidConfiguration)
  }
})

test("rejects unsupported targets and test URLs without explicit selection", () => {
  for (const target of [undefined, "staging", "TEST"]) {
    const values = testEnvironment()
    if (target === undefined) delete values.NEON_TARGET
    else values.NEON_TARGET = target

    assert.throws(() => readNeonConnections(values), invalidConfiguration)
  }
})

test("explicit production configuration requires its matching branch ID", () => {
  const values = environment()
  values.NEON_TARGET = "production"
  values.NEON_EXPECTED_BRANCH_ID = NEON_TARGETS.production.branchId
  assert.equal(readNeonConnections(values).length, 4)

  for (const branchId of [undefined, NEON_TARGETS.test.branchId]) {
    if (branchId === undefined) delete values.NEON_EXPECTED_BRANCH_ID
    else values.NEON_EXPECTED_BRANCH_ID = branchId
    assert.throws(() => readNeonConnections(values), invalidConfiguration)
  }
})

test("sanitizes malformed URL encoding in the path, username and password", () => {
  for (const change of [
    (value) => value.replace("/neondb?", "/%ZZ?"),
    (value) => value.replace("nthawi_auth:", "%ZZ:"),
    (value) => value.replace("synthetic-password", "%ZZ"),
  ]) {
    const values = environment()
    values.AUTH_DATABASE_URL = change(values.AUTH_DATABASE_URL)
    assert.throws(() => readNeonConnections(values), invalidConfiguration)
  }
})

async function runWithoutDatabaseBuild(mode, values) {
  const directory = await mkdtemp(join(tmpdir(), "nthawi-neon-verifier-"))
  const scripts = join(directory, "scripts")

  try {
    await mkdir(scripts)
    await Promise.all([
      copyFile(
        new URL("./verify-neon-database.mjs", import.meta.url),
        join(scripts, "verify-neon-database.mjs")
      ),
      copyFile(
        new URL("./neon-targets.mjs", import.meta.url),
        join(scripts, "neon-targets.mjs")
      ),
    ])

    return spawnSync(
      process.execPath,
      [join(scripts, "verify-neon-database.mjs"), mode],
      {
        encoding: "utf8",
        env: { ...process.env, ...values },
        timeout: 10_000,
      }
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test("configuration check validates the test target without a database build or SQL", async () => {
  const result = await runWithoutDatabaseBuild(
    "--check-config",
    testEnvironment()
  )

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /NEON_CONFIGURATION_VERIFIED/)
  assert.doesNotMatch(result.stdout, /NEON_ROLE_VERIFIED/)
})

test("live modes reject disabled TLS verification before loading the database package", async () => {
  const values = {
    ...testEnvironment(),
    NODE_TLS_REJECT_UNAUTHORIZED: "0",
  }

  for (const mode of ["--before-migrate", "--after-migrate"]) {
    const result = await runWithoutDatabaseBuild(mode, values)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /code=NEON_TLS_CONFIGURATION_UNSAFE/)
    assert.match(result.stderr, /stage=configuration:tls/)
    assert.doesNotMatch(
      result.stderr,
      /ERR_MODULE_NOT_FOUND|synthetic-password/
    )
  }

  const configuration = await runWithoutDatabaseBuild("--check-config", values)
  assert.equal(configuration.status, 0, configuration.stderr)
  assert.match(configuration.stdout, /NEON_CONFIGURATION_VERIFIED/)
  assert.doesNotMatch(configuration.stdout, /NEON_ACCEPTANCE_PASSED/)
})

test("execution modes reject production before loading the database package", async () => {
  const values = environment()
  values.NEON_TARGET = "production"
  values.NEON_EXPECTED_BRANCH_ID = NEON_TARGETS.production.branchId

  for (const mode of ["--before-migrate", "--after-migrate"]) {
    const result = await runWithoutDatabaseBuild(mode, values)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /code=NEON_CONNECTION_CONFIGURATION_INVALID/)
    assert.match(result.stderr, /stage=configuration:test-target/)
  }
})

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
  await assert.rejects(() => verifyNeonDatabase({}, "--invalid"), {
    message: "NEON_VERIFICATION_MODE_INVALID",
  })
})

// The injected driver never opens a socket. Each checkout returns a fresh
// client so acceptance must verify TLS again when readiness reconnects.
function lifecycleDependencies(options = {}) {
  const pools = []
  const probes = []

  class Pool {
    constructor(configuration) {
      this.configuration = configuration
      this.kind = configuration.user.replace("nthawi_", "")
      this.clients = []
      this.queries = []
      this.closeCount = 0
      pools.push(this)
    }

    on() {}

    async connect() {
      const checkout = this.clients.length + 1
      const client = {
        connection: {
          stream: options.stream?.(this.kind, checkout) ?? {
            encrypted: true,
            authorized: true,
          },
        },
        ssl: this.configuration.ssl,
        releases: [],
        query: async (sql, parameters) => {
          this.queries.push({ sql, parameters, client })
          if (parameters?.length === 3) {
            assert.deepEqual(parameters, ["neondb", `nthawi_${this.kind}`, 18])
            const row = {
              database_matches: true,
              login_matches: true,
              version_matches: true,
              safe_flags: true,
              memberships: false,
              owns_database: this.kind === "migrator",
              temporary_privilege: this.kind === "migrator",
              creates_public: this.kind === "migrator",
              owns_objects: this.kind === "migrator",
            }
            const override = options.role?.(this.kind)
            return { rows: override === null ? [] : [{ ...row, ...override }] }
          }
          if (sql.includes("AS empty")) {
            return {
              rows: [{ empty: true, vector_ready: true, ...options.preflight }],
            }
          }
          if (sql.includes("vector_dims")) {
            return { rows: [{ valid: options.vectorValid ?? true }] }
          }
          return { rows: [{ ready: true }] }
        },
        release(discard = false) {
          this.releases.push(discard)
        },
      }
      this.clients.push(client)
      return client
    }

    async end() {
      this.closeCount++
      if (this.kind === options.closeFailure) {
        throw new Error("synthetic-private-close-password")
      }
    }
  }

  return {
    pools,
    probes,
    dependencies: {
      Pool,
      async probeDatabase(handle, capability) {
        probes.push(capability)
        if (capability === options.probeFailure) {
          throw Object.assign(new Error("synthetic-private-probe-password"), {
            code: "28P01",
          })
        }
        const client = await handle.pool.connect()
        try {
          await client.query("SELECT 1 AS ready")
        } finally {
          client.release()
        }
      },
    },
  }
}

function captureVerifierOutput(context) {
  const lines = []
  context.mock.method(console, "log", (...items) => lines.push(items.join(" ")))
  return lines
}

function assertAllPoolsClosed(state) {
  assert.ok(state.pools.length > 0)
  assert.ok(state.pools.every((pool) => pool.closeCount === 1))
  for (const pool of state.pools) {
    for (const client of pool.clients) {
      assert.equal(client.releases.length, 1, "A checked-out client leaked")
    }
  }
}

test("live preflight checks four safe roles, an empty target and vector before closing every pool", async (context) => {
  const lines = captureVerifierOutput(context)
  const state = lifecycleDependencies()
  await verifyNeonDatabase(
    testEnvironment(),
    "--before-migrate",
    state.dependencies
  )

  assert.deepEqual(
    state.pools.map((pool) => pool.kind),
    ["migrator", "auth", "business", "jobs"]
  )
  assert.equal(state.pools[0].queries.length, 2)
  assert.deepEqual(state.probes, [])
  assert.ok(lines.includes("NEON_EMPTY_TARGET_VERIFIED"))
  assert.equal(lines.at(-1), "NEON_ACCEPTANCE_PASSED")
  assertAllPoolsClosed(state)
})

test("each role connects with its own decoded password and explicit verified TLS options", async (context) => {
  captureVerifierOutput(context)
  const values = testEnvironment()
  const connections = readNeonConnections(values)
  for (const profile of connections) {
    values[profile.variable] = values[profile.variable].replace(
      "synthetic-password",
      `${profile.kind}%40synthetic%3Apassword`
    )
  }
  const state = lifecycleDependencies()
  await verifyNeonDatabase(values, "--before-migrate", state.dependencies)

  for (const pool of state.pools) {
    const config = pool.configuration
    assert.equal(config.connectionString, undefined)
    assert.equal(config.host, NEON_TARGETS.test.host)
    assert.equal(config.port, 5432)
    assert.equal(config.database, "neondb")
    assert.equal(config.max, 1)
    assert.equal(config.idleTimeoutMillis, 0)
    assert.equal(config.connectionTimeoutMillis, 10_000)
    assert.equal(config.user, `nthawi_${pool.kind}`)
    assert.equal(config.password, `${pool.kind}@synthetic:password`)
    assert.equal(config.ssl.rejectUnauthorized, true)
    assert.equal(config.ssl.servername, NEON_TARGETS.test.host)
  }
  assertAllPoolsClosed(state)
})

for (const [name, override, expectedStage] of [
  ["missing role", null, "missing"],
  ["wrong database", { database_matches: false }, "database_matches"],
  ["wrong login", { login_matches: false }, "login_matches"],
  ["wrong server version", { version_matches: false }, "version_matches"],
  ["unsafe role flags", { safe_flags: false }, "safe_flags"],
  ["role membership", { memberships: true }, "no_memberships"],
  ["runtime database ownership", { owns_database: true }, "database_ownership"],
  [
    "runtime temporary privileges",
    { temporary_privilege: true },
    "no_temporary_privilege",
  ],
  ["runtime schema creation", { creates_public: true }, "no_public_create"],
  ["runtime object ownership", { owns_objects: true }, "no_object_ownership"],
]) {
  test(`live acceptance rejects ${name} and closes pools created before failure`, async (context) => {
    const lines = captureVerifierOutput(context)
    const state = lifecycleDependencies({
      role: (kind) => (kind === "auth" ? override : undefined),
    })
    await assert.rejects(
      () =>
        verifyNeonDatabase(
          testEnvironment(),
          "--after-migrate",
          state.dependencies
        ),
      {
        code: "NEON_ROLE_PROFILE_UNSAFE",
        stage: `role:auth:${expectedStage}`,
      }
    )
    assert.equal(state.pools.length, 2)
    assert.deepEqual(state.probes, [])
    assert.equal(lines.includes("NEON_ACCEPTANCE_PASSED"), false)
    assertAllPoolsClosed(state)
  })
}

for (const [preflight, code, stage] of [
  [
    { empty: false },
    "NEON_EMPTY_TARGET_REQUIRED",
    "before-migrate:target-not-empty",
  ],
  [
    { vector_ready: false },
    "NEON_VECTOR_EXTENSION_MISSING",
    "before-migrate:vector",
  ],
]) {
  test(`preflight refuses ${code} and closes all four pools`, async (context) => {
    captureVerifierOutput(context)
    const state = lifecycleDependencies({ preflight })
    await assert.rejects(
      () =>
        verifyNeonDatabase(
          testEnvironment(),
          "--before-migrate",
          state.dependencies
        ),
      { code, stage }
    )
    assert.equal(state.pools.length, 4)
    assertAllPoolsClosed(state)
  })
}

test("incomplete runtime role safety results fail closed", async (context) => {
  captureVerifierOutput(context)
  for (const [field, check] of [
    ["memberships", "no_memberships"],
    ["temporary_privilege", "no_temporary_privilege"],
    ["creates_public", "no_public_create"],
    ["owns_objects", "no_object_ownership"],
  ]) {
    for (const value of [undefined, null]) {
      const state = lifecycleDependencies({
        role: (kind) => (kind === "auth" ? { [field]: value } : undefined),
      })
      await assert.rejects(
        () =>
          verifyNeonDatabase(
            testEnvironment(),
            "--after-migrate",
            state.dependencies
          ),
        { code: "NEON_ROLE_PROFILE_UNSAFE", stage: `role:auth:${check}` }
      )
      assertAllPoolsClosed(state)
    }
  }
})

for (const stream of [
  { encrypted: false, authorized: true },
  { encrypted: true, authorized: false },
  { encrypted: true },
]) {
  test("live acceptance refuses SQL on a client without authenticated TLS", async (context) => {
    captureVerifierOutput(context)
    const state = lifecycleDependencies({ stream: () => stream })
    await assert.rejects(
      () =>
        verifyNeonDatabase(
          testEnvironment(),
          "--before-migrate",
          state.dependencies
        ),
      (error) => {
        assert.equal(error.code, "NEON_ACCEPTANCE_FAILED")
        assert.equal(error.stage, "role:migrator")
        assert.equal(error.cause.message, "NEON_TLS_SESSION_REJECTED")
        return true
      }
    )
    assert.equal(state.pools[0].queries.length, 0)
    assert.deepEqual(state.pools[0].clients[0].releases, [true])
    assertAllPoolsClosed(state)
  })
}

test("after-migration acceptance runs both application probes and the vector check", async (context) => {
  const lines = captureVerifierOutput(context)
  const state = lifecycleDependencies()
  await verifyNeonDatabase(
    testEnvironment(),
    "--after-migrate",
    state.dependencies
  )
  assert.deepEqual(state.probes, ["auth", "business"])
  assert.equal(state.pools[1].clients.length, 2)
  assert.equal(state.pools[2].clients.length, 3)
  assert.ok(lines.includes("NEON_APPLICATION_READINESS_VERIFIED"))
  assertAllPoolsClosed(state)
})

for (const kind of ["auth", "business"]) {
  test(`a ${kind} readiness reconnect must authenticate TLS before any probe SQL`, async (context) => {
    captureVerifierOutput(context)
    const state = lifecycleDependencies({
      stream: (profile, checkout) => ({
        encrypted: true,
        authorized: !(profile === kind && checkout === 2),
      }),
    })
    await assert.rejects(
      () =>
        verifyNeonDatabase(
          testEnvironment(),
          "--after-migrate",
          state.dependencies
        ),
      (error) => {
        assert.equal(error.code, "NEON_APPLICATION_READINESS_FAILED")
        assert.equal(error.stage, `after-migrate:${kind}`)
        assert.equal(error.cause.message, "NEON_TLS_SESSION_REJECTED")
        return true
      }
    )
    const pool = state.pools.find((item) => item.kind === kind)
    assert.equal(pool.queries.length, 1)
    assert.deepEqual(pool.clients[1].releases, [true])
    assertAllPoolsClosed(state)
  })
}

test("a vector-check reconnect must authenticate TLS before executing SQL", async (context) => {
  captureVerifierOutput(context)
  const state = lifecycleDependencies({
    stream: (profile, checkout) => ({
      encrypted: true,
      authorized: !(profile === "business" && checkout === 3),
    }),
  })
  await assert.rejects(
    () =>
      verifyNeonDatabase(
        testEnvironment(),
        "--after-migrate",
        state.dependencies
      ),
    (error) => {
      assert.equal(error.code, "NEON_ACCEPTANCE_FAILED")
      assert.equal(error.cause.message, "NEON_TLS_SESSION_REJECTED")
      return true
    }
  )
  assert.equal(state.pools[2].queries.length, 2)
  assert.deepEqual(state.pools[2].clients[2].releases, [true])
  assertAllPoolsClosed(state)
})

test("application readiness failures close every pool and format without credentials", async (context) => {
  const lines = captureVerifierOutput(context)
  const state = lifecycleDependencies({ probeFailure: "business" })
  await assert.rejects(
    () =>
      verifyNeonDatabase(
        testEnvironment(),
        "--after-migrate",
        state.dependencies
      ),
    (error) => {
      assert.equal(error.code, "NEON_APPLICATION_READINESS_FAILED")
      assert.equal(error.stage, "after-migrate:business")
      const formatted = formatNeonError(error)
      assert.match(formatted, /postgres_code=28P01/)
      assert.doesNotMatch(formatted, /password|postgresql:\/\//)
      return true
    }
  )
  assert.deepEqual(state.probes, ["auth", "business"])
  assert.equal(lines.includes("NEON_ACCEPTANCE_PASSED"), false)
  assertAllPoolsClosed(state)
})

test("a failed vector result prevents acceptance after successful runtime probes", async (context) => {
  captureVerifierOutput(context)
  const state = lifecycleDependencies({ vectorValid: false })
  await assert.rejects(
    () =>
      verifyNeonDatabase(
        testEnvironment(),
        "--after-migrate",
        state.dependencies
      ),
    { code: "NEON_VECTOR_CHECK_FAILED", stage: "after-migrate:vector" }
  )
  assert.deepEqual(state.probes, ["auth", "business"])
  assertAllPoolsClosed(state)
})

test("pool cleanup failure prevents a successful acceptance result", async (context) => {
  const lines = captureVerifierOutput(context)
  const state = lifecycleDependencies({ closeFailure: "auth" })
  await assert.rejects(
    () =>
      verifyNeonDatabase(
        testEnvironment(),
        "--after-migrate",
        state.dependencies
      ),
    (error) => {
      assert.equal(error.code, "NEON_CONNECTION_CLEANUP_FAILED")
      assert.equal(error.stage, "cleanup")
      assert.doesNotMatch(formatNeonError(error), /password/)
      return true
    }
  )
  assert.equal(lines.includes("NEON_ACCEPTANCE_PASSED"), false)
  assertAllPoolsClosed(state)
})

test("cleanup failure preserves the primary unsafe-role error", async (context) => {
  captureVerifierOutput(context)
  const state = lifecycleDependencies({
    role: (kind) => (kind === "auth" ? { safe_flags: false } : undefined),
    closeFailure: "migrator",
  })
  await assert.rejects(
    () =>
      verifyNeonDatabase(
        testEnvironment(),
        "--after-migrate",
        state.dependencies
      ),
    { code: "NEON_ROLE_PROFILE_UNSAFE", stage: "role:auth:safe_flags" }
  )
  assertAllPoolsClosed(state)
})
