import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import {
  buildMarketingCsp,
  collectInlineSources,
  writeHeadersFile,
} from "../scripts/csp-headers.mjs"

const sha = (text) =>
  `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`

test("hashes executable inline scripts exactly as written", () => {
  const html = `<html><head><script>self.__next_f=[]</script>
<script src="/_next/static/chunks/main.js" async=""></script>
<script type="application/ld+json">{"@type":"Organization"}</script>
<script type="module">import "/x.js"</script></head></html>`
  const sources = collectInlineSources(html)
  assert.deepEqual(sources.scripts, [
    sha("self.__next_f=[]"),
    sha('import "/x.js"'),
  ])
  assert.deepEqual(sources.styles, [])
  assert.equal(sources.styleAttributes, false)
})

test("hashes inline style elements and detects style attributes", () => {
  const html = `<style>.a{color:red}</style><div style="color:blue"></div>`
  const sources = collectInlineSources(html)
  assert.deepEqual(sources.styles, [sha(".a{color:red}")])
  assert.equal(sources.styleAttributes, true)
})

test("an empty inline script is still hashed (browsers check it)", () => {
  assert.deepEqual(collectInlineSources("<script></script>").scripts, [sha("")])
})

test("CSP allows only self plus the hashes, and never unsafe-inline scripts", () => {
  const csp = buildMarketingCsp({
    scripts: ["'sha256-a'", "'sha256-b'"],
    styles: [],
    styleAttributes: false,
    https: true,
  })
  assert.match(csp, /script-src 'self' 'sha256-a' 'sha256-b'(;|$)/)
  assert.match(csp, /style-src 'self'(;|$)/)
  assert.doesNotMatch(csp, /unsafe-inline/)
  assert.doesNotMatch(csp, /unsafe-eval/)
  assert.doesNotMatch(csp, /strict-dynamic/)
  assert.match(csp, /frame-ancestors 'none'/)
  assert.match(csp, /upgrade-insecure-requests/)
})

test("style attributes add only style-src-attr, never script relaxation", () => {
  const csp = buildMarketingCsp({
    scripts: [],
    styles: [],
    styleAttributes: true,
    https: false,
  })
  assert.match(csp, /style-src-attr 'unsafe-inline'/)
  assert.doesNotMatch(csp, /script-src[^;]*unsafe/)
  assert.doesNotMatch(csp, /upgrade-insecure-requests/)
})

test("writes one site-wide _headers rule from every exported page", () => {
  const dir = mkdtempSync(join(tmpdir(), "nthawi-csp-"))
  try {
    mkdirSync(join(dir, "legal"))
    writeFileSync(join(dir, "index.html"), "<script>one()</script>")
    writeFileSync(
      join(dir, "legal", "terms.html"),
      "<script>two()</script><script>one()</script>"
    )
    writeFileSync(join(dir, "404.html"), "<style>p{}</style>")
    const result = writeHeadersFile(dir, { https: true })
    assert.equal(result.pages, 3)
    const headers = readFileSync(join(dir, "_headers"), "utf8")
    assert.match(headers, /^\/\*\n {2}Content-Security-Policy: /)
    for (const hash of [sha("one()"), sha("two()")])
      assert.ok(headers.includes(hash))
    assert.ok(headers.includes(sha("p{}")))
    // Each hash appears once even when several pages share a script.
    assert.equal(headers.split(sha("one()")).length - 1, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("refuses to write headers when no pages were exported", () => {
  const dir = mkdtempSync(join(tmpdir(), "nthawi-csp-empty-"))
  try {
    assert.throws(
      () => writeHeadersFile(dir, { https: true }),
      /MARKETING_EXPORT_EMPTY/
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
