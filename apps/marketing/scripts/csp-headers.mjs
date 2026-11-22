import { createHash } from "node:crypto"
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

/*
 * Profile M (Phase 3 hosting.md): "CSP without inline script except hashes".
 * After `next build` exports static HTML, hash every inline <script> and
 * <style> element and publish ONE site-wide policy in Netlify's _headers.
 * One rule avoids Netlify merging several matching CSP headers, which browsers
 * would enforce as an intersection and break pages (including 404.html, which
 * is served at arbitrary paths).
 */

const executableTypes = new Set([
  "",
  "text/javascript",
  "application/javascript",
  "module",
])

const hash = (text) =>
  `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`

/** Inline sources in document order, de-duplicated. */
export function collectInlineSources(html) {
  const scripts = []
  const styles = []
  for (const match of html.matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  )) {
    const attributes = match[1] ?? ""
    if (/\ssrc\s*=/i.test(attributes)) continue
    const type = (
      /\stype\s*=\s*["']?([^"'\s>]+)/i.exec(attributes)?.[1] ?? ""
    ).toLowerCase()
    if (!executableTypes.has(type)) continue
    const value = hash(match[2] ?? "")
    if (!scripts.includes(value)) scripts.push(value)
  }
  for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const value = hash(match[1] ?? "")
    if (!styles.includes(value)) styles.push(value)
  }
  // Attribute styles cannot run script; they need style-src-attr only.
  const styleAttributes = /<[a-z][^>]*\sstyle\s*=\s*["']/i.test(html)
  return { scripts, styles, styleAttributes }
}

export function buildMarketingCsp({ scripts, styles, styleAttributes, https }) {
  const directives = [
    "default-src 'self'",
    ["script-src 'self'", ...scripts].join(" "),
    ["style-src 'self'", ...styles].join(" "),
    ["style-src-elem 'self'", ...styles].join(" "),
    `style-src-attr ${styleAttributes ? "'unsafe-inline'" : "'none'"}`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
  ]
  if (https) directives.push("upgrade-insecure-requests")
  return directives.join("; ")
}

function htmlFiles(directory) {
  const files = []
  for (const name of readdirSync(directory)) {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) files.push(...htmlFiles(path))
    else if (name.endsWith(".html")) files.push(path)
  }
  return files
}

/** Writes <outDir>/_headers and returns a summary for the build log. */
export function writeHeadersFile(outDir, { https }) {
  const pages = htmlFiles(outDir)
  if (pages.length === 0) throw new Error("MARKETING_EXPORT_EMPTY")
  const combined = { scripts: [], styles: [], styleAttributes: false }
  for (const page of pages) {
    const sources = collectInlineSources(readFileSync(page, "utf8"))
    for (const value of sources.scripts)
      if (!combined.scripts.includes(value)) combined.scripts.push(value)
    for (const value of sources.styles)
      if (!combined.styles.includes(value)) combined.styles.push(value)
    combined.styleAttributes ||= sources.styleAttributes
  }
  const csp = buildMarketingCsp({ ...combined, https })
  writeFileSync(
    join(outDir, "_headers"),
    `/*\n  Content-Security-Policy: ${csp}\n`,
    "utf8"
  )
  return {
    pages: pages.length,
    scriptHashes: combined.scripts.length,
    styleHashes: combined.styles.length,
    styleAttributes: combined.styleAttributes,
    bytes: csp.length,
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const outDir = resolve(process.argv[2] ?? "out")
  // Local previews run on http://127.0.0.1; deployed staging/production use HTTPS.
  const https = ["staging", "production"].includes(
    process.env.NEXT_PUBLIC_SITE_ENV ?? ""
  )
  const summary = writeHeadersFile(outDir, { https })
  console.log(
    `Marketing CSP: ${summary.pages} pages, ${summary.scriptHashes} script hashes, ${summary.styleHashes} style hashes, style attributes ${summary.styleAttributes ? "allowed" : "blocked"}, ${summary.bytes} bytes.`
  )
}
