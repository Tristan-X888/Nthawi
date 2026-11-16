import assert from "node:assert/strict"
import { test } from "node:test"
import { createStagingApiBlueprint } from "./staging-render.mjs"

const artifact = {
  sourceSha: "0123456789abcdef0123456789abcdef01234567",
  imageDigest: `ghcr.io/tristan-x888/nthawi-api@sha256:${"a".repeat(64)}`,
}

test("staging API blueprint is isolated, manual and pinned to an immutable image", () => {
  const blueprint = createStagingApiBlueprint(artifact)
  assert.deepEqual(blueprint.previews, { generation: "off" })
  assert.equal(blueprint.projects.length, 1)
  const [project] = blueprint.projects
  assert.equal(project.name, "nthawi")
  assert.equal(project.environments.length, 1)
  const [environment] = project.environments
  assert.equal(environment.name, "staging")
  assert.deepEqual(environment.networking, { isolation: "enabled" })
  assert.deepEqual(environment.permissions, { protection: "enabled" })
  assert.equal(environment.services.length, 1)
  const [api] = environment.services
  assert.equal(api.name, "nthawi-api-staging")
  assert.equal(api.runtime, "image")
  assert.equal(api.image.url, artifact.imageDigest)
  assert.equal(api.region, "frankfurt")
  assert.equal(api.autoDeployTrigger, "off")
  assert.equal(api.healthCheckPath, "/health/ready")
  assert.equal(api.maxShutdownDelaySeconds, 60)
  assert.equal(api.numInstances, 1)
  assert.deepEqual(api.domains, ["api-staging.nthawi.io"])
  const env = Object.fromEntries(
    api.envVars.map(({ key, ...value }) => [key, value])
  )
  assert.deepEqual(env.NODE_ENV, { value: "production" })
  assert.deepEqual(env.API_TRUST_PROXY, { value: "" })
  assert.deepEqual(env.NTHAWI_SOURCE_SHA, { value: artifact.sourceSha })
  for (const name of [
    "DATABASE_URL",
    "AUTH_DATABASE_URL",
    "NETLIFY_PROXY_SIGNING_SECRET",
  ]) {
    assert.deepEqual(env[name], { sync: false })
  }
  assert.equal(env.MIGRATOR_DATABASE_URL, undefined)
  assert.equal(env.JOBS_DATABASE_URL, undefined)
  assert.equal(blueprint.databases, undefined)
})

test("configuration generation refuses mutable images, unrelated registries and missing source identity", () => {
  for (const imageDigest of [
    "ghcr.io/tristan-x888/nthawi-api:latest",
    "ghcr.io/tristan-x888/nthawi-api:v0.3",
    `ghcr.io/unrelated/api@sha256:${"a".repeat(64)}`,
    `ghcr.io/tristan-x888/nthawi-api@sha256:${"a".repeat(63)}`,
    undefined,
  ]) {
    assert.throws(
      () => createStagingApiBlueprint({ ...artifact, imageDigest }),
      /STAGING_ARTIFACT_INVALID/
    )
  }
  for (const sourceSha of [undefined, "master", "shortsha", "0".repeat(40)]) {
    assert.throws(
      () => createStagingApiBlueprint({ ...artifact, sourceSha }),
      /STAGING_ARTIFACT_INVALID/
    )
  }
})
