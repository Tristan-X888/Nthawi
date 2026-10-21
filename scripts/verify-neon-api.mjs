import { spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath, pathToFileURL } from "node:url"

import { assertNeonTestEnvironment } from "./neon-targets.mjs"

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const apiDirectory = join(repository, "apps", "api")
// Cold module loading on Windows can exceed 45s under local memory/I/O pressure.
// This listener allowance is separate from the strict readiness acceptance window.
const startupTimeout = process.platform === "win32" ? 90_000 : 45_000
const readinessTimeout = 45_000
const shutdownTimeout = 10_000

export class NeonApiVerificationError extends Error {
  constructor(stage) {
    super("NEON_API_ACCEPTANCE_FAILED")
    this.name = "NeonApiVerificationError"
    this.stage = stage
  }
}

function fail(stage) {
  throw new NeonApiVerificationError(stage)
}

/** Validate all four test roles, then pass only the two runtime connections. */
export function createNeonApiEnvironment(environment, port) {
  try {
    assertNeonTestEnvironment(environment)
  } catch {
    fail("configuration")
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    fail("configuration")
  }

  const childEnvironment = {
    NODE_ENV: "production",
    API_PORT: String(port),
    API_TRUST_PROXY: "",
    WEB_ORIGIN: "https://app.example.test",
    AUTH_TRUSTED_ORIGINS: "",
    WIDGET_ORIGIN: "https://widget.example.test",
    BETTER_AUTH_URL: "https://app.example.test",
    BETTER_AUTH_SECRET: randomBytes(48).toString("base64url"),
    BETTER_AUTH_API_KEY: "",
    DATABASE_URL: environment.DATABASE_URL,
    AUTH_DATABASE_URL: environment.AUTH_DATABASE_URL,
    GOOGLE_CLIENT_ID: "synthetic-neon-acceptance-client",
    GOOGLE_CLIENT_SECRET: "synthetic-neon-acceptance-secret",
    RESEND_API_KEY: "synthetic-neon-acceptance-resend",
    EMAIL_FROM: "Nthawi Acceptance <noreply@example.test>",
    OPENAI_API_KEY: "synthetic-neon-acceptance-openai",
    OPENAI_CHAT_MODEL: "gpt-4.1-mini-2025-04-14",
    OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
    GLOBAL_AI_BUDGET_USD: "20",
    WORKSPACE_AI_REPLY_LIMIT: "100",
    MAX_APPROVED_KNOWLEDGE_BYTES: "1048576",
    MAX_WORKSPACE_MESSAGES: "10000",
    MAX_WEBSITE_SOURCES: "10",
  }
  // Node is launched by absolute path. Do not inherit NODE_OPTIONS, PG*, proxy,
  // provider, migration, worker, dashboard, or administrative credentials.
  for (const name of ["SystemRoot", "SYSTEMROOT", "WINDIR", "TEMP", "TMP"]) {
    if (typeof environment[name] === "string") {
      childEnvironment[name] = environment[name]
    }
  }
  return childEnvironment
}

async function availablePort() {
  const server = createServer()
  try {
    await new Promise((accept, reject) => {
      server.once("error", reject)
      server.listen(0, "127.0.0.1", accept)
    })
    return server.address().port
  } finally {
    if (server.listening) {
      await new Promise((accept, reject) => {
        server.close((error) => (error ? reject(error) : accept()))
      })
    }
  }
}

/**
 * Execute the real compiled main without allowing auth.ts to load the local
 * repository .env. Its file-relative lookup lands in this empty temporary root.
 * No secrets are written to files or supplied in command-line arguments.
 */
export async function prepareCompiledApi({
  preventDatabaseConnections = false,
} = {}) {
  const temporary = await mkdtemp(join(tmpdir(), "nthawi-neon-api-"))
  try {
    const stagedApi = join(temporary, "apps", "api")
    await mkdir(stagedApi, { recursive: true })
    await cp(join(apiDirectory, "dist"), join(stagedApi, "dist"), {
      recursive: true,
    })
    await writeFile(join(stagedApi, "package.json"), '{"type":"module"}\n')
    await symlink(
      join(apiDirectory, "node_modules"),
      join(stagedApi, "node_modules"),
      process.platform === "win32" ? "junction" : "dir"
    )
    const requireDatabase = createRequire(
      join(repository, "packages", "db", "package.json")
    )
    const pgModule = pathToFileURL(requireDatabase.resolve("pg")).href
    const observer = join(temporary, "observe-shutdown.mjs")
    await writeFile(
      observer,
      `import pg from ${JSON.stringify(pgModule)}
${preventDatabaseConnections ? 'pg.Pool.prototype.connect = async function () { throw new Error("Offline lifecycle test") }' : ""}
const closed = new WeakSet()
const end = pg.Pool.prototype.end
pg.Pool.prototype.end = function (...arguments_) {
  const result = end.apply(this, arguments_)
  return result.then((value) => {
    if (!closed.has(this)) {
      closed.add(this)
      process.send?.({ type: "NEON_API_POOL_CLOSED" })
    }
    return value
  })
}
let stopping = false
function stop() {
  if (stopping) return
  stopping = true
  // Windows cannot deliver POSIX SIGTERM. Invoke Nest's registered signal
  // handler over IPC; Linux acceptance below uses the actual OS signal.
  if (process.platform === "win32") {
    if (!process.emit("SIGTERM")) process.exit(1)
  }
  else process.kill(process.pid, "SIGTERM")
}
process.on("message", (message) => {
  if (process.platform === "win32" && message?.type === "NEON_API_STOP") stop()
})
process.once("disconnect", stop)
process.channel?.unref()
`
    )
    return {
      args: [
        "--import",
        pathToFileURL(observer).href,
        join(stagedApi, "dist", "main.js"),
      ],
      cwd: stagedApi,
      cleanup: () => rm(temporary, { recursive: true, force: true }),
    }
  } catch {
    await rm(temporary, { recursive: true, force: true })
    fail("compiled-artifact")
  }
}

async function responseBody(response, stage) {
  if (response.headers.get("cache-control") !== "no-store") fail(stage)
  try {
    return await response.json()
  } catch {
    fail(stage)
  }
}

function sameFields(body, expected) {
  return (
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    Object.keys(body).length === Object.keys(expected).length &&
    Object.entries(expected).every(([name, value]) => body[name] === value)
  )
}

/** These GET requests neither create accounts nor send mail/provider requests. */
export async function verifyApiEndpoints(
  baseUrl,
  fetchResponse = fetch,
  signal,
  { childClosed = () => false, readinessOptions } = {}
) {
  for (const [path, status, expected, origin] of [
    ["/health/live", 200, { status: "ok" }],
    ["/health/ready", 200, { status: "ready" }],
    [
      "/api/v1/me",
      401,
      { code: "UNAUTHORIZED", message: "A valid owner session is required." },
    ],
    [
      "/api/v1/me",
      403,
      { code: "INVALID_ORIGIN", message: "Invalid origin" },
      "https://widget.example.test",
    ],
  ]) {
    if (path === "/health/ready") {
      await waitForReadiness(
        baseUrl,
        childClosed,
        signal,
        fetchResponse,
        readinessOptions
      )
      continue
    }
    const stage = path === "/api/v1/me" ? "owner-boundary" : path.slice(1)
    let response
    try {
      response = await fetchResponse(`${baseUrl}${path}`, {
        headers: origin ? { Origin: origin } : {},
        redirect: "error",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(5000)])
          : AbortSignal.timeout(5000),
      })
    } catch {
      fail(stage)
    }
    if (response.status !== status) fail(stage)
    const body = await responseBody(response, stage)
    if (!sameFields(body, expected)) fail(stage)
  }
}

async function waitForListening(baseUrl, childClosed, signal, fetchResponse) {
  const deadline = Date.now() + startupTimeout
  while (Date.now() < deadline && !signal.aborted && !childClosed()) {
    try {
      const response = await fetchResponse(`${baseUrl}/health/live`, {
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(1000)]),
      })
      if (response.status === 200) return
    } catch {
      // Startup and Neon compute wake-up are bounded by the outer deadline.
    }
    await delay(200, undefined, { signal })
  }
  fail("startup")
}

const readinessNetworkCodes = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ECONNABORTED",
  "ETIMEDOUT",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
])

function retryableReadinessError(error) {
  return (
    error?.name === "TimeoutError" ||
    error?.name === "AbortError" ||
    readinessNetworkCodes.has(error?.code) ||
    readinessNetworkCodes.has(error?.cause?.code)
  )
}

/** Retry transient unavailability, never an invalid readiness contract. */
export async function waitForReadiness(
  baseUrl,
  childClosed,
  signal,
  fetchResponse,
  {
    timeoutMs = readinessTimeout,
    requestTimeoutMs = 5000,
    pollIntervalMs = 250,
    now = () => performance.now(),
    sleep = delay,
  } = {}
) {
  if (
    ![timeoutMs, requestTimeoutMs, pollIntervalMs].every(
      (value) => Number.isSafeInteger(value) && value > 0
    ) ||
    timeoutMs > readinessTimeout
  ) {
    fail("configuration")
  }

  const deadline = now() + timeoutMs
  const assertRunning = () => {
    if (signal?.aborted) fail("interrupted")
    if (childClosed()) fail("unexpected-exit")
  }

  while (now() < deadline) {
    assertRunning()
    const attemptTimeout = Math.min(
      requestTimeoutMs,
      Math.ceil(deadline - now())
    )
    if (attemptTimeout < 1) break
    const attemptDeadline = now() + attemptTimeout
    const attempt = new AbortController()
    const requestSignal = signal
      ? AbortSignal.any([signal, attempt.signal])
      : attempt.signal
    let onAbort
    const timer = setTimeout(
      () =>
        attempt.abort(
          new DOMException("Readiness request timed out", "TimeoutError")
        ),
      attemptTimeout
    )

    try {
      const cancelled = new Promise((_, reject) => {
        onAbort = () => reject(requestSignal.reason)
        if (requestSignal.aborted) onAbort()
        else requestSignal.addEventListener("abort", onAbort, { once: true })
      })
      const read = (async () => {
        const response = await fetchResponse(baseUrl + "/health/ready", {
          redirect: "error",
          signal: requestSignal,
        })
        if (response.headers.get("cache-control") !== "no-store") {
          fail("health/ready")
        }
        return { status: response.status, body: await response.json() }
      })()
      // The deadline includes body consumption, even for an injected fetch
      // implementation whose body does not react to cancellation.
      const result = await Promise.race([read, cancelled])
      assertRunning()
      if (now() >= deadline) fail("health/ready")
      if (now() >= attemptDeadline) {
        throw new DOMException("Readiness request timed out", "TimeoutError")
      }
      if (
        result.status === 200 &&
        sameFields(result.body, { status: "ready" })
      ) {
        return
      }
      if (
        result.status !== 503 ||
        !sameFields(result.body, { status: "not_ready", code: "API_NOT_READY" })
      ) {
        fail("health/ready")
      }
    } catch (error) {
      if (error instanceof NeonApiVerificationError) throw error
      assertRunning()
      if (!retryableReadinessError(error)) fail("health/ready")
    } finally {
      clearTimeout(timer)
      if (onAbort) requestSignal.removeEventListener("abort", onAbort)
      attempt.abort()
    }

    assertRunning()
    if (now() >= deadline) break
    try {
      await sleep(Math.min(pollIntervalMs, deadline - now()), undefined, {
        signal,
      })
    } catch {
      assertRunning()
      fail("health/ready")
    }
  }

  assertRunning()
  fail("health/ready")
}

async function waitForExit(exit, milliseconds) {
  let timer
  try {
    return await Promise.race([
      exit,
      new Promise((accept) => {
        timer = setTimeout(() => accept(undefined), milliseconds)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/** Dependencies are injectable for safe, network-free failure-path tests. */
export async function verifyNeonApi(environment, options = {}) {
  // Reject production and malformed test credentials before creating files,
  // selecting a port, importing compiled code, or spawning a process.
  createNeonApiEnvironment(environment, 4000)
  const {
    prepare = prepareCompiledApi,
    selectPort = availablePort,
    spawnProcess = spawn,
    fetchResponse = fetch,
    platform = process.platform,
    signals = process,
    stopTimeout = shutdownTimeout,
    readinessOptions,
  } = options
  let staged
  let child
  let exit
  let closed = false
  let poolClosures = 0
  let failure
  let acceptance
  let interrupted = false
  const cancellation = new AbortController()
  const interrupt = () => {
    interrupted = true
    cancellation.abort()
  }
  signals.on("SIGINT", interrupt)
  signals.on("SIGTERM", interrupt)
  try {
    const port = await selectPort()
    const childEnvironment = createNeonApiEnvironment(environment, port)
    staged = await prepare()
    if (interrupted) fail("interrupted")
    child = spawnProcess(process.execPath, staged.args, {
      cwd: staged.cwd,
      env: childEnvironment,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    })
    exit = new Promise((accept) => {
      let processError = false
      child.once("error", () => {
        processError = true
        cancellation.abort()
      })
      child.once("close", (code, signal) => {
        closed = true
        accept({ code, signal, error: processError })
      })
    })
    child.on("message", (message) => {
      if (message?.type === "NEON_API_POOL_CLOSED") poolClosures++
    })
    const baseUrl = `http://127.0.0.1:${port}`
    await waitForListening(
      baseUrl,
      () => closed,
      cancellation.signal,
      fetchResponse
    )
    await verifyApiEndpoints(baseUrl, fetchResponse, cancellation.signal, {
      childClosed: () => closed,
      readinessOptions,
    })
    if (closed) fail("unexpected-exit")
    if (platform === "win32") {
      child.send({ type: "NEON_API_STOP" }, (error) => {
        if (error) interrupt()
      })
    } else if (!child.kill("SIGTERM")) fail("shutdown")
    const result = await waitForExit(exit, stopTimeout)
    if (
      !result ||
      result.error ||
      poolClosures !== 2 ||
      (platform !== "win32" && result.signal !== "SIGTERM") ||
      (platform === "win32" &&
        result.signal !== "SIGTERM" &&
        result.code !== 0 &&
        result.code !== 1)
    ) {
      fail("shutdown")
    }
    if (interrupted) fail("interrupted")
    acceptance = {
      shutdownMode: platform === "win32" ? "ipc-sigterm-hook" : "os-sigterm",
    }
  } catch (error) {
    failure =
      error instanceof NeonApiVerificationError
        ? error
        : new NeonApiVerificationError(interrupted ? "interrupted" : "runtime")
  } finally {
    if (child && !closed) {
      try {
        child.kill("SIGKILL")
        if (!(await waitForExit(exit, 5000))) {
          failure = new NeonApiVerificationError("process-cleanup")
        }
      } catch {
        failure = new NeonApiVerificationError("process-cleanup")
      }
    }
    try {
      // Never remove an artifact directory while its child is still running.
      if (!child || closed) await staged?.cleanup()
    } catch {
      failure ??= new NeonApiVerificationError("artifact-cleanup")
    } finally {
      signals.removeListener("SIGINT", interrupt)
      signals.removeListener("SIGTERM", interrupt)
    }
  }
  if (failure) throw failure
  return acceptance
}

export function formatNeonApiError(error) {
  const stage =
    error instanceof NeonApiVerificationError &&
    /^(?:configuration|compiled-artifact|startup|health\/(?:live|ready)|owner-boundary|unexpected-exit|shutdown|interrupted|runtime|process-cleanup|artifact-cleanup)$/.test(
      error.stage
    )
      ? error.stage
      : "unknown"
  return `code=NEON_API_ACCEPTANCE_FAILED stage=${stage}`
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    if (process.argv.length !== 2) fail("configuration")
    const result = await verifyNeonApi(process.env)
    console.log(
      `NEON_API_ACCEPTANCE_PASSED shutdown_mode=${result.shutdownMode}`
    )
  } catch (error) {
    console.error(formatNeonApiError(error))
    process.exitCode = 1
  }
}
