/**
 * Owner application response policy (Phase 3 hosting.md, profile O).
 * Pure functions: Proxy calls them per request; tests call them directly.
 */

export type OwnerCspOptions = {
  nonce: string
  development: boolean
  /** Adds upgrade-insecure-requests; off for http://localhost. */
  https: boolean
}

/**
 * Nonce CSP. Scripts: only nonce-bearing scripts and what they load
 * ('strict-dynamic'). Style elements: nonce. Style attributes: allowed, because
 * server-rendered Base UI and Next.js output uses them (documented exception;
 * attribute styles cannot execute script). Development adds 'unsafe-eval' for
 * React's error overlays only.
 */
export function buildOwnerCsp({ nonce, development, https }: OwnerCspOptions): string {
  if (!/^[A-Za-z0-9+/=_-]{16,}$/.test(nonce)) throw new Error("CSP_NONCE_INVALID")
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    `style-src-elem 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${development ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
  ]
  if (https) directives.push("upgrade-insecure-requests")
  return directives.join("; ")
}

/** Static headers for every owner HTML response. */
export function ownerHtmlHeaders(csp: string): Record<string, string> {
  return {
    "Content-Security-Policy": csp,
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    // Authenticated HTML must never be cached by a shared cache (NET-01).
    "Cache-Control": "private, no-store",
    // The owner application is never a search destination; marketing is.
    "X-Robots-Tag": "noindex, nofollow",
  }
}

/** 128 random bits, base64. */
export function createNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
