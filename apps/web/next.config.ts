import type { NextConfig } from "next"

/**
 * The component catalogue (app/catalogue/page.catalogue.tsx) is compiled only
 * when NTHAWI_CATALOGUE=1 (local review and browser tests). Deployed builds
 * never set it, so the route does not exist there (D6-8).
 */
const catalogue = process.env.NTHAWI_CATALOGUE === "1"

const nextConfig: NextConfig = {
  transpilePackages: ["@workspace/ui"],
  poweredByHeader: false,
  reactStrictMode: true,
  pageExtensions: catalogue ? ["catalogue.tsx", "tsx", "ts"] : ["tsx", "ts"],
}

export default nextConfig
