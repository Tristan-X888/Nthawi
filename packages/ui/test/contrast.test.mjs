import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import { contrastRatio, parseThemeBlocks } from "./oklch.mjs"

const css = readFileSync(
  new URL("../src/styles/globals.css", import.meta.url),
  "utf8"
)
const themes = parseThemeBlocks(css)

// [foreground, background, minimum ratio, reason]. Text uses 4.5:1 (1.4.3);
// focus rings, input boundaries and control fills use 3:1 (1.4.11, 2.4.13).
const pairs = [
  ["foreground", "background", 4.5, "body text"],
  ["card-foreground", "card", 4.5, "card text"],
  ["popover-foreground", "popover", 4.5, "popover text"],
  ["primary-foreground", "primary", 4.5, "primary button label"],
  ["secondary-foreground", "secondary", 4.5, "secondary button label"],
  ["accent-foreground", "accent", 4.5, "hover/selected text"],
  ["muted-foreground", "background", 4.5, "help text"],
  ["muted-foreground", "muted", 4.5, "help text on muted surfaces"],
  ["muted-foreground", "card", 4.5, "help text in cards"],
  ["destructive", "background", 4.5, "error message text"],
  ["destructive-foreground", "destructive", 4.5, "destructive button label"],
  ["foreground", "destructive-surface", 4.5, "error alert body"],
  ["destructive", "destructive-surface", 4.5, "error alert title"],
  ["success", "background", 4.5, "success text"],
  ["success", "success-surface", 4.5, "success alert title"],
  ["foreground", "success-surface", 4.5, "success alert body"],
  ["warning", "background", 4.5, "warning text"],
  ["warning", "warning-surface", 4.5, "warning alert title"],
  ["foreground", "warning-surface", 4.5, "warning alert body"],
  ["info", "background", 4.5, "info text"],
  ["info", "info-surface", 4.5, "info alert title"],
  ["foreground", "info-surface", 4.5, "info alert body"],
  ["link", "background", 4.5, "inline links"],
  ["link", "card", 4.5, "links in cards"],
  ["ring", "background", 3, "focus indicator"],
  ["ring", "card", 3, "focus indicator in cards"],
  ["input", "background", 3, "input boundary"],
  ["input", "card", 3, "input boundary in cards"],
  ["primary", "background", 3, "primary control boundary"],
  ["sidebar-foreground", "sidebar", 4.5, "navigation text"],
  ["sidebar-primary-foreground", "sidebar-primary", 4.5, "active nav item"],
  ["sidebar-accent-foreground", "sidebar-accent", 4.5, "hovered nav item"],
  ["sidebar-ring", "sidebar", 3, "navigation focus indicator"],
]

for (const theme of ["light", "dark"]) {
  for (const [fg, bg, minimum, reason] of pairs) {
    test(`${theme}: ${fg} on ${bg} >= ${minimum}:1 (${reason})`, () => {
      const ratio = contrastRatio(themes[theme], fg, bg)
      assert.ok(
        ratio >= minimum,
        `${theme} ${fg} on ${bg} is ${ratio.toFixed(2)}:1; needs ${minimum}:1`
      )
    })
  }
}

test("both themes define the same token names", () => {
  const colourNames = (block) =>
    Object.keys(block)
      .filter((name) => !name.startsWith("shadow"))
      .sort()
  assert.deepEqual(colourNames(themes.dark), colourNames(themes.light))
})

test("the supplied primary would fail (regression guard for the AA change)", () => {
  const supplied = { ...themes.light, primary: [0.605, 0.107, 184.2, 1] }
  assert.ok(contrastRatio(supplied, "primary-foreground", "primary") < 4.5)
})

test("marketing surface only overrides the radius", () => {
  const block = /\[data-surface="marketing"\]\s*\{([^}]*)\}/.exec(css)?.[1]
  assert.ok(block, "marketing surface block is missing")
  const declarations = block
    .split(";")
    .map((line) => line.trim())
    .filter(Boolean)
  assert.deepEqual(declarations, ["--radius: 0.5rem"])
})
