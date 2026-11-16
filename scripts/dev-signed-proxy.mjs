import { createHmac, randomUUID } from "node:crypto"
import { createServer, request } from "node:http"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

function localOrigin(value) {
  try {
    if (typeof value !== "string" || /[\s\x00-\x1f\x7f]/.test(value)) {
      throw new Error()
    }
    const url = new URL(value)
    if (
      url.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      throw new Error()
    }
    return url.origin
  } catch {
    throw new Error("DEV_PROXY_CONFIGURATION_INVALID")
  }
}

function refuse(response, status, code) {
  response.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  })
  response.end(
    JSON.stringify({
      code,
      message: "The local proxy could not complete this request.",
      correlationId: randomUUID(),
    })
  )
}

function endUnsupportedProtocol(_request, socket) {
  socket.end(
    "HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\nContent-Length: 0\r\nCache-Control: no-store\r\n\r\n"
  )
}

function endToEndHeaders(original) {
  const headers = { ...original }
  const names = [
    "connection",
    "proxy-connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    ...(original.connection ?? "")
      .split(",")
      .map((name) => name.trim().toLowerCase()),
  ]
  for (const name of names) delete headers[name]
  return headers
}

/** Local-only equivalent of Netlify's signed owner API rewrites. */
export function createSignedProxy({
  apiOrigin,
  webOrigin,
  signingSecret,
  siteUrl,
  netlifyId,
  deployContext,
  upstreamTimeoutMillis = 25_000,
}) {
  apiOrigin = localOrigin(apiOrigin)
  webOrigin = localOrigin(webOrigin)
  siteUrl = localOrigin(siteUrl)
  if (
    typeof signingSecret !== "string" ||
    signingSecret.trim().length < 32 ||
    !Number.isInteger(upstreamTimeoutMillis) ||
    upstreamTimeoutMillis < 1 ||
    upstreamTimeoutMillis > 26_000 ||
    ![netlifyId, deployContext].every(
      (value) => typeof value === "string" && /^[\w.-]{1,256}$/.test(value)
    )
  ) {
    throw new Error("DEV_PROXY_CONFIGURATION_INVALID")
  }
  const server = createServer((incoming, response) => {
    let relative
    try {
      if (
        !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
          incoming.socket.remoteAddress
        ) ||
        !incoming.url.startsWith("/") ||
        incoming.url.startsWith("//") ||
        incoming.url.includes("\\")
      ) {
        throw new Error()
      }
      const requestedOrigin = localOrigin(`http://${incoming.headers.host}`)
      if (
        Number(new URL(requestedOrigin).port || 80) !==
        incoming.socket.localPort
      ) {
        throw new Error()
      }
      relative = new URL(incoming.url, "http://proxy.invalid")
    } catch {
      refuse(response, 400, "DEV_PROXY_REQUEST_INVALID")
      return
    }
    const pathname = relative.pathname
    const isApi = /^\/api\/(?:auth|v1)(?:\/|$)/.test(pathname)
    const target = new URL(isApi ? apiOrigin : webOrigin)
    target.pathname = relative.pathname
    target.search = relative.search
    const headers = {
      ...endToEndHeaders(incoming.headers),
      // Next.js must construct redirects for the browser-facing local origin.
      host: isApi ? target.host : incoming.headers.host,
    }
    for (const name of Object.keys(headers)) {
      if (
        name === "forwarded" ||
        name.startsWith("x-forwarded-") ||
        name === "x-nf-sign" ||
        name === "x-nf-client-connection-ip" ||
        name === "x-real-ip" ||
        name === "true-client-ip"
      ) {
        delete headers[name]
      }
    }
    if (isApi) {
      headers["x-nf-client-connection-ip"] = incoming.socket.remoteAddress
      const header = Buffer.from(
        JSON.stringify({ alg: "HS256", typ: "JWT" })
      ).toString("base64url")
      const payload = Buffer.from(
        JSON.stringify({
          iss: "netlify",
          exp: Math.floor(Date.now() / 1000) + 60,
          site_url: siteUrl,
          netlify_id: netlifyId,
          deploy_context: deployContext,
        })
      ).toString("base64url")
      const signature = createHmac("sha256", signingSecret)
        .update(`${header}.${payload}`)
        .digest("base64url")
      headers["x-nf-sign"] = `${header}.${payload}.${signature}`
    }
    let timedOut = false
    const transport = new URL(target)
    // Never resolve a "localhost" target through configurable DNS or hosts.
    if (transport.hostname === "localhost") transport.hostname = "127.0.0.1"
    const upstream = request(
      transport,
      { method: incoming.method, headers },
      (res) => {
        response.writeHead(res.statusCode, endToEndHeaders(res.headers))
        res.on("error", () => response.destroy())
        res.pipe(response)
      }
    )
    const deadline = setTimeout(() => {
      timedOut = true
      upstream.destroy(new Error("DEV_PROXY_UPSTREAM_TIMEOUT"))
    }, upstreamTimeoutMillis)
    response.once("close", () => {
      clearTimeout(deadline)
      upstream.destroy()
    })
    response.once("finish", () => clearTimeout(deadline))
    incoming.once("aborted", () => upstream.destroy())
    upstream.on("error", () => {
      if (response.destroyed) return
      if (response.headersSent) return response.destroy()
      refuse(
        response,
        timedOut ? 504 : 502,
        timedOut
          ? "DEV_PROXY_UPSTREAM_TIMEOUT"
          : "DEV_PROXY_UPSTREAM_UNAVAILABLE"
      )
    })
    incoming.pipe(upstream)
  })
  server.on("connect", endUnsupportedProtocol)
  server.on("upgrade", endUnsupportedProtocol)
  return server
}

async function run() {
  let server
  try {
    const portValue = process.env.DEV_PROXY_PORT ?? "8890"
    if (
      process.env.NODE_ENV === "production" ||
      !/^\d{1,5}$/.test(portValue) ||
      Number(portValue) > 65535
    ) {
      throw new Error("DEV_PROXY_CONFIGURATION_INVALID")
    }
    server = createSignedProxy({
      apiOrigin: process.env.DEV_PROXY_API_ORIGIN ?? "http://127.0.0.1:4500",
      webOrigin: process.env.DEV_PROXY_WEB_ORIGIN ?? "http://127.0.0.1:3000",
      signingSecret: process.env.NETLIFY_PROXY_SIGNING_SECRET,
      siteUrl: process.env.PROXY_EXPECTED_SITE_URL,
      netlifyId: process.env.PROXY_EXPECTED_NETLIFY_ID,
      deployContext: process.env.PROXY_EXPECTED_DEPLOY_CONTEXT,
    })
    await new Promise((resolveListen, reject) => {
      server.once("error", reject)
      server.listen(
        { port: Number(portValue), host: "127.0.0.1", exclusive: true },
        resolveListen
      )
    })
    let stopping = false
    const stop = () => {
      if (stopping) return
      stopping = true
      const deadline = setTimeout(() => server.closeAllConnections(), 5_000)
      deadline.unref()
      server.close(() => {
        clearTimeout(deadline)
        if (process.connected) process.disconnect()
      })
    }
    process.once("SIGINT", stop)
    process.once("SIGTERM", stop)
    process.on("message", (message) => {
      if (message?.type === "shutdown") stop()
    })
    process.stdout.write(
      `DEV_PROXY_READY http://127.0.0.1:${server.address().port}\n`
    )
  } catch (error) {
    if (server?.listening) server.close()
    process.stderr.write(
      error?.message === "DEV_PROXY_CONFIGURATION_INVALID"
        ? "DEV_PROXY_CONFIGURATION_INVALID\n"
        : "DEV_PROXY_START_FAILED\n"
    )
    if (process.connected) process.disconnect()
    process.exitCode = 1
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await run()
}
