import { nextJsConfig } from "@workspace/eslint-config/next-js"

/** @type {import("eslint").Linter.Config[]} */
export default [
  // Static export output and test artefacts are generated, not source.
  { ignores: ["out/**", ".next/**", ".playwright/**"] },
  ...nextJsConfig,
  {
    // Build, preview and test scripts run in Node.js.
    files: ["scripts/**/*.mjs", "e2e/**/*.mjs", "test/**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        URL: "readonly",
        Buffer: "readonly",
      },
    },
  },
  {
    // Test-only switches; see apps/web/eslint.config.js for the reasoning.
    files: ["e2e/**", "playwright.config.ts", "scripts/**/*.mjs"],
    rules: { "turbo/no-undeclared-env-vars": "off" },
  },
]
