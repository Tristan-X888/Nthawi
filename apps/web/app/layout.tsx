import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono, Lora } from "next/font/google"
import { headers } from "next/headers"

import "@workspace/ui/globals.css"
import { CSPProvider } from "@workspace/ui/components/csp-provider"
import { SkipLink } from "@workspace/ui/components/skip-link"
import { StagingBanner } from "@workspace/ui/components/staging-banner"
import { cn } from "@workspace/ui/lib/utils"

import { ThemeProvider } from "@/components/theme-provider"
import { copy } from "@/lib/copy"

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
})
const lora = Lora({
  subsets: ["latin"],
  variable: "--font-lora",
  display: "swap",
})
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
})

export const metadata: Metadata = {
  title: { default: "Nthawi", template: "%s | Nthawi" },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1717" },
  ],
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Reading the request makes every owner page dynamic, which the nonce CSP
  // requires (no static shell can carry a per-request nonce).
  const nonce = (await headers()).get("x-nonce") ?? undefined
  const staging = process.env.NEXT_PUBLIC_SITE_ENV === "staging"

  return (
    <html
      lang="en"
      data-surface="app"
      suppressHydrationWarning
      className={cn(geist.variable, lora.variable, geistMono.variable)}
    >
      <body className="min-h-dvh">
        <SkipLink>{copy.skipLink}</SkipLink>
        <CSPProvider nonce={nonce}>
          <ThemeProvider nonce={nonce}>
            {staging ? <StagingBanner /> : null}
            {children}
          </ThemeProvider>
        </CSPProvider>
      </body>
    </html>
  )
}
