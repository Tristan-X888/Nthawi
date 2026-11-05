import { randomBytes } from "node:crypto"
import { open, rename, rm, stat } from "node:fs/promises"
import { createRequire } from "node:module"
import { isAbsolute, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import {
  NEON_TARGETS,
  assertVerifiedNeonClient,
  hasDistinctPasswords,
} from "./neon-targets.mjs"

// Rotates the four restricted role passwords on the REGISTERED TEST BRANCH
// ONLY (P4-D08). The roles were created with SQL by neondb_owner, so the owner
// changes them with SQL in one transaction. New secrets are generated here,
// staged in the private files before COMMIT and moved into place after it, so
// a committed secret never exists only in memory. Nothing secret is printed.

const target = NEON_TARGETS.test
export const rotationConfirmation = `rotate-role-passwords:${target.projectId}:${target.branchId}`

const roles = Object.freeze([
  ["migrator", "nthawi_migrator", "DATABASE_MIGRATION_URL"],
  ["auth", "nthawi_auth", "AUTH_DATABASE_URL"],
  ["business", "nthawi_business", "DATABASE_URL"],
  ["jobs", "nthawi_jobs", "JOBS_DATABASE_URL"],
])
const files = Object.freeze({
  runtime: ".env.neon.test.runtime.local",
  operator: ".env.neon.test.operator.local",
  export: ".env.neon.test.export.local",
})
const identitySql = `SELECT current_database() AS database, current_user AS role, session_user AS login,
  current_setting('server_version_num')::integer / 10000 AS major`
const profileSql = `SELECT r.rolname AS name, r.rolcanlogin, r.rolsuper, r.rolbypassrls, r.rolcreatedb,
  r.rolcreaterole, r.rolreplication, r.rolinherit,
  EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member = r.oid) AS memberships
  FROM pg_roles r WHERE r.rolname = ANY($1::text[]) ORDER BY r.rolname`

class NeonRotationError extends Error {
  constructor(code, stage) {
    super(code)
    this.name = "NeonRotationError"
    this.stage = stage
  }
}
function fail(code, stage) {
  throw new NeonRotationError(code, stage)
}
const invalid = (stage) => fail("NEON_ROTATION_CONFIGURATION_INVALID", stage)

/** 256-bit URL-safe secrets, pairwise different, without triple repeats. */
export function generateRolePasswords() {
  for (;;) {
    const passwords = Object.fromEntries(
      roles.map(([kind]) => {
        let value
        do value = randomBytes(32).toString("base64url")
        while (/(.)\1\1/.test(value))
        return [kind, value]
      })
    )
    if (hasDistinctPasswords(Object.values(passwords))) return passwords
  }
}

/** Explicit verified-TLS fields for neondb_owner on the registered test host. */
export function rotationOwnerOptions(env) {
  if (
    env.NEON_ROTATION_CONFIRMATION !== rotationConfirmation ||
    env.NODE_TLS_REJECT_UNAUTHORIZED === "0"
  )
    invalid("configuration")
  let url
  let password
  try {
    url = new URL(env.NEON_ROTATION_OWNER_URL)
    password = decodeURIComponent(url.password)
  } catch {
    invalid("owner")
  }
  const params = [...url.searchParams.entries()]
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== target.host ||
    url.port !== "5432" ||
    url.pathname !== `/${target.database}` ||
    url.username !== "neondb_owner" ||
    !password ||
    password.includes("\0") ||
    url.hash ||
    params.length !== 1 ||
    params[0][0] !== "sslmode" ||
    params[0][1] !== "verify-full"
  )
    invalid("owner")
  return connectionOptions("neondb_owner", password)
}

function connectionOptions(user, password) {
  return {
    host: target.host,
    port: 5432,
    database: target.database,
    user,
    password,
    ssl: { rejectUnauthorized: true, servername: target.host },
    connectionTimeoutMillis: 10_000,
    query_timeout: 20_000,
    statement_timeout: 15_000,
  }
}

const roleUrl = (role, password) =>
  `postgresql://${role}:${encodeURIComponent(password)}@${target.host}:5432/${target.database}?sslmode=verify-full`

// Exactly the strict dotenv subset the PowerShell runners read.
function privateFiles(passwords) {
  const url = Object.fromEntries(
    roles.map(([kind, role, variable]) => [
      variable,
      roleUrl(role, passwords[kind]),
    ])
  )
  return {
    [files.runtime]:
      [
        `AUTH_DATABASE_URL=${url.AUTH_DATABASE_URL}`,
        `DATABASE_URL=${url.DATABASE_URL}`,
      ].join("\n") + "\n",
    [files.operator]:
      [
        `DATABASE_MIGRATION_URL=${url.DATABASE_MIGRATION_URL}`,
        `JOBS_DATABASE_URL=${url.JOBS_DATABASE_URL}`,
        "DATABASE_MIGRATOR_ROLE=nthawi_migrator",
        "DATABASE_AUTH_ROLE=nthawi_auth",
        "DATABASE_BUSINESS_ROLE=nthawi_business",
        "DATABASE_JOBS_ROLE=nthawi_jobs",
        "NEON_TARGET=test",
        `NEON_EXPECTED_BRANCH_ID=${target.branchId}`,
      ].join("\n") + "\n",
  }
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

async function assertPrivateDirectory(directory) {
  if (
    typeof directory !== "string" ||
    !isAbsolute(directory) ||
    directory.split(/[\\/]/).includes(".anchor")
  )
    invalid("directory")
  for (const name of Object.values(files))
    if (!(await isFile(join(directory, name)))) invalid("directory")
  // A leftover staged file means an earlier rotation needs attention first.
  for (const name of [files.runtime, files.operator])
    if (await isFile(join(directory, `${name}.rotating`))) invalid("staged")
}

async function stage(path, text) {
  const staged = `${path}.rotating`
  const handle = await open(staged, "wx", 0o600)
  try {
    await handle.writeFile(text)
    await handle.sync()
  } finally {
    await handle.close()
  }
  return staged
}

async function preflight(client) {
  const identity = (await client.query(identitySql)).rows[0]
  if (
    identity?.database !== target.database ||
    identity?.role !== "neondb_owner" ||
    identity?.login !== "neondb_owner" ||
    Number(identity?.major) !== 18
  )
    fail("NEON_ROTATION_PREFLIGHT_REJECTED", "owner-identity")
  const profiles = (
    await client.query(profileSql, [roles.map(([, role]) => role)])
  ).rows
  // Name the role and attribute (never a value) so an operator can act.
  // Example: enabling Neon Auth grants neon_auth to the database owner, which
  // reports role-profiles:migrator:memberships.
  const reject = (detail) =>
    fail("NEON_ROTATION_PREFLIGHT_REJECTED", `role-profiles:${detail}`)
  if (profiles.length !== roles.length) {
    const missing = roles.find(
      ([, role]) => !profiles.some((profile) => profile?.name === role)
    )
    reject(missing ? `${missing[0]}:missing` : "unexpected")
  }
  for (const [kind, role] of roles) {
    const profile = profiles.find((candidate) => candidate?.name === role)
    if (!profile) reject(`${kind}:missing`)
    if (profile.rolcanlogin !== true) reject(`${kind}:login`)
    for (const flag of [
      "rolsuper",
      "rolbypassrls",
      "rolcreatedb",
      "rolcreaterole",
      "rolreplication",
      "rolinherit",
      "memberships",
    ])
      if (profile[flag] !== false) reject(`${kind}:${flag.replace(/^rol/, "")}`)
  }
}

async function defaultConnect(options) {
  const { Client } = createRequire(
    new URL("../packages/db/package.json", import.meta.url)
  )("pg")
  const client = new Client(options)
  client.on("error", () => {})
  try {
    await client.connect()
  } catch (error) {
    await client.end().catch(() => {})
    throw error
  }
  return client
}

export async function rotateNeonTestCredentials(
  env,
  { directory, connect = defaultConnect } = {}
) {
  const ownerOptions = rotationOwnerOptions(env)
  await assertPrivateDirectory(directory)
  const passwords = generateRolePasswords()
  const contents = privateFiles(passwords)
  const staged = []
  // pending: nothing committed; committed; unconfirmed: COMMIT ack was lost.
  let commit = "pending"
  let client
  const removeStaged = async () => {
    for (const [path] of staged) await rm(path, { force: true }).catch(() => {})
  }
  try {
    try {
      client = await connect(ownerOptions)
      assertVerifiedNeonClient(client)
    } catch {
      fail("NEON_ROTATION_FAILED", "owner-connect")
    }
    await preflight(client)
    for (const name of [files.runtime, files.operator])
      staged.push([
        await stage(join(directory, name), contents[name]),
        join(directory, name),
      ])
    await client.query("BEGIN")
    try {
      await client.query("SET LOCAL statement_timeout = '15s'")
      for (const [kind, role] of roles)
        await client.query(
          `ALTER ROLE ${client.escapeIdentifier(role)} WITH PASSWORD ${client.escapeLiteral(passwords[kind])}`
        )
    } catch {
      await client.query("ROLLBACK").catch(() => {})
      fail("NEON_ROTATION_FAILED", "alter")
    }
    try {
      await client.query("COMMIT")
      commit = "committed"
    } catch {
      commit = "unconfirmed"
    }
  } catch (error) {
    if (commit === "pending") await removeStaged()
    if (error instanceof NeonRotationError) throw error
    fail("NEON_ROTATION_FAILED", "owner-session")
  } finally {
    await client?.end().catch(() => {})
  }
  if (commit === "unconfirmed") {
    // A new login decides: accepted means the server committed; a definite
    // password rejection (28P01) means it did not; anything else is unknown,
    // so both the originals and the staged candidates are kept.
    const [kind, role] = roles[1]
    let login
    try {
      login = await connect(connectionOptions(role, passwords[kind]))
      assertVerifiedNeonClient(login)
      commit = "committed"
    } catch (error) {
      if (error?.code === "28P01") {
        await removeStaged()
        fail("NEON_ROTATION_FAILED", "commit")
      }
      fail("NEON_ROTATION_COMMIT_UNCONFIRMED", "commit")
    } finally {
      await login?.end().catch(() => {})
    }
  }
  // The staged files now hold the only valid credentials for these roles.
  try {
    for (const [from, to] of staged) await rename(from, to)
  } catch {
    fail("NEON_ROTATION_COMMITTED_FILES_PENDING", "replace")
  }
  for (const [kind, role] of roles) {
    let login
    try {
      login = await connect(connectionOptions(role, passwords[kind]))
      assertVerifiedNeonClient(login)
      const identity = (await login.query(identitySql)).rows[0]
      if (
        identity?.role !== role ||
        identity?.login !== role ||
        identity?.database !== target.database
      )
        throw new Error("identity")
    } catch {
      fail("NEON_ROTATION_VERIFY_FAILED", `verify:${kind}`)
    } finally {
      await login?.end().catch(() => {})
    }
  }
  return {
    code: "NEON_ROLE_PASSWORDS_ROTATED",
    roles: roles.length,
    distinct: true,
    verified: true,
  }
}

const isCommand =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isCommand) {
  try {
    if (process.argv.length !== 3) invalid("arguments")
    const result = await rotateNeonTestCredentials(process.env, {
      directory: resolve(process.argv[2]),
    })
    console.log(
      `${result.code} roles=${result.roles} distinct=${result.distinct} verified=${result.verified}`
    )
  } catch (error) {
    const code = /^NEON_[A-Z_]{1,60}$/.test(error?.message ?? "")
      ? error.message
      : "NEON_ROTATION_FAILED"
    const stage = /^[a-z0-9:-]{1,40}$/.test(error?.stage ?? "")
      ? error.stage
      : "unknown"
    console.error(`code=${code} stage=${stage}`)
    process.exitCode = 1
  }
}
