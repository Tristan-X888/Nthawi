import assert from "node:assert/strict"
import test from "node:test"
import { mkdtemp, readFile, rmdir, unlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import {
  assertNeonAcceptanceEnvironment,
  assertPrivilegedAcceptanceSession,
  neonAcceptanceAdminOptions,
  persistIsolationAttempt,
  NeonIsolationError,
  runNeonLiveIsolation,
} from "./neon-live-isolation.mjs"
import {
  cleanupSyntheticFixtures,
  createSyntheticFixtures,
  insertSyntheticFixtures,
  protectedTables,
} from "./neon-synthetic-fixtures.mjs"

const host = "ep-cold-shadow-zaqw3flo.c-2.eu-west-2.aws.neon.tech"
function environment(operation = "synthetic-isolation") {
  // Every login, including the export login, holds its own synthetic secret.
  const url = (role) =>
    `postgresql://${role}:synthetic-password-${role}@${host}:5432/neondb?sslmode=verify-full`
  return {
    NEON_TARGET: "test",
    NEON_EXPECTED_BRANCH_ID: "br-rapid-brook-zao6uwya",
    NEON_EXPECTED_PROJECT_ID: "delicate-feather-83629956",
    DATABASE_MIGRATION_URL: url("nthawi_migrator"),
    AUTH_DATABASE_URL: url("nthawi_auth"),
    DATABASE_URL: url("nthawi_business"),
    JOBS_DATABASE_URL: url("nthawi_jobs"),
    DATABASE_MIGRATOR_ROLE: "nthawi_migrator",
    DATABASE_AUTH_ROLE: "nthawi_auth",
    DATABASE_BUSINESS_ROLE: "nthawi_business",
    DATABASE_JOBS_ROLE: "nthawi_jobs",
    NEON_ACCEPTANCE_ADMIN_URL: url("nthawi_export"),
    NEON_ACCEPTANCE_AUTHORIZATION_ID: "owner-approval-2026-11-04",
    NEON_ACCEPTANCE_CONFIRMATION: `${operation}:delicate-feather-83629956:br-rapid-brook-zao6uwya`,
    NEON_ACCEPTANCE_EVIDENCE_DIRECTORY: resolve("synthetic-private-evidence"),
  }
}

function harness(options = {}) {
  const clients = []
  const rows = new Map(protectedTables.map((table) => [table, []]))
  const statements = []
  let inserted = 0
  const attempts = []
  const receipts = []
  const createClient = (connection) => {
    let tenant = null
    let beforeTransaction
    const client = {
      role: connection.user,
      connection: { stream: { encrypted: true, authorized: true } },
      ssl: connection.ssl,
      closed: false,
      async connect() {
        if (options.connectFailure && clients.length === 1)
          throw new Error("private-url-and-password")
      },
      async end() {
        this.closed = true
        if (options.closeFailure) throw new Error("secret")
      },
      async query(statement, parameters = []) {
        const text = typeof statement === "string" ? statement : statement.text
        const values =
          typeof statement === "string" ? parameters : statement.values
        statements.push({ role: this.role, text, values })
        if (text.startsWith("SELECT current_database()"))
          return {
            rows: [
              text.includes("safe_flags")
                ? {
                    database_matches: true,
                    login_matches: !options.badRuntime,
                    safe_flags: true,
                    no_memberships: true,
                  }
                : {
                    database_matches: true,
                    login_matches: true,
                    current_matches: true,
                    version_matches: true,
                    bypasses_rls: !options.noBypass,
                    not_superuser: true,
                    reads_all_data: true,
                  },
            ],
          }
        // Observed on Neon 2026-11-05: the switch is refused with XX000.
        if (text === "SET ROLE neon_superuser")
          throw Object.assign(new Error("internal secret"), { code: "XX000" })
        if (text.startsWith("SELECT relname AS name"))
          return {
            rows: protectedTables
              .map((name) => ({ name, enabled: true, forced: true }))
              .concat(
                options.unknownTable
                  ? [{ name: "unclassified", enabled: true, forced: true }]
                  : []
              ),
          }
        if (text === "BEGIN") {
          beforeTransaction = new Map(
            [...rows].map(([table, entries]) => [
              table,
              entries.map((entry) => ({ ...entry })),
            ])
          )
          return { rows: [] }
        }
        if (text === "ROLLBACK") {
          if (beforeTransaction && this.role === "nthawi_business")
            for (const [table, entries] of beforeTransaction)
              rows.set(table, entries)
          tenant = null
          beforeTransaction = undefined
          return { rows: [] }
        }
        if (text === "COMMIT") {
          beforeTransaction = undefined
          if (!options.contextLeak) tenant = null
          if (
            options.ambiguousCommit &&
            this.role === "nthawi_export" &&
            inserted
          )
            throw new Error("commit response lost")
          return { rows: [] }
        }
        if (text.includes("set_config('app.owner_id'")) {
          tenant = values[1] || null
          return { rows: [] }
        }
        const table = text.match(/public\."([a-z_]+)"/)?.[1]
        if (text.startsWith("INSERT")) {
          if (this.role !== "nthawi_export")
            throw Object.assign(new Error("denied secret"), { code: "42501" })
          const columns = text
            .slice(text.indexOf("(") + 1, text.indexOf(")"))
            .split(", ")
            .map((column) => column.replaceAll('"', ""))
          const entry = Object.fromEntries(
            columns.map((column, i) => [column, values[i]])
          )
          rows.get(table).push(entry)
          inserted++
          if (options.insertFailure && inserted === 2)
            throw new Error("private-customer-content")
          return { rowCount: 1, rows: [] }
        }
        if (text.startsWith("DELETE")) {
          if (options.cleanupFailure)
            throw new Error("private-customer-content")
          // The business role has no DELETE grant on workspaces and sees
          // only its own tenant's rows; the privileged cleanup login sees all.
          if (this.role === "nthawi_business" && table === "workspaces")
            throw Object.assign(new Error("denied secret"), { code: "42501" })
          const visible = (entry) =>
            this.role !== "nthawi_business" ||
            options.leak ||
            entry.workspace_id === tenant
          const entries = rows.get(table)
          rows.set(
            table,
            entries.filter(
              (entry) =>
                !(
                  (table === "monthly_usage"
                    ? entry.workspace_id === values[0] &&
                      entry.period === values[1]
                    : entry.id === values[0]) && visible(entry)
                )
            )
          )
          return { rowCount: entries.length - rows.get(table).length, rows: [] }
        }
        if (text.startsWith("SELECT name FROM public.workspaces"))
          return {
            rows: rows
              .get("workspaces")
              .filter((entry) => entry.id === values[0])
              .map(({ name }) => ({ name })),
          }
        if (text.startsWith("SELECT count(*)")) {
          const entries = rows.get(table).filter(
            (entry) =>
              (table === "monthly_usage"
                ? entry.workspace_id === values[0] && entry.period === values[1]
                : entry.id === values[0]) &&
              (this.role === "nthawi_export" ||
                options.leak ||
                (table === "workspaces"
                  ? entry.owner_id?.endsWith(":0") ===
                      rows
                        .get("workspaces")
                        .find((row) => row.id === tenant)
                        ?.owner_id?.endsWith(":0") && !!tenant
                  : entry.workspace_id === tenant))
          )
          return { rows: [{ count: entries.length }] }
        }
        if (text.startsWith("UPDATE")) {
          const entries =
            rows
              .get(table)
              ?.filter(
                (entry) =>
                  (table === "monthly_usage"
                    ? entry.workspace_id === values[0] &&
                      entry.period === values[1]
                    : entry.id === values[0]) &&
                  (table === "workspaces"
                    ? entry.id === tenant
                    : entry.workspace_id === tenant)
              ) ??
            rows
              .get("workspaces")
              .filter((entry) => entry.id === values[0] && entry.id === tenant)
          if (text.includes("synthetic-rollback-probe"))
            for (const entry of entries) entry.name = "synthetic-rollback-probe"
          return { rowCount: entries.length, rows: [] }
        }
        if (
          text.startsWith("SELECT 1 FROM public.") &&
          this.role !== "nthawi_business"
        ) {
          if (table === "user" && this.role === "nthawi_auth")
            return { rows: [], rowCount: 0 }
          throw Object.assign(new Error("denied secret"), { code: "42501" })
        }
        throw new Error(`Unhandled test query: ${text}`)
      },
    }
    clients.push(client)
    return client
  }
  return {
    attempts,
    receipts,
    async persistAttempt(env, target, fixture) {
      if (options.evidenceFailure) throw new Error("private filesystem failure")
      attempts.push({ target, runId: fixture.runId })
      return {
        directory: resolve("synthetic-private-evidence"),
        async finish(result) {
          receipts.push(result)
        },
      }
    },
    createClient,
    clients,
    rows,
    statements,
    get inserted() {
      return inserted
    },
  }
}

test("acceptance guard preserves exact test identity and operation scope", () => {
  assert.equal(
    assertNeonAcceptanceEnvironment(environment()).projectId,
    "delicate-feather-83629956"
  )
  assert.equal(
    assertNeonAcceptanceEnvironment(
      environment("synthetic-export"),
      "synthetic-export"
    ).database,
    "neondb"
  )
  const options = neonAcceptanceAdminOptions(environment())
  assert.equal(options.user, "nthawi_export")
  assert.equal(options.connectionString, undefined)
  assert.deepEqual(options.ssl, { rejectUnauthorized: true, servername: host })
})

for (const [name, change] of [
  ["missing target", (e) => delete e.NEON_TARGET],
  [
    "production",
    (e) => {
      e.NEON_TARGET = "production"
      e.NEON_EXPECTED_BRANCH_ID = "br-lively-darkness-zahxet6z"
    },
  ],
  ["wrong project", (e) => (e.NEON_EXPECTED_PROJECT_ID = "other")],
  ["missing project", (e) => delete e.NEON_EXPECTED_PROJECT_ID],
  ["wrong branch", (e) => (e.NEON_EXPECTED_BRANCH_ID = "other")],
  [
    "missing operation confirmation",
    (e) => delete e.NEON_ACCEPTANCE_CONFIRMATION,
  ],
  [
    "wrong operation",
    (e) =>
      (e.NEON_ACCEPTANCE_CONFIRMATION =
        "synthetic-export:delicate-feather-83629956:br-rapid-brook-zao6uwya"),
  ],
  [
    "missing authority reference",
    (e) => delete e.NEON_ACCEPTANCE_AUTHORIZATION_ID,
  ],
  [
    "invalid authority reference",
    (e) => (e.NEON_ACCEPTANCE_AUTHORIZATION_ID = "unsafe\nsecret"),
  ],
  ["TLS disabled", (e) => (e.NODE_TLS_REJECT_UNAUTHORIZED = "0")],
  [
    "wrong operator role",
    (e) => (e.NEON_ACCEPTANCE_ADMIN_URL = e.DATABASE_URL),
  ],
  [
    "pooled operator",
    (e) =>
      (e.NEON_ACCEPTANCE_ADMIN_URL = e.NEON_ACCEPTANCE_ADMIN_URL.replace(
        host,
        host.replace(".", "-pooler.")
      )),
  ],
  [
    "wrong operator host",
    (e) =>
      (e.NEON_ACCEPTANCE_ADMIN_URL = e.NEON_ACCEPTANCE_ADMIN_URL.replace(
        host,
        "other.neon.tech"
      )),
  ],
  [
    "wrong database",
    (e) =>
      (e.NEON_ACCEPTANCE_ADMIN_URL = e.NEON_ACCEPTANCE_ADMIN_URL.replace(
        "/neondb?",
        "/other?"
      )),
  ],
  [
    "wrong port",
    (e) =>
      (e.NEON_ACCEPTANCE_ADMIN_URL = e.NEON_ACCEPTANCE_ADMIN_URL.replace(
        ":5432/",
        ":5433/"
      )),
  ],
  [
    "weak TLS",
    (e) =>
      (e.NEON_ACCEPTANCE_ADMIN_URL = e.NEON_ACCEPTANCE_ADMIN_URL.replace(
        "verify-full",
        "require"
      )),
  ],
  [
    "host override",
    (e) => (e.NEON_ACCEPTANCE_ADMIN_URL += "&host=other.neon.tech"),
  ],
  ["duplicate TLS", (e) => (e.NEON_ACCEPTANCE_ADMIN_URL += "&sslmode=disable")],
  [
    "missing password",
    (e) =>
      (e.NEON_ACCEPTANCE_ADMIN_URL = e.NEON_ACCEPTANCE_ADMIN_URL.replace(
        "synthetic-password-nthawi_export",
        ""
      )),
  ],
  [
    "export login reusing a runtime role password",
    (e) =>
      (e.NEON_ACCEPTANCE_ADMIN_URL = e.NEON_ACCEPTANCE_ADMIN_URL.replace(
        "synthetic-password-nthawi_export",
        "synthetic-password-nthawi_business"
      )),
  ],
  [
    "export login reusing the migrator password",
    (e) =>
      (e.NEON_ACCEPTANCE_ADMIN_URL = e.NEON_ACCEPTANCE_ADMIN_URL.replace(
        "synthetic-password-nthawi_export",
        "synthetic-password-nthawi_migrator"
      )),
  ],
  [
    "two runtime roles sharing one password",
    (e) =>
      (e.DATABASE_URL = e.DATABASE_URL.replace(
        "synthetic-password-nthawi_business",
        "synthetic-password-nthawi_auth"
      )),
  ],
  ["URL fragment", (e) => (e.NEON_ACCEPTANCE_ADMIN_URL += "#secret")],
  ["malformed URL", (e) => (e.NEON_ACCEPTANCE_ADMIN_URL = "invalid")],
  ["wrong runtime role", (e) => (e.DATABASE_BUSINESS_ROLE = "neon_superuser")],
  [
    "missing evidence directory",
    (e) => delete e.NEON_ACCEPTANCE_EVIDENCE_DIRECTORY,
  ],
  [
    "relative evidence directory",
    (e) => (e.NEON_ACCEPTANCE_EVIDENCE_DIRECTORY = "relative"),
  ],
  [
    "plugin state directory",
    (e) => (e.NEON_ACCEPTANCE_EVIDENCE_DIRECTORY = resolve(".anchor")),
  ],
])
  test(`guard rejects ${name} before opening connections`, async () => {
    const env = environment()
    change(env)
    let connections = 0
    let persisted = 0
    // The rejection must come from the configuration guard itself, not from a
    // later stage such as the missing synthetic evidence directory.
    await assert.rejects(
      runNeonLiveIsolation(env, {
        persistAttempt() {
          persisted++
          throw new Error("should not persist an attempt")
        },
        createClient() {
          connections++
          throw new Error("should not connect")
        },
      }),
      /CONFIGURATION_INVALID/
    )
    assert.equal(persisted, 0)
    assert.equal(connections, 0)
  })

test("guard control: a valid environment passes the guard and reaches the attempt record", async () => {
  let persisted = 0
  await assert.rejects(
    runNeonLiveIsolation(environment(), {
      persistAttempt() {
        persisted++
        throw new Error("stop after the guard")
      },
      createClient() {
        throw new Error("should not connect")
      },
    }),
    NeonIsolationError
  )
  assert.equal(persisted, 1)
})

test("a privileged login without its own BYPASSRLS attribute fails before fixture writes", async () => {
  const fake = harness({ noBypass: true })
  await assert.rejects(
    runNeonLiveIsolation(environment(), fake),
    (error) => error.stage === "operator-privilege"
  )
  assert.equal(fake.inserted, 0)
  assert.equal(fake.clients[0].closed, true)
})

test("the effective role is the verified login itself; no role switch is attempted", async () => {
  const fake = harness()
  const client = fake.createClient(neonAcceptanceAdminOptions(environment()))
  await assertPrivilegedAcceptanceSession(client)
  assert.equal(fake.statements.length, 1)
  assert.match(fake.statements[0].text, /rolbypassrls/)
  assert.match(fake.statements[0].text, /pg_read_all_data/)
  assert.ok(
    fake.statements.every(({ text }) => !text.startsWith("SET ROLE")),
    "Neon refuses SET ROLE neon_superuser (SQLSTATE XX000)"
  )
})

test("fixtures use fresh UUIDs, every FORCE RLS table, and parameterized payloads", async () => {
  const fixture = createSyntheticFixtures()
  const other = createSyntheticFixtures()
  assert.notEqual(fixture.runId, other.runId)
  assert.equal(fixture.tenants.length, 2)
  assert.deepEqual([...fixture.tenants[0].rows.keys()], protectedTables)
  const fake = harness()
  const client = fake.createClient(neonAcceptanceAdminOptions(environment()))
  await insertSyntheticFixtures(client, fixture)
  assert.equal(fake.inserted, 24)
  for (const statement of fake.statements) {
    assert.match(statement.text, /VALUES \(\$1/)
    assert.equal(statement.text.includes(fixture.runId), false)
  }
  await cleanupSyntheticFixtures(client, fixture)
  assert.equal([...fake.rows.values()].flat().length, 0)
  assert.equal(
    fake.statements.filter(({ text }) => text.startsWith("DELETE")).length,
    24
  )
  assert.ok(
    fake.statements
      .filter(({ text }) => text.startsWith("DELETE"))
      .every(
        ({ text, values }) =>
          /WHERE "(id|workspace_id)" = \$1::uuid/.test(text) &&
          values.length >= 1
      )
  )
})

test("full control flow proves coverage, actual distinct logins, reuse, concurrency and scoped cleanup", async () => {
  const fake = harness()
  const result = await runNeonLiveIsolation(environment(), fake)
  assert.equal(result.status, "passed")
  assert.equal(result.tables.length, 12)
  assert.equal(result.fixtureRows, 24)
  assert.equal(result.cleanupCompleted, true)
  assert.deepEqual(
    fake.clients.map(({ role }) => role),
    [
      "nthawi_export",
      "nthawi_business",
      "nthawi_business",
      "nthawi_auth",
      "nthawi_jobs",
    ]
  )
  assert.equal(
    fake.clients.every(({ closed }) => closed),
    true
  )
  assert.equal([...fake.rows.values()].flat().length, 0)
  assert.equal(fake.attempts.length, 1)
  assert.equal(fake.receipts[0].complete, true)
})

test("durable generated-key attempt precedes live operations and contains no credentials", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nthawi-isolation-evidence-"))
  const fixture = createSyntheticFixtures()
  let record
  try {
    record = await persistIsolationAttempt(
      { ...environment(), NEON_ACCEPTANCE_EVIDENCE_DIRECTORY: directory },
      assertNeonAcceptanceEnvironment(environment()),
      fixture
    )
    const bytes = await readFile(join(record.directory, "attempt.json"), "utf8")
    const attempt = JSON.parse(bytes)
    assert.equal(attempt.complete, false)
    assert.equal(attempt.fixtureKeys.length, 2)
    assert.equal(Object.keys(attempt.fixtureKeys[0].rows).length, 12)
    assert.equal(bytes.includes("synthetic-password"), false)
    await record.finish({ complete: true, cleanupCompleted: true })
    assert.equal(
      JSON.parse(await readFile(join(record.directory, "result.json"), "utf8"))
        .cleanupCompleted,
      true
    )
  } finally {
    if (record) {
      await unlink(join(record.directory, "attempt.json"))
      await unlink(join(record.directory, "result.json"))
      await rmdir(record.directory)
    }
    await rmdir(directory)
  }
})

test("attempt persistence failure prevents all connections and fixture writes", async () => {
  const fake = harness({ evidenceFailure: true })
  await assert.rejects(
    runNeonLiveIsolation(environment(), fake),
    (error) => error.stage === "attempt-evidence"
  )
  assert.equal(fake.clients.length, 0)
  assert.equal(fake.inserted, 0)
})

for (const [name, options, expectedStage] of [
  ["unknown FORCE RLS table", { unknownTable: true }, "catalog-coverage"],
  ["runtime profile drift", { badRuntime: true }, "runtime-login:business"],
  ["cross tenant visibility", { leak: true }, "business-isolation-reuse"],
  ["failed fixture insert", { insertFailure: true }, "create-fixtures"],
  ["lost commit acknowledgement", { ambiguousCommit: true }, "fixture-cleanup"],
  ["cleanup failure", { cleanupFailure: true }, "fixture-cleanup"],
  ["connection failure", { connectFailure: true }, "connect-operator"],
  ["connection closure failure", { closeFailure: true }, "connection-cleanup"],
  [
    "leaked transaction context",
    { contextLeak: true },
    "transaction-local-context",
  ],
])
  test(`${name} fails closed, redacts errors, and closes all opened clients`, async () => {
    const fake = harness(options)
    await assert.rejects(runNeonLiveIsolation(environment(), fake), (error) => {
      assert.ok(error instanceof NeonIsolationError)
      assert.equal(error.stage, expectedStage)
      assert.equal(error.message, "NEON_SYNTHETIC_ISOLATION_FAILED")
      assert.doesNotMatch(
        JSON.stringify(error),
        /private-customer-content|private-url-and-password|synthetic-password/
      )
      if (["fixture-cleanup"].includes(expectedStage))
        assert.equal(error.cleanupCompleted, false)
      return true
    })
    assert.ok(fake.clients.every(({ closed }) => closed))
    assert.equal(fake.receipts[0].complete, false)
    assert.equal(fake.receipts[0].checksCompleted, false)
    for (const unproven of ["reuse", "concurrency", "rollback", "fixtureRows"])
      assert.equal(fake.receipts[0][unproven], undefined)
    if (!options.cleanupFailure && !options.ambiguousCommit)
      assert.equal([...fake.rows.values()].flat().length, 0)
  })
