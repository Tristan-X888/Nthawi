import assert from "node:assert/strict"
import { test } from "node:test"
import { loadServerEnv } from "../src/env.ts"

function environment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    WEB_ORIGIN: "https://app-staging.example.test",
    WIDGET_ORIGIN: "https://widget-staging.example.test",
    DATABASE_URL: "postgresql://business:synthetic@localhost/test",
    AUTH_DATABASE_URL: "postgresql://auth:synthetic@localhost/test",
    BETTER_AUTH_SECRET: "synthetic-auth-secret-longer-than-32-characters",
    BETTER_AUTH_URL: "https://app-staging.example.test",
    GOOGLE_CLIENT_ID: "synthetic",
    GOOGLE_CLIENT_SECRET: "synthetic",
    RESEND_API_KEY: "synthetic",
    EMAIL_FROM: "test@example.test",
    OPENAI_API_KEY: "synthetic",
  }
}

const proxyConfiguration = {
  NETLIFY_PROXY_SIGNING_SECRET:
    "synthetic-proxy-secret-longer-than-32-characters",
  PROXY_EXPECTED_SITE_URL: "https://owner-staging.netlify.app",
  PROXY_EXPECTED_NETLIFY_ID: "synthetic-owner-site",
  PROXY_EXPECTED_DEPLOY_CONTEXT: "production",
}

test("deployed and local signed configurations accept the complete interface", () => {
  assert.doesNotThrow(() =>
    loadServerEnv({ ...environment(), ...proxyConfiguration })
  )
  assert.doesNotThrow(() =>
    loadServerEnv({ ...environment(), NODE_ENV: "test" })
  )
  assert.doesNotThrow(() =>
    loadServerEnv({ ...environment(), NODE_ENV: "test", ...proxyConfiguration })
  )
})

for (const field of Object.keys(proxyConfiguration)) {
  test(`signed ingress refuses a missing ${field} in every configured mode`, () => {
    for (const NODE_ENV of ["production", "test", "development"]) {
      assert.throws(
        () =>
          loadServerEnv({
            ...environment(),
            ...proxyConfiguration,
            NODE_ENV,
            [field]: undefined,
          }),
        new RegExp(field)
      )
    }
  })
}

test("weak or blank proxy secrets never enable signed ingress", () => {
  for (const NETLIFY_PROXY_SIGNING_SECRET of [
    "",
    " ",
    "short",
    " ".repeat(40),
  ]) {
    assert.throws(
      () =>
        loadServerEnv({
          ...environment(),
          ...proxyConfiguration,
          NETLIFY_PROXY_SIGNING_SECRET,
        }),
      /NETLIFY_PROXY_SIGNING_SECRET/
    )
  }
})

test("hosted proxy site and context use concrete, exact values", () => {
  for (const PROXY_EXPECTED_SITE_URL of [
    "http://owner.netlify.app",
    "https://*.netlify.app",
    "https://owner.netlify.app/path",
    "https://user:secret@owner.netlify.app",
  ]) {
    assert.throws(
      () =>
        loadServerEnv({
          ...environment(),
          ...proxyConfiguration,
          PROXY_EXPECTED_SITE_URL,
        }),
      /PROXY_EXPECTED_SITE_URL/
    )
  }
  for (const PROXY_EXPECTED_DEPLOY_CONTEXT of ["", "*", "any"]) {
    assert.throws(
      () =>
        loadServerEnv({
          ...environment(),
          ...proxyConfiguration,
          PROXY_EXPECTED_DEPLOY_CONTEXT,
        }),
      /PROXY_EXPECTED_DEPLOY_CONTEXT/
    )
  }
})

test("rotation requires a distinct strong previous key and a bounded explicit cutoff", () => {
  const rotation = {
    NETLIFY_PROXY_PREVIOUS_SIGNING_SECRET:
      "synthetic-previous-proxy-secret-longer-than-32-characters",
    PROXY_PREVIOUS_KEY_VALID_UNTIL: String(Math.floor(Date.now() / 1000) + 300),
  }
  assert.doesNotThrow(() =>
    loadServerEnv({ ...environment(), ...proxyConfiguration, ...rotation })
  )
  for (const NETLIFY_PROXY_PREVIOUS_SIGNING_SECRET of [
    undefined,
    "short",
    proxyConfiguration.NETLIFY_PROXY_SIGNING_SECRET,
  ]) {
    assert.throws(
      () =>
        loadServerEnv({
          ...environment(),
          ...proxyConfiguration,
          ...rotation,
          NETLIFY_PROXY_PREVIOUS_SIGNING_SECRET,
        }),
      /NETLIFY_PROXY_PREVIOUS_SIGNING_SECRET/
    )
  }
  for (const PROXY_PREVIOUS_KEY_VALID_UNTIL of [
    undefined,
    "0",
    "NaN",
    String(Math.floor(Date.now() / 1000) + 7200),
  ]) {
    assert.throws(
      () =>
        loadServerEnv({
          ...environment(),
          ...proxyConfiguration,
          ...rotation,
          PROXY_PREVIOUS_KEY_VALID_UNTIL,
        }),
      /PROXY_PREVIOUS_KEY_VALID_UNTIL/
    )
  }
})

test("an unrelated disable flag cannot bypass the deployed ingress contract", () => {
  assert.throws(
    () =>
      loadServerEnv({ ...environment(), PROXY_VERIFICATION_DISABLED: "true" }),
    /NETLIFY_PROXY_SIGNING_SECRET/
  )
  const parsed = loadServerEnv({
    ...environment(),
    ...proxyConfiguration,
    PROXY_VERIFICATION_DISABLED: "true",
  })
  assert.equal("PROXY_VERIFICATION_DISABLED" in parsed, false)
  assert.equal(
    parsed.NETLIFY_PROXY_SIGNING_SECRET,
    proxyConfiguration.NETLIFY_PROXY_SIGNING_SECRET
  )
})

test("deployed staging refuses startup without the signed ingress boundary", () => {
  assert.throws(
    () => loadServerEnv(environment()),
    /NETLIFY_PROXY_SIGNING_SECRET/
  )
})

test("canonical hosted owner origins cannot disable ingress by changing NODE_ENV", () => {
  for (const NODE_ENV of ["development", "test"]) {
    for (const WEB_ORIGIN of [
      "https://app-staging.nthawi.io",
      "https://app.nthawi.io",
    ]) {
      assert.throws(
        () =>
          loadServerEnv({
            ...environment(),
            NODE_ENV,
            WEB_ORIGIN,
            BETTER_AUTH_URL: WEB_ORIGIN,
          }),
        /NETLIFY_PROXY_SIGNING_SECRET/
      )
    }
  }
})
