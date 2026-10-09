import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { pathToFileURL } from "node:url"

function docker(args, allowFailure = false, timeout = 35_000) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    timeout,
    maxBuffer: 2 * 1024 * 1024,
  })

  if (!allowFailure && (result.error || result.status !== 0)) {
    // Do not print Docker arguments or captured application output: either can
    // contain configuration values. Include only the operation and outcome.
    const outcome = result.error?.code ?? result.signal ?? result.status
    throw new Error(`Docker ${args[0]} failed (${outcome})`)
  }

  return result
}

export function cleanupTestContainers(names, run = docker) {
  const failures = []

  for (const name of names) {
    const removal = run(["rm", "--force", name], true)
    if (!removal.error && removal.status === 0) continue

    // --rm may already have removed an exited container. Distinguish that case
    // from daemon failures without relying on Docker's localized error text.
    const remaining = run(
      [
        "container",
        "ls",
        "--all",
        "--filter",
        `name=^/${name}$`,
        "--format",
        "{{.ID}}",
      ],
      true
    )

    if (
      remaining.error ||
      remaining.status !== 0 ||
      remaining.stdout.trim() !== ""
    ) {
      failures.push(new Error("API image test container cleanup failed"))
    }
  }

  return failures
}

function execute(container, source, allowFailure = false, timeout = 35_000) {
  return docker(
    [
      "exec",
      "--workdir",
      "/app/apps/api",
      container,
      "node",
      "--input-type=module",
      "--eval",
      source,
    ],
    allowFailure,
    timeout
  )
}

const syntheticEnvironment = {
  NODE_ENV: "production",
  API_PORT: "4000",
  WEB_ORIGIN: "https://app.example.test",
  BETTER_AUTH_URL: "https://app.example.test",
  WIDGET_ORIGIN: "https://widget.example.test",
  DATABASE_URL: "postgresql://smoke:smoke@127.0.0.1:1/smoke",
  BETTER_AUTH_SECRET:
    "synthetic-container-test-secret-that-is-never-used-for-real-auth",
  GOOGLE_CLIENT_ID: "synthetic-client",
  GOOGLE_CLIENT_SECRET: "synthetic-client-secret",
  RESEND_API_KEY: "synthetic-resend-key",
  EMAIL_FROM: "Nthawi Test <noreply@example.test>",
  OPENAI_API_KEY: "synthetic-openai-key",
}

const environmentArguments = Object.entries(syntheticEnvironment).flatMap(
  ([key, value]) => ["--env", `${key}=${value}`]
)

const startupProbe = `
  const response = await fetch("http://127.0.0.1:4000/", {
    signal: AbortSignal.timeout(1000)
  });
  if (response.status !== 200 ||
      await response.text() !== "Hello World!") {
    process.exit(1);
  }
`

export async function checkApiImage(image = "nthawi-api:step3") {
  const container = `nthawi-step3-${randomUUID()}`
  const invalidContainer = `nthawi-step3-invalid-${randomUUID()}`
  const attemptedContainers = new Set()
  let failure

  try {
    docker(["info", "--format", "{{.ServerVersion}}"])

    // Track the name before starting Docker: a timed-out client can leave its
    // container running even when the client reports that startup failed.
    attemptedContainers.add(container)
    docker([
      "run",
      "--pull",
      "never",
      "--detach",
      "--init",
      "--name",
      container,
      "--network",
      "none",
      "--read-only",
      "--tmpfs",
      "/tmp",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      ...environmentArguments,
      image,
    ])

    const deadline = Date.now() + 30_000
    let ready = false

    while (Date.now() < deadline) {
      const result = execute(container, startupProbe, true, 3_000)

      if (!result.error && result.status === 0) {
        ready = true
        break
      }

      await delay(250)
    }

    assert.ok(ready, "Compiled API did not become reachable")

    execute(
      container,
      `
    import assert from "node:assert/strict";
    import {
      existsSync,
      readdirSync
    } from "node:fs";
    import path from "node:path";

    assert.equal(process.version, "v24.21.0");
    assert.ok(process.getuid() > 0, "Runtime must not use root");

    for (const directory of [
      "/app/apps/api/src",
      "/app/packages/db/src",
      "/app/packages/tooling/src",
      "/app/packages/contracts/src"
    ]) {
      assert.equal(existsSync(directory), false);
    }

    function checkEnvironmentFiles(directory) {
      for (const entry of readdirSync(directory, {
        withFileTypes: true
      })) {
        if (entry.name === "node_modules") continue;
        assert.equal(entry.name.startsWith(".env"), false);

        if (entry.isDirectory()) {
          checkEnvironmentFiles(path.join(directory, entry.name));
        }
      }
    }

    checkEnvironmentFiles("/app");

    for (const name of [
      "@nthawi/contracts",
      "@nthawi/db",
      "@nthawi/db/schema/auth",
      "@nthawi/tooling/env"
    ]) {
      const resolved = import.meta.resolve(name);
      assert.match(resolved, /\\/dist\\/.*\\.js$/);
      assert.doesNotMatch(resolved, /\\/src\\//);
      await import(name);
    }
  `
    )

    docker(["stop", "--time", "10", container])

    const inspection = docker([
      "inspect",
      "--format",
      "{{json .State}}",
      container,
    ])

    const state = JSON.parse(inspection.stdout)

    assert.equal(state.Running, false)
    assert.equal(state.OOMKilled, false)
    assert.ok(
      state.ExitCode === 0 || state.ExitCode === 143,
      "API failed to terminate normally after SIGTERM"
    )

    const sentinel = "synthetic-secret-sentinel"

    attemptedContainers.add(invalidContainer)
    const invalidStartup = docker(
      [
        "run",
        "--pull",
        "never",
        "--rm",
        "--name",
        invalidContainer,
        "--network",
        "none",
        "--read-only",
        "--tmpfs",
        "/tmp",
        "--env",
        "NODE_ENV=production",
        "--env",
        `BETTER_AUTH_SECRET=${sentinel}`,
        image,
      ],
      true
    )

    const output = (invalidStartup.stdout ?? "") + (invalidStartup.stderr ?? "")

    assert.ok(
      !invalidStartup.error &&
        Number.isInteger(invalidStartup.status) &&
        invalidStartup.status !== 0,
      "Invalid configuration must stop startup"
    )
    assert.ok(output.includes("Invalid server configuration:"))
    assert.ok(!output.includes(sentinel))
  } catch (error) {
    failure = error
  } finally {
    const cleanupFailures = cleanupTestContainers(attemptedContainers)

    if (cleanupFailures.length) {
      failure = new AggregateError(
        failure ? [failure, ...cleanupFailures] : cleanupFailures,
        "API image verification could not clean up its containers"
      )
    }
  }

  if (failure) throw failure

  console.log(
    "API image passed startup, exports, user, environment and shutdown checks."
  )
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await checkApiImage(process.argv[2])
}
