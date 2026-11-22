import type { MetadataRoute } from "next"

import { indexable, siteOrigin } from "@/lib/site"

export const dynamic = "force-static"

/** Lists pages only in production; legal placeholders join once their text exists. */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!indexable) return []
  return ["/", "/pricing", "/support"].map((path) => ({ url: `${siteOrigin}${path}` }))
}
