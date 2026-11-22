"use client"

import { createAuthClient } from "better-auth/react"
import { emailOTPClient } from "better-auth/client/plugins"

/**
 * Same-origin Better Auth client (Block C5a): the browser only ever calls
 * /api/auth/* on the owner origin, which the signed proxy forwards to the API.
 * No API host, secret or server configuration reaches the browser.
 *
 * The infrastructure dashboard client was removed (F7, SEC-02): the matching
 * server plugin is disabled and must stay disabled while it can bypass the
 * account-deletion journal.
 */
export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [emailOTPClient()],
})
