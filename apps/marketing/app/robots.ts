import type { MetadataRoute } from "next"

import { indexable, siteOrigin } from "@/lib/site"

export const dynamic = "force-static"

/** Production allows crawling and names the sitemap; every other build refuses. */
export default function robots(): MetadataRoute.Robots {
  return indexable
    ? { rules: { userAgent: "*", allow: "/" }, sitemap: `${siteOrigin}/sitemap.xml` }
    : { rules: { userAgent: "*", disallow: "/" } }
}
