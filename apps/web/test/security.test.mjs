import assert from "node:assert/strict"
import { test } from "node:test"

import { safeReturnPath } from "../lib/return-path.ts"
import {
  buildOwnerCsp,
  createNonce,
  ownerHtmlHeaders,
} from "../lib/security-headers.ts"

test("return paths keep same-origin relative destinations", () => {
  assert.equal(safeReturnPath("/"), "/")
  assert.equal(
    safeReturnPath("/w/0b6f/settings?tab=security#sessions"),
    "/w/0b6f/settings?tab=security#sessions"
  )
  assert.equal(safeReturnPath("/a/../b"), "/b")
})

for (const hostile of [
  "https://evil.example/",
  "//evil.example",
  "///evil.example",
  "/\\evil.example",
  "\\\\evil.example",
  "/%2F%2Fevil.example",
  "/%5Cevil.example",
  "javascript:alert(1)",
  "  /settings",
  "/settings\nx",
  "evil.example",
  "",
  "/%E0%A4%A",
  `/${"a".repeat(2048)}`,
]) {
  test(`return paths reject ${JSON.stringify(hostile.slice(0, 40))}`, () => {
    assert.equal(safeReturnPath(hostile), "/")
  })
}

test("return paths reject non-strings", () => {
  assert.equal(safeReturnPath(undefined), "/")
  assert.equal(safeReturnPath(null), "/")
  assert.equal(safeReturnPath("//x", "/w"), "/w")
})

test("owner CSP is nonce-based, strict-dynamic and frame-denying", () => {
  const csp = buildOwnerCsp({
    nonce: "abcdefghijklmnop0123",
    development: false,
    https: true,
  })
  assert.match(
    csp,
    /script-src 'self' 'nonce-abcdefghijklmnop0123' 'strict-dynamic'(;|$)/
  )
  assert.match(csp, /frame-ancestors 'none'/)
  assert.match(csp, /object-src 'none'/)
  assert.match(csp, /base-uri 'none'/)
  assert.match(csp, /upgrade-insecure-requests/)
  assert.doesNotMatch(csp, /unsafe-eval/)
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/)
})

test("development CSP adds only eval and HMR sockets", () => {
  const csp = buildOwnerCsp({
    nonce: "abcdefghijklmnop0123",
    development: true,
    https: false,
  })
  assert.match(csp, /'unsafe-eval'/)
  assert.match(csp, /connect-src 'self' ws: wss:/)
  assert.doesNotMatch(csp, /upgrade-insecure-requests/)
})

test("CSP refuses a malformed nonce (header injection guard)", () => {
  assert.throws(
    () =>
      buildOwnerCsp({
        nonce: "x'; script-src *",
        development: false,
        https: true,
      }),
    /CSP_NONCE_INVALID/
  )
})

test("nonces are unique 128-bit base64 values", () => {
  const values = new Set(Array.from({ length: 200 }, createNonce))
  assert.equal(values.size, 200)
  for (const value of values) assert.match(value, /^[A-Za-z0-9+/]{22}==$/)
})

test("owner HTML is private, uncacheable, unframeable and unindexed", () => {
  const headers = ownerHtmlHeaders("default-src 'self'")
  assert.equal(headers["Cache-Control"], "private, no-store")
  assert.equal(headers["X-Frame-Options"], "DENY")
  assert.equal(headers["X-Content-Type-Options"], "nosniff")
  assert.equal(headers["Cross-Origin-Opener-Policy"], "same-origin")
  assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin")
  assert.equal(headers["X-Robots-Tag"], "noindex, nofollow")
})
