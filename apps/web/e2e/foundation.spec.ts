import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

const widths = [320, 375, 414, 768, 1024, 1280, 1440] as const
const screenshotDir = process.env.NTHAWI_SCREENSHOT_DIR

/** Fails the test on any CSP violation or uncaught page error. */
function watchForViolations(page: Page) {
  const problems: string[] = []
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to (execute|load|apply)/i.test(message.text())) {
      problems.push(message.text())
    }
  })
  page.on("pageerror", (error) => problems.push(error.message))
  return problems
}

async function expectNoSeriousAxeIssues(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze()
  const blocking = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical"
  )
  expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([])
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`catalogue has no serious or critical axe issues (${colorScheme})`, async ({ page }) => {
    const problems = watchForViolations(page)
    await page.emulateMedia({ colorScheme })
    await page.goto("/catalogue")
    await expect(page.getByRole("heading", { level: 1, name: "Component catalogue" })).toBeVisible()
    await expectNoSeriousAxeIssues(page)
    expect(problems).toEqual([])
  })
}

test("outline buttons keep a visible boundary (regression: border utility order)", async ({ page }) => {
  await page.goto("/catalogue")
  const outline = page.getByRole("button", { name: "Outline" })
  const colour = await outline.evaluate((el) => getComputedStyle(el).borderTopColor)
  expect(colour).not.toBe("rgba(0, 0, 0, 0)")
})

test("skip link is the first focus stop and moves focus to main", async ({ page }) => {
  await page.goto("/catalogue")
  await page.keyboard.press("Tab")
  const skip = page.getByRole("link", { name: "Skip to main content" })
  await expect(skip).toBeFocused()
  await expect(skip).toBeInViewport()
  await page.keyboard.press("Enter")
  await expect(page.locator("main#main")).toBeFocused()
})

test("form errors are announced through the field, not colour alone", async ({ page }) => {
  await page.goto("/catalogue")
  const form = page.getByRole("form", { name: "Sign in to Nthawi" })
  await form.getByRole("button", { name: "Sign in", exact: true }).click()
  const email = form.getByRole("textbox", { name: /^Email/ })
  await expect(email).toHaveAttribute("aria-invalid", "true")
  await expect(email).toBeFocused()
  await expect(form.getByText("Enter your email address.")).toBeVisible()
  const describedBy = await email.getAttribute("aria-describedby")
  expect(describedBy).toBeTruthy()
})

test("sidebar collapses to the 80 px rail and names icons", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto("/catalogue")
  const sidebar = page.locator("aside")
  await expect(sidebar).toHaveCSS("width", "240px")
  const toggle = page.getByRole("button", { name: "Collapse navigation" })
  await expect(toggle).toHaveAttribute("aria-expanded", "true")
  await toggle.click()
  await expect(page.getByRole("button", { name: "Expand navigation" })).toHaveAttribute("aria-expanded", "false")
  await expect(sidebar).toHaveCSS("width", "80px")
  // Labels stay available to assistive technology in the rail.
  await expect(page.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page")
})

test("secondary level expands from its parent with the keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto("/catalogue")
  const settings = page.getByRole("button", { name: "Settings" })
  await expect(settings).toHaveAttribute("aria-expanded", "false")
  await settings.focus()
  await page.keyboard.press("Enter")
  await expect(settings).toHaveAttribute("aria-expanded", "true")
  await expect(page.getByRole("link", { name: "Sessions" })).toBeVisible()
})

test("mobile drawer traps focus and closes with Escape", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/catalogue")
  await expect(page.locator("aside")).toBeHidden()
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible()
  const open = page.getByRole("button", { name: "Open navigation" })
  await open.click()
  const drawer = page.getByRole("dialog", { name: "Navigation" })
  await expect(drawer).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(drawer).toBeHidden()
  await expect(open).toBeFocused()
})

test("no horizontal scrolling at any supported width", async ({ page }) => {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/catalogue")
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(0)
  }
})

test("screenshots at every width in light and dark", async ({ page }) => {
  test.skip(!screenshotDir, "Set NTHAWI_SCREENSHOT_DIR to capture review screenshots.")
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" })
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto("/catalogue")
      await page.screenshot({
        path: `${screenshotDir}/web-catalogue-${colorScheme}-${width}.png`,
        fullPage: width >= 1024,
      })
    }
  }
})

test("owner responses carry the profile O policy", async ({ request }) => {
  const first = await request.get("/catalogue")
  const second = await request.get("/catalogue")
  const csp = first.headers()["content-security-policy"] ?? ""
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/)
  expect(csp).toContain("frame-ancestors 'none'")
  expect(csp).not.toContain("unsafe-eval")
  expect(second.headers()["content-security-policy"]).not.toEqual(csp)
  expect(first.headers()["cache-control"]).toContain("no-store")
  expect(first.headers()["x-robots-tag"]).toBe("noindex, nofollow")
  expect(first.headers()["x-powered-by"]).toBeUndefined()
})
