import type { NextConfig } from "next"

/**
 * Marketing surface (profile M): a static export served from the CDN. No
 * server, Proxy, session cookie, auth client or owner configuration exists in
 * this build. scripts/csp-headers.mjs adds the hashed CSP after export.
 */
const nextConfig: NextConfig = {
  output: "export",
  transpilePackages: ["@workspace/ui"],
  poweredByHeader: false,
  reactStrictMode: true,
  trailingSlash: false,
  images: { unoptimized: true },
}

export default nextConfig
