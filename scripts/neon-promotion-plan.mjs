import { createHash, createPublicKey, verify } from "node:crypto"
import { execFileSync } from "node:child_process"
import { createReadStream } from "node:fs"
import { mkdir, open, readFile, readdir, unlink } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { NEON_TARGETS } from "./neon-targets.mjs"

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex")
const shaPattern = /^[a-f0-9]{64}$/
const sourcePattern = /^[a-f0-9]{40}$/
const roles = Object.freeze({
  migrator: "nthawi_migrator",
  auth: "nthawi_auth",
  business: "nthawi_business",
  jobs: "nthawi_jobs",
})
const evidenceKinds = [
  "isolated-rehearsal",
  "production-preflight",
  "recovery-round-trip",
]
const target = Object.freeze({
  environment: "production",
  ...NEON_TARGETS.production,
  port: 5432,
  postgresMajor: 18,
  tls: "verify-full",
  pooled: false,
})

function reject() {
  throw new Error("NEON_PROMOTION_PLAN_REJECTED")
}

// Stable JSON bytes are the signing contract. No credential fields are accepted.
export function canonicalPromotionJson(value) {
  if (Array.isArray(value))
    return `[${value.map(canonicalPromotionJson).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalPromotionJson(value[key])}`
      )
      .join(",")}}`
  }
  if (value === null || ["string", "boolean"].includes(typeof value))
    return JSON.stringify(value)
  if (typeof value === "number" && Number.isFinite(value))
    return JSON.stringify(value)
  reject()
}

function equal(actual, expected) {
  if (canonicalPromotionJson(actual) !== canonicalPromotionJson(expected))
    reject()
}

function keys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) reject()
  equal(Object.keys(value).sort(), [...expected].sort())
}

function time(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
  )
    reject()
  const result = Date.parse(value)
  if (!Number.isFinite(result) || new Date(result).toISOString() !== value)
    reject()
  return result
}

export function promotionConfirmation(plan) {
  return `CHECK ${plan.id} ${plan.sourceCommit} ${NEON_TARGETS.production.branchId}`
}

// Inspect checked-out source only. Git never reads private environment files.
export async function readPromotionSource(repositoryRoot) {
  const root = path.resolve(repositoryRoot)
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim()
  const sourceCommit = git("rev-parse", "HEAD")
  if (!sourcePattern.test(sourceCommit)) reject()
  // Untracked .anchor/ remains untouched; changed tracked source is rejected.
  if (git("status", "--porcelain=v1", "--untracked-files=no")) reject()
  const db = path.join(root, "packages", "db")
  const journal = JSON.parse(
    await readFile(path.join(db, "drizzle", "meta", "_journal.json"), "utf8")
  )
  if (!Array.isArray(journal.entries) || journal.entries.length === 0) reject()
  const sources = {}
  const migrations = []
  let previousTime = -1
  for (const [index, entry] of journal.entries.entries()) {
    if (
      entry.idx !== index ||
      !/^\d{4}_[a-z0-9_]+$/.test(entry.tag) ||
      !Number.isSafeInteger(entry.when) ||
      entry.when <= previousTime
    )
      reject()
    previousTime = entry.when
    const name = `drizzle/${entry.tag}.sql`
    sources[name] = sha256(await readFile(path.join(db, name)))
    migrations.push({
      name: entry.tag,
      createdAt: entry.when,
      sha256: sources[name],
    })
    const snapshot = `drizzle/meta/${String(index).padStart(4, "0")}_snapshot.json`
    sources[snapshot] = sha256(await readFile(path.join(db, snapshot)))
  }
  sources["drizzle/meta/_journal.json"] = sha256(
    await readFile(path.join(db, "drizzle", "meta", "_journal.json"))
  )
  for (const name of (await readdir(path.join(db, "src", "schema")))
    .filter((name) => name.endsWith(".ts"))
    .sort()) {
    sources[`src/schema/${name}`] = sha256(
      await readFile(path.join(db, "src", "schema", name))
    )
  }
  for (const name of [
    "src/schema-manifest.ts",
    "scripts/provision-runtime.mjs",
    "scripts/role-profiles.mjs",
  ]) {
    sources[name] = sha256(await readFile(path.join(db, name)))
  }
  const compiledFiles = async (relative) => {
    for (const entry of (
      await readdir(path.join(db, relative), { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = `${relative}/${entry.name}`
      if (entry.isSymbolicLink()) reject()
      if (entry.isDirectory()) await compiledFiles(name)
      else if (entry.isFile() && entry.name.endsWith(".js"))
        sources[name] = sha256(await readFile(path.join(db, name)))
    }
  }
  await compiledFiles("dist")
  if (!sources["dist/index.js"]) reject()
  // Pin exact role/grant and target definitions as well as schema inputs.
  sources["../../../scripts/neon-targets.mjs"] = sha256(
    await readFile(path.join(root, "scripts", "neon-targets.mjs"))
  )
  return {
    sourceCommit,
    migrations,
    sourceManifestSha256: sha256(canonicalPromotionJson(sources)),
  }
}

export function verifyPromotionEnvelope(bytes, trustedPublicKey) {
  let envelope
  try {
    envelope = JSON.parse(bytes.toString("utf8"))
  } catch {
    reject()
  }
  keys(envelope, ["payload", "signature"])
  if (
    typeof envelope.signature !== "string" ||
    !/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature)
  )
    reject()
  const key = createPublicKey(trustedPublicKey)
  if (
    key.asymmetricKeyType !== "ed25519" ||
    !verify(
      null,
      Buffer.from(canonicalPromotionJson(envelope.payload)),
      key,
      Buffer.from(envelope.signature, "base64")
    )
  )
    reject()
  return envelope.payload
}

/**
 * Offline verification of operator attestations, never proof that SQL ran.
 * A separately trusted key authenticates evidence; a key embedded in the plan
 * would let a plan author manufacture their own prerequisites.
 */
export function validatePromotionPlan(
  plan,
  context,
  evidenceBytes,
  trustedPublicKey,
  confirmation,
  now = Date.now()
) {
  keys(plan, [
    "version",
    "id",
    "sourceCommit",
    "artifactSha256",
    "sourceManifestSha256",
    "target",
    "roles",
    "migrations",
    "approval",
    "evidence",
  ])
  if (
    plan.version !== 1 ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      plan.id
    ) ||
    !sourcePattern.test(plan.sourceCommit) ||
    !shaPattern.test(plan.artifactSha256) ||
    !shaPattern.test(plan.sourceManifestSha256)
  )
    reject()
  equal(plan.target, target)
  equal(plan.roles, roles)
  equal(plan.sourceCommit, context.sourceCommit)
  equal(plan.artifactSha256, context.artifactSha256)
  equal(plan.sourceManifestSha256, context.sourceManifestSha256)
  equal(plan.migrations, context.migrations)
  if (confirmation !== promotionConfirmation(plan)) reject()
  keys(plan.approval, ["scope", "operator", "issuedAt", "expiresAt"])
  if (
    plan.approval.scope !== "production-promotion-readiness-only" ||
    typeof plan.approval.operator !== "string" ||
    !/^[A-Za-z][A-Za-z0-9 ._-]{1,79}$/.test(plan.approval.operator)
  )
    reject()
  const issued = time(plan.approval.issuedAt)
  const expires = time(plan.approval.expiresAt)
  if (
    !Number.isFinite(now) ||
    issued > now ||
    expires <= now ||
    expires - issued > 60 * 60_000
  )
    reject()
  if (
    !Array.isArray(plan.evidence) ||
    plan.evidence.length !== evidenceKinds.length ||
    evidenceBytes.length !== evidenceKinds.length
  )
    reject()
  for (const [index, kind] of evidenceKinds.entries()) {
    const reference = plan.evidence[index]
    keys(reference, ["kind", "file", "sha256"])
    if (
      reference.kind !== kind ||
      typeof reference.file !== "string" ||
      !/^[a-z0-9][a-z0-9._-]*\.json$/.test(reference.file) ||
      !shaPattern.test(reference.sha256) ||
      sha256(evidenceBytes[index]) !== reference.sha256
    )
      reject()
    const payload = verifyPromotionEnvelope(
      evidenceBytes[index],
      trustedPublicKey
    )
    keys(payload, [
      "version",
      "kind",
      "planId",
      "sourceCommit",
      "artifactSha256",
      "sourceManifestSha256",
      "productionTarget",
      "migrations",
      "roles",
      "approval",
      "issuedAt",
      "expiresAt",
      "result",
      "details",
    ])
    equal(payload.version, 1)
    equal(payload.kind, kind)
    equal(payload.planId, plan.id)
    equal(payload.sourceCommit, plan.sourceCommit)
    equal(payload.artifactSha256, plan.artifactSha256)
    equal(payload.sourceManifestSha256, plan.sourceManifestSha256)
    equal(payload.productionTarget, target)
    equal(payload.migrations, plan.migrations)
    equal(payload.roles, roles)
    equal(payload.approval, plan.approval)
    equal(payload.result, "passed")
    const observed = time(payload.issuedAt)
    const evidenceExpiry = time(payload.expiresAt)
    // Production state is ephemeral: fresh read-only observation is mandatory.
    const maxAge =
      kind === "production-preflight" ? 15 * 60_000 : 24 * 60 * 60_000
    if (
      observed > now ||
      now - observed > maxAge ||
      evidenceExpiry <= now ||
      evidenceExpiry - observed > maxAge
    )
      reject()
    if (kind === "isolated-rehearsal") {
      keys(payload.details, [
        "target",
        "syntheticOnly",
        "migrationChecksums",
        "runtimeRoles",
        "forcedRls",
        "compiledApi",
        "cleanup",
      ])
      equal(payload.details, {
        target: NEON_TARGETS.test,
        syntheticOnly: true,
        migrationChecksums: "passed",
        runtimeRoles: "passed",
        forcedRls: "passed",
        compiledApi: "passed",
        cleanup: "passed",
      })
    } else if (kind === "production-preflight") {
      keys(payload.details, [
        "readOnly",
        "postgresMajor",
        "appliedMigrations",
        "schemaDrift",
        "roleProfiles",
        "tls",
        "protected",
        "plan",
        "historySeconds",
        "minCu",
        "maxCu",
        "suspendTimeoutSeconds",
        "usableConnections",
      ])
      const { appliedMigrations, usableConnections } = payload.details
      if (
        !Array.isArray(appliedMigrations) ||
        appliedMigrations.length > plan.migrations.length ||
        !Number.isSafeInteger(usableConnections) ||
        usableConnections < 88
      )
        reject()
      equal(
        appliedMigrations,
        plan.migrations.slice(0, appliedMigrations.length)
      )
      equal(payload.details, {
        readOnly: true,
        postgresMajor: 18,
        appliedMigrations,
        schemaDrift: "none",
        roleProfiles: "passed",
        tls: "verify-full",
        protected: true,
        plan: "Launch",
        historySeconds: 604800,
        minCu: 0.25,
        maxCu: 1,
        suspendTimeoutSeconds: -1,
        usableConnections,
      })
    } else {
      keys(payload.details, [
        "dumpSha256",
        "manifestSha256",
        "rolesCaptureSha256",
        "restoredTargetId",
        "twoTenantCoverage",
        "sameSnapshotBarrier",
        "restoredManifest",
        "cleanup",
      ])
      for (const field of [
        "dumpSha256",
        "manifestSha256",
        "rolesCaptureSha256",
      ])
        if (!shaPattern.test(payload.details[field])) reject()
      if (
        typeof payload.details.restoredTargetId !== "string" ||
        !/^br-[a-z0-9-]+$/.test(payload.details.restoredTargetId) ||
        [target.branchId, NEON_TARGETS.test.branchId].includes(
          payload.details.restoredTargetId
        )
      )
        reject()
      for (const field of [
        "twoTenantCoverage",
        "sameSnapshotBarrier",
        "restoredManifest",
        "cleanup",
      ])
        if (payload.details[field] !== "passed") reject()
    }
  }
  return {
    code: "NEON_PROMOTION_OFFLINE_CHECK_PASSED",
    planId: plan.id,
    sourceCommit: plan.sourceCommit,
    artifactSha256: plan.artifactSha256,
    target: target.branchId,
    evidenceSha256: plan.evidence.map((entry) => entry.sha256),
    mode: "offline-attestation-check",
    productionExecutionAvailable: false,
  }
}

async function boundedRead(filename) {
  const handle = await open(filename, "r")
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > 1024 * 1024) reject()
    return await handle.readFile()
  } finally {
    await handle.close()
  }
}

export async function loadPromotionContract({
  planPath,
  artifactPath,
  trustedPublicKeyPath,
  confirmation,
  repositoryRoot,
  now = Date.now(),
}) {
  const plan = JSON.parse((await boundedRead(planPath)).toString("utf8"))
  if (
    !Array.isArray(plan.evidence) ||
    plan.evidence.length !== evidenceKinds.length
  )
    reject()
  // Validate basename references before opening them; no path traversal or URLs.
  for (const entry of plan.evidence)
    if (
      !entry ||
      typeof entry.file !== "string" ||
      !/^[a-z0-9][a-z0-9._-]*\.json$/.test(entry.file)
    )
      reject()
  const evidence = await Promise.all(
    plan.evidence.map((entry) =>
      boundedRead(path.join(path.dirname(planPath), entry.file))
    )
  )
  const artifactHash = createHash("sha256")
  for await (const chunk of createReadStream(artifactPath))
    artifactHash.update(chunk)
  const context = {
    ...(await readPromotionSource(repositoryRoot)),
    artifactSha256: artifactHash.digest("hex"),
  }
  const result = validatePromotionPlan(
    plan,
    context,
    evidence,
    await boundedRead(trustedPublicKeyPath),
    confirmation,
    now
  )
  return { plan, context, result }
}

export async function checkPromotionFile(options) {
  const { plan, result } = await loadPromotionContract(options)
  const { auditDirectory, now = Date.now() } = options
  await mkdir(auditDirectory, { recursive: true })
  const receipt = path.join(auditDirectory, `${plan.id}.json`)
  const lockPath = path.join(auditDirectory, `${plan.id}.lock`)
  let lock
  try {
    lock = await open(lockPath, "wx", 0o600)
    // A consumed plan cannot be reused. This local check lock is deliberately
    // not represented as a database migration/advisory lock.
    const output = await open(receipt, "wx", 0o600)
    try {
      await output.writeFile(
        JSON.stringify(
          { ...result, checkedAt: new Date(now).toISOString() },
          null,
          2
        ) + "\n"
      )
      await output.sync()
    } finally {
      await output.close()
    }
  } finally {
    if (lock) {
      await lock.close()
      await unlink(lockPath)
    }
  }
  return result
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2)
    if (
      args.length !== 10 ||
      args[0] !== "--check" ||
      args[2] !== "--trust-key" ||
      args[4] !== "--confirmation" ||
      args[6] !== "--audit-directory" ||
      args[8] !== "--artifact"
    )
      reject()
    const result = await checkPromotionFile({
      planPath: args[1],
      trustedPublicKeyPath: args[3],
      confirmation: args[5],
      auditDirectory: args[7],
      artifactPath: args[9],
      repositoryRoot: fileURLToPath(new URL("../", import.meta.url)),
    })
    process.stdout.write(JSON.stringify(result) + "\n")
  } catch {
    process.stderr.write("NEON_PROMOTION_PLAN_REJECTED\n")
    process.exitCode = 1
  }
}
