// OKLCH -> sRGB relative luminance and WCAG 2.x contrast, for token tests.
// Out-of-gamut channels are clipped, which approximates browser gamut mapping.

const toGammaChannel = (value) =>
  value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055
const toLinearChannel = (value) =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4

/** @param {[number, number, number]} lch */
export function oklchToGammaSrgb([lightness, chroma, hue]) {
  const radians = (hue * Math.PI) / 180
  const a = chroma * Math.cos(radians)
  const b = chroma * Math.sin(radians)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => toGammaChannel(Math.min(1, Math.max(0, channel))))
}

function luminance(gamma) {
  const [r, g, b] = gamma.map(toLinearChannel)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Parse `--name: oklch(L C H [/ A])` declarations from the first `:root` and
 * `.dark` blocks. Returns { light, dark } maps of name -> [L, C, H, alpha].
 */
export function parseThemeBlocks(css) {
  const block = (selector) => {
    const match = new RegExp(
      `(^|\\n)${selector}\\s*\\{([\\s\\S]*?)\\n\\}`
    ).exec(css)
    if (!match) throw new Error(`Missing ${selector} block`)
    const tokens = {}
    const declaration =
      /--([a-z0-9-]+):\s*oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)\s*;/g
    for (const [, name, l, c, h, alpha] of match[2].matchAll(declaration)) {
      tokens[name] = [
        Number(l),
        Number(c),
        Number(h),
        alpha ? Number(alpha) : 1,
      ]
    }
    return tokens
  }
  return { light: block(":root"), dark: block("\\.dark") }
}

/** Composite a translucent token over `backdrop` in gamma space, as browsers do. */
function resolve(theme, name, backdrop = "background") {
  const token = theme[name]
  if (!token) throw new Error(`Unknown token --${name}`)
  const [l, c, h, alpha] = token
  const colour = oklchToGammaSrgb([l, c, h])
  if (alpha === 1) return colour
  const base = resolve(theme, backdrop)
  return colour.map(
    (channel, index) => channel * alpha + base[index] * (1 - alpha)
  )
}

export function contrastRatio(theme, foreground, background) {
  const bg = resolve(theme, background)
  const fgToken = theme[foreground]
  const fg =
    fgToken && fgToken[3] < 1
      ? (() => {
          const [l, c, h, alpha] = fgToken
          const colour = oklchToGammaSrgb([l, c, h])
          return colour.map((v, i) => v * alpha + bg[i] * (1 - alpha))
        })()
      : resolve(theme, foreground)
  const [high, low] = [luminance(fg), luminance(bg)].sort((x, y) => y - x)
  return (high + 0.05) / (low + 0.05)
}
