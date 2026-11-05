import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { after, before, test } from "node:test"
import { createDatabaseTestFixture } from "../packages/db/test/helpers/database-fixture.mjs"
import {
  verifyRestrictedProfile,
  verifyRollbackIsolation,
  verifyTenantIsolation,
  verifyTransactionLocalContext,
} from "./neon-live-isolation.mjs"
import {
  cleanupSyntheticFixtures,
  createSyntheticFixtures,
  insertSyntheticFixtures,
} from "./neon-synthetic-fixtures.mjs"

// Local disposable PostgreSQL 18 only (shared loopback guard). The restricted
// roles here receive exactly the grants provisionRuntimeRoles gives Neon's
// nthawi_auth/business/jobs, so the same checks run unchanged on Neon.
const adminUrl = process.env.RLS_TEST_ADMIN_URL
if (!adminUrl)
  throw new Error("RLS_TEST_ADMIN_URL is required for this integration test")

const { Client } = createRequire(
  new URL("../packages/db/package.json", import.meta.url)
)("pg")

let fixture
let synthetic
let admin
let concurrent
const clients = {}

before(async () => {
  fixture = await createDatabaseTestFixture(adminUrl)
  admin = await fixture.pools.admin.connect()
  synthetic = createSyntheticFixtures()
  await insertSyntheticFixtures(admin, synthetic)
  for (const kind of ["business", "auth", "jobs"])
    clients[kind] = await fixture.pools[kind].connect()
  // A second business session proves isolation under concurrent logins.
  concurrent = new Client({ connectionString: fixture.urls.business })
  concurrent.on("error", () => {})
  await concurrent.connect()
  clients.businessConcurrent = concurrent
})

after(async () => {
  for (const [kind, client] of Object.entries(clients))
    if (kind !== "businessConcurrent") client?.release(true)
  await concurrent?.end()
  if (admin && synthetic) await cleanupSyntheticFixtures(admin, synthetic)
  admin?.release(true)
  await fixture?.close()
})

const [first, second] = [0, 1].map((index) => () => synthetic.tenants[index])

test("same-tenant access works and cross-tenant or no-context access does not", async () => {
  await verifyTenantIsolation(clients.business, first(), second())
  // Reusing the same session for the other tenant must not inherit context.
  await verifyTenantIsolation(clients.business, second(), first())
})

test("isolation holds for two tenants on concurrent business sessions", async () => {
  await Promise.all([
    verifyTenantIsolation(clients.business, first(), second()),
    verifyTenantIsolation(clients.businessConcurrent, second(), first()),
  ])
})

test("tenant context is transaction-local and rolled-back writes vanish", async () => {
  await verifyTransactionLocalContext(clients.business, first())
  await verifyRollbackIsolation(clients.business, admin, first())
})

test("auth and jobs roles cannot read any tenant table in any context", async () => {
  await verifyRestrictedProfile(clients.auth, synthetic)
  await verifyRestrictedProfile(clients.jobs, synthetic)
})

test("a leaking policy is detected", async () => {
  await admin.query(
    `ALTER POLICY "messages_tenant_policy" ON public.messages USING (true)`
  )
  try {
    await assert.rejects(
      verifyTenantIsolation(clients.business, first(), second()),
      /NEON_SYNTHETIC_RLS_MISMATCH|NEON_SYNTHETIC_CROSS_WRITE_ALLOWED/
    )
  } finally {
    await admin.query(
      `ALTER POLICY "messages_tenant_policy" ON public.messages USING ("messages"."workspace_id" = app_private.current_workspace_id())`
    )
  }
  await verifyTenantIsolation(clients.business, first(), second())
})
