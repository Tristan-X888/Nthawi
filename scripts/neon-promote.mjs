import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { open, mkdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { NEON_TARGETS, assertVerifiedNeonClient } from "./neon-targets.mjs"
import { readNeonConnections } from "./verify-neon-database.mjs"
import {
  canonicalPromotionJson,
  loadPromotionContract,
  promotionConfirmation,
  verifyPromotionEnvelope,
} from "./neon-promotion-plan.mjs"

const roles = {
  migrator: "nthawi_migrator",
  auth: "nthawi_auth",
  business: "nthawi_business",
  jobs: "nthawi_jobs",
}
const hash = (value) => createHash("sha256").update(value).digest("hex")
const lock = [741206, 180004]
const idPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const shaPattern = /^[a-f0-9]{64}$/
function reject() {
  throw new Error("NEON_PRODUCTION_PROMOTION_REJECTED")
}
function same(a, b) {
  if (canonicalPromotionJson(a) !== canonicalPromotionJson(b)) reject()
}
function fields(value, names) {
  if (!value || typeof value !== "object" || Array.isArray(value)) reject()
  same(Object.keys(value).sort(), names.sort())
}

export function executionConfirmation(authority) {
  return `EXECUTE ${authority.id} ${authority.sourceCommit} ${NEON_TARGETS.production.branchId}`
}

// Explicit fields prevent pg's URL parsing and PGHOST/PGOPTIONS fallbacks from
// replacing the registered target. Passwords never enter command arguments.
export function productionConnectionOptions(environment) {
  if (
    environment.NEON_TARGET !== "production" ||
    environment.NEON_EXPECTED_PROJECT_ID !==
      NEON_TARGETS.production.projectId ||
    environment.NEON_EXPECTED_BRANCH_ID !== NEON_TARGETS.production.branchId ||
    environment.NODE_TLS_REJECT_UNAUTHORIZED === "0"
  )
    reject()
  for (const name of Object.keys(environment))
    if (
      /^PG|^NODE_(?:OPTIONS|EXTRA_CA_CERTS|USE_SYSTEM_CA)$|^(?:SSL_CERT_FILE|SSL_CERT_DIR|OPENSSL_CONF)$/.test(
        name
      ) &&
      environment[name]
    )
      reject()
  // The shared reader also refuses role credentials that share a password.
  // Promotion reports one code for every configuration failure.
  let connections
  try {
    connections = readNeonConnections(environment)
  } catch {
    reject()
  }
  return Object.fromEntries(
    connections.map(({ kind, connectionString }) => {
      const url = new URL(connectionString)
      return [
        kind,
        {
          host: NEON_TARGETS.production.host,
          port: 5432,
          database: NEON_TARGETS.production.database,
          user: roles[kind],
          password: decodeURIComponent(url.password),
          ssl: {
            rejectUnauthorized: true,
            servername: NEON_TARGETS.production.host,
          },
          connectionTimeoutMillis: 10_000,
          query_timeout: 30_000,
          statement_timeout: 30_000,
        },
      ]
    })
  )
}

export function validateExecutionAuthority(
  bytes,
  trustedPublicKey,
  plan,
  receiptBytes,
  confirmation,
  now = Date.now()
) {
  const authority = verifyPromotionEnvelope(bytes, trustedPublicKey)
  fields(authority, [
    "version",
    "id",
    "scope",
    "planId",
    "sourceCommit",
    "artifactSha256",
    "sourceManifestSha256",
    "productionTarget",
    "offlineReceiptSha256",
    "expectedEmptyCatalogSha256",
    "operator",
    "issuedAt",
    "expiresAt",
  ])
  if (
    authority.version !== 1 ||
    !idPattern.test(authority.id) ||
    authority.scope !== "initial-production-migration" ||
    !shaPattern.test(authority.expectedEmptyCatalogSha256) ||
    typeof authority.operator !== "string" ||
    !/^[A-Za-z][A-Za-z0-9 ._-]{1,79}$/.test(authority.operator)
  )
    reject()
  same(authority.planId, plan.id)
  same(authority.sourceCommit, plan.sourceCommit)
  same(authority.artifactSha256, plan.artifactSha256)
  same(authority.sourceManifestSha256, plan.sourceManifestSha256)
  same(authority.productionTarget, plan.target)
  same(authority.offlineReceiptSha256, hash(receiptBytes))
  const issued = Date.parse(authority.issuedAt)
  const expires = Date.parse(authority.expiresAt)
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(issued) ||
    !Number.isFinite(expires) ||
    new Date(issued).toISOString() !== authority.issuedAt ||
    new Date(expires).toISOString() !== authority.expiresAt ||
    issued > now ||
    expires <= now ||
    expires - issued > 15 * 60_000 ||
    confirmation !== executionConfirmation(authority)
  )
    reject()
  const receipt = JSON.parse(receiptBytes.toString("utf8"))
  if (
    receipt.code !== "NEON_PROMOTION_OFFLINE_CHECK_PASSED" ||
    receipt.productionExecutionAvailable !== false ||
    receipt.mode !== "offline-attestation-check"
  )
    reject()
  same(receipt.planId, plan.id)
  same(receipt.sourceCommit, plan.sourceCommit)
  same(receipt.artifactSha256, plan.artifactSha256)
  same(receipt.target, NEON_TARGETS.production.branchId)
  same(
    receipt.evidenceSha256,
    plan.evidence.map((entry) => entry.sha256)
  )
  return authority
}

/** Read-only, transactionally consistent initial-target catalog fingerprint. */
export async function inspectInitialProduction(client) {
  assertVerifiedNeonClient(client)
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
  try {
    await client.query("SET LOCAL statement_timeout = '15s'")
    const identity = (
      await client.query(`SELECT current_database() AS database, current_user AS role, session_user AS login,
      current_setting('server_version_num')::integer / 10000 AS major,
      pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = current_database()`)
    ).rows[0]
    same(identity, {
      database: "neondb",
      role: roles.migrator,
      login: roles.migrator,
      major: 18,
      owner: roles.migrator,
    })
    const profiles = (
      await client.query(
        `SELECT r.rolname AS name, r.rolcanlogin, r.rolsuper, r.rolbypassrls,
      r.rolcreatedb, r.rolcreaterole, r.rolreplication, r.rolinherit,
      EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member = r.oid) AS memberships,
      EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspowner = r.oid AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema') AS owns_schema,
      EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relowner = r.oid AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema') AS owns_objects
      FROM pg_roles r WHERE r.rolname = ANY($1::text[]) ORDER BY r.rolname`,
        [Object.values(roles)]
      )
    ).rows
    if (
      profiles.length !== 4 ||
      profiles.some(
        (r) =>
          !Object.values(roles).includes(r.name) ||
          r.rolcanlogin !== true ||
          [
            "rolsuper",
            "rolbypassrls",
            "rolcreatedb",
            "rolcreaterole",
            "rolreplication",
            "rolinherit",
            "memberships",
          ].some((key) => r[key] !== false) ||
          (r.name !== roles.migrator &&
            (r.owns_schema !== false || r.owns_objects !== false))
      )
    )
      reject()
    const schemas = (
      await client.query(`SELECT nspname AS name, pg_get_userbyid(nspowner) AS owner, nspacl::text AS acl FROM pg_namespace
      WHERE nspname !~ '^pg_' AND nspname <> 'information_schema' ORDER BY nspname`)
    ).rows
    if (
      schemas.length !== 1 ||
      schemas[0].name !== "public" ||
      schemas[0].owner !== "pg_database_owner"
    )
      reject()
    const objects = (
      await client.query(`SELECT 'relation' AS kind, n.nspname AS schema, c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
      UNION ALL SELECT 'function', n.nspname, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
      UNION ALL SELECT 'type', n.nspname, t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND t.typcategory <> 'A' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_type'::regclass AND d.objid=t.oid AND d.deptype='e') ORDER BY kind, schema, name`)
    ).rows
    if (objects.length !== 0) reject()
    const auxiliary = (
      await client.query(`SELECT
      EXISTS (SELECT 1 FROM pg_largeobject_metadata) AS large_objects,
      EXISTS (SELECT 1 FROM pg_publication) AS publications,
      EXISTS (SELECT 1 FROM pg_subscription WHERE subdbid = (SELECT oid FROM pg_database WHERE datname = current_database())) AS subscriptions,
      EXISTS (SELECT 1 FROM pg_event_trigger) AS event_triggers`)
    ).rows[0]
    same(auxiliary, {
      large_objects: false,
      publications: false,
      subscriptions: false,
      event_triggers: false,
    })
    const extensions = (
      await client.query(
        `SELECT e.extname AS name, e.extversion AS version, n.nspname AS schema FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace ORDER BY e.extname`
      )
    ).rows
    if (
      !extensions.some(
        (entry) => entry.name === "vector" && entry.schema === "public"
      )
    )
      reject()
    if (
      (
        await client.query(
          "SELECT vector_dims(array_fill(0::real, ARRAY[1536])::vector(1536)) = 1536 AS valid"
        )
      ).rows[0]?.valid !== true
    )
      reject()
    const observation = {
      identity,
      profiles,
      schemas,
      objects,
      extensions,
      appliedMigrations: [],
      auxiliary,
    }
    return {
      fingerprint: hash(canonicalPromotionJson(observation)),
      observation,
    }
  } finally {
    await client.query("ROLLBACK")
  }
}

async function productionDependencies(repositoryRoot) {
  const require = createRequire(
    path.join(repositoryRoot, "packages", "db", "package.json")
  )
  const { Client } = require("pg")
  const { drizzle } = require("drizzle-orm/node-postgres")
  const { migrate } = require("drizzle-orm/node-postgres/migrator")
  const { provisionRuntimeRoles } =
    await import("../packages/db/scripts/role-profiles.mjs")
  const { probeDatabase } = await import("../packages/db/dist/index.js")
  return {
    connect: async (options) => {
      const client = new Client(options)
      client.on("error", () => {})
      try {
        await client.connect()
      } catch (error) {
        try {
          await client.end()
        } catch {}
        throw error
      }
      return client
    },
    inspect: inspectInitialProduction,
    migrate: (client) =>
      migrate(drizzle(client), {
        migrationsFolder: path.join(
          repositoryRoot,
          "packages",
          "db",
          "drizzle"
        ),
      }),
    provision: async (client) => {
      await client.query("BEGIN")
      try {
        await provisionRuntimeRoles(client, roles)
        await client.query("COMMIT")
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      }
    },
    verify: async (client, configs, plan) => {
      const applied = (
        await client.query(
          "SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id"
        )
      ).rows
      same(
        applied.map((entry) => ({
          sha256: entry.hash,
          createdAt: Number(entry.created_at),
        })),
        plan.migrations.map(({ sha256, createdAt }) => ({ sha256, createdAt }))
      )
      for (const kind of ["auth", "business"]) {
        const runtime = new Client(configs[kind])
        runtime.on("error", () => {})
        try {
          await runtime.connect()
          assertVerifiedNeonClient(runtime)
          // probeDatabase owns a single acquisition and releases it; this
          // adapter preserves that client and closes it in the outer finally.
          runtime.release = () => {}
          await probeDatabase({ pool: { connect: async () => runtime } }, kind)
        } finally {
          await runtime.end()
        }
      }
    },
  }
}

/** No connection in check mode. Execute is intentionally initial-empty only. */
export async function runProductionPromotion(options, dependencies) {
  const {
    mode,
    environment,
    repositoryRoot,
    auditDirectory,
    now = Date.now(),
  } = options
  if (!["check", "execute"].includes(mode)) reject()
  const configs = productionConnectionOptions(environment)
  const checked = await (dependencies?.loadContract ?? loadPromotionContract)({
    ...options,
    confirmation: options.planConfirmation,
    now,
  })
  const { plan } = checked
  // The execution authority cannot be inferred from the readiness receipt.
  const [authorityBytes, receiptBytes, publicKey] = await Promise.all([
    readFile(options.authorizationPath),
    readFile(options.receiptPath),
    readFile(options.trustedPublicKeyPath),
  ])
  const authority = validateExecutionAuthority(
    authorityBytes,
    publicKey,
    plan,
    receiptBytes,
    options.confirmation,
    now
  )
  if (mode === "check")
    return {
      code: "NEON_PRODUCTION_PROMOTION_CHECK_PASSED",
      planId: plan.id,
      connected: false,
      executed: false,
    }
  await mkdir(auditDirectory, { recursive: true })
  const audit = await open(
    path.join(auditDirectory, `${authority.id}.jsonl`),
    "wx",
    0o600
  )
  const event = async (state) => {
    await audit.writeFile(
      JSON.stringify({
        code: `NEON_PRODUCTION_PROMOTION_${state}`,
        authorizationId: authority.id,
        planId: plan.id,
        sourceCommit: plan.sourceCommit,
        target: NEON_TARGETS.production.branchId,
        utc: new Date().toISOString(),
      }) + "\n"
    )
    await audit.sync()
  }
  let client
  let locked = false
  let completed = false
  try {
    await event("STARTED")
    const deps = dependencies ?? (await productionDependencies(repositoryRoot))
    client = await deps.connect(configs.migrator)
    assertVerifiedNeonClient(client)
    locked =
      (
        await client.query(
          "SELECT pg_try_advisory_lock($1, $2) AS locked",
          lock
        )
      ).rows[0]?.locked === true
    if (!locked) reject()
    const current = await deps.inspect(client)
    same(current.fingerprint, authority.expectedEmptyCatalogSha256)
    // Re-read source/artifact and signatures after acquiring the DB lock.
    const recheckTime = dependencies?.now?.() ?? Date.now()
    await (dependencies?.loadContract ?? loadPromotionContract)({
      ...options,
      confirmation: options.planConfirmation,
      now: recheckTime,
    })
    if (recheckTime >= Date.parse(authority.expiresAt)) reject()
    await event("PREFLIGHT_PASSED")
    await deps.migrate(client)
    await event("MIGRATIONS_APPLIED")
    await deps.provision(client)
    await deps.verify(client, configs, plan)
    await event("COMPLETED")
    completed = true
    return {
      code: "NEON_PRODUCTION_PROMOTION_COMPLETED",
      planId: plan.id,
      executed: true,
    }
  } catch {
    await event("FAILED")
    reject()
  } finally {
    let cleanupFailed = false
    if (client) {
      // A failed batch can leave an aborted transaction. No destructive retry.
      if (!completed) {
        try {
          await client.query("ROLLBACK")
        } catch {}
      }
      if (locked) {
        try {
          await client.query("SELECT pg_advisory_unlock($1, $2)", lock)
        } catch {}
      }
      try {
        await client.end()
      } catch {
        cleanupFailed = true
      }
    }
    try {
      if (cleanupFailed) await event("CLEANUP_FAILED")
    } finally {
      await audit.close()
    }
    if (cleanupFailed) reject()
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2)
    const names = [
      "--plan",
      "--trust-key",
      "--authorization",
      "--receipt",
      "--artifact",
      "--audit-directory",
      "--plan-confirmation",
      "--confirmation",
    ]
    if (
      args.length !== 17 ||
      !["--check", "--execute"].includes(args[0]) ||
      names.some((name, index) => args[index * 2 + 1] !== name)
    )
      reject()
    const result = await runProductionPromotion({
      mode: args[0].slice(2),
      planPath: args[2],
      trustedPublicKeyPath: args[4],
      authorizationPath: args[6],
      receiptPath: args[8],
      artifactPath: args[10],
      auditDirectory: args[12],
      planConfirmation: args[14],
      confirmation: args[16],
      environment: process.env,
      repositoryRoot: fileURLToPath(new URL("../", import.meta.url)),
    })
    process.stdout.write(JSON.stringify(result) + "\n")
  } catch {
    process.stderr.write("NEON_PRODUCTION_PROMOTION_REJECTED\n")
    process.exitCode = 1
  }
}
