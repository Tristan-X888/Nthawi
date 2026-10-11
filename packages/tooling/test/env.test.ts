import assert from "node:assert/strict"
import { inspect } from "node:util"
import { test } from "node:test"
import { loadServerEnv } from "../src/env.ts"

function validEnv(): NodeJS.ProcessEnv {
  return {
    WEB_ORIGIN: "http://localhost:3000",
    WIDGET_ORIGIN: "http://localhost:5173",
    DATABASE_URL: "postgresql://test:test@localhost:5433/test",
    AUTH_DATABASE_URL: "postgresql://auth:auth@localhost:5433/test",
    BETTER_AUTH_SECRET: "test-only-secret-with-at-least-32-characters",
    BETTER_AUTH_URL: "http://localhost:4000",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    RESEND_API_KEY: "test-resend-key",
    EMAIL_FROM: "Nthawi <auth@example.test>",
    OPENAI_API_KEY: "test-openai-key",
  }
}

test("loads documented defaults, coerces numbers, and strips unrelated variables", () => {
  const env = loadServerEnv({
    ...validEnv(),
    API_PORT: "4100",
    GLOBAL_AI_BUDGET_USD: "2.5",
    UNRELATED_SECRET: "never-return-this",
  })
  assert.equal(env.NODE_ENV, "development")
  assert.equal(env.API_PORT, 4100)
  assert.equal(env.GLOBAL_AI_BUDGET_USD, 2.5)
  assert.equal(env.OPENAI_CHAT_MODEL, "gpt-4.1-mini-2025-04-14")
  assert.equal(env.OPENAI_EMBEDDING_MODEL, "text-embedding-3-small")
  assert.equal(env.WORKSPACE_AI_REPLY_LIMIT, 100)
  assert.equal(env.MAX_APPROVED_KNOWLEDGE_BYTES, 1_048_576)
  assert.equal(env.MAX_WORKSPACE_MESSAGES, 10_000)
  assert.equal(env.MAX_WEBSITE_SOURCES, 10)
  assert.deepEqual(env.AUTH_TRUSTED_ORIGINS, [])
  assert.equal("UNRELATED_SECRET" in env, false)
  assert.equal(loadServerEnv(validEnv()).API_PORT, 4000)
})

test("validation errors expose only field names, including malformed URL inputs", () => {
  const sentinel = "sensitive-value-must-not-appear"
  try {
    loadServerEnv({
      ...validEnv(),
      NODE_ENV: sentinel,
      WEB_ORIGIN: sentinel,
      API_PORT: sentinel,
      BETTER_AUTH_SECRET: "short-private-value",
    })
    assert.fail("invalid configuration must throw")
  } catch (error) {
    assert.ok(error instanceof Error)
    assert.equal(
      error.message,
      "Invalid server configuration: NODE_ENV, WEB_ORIGIN, API_PORT, BETTER_AUTH_SECRET"
    )
    assert.equal(error.cause, undefined)
    assert.equal(inspect(error).includes(sentinel), false)
    assert.equal(inspect(error).includes("short-private-value"), false)
  }
})

for (const field of [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "OPENAI_API_KEY",
  "DATABASE_URL",
  "AUTH_DATABASE_URL",
  "BETTER_AUTH_SECRET",
]) {
  test(`${field} is required and rejects empty or whitespace-only values`, () => {
    for (const value of [undefined, "", " "]) {
      assert.throws(
        () => loadServerEnv({ ...validEnv(), [field]: value }),
        new RegExp(field)
      )
    }
  })
}

for (const field of [
  "API_PORT",
  "WORKSPACE_AI_REPLY_LIMIT",
  "MAX_APPROVED_KNOWLEDGE_BYTES",
  "MAX_WORKSPACE_MESSAGES",
  "MAX_WEBSITE_SOURCES",
]) {
  test(`${field} rejects zero, negatives, fractions and nonfinite values`, () => {
    for (const value of ["0", "-1", "1.5", "NaN", "Infinity", ""]) {
      assert.throws(
        () => loadServerEnv({ ...validEnv(), [field]: value }),
        new RegExp(field)
      )
    }
  })
}

test("validates real HTTP origins, PostgreSQL URLs, sender mailboxes and port range", () => {
  for (const WEB_ORIGIN of [
    "ftp://host.test",
    "https://host.test/path",
    "https://user:secret@host.test",
    "https://host.test?secret=value",
  ]) {
    assert.throws(
      () => loadServerEnv({ ...validEnv(), WEB_ORIGIN }),
      /WEB_ORIGIN/
    )
  }
  assert.equal(
    loadServerEnv({ ...validEnv(), WEB_ORIGIN: "https://host.test/" })
      .WEB_ORIGIN,
    "https://host.test"
  )
  assert.deepEqual(
    loadServerEnv({
      ...validEnv(),
      AUTH_TRUSTED_ORIGINS: "https://web.ngrok.app/, http://localhost:3000",
    }).AUTH_TRUSTED_ORIGINS,
    ["https://web.ngrok.app", "http://localhost:3000"]
  )
  for (const AUTH_TRUSTED_ORIGINS of [
    "https://host.test/path",
    "https://user:secret@host.test",
    "https://host.test,",
  ]) {
    assert.throws(
      () => loadServerEnv({ ...validEnv(), AUTH_TRUSTED_ORIGINS }),
      /AUTH_TRUSTED_ORIGINS/
    )
  }
  assert.throws(
    () => loadServerEnv({ ...validEnv(), DATABASE_URL: "https://db.test" }),
    /DATABASE_URL/
  )
  assert.throws(
    () =>
      loadServerEnv({ ...validEnv(), AUTH_DATABASE_URL: "https://db.test" }),
    /AUTH_DATABASE_URL/
  )
  assert.throws(
    () => loadServerEnv({ ...validEnv(), API_PORT: "65536" }),
    /API_PORT/
  )
  assert.throws(
    () =>
      loadServerEnv({
        ...validEnv(),
        EMAIL_FROM: "auth@example.test\r\nBcc:other@example.test",
      }),
    /EMAIL_FROM/
  )
})

test("keeps auth and business credentials distinct and strips administrator credentials", () => {
  const env = loadServerEnv({
    ...validEnv(),
    DATABASE_MIGRATION_URL: "postgresql://admin:private@localhost/test",
    RLS_TEST_ADMIN_URL: "postgresql://admin:private@localhost/test",
    AUTH_TEST_ADMIN_URL: "postgresql://admin:private@localhost/test",
  })
  assert.equal(env.AUTH_DATABASE_URL, validEnv().AUTH_DATABASE_URL)
  assert.equal(env.DATABASE_URL, validEnv().DATABASE_URL)
  assert.equal("DATABASE_MIGRATION_URL" in env, false)
  assert.equal("RLS_TEST_ADMIN_URL" in env, false)
  assert.equal("AUTH_TEST_ADMIN_URL" in env, false)
})

test("dashboard key is optional and blank does not silently enable the plugin", () => {
  assert.equal(loadServerEnv(validEnv()).BETTER_AUTH_API_KEY, undefined)
  assert.equal(
    loadServerEnv({ ...validEnv(), BETTER_AUTH_API_KEY: "" })
      .BETTER_AUTH_API_KEY,
    undefined
  )
  assert.throws(
    () => loadServerEnv({ ...validEnv(), BETTER_AUTH_API_KEY: " " }),
    /BETTER_AUTH_API_KEY/
  )
})

test("proxy trust is disabled by default and accepts explicit IP/CIDR allowlists", () => {
  assert.deepEqual(loadServerEnv(validEnv()).API_TRUST_PROXY, [])
  assert.deepEqual(
    loadServerEnv({ ...validEnv(), API_TRUST_PROXY: "" }).API_TRUST_PROXY,
    []
  )
  assert.deepEqual(
    loadServerEnv({
      ...validEnv(),
      API_TRUST_PROXY: "127.0.0.1, 10.0.0.0/24, ::1/128",
    }).API_TRUST_PROXY,
    ["127.0.0.1", "10.0.0.0/24", "::1/128"]
  )
})

test("proxy trust rejects blanket trust, malformed networks, and empty entries", () => {
  for (const API_TRUST_PROXY of [
    "true",
    "1",
    "*",
    "0.0.0.0/0",
    "::/0",
    "127.0.0.1/33",
    "::1/129",
    "10.0.0.0/-1",
    "10.0.0.0/1.5",
    "10.0.0.1,",
    "example.test",
    "127.0.0.1/8/2",
  ]) {
    assert.throws(
      () => loadServerEnv({ ...validEnv(), API_TRUST_PROXY }),
      /API_TRUST_PROXY/
    )
  }
})

function deployedEnv(): NodeJS.ProcessEnv {
  return {
    ...validEnv(),
    NODE_ENV: "production",
    WEB_ORIGIN: "https://app.example.test",
    BETTER_AUTH_URL: "https://app.example.test",
    WIDGET_ORIGIN: "https://widget.example.test",
  }
}

test("accepts the deployed topology and retains local development", () => {
  assert.doesNotThrow(() => loadServerEnv(validEnv()))
  assert.doesNotThrow(() => loadServerEnv(deployedEnv()))
  assert.doesNotThrow(() =>
    loadServerEnv({
      ...deployedEnv(),
      WEB_ORIGIN: "https://app.staging.example.test",
      BETTER_AUTH_URL: "https://app.staging.example.test",
      WIDGET_ORIGIN: "https://widget.staging.example.test",
    })
  )
})

for (const field of ["WEB_ORIGIN", "WIDGET_ORIGIN", "BETTER_AUTH_URL"]) {
  test(`${field} rejects insecure or non-DNS deployed origins`, () => {
    for (const value of [
      "http://public.example.test",
      "https://localhost",
      "https://name.localhost",
      "https://127.0.0.2",
      "https://[::1]",
      "https://10.0.0.1",
      "https://*.example.test",
    ]) {
      assert.throws(
        () => loadServerEnv({ ...deployedEnv(), [field]: value }),
        new RegExp(field)
      )
    }
  })
}

test("deployed authentication must use the owner origin", () => {
  assert.throws(
    () =>
      loadServerEnv({
        ...deployedEnv(),
        BETTER_AUTH_URL: "https://api.example.test",
      }),
    /BETTER_AUTH_URL/
  )
})

test("the deployed widget is isolated from owner authentication", () => {
  assert.throws(
    () =>
      loadServerEnv({
        ...deployedEnv(),
        WIDGET_ORIGIN: "https://app.example.test",
      }),
    /WIDGET_ORIGIN/
  )
  assert.throws(
    () =>
      loadServerEnv({
        ...deployedEnv(),
        AUTH_TRUSTED_ORIGINS: "https://widget.example.test",
      }),
    /AUTH_TRUSTED_ORIGINS/
  )
})

test("additional deployed auth origins require concrete HTTPS hostnames", () => {
  assert.doesNotThrow(() =>
    loadServerEnv({
      ...deployedEnv(),
      AUTH_TRUSTED_ORIGINS: "https://review.example.test",
    })
  )
  for (const value of [
    "http://review.example.test",
    "https://*.review.example.test",
  ]) {
    assert.throws(
      () => loadServerEnv({ ...deployedEnv(), AUTH_TRUSTED_ORIGINS: value }),
      /AUTH_TRUSTED_ORIGINS/
    )
  }
})

for (const field of [
  "WEB_ORIGIN",
  "WIDGET_ORIGIN",
  "BETTER_AUTH_URL",
  "AUTH_TRUSTED_ORIGINS",
]) {
  test(`${field} rejects noncanonical or malformed deployed DNS hostnames`, () => {
    for (const hostname of [
      "localhost.",
      "name.localhost.",
      "app.example.test.",
      "internal",
      "bad..example.test",
      "bad_name.example.test",
      "-bad.example.test",
      "bad-.example.test",
      `${"a".repeat(64)}.example.test`,
      `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(63)}`,
    ]) {
      const value = `https://${hostname}`
      const environment = { ...deployedEnv(), [field]: value }
      // Keep the owner/auth equality valid so it cannot mask a DNS failure.
      if (field === "WEB_ORIGIN" || field === "BETTER_AUTH_URL") {
        environment.WEB_ORIGIN = value
        environment.BETTER_AUTH_URL = value
      }
      assert.throws(() => loadServerEnv(environment), new RegExp(field))
    }
  })
}

test("deployed DNS validation accepts normalized international and hyphenated hostnames", () => {
  const env = loadServerEnv({
    ...deployedEnv(),
    WEB_ORIGIN: "https://OWNER.Example.test:443/",
    BETTER_AUTH_URL: "https://owner.example.test",
    AUTH_TRUSTED_ORIGINS: "https://bücher.example.test/",
    WIDGET_ORIGIN: `https://${"a".repeat(63)}.widget-app.example.test`,
  })
  assert.equal(env.WEB_ORIGIN, "https://owner.example.test")
  assert.deepEqual(env.AUTH_TRUSTED_ORIGINS, [
    "https://xn--bcher-kva.example.test",
  ])
})

test("a different port does not isolate deployed widget cookies from the owner host", () => {
  assert.throws(
    () =>
      loadServerEnv({
        ...deployedEnv(),
        WIDGET_ORIGIN: "https://app.example.test:444",
      }),
    /WIDGET_ORIGIN/
  )
})

test("the deployed widget host cannot be trusted for owner auth at another port", () => {
  assert.throws(
    () =>
      loadServerEnv({
        ...deployedEnv(),
        AUTH_TRUSTED_ORIGINS: "https://widget.example.test:444",
      }),
    /AUTH_TRUSTED_ORIGINS/
  )
})

test("deployed validation keeps errors private and the dashboard key optional", () => {
  assert.equal(
    loadServerEnv({ ...deployedEnv(), BETTER_AUTH_API_KEY: "" })
      .BETTER_AUTH_API_KEY,
    undefined
  )
  const sentinel = "sensitive-value-must-not-appear"
  assert.throws(
    () => loadServerEnv({ ...deployedEnv(), WEB_ORIGIN: sentinel }),
    (error) =>
      error instanceof Error &&
      error.message.startsWith("Invalid server configuration:") &&
      error.cause === undefined &&
      !inspect(error).includes(sentinel)
  )
})
