import { NextResponse, type NextRequest } from "next/server"

import {
  buildOwnerCsp,
  createNonce,
  ownerHtmlHeaders,
} from "@/lib/security-headers"

/**
 * Per-request nonce CSP and the profile O response policy for every owner
 * page. Next.js reads the nonce from the request CSP header and applies it to
 * its own scripts; layouts read `x-nonce` for theme and Base UI tags.
 */
export function proxy(request: NextRequest) {
  const nonce = createNonce()
  const csp = buildOwnerCsp({
    nonce,
    development: process.env.NODE_ENV === "development",
    https: request.nextUrl.protocol === "https:",
  })

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  for (const [name, value] of Object.entries(ownerHtmlHeaders(csp))) {
    response.headers.set(name, value)
  }
  return response
}

export const config = {
  matcher: [
    {
      // /api/* is forwarded to the API by the signed proxy before Next.js.
      source: "/((?!api/|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
}
