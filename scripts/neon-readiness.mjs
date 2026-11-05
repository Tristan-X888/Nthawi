import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import {
  NEON_TARGETS,
  assertNeonTestEnvironment,
  neonTestConnectionOptions,
  withVerifiedNeonClient,
} from "./neon-targets.mjs"

// Neon sets max_connections from the configured autoscaling range
// (neon.com/docs/reference/compatibility, updated 2026-09-17).
export function expectedMaxConnections({ minCu, maxCu }) {
  if (
    ![minCu, maxCu].every(
      (value) => typeof value === "number" && Number.isFinite(value)
    ) ||
    minCu < 0.25 ||
    minCu > maxCu
  )
    throw new Error("NEON_CAPACITY_EVIDENCE_INVALID")
  const computeSize = Math.min(maxCu, 8 * minCu)
  return Math.max(100, Math.min(4000, Math.floor(computeSize * 419.66)))
}

// Documented superuser reservation (neon.com/docs/reference/compatibility).
const documentedSuperuserReservedConnections = 7

/**
 * The observed settings on a compute started with the configured range are
 * the evidence. Neon's documented formula is reported for comparison only:
 * on 2026-11-05 (compute release 15949) a 0.25-1 CU compute reported
 * max_connections 450 and superuser_reserved_connections 4, not the
 * documented 419 and 7. The conservative Phase 3 rule is also kept: the
 * documented fixed 0.25 CU figure (104 - 7 = 97 usable) must hold the peak.
 */
export function assessObservedCapacity(
  { maxConnections, superuserReservedConnections, reservedConnections },
  { minCu, maxCu },
  peak = 66
) {
  const documented = expectedMaxConnections({ minCu, maxCu })
  const configured = assessConnectionCapacity({
    maxConnections,
    reservedConnections,
    superuserReservedConnections,
    providerAdditionalReservedConnections: 0,
    peak,
  })
  const minimum = assessConnectionCapacity({
    maxConnections: expectedMaxConnections({ minCu, maxCu: minCu }),
    reservedConnections: 0,
    superuserReservedConnections: documentedSuperuserReservedConnections,
    providerAdditionalReservedConnections: 0,
    peak,
  })
  return {
    peak,
    minCu,
    maxCu,
    observedMaxConnections: maxConnections,
    superuserReservedConnections,
    reservedConnections,
    configuredUsable: configured.usable,
    configuredUnusedPercent: Number(
      configured.unusedCapacityPercent.toFixed(2)
    ),
    documentedMaxConnections: documented,
    matchesDocumentation: maxConnections === documented,
    documentedMinimumSizeUsable: minimum.usable,
    documentedMinimumSizeUnusedPercent: Number(
      minimum.unusedCapacityPercent.toFixed(2)
    ),
    passed: configured.passed && minimum.passed,
  }
}

/** Reads settings only, as the restricted business role, over verified TLS. */
export async function readTestConnectionSettings(env) {
  assertNeonTestEnvironment(env)
  const { Pool } = createRequire(
    new URL("../packages/db/package.json", import.meta.url)
  )("pg")
  const pool = new Pool({
    ...neonTestConnectionOptions(env, "DATABASE_URL"),
    max: 1,
    statement_timeout: 10_000,
  })
  pool.on("error", () => {})
  try {
    return await withVerifiedNeonClient(pool, async (client) => {
      const read = async (name) =>
        Number((await client.query(`SHOW ${name}`)).rows[0]?.[name])
      return {
        maxConnections: await read("max_connections"),
        superuserReservedConnections: await read(
          "superuser_reserved_connections"
        ),
        reservedConnections: await read("reserved_connections"),
      }
    })
  } finally {
    await pool.end()
  }
}

// This evaluates provider metadata only. It never opens a database connection,
// retrieves credentials or substitutes for migration, isolation or restore proof.
export function assessProductionConfiguration(inventory, now = new Date()) {
  const target = NEON_TARGETS.production
  const { project, branches, endpoints, observedUtc } = inventory ?? {}
  const observed = Date.parse(observedUtc)
  const age = now.getTime() - observed
  const checks = []
  const check = (name, passed) => checks.push({ name, passed: passed === true })
  check("fresh-metadata", Number.isFinite(age) && age >= 0 && age <= 3_600_000)
  check("project", project?.id === target.projectId)
  check("organization", project?.org_id === "org-wild-bird-68149107")
  check("region", project?.region_id === "aws-eu-west-2")
  check("postgres-18", project?.pg_version === 18)
  // GET /projects/{id} reports the plan as the owning organization's
  // subscription. Both values are current BillingSubscriptionType enums.
  check(
    "launch-plan",
    ["launch", "launch_v3"].includes(project?.owner?.subscription_type)
  )
  check(
    "seven-day-history-configured",
    project?.history_retention_seconds === 604800
  )
  const matches = (Array.isArray(branches) ? branches : []).filter(
    (branch) =>
      branch.id === target.branchId && branch.project_id === target.projectId
  )
  check("one-production-branch", matches.length === 1)
  const branch = matches.length === 1 ? matches[0] : undefined
  check("production-protected", branch?.protected === true)
  check("production-not-archived", branch?.current_state === "ready")
  const computes = (Array.isArray(endpoints) ? endpoints : []).filter(
    (endpoint) =>
      endpoint.branch_id === target.branchId && endpoint.type === "read_write"
  )
  check("one-production-writer", computes.length === 1)
  const compute = computes.length === 1 ? computes[0] : undefined
  check(
    "exact-direct-endpoint",
    compute?.project_id === target.projectId && compute?.host === target.host
  )
  check("compute-region", compute?.region_id === "aws-eu-west-2")
  check(
    "autoscaling-range",
    compute?.autoscaling_limit_min_cu === 0.25 &&
      compute?.autoscaling_limit_max_cu === 1
  )
  // 0 is Neon's default timeout. Only -1 means automatic suspension disabled.
  check("scale-to-zero-disabled", compute?.suspend_timeout_seconds === -1)
  check(
    "compute-available",
    compute?.disabled === false && compute?.current_state === "active"
  )
  return {
    evidenceKind: "provider-metadata-only",
    observedUtc,
    target: { ...target },
    checks,
    productionConfigurationReady: checks.every((entry) => entry.passed),
    phase4Ready: false,
    stillRequires: [
      "authorized isolated migration rehearsal and runtime acceptance",
      "synthetic tenant isolation and cleanup",
      "complete privileged export, deletion barrier and restored comparison",
      "observed capacity at the selected minimum compute",
      "usable recovery history, reviewed promotion and repository acceptance",
    ],
  }
}

export function assessConnectionCapacity({
  maxConnections,
  reservedConnections,
  superuserReservedConnections,
  providerAdditionalReservedConnections,
  peak = 66,
}) {
  const values = [
    maxConnections,
    reservedConnections,
    superuserReservedConnections,
    providerAdditionalReservedConnections,
    peak,
  ]
  if (
    values.some((value) => !Number.isSafeInteger(value) || value < 0) ||
    maxConnections === 0 ||
    peak < 66
  ) {
    throw new Error("NEON_CAPACITY_EVIDENCE_INVALID")
  }
  // Provider additional means ONLY reservations not already represented by the
  // two PostgreSQL settings. The operator must reconcile these explicitly.
  const usable =
    maxConnections -
    reservedConnections -
    superuserReservedConnections -
    providerAdditionalReservedConnections
  if (usable <= 0) throw new Error("NEON_CAPACITY_EVIDENCE_INVALID")
  return {
    peak,
    usable,
    unusedCapacityPercent: ((usable - peak) / usable) * 100,
    passed: peak * 4 <= usable * 3,
  }
}

const isCommand =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isCommand) {
  const args = process.argv.slice(2)
  if (args[0] === "--capacity") {
    // node scripts/neon-readiness.mjs --capacity <minCu> <maxCu>, test target only.
    try {
      if (args.length !== 3) throw new Error("NEON_CAPACITY_ARGUMENTS_INVALID")
      const range = { minCu: Number(args[1]), maxCu: Number(args[2]) }
      const settings = await readTestConnectionSettings(process.env)
      const result = {
        evidenceKind: "live-settings-test-target",
        observedUtc: new Date().toISOString(),
        target: { ...NEON_TARGETS.test },
        ...assessObservedCapacity(settings, range),
      }
      console.log(JSON.stringify(result, null, 2))
      if (!result.passed) process.exitCode = 2
    } catch (error) {
      console.error(
        /^NEON_[A-Z_]+$/.test(error?.message ?? "")
          ? error.message
          : "NEON_CAPACITY_CHECK_FAILED"
      )
      process.exitCode = 1
    }
  } else {
    try {
      if (args.length !== 1) throw new Error("NEON_METADATA_ARGUMENTS_INVALID")
      const inventory = JSON.parse(await readFile(args[0], "utf8"))
      const result = assessProductionConfiguration(inventory)
      console.log(JSON.stringify(result, null, 2))
      if (!result.productionConfigurationReady) process.exitCode = 2
    } catch {
      console.error("NEON_METADATA_CHECK_FAILED")
      process.exitCode = 1
    }
  }
}
