# Complete authentication implementation code

Read [the implementation and setup walkthrough](authentication-setup.md) first.

This appendix contains the complete contents of each listed implementation, test, configuration and template file at handoff. It contains no private `.env` file. Source files remain authoritative after future edits. Existing application tables and the initial migration remain in `packages/db/src/schema/app.ts` and `packages/db/drizzle/0000_initial_app.sql`; generated Drizzle snapshots remain alongside the migration journal. The dependency lockfile remains at repository root.

## 1. packages/tooling/src/env.ts

[Open source](../../packages/tooling/src/env.ts)

SHA-256 of the source normalized to LF: `1ae7e63bcc41f49d4cbffd29b3c98c7753a49b351ea746ec5bcc08f14e1705ae`

```ts
import { z } from "zod"

const required = z.string().refine((value) => value.trim().length > 0)
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
const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  required.optional()
)

export const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  WEB_ORIGIN: origin,
  WIDGET_ORIGIN: origin,
  API_PORT: z.coerce.number().int().positive().max(65535).default(4000),
  DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
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

export type ServerEnv = z.infer<typeof serverEnvSchema>

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
```

## 2. packages/tooling/scripts/check-env.mjs

[Open source](../../packages/tooling/scripts/check-env.mjs)

SHA-256 of the source normalized to LF: `e6f56dcaf331ed712741eeb4fddd449e1cc7526c50a5fa4e1881a192e0cde83f`

```js
import { existsSync } from "node:fs"
import { loadEnvFile } from "node:process"
import { fileURLToPath } from "node:url"
import { loadServerEnv } from "../dist/env.js"

const localEnv = new URL("../../../.env", import.meta.url)
if (existsSync(localEnv)) loadEnvFile(fileURLToPath(localEnv))
try {
  loadServerEnv()
  console.log("Server configuration is valid. No values were printed.")
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Invalid server configuration"
  )
  process.exitCode = 1
}
```

## 3. packages/tooling/test/env.test.ts

[Open source](../../packages/tooling/test/env.test.ts)

SHA-256 of the source normalized to LF: `ff5311a84415339a56b2c332a0bdd1d1cab60b42e381cf35a24ad26201c4a455`

```ts
import assert from "node:assert/strict"
import { inspect } from "node:util"
import { test } from "node:test"
import { loadServerEnv } from "../src/env.ts"

function validEnv(): NodeJS.ProcessEnv {
  return {
    WEB_ORIGIN: "http://localhost:3000",
    WIDGET_ORIGIN: "http://localhost:5173",
    DATABASE_URL: "postgresql://test:test@localhost:5433/test",
    BETTER_AUTH_SECRET: "test-only-secret-with-at-least-32-characters",
    BETTER_AUTH_URL: "http://localhost:4000",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    RESEND_API_KEY: "test-resend-key",
    EMAIL_FROM: "Nthawi <auth@example.test>",
    OPENAI_API_KEY: "test-openai-key",
  }
}

test("loads documented defaults, coerces numbers, and strips unrelated variables", () => {
  const env = loadServerEnv({
    ...validEnv(),
    API_PORT: "4100",
    GLOBAL_AI_BUDGET_USD: "2.5",
    UNRELATED_SECRET: "never-return-this",
  })
  assert.equal(env.NODE_ENV, "development")
  assert.equal(env.API_PORT, 4100)
  assert.equal(env.GLOBAL_AI_BUDGET_USD, 2.5)
  assert.equal(env.OPENAI_CHAT_MODEL, "gpt-4.1-mini-2025-04-14")
  assert.equal(env.OPENAI_EMBEDDING_MODEL, "text-embedding-3-small")
  assert.equal(env.WORKSPACE_AI_REPLY_LIMIT, 100)
  assert.equal(env.MAX_APPROVED_KNOWLEDGE_BYTES, 1_048_576)
  assert.equal(env.MAX_WORKSPACE_MESSAGES, 10_000)
  assert.equal(env.MAX_WEBSITE_SOURCES, 10)
  assert.equal("UNRELATED_SECRET" in env, false)
  assert.equal(loadServerEnv(validEnv()).API_PORT, 4000)
})

test("validation errors expose only field names, including malformed URL inputs", () => {
  const sentinel = "sensitive-value-must-not-appear"
  try {
    loadServerEnv({
      ...validEnv(),
      NODE_ENV: sentinel,
      WEB_ORIGIN: sentinel,
      API_PORT: sentinel,
      BETTER_AUTH_SECRET: "short-private-value",
    })
    assert.fail("invalid configuration must throw")
  } catch (error) {
    assert.ok(error instanceof Error)
    assert.equal(
      error.message,
      "Invalid server configuration: NODE_ENV, WEB_ORIGIN, API_PORT, BETTER_AUTH_SECRET"
    )
    assert.equal(error.cause, undefined)
    assert.equal(inspect(error).includes(sentinel), false)
    assert.equal(inspect(error).includes("short-private-value"), false)
  }
})

for (const field of [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "OPENAI_API_KEY",
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
]) {
  test(`${field} is required and rejects empty or whitespace-only values`, () => {
    for (const value of [undefined, "", " "]) {
      assert.throws(
        () => loadServerEnv({ ...validEnv(), [field]: value }),
        new RegExp(field)
      )
    }
  })
}

for (const field of [
  "API_PORT",
  "WORKSPACE_AI_REPLY_LIMIT",
  "MAX_APPROVED_KNOWLEDGE_BYTES",
  "MAX_WORKSPACE_MESSAGES",
  "MAX_WEBSITE_SOURCES",
]) {
  test(`${field} rejects zero, negatives, fractions and nonfinite values`, () => {
    for (const value of ["0", "-1", "1.5", "NaN", "Infinity", ""]) {
      assert.throws(
        () => loadServerEnv({ ...validEnv(), [field]: value }),
        new RegExp(field)
      )
    }
  })
}

test("validates real HTTP origins, PostgreSQL URLs, sender mailboxes and port range", () => {
  for (const WEB_ORIGIN of [
    "ftp://host.test",
    "https://host.test/path",
    "https://user:secret@host.test",
    "https://host.test?secret=value",
  ]) {
    assert.throws(
      () => loadServerEnv({ ...validEnv(), WEB_ORIGIN }),
      /WEB_ORIGIN/
    )
  }
  assert.equal(
    loadServerEnv({ ...validEnv(), WEB_ORIGIN: "https://host.test/" })
      .WEB_ORIGIN,
    "https://host.test"
  )
  assert.throws(
    () => loadServerEnv({ ...validEnv(), DATABASE_URL: "https://db.test" }),
    /DATABASE_URL/
  )
  assert.throws(
    () => loadServerEnv({ ...validEnv(), API_PORT: "65536" }),
    /API_PORT/
  )
  assert.throws(
    () =>
      loadServerEnv({
        ...validEnv(),
        EMAIL_FROM: "auth@example.test\r\nBcc:other@example.test",
      }),
    /EMAIL_FROM/
  )
})

test("dashboard key is optional and blank does not silently enable the plugin", () => {
  assert.equal(loadServerEnv(validEnv()).BETTER_AUTH_API_KEY, undefined)
  assert.equal(
    loadServerEnv({ ...validEnv(), BETTER_AUTH_API_KEY: "" })
      .BETTER_AUTH_API_KEY,
    undefined
  )
  assert.throws(
    () => loadServerEnv({ ...validEnv(), BETTER_AUTH_API_KEY: " " }),
    /BETTER_AUTH_API_KEY/
  )
})
```

## 4. packages/tooling/package.json

[Open source](../../packages/tooling/package.json)

SHA-256 of the source normalized to LF: `119cc60956abdffc6ba6dbe4eb7b8fea89731329ac02a64266fd597d9dfb3273`

```json
{
  "name": "@nthawi/tooling",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./env": {
      "types": "./dist/env.d.ts",
      "default": "./dist/env.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "node --test test/env.test.ts",
    "env:check": "node scripts/check-env.mjs"
  },
  "dependencies": {
    "zod": "4.6.5"
  },
  "devDependencies": {
    "@types/node": "24.19.0"
  }
}
```

## 5. packages/tooling/tsconfig.json

[Open source](../../packages/tooling/tsconfig.json)

SHA-256 of the source normalized to LF: `555c5ac045f302e07b2c2747796e2ecc25ff0bf0605280dc98241e03f5b75e41`

```json
{
  "extends": "../typescript-config/base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

## 6. apps/api/src/auth/auth.ts

[Open source](../../apps/api/src/auth/auth.ts)

SHA-256 of the source normalized to LF: `4b0600d61c64f769f119e3635f0e3ad6df977688f232bc24790fb2dc6a20cba3`

```ts
import { existsSync } from "node:fs"
import { loadEnvFile } from "node:process"
import { fileURLToPath } from "node:url"
import { createDatabase } from "@nthawi/db"
import { loadServerEnv } from "@nthawi/tooling/env"
import { createAuth } from "./create-auth.js"

// Source and compiled entry points have the same depth beneath the repo root.
// Injected deployment variables take precedence over this optional local file.
const localEnv = new URL("../../../../.env", import.meta.url)
if (existsSync(localEnv)) loadEnvFile(fileURLToPath(localEnv))

// Validate before opening a pool or constructing authentication services.
export const serverEnv = loadServerEnv()
export const authDatabase = createDatabase(serverEnv.DATABASE_URL)
export const auth = createAuth(serverEnv, authDatabase.db)
```

## 7. apps/api/src/auth/create-auth.ts

[Open source](../../apps/api/src/auth/create-auth.ts)

SHA-256 of the source normalized to LF: `66b09503670919d8e085d08f70805a7be4ce353754af8d928bc1e1634363082c`

```ts
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { dash } from "@better-auth/infra"
import { emailOTP } from "better-auth/plugins"
import type { AppDatabase } from "@nthawi/db"
import type { ServerEnv } from "@nthawi/tooling/env"
import { createAuthEmailSender, type SendAuthEmail } from "./email.js"

export function createAuth(
  env: ServerEnv,
  database: AppDatabase,
  sendEmail: SendAuthEmail = createAuthEmailSender(env)
) {
  return betterAuth({
    appName: "Nthawi",
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.WEB_ORIGIN],
    database: drizzleAdapter(database, { provider: "pg", transaction: true }),
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, url }) {
        await sendEmail({
          to: user.email,
          subject: "Reset your Nthawi password",
          text: `Reset your Nthawi password using this link:\n\n${url}\n\nIf you did not request this, ignore this email.`,
        })
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 3 },
      },
    },
    advanced: {
      useSecureCookies: env.NODE_ENV === "production",
      database: { generateId: "uuid" },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
        storeOTP: "hashed",
        overrideDefaultEmailVerification: true,
        async sendVerificationOTP({ email, otp, type }) {
          const purpose = {
            "sign-in": "sign in to Nthawi",
            "email-verification": "verify your Nthawi email",
            "forget-password": "reset your Nthawi password",
            "change-email": "change your Nthawi email",
          }[type]
          await sendEmail({
            to: email,
            subject: "Your Nthawi verification code",
            text: `Your code to ${purpose} is ${otp}.\n\nIt expires in 5 minutes. Never share this code. If you did not request it, ignore this email.`,
          })
        },
      }),
      ...(env.BETTER_AUTH_API_KEY
        ? [
            dash({
              apiKey: env.BETTER_AUTH_API_KEY,
              // Keep the generated identity schema stable with or without dashboard access.
              activityTracking: { enabled: false },
            }),
          ]
        : []),
    ],
  })
}

export type NthawiAuth = ReturnType<typeof createAuth>
```

## 8. apps/api/src/auth/email.ts

[Open source](../../apps/api/src/auth/email.ts)

SHA-256 of the source normalized to LF: `3b6ffdd6384707931936f889d1967f3e10bb669c61c9a69c7298ec9245e8ba54`

```ts
import type { ServerEnv } from "@nthawi/tooling/env"

export interface AuthEmail {
  to: string
  subject: string
  text: string
}
export type SendAuthEmail = (message: AuthEmail) => Promise<void>

export function createAuthEmailSender(
  env: Pick<ServerEnv, "RESEND_API_KEY" | "EMAIL_FROM">,
  request: typeof fetch = fetch
): SendAuthEmail {
  return async (message) => {
    try {
      const response = await request("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error("Resend rejected the request")
      await response.body?.cancel()
    } catch {
      // Provider responses, recipients, tokens and network errors stay private.
      throw new Error("Authentication email delivery failed")
    }
  }
}
```

## 9. apps/api/src/auth/http.ts

[Open source](../../apps/api/src/auth/http.ts)

SHA-256 of the source normalized to LF: `ebd8a7de38c5408cd07109dd46ac15eb60e8025debaf72f04c98bd880e529ad2`

```ts
import type { NestExpressApplication } from "@nestjs/platform-express"
import type { Express } from "express"
import { toNodeHandler } from "better-auth/node"
import type { ServerEnv } from "@nthawi/tooling/env"
import type { NthawiAuth } from "./create-auth.js"

// Call before app.init()/listen(), with NestFactory bodyParser: false.
export function configureAuthHttp(
  app: NestExpressApplication,
  auth: NthawiAuth,
  env: Pick<ServerEnv, "WEB_ORIGIN" | "BETTER_AUTH_URL">
) {
  app.enableCors({ origin: [env.WEB_ORIGIN], credentials: true })
  const express: Express = app.getHttpAdapter().getInstance()
  express.all(
    "/api/auth/{*path}",
    (request, response, next) => {
      const origin = request.get("origin")
      // CORS controls response access; reject untrusted browser requests as well.
      // OAuth callbacks and server clients may legitimately omit Origin.
      if (
        origin &&
        origin !== env.WEB_ORIGIN &&
        origin !== env.BETTER_AUTH_URL
      ) {
        response
          .status(403)
          .json({ code: "INVALID_ORIGIN", message: "Invalid origin" })
        return
      }
      next()
    },
    toNodeHandler(auth)
  )
  // Better Auth must receive the unconsumed request stream.
  app.useBodyParser("json")
  app.useBodyParser("urlencoded", { extended: true })
}
```

## 10. apps/api/src/auth/email.spec.ts

[Open source](../../apps/api/src/auth/email.spec.ts)

SHA-256 of the source normalized to LF: `6e5299899aba1302208ec16d54992ff2e9fdd1a326dc06ebe5b75043477ac3b9`

```ts
import { describe, expect, it, vi } from "vitest"
import { createAuthEmailSender } from "./email.js"

const env = {
  RESEND_API_KEY: "private-test-key",
  EMAIL_FROM: "Nthawi <auth@example.test>",
}
const message = {
  to: "owner@example.test",
  subject: "Verification",
  text: "secret-code-123456",
}

describe("authentication email delivery", () => {
  it("sends plain-text mail through the fixed Resend endpoint", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("{}", { status: 200 }))
    await createAuthEmailSender(env, request)(message)
    expect(request).toHaveBeenCalledOnce()
    const [url, options] = request.mock.calls[0]!
    expect(url).toBe("https://api.resend.com/emails")
    expect(options?.method).toBe("POST")
    expect(options?.headers).toEqual({
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    })
    expect(typeof options?.body).toBe("string")
    expect(JSON.parse(options?.body as string)).toEqual({
      from: env.EMAIL_FROM,
      to: [message.to],
      subject: message.subject,
      text: message.text,
    })
    expect(options?.signal).toBeInstanceOf(AbortSignal)
  })

  it("does not expose provider response bodies or email contents on rejection", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("private-test-key secret-code-123456 owner@example.test", {
        status: 403,
      })
    )
    await expect(createAuthEmailSender(env, request)(message)).rejects.toEqual(
      new Error("Authentication email delivery failed")
    )
  })

  it("does not retain sensitive network failures in the error cause", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("private-test-key secret-code-123456"))
    try {
      await createAuthEmailSender(env, request)(message)
      expect.fail("request should fail")
    } catch (error) {
      expect(error).toEqual(new Error("Authentication email delivery failed"))
      expect((error as Error).cause).toBeUndefined()
    }
  })
})
```

## 11. apps/api/src/app.module.ts

[Open source](../../apps/api/src/app.module.ts)

SHA-256 of the source normalized to LF: `85f11c1f5c8f5a054fe4cdd784e0b5117182dc7da60b1c278afad5642c9c8bcd`

```ts
import { Module, type DynamicModule } from "@nestjs/common"
import type { createDatabase } from "@nthawi/db"
import { createObserveModule } from "@nestjs/observe"
import { AppController } from "./app.controller.js"
import { AppService } from "./app.service.js"

export const { ObserveModule, ObserveInstrument } = createObserveModule()

@Module({
  imports: [
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ObserveModule.forRoot({
      appKey: "YOUR_APP_KEY",
      appSecret: "YOUR_APP_SECRET",
      serviceId: "api",
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
  static withAuthDatabase(
    database: ReturnType<typeof createDatabase>
  ): DynamicModule {
    return {
      module: AppModule,
      providers: [
        {
          provide: "AUTH_DATABASE_LIFECYCLE",
          useValue: { onApplicationShutdown: () => database.pool.end() },
        },
      ],
    }
  }
}
```

## 12. apps/api/src/main.ts

[Open source](../../apps/api/src/main.ts)

SHA-256 of the source normalized to LF: `fde8957322ef0ddaad0638bb1d7156b72cf004bee3c5cff743bc92434333d3f5`

```ts
import { NestFactory } from "@nestjs/core"
import type { NestExpressApplication } from "@nestjs/platform-express"
import { AppModule, ObserveInstrument } from "./app.module.js"
import { auth, authDatabase, serverEnv } from "./auth/auth.js"
import { configureAuthHttp } from "./auth/http.js"

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.withAuthDatabase(authDatabase),
    {
      instrument: ObserveInstrument,
      bodyParser: false,
    }
  )
  configureAuthHttp(app, auth, serverEnv)
  app.enableShutdownHooks()
  try {
    await app.listen(serverEnv.API_PORT)
  } catch (error) {
    await app.close()
    throw error
  }
}
await bootstrap()
```

## 13. apps/api/test/auth.integration.spec.ts

[Open source](../../apps/api/test/auth.integration.spec.ts)

SHA-256 of the source normalized to LF: `c16bbcb95fc60415c909bac39fcbea86a213d5df55147ae2367fa413738d820b`

```ts
import { randomUUID } from "node:crypto"
import { fileURLToPath } from "node:url"
import { Test } from "@nestjs/testing"
import type { NestExpressApplication } from "@nestjs/platform-express"
import { createDatabase } from "@nthawi/db"
import { loadServerEnv } from "@nthawi/tooling/env"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createAuth } from "../src/auth/create-auth.js"
import { configureAuthHttp } from "../src/auth/http.js"
import type { AuthEmail } from "../src/auth/email.js"

const adminUrl = process.env.AUTH_TEST_ADMIN_URL
if (!adminUrl)
  throw new Error(
    "Set AUTH_TEST_ADMIN_URL to a local disposable PostgreSQL superuser connection."
  )
const suffix = randomUUID().replaceAll("-", "")
const databaseName = `auth_test_${suffix}`
const roleName = `${databaseName}_runtime`
const mail: AuthEmail[] = []
const env = loadServerEnv({
  NODE_ENV: "test",
  WEB_ORIGIN: "http://localhost:3000",
  WIDGET_ORIGIN: "http://localhost:5173",
  BETTER_AUTH_URL: "http://localhost:4000",
  BETTER_AUTH_SECRET: "test-only-secret-for-auth-integration-0123456789",
  DATABASE_URL: adminUrl,
  GOOGLE_CLIENT_ID: "test-google-client",
  GOOGLE_CLIENT_SECRET: "test-google-secret",
  RESEND_API_KEY: "test-resend-key",
  EMAIL_FROM: "Nthawi <auth@example.test>",
  OPENAI_API_KEY: "test-openai-key",
})
const admin = createDatabase(adminUrl)
let setup: ReturnType<typeof createDatabase> | undefined
let runtime: ReturnType<typeof createDatabase> | undefined
let app: NestExpressApplication | undefined
let createdDatabase = false
let createdRole = false
let ip = 1

function post(
  path: string,
  body: Record<string, unknown>,
  address = `192.0.2.${ip++}`
) {
  return request(app!.getHttpServer())
    .post(`/api/auth${path}`)
    .set("Origin", env.WEB_ORIGIN)
    .set("X-Forwarded-For", address)
    .send(body)
}
function latestOtp(email: string) {
  const message = mail.findLast((message) => message.to === email)
  expect(message).toBeDefined()
  const otp = message!.text.match(/\b\d{6}\b/)?.[0]
  expect(otp).toBeDefined()
  return otp!
}
function cookies(headers: Record<string, unknown>) {
  const values = headers["set-cookie"]
  expect(Array.isArray(values)).toBe(true)
  return (values as string[]).map((value) => value.split(";")[0]).join("; ")
}

beforeAll(async () => {
  expect(
    (
      await admin.pool.query(
        "SELECT rolsuper FROM pg_roles WHERE rolname = current_user"
      )
    ).rows[0].rolsuper
  ).toBe(true)
  await admin.pool.query(`CREATE DATABASE "${databaseName}"`)
  createdDatabase = true
  const databaseUrl = new URL(adminUrl)
  databaseUrl.pathname = `/${databaseName}`
  setup = createDatabase(databaseUrl.toString())
  await setup.pool.query("CREATE EXTENSION vector")
  await setup.pool.query("CREATE EXTENSION pgcrypto")
  await migrate(setup.db, {
    migrationsFolder: fileURLToPath(
      new URL("../../../packages/db/drizzle", import.meta.url)
    ),
  })
  await admin.pool.query(
    `CREATE ROLE "${roleName}" NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT`
  )
  createdRole = true
  await setup.pool.query(`GRANT USAGE ON SCHEMA public TO "${roleName}"`)
  await setup.pool.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON public."user", public."session", public."account", public."verification", public."rate_limit" TO "${roleName}"`
  )
  databaseUrl.searchParams.set("options", `-c role=${roleName}`)
  runtime = createDatabase(databaseUrl.toString())
  const auth = createAuth(env, runtime.db, async (message) => {
    mail.push(message)
  })
  const fixture = await Test.createTestingModule({}).compile()
  app = fixture.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    logger: false,
  })
  configureAuthHttp(app, auth, env)
  await app.init()
})

afterAll(async () => {
  try {
    await app?.close()
  } finally {
    await Promise.all([runtime?.pool.end(), setup?.pool.end()])
    try {
      if (createdDatabase)
        await admin.pool.query(`DROP DATABASE "${databaseName}"`)
      if (createdRole) await admin.pool.query(`DROP ROLE "${roleName}"`)
    } finally {
      await admin.pool.end()
    }
  }
})

describe("Better Auth over the real Nest HTTP adapter and PostgreSQL", () => {
  it("mounts the auth handler and keeps identity tables outside tenant RLS", async () => {
    const response = await request(app!.getHttpServer()).get("/api/auth/ok")
    expect(response.status).toBe(200)
    const roles = await runtime!.pool.query(
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user"
    )
    expect(roles.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false })
    const flags = await setup!.pool.query(
      "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1)",
      [["user", "session", "account", "verification", "rate_limit"]]
    )
    expect(flags.rowCount).toBe(5)
    for (const row of flags.rows) {
      expect(row.relrowsecurity).toBe(false)
      expect(row.relforcerowsecurity).toBe(false)
    }
  })

  it("allows owner-app preflight requests before authentication body parsing", async () => {
    const response = await request(app!.getHttpServer())
      .options("/api/auth/sign-in/email")
      .set("Origin", env.WEB_ORIGIN)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type")
    expect(response.status).toBe(204)
    expect(response.headers["access-control-allow-origin"]).toBe(env.WEB_ORIGIN)
    expect(response.headers["access-control-allow-credentials"]).toBe("true")
  })

  it("produces the Google authorization URL with the API callback and web return URL", async () => {
    const response = await post("/sign-in/social", {
      provider: "google",
      callbackURL: env.WEB_ORIGIN,
    })
    expect(response.status).toBe(200)
    const authorization = new URL(response.body.url as string)
    expect(authorization.hostname).toBe("accounts.google.com")
    expect(authorization.searchParams.get("client_id")).toBe(
      env.GOOGLE_CLIENT_ID
    )
    expect(authorization.searchParams.get("redirect_uri")).toBe(
      `${env.BETTER_AUTH_URL}/api/auth/callback/google`
    )
  })

  it("requires verification before password sign-in and creates a usable session afterward", async () => {
    const email = "password-owner@example.test"
    const password = "Long-test-password-123!"
    const signup = await post("/sign-up/email", {
      email,
      password,
      name: "Password Owner",
    })
    expect(signup.status).toBe(200)
    expect(signup.headers["access-control-allow-origin"]).toBe(env.WEB_ORIGIN)
    expect(signup.headers["access-control-allow-credentials"]).toBe("true")
    expect(signup.body.token).toBeNull()
    expect(signup.body.user.emailVerified).toBe(false)
    const credential = await setup!.pool.query(
      "SELECT password FROM account WHERE user_id = $1",
      [signup.body.user.id]
    )
    expect(credential.rows[0].password).not.toBe(password)
    const denied = await post("/sign-in/email", { email, password })
    expect(denied.status).toBe(403)
    const verify = await post("/email-otp/verify-email", {
      email,
      otp: latestOtp(email),
    })
    expect(verify.status).toBe(200)
    const signin = await post("/sign-in/email", { email, password })
    expect(signin.status).toBe(200)
    expect(String(signin.headers["set-cookie"])).toContain("HttpOnly")
    const session = await request(app!.getHttpServer())
      .get("/api/auth/get-session")
      .set("Cookie", cookies(signin.headers))
    expect(session.status).toBe(200)
    expect(session.body.user.email).toBe(email)
  })

  it("supports OTP signup/sign-in, stores only hashed codes, and rejects replay", async () => {
    const email = "otp-owner@example.test"
    expect(
      (
        await post("/email-otp/send-verification-otp", {
          email,
          type: "sign-in",
        })
      ).status
    ).toBe(200)
    const otp = latestOtp(email)
    const stored = await setup!.pool.query(
      "SELECT value FROM verification WHERE identifier LIKE $1",
      [`%${email}%`]
    )
    expect(stored.rowCount).toBeGreaterThan(0)
    for (const row of stored.rows) expect(row.value).not.toContain(otp)
    const signin = await post("/sign-in/email-otp", {
      email,
      otp,
      name: "OTP Owner",
    })
    expect(signin.status).toBe(200)
    expect(signin.body.user.emailVerified).toBe(true)
    expect((await post("/sign-in/email-otp", { email, otp })).status).toBe(400)
  })

  it("resets a password using OTP and invalidates the old password and session", async () => {
    const email = "password-owner@example.test"
    const old = await post("/sign-in/email", {
      email,
      password: "Long-test-password-123!",
    })
    expect(old.status).toBe(200)
    expect(
      (await post("/email-otp/request-password-reset", { email })).status
    ).toBe(200)
    const password = "Replacement-test-password-456!"
    expect(
      (
        await post("/email-otp/reset-password", {
          email,
          otp: latestOtp(email),
          password,
        })
      ).status
    ).toBe(200)
    expect(
      (
        await post("/sign-in/email", {
          email,
          password: "Long-test-password-123!",
        })
      ).status
    ).toBe(401)
    expect((await post("/sign-in/email", { email, password })).status).toBe(200)
    const revoked = await request(app!.getHttpServer())
      .get("/api/auth/get-session")
      .set("Cookie", cookies(old.headers))
    expect(revoked.body).toBeNull()
  })

  it("supports the password reset link callback without disclosing delivery details", async () => {
    const email = "password-owner@example.test"
    expect(
      (
        await post("/request-password-reset", {
          email,
          redirectTo: `${env.WEB_ORIGIN}/reset-password`,
        })
      ).status
    ).toBe(200)
    const message = mail.findLast((message) => message.to === email)!
    const link = new URL(message.text.match(/https?:\/\/\S+/)![0])
    const token = link.pathname.split("/").at(-1)
    expect(
      (
        await post("/reset-password", {
          token,
          newPassword: "Another-test-password-789!",
        })
      ).status
    ).toBe(200)
    expect(
      (
        await post("/sign-in/email", {
          email,
          password: "Another-test-password-789!",
        })
      ).status
    ).toBe(200)
  })

  it("rejects widget origins for owner authentication", async () => {
    const response = await request(app!.getHttpServer())
      .post("/api/auth/sign-in/email")
      .set("Origin", env.WIDGET_ORIGIN)
      .send({
        email: "password-owner@example.test",
        password: "Another-test-password-789!",
      })
    expect(response.status).toBe(403)
    expect(response.headers["access-control-allow-origin"]).toBeUndefined()
  })

  it("limits repeated OTP requests through the shared database rate limiter", async () => {
    const address = "192.0.2.240"
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(
        (
          await post(
            "/email-otp/send-verification-otp",
            { email: "limited@example.test", type: "sign-in" },
            address
          )
        ).status
      ).toBe(200)
    }
    expect(
      (
        await post(
          "/email-otp/send-verification-otp",
          { email: "limited@example.test", type: "sign-in" },
          address
        )
      ).status
    ).toBe(429)
    expect(
      (await setup!.pool.query("SELECT * FROM rate_limit")).rowCount
    ).toBeGreaterThan(0)
  })
})
```

## 14. apps/api/vitest.config.ts

[Open source](../../apps/api/vitest.config.ts)

SHA-256 of the source normalized to LF: `455b86021152db69717b7d55d6af04e39dac180a4f2db643aa7153cd1e21fab6`

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: "./",
    include: ["src/**/*.spec.ts"],
  },
})
```

## 15. apps/api/vitest.config.integration.ts

[Open source](../../apps/api/vitest.config.integration.ts)

SHA-256 of the source normalized to LF: `c5f2a5fc2af7d1c5f3c2a4488f049387c5d8010d58d58a9e9088d8ee8e730ce7`

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: "./",
    include: ["test/auth.integration.spec.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
```

## 16. apps/api/package.json

[Open source](../../apps/api/package.json)

SHA-256 of the source normalized to LF: `6c91c4ba3a799632ed83da080e805e6afbf3ed55ba649b9fce50c22ee4f85fd6`

```json
{
  "name": "@nthawi/api",
  "version": "0.0.1",
  "description": "",
  "author": "",
  "private": true,
  "license": "UNLICENSED",
  "type": "module",
  "scripts": {
    "build": "nest build",
    "deploy": "nest deploy",
    "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\"",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:debug": "nest start --debug --watch",
    "start:prod": "node dist/main.js",
    "lint": "oxlint --type-aware src/ test/",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:cov": "vitest run --coverage",
    "test:debug": "vitest --inspect-brk --no-file-parallelism",
    "test:e2e": "vitest run --config ./vitest.config.e2e.ts",
    "typecheck": "tsc --noEmit",
    "test:integration": "vitest run --config ./vitest.config.integration.ts"
  },
  "dependencies": {
    "@better-auth/drizzle-adapter": "1.7.6",
    "@fastify/cors": "^11.3.0",
    "@nestjs/common": "^12.0.1",
    "@nestjs/core": "^12.0.1",
    "@nestjs/observe": "^0.3.0",
    "@nestjs/platform-express": "^12.0.1",
    "@nestjs/platform-fastify": "^12.1.0",
    "@nthawi/contracts": "workspace:*",
    "@nthawi/db": "workspace:*",
    "better-auth": "1.7.6",
    "drizzle-orm": "0.45.3",
    "fastify": "^5.12.5",
    "pg-boss": "12.35.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "zod": "4.6.5",
    "@nthawi/tooling": "workspace:*",
    "@better-auth/infra": "0.4.12",
    "@better-auth/core": "1.7.6",
    "@better-auth/utils": "0.4.2"
  },
  "devDependencies": {
    "@nestjs/cli": "^12.0.0",
    "@nestjs/mau": "^0.2.6",
    "@nestjs/schematics": "^12.0.0",
    "@nestjs/testing": "^12.0.1",
    "@types/express": "^5.0.0",
    "@types/node": "^24.0.0",
    "@types/supertest": "^7.0.0",
    "@vitest/coverage-v8": "^4.1.2",
    "oxlint": "^1.58.0",
    "oxlint-tsgolint": "^7.0.2001",
    "prettier": "^3.4.2",
    "source-map-support": "^0.5.21",
    "supertest": "^7.0.0",
    "typescript": "^6.0.2",
    "vite": "8.3.1",
    "vitest": "^4.1.2"
  }
}
```

## 17. apps/api/tsconfig.json

[Open source](../../apps/api/tsconfig.json)

SHA-256 of the source normalized to LF: `0da72ce2fd7052be7a55096194a540d0f8fde486360712a8d07d7a042a6e8c7a`

```json
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "resolvePackageJsonExports": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2023",
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": ".",
    "incremental": true,
    "skipLibCheck": true,
    "strict": true,
    "strictPropertyInitialization": false,
    "types": ["vitest/globals", "node"]
  }
}
```

## 18. apps/api/tsconfig.build.json

[Open source](../../apps/api/tsconfig.build.json)

SHA-256 of the source normalized to LF: `4d3e73204cf9fbad4e5396f70aab7aa88cb1e93f0ab307123c3265b9c74e1504`

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "./src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "test", "dist", "**/*spec.ts"]
}
```

## 19. apps/web/lib/auth-client.ts

[Open source](../../apps/web/lib/auth-client.ts)

SHA-256 of the source normalized to LF: `e9511525061dfa5437c9b945586162b08fd6c3e5e4ff420776d8f14174eda948`

```ts
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
```

## 20. apps/web/package.json

[Open source](../../apps/web/package.json)

SHA-256 of the source normalized to LF: `92bdaab4a27b998a8c7c3fd7d168dc7868039d667fc5570005608875ff3f95ce`

```json
{
  "name": "@nthawi/web",
  "version": "0.0.1",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "format": "prettier --write \"**/*.{ts,tsx}\"",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@workspace/ui": "workspace:*",
    "lucide-react": "^1.48.0",
    "next": "16.3.6",
    "next-themes": "^0.4.6",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "better-auth": "1.7.6",
    "@better-auth/infra": "0.4.12",
    "@better-auth/core": "1.7.6",
    "@better-auth/utils": "0.4.2",
    "zod": "4.6.5"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@workspace/eslint-config": "workspace:^",
    "@workspace/typescript-config": "workspace:*",
    "eslint": "^9",
    "typescript": "^5"
  }
}
```

## 21. apps/web/.env.example

[Open source](../../apps/web/.env.example)

SHA-256 of the source normalized to LF: `ac91c1613dedbe96de28497b0050252b60fb930af3bb858016d897675442c00d`

```dotenv
﻿NEXT_PUBLIC_API_URL=http://localhost:4000
```

## 22. packages/db/src/index.ts

[Open source](../../packages/db/src/index.ts)

SHA-256 of the source normalized to LF: `5c670dd11e78639deca2d98cb121a1b394c8194ee4210b159ca2063136c0fd96`

```ts
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema/index.js"

export { withTenantTransaction } from "./tenant.js"
export type { TenantContext } from "./tenant.js"

// Pool construction is lazy: schema generation never needs a database connection.
export function createDatabase(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 10_000,
  })
  return { pool, db: drizzle(pool, { schema }) }
}
export type AppDatabase = ReturnType<typeof createDatabase>["db"]
```

## 23. packages/db/src/schema/index.ts

[Open source](../../packages/db/src/schema/index.ts)

SHA-256 of the source normalized to LF: `a6d1b45c45ef99bf0dfae63a308b767896a49ca531c934136e12108e7c12bfd8`

```ts
export * from "./app.js"
export * from "./auth.js"
```

## 24. packages/db/src/schema/auth.ts

[Open source](../../packages/db/src/schema/auth.ts)

SHA-256 of the source normalized to LF: `f09e208a9534ade0ddf683137bdee01b0bf336f9e3ae3a5cfaed8a35f0e5b25c`

```ts
import { relations, sql } from "drizzle-orm"
import {
  pgTable,
  text,
  bigint,
  timestamp,
  boolean,
  integer,
  uuid,
  index,
} from "drizzle-orm/pg-core"

export const user = pgTable("user", {
  id: uuid("id")
    .default(sql`pg_catalog.gen_random_uuid()`)
    .primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
})

export const session = pgTable(
  "session",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)]
)

export const account = pgTable(
  "account",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)]
)

export const verification = pgTable(
  "verification",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
)

export const rateLimit = pgTable("rate_limit", {
  id: uuid("id")
    .default(sql`pg_catalog.gen_random_uuid()`)
    .primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
})

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}))

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}))

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}))
```

## 25. packages/db/src/tenant.ts

[Open source](../../packages/db/src/tenant.ts)

SHA-256 of the source normalized to LF: `a94808491dfa463e9d81c3fa7c8a5709a85418a651437ba0e7178c19e49dd08f`

```ts
// packages/db/src/tenant.ts

import { sql } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"

export interface TenantContext {
  ownerId: string
  workspaceId?: string
}

export async function withTenantTransaction<T>(
  db: NodePgDatabase,
  context: TenantContext,
  callback: (tx: NodePgDatabase) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.owner_id', ${context.ownerId}, true)`
    )

    // Shadow session-level context even when no workspace was supplied.
    // The policy helper turns empty context into NULL, denying tenant access.
    await tx.execute(
      sql`select set_config('app.workspace_id', ${context.workspaceId ?? ""}, true)`
    )

    return callback(tx)
  })
}
```

## 26. packages/db/drizzle.config.ts

[Open source](../../packages/db/drizzle.config.ts)

SHA-256 of the source normalized to LF: `f81a2790a69f06cc37b9813ddfb6166c45aa3aeb8a7d13856e5001ac932d12e3`

```ts
import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/schema/app.ts", "./src/schema/auth.ts"],
  out: "./drizzle",
})
```

## 27. packages/db/drizzle/0001_tenant_rls.sql

[Open source](../../packages/db/drizzle/0001_tenant_rls.sql)

SHA-256 of the source normalized to LF: `a2e4676bc188244ae64d015693e798564c463f8eddc936be79ede90445559a71`

```sql
-- Reviewed tenant boundary. Apply with the migration role in one transaction.
-- FORCE covers ordinary table owners, never superusers or BYPASSRLS roles.
-- Identity and privileged operational tables deliberately have no policies here.
CREATE SCHEMA IF NOT EXISTS app_private;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA app_private FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.current_owner_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT NULLIF(pg_catalog.current_setting('app.owner_id', true), '');
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.current_workspace_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT NULLIF(pg_catalog.current_setting('app.workspace_id', true), '')::uuid;
$$;
--> statement-breakpoint
-- These getters expose only the caller's context. This grants no table access.
GRANT USAGE ON SCHEMA app_private TO PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_private.current_owner_id() TO PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_private.current_workspace_id() TO PUBLIC;
--> statement-breakpoint
ALTER TABLE public."ai_invocations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."assistants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."citations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."conversations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."knowledge_chunks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."knowledge_revisions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."knowledge_sources" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."messages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."monthly_usage" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."visitor_sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."widget_installations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."workspaces" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "ai_invocations_tenant_policy"
ON public."ai_invocations"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING ("ai_invocations"."workspace_id" = app_private.current_workspace_id())
WITH CHECK ("ai_invocations"."workspace_id" = app_private.current_workspace_id());
--> statement-breakpoint
CREATE POLICY "assistants_tenant_policy"
ON public."assistants"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING ("assistants"."workspace_id" = app_private.current_workspace_id())
WITH CHECK ("assistants"."workspace_id" = app_private.current_workspace_id());
--> statement-breakpoint
CREATE POLICY "citations_tenant_policy"
ON public."citations"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING ("citations"."workspace_id" = app_private.current_workspace_id())
WITH CHECK ("citations"."workspace_id" = app_private.current_workspace_id());
--> statement-breakpoint
CREATE POLICY "conversations_tenant_policy"
ON public."conversations"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING ("conversations"."workspace_id" = app_private.current_workspace_id())
WITH CHECK ("conversations"."workspace_id" = app_private.current_workspace_id());
--> statement-breakpoint
CREATE POLICY "knowledge_chunks_tenant_policy"
ON public."knowledge_chunks"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING ("knowledge_chunks"."workspace_id" = app_private.current_workspace_id())
WITH CHECK ("knowledge_chunks"."workspace_id" = app_private.current_workspace_id());
--> statement-breakpoint
CREATE POLICY "knowledge_revisions_tenant_policy"
ON public."knowledge_revisions"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING ("knowledge_revisions"."workspace_id" = app_private.current_workspace_id())
WITH CHECK ("knowledge_revisions"."workspace_id" = app_private.current_workspace_id());
--> statement-breakpoint
CREATE POLICY "knowledge_sources_tenant_policy"
ON public."knowledge_sources"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING ("knowledge_sources"."workspace_id" = app_private.current_workspace_id())
WITH CHECK ("knowledge_sources"."workspace_id" = app_private.current_workspace_id());
--> statement-breakpoint
CREATE POLICY "messages_tenant_policy"
ON public."messages"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING ("messages"."workspace_id" = app_private.current_workspace_id())
WITH CHECK ("messages"."workspace_id" = app_private.current_workspace_id());
--> statement-breakpoint
CREATE POLICY "monthly_usage_tenant_policy"
ON public."monthly_usage"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING ("monthly_usage"."workspace_id" = app_private.current_workspace_id())
WITH CHECK ("monthly_usage"."workspace_id" = app_private.current_workspace_id());
--> statement-breakpoint
CREATE POLICY "visitor_sessions_tenant_policy"
ON public."visitor_sessions"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING ("visitor_sessions"."workspace_id" = app_private.current_workspace_id())
WITH CHECK ("visitor_sessions"."workspace_id" = app_private.current_workspace_id());
--> statement-breakpoint
CREATE POLICY "widget_installations_tenant_policy"
ON public."widget_installations"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING ("widget_installations"."workspace_id" = app_private.current_workspace_id())
WITH CHECK ("widget_installations"."workspace_id" = app_private.current_workspace_id());
--> statement-breakpoint
CREATE POLICY "workspace_owner_select"
ON public."workspaces"
AS PERMISSIVE
FOR SELECT
TO PUBLIC
USING ("workspaces"."owner_id" = app_private.current_owner_id());
--> statement-breakpoint
CREATE POLICY "workspace_owner_update"
ON public."workspaces"
AS PERMISSIVE
FOR UPDATE
TO PUBLIC
USING ("workspaces"."owner_id" = app_private.current_owner_id())
WITH CHECK ("workspaces"."owner_id" = app_private.current_owner_id());
--> statement-breakpoint
ALTER TABLE public."workspaces" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."assistants" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."knowledge_sources" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."knowledge_revisions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."knowledge_chunks" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."widget_installations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."visitor_sessions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."conversations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."messages" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."citations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."ai_invocations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public."monthly_usage" FORCE ROW LEVEL SECURITY;
```

## 28. packages/db/drizzle/0002_better_auth.sql

[Open source](../../packages/db/drizzle/0002_better_auth.sql)

SHA-256 of the source normalized to LF: `4e0c7459fe4391600bc30e9eba470c32963ff354315fbec61aee536826ab0216`

```sql
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");
```

## 29. packages/db/drizzle/meta/\_journal.json

[Open source](../../packages/db/drizzle/meta/_journal.json)

SHA-256 of the source normalized to LF: `ee40c8c725f5e6a7335c458792314c45fff32202067322d6b830442298a81bfd`

```json
{
  "version": "7",
  "dialect": "postgresql",
  "entries": [
    {
      "idx": 0,
      "version": "7",
      "when": 1790604466879,
      "tag": "0000_initial_app",
      "breakpoints": true
    },
    {
      "idx": 1,
      "version": "7",
      "when": 1790631123946,
      "tag": "0001_tenant_rls",
      "breakpoints": true
    },
    {
      "idx": 2,
      "version": "7",
      "when": 1790818975369,
      "tag": "0002_better_auth",
      "breakpoints": true
    }
  ]
}
```

## 30. packages/db/scripts/migrate.mjs

[Open source](../../packages/db/scripts/migrate.mjs)

SHA-256 of the source normalized to LF: `a09234b6e88bd431838e220ded4171e5aba9df9837823b6607de9f0e4ca01b75`

```js
import { fileURLToPath } from "node:url"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Pool } from "pg"

if (!process.env.DATABASE_MIGRATION_URL) {
  throw new Error(
    "DATABASE_MIGRATION_URL is required; use a dedicated migration role."
  )
}
const pool = new Pool({
  connectionString: process.env.DATABASE_MIGRATION_URL,
  max: 1,
})
try {
  await migrate(drizzle(pool), {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  })
} finally {
  await pool.end()
}
```

## 31. packages/db/test/tenant-rls.test.ts

[Open source](../../packages/db/test/tenant-rls.test.ts)

SHA-256 of the source normalized to LF: `8734cca8fd1116e531f142f0b16b8403a417b78b67f37f518f198d4ece2c15b9`

```ts
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Client, Pool } from "pg"
import { knowledgeSources } from "../src/schema/app.ts"
import { withTenantTransaction } from "../src/tenant.ts"

const adminUrl = process.env.RLS_TEST_ADMIN_URL
if (!adminUrl) {
  throw new Error(
    "Set RLS_TEST_ADMIN_URL to a local disposable PostgreSQL superuser connection (see packages/db/README.md)."
  )
}

const tenantTables = [
  "assistants",
  "knowledge_sources",
  "knowledge_revisions",
  "knowledge_chunks",
  "widget_installations",
  "visitor_sessions",
  "conversations",
  "messages",
  "citations",
  "ai_invocations",
  "monthly_usage",
]
const protectedTables = ["workspaces", ...tenantTables]
const identityTables = [
  "user",
  "session",
  "account",
  "verification",
  "rate_limit",
]
const operationalTables = [
  "audit_events",
  "global_monthly_ai_usage",
  "deletion_journal",
]
const workspaceA = randomUUID()
const workspaceB = randomUUID()
const ownerA = "owner-a"
const ownerB = "owner-b"

// Real rows in every protected table, including the composite foreign-key graph.
function fixtures(workspaceId: string) {
  const source = randomUUID()
  const revision = randomUUID()
  const chunk = randomUUID()
  const visitor = randomUUID()
  const conversation = randomUUID()
  const message = randomUUID()
  return new Map<string, Record<string, unknown>>([
    [
      "assistants",
      { workspace_id: workspaceId, name: "Assistant", greeting: "Hello" },
    ],
    [
      "knowledge_sources",
      { id: source, workspace_id: workspaceId, type: "text", title: "Source" },
    ],
    [
      "knowledge_revisions",
      {
        id: revision,
        workspace_id: workspaceId,
        source_id: source,
        ordinal: 1,
        content_hash: "hash",
      },
    ],
    [
      "knowledge_chunks",
      {
        id: chunk,
        workspace_id: workspaceId,
        revision_id: revision,
        ordinal: 1,
        content: "Text",
        token_count: 1,
        embedding_model: "test",
        embedding_dimensions: 1536,
        embedding: JSON.stringify(Array(1536).fill(0)),
      },
    ],
    [
      "widget_installations",
      {
        workspace_id: workspaceId,
        public_id: randomUUID(),
        allowed_origin: "https://example.test",
      },
    ],
    [
      "visitor_sessions",
      {
        id: visitor,
        workspace_id: workspaceId,
        credential_hash: randomUUID(),
        privacy_notice_version: "1",
        expires_at: "2099-01-01",
      },
    ],
    [
      "conversations",
      {
        id: conversation,
        workspace_id: workspaceId,
        visitor_session_id: visitor,
      },
    ],
    [
      "messages",
      {
        id: message,
        workspace_id: workspaceId,
        conversation_id: conversation,
        sequence: "1",
        sender: "visitor",
        body: "Hello",
      },
    ],
    [
      "citations",
      {
        workspace_id: workspaceId,
        message_id: message,
        source_id: source,
        revision_id: revision,
        chunk_id: chunk,
        display_title: "Source",
        reviewed_at: "2026-01-01",
      },
    ],
    [
      "ai_invocations",
      {
        workspace_id: workspaceId,
        conversation_id: conversation,
        provider: "test",
        model: "test",
        prompt_version: "1",
        price_version: "1",
        state: "reserved",
        reserved_cost_micros: "0",
        request_id: randomUUID(),
      },
    ],
    ["monthly_usage", { workspace_id: workspaceId, period: "2026-09" }],
  ])
}

// All identifiers come from the fixed fixtures above or locally generated names.
function insertRow(table: string, row: Record<string, unknown>) {
  return {
    text: `INSERT INTO public."${table}" (${Object.keys(row)
      .map((key) => `"${key}"`)
      .join(", ")}) VALUES (${Object.keys(row)
      .map((_, i) => `$${i + 1}`)
      .join(", ")})`,
    values: Object.values(row),
  }
}

await test("tenant RLS against PostgreSQL", async (t) => {
  const suffix = randomUUID().replaceAll("-", "")
  const database = `rls_test_${suffix}`
  const runtimeRole = `${database}_runtime`
  const ownerRole = `${database}_owner`
  const bypassRole = `${database}_bypass`
  const admin = new Client({ connectionString: adminUrl })
  const pools: Pool[] = []
  const roles: string[] = []
  let createdDatabase = false
  await admin.connect()
  try {
    assert.equal(
      (
        await admin.query(
          "SELECT rolsuper FROM pg_roles WHERE rolname = current_user"
        )
      ).rows[0].rolsuper,
      true,
      "test setup requires a local superuser"
    )
    await admin.query(`CREATE DATABASE "${database}"`)
    createdDatabase = true
    const connectionUrl = new URL(adminUrl)
    connectionUrl.pathname = `/${database}`
    const setup = new Pool({
      connectionString: connectionUrl.toString(),
      max: 1,
    })
    pools.push(setup)
    await setup.query("CREATE EXTENSION vector")
    await setup.query("CREATE EXTENSION pgcrypto")
    await migrate(drizzle(setup), {
      migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
    })
    // The migration journal must also make a second run harmless.
    await migrate(drizzle(setup), {
      migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
    })
    for (const role of [runtimeRole, ownerRole, bypassRole]) {
      await admin.query(
        `CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT ${role === bypassRole ? "BYPASSRLS" : "NOBYPASSRLS"}`
      )
      roles.push(role)
      await setup.query(`GRANT USAGE ON SCHEMA public TO "${role}"`)
      for (const table of protectedTables) {
        await setup.query(
          `GRANT SELECT, INSERT, UPDATE, DELETE ON public."${table}" TO "${role}"`
        )
      }
    }
    await setup.query(
      "INSERT INTO workspaces (id, owner_id, name, website_origin) VALUES ($1, $2, 'A', 'https://a.test'), ($3, $4, 'B', 'https://b.test')",
      [workspaceA, ownerA, workspaceB, ownerB]
    )
    const rowsA = fixtures(workspaceA)
    const rowsB = fixtures(workspaceB)
    for (const rows of [rowsA, rowsB]) {
      for (const [table, row] of rows) await setup.query(insertRow(table, row))
    }
    for (const table of protectedTables) {
      await setup.query(`ALTER TABLE public."${table}" OWNER TO "${ownerRole}"`)
    }
    const connectAs = (role: string) => {
      const pool = new Pool({
        connectionString: connectionUrl.toString(),
        options: `-c role=${role}`,
        max: 1,
      })
      pools.push(pool)
      return pool
    }
    const runtime = connectAs(runtimeRole)
    const db = drizzle(runtime)
    const asTenant = <T>(
      callback: Parameters<typeof withTenantTransaction<T>>[2]
    ) =>
      withTenantTransaction(
        db,
        { ownerId: ownerA, workspaceId: workspaceA },
        callback
      )

    await t.test(
      "catalog flags and policy scope match the reviewed boundary",
      async () => {
        const flags = await setup.query(
          "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'"
        )
        for (const table of protectedTables) {
          const row = flags.rows.find((row) => row.relname === table)
          assert.equal(row?.relrowsecurity, true, table)
          assert.equal(row?.relforcerowsecurity, true, table)
        }
        for (const table of [...identityTables, ...operationalTables]) {
          const row = flags.rows.find((row) => row.relname === table)
          assert.equal(row?.relrowsecurity, false, table)
          assert.equal(row?.relforcerowsecurity, false, table)
          assert.equal(
            (
              await setup.query(
                "SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = $1",
                [table]
              )
            ).rowCount,
            0
          )
          await assert.rejects(
            runtime.query(`SELECT * FROM public."${table}"`),
            { code: "42501" }
          )
        }
        const role = (
          await runtime.query(
            "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user"
          )
        ).rows[0]
        assert.deepEqual(role, { rolsuper: false, rolbypassrls: false })
        const helpers = await setup.query(
          "SELECT provolatile, prosecdef, proconfig FROM pg_proc WHERE pronamespace = 'app_private'::regnamespace"
        )
        assert.equal(helpers.rowCount, 2)
        for (const helper of helpers.rows) {
          assert.equal(helper.provolatile, "s")
          assert.equal(helper.prosecdef, false)
          assert.deepEqual(helper.proconfig, ["search_path=pg_catalog"])
        }
      }
    )

    await t.test(
      "missing, empty, and malformed context fail closed",
      async () => {
        for (const table of protectedTables)
          assert.equal(
            (await runtime.query(`SELECT * FROM public."${table}"`)).rowCount,
            0,
            table
          )
        await withTenantTransaction(
          db,
          { ownerId: "", workspaceId: "" },
          async (tx) => {
            for (const table of protectedTables)
              assert.equal(
                (await tx.execute(sql.raw(`SELECT * FROM public."${table}"`)))
                  .rowCount,
                0,
                table
              )
          }
        )
        await assert.rejects(
          withTenantTransaction(
            db,
            { ownerId: ownerA, workspaceId: "invalid-uuid" },
            (tx) => tx.execute(sql`SELECT * FROM monthly_usage`)
          ),
          (error: unknown) => {
            return (
              (error as { cause?: { code?: string } }).cause?.code === "22P02"
            )
          }
        )
      }
    )

    await t.test("workspaces permit owner reads and updates only", async () => {
      await asTenant(async (tx) => {
        assert.deepEqual(
          (await tx.execute(sql`SELECT id FROM workspaces`)).rows,
          [{ id: workspaceA }]
        )
        assert.equal(
          (
            await tx.execute(
              sql`UPDATE workspaces SET name = 'Updated' WHERE id = ${workspaceA}`
            )
          ).rowCount,
          1
        )
        assert.equal(
          (
            await tx.execute(
              sql`UPDATE workspaces SET name = 'Hidden' WHERE id = ${workspaceB}`
            )
          ).rowCount,
          0
        )
        assert.equal(
          (await tx.execute(sql`DELETE FROM workspaces`)).rowCount,
          0
        )
      })
      for (const query of [
        sql`UPDATE workspaces SET owner_id = ${ownerB} WHERE id = ${workspaceA}`,
        sql`INSERT INTO workspaces (owner_id, name, website_origin) VALUES (${ownerA}, 'Denied', 'https://new.test')`,
      ]) {
        await assert.rejects(
          asTenant((tx) => tx.execute(query)),
          (error: unknown) =>
            (error as { cause?: { code?: string } }).cause?.code === "42501"
        )
      }
      await withTenantTransaction(db, { ownerId: ownerB }, async (tx) => {
        assert.deepEqual(
          (await tx.execute(sql`SELECT id FROM workspaces`)).rows,
          [{ id: workspaceB }]
        )
      })
    })

    for (const table of tenantTables) {
      await t.test(
        `${table}: isolates reads, inserts, updates, and deletes`,
        async () => {
          const client = await runtime.connect()
          try {
            await client.query("BEGIN")
            await client.query(
              "SELECT set_config('app.workspace_id', $1, true)",
              [workspaceA]
            )
            // Business policies intentionally also work without an owner context.
            assert.deepEqual(
              (await client.query(`SELECT workspace_id FROM public."${table}"`))
                .rows,
              [{ workspace_id: workspaceA }]
            )
            assert.equal(
              (
                await client.query(
                  `UPDATE public."${table}" SET workspace_id = workspace_id WHERE workspace_id = $1`,
                  [workspaceB]
                )
              ).rowCount,
              0
            )
            assert.equal(
              (
                await client.query(
                  `DELETE FROM public."${table}" WHERE workspace_id = $1`,
                  [workspaceB]
                )
              ).rowCount,
              0
            )
            assert.equal(
              (
                await client.query(
                  `UPDATE public."${table}" SET workspace_id = workspace_id`
                )
              ).rowCount,
              1
            )
            for (const query of [
              {
                text: `UPDATE public."${table}" SET workspace_id = $1`,
                values: [workspaceB],
              },
              insertRow(table, rowsB.get(table)!),
            ]) {
              await client.query("SAVEPOINT denied_write")
              await assert.rejects(client.query(query), { code: "42501" })
              await client.query("ROLLBACK TO SAVEPOINT denied_write")
            }
            assert.equal(
              (await client.query(`DELETE FROM public."${table}"`)).rowCount,
              1
            )
            assert.equal(
              (await client.query(insertRow(table, rowsA.get(table)!)))
                .rowCount,
              1
            )
          } finally {
            await client.query("ROLLBACK")
            client.release()
          }
        }
      )
    }

    await t.test(
      "FORCE constrains ordinary owners; superuser and BYPASSRLS still bypass",
      async () => {
        const owner = connectAs(ownerRole)
        const bypass = connectAs(bypassRole)
        for (const table of protectedTables) {
          assert.equal(
            (await owner.query(`SELECT * FROM public."${table}"`)).rowCount,
            0,
            table
          )
          assert.equal(
            (await bypass.query(`SELECT * FROM public."${table}"`)).rowCount,
            2,
            table
          )
          assert.equal(
            (await setup.query(`SELECT * FROM public."${table}"`)).rowCount,
            2,
            table
          )
        }
        await withTenantTransaction(
          drizzle(owner),
          { ownerId: ownerB, workspaceId: workspaceB },
          async (tx) => {
            for (const table of protectedTables)
              assert.equal(
                (await tx.execute(sql.raw(`SELECT * FROM public."${table}"`)))
                  .rowCount,
                1,
                table
              )
          }
        )
      }
    )

    await t.test(
      "transaction context resets after commit and rollback on a reused connection",
      async () => {
        await asTenant((tx) => tx.execute(sql`SELECT * FROM monthly_usage`))
        const assertCleared = async () => {
          assert.deepEqual(
            (
              await runtime.query(
                "SELECT app_private.current_owner_id() AS owner, app_private.current_workspace_id() AS workspace"
              )
            ).rows,
            [{ owner: null, workspace: null }]
          )
        }
        await assertCleared()
        await assert.rejects(
          asTenant(async () => {
            throw new Error("rollback-test")
          }),
          /rollback-test/
        )
        await assertCleared()
        await withTenantTransaction(
          db,
          { ownerId: ownerB, workspaceId: workspaceB },
          async (tx) => {
            assert.deepEqual(
              (await tx.execute(sql`SELECT workspace_id FROM monthly_usage`))
                .rows,
              [{ workspace_id: workspaceB }]
            )
          }
        )
        await assertCleared()
      }
    )

    await t.test(
      "does not leak workspace context across reused pooled connections",
      async () => {
        // Fresh workspaces keep B empty, so the SELECT needs no tenant filter.
        const tenantA = { ownerId: randomUUID(), workspaceId: randomUUID() }
        const tenantB = { ownerId: randomUUID(), workspaceId: randomUUID() }
        await setup.query(
          "INSERT INTO workspaces (id, owner_id, name, website_origin) VALUES ($1, $2, 'Pool A', 'https://pool-a.test'), ($3, $4, 'Pool B', 'https://pool-b.test')",
          [
            tenantA.workspaceId,
            tenantA.ownerId,
            tenantB.workspaceId,
            tenantB.ownerId,
          ]
        )
        const pool = connectAs(runtimeRole) // max: 1 forces sequential reuse.
        const pooledDb = drizzle(pool)
        const secretId = randomUUID()
        const expectedSource = [{ id: secretId, title: "Owner A secret" }]

        const pidA = await withTenantTransaction(
          pooledDb,
          tenantA,
          async (tx) => {
            const {
              rows: [backend],
            } = await tx.execute<{ pid: number }>(
              sql`SELECT pg_backend_pid() AS pid`
            )
            assert.ok(backend)
            await tx.insert(knowledgeSources).values({
              id: secretId,
              workspaceId: tenantA.workspaceId,
              type: "text",
              title: "Owner A secret",
            })
            return backend.pid
          }
        )

        const assertReleasedWithoutContext = async () => {
          // Borrow outside the helper BEFORE another tenant overwrites settings.
          // An A -> B transaction alone would also pass with session-global GUCs.
          const borrowed = await pool.connect()
          try {
            const context = await borrowed.query(
              `SELECT pg_backend_pid() AS pid,
                NULLIF(current_setting('app.owner_id', true), '') AS owner,
                NULLIF(current_setting('app.workspace_id', true), '') AS workspace`
            )
            assert.deepEqual(context.rows, [
              { pid: pidA, owner: null, workspace: null },
            ])
            assert.deepEqual(
              (await borrowed.query("SELECT * FROM knowledge_sources")).rows,
              []
            )
            assert.deepEqual(
              (await borrowed.query("SELECT * FROM workspaces")).rows,
              []
            )
          } finally {
            borrowed.release()
          }
        }
        await assertReleasedWithoutContext()

        const visibleToB = await withTenantTransaction(
          pooledDb,
          tenantB,
          async (tx) => {
            const {
              rows: [backend],
            } = await tx.execute<{ pid: number }>(
              sql`SELECT pg_backend_pid() AS pid`
            )
            assert.equal(
              backend?.pid,
              pidA,
              "B must reuse A's physical connection"
            )
            return tx.select().from(knowledgeSources)
          }
        )
        assert.deepEqual(visibleToB, [])
        await assertReleasedWithoutContext()

        // Prove the secret was committed and remains readable only in A's scope.
        const visibleToA = await withTenantTransaction(
          pooledDb,
          tenantA,
          async (tx) => {
            const {
              rows: [backend],
            } = await tx.execute<{ pid: number }>(
              sql`SELECT pg_backend_pid() AS pid`
            )
            assert.equal(backend?.pid, pidA)
            return tx
              .select({
                id: knowledgeSources.id,
                title: knowledgeSources.title,
              })
              .from(knowledgeSources)
          }
        )
        assert.deepEqual(visibleToA, expectedSource)
        await assertReleasedWithoutContext()
      }
    )

    await t.test(
      "owner-only transactions shadow a stale session workspace",
      async () => {
        await runtime.query(
          "SELECT set_config('app.workspace_id', $1, false)",
          [workspaceB]
        )
        try {
          await withTenantTransaction(db, { ownerId: ownerA }, async (tx) => {
            assert.equal(
              (await tx.execute(sql`SELECT * FROM monthly_usage`)).rowCount,
              0
            )
            assert.deepEqual(
              (await tx.execute(sql`SELECT id FROM workspaces`)).rows,
              [{ id: workspaceA }]
            )
          })
        } finally {
          await runtime.query("RESET app.workspace_id")
        }
      }
    )
  } finally {
    await Promise.all(pools.map((pool) => pool.end()))
    // Only this run's generated database and roles are removed.
    try {
      if (createdDatabase) await admin.query(`DROP DATABASE "${database}"`)
      for (const role of roles) await admin.query(`DROP ROLE "${role}"`)
    } finally {
      await admin.end()
    }
  }
})
```

## 32. packages/db/package.json

[Open source](../../packages/db/package.json)

SHA-256 of the source normalized to LF: `bc2837d2d70e53da87bae1bc64cd38ae6fa9fe5dded1202001eee1014489fc01`

```json
{
  "name": "@nthawi/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "db:generate": "drizzle-kit generate --config=drizzle.config.ts",
    "db:check": "drizzle-kit check --config=drizzle.config.ts",
    "db:migrate": "node scripts/migrate.mjs",
    "test:integration": "node --test test/tenant-rls.test.ts",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./schema": {
      "types": "./dist/schema/index.d.ts",
      "default": "./dist/schema/index.js"
    },
    "./schema/auth": {
      "types": "./dist/schema/auth.d.ts",
      "default": "./dist/schema/auth.js"
    }
  },
  "dependencies": {
    "drizzle-orm": "0.45.3",
    "pg": "8.23.0"
  },
  "devDependencies": {
    "@types/pg": "8.23.1",
    "drizzle-kit": "0.31.11"
  }
}
```

## 33. packages/db/tsconfig.json

[Open source](../../packages/db/tsconfig.json)

SHA-256 of the source normalized to LF: `32200d0f2a98cb06110d65c11e3bc5c8c1f5144c32ef613291e7b2fd1e47dd01`

```json
{
  "extends": "../typescript-config/base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

## 34. .env.example

[Open source](../../.env.example)

SHA-256 of the source normalized to LF: `0282b4af5702ed750fbf7d824dad63fd6fd99b72f464925fc741900cc350d6be`

```dotenv
﻿NODE_ENV=development

WEB_ORIGIN=http://localhost:3000
WIDGET_ORIGIN=http://localhost:5173
API_PORT=4000

# Use a provisioned non-superuser, NOBYPASSRLS runtime role (see auth setup guide).
DATABASE_URL=postgresql://nthawi_runtime:replace-with-local-runtime-password@localhost:5433/nthawi
# Migration credentials are separate and must never serve application requests.
DATABASE_MIGRATION_URL=postgresql://nthawi_dev:dev-only-change-me@localhost:5433/nthawi

BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:4000
# Optional: Better Auth dashboard project key; not the application signing secret.
BETTER_AUTH_API_KEY=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

RESEND_API_KEY=
EMAIL_FROM=

OPENAI_API_KEY=
OPENAI_CHAT_MODEL=gpt-4.1-mini-2025-04-14
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

GLOBAL_AI_BUDGET_USD=20
WORKSPACE_AI_REPLY_LIMIT=100
MAX_APPROVED_KNOWLEDGE_BYTES=1048576
MAX_WORKSPACE_MESSAGES=10000
MAX_WEBSITE_SOURCES=10
```

## 35. .gitignore

[Open source](../../.gitignore)

SHA-256 of the source normalized to LF: `6d3037fc8c60f1e9d75f5fa02c0a6ef7363ca3fcb181cfb7cb2ef838a08d0333`

```text
# See https://help.github.com/articles/ignoring-files/ for more about ignoring files.

# dependencies
node_modules
.pnp
.pnp.*
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/versions

# testing
coverage

# next.js
.next/
out/

# production
build
dist

# turbo
.turbo

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# env files (can opt-in for committing if needed)
.env*

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts

# Safe templates contain no credentials.
!.env.example
```

## 36. turbo.json

[Open source](../../turbo.json)

SHA-256 of the source normalized to LF: `ad2c0bd543520fe7cf40af4076055caad880fe15327a1bcac45271f1c7145ae5`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "dev": {
      "cache": false,
      "persistent": true
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**", "!.next/cache/**"]
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "typecheck": {
      "dependsOn": ["^build", "^typecheck"]
    },
    "test": {
      "dependsOn": ["^build", "^test"],
      "outputs": ["coverage/**"]
    },
    "test:integration": {
      "cache": false,
      "dependsOn": ["^build"]
    }
  }
}
```
