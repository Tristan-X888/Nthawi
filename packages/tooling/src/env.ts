import { z } from "zod"

import { isIP } from "node:net"

const required = z.string().refine((value) => value.trim().length > 0)
const trustedProxies = z
  .string()
  .trim()
  .default("")
  .transform((value) =>
    value === "" ? [] : value.split(",").map((address) => address.trim())
  )
  .refine((addresses) =>
    addresses.every((address) => {
      const [ip, prefix, extra] = address.split("/")
      const family = isIP(ip ?? "")
      if (family === 0 || extra !== undefined) return false
      if (prefix === undefined) return true
      return (
        /^\d+$/.test(prefix) &&
        Number(prefix) > 0 &&
        Number(prefix) <= (family === 4 ? 32 : 128)
      )
    })
  )
const httpUrl = z.url({ protocol: /^https?$/ }).refine((value) => {
  try {
    const parsed = new URL(value)
    return (
      !parsed.username && !parsed.password && !parsed.search && !parsed.hash
    )
  } catch {
    return false
  }
})
const origin = httpUrl
  .refine((value) => {
    try {
      return new URL(value).pathname === "/"
    } catch {
      return false
    }
  })
  .transform((value) => new URL(value).origin)

const trustedAuthOrigins = z
  .string()
  .trim()
  .default("")
  .transform((value) =>
    value === "" ? [] : value.split(",").map((item) => item.trim())
  )
  .pipe(z.array(origin))
const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  required.optional()
)

/** Canonical hosted owner surfaces remain protected even if NODE_ENV is wrong. */
export function isDeployedOwnerEnvironment(env: {
  NODE_ENV?: string
  WEB_ORIGIN: string
}): boolean {
  if (env.NODE_ENV === "production") return true
  try {
    return ["app-staging.nthawi.io", "app.nthawi.io"].includes(
      new URL(env.WEB_ORIGIN).hostname
    )
  } catch {
    return false
  }
}

export const serverEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    WEB_ORIGIN: origin,
    AUTH_TRUSTED_ORIGINS: trustedAuthOrigins,
    WIDGET_ORIGIN: origin,
    API_PORT: z.coerce.number().int().positive().max(65535).default(4000),
    API_TRUST_PROXY: trustedProxies,
    // Phase 5: Netlify signed owner ingress. Deployed staging uses production.
    NETLIFY_PROXY_SIGNING_SECRET: optionalSecret,
    NETLIFY_PROXY_PREVIOUS_SIGNING_SECRET: optionalSecret,
    // Unix epoch seconds. A retiring key is accepted for at most one hour.
    PROXY_PREVIOUS_KEY_VALID_UNTIL: z.coerce
      .number()
      .int()
      .positive()
      .safe()
      .optional(),
    PROXY_EXPECTED_SITE_URL: origin.optional(),
    PROXY_EXPECTED_NETLIFY_ID: required.optional(),
    PROXY_EXPECTED_DEPLOY_CONTEXT: z
      .enum(["production", "deploy-preview", "branch-deploy", "dev"])
      .optional(),
    DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
    AUTH_DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
    BETTER_AUTH_SECRET: z
      .string()
      .min(32)
      .refine((value) => value.trim().length >= 32),
    BETTER_AUTH_URL: origin,
    BETTER_AUTH_API_KEY: optionalSecret,
    GOOGLE_CLIENT_ID: required,
    GOOGLE_CLIENT_SECRET: required,
    RESEND_API_KEY: required,
    EMAIL_FROM: required.refine((value) => {
      if (/[\r\n]/.test(value)) return false
      const mailbox = /^(?:[^<>]+\s+)?<([^<>]+)>$/.exec(value)?.[1] ?? value
      return z.email().safeParse(mailbox).success
    }),
    OPENAI_API_KEY: required,
    OPENAI_CHAT_MODEL: required.default("gpt-4.1-mini-2025-04-14"),
    OPENAI_EMBEDDING_MODEL: required.default("text-embedding-3-small"),
    GLOBAL_AI_BUDGET_USD: z.coerce.number().positive().default(20),
    WORKSPACE_AI_REPLY_LIMIT: z.coerce.number().int().positive().default(100),
    MAX_APPROVED_KNOWLEDGE_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(1_048_576),
    MAX_WORKSPACE_MESSAGES: z.coerce.number().int().positive().default(10_000),
    MAX_WEBSITE_SOURCES: z.coerce.number().int().positive().default(10),
  })
  .superRefine((env, ctx) => {
    const deployedOwner = isDeployedOwnerEnvironment(env)
    const proxyFields = [
      "NETLIFY_PROXY_SIGNING_SECRET",
      "PROXY_EXPECTED_SITE_URL",
      "PROXY_EXPECTED_NETLIFY_ID",
      "PROXY_EXPECTED_DEPLOY_CONTEXT",
    ] as const
    const proxyRequired =
      deployedOwner ||
      proxyFields.some((field) => env[field] !== undefined) ||
      env.NETLIFY_PROXY_PREVIOUS_SIGNING_SECRET !== undefined ||
      env.PROXY_PREVIOUS_KEY_VALID_UNTIL !== undefined
    if (proxyRequired) {
      for (const field of proxyFields) {
        if (env[field] === undefined) {
          ctx.addIssue({
            code: "custom",
            path: [field],
            message: "Required for signed ingress.",
          })
        }
      }
      if ((env.NETLIFY_PROXY_SIGNING_SECRET?.trim().length ?? 0) < 32) {
        ctx.addIssue({
          code: "custom",
          path: ["NETLIFY_PROXY_SIGNING_SECRET"],
          message:
            "Signing secret must contain at least 32 nonblank characters.",
        })
      }
    }
    const previousSecret = env.NETLIFY_PROXY_PREVIOUS_SIGNING_SECRET
    const previousUntil = env.PROXY_PREVIOUS_KEY_VALID_UNTIL
    if (previousSecret !== undefined || previousUntil !== undefined) {
      if (
        previousSecret === undefined ||
        previousSecret.trim().length < 32 ||
        previousSecret === env.NETLIFY_PROXY_SIGNING_SECRET
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["NETLIFY_PROXY_PREVIOUS_SIGNING_SECRET"],
          message:
            "A distinct retiring signing secret of at least 32 characters is required.",
        })
      }
      if (
        previousUntil === undefined ||
        previousUntil > Math.floor(Date.now() / 1000) + 3600
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["PROXY_PREVIOUS_KEY_VALID_UNTIL"],
          message:
            "An explicit retiring-key cutoff no more than one hour ahead is required.",
        })
      }
    }
    if (!deployedOwner) return

    const validateDeployedOrigin = (
      value: string,
      path: (string | number)[]
    ) => {
      let url: URL
      try {
        url = new URL(value)
      } catch {
        // The existing origin validator reports malformed URLs.
        return
      }

      const hostname = url.hostname.replace(/^\[|\]$/g, "")
      const labels = hostname.split(".")
      if (
        url.protocol !== "https:" ||
        hostname === "localhost" ||
        hostname.endsWith(".localhost") ||
        isIP(hostname) !== 0 ||
        hostname.length > 253 ||
        labels.length < 2 ||
        !labels.every((label) =>
          /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)
        )
      ) {
        ctx.addIssue({
          code: "custom",
          path,
          message:
            "Deployment origins require HTTPS and a concrete DNS hostname.",
        })
      }
      return hostname
    }

    const ownerHostname = validateDeployedOrigin(env.WEB_ORIGIN, ["WEB_ORIGIN"])
    const widgetHostname = validateDeployedOrigin(env.WIDGET_ORIGIN, [
      "WIDGET_ORIGIN",
    ])
    validateDeployedOrigin(env.BETTER_AUTH_URL, ["BETTER_AUTH_URL"])
    if (env.PROXY_EXPECTED_SITE_URL !== undefined) {
      validateDeployedOrigin(env.PROXY_EXPECTED_SITE_URL, [
        "PROXY_EXPECTED_SITE_URL",
      ])
    }

    env.AUTH_TRUSTED_ORIGINS.forEach((value, index) => {
      const hostname = validateDeployedOrigin(value, [
        "AUTH_TRUSTED_ORIGINS",
        index,
      ])
      // Cookies are scoped by hostname; a different port cannot isolate them.
      if (widgetHostname && hostname === widgetHostname) {
        ctx.addIssue({
          code: "custom",
          path: ["AUTH_TRUSTED_ORIGINS", index],
          message:
            "The widget hostname cannot be trusted for owner authentication.",
        })
      }
    })

    if (env.BETTER_AUTH_URL !== env.WEB_ORIGIN) {
      ctx.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_URL"],
        message: "Deployed authentication must use the canonical owner origin.",
      })
    }

    if (widgetHostname && widgetHostname === ownerHostname) {
      ctx.addIssue({
        code: "custom",
        path: ["WIDGET_ORIGIN"],
        message:
          "The widget must use a separate hostname from the owner application.",
      })
    }
  })

export type ServerEnv = z.infer<typeof serverEnvSchema>

export function getAllowedAuthOrigins(
  env: Pick<ServerEnv, "WEB_ORIGIN" | "AUTH_TRUSTED_ORIGINS">
): string[] {
  return [...new Set([env.WEB_ORIGIN, ...env.AUTH_TRUSTED_ORIGINS])]
}

export function loadServerEnv(
  environment: NodeJS.ProcessEnv = process.env
): ServerEnv {
  const result = serverEnvSchema.safeParse(environment)
  if (!result.success) {
    // Do not attach the Zod error as a cause: it may contain environment values.
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ]
    throw new Error(`Invalid server configuration: ${fields.join(", ")}`)
  }
  return result.data
}
