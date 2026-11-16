import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { spawn } from "node:child_process"
import { createServer, request } from "node:http"
import { connect } from "node:net"
import test from "node:test"

import { createSignedProxy } from "./dev-signed-proxy.mjs"

const signingSecret = "synthetic-development-proxy-secret-32-characters"
const claims = {
  siteUrl: "http://127.0.0.1:8890",
  netlifyId: "local-owner-site",
  deployContext: "dev",
}

async function listen(t, server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })
  return `http://127.0.0.1:${server.address().port}`
}

function call(origin, path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = request(origin, { ...options, path }, (res) => {
      const chunks = []
      res.on("data", (chunk) => chunks.push(chunk))
      res.on("end", () =>
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString(),
        })
      )
    })
    req.on("error", reject)
    req.end(options.body)
  })
}

async function fixture(
  t,
  apiHandler,
  webHandler = (_req, res) => res.end("web"),
  options = {}
) {
  const apiOrigin = await listen(t, createServer(apiHandler))
  const webOrigin = await listen(t, createServer(webHandler))
  const proxy = createSignedProxy({
    apiOrigin,
    webOrigin,
    signingSecret,
    ...claims,
    ...options,
  })
  const origin = await listen(t, proxy)
  return { origin, proxy, apiOrigin, webOrigin }
}

test("auth requests reach the API with a native Netlify signature and streamed body/cookies", async (t) => {
  const { origin } = await fixture(t, async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const [header, payload, signature] = req.headers["x-nf-sign"].split(".")
    assert.deepEqual(JSON.parse(Buffer.from(header, "base64url")), {
      alg: "HS256",
      typ: "JWT",
    })
    assert.equal(
      signature,
      createHmac("sha256", signingSecret)
        .update(`${header}.${payload}`)
        .digest("base64url")
    )
    const decoded = JSON.parse(Buffer.from(payload, "base64url"))
    assert.equal(decoded.iss, "netlify")
    assert.equal(decoded.site_url, claims.siteUrl)
    assert.equal(decoded.netlify_id, claims.netlifyId)
    assert.equal(decoded.deploy_context, claims.deployContext)
    assert.equal(Number.isInteger(decoded.exp), true)
    assert.ok(decoded.exp > Date.now() / 1000)
    assert.ok(decoded.exp <= Date.now() / 1000 + 300)
    assert.equal(req.url, "/api/auth/sign-in/email?flow=local")
    assert.equal(req.headers.cookie, "session=synthetic")
    assert.equal(
      Buffer.concat(chunks).toString(),
      '{"email":"test@example.test"}'
    )
    res.setHeader("set-cookie", ["one=1; HttpOnly", "two=2; SameSite=Lax"])
    res.end("signed")
  })
  const result = await call(origin, "/api/auth/sign-in/email?flow=local", {
    method: "POST",
    headers: {
      cookie: "session=synthetic",
      "content-type": "application/json",
    },
    body: '{"email":"test@example.test"}',
  })
  assert.equal(result.status, 200)
  assert.equal(result.body, "signed")
  assert.deepEqual(result.headers["set-cookie"], [
    "one=1; HttpOnly",
    "two=2; SameSite=Lax",
  ])
})

test("forwarding and Netlify identity headers are replaced with the measured loopback client IP", async (t) => {
  const { origin } = await fixture(t, (req, res) => {
    assert.equal(req.headers.forwarded, undefined)
    assert.equal(req.headers["x-forwarded-for"], undefined)
    assert.equal(req.headers["x-forwarded-host"], undefined)
    assert.equal(req.headers["x-forwarded-proto"], undefined)
    assert.equal(req.headers["x-nf-client-connection-ip"], "127.0.0.1")
    assert.notEqual(req.headers["x-nf-sign"], "spoofed-signature")
    res.end("trusted")
  })
  const result = await call(origin, "/api/v1/workspaces", {
    headers: {
      forwarded: "for=203.0.113.90",
      "x-forwarded-for": "203.0.113.90",
      "x-forwarded-host": "evil.example.test",
      "x-forwarded-proto": "https",
      "x-nf-client-connection-ip": "203.0.113.90",
      "x-nf-sign": "spoofed-signature",
    },
  })
  assert.equal(result.body, "trusted")
})

test("non-API pages reach the owner web app without signature or spoofed proxy identity", async (t) => {
  const { origin } = await fixture(
    t,
    (_req, res) => res.end("unexpected-api"),
    (req, res) => {
      assert.equal(req.url, "/settings?tab=billing")
      assert.equal(req.headers["x-nf-sign"], undefined)
      assert.equal(req.headers["x-nf-client-connection-ip"], undefined)
      assert.equal(req.headers["x-forwarded-for"], undefined)
      res.end("owner-page")
    }
  )
  const result = await call(origin, "/settings?tab=billing", {
    headers: {
      "x-nf-sign": "spoofed",
      "x-nf-client-connection-ip": "203.0.113.6",
      "x-forwarded-for": "203.0.113.6",
    },
  })
  assert.equal(result.body, "owner-page")
})

test("owner web rendering sees the browser's loopback origin instead of its internal upstream port", async (t) => {
  let browserHost
  const { origin } = await fixture(
    t,
    (_req, res) => res.end("api"),
    (req, res) => res.end(req.headers.host)
  )
  browserHost = new URL(origin).host
  assert.equal((await call(origin, "/settings")).body, browserHost)
})

test("API roots and descendants are signed while similarly prefixed web routes are not", async (t) => {
  const { origin } = await fixture(
    t,
    (req, res) => res.end(req.headers["x-nf-sign"] ? "api" : "unsigned"),
    (_req, res) => res.end("web")
  )
  for (const path of [
    "/api/auth",
    "/api/v1",
    "/api/auth/",
    "/api/v1/account",
  ]) {
    assert.equal((await call(origin, path)).body, "api", path)
  }
  for (const path of ["/api/authentication", "/api/v10", "/api/other"]) {
    assert.equal((await call(origin, path)).body, "web", path)
  }
})

test("configuration refuses remote or non-origin targets and short or malformed signing inputs", () => {
  const options = {
    apiOrigin: "http://127.0.0.1:4500",
    webOrigin: "http://localhost:3000",
    signingSecret,
    ...claims,
  }
  for (const field of ["apiOrigin", "webOrigin", "siteUrl"]) {
    for (const value of [
      "https://remote.example.test",
      "http://127.0.0.1.example.test",
      "http://127.0.0.1/path",
      "http://name:secret@127.0.0.1",
      "http://127.0.0.1?key=secret",
      "http://127.0.0.1#fragment",
      "file:///tmp/proxy",
    ]) {
      assert.throws(
        () => createSignedProxy({ ...options, [field]: value }),
        { message: "DEV_PROXY_CONFIGURATION_INVALID" },
        `${field}: ${value}`
      )
    }
  }
  for (const signingSecret of [undefined, "", "short", " ".repeat(40)]) {
    assert.throws(() => createSignedProxy({ ...options, signingSecret }), {
      message: "DEV_PROXY_CONFIGURATION_INVALID",
    })
  }
  for (const field of ["netlifyId", "deployContext"]) {
    for (const value of [undefined, "", " ", "line\nbreak"]) {
      assert.throws(() => createSignedProxy({ ...options, [field]: value }), {
        message: "DEV_PROXY_CONFIGURATION_INVALID",
      })
    }
  }
})

test("absolute and network-path request targets cannot turn the signer into an open proxy", async (t) => {
  let reached = false
  const external = await listen(
    t,
    createServer((_req, res) => {
      reached = true
      res.end("unexpected-target")
    })
  )
  const { origin } = await fixture(t, (_req, res) => res.end("api"))
  for (const path of [
    `${external}/api/auth/session`,
    `//${new URL(external).host}/api/auth/session`,
    `/\\${new URL(external).host}/api/auth/session`,
  ]) {
    const result = await call(origin, path)
    assert.equal(result.status, 400, path)
    assert.equal(JSON.parse(result.body).code, "DEV_PROXY_REQUEST_INVALID")
  }
  assert.equal(reached, false)
})

test("a foreign Host header is rejected to prevent loopback DNS rebinding", async (t) => {
  const { origin } = await fixture(t, (_req, res) => res.end("unexpected-api"))
  const result = await call(origin, "/api/auth/get-session", {
    headers: { host: "evil.example.test" },
  })
  assert.equal(result.status, 400)
  assert.equal(JSON.parse(result.body).code, "DEV_PROXY_REQUEST_INVALID")
})

test("hop-by-hop and Connection-nominated headers are not forwarded", async (t) => {
  const { origin } = await fixture(t, (req, res) => {
    assert.equal(req.headers["x-custom-hop"], undefined)
    assert.equal(req.headers["proxy-authorization"], undefined)
    assert.equal(req.headers.connection?.includes("x-custom-hop"), false)
    res.end("safe-headers")
  })
  const result = await call(origin, "/api/auth/get-session", {
    headers: {
      connection: "x-custom-hop",
      "x-custom-hop": "hop-only",
      "proxy-authorization": "secret-proxy-token",
    },
  })
  assert.equal(result.body, "safe-headers")
})

function raw(origin, data) {
  const { hostname, port } = new URL(origin)
  return new Promise((resolve, reject) => {
    const socket = connect(Number(port), hostname)
    const chunks = []
    socket.setTimeout(2_000, () =>
      socket.destroy(new Error("protocol timeout"))
    )
    socket.on("connect", () => socket.write(data))
    socket.on("data", (chunk) => chunks.push(chunk))
    socket.on("end", () => resolve(Buffer.concat(chunks).toString()))
    socket.on("error", reject)
  })
}

test("CONNECT tunnels and WebSocket upgrades are explicitly refused", async (t) => {
  const { origin } = await fixture(t, (_req, res) => res.end("api"))
  const host = new URL(origin).host
  for (const line of [
    `CONNECT 127.0.0.1:4500 HTTP/1.1\r\nHost: ${host}\r\n\r\n`,
    `GET /api/v1/stream HTTP/1.1\r\nHost: ${host}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`,
  ]) {
    assert.match(await raw(origin, line), /^HTTP\/1\.1 405 Method Not Allowed/)
  }
})

test("upstream errors have a stable sanitized response and correlation ID", async (t) => {
  const { origin } = await fixture(t, (req) => req.socket.destroy())
  const result = await call(origin, "/api/auth/session?secret=do-not-expose")
  assert.equal(result.status, 502)
  const body = JSON.parse(result.body)
  assert.equal(body.code, "DEV_PROXY_UPSTREAM_UNAVAILABLE")
  assert.match(body.correlationId, /^[a-f0-9-]{36}$/)
  assert.equal(result.headers["cache-control"], "no-store")
  assert.equal(result.body.includes("do-not-expose"), false)
  assert.equal(result.body.includes(signingSecret), false)
})

test("a stalled upstream ends within a bounded deadline", async (t) => {
  const { origin } = await fixture(t, () => {}, undefined, {
    upstreamTimeoutMillis: 40,
  })
  const result = await call(origin, "/api/v1/workspaces")
  assert.equal(result.status, 504)
  assert.equal(JSON.parse(result.body).code, "DEV_PROXY_UPSTREAM_TIMEOUT")
})

function childProxy(t, environment) {
  const child = spawn(process.execPath, ["scripts/dev-signed-proxy.mjs"], {
    cwd: new URL("../", import.meta.url),
    env: { ...process.env, ...environment },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true,
  })
  t.after(() => child.kill())
  const finished = new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", (code) => resolve(code))
  })
  return { child, finished }
}

test("CLI configuration failures are sanitized and never start a listener", async (t) => {
  const sentinel = "synthetic-sentinel-do-not-echo"
  const { child, finished } = childProxy(t, {
    NETLIFY_PROXY_SIGNING_SECRET: sentinel,
    PROXY_EXPECTED_SITE_URL: "http://127.0.0.1:8890",
    PROXY_EXPECTED_NETLIFY_ID: "local-owner-site",
    PROXY_EXPECTED_DEPLOY_CONTEXT: "dev",
    DEV_PROXY_API_ORIGIN: `http://${sentinel}.example.test`,
  })
  let output = ""
  child.stdout.on("data", (chunk) => (output += chunk))
  child.stderr.on("data", (chunk) => (output += chunk))
  assert.equal(await finished, 1)
  assert.equal(output.trim(), "DEV_PROXY_CONFIGURATION_INVALID")
  assert.equal(output.includes(sentinel), false)
})

test("CLI binds loopback and drains its listener on the managed shutdown message", async (t) => {
  const { child, finished } = childProxy(t, {
    NODE_ENV: "development",
    DEV_PROXY_PORT: "0",
    NETLIFY_PROXY_SIGNING_SECRET: signingSecret,
    PROXY_EXPECTED_SITE_URL: claims.siteUrl,
    PROXY_EXPECTED_NETLIFY_ID: claims.netlifyId,
    PROXY_EXPECTED_DEPLOY_CONTEXT: claims.deployContext,
  })
  const ready = await new Promise((resolve, reject) => {
    let output = ""
    const timeout = setTimeout(
      () => reject(new Error("CLI readiness timeout")),
      3000
    )
    child.once("exit", () => {
      clearTimeout(timeout)
      reject(new Error("CLI exited before readiness"))
    })
    child.stdout.on("data", (chunk) => {
      output += chunk
      const matched = /^DEV_PROXY_READY (http:\/\/127\.0\.0\.1:\d+)\r?\n/.exec(
        output
      )
      if (matched) {
        clearTimeout(timeout)
        resolve(matched[1])
      }
    })
  })
  child.send({ type: "shutdown" })
  assert.equal(await finished, 0)
  await assert.rejects(call(ready, "/"), { code: "ECONNREFUSED" })
})
