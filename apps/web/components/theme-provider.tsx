"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"
import type * as React from "react"

/**
 * Light, dark and system themes. The pre-paint theme script carries the
 * request nonce so it runs under the strict CSP. The former single-key "d"
 * shortcut was removed: unmodified character shortcuts fail WCAG 2.1.4.
 */
function ThemeProvider({
  children,
  nonce,
}: {
  children: React.ReactNode
  nonce?: string
}) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      nonce={nonce}
    >
      {children}
    </NextThemesProvider>
  )
}

export { ThemeProvider }
