import { defineConfig, devices } from "@playwright/test"

/**
 * Owner application browser tests. The foundation suite runs against a
 * production build that includes the catalogue:
 *   NTHAWI_CATALOGUE=1 pnpm --filter @nthawi/web exec next build
 * Account journeys (6.2+) must run through scripts/dev-signed-proxy.mjs
 * (Block C5b) with the local API and disposable PostgreSQL.
 */
const port = Number(process.env.NTHAWI_WEB_PORT ?? 3600)

export default defineConfig({
  testDir: "./e2e",
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? "./.playwright/results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec next start --port ${port} --hostname 127.0.0.1`,
    url: `http://127.0.0.1:${port}/catalogue`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
