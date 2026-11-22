import { createServer } from "node:http"
import { existsSync, readFileSync, statSync } from "node:fs"
import { extname, join, normalize, resolve, sep } from "node:path"

/*
 * Local stand-in for the Netlify CDN: serves the static export with the
 * generated _headers rule so browser tests exercise the real hashed CSP.
 * Loopback only; not a production server.
 */
const root = resolve(process.argv[2] ?? "out")
const port = Number(process.env.NTHAWI_MARKETING_PORT ?? 3610)
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
}

function siteHeaders() {
  const file = join(root, "_headers")
  if (!existsSync(file))
    throw new Error("Run the marketing build first: out/_headers is missing.")
  const headers = {}
  for (const line of readFileSync(file, "utf8").split("\n").slice(1)) {
    const index = line.indexOf(":")
    if (index > 0)
      headers[line.slice(0, index).trim()] = line.slice(index + 1).trim()
  }
  return headers
}

function resolveFile(pathname) {
  const decoded = decodeURIComponent(pathname)
  const candidates = [decoded, `${decoded}.html`, join(decoded, "index.html")]
  for (const candidate of candidates) {
    const full = normalize(join(root, candidate))
    if (full !== root && !full.startsWith(root + sep)) return undefined
    if (existsSync(full) && statSync(full).isFile()) return full
  }
  return undefined
}

const headers = siteHeaders()
createServer((request, response) => {
  let pathname = "/"
  try {
    pathname = new URL(request.url ?? "/", "http://localhost").pathname
  } catch {
    // fall through to 404
  }
  let file
  try {
    file = resolveFile(pathname)
  } catch {
    file = undefined
  }
  const status = file ? 200 : 404
  const body = readFileSync(file ?? join(root, "404.html"))
  const type = types[extname(file ?? ".html")] ?? "application/octet-stream"
  response.writeHead(status, {
    ...headers,
    "Content-Type": type,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": pathname.startsWith("/_next/static/")
      ? "public, max-age=31536000, immutable"
      : "max-age=0, must-revalidate",
  })
  response.end(body)
}).listen(port, "127.0.0.1", () => {
  console.log(`Marketing preview on http://127.0.0.1:${port}`)
})
