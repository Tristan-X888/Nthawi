/**
 * Build-time surface selection. NEXT_PUBLIC_SITE_ENV is public by design: it
 * selects among the fixed origins of Block C5a and carries no secret.
 */
export type SiteEnv = "local" | "staging" | "production"

const raw = process.env.NEXT_PUBLIC_SITE_ENV
export const siteEnv: SiteEnv =
  raw === "production" ? "production" : raw === "staging" ? "staging" : "local"

const origins: Record<SiteEnv, { site: string; app: string }> = {
  local: { site: "http://127.0.0.1:3610", app: "http://127.0.0.1:3600" },
  staging: {
    site: "https://staging.nthawi.io",
    app: "https://app-staging.nthawi.io",
  },
  production: { site: "https://www.nthawi.io", app: "https://app.nthawi.io" },
}

export const siteOrigin = origins[siteEnv].site
export const appOrigin = origins[siteEnv].app
/** Only production is indexed; staging and local builds are noindex. */
export const indexable = siteEnv === "production"
