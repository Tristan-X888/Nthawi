"use client"

/**
 * Applies the request nonce to inline <style>/<script> tags that Base UI
 * components render, so they run under the owner application's strict CSP.
 */
export { CSPProvider } from "@base-ui/react/csp-provider"
