import Link from "next/link"

import { Logo } from "@workspace/ui/components/logo"
import { ThemeSelector } from "@workspace/ui/components/theme-selector"

const groups = [
  {
    title: "Product",
    links: [
      { href: "/#how-it-works", label: "How it works" },
      { href: "/pricing", label: "Pricing" },
      { href: "/support", label: "Support" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/legal/terms", label: "Terms of service" },
      { href: "/legal/privacy", label: "Privacy notice" },
      { href: "/legal/refunds", label: "Refund policy" },
      { href: "/legal/cookies", label: "Cookie notice" },
    ],
  },
] as const

export function SiteFooter() {
  return (
    <footer className="border-t bg-muted/40">
      <div className="container-content grid gap-12 py-12 md:grid-cols-12">
        <div className="flex flex-col gap-4 md:col-span-5">
          <Logo />
          <p className="max-w-sm text-sm text-muted-foreground">
            Website answers from knowledge you review and publish.
          </p>
          <ThemeSelector compact />
        </div>
        {groups.map((group) => (
          <nav
            key={group.title}
            aria-label={group.title}
            className="flex flex-col gap-3 md:col-span-3"
          >
            <h2 className="font-sans text-sm font-semibold">{group.title}</h2>
            <ul className="flex flex-col gap-2">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="container-content border-t py-6 text-xs text-muted-foreground">
        © 2026 Nthawi
      </div>
    </footer>
  )
}
