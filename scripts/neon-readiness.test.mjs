import assert from "node:assert/strict"
import { test } from "node:test"
import {
  assessProductionConfiguration,
  assessConnectionCapacity,
  assessObservedCapacity,
  expectedMaxConnections,
} from "./neon-readiness.mjs"
import { NEON_TARGETS } from "./neon-targets.mjs"

const now = new Date("2026-11-04T16:00:00Z")
// Mirrors the field layout of GET /projects/{id}, GET /projects/{id}/branches
// and GET /projects/{id}/endpoints as observed on 5 November 2026: the plan is
// the organization owner's subscription, not a top-level project field.
function inventory() {
  const target = NEON_TARGETS.production
  return {
    observedUtc: now.toISOString(),
    project: {
      id: target.projectId,
      org_id: "org-wild-bird-68149107",
      region_id: "aws-eu-west-2",
      pg_version: 18,
      history_retention_seconds: 604800,
      owner: { subscription_type: "launch_v3" },
    },
    branches: [
      {
        id: target.branchId,
        project_id: target.projectId,
        protected: true,
        current_state: "ready",
      },
    ],
    endpoints: [
      {
        project_id: target.projectId,
        branch_id: target.branchId,
        host: target.host,
        type: "read_write",
        region_id: "aws-eu-west-2",
        autoscaling_limit_min_cu: 0.25,
        autoscaling_limit_max_cu: 1,
        suspend_timeout_seconds: -1,
        disabled: false,
        current_state: "active",
      },
    ],
  }
}

const checkResult = (input, name) =>
  assessProductionConfiguration(input, now).checks.find(
    (entry) => entry.name === name
  )?.passed

test("selected production settings can pass metadata without asserting live readiness", () => {
  const result = assessProductionConfiguration(inventory(), now)
  assert.equal(result.productionConfigurationReady, true)
  assert.equal(result.phase4Ready, false)
  const legacy = inventory()
  legacy.project.owner.subscription_type = "launch"
  assert.equal(checkResult(legacy, "launch-plan"), true)
})

test("the plan is read only from the provider owner subscription record", () => {
  const relocated = inventory()
  delete relocated.project.owner
  // A plan value in a field the API does not return must not satisfy the gate.
  relocated.project.subscription_type = "launch_v3"
  assert.equal(checkResult(relocated, "launch-plan"), false)
  const free = inventory()
  free.project.owner.subscription_type = "free_v3"
  assert.equal(checkResult(free, "launch-plan"), false)
})

test("missing, stale, future, duplicate and wrong-target metadata fail closed", () => {
  const mutations = [
    (i) => {
      i.observedUtc = "invalid"
    },
    (i) => {
      i.observedUtc = "2026-11-04T14:59:59Z"
    },
    (i) => {
      i.observedUtc = "2026-11-04T16:00:01Z"
    },
    (i) => {
      i.project.id = "other"
    },
    (i) => {
      i.project.org_id = "other"
    },
    (i) => {
      i.project.owner.subscription_type = "free_v3"
    },
    (i) => {
      i.project.history_retention_seconds = 21600
    },
    (i) => {
      i.project.pg_version = 17
    },
    (i) => {
      i.branches[0].protected = false
    },
    (i) => {
      i.branches[0].current_state = "archived"
    },
    (i) => {
      i.branches.push({ ...i.branches[0] })
    },
    (i) => {
      i.endpoints.push({ ...i.endpoints[0] })
    },
    (i) => {
      i.endpoints[0].host = i.endpoints[0].host.replace(".c-2", "-pooler.c-2")
    },
    (i) => {
      i.endpoints[0].suspend_timeout_seconds = 0
    },
    (i) => {
      i.endpoints[0].autoscaling_limit_max_cu = 2
    },
    (i) => {
      i.endpoints[0].current_state = "idle"
    },
  ]
  for (const mutate of mutations) {
    const input = inventory()
    mutate(input)
    assert.equal(
      assessProductionConfiguration(input, now).productionConfigurationReady,
      false
    )
  }
  assert.equal(
    assessProductionConfiguration({}, now).productionConfigurationReady,
    false
  )
})

test("66 peak requires 88 usable connections for 25 percent unused headroom", () => {
  const assess = (maxConnections) =>
    assessConnectionCapacity({
      maxConnections,
      reservedConnections: 4,
      superuserReservedConnections: 3,
      providerAdditionalReservedConnections: 0,
    })
  assert.equal(assess(104).usable, 97)
  assert.equal(assess(95).passed, true)
  assert.equal(assess(94).passed, false)
  assert.throws(
    () =>
      assessConnectionCapacity({
        maxConnections: 104,
        reservedConnections: 4,
        superuserReservedConnections: 3,
      }),
    /INVALID/
  )
  assert.throws(
    () =>
      assessConnectionCapacity({
        maxConnections: 104,
        reservedConnections: 4,
        superuserReservedConnections: 3,
        providerAdditionalReservedConnections: 0,
        peak: 65,
      }),
    /INVALID/
  )
})

test("max_connections follows Neon's documented autoscaling formula", () => {
  // Examples from neon.com/docs/reference/compatibility (2026-09-17).
  assert.equal(expectedMaxConnections({ minCu: 0.25, maxCu: 0.25 }), 104)
  assert.equal(expectedMaxConnections({ minCu: 0.25, maxCu: 2 }), 839)
  assert.equal(expectedMaxConnections({ minCu: 0.25, maxCu: 4 }), 839)
  assert.equal(expectedMaxConnections({ minCu: 2, maxCu: 8 }), 3357)
  assert.equal(expectedMaxConnections({ minCu: 0.25, maxCu: 1 }), 419)
  assert.throws(
    () => expectedMaxConnections({ minCu: 1, maxCu: 0.25 }),
    /INVALID/
  )
})

test("observed settings are the evidence; the documented formula is reported, not trusted", () => {
  // Observed on the test endpoint configured 0.25-1 CU (2026-11-05 12:28 UTC).
  const observed = {
    maxConnections: 450,
    superuserReservedConnections: 4,
    reservedConnections: 0,
  }
  const result = assessObservedCapacity(observed, { minCu: 0.25, maxCu: 1 })
  assert.equal(result.configuredUsable, 446)
  assert.equal(result.documentedMaxConnections, 419)
  assert.equal(result.matchesDocumentation, false)
  // Conservative Phase 3 rule: the documented fixed 0.25 CU figure,
  // 104 - 7 reserved = 97 usable, must still hold the 66-connection peak.
  assert.equal(result.documentedMinimumSizeUsable, 97)
  assert.equal(result.peak, 66)
  assert.equal(result.passed, true)
  // Exactly 88 usable (92 - 4) keeps 25% unused; 87 (91 - 4) does not.
  assert.equal(
    assessObservedCapacity(
      { ...observed, maxConnections: 92 },
      { minCu: 0.25, maxCu: 1 }
    ).passed,
    true
  )
  assert.equal(
    assessObservedCapacity(
      { ...observed, maxConnections: 91 },
      { minCu: 0.25, maxCu: 1 }
    ).passed,
    false
  )
  assert.equal(
    assessObservedCapacity(
      { ...observed, reservedConnections: 360 },
      { minCu: 0.25, maxCu: 1 }
    ).passed,
    false
  )
  assert.throws(
    () =>
      assessObservedCapacity(
        { ...observed, maxConnections: Number.NaN },
        { minCu: 0.25, maxCu: 1 }
      ),
    /INVALID/
  )
})
