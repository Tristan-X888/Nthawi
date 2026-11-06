import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"

import {
  assertNeonTestEnvironment,
  guardNeonMigrationTarget,
} from "./neon-targets.mjs"

const repositoryFile = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8")

const host = "ep-cold-shadow-zaqw3flo.c-2.eu-west-2.aws.neon.tech"

const projectBranch = "br-rapid-brook-zao6uwya"

const roles = [
  ["DATABASE_MIGRATION_URL", "nthawi_migrator"],
  ["AUTH_DATABASE_URL", "nthawi_auth"],
  ["DATABASE_URL", "nthawi_business"],
  ["JOBS_DATABASE_URL", "nthawi_jobs"],
]

function validEnvironment() {
  const env = {
    NEON_TARGET: "test",
    NEON_EXPECTED_BRANCH_ID: projectBranch,
    DATABASE_MIGRATOR_ROLE: "nthawi_migrator",
    DATABASE_AUTH_ROLE: "nthawi_auth",
    DATABASE_BUSINESS_ROLE: "nthawi_business",
    DATABASE_JOBS_ROLE: "nthawi_jobs",
  }

  // Each role holds its own synthetic secret, as the guard requires.
  for (const [variable, role] of roles) {
    env[variable] =
      `postgresql://${role}:synthetic-test-password-${role}@` +
      `${host}:5432/neondb?sslmode=verify-full`
  }

  return env
}

function reject(change) {
  const env = validEnvironment()
  change(env)

  assert.throws(
    () => assertNeonTestEnvironment(env),
    /NEON_TEST_TARGET_CONFIGURATION_INVALID/
  )
}

test("accepts exactly the registered synthetic target", () => {
  assert.equal(
    assertNeonTestEnvironment(validEnvironment()).branchId,
    projectBranch
  )
})

test("refuses missing target selection", () => {
  reject((env) => {
    delete env.NEON_TARGET
  })
})

test("refuses production through the test runner", () => {
  reject((env) => {
    env.NEON_TARGET = "production"
    env.NEON_EXPECTED_BRANCH_ID = "br-lively-darkness-zahxet6z"
  })
})

test("refuses a different branch", () => {
  reject((env) => {
    env.NEON_EXPECTED_BRANCH_ID = "br-wrong-target"
  })
})

test("refuses another database", () => {
  reject((env) => {
    env.DATABASE_URL = env.DATABASE_URL.replace("/neondb?", "/postgres?")
  })
})

test("refuses wrong runtime role", () => {
  reject((env) => {
    env.DATABASE_BUSINESS_ROLE = "nthawi_migrator"
  })
})

test("refuses wrong direct hostname", () => {
  reject((env) => {
    env.DATABASE_URL = env.DATABASE_URL.replace(
      host,
      "ep-unregistered.eu-west-2.aws.neon.tech"
    )
  })
})

test("refuses pooled endpoints", () => {
  reject((env) => {
    env.DATABASE_URL = env.DATABASE_URL.replace(
      host,
      host.replace("ep-", "ep-pooler-")
    )
  })
})

test("refuses disabled TLS verification", () => {
  reject((env) => {
    env.DATABASE_URL = env.DATABASE_URL.replace(
      "sslmode=verify-full",
      "sslmode=require"
    )
  })
})

test("refuses URL host override", () => {
  reject((env) => {
    env.DATABASE_URL += "&host=localhost"
  })
})

test("refuses duplicate TLS parameters", () => {
  reject((env) => {
    env.DATABASE_URL += "&sslmode=disable"
  })
})

test("refuses a missing password", () => {
  reject((env) => {
    env.DATABASE_URL = env.DATABASE_URL.replace(
      ":synthetic-test-password-nthawi_business@",
      "@"
    )
  })
})

test("refuses two roles that share one password", () => {
  reject((env) => {
    env.AUTH_DATABASE_URL = env.AUTH_DATABASE_URL.replace(
      "synthetic-test-password-nthawi_auth",
      "synthetic-test-password-nthawi_business"
    )
  })
})

test("refuses a runtime role that can authenticate as the migrator", () => {
  reject((env) => {
    env.JOBS_DATABASE_URL = env.JOBS_DATABASE_URL.replace(
      "synthetic-test-password-nthawi_jobs",
      "synthetic-test-password-nthawi_migrator"
    )
  })
})

test("every bootstrap runs the distinct-password guard before creating roles", async () => {
  const bootstrap = await repositoryFile("infra/neon/bootstrap.psql")
  const include = bootstrap.indexOf("\\ir bootstrap-password-guard.psql")
  assert.ok(include > 0, "bootstrap.psql must include the password guard")
  for (const later of ["BEGIN;", "CREATE ROLE", "ALTER ROLE"])
    assert.ok(
      include < bootstrap.indexOf(later),
      `the guard must run before ${later}`
    )
  for (const name of ["MIGRATOR", "AUTH", "BUSINESS", "JOBS"])
    assert.ok(
      include > bootstrap.indexOf(`DATABASE_${name}_PASSWORD`),
      `DATABASE_${name}_PASSWORD must be loaded before the guard runs`
    )

  const guard = await repositoryFile("infra/neon/bootstrap-password-guard.psql")
  assert.match(guard, /must be different/)
  assert.doesNotMatch(guard, /\\echo|\\set ECHO (?:all|queries)/)

  const runner = await repositoryFile("scripts/run-neon-test-bootstrap.ps1")
  assert.match(runner, /bootstrap-password-guard\.psql/)
  assert.match(runner, /Each role password must be different/)
})

test("test migration guard refuses production", () => {
  const env = validEnvironment()

  env.NEON_TARGET = "production"
  env.NEON_EXPECTED_BRANCH_ID = "br-lively-darkness-zahxet6z"

  assert.throws(
    () => guardNeonMigrationTarget(env),
    /NEON_TEST_TARGET_CONFIGURATION_INVALID/
  )
})

test("unselected remote target fails closed", () => {
  const env = validEnvironment()
  delete env.NEON_TARGET

  assert.throws(
    () => guardNeonMigrationTarget(env),
    /NEON_TEST_TARGET_CONFIGURATION_INVALID/
  )
})
