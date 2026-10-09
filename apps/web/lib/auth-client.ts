"use client"

import { createAuthClient } from "better-auth/react"
import { emailOTPClient } from "better-auth/client/plugins"
import { dashClient } from "@better-auth/infra/client"

const baseURL = process.env.NEXT_PUBLIC_API_URL
if (!baseURL)
  throw new Error("Missing client configuration: NEXT_PUBLIC_API_URL")

// Only the public API origin is exposed. No server secrets enter this module.
export const authClient = createAuthClient({
  baseURL,
  plugins: [emailOTPClient(), dashClient()],
})
