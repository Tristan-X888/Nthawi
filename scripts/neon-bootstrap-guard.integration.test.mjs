import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { after, before, test } from "node:test"
import { createDatabaseTestFixture } from "../packages/db/test/helpers/database-fixture.mjs"

// LOCAL ONLY, on a disposable loopback PostgreSQL 18 (shared guard), with the
// PostgreSQL 18 psql client. Runs the real bootstrap password guard that
// infra/neon/bootstrap.psql includes before any role is created, so a staging
// or production bootstrap can never assign one secret to two roles again.
const adminUrl = process.env.RLS_TEST_ADMIN_URL
const pgBin = process.env.NEON_EXPORT_TEST_PG_BIN
if (!adminUrl || !pgBin)
  throw new Error(
    "RLS_TEST_ADMIN_URL and NEON_EXPORT_TEST_PG_BIN are required for this local integration test"
  )
const psql = join(pgBin, process.platform === "win32" ? "psql.exe" : "psql")
const guardPath = fileURLToPath(
  new URL("../infra/neon/bootstrap-password-guard.psql", import.meta.url)
)
const secretNames = [
  "DATABASE_MIGRATOR_PASSWORD",
  "DATABASE_AUTH_PASSWORD",
  "DATABASE_BUSINESS_PASSWORD",
  "DATABASE_JOBS_PASSWORD",
]

let fixture
let directory
let wrapper

before(async () => {
  // The shared fixture refuses anything but a literal loopback administrator.
  fixture = await createDatabaseTestFixture(adminUrl)
  directory = await mkdtemp(join(tmpdir(), "nthawi-bootstrap-guard-it-"))
  wrapper = join(directory, "guard-wrapper.psql")
  // Mirrors bootstrap.psql: secrets arrive through the environment, never -v.
  await writeFile(
    wrapper,
    [
      "\\set ON_ERROR_STOP on",
      "\\set ECHO none",
      "\\set ECHO_HIDDEN off",
      "\\set migrator_password ''",
      "\\set auth_password ''",
      "\\set business_password ''",
      "\\set jobs_password ''",
      "\\getenv migrator_password DATABASE_MIGRATOR_PASSWORD",
      "\\getenv auth_password DATABASE_AUTH_PASSWORD",
      "\\getenv business_password DATABASE_BUSINESS_PASSWORD",
      "\\getenv jobs_password DATABASE_JOBS_PASSWORD",
      `\\i '${guardPath.replaceAll("\\", "/")}'`,
      "\\echo NEON_BOOTSTRAP_GUARD_PASSED",
      "",
    ].join("\n")
  )
})

after(async () => {
  await fixture?.close()
  if (directory) await rm(directory, { recursive: true, force: true })
})

function runGuard(secrets) {
  const url = new URL(adminUrl)
  const env = {
    SystemRoot: process.env.SystemRoot,
    PATH: process.env.PATH,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: fixture.databaseName,
    PGSSLMODE: "disable",
  }
  secretNames.forEach((name, index) => {
    if (secrets[index] !== undefined) env[name] = secrets[index]
  })
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(psql, ["-X", "-q", "-f", wrapper], {
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let output = ""
    child.stdout.on("data", (data) => (output += data.toString()))
    child.stderr.on("data", (data) => (output += data.toString()))
    child.once("error", rejectRun)
    child.once("close", (code) => resolveRun({ code, output }))
  })
}

const freshSecrets = () =>
  secretNames.map(() => `Syn-${randomBytes(18).toString("base64url")}`)

function assertNoSecret(result, secrets) {
  for (const secret of secrets.filter(Boolean))
    assert.equal(result.output.includes(secret), false)
}

test("four distinct role secrets pass the bootstrap guard", async () => {
  const secrets = freshSecrets()
  const result = await runGuard(secrets)
  assert.equal(result.code, 0, "the guard refused distinct secrets")
  assert.match(result.output, /NEON_BOOTSTRAP_GUARD_PASSED/)
  assertNoSecret(result, secrets)
})

for (let first = 0; first < secretNames.length; first++)
  for (let second = first + 1; second < secretNames.length; second++)
    test(`bootstrap guard refuses ${secretNames[first]} reused for ${secretNames[second]}`, async () => {
      const secrets = freshSecrets()
      secrets[second] = secrets[first]
      const result = await runGuard(secrets)
      assert.notEqual(result.code, 0)
      assert.match(result.output, /must be different/)
      assert.doesNotMatch(result.output, /NEON_BOOTSTRAP_GUARD_PASSED/)
      assertNoSecret(result, secrets)
    })

test("bootstrap guard refuses a missing role secret before comparing", async () => {
  const secrets = freshSecrets()
  secrets[2] = undefined
  const result = await runGuard(secrets)
  assert.notEqual(result.code, 0)
  assert.match(result.output, /Set all DATABASE_/)
  assert.doesNotMatch(result.output, /NEON_BOOTSTRAP_GUARD_PASSED/)
  assertNoSecret(result, secrets)
})
