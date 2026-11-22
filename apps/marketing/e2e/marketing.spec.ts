import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

const pages = ["/", "/pricing", "/support", "/legal/terms", "/legal/privacy", "/legal/refunds", "/legal/cookies"]
const widths = [320, 375, 414, 768, 1024, 1280, 1440] as const
const screenshotDir = process.env.NTHAWI_SCREENSHOT_DIR

function watch(page: Page) {
  const problems: string[] = []
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to (execute|load|apply)/i.test(message.text())) problems.push(message.text())
  })
  page.on("pageerror", (error) => problems.push(error.message))
  return problems
}

for (const path of pages) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`${path} renders under the hashed CSP with no serious axe issues (${colorScheme})`, async ({ page }) => {
      const problems = watch(page)
      await page.emulateMedia({ colorScheme })
      const response = await page.goto(path)
      expect(response?.status()).toBe(200)
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1)
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze()
      const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
      expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([])
      expect(problems).toEqual([])
    })
  }
}

test("CSP allows only self and build-time hashes for scripts", async ({ request }) => {
  const response = await request.get("/")
  const csp = response.headers()["content-security-policy"] ?? ""
  expect(csp).toMatch(/script-src 'self'( 'sha256-[A-Za-z0-9+/=]+')+;/)
  expect(csp).not.toMatch(/script-src[^;]*(unsafe-inline|unsafe-eval|strict-dynamic)/)
  expect(csp).toContain("frame-ancestors 'none'")
})

test("pages hydrate: the mobile menu opens and closes with the keyboard", async ({ page }) => {
  const problems = watch(page)
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  const open = page.getByRole("button", { name: "Open menu" })
  await open.click()
  const menu = page.getByRole("dialog", { name: "Menu" })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole("link", { name: "Pricing" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(menu).toBeHidden()
  await expect(open).toBeFocused()
  expect(problems).toEqual([])
})

test("no owner routes, auth client or cookies on the marketing surface", async ({ page, request }) => {
  for (const path of ["/dashboard", "/sign-in", "/api/auth/get-session", "/w/123"]) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(404)
    expect(response.headers()["set-cookie"], path).toBeUndefined()
  }
  await page.goto("/")
  expect(await page.context().cookies()).toEqual([])
  const html = await (await request.get("/")).text()
  expect(html).not.toMatch(/better-auth|\/api\/auth|NETLIFY_PROXY|BETTER_AUTH/)
})

test("non-production builds are not indexable", async ({ page, request }) => {
  await page.goto("/")
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/)
  const robots = await (await request.get("/robots.txt")).text()
  expect(robots).toMatch(/Disallow: \//)
})

test("pricing shows the exact approved Launch values", async ({ page }) => {
  await page.goto("/pricing")
  await expect(page.getByText("MWK 20,000.00", { exact: true }).first()).toBeVisible()
  await expect(page.getByText("There is no free trial, and nothing is processed before you pay.")).toBeVisible()
  await expect(page.getByText("Paid access is not available yet").first()).toBeVisible()
  const table = page.getByRole("table", { name: "With your account" })
  await expect(table.getByRole("row", { name: /Active workspaces/ })).toContainText("2")
})

test("outline buttons keep a visible boundary (regression: border utility order)", async ({ page }) => {
  await page.goto("/")
  const outline = page.getByRole("link", { name: "See pricing" })
  const colour = await outline.evaluate((el) => getComputedStyle(el).borderTopColor)
  expect(colour).not.toBe("rgba(0, 0, 0, 0)")
})

test("reduced motion shows the whole example conversation at once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  const reply = page.getByText("I can arrange Saturday delivery", { exact: false })
  expect(await reply.evaluate((el) => getComputedStyle(el).opacity)).toBe("1")
})

test("skip link reaches main content", async ({ page }) => {
  await page.goto("/pricing")
  await page.keyboard.press("Tab")
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(page.locator("main#main")).toBeFocused()
})

test("no horizontal scrolling at any supported width", async ({ page }) => {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 })
    for (const path of ["/", "/pricing"]) {
      await page.goto(path)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0)
    }
  }
})

test("screenshots at every width in light and dark", async ({ page }) => {
  test.skip(!screenshotDir, "Set NTHAWI_SCREENSHOT_DIR to capture review screenshots.")
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" })
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 })
      for (const [name, path] of [["home", "/"], ["pricing", "/pricing"]] as const) {
        await page.goto(path)
        await page.screenshot({ path: `${screenshotDir}/marketing-${name}-${colorScheme}-${width}.png`, fullPage: true })
      }
    }
  }
})
