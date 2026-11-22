import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono, Lora } from "next/font/google"

import "@workspace/ui/globals.css"
import "./marketing.css"
import { SkipLink } from "@workspace/ui/components/skip-link"
import { StagingBanner } from "@workspace/ui/components/staging-banner"
import { cn } from "@workspace/ui/lib/utils"

import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { ThemeProvider } from "@/components/theme-provider"
import { indexable, siteEnv, siteOrigin } from "@/lib/site"

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

const description =
  "Nthawi answers questions on your website from the pages and files you review and publish, cites its sources, and lets you take over at any time."

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: {
    default: "Nthawi: website answers from knowledge you approve",
    template: "%s | Nthawi",
  },
  description,
  robots: indexable
    ? { index: true, follow: true }
    : { index: false, follow: false },
  ...(indexable
    ? {
        openGraph: {
          type: "website",
          siteName: "Nthawi",
          url: siteOrigin,
          description,
        },
      }
    : {}),
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1717" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-surface="marketing"
      suppressHydrationWarning
      className={cn(geist.variable, lora.variable, geistMono.variable)}
    >
      <body className="flex min-h-dvh flex-col">
        <SkipLink />
        <ThemeProvider>
          {siteEnv === "staging" ? <StagingBanner /> : null}
          <SiteHeader />
          <div className="flex flex-1 flex-col">{children}</div>
          <SiteFooter />
        </ThemeProvider>
      </body>
    </html>
  )
}
