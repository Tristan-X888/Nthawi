"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"
import type * as React from "react"

/**
 * Static export: the pre-paint theme script is identical on every page, so
 * scripts/csp-headers.mjs hashes it into the CSP. `disableTransitionOnChange`
 * is deliberately off here: it injects a runtime <style> element that the
 * hashed policy (no nonce on a static site) correctly blocks. The former
 * single-key "d" shortcut was removed (WCAG 2.1.4).
 */
function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </NextThemesProvider>
  )
}

export { ThemeProvider }
