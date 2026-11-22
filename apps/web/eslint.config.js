import { nextJsConfig } from "@workspace/eslint-config/next-js"

/** @type {import("eslint").Linter.Config[]} */
export default [
  { ignores: [".next/**", ".playwright/**"] },
  ...nextJsConfig,
  {
    files: ["test/**/*.mjs"],
    languageOptions: { globals: { process: "readonly", console: "readonly" } },
  },
  {
    // Test and local-only switches. Turbo's strict env mode never passes these
    // into a turbo build, so a cached deploy build cannot include the
    // catalogue; declaring them in turbo.json would change cache keys for no
    // deployed effect. NODE_ENV in proxy.ts is inlined by Next.js.
    files: ["e2e/**", "playwright.config.ts", "next.config.ts", "proxy.ts"],
    rules: { "turbo/no-undeclared-env-vars": "off" },
  },
]
