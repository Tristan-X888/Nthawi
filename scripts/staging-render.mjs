import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

/** Pure configuration generation. Never authenticates, provisions or deploys. */
export function createStagingApiBlueprint({ sourceSha, imageDigest }) {
  if (
    typeof sourceSha !== "string" ||
    !/^[a-f0-9]{40}$/.test(sourceSha) ||
    /^0+$/.test(sourceSha) ||
    typeof imageDigest !== "string" ||
    !/^ghcr\.io\/tristan-x888\/nthawi-api@sha256:[a-f0-9]{64}$/.test(
      imageDigest
    )
  ) {
    throw new Error("STAGING_ARTIFACT_INVALID")
  }
  const value = (key, contents) => ({ key, value: contents })
  return {
    previews: { generation: "off" },
    projects: [
      {
        name: "nthawi",
        environments: [
          {
            name: "staging",
            networking: { isolation: "enabled" },
            permissions: { protection: "enabled" },
            services: [
              {
                type: "web",
                name: "nthawi-api-staging",
                runtime: "image",
                image: { url: imageDigest },
                region: "frankfurt",
                plan: "1c-2g",
                numInstances: 1,
                autoDeployTrigger: "off",
                healthCheckPath: "/health/ready",
                maxShutdownDelaySeconds: 60,
                domains: ["api-staging.nthawi.io"],
                envVars: [
                  value("NODE_ENV", "production"),
                  value("PORT", "4000"),
                  value("API_PORT", "4000"),
                  value("API_TRUST_PROXY", ""),
                  value("WEB_ORIGIN", "https://app-staging.nthawi.io"),
                  value("BETTER_AUTH_URL", "https://app-staging.nthawi.io"),
                  value("WIDGET_ORIGIN", "https://widget-staging.nthawi.io"),
                  value("PROXY_EXPECTED_DEPLOY_CONTEXT", "production"),
                  value("NTHAWI_SOURCE_SHA", sourceSha),
                  ...[
                    "DATABASE_URL",
                    "AUTH_DATABASE_URL",
                    "BETTER_AUTH_SECRET",
                    "NETLIFY_PROXY_SIGNING_SECRET",
                    "PROXY_EXPECTED_SITE_URL",
                    "PROXY_EXPECTED_NETLIFY_ID",
                    "GOOGLE_CLIENT_ID",
                    "GOOGLE_CLIENT_SECRET",
                    "RESEND_API_KEY",
                    "EMAIL_FROM",
                    "OPENAI_API_KEY",
                  ].map((key) => ({ key, sync: false })),
                ],
              },
            ],
          },
        ],
      },
    ],
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    if (process.argv.length !== 4) throw new Error("STAGING_ARTIFACT_INVALID")
    const [, , sourceSha, imageDigest] = process.argv
    console.log(
      JSON.stringify(
        createStagingApiBlueprint({ sourceSha, imageDigest }),
        null,
        2
      )
    )
  } catch {
    console.error("STAGING_ARTIFACT_INVALID")
    process.exitCode = 1
  }
}
