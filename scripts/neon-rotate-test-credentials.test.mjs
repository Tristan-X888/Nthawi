import assert from "node:assert/strict"
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { assertNeonTestEnvironment, NEON_TARGETS } from "./neon-targets.mjs"
import {
  generateRolePasswords,
  rotateNeonTestCredentials,
  rotationConfirmation,
  rotationOwnerOptions,
} from "./neon-rotate-test-credentials.mjs"

const target = NEON_TARGETS.test
const ownerUrl = `postgresql://neondb_owner:owner-synthetic-secret@${target.host}:5432/neondb?sslmode=verify-full`
const roles = [
  "nthawi_migrator",
  "nthawi_auth",
  "nthawi_business",
  "nthawi_jobs",
]
const restricted = (name) => ({
  name,
  rolcanlogin: true,
  rolsuper: false,
  rolbypassrls: false,
  rolcreatedb: false,
  rolcreaterole: false,
  rolreplication: false,
  rolinherit: false,
  memberships: false,
})

async function privateDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "nthawi-rotation-test-"))
  await writeFile(
    join(directory, ".env.neon.test.runtime.local"),
    "AUTH_DATABASE_URL=old-auth\nDATABASE_URL=old-business\n"
  )
  await writeFile(
    join(directory, ".env.neon.test.operator.local"),
    "DATABASE_MIGRATION_URL=old-migrator\n"
  )
  await writeFile(
    join(directory, ".env.neon.test.export.local"),
    "NEON_ACCEPTANCE_ADMIN_URL=export-unchanged\n"
  )
  return directory
}

// Parses the strict dotenv subset written by the rotation (and read by the
// PowerShell runners): one NAME=value per line, no quoting or comments.
async function readPrivate(directory, name) {
  const values = {}
  for (const line of (await readFile(join(directory, name), "utf8")).split(
    "\n"
  )) {
    if (!line) continue
    const match = /^([A-Z_][A-Z0-9_]*)=([^\s#'"]+)$/.exec(line)
    assert.ok(match, "every line is a bare NAME=value assignment")
    values[match[1]] = match[2]
  }
  return values
}

function fakes({ failAlter, profile, failVerify, lostCommit } = {}) {
  const statements = []
  const clients = []
  const connect = async (options) => {
    const client = {
      options,
      connection: { stream: { encrypted: true, authorized: true } },
      ssl: options.ssl,
      ended: false,
      async query(text) {
        statements.push({ user: options.user, text })
        if (/current_user AS role/.test(text))
          return {
            rows: [
              {
                database: "neondb",
                role: options.user,
                login: options.user,
                major: 18,
              },
            ],
          }
        if (/FROM pg_roles r/.test(text))
          return {
            rows: roles.map((name) => profile?.(name) ?? restricted(name)),
          }
        if (text.startsWith("ALTER ROLE") && failAlter)
          throw new Error("private ALTER failure with secret detail")
        // The acknowledgement is lost; whether the server committed is unknown.
        if (text === "COMMIT" && lostCommit)
          throw Object.assign(new Error("connection lost"), {
            code: "ECONNRESET",
          })
        return { rows: [] }
      },
      escapeLiteral: (value) => `'${value.replaceAll("'", "''")}'`,
      escapeIdentifier: (value) => `"${value.replaceAll('"', '""')}"`,
      async end() {
        client.ended = true
      },
    }
    if (options.user !== "neondb_owner" && lostCommit === "rejected")
      throw Object.assign(new Error("password authentication failed"), {
        code: "28P01",
      })
    if (options.user !== "neondb_owner" && lostCommit === "unreachable")
      throw Object.assign(new Error("connect failed"), { code: "ETIMEDOUT" })
    if (options.user !== "neondb_owner" && failVerify)
      throw new Error("password authentication failed for secret")
    clients.push(client)
    return client
  }
  return { statements, clients, connect }
}

const environment = () => ({
  NEON_ROTATION_OWNER_URL: ownerUrl,
  NEON_ROTATION_CONFIRMATION: rotationConfirmation,
})

test("confirmation names the exact registered test branch", () => {
  assert.equal(
    rotationConfirmation,
    `rotate-role-passwords:${target.projectId}:${target.branchId}`
  )
})

test("generated secrets are distinct, long, URL-safe and avoid triple repeats", () => {
  for (let round = 0; round < 50; round++) {
    const passwords = generateRolePasswords()
    assert.equal(Object.keys(passwords).length, 4)
    const values = Object.values(passwords)
    assert.equal(new Set(values).size, 4)
    for (const value of values) {
      assert.match(value, /^[A-Za-z0-9_-]{43}$/)
      assert.doesNotMatch(value, /(.)\1\1/)
    }
  }
})

for (const [name, change] of [
  ["missing confirmation", (env) => delete env.NEON_ROTATION_CONFIRMATION],
  [
    "production confirmation",
    (env) =>
      (env.NEON_ROTATION_CONFIRMATION = `rotate-role-passwords:${target.projectId}:${NEON_TARGETS.production.branchId}`),
  ],
  [
    "production owner host",
    (env) =>
      (env.NEON_ROTATION_OWNER_URL = ownerUrl.replace(
        target.host,
        NEON_TARGETS.production.host
      )),
  ],
  [
    "pooled owner host",
    (env) =>
      (env.NEON_ROTATION_OWNER_URL = ownerUrl.replace(
        target.host,
        target.host.replace(".", "-pooler.")
      )),
  ],
  [
    "owner other than neondb_owner",
    (env) =>
      (env.NEON_ROTATION_OWNER_URL = ownerUrl.replace(
        "neondb_owner:",
        "nthawi_migrator:"
      )),
  ],
  [
    "weak TLS",
    (env) =>
      (env.NEON_ROTATION_OWNER_URL = ownerUrl.replace(
        "verify-full",
        "require"
      )),
  ],
  [
    "host override",
    (env) => (env.NEON_ROTATION_OWNER_URL = `${ownerUrl}&host=localhost`),
  ],
  [
    "missing owner password",
    (env) =>
      (env.NEON_ROTATION_OWNER_URL = ownerUrl.replace(
        ":owner-synthetic-secret@",
        "@"
      )),
  ],
  [
    "TLS verification disabled",
    (env) => (env.NODE_TLS_REJECT_UNAUTHORIZED = "0"),
  ],
])
  test(`rotation refuses ${name} before connecting or writing`, async (t) => {
    const directory = await privateDirectory()
    t.after(() => rm(directory, { recursive: true, force: true }))
    const env = environment()
    change(env)
    const fake = fakes()
    await assert.rejects(
      rotateNeonTestCredentials(env, { directory, connect: fake.connect }),
      /NEON_ROTATION_CONFIGURATION_INVALID/
    )
    assert.equal(fake.clients.length, 0)
    assert.equal(
      (await readPrivate(directory, ".env.neon.test.runtime.local"))
        .DATABASE_URL,
      "old-business"
    )
  })

test("owner options are explicit verified-TLS fields for the registered test host", () => {
  const options = rotationOwnerOptions(environment())
  assert.equal(options.host, target.host)
  assert.equal(options.port, 5432)
  assert.equal(options.database, "neondb")
  assert.equal(options.user, "neondb_owner")
  assert.equal(options.ssl.rejectUnauthorized, true)
  assert.equal(options.ssl.servername, target.host)
  assert.equal(options.connectionString, undefined)
})

test("one transaction rotates all four roles; new files pass the shared guard", async (t) => {
  const directory = await privateDirectory()
  t.after(() => rm(directory, { recursive: true, force: true }))
  const fake = fakes()
  const result = await rotateNeonTestCredentials(environment(), {
    directory,
    connect: fake.connect,
  })
  assert.deepEqual(result, {
    code: "NEON_ROLE_PASSWORDS_ROTATED",
    roles: 4,
    distinct: true,
    verified: true,
  })
  const owner = fake.statements
    .filter(({ user }) => user === "neondb_owner")
    .map(({ text }) => text)
  const begin = owner.indexOf("BEGIN")
  const commit = owner.indexOf("COMMIT")
  const alters = owner.filter((text) => text.startsWith("ALTER ROLE"))
  assert.equal(alters.length, 4)
  assert.ok(begin >= 0 && commit > begin)
  for (const role of roles)
    assert.ok(
      owner.findIndex((text) =>
        text.startsWith(`ALTER ROLE "${role}" WITH PASSWORD '`)
      ) > begin
    )
  const runtime = await readPrivate(directory, ".env.neon.test.runtime.local")
  const operator = await readPrivate(directory, ".env.neon.test.operator.local")
  // The rewritten files satisfy the same guard every runner uses.
  assert.equal(
    assertNeonTestEnvironment({ ...runtime, ...operator }).branchId,
    target.branchId
  )
  assert.deepEqual(Object.keys(runtime).sort(), [
    "AUTH_DATABASE_URL",
    "DATABASE_URL",
  ])
  assert.equal(operator.NEON_TARGET, "test")
  // Every new login was verified, and the export credential is untouched.
  assert.deepEqual(
    fake.clients.map(({ options }) => options.user).sort(),
    ["neondb_owner", ...roles].sort()
  )
  assert.ok(fake.clients.every((client) => client.ended))
  assert.equal(
    (await readPrivate(directory, ".env.neon.test.export.local"))
      .NEON_ACCEPTANCE_ADMIN_URL,
    "export-unchanged"
  )
  assert.deepEqual((await readdir(directory)).sort(), [
    ".env.neon.test.export.local",
    ".env.neon.test.operator.local",
    ".env.neon.test.runtime.local",
  ])
  assert.equal(JSON.stringify(result).includes(runtime.DATABASE_URL), false)
})

test("a failed ALTER rolls back, keeps the old files and leaks nothing", async (t) => {
  const directory = await privateDirectory()
  t.after(() => rm(directory, { recursive: true, force: true }))
  const fake = fakes({ failAlter: true })
  await assert.rejects(
    rotateNeonTestCredentials(environment(), {
      directory,
      connect: fake.connect,
    }),
    (error) =>
      error.message === "NEON_ROTATION_FAILED" &&
      !/secret|ALTER/.test(`${error.message}${error.stage ?? ""}`)
  )
  const owner = fake.statements.map(({ text }) => text)
  assert.ok(owner.includes("ROLLBACK"))
  assert.equal(owner.includes("COMMIT"), false)
  assert.equal(
    (await readPrivate(directory, ".env.neon.test.runtime.local")).DATABASE_URL,
    "old-business"
  )
  assert.deepEqual((await readdir(directory)).length, 3)
})

test("a privileged or missing target role is refused before any change", async (t) => {
  for (const profile of [
    (name) =>
      name === "nthawi_auth"
        ? { ...restricted(name), rolbypassrls: true }
        : restricted(name),
    (name) =>
      name === "nthawi_jobs"
        ? { ...restricted(name), memberships: true }
        : restricted(name),
  ]) {
    const directory = await privateDirectory()
    t.after(() => rm(directory, { recursive: true, force: true }))
    const fake = fakes({ profile })
    await assert.rejects(
      rotateNeonTestCredentials(environment(), {
        directory,
        connect: fake.connect,
      }),
      /NEON_ROTATION_PREFLIGHT_REJECTED/
    )
    assert.equal(
      fake.statements.some(({ text }) => text.startsWith("ALTER ROLE")),
      false
    )
  }
})

test("a failed post-commit login check is reported after the files are replaced", async (t) => {
  const directory = await privateDirectory()
  t.after(() => rm(directory, { recursive: true, force: true }))
  const fake = fakes({ failVerify: true })
  await assert.rejects(
    rotateNeonTestCredentials(environment(), {
      directory,
      connect: fake.connect,
    }),
    /NEON_ROTATION_VERIFY_FAILED/
  )
  // The committed credentials are already the only valid ones, so they stay.
  const runtime = await readPrivate(directory, ".env.neon.test.runtime.local")
  assert.notEqual(runtime.DATABASE_URL, "old-business")
})

test("a lost COMMIT acknowledgement is decided by a new login: committed", async (t) => {
  const directory = await privateDirectory()
  t.after(() => rm(directory, { recursive: true, force: true }))
  const fake = fakes({ lostCommit: "committed" })
  const result = await rotateNeonTestCredentials(environment(), {
    directory,
    connect: fake.connect,
  })
  assert.equal(result.code, "NEON_ROLE_PASSWORDS_ROTATED")
  const runtime = await readPrivate(directory, ".env.neon.test.runtime.local")
  assert.notEqual(runtime.DATABASE_URL, "old-business")
  assert.equal((await readdir(directory)).length, 3)
})

test("a lost COMMIT acknowledgement with a rejected new password removes the staged files", async (t) => {
  const directory = await privateDirectory()
  t.after(() => rm(directory, { recursive: true, force: true }))
  const fake = fakes({ lostCommit: "rejected" })
  await assert.rejects(
    rotateNeonTestCredentials(environment(), {
      directory,
      connect: fake.connect,
    }),
    (error) =>
      error.message === "NEON_ROTATION_FAILED" && error.stage === "commit"
  )
  assert.equal(
    (await readPrivate(directory, ".env.neon.test.runtime.local")).DATABASE_URL,
    "old-business"
  )
  assert.equal((await readdir(directory)).length, 3)
})

test("an undecidable COMMIT keeps both the originals and the staged candidates", async (t) => {
  const directory = await privateDirectory()
  t.after(() => rm(directory, { recursive: true, force: true }))
  const fake = fakes({ lostCommit: "unreachable" })
  await assert.rejects(
    rotateNeonTestCredentials(environment(), {
      directory,
      connect: fake.connect,
    }),
    /NEON_ROTATION_COMMIT_UNCONFIRMED/
  )
  assert.equal(
    (await readPrivate(directory, ".env.neon.test.runtime.local")).DATABASE_URL,
    "old-business"
  )
  assert.deepEqual(
    (await readdir(directory))
      .filter((name) => name.endsWith(".rotating"))
      .sort(),
    [
      ".env.neon.test.operator.local.rotating",
      ".env.neon.test.runtime.local.rotating",
    ]
  )
})

test("a missing private file is refused before connecting", async (t) => {
  const directory = await privateDirectory()
  t.after(() => rm(directory, { recursive: true, force: true }))
  await rm(join(directory, ".env.neon.test.export.local"))
  const fake = fakes()
  await assert.rejects(
    rotateNeonTestCredentials(environment(), {
      directory,
      connect: fake.connect,
    }),
    /NEON_ROTATION_CONFIGURATION_INVALID/
  )
  assert.equal(fake.clients.length, 0)
})
