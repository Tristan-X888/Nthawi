import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8")

for (const [surface, directory, output] of [
  ["web", "web", ".next"],
  ["marketing", "marketing", ".next"],
  ["widget", "widget", "dist"],
]) {
  test(`${surface} staging config preserves manual deployment and frozen builds`, async () => {
    const config = await read(`apps/${directory}/netlify.toml`)
    assert.match(config, /ignore\s*=\s*"exit 0"/)
    assert.match(config, /pnpm install --frozen-lockfile/)
    assert.ok(config.includes(`pnpm --filter @nthawi/${surface} build`))
    assert.ok(config.includes(`publish = "apps/${directory}/${output}"`))
    assert.match(config, /NODE_VERSION\s*=\s*"24\.21\.0"/)
    assert.match(config, /PNPM_VERSION\s*=\s*"10\.16\.1"/)
    assert.match(config, /X-Robots-Tag\s*=\s*"noindex, nofollow, noarchive"/)
    assert.match(config, /X-Content-Type-Options\s*=\s*"nosniff"/)
    assert.doesNotMatch(
      config,
      /(?:DATABASE_URL|AUTH_DATABASE_URL|RESEND_API_KEY|OPENAI_API_KEY)\s*=/
    )
    assert.doesNotMatch(
      config,
      /Strict-Transport-Security|https:\/\/(?:www|app|api|widget)\.nthawi\.io/
    )
  })
}

test("only the owner surface signs the two exact API namespaces", async () => {
  const owner = await read("apps/web/netlify.toml")
  for (const route of ["auth", "v1"]) {
    assert.ok(owner.includes(`from = "/api/${route}/*"`))
    assert.ok(
      owner.includes(`to = "https://api-staging.nthawi.io/api/${route}/:splat"`)
    )
  }
  assert.equal(
    (owner.match(/signed = "NETLIFY_PROXY_SIGNING_SECRET"/g) ?? []).length,
    2
  )
  assert.ok(owner.includes('for = "/api/*"'))
  assert.ok(owner.includes('Cache-Control = "private, no-store"'))
  for (const surface of ["marketing", "widget"]) {
    const config = await read(`apps/${surface}/netlify.toml`)
    assert.doesNotMatch(
      config,
      /signed\s*=|\/api\/auth|\/api\/v1|NETLIFY_PROXY_SIGNING_SECRET/
    )
  }
})

test("widget iframe remains embeddable and uncached without owner settings", async () => {
  const config = await read("apps/widget/netlify.toml")
  assert.match(config, /frame-ancestors \*/)
  assert.match(config, /connect-src https:\/\/api-staging\.nthawi\.io/)
  assert.match(config, /Cache-Control\s*=\s*"no-store"/)
  assert.doesNotMatch(
    config,
    /X-Frame-Options|BETTER_AUTH|WEB_ORIGIN|NEXT_PUBLIC_API_URL/
  )
})

test("local Turbo API execution receives the ingress configuration without caching secret values", async () => {
  const config = JSON.parse(await read("turbo.json"))
  const task = config.tasks["@nthawi/api#dev"]
  for (const name of [
    "NETLIFY_PROXY_SIGNING_SECRET",
    "NETLIFY_PROXY_PREVIOUS_SIGNING_SECRET",
    "PROXY_PREVIOUS_KEY_VALID_UNTIL",
    "PROXY_EXPECTED_SITE_URL",
    "PROXY_EXPECTED_NETLIFY_ID",
    "PROXY_EXPECTED_DEPLOY_CONTEXT",
  ])
    assert.ok(
      task.passThroughEnv.includes(name),
      `${name} missing from local API environment`
    )
  assert.equal(task.cache, false)
})
