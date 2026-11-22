import Link from "next/link"

import { buttonVariants } from "@workspace/ui/components/button"
import { Logo } from "@workspace/ui/components/logo"

import { MobileMenu } from "@/components/mobile-menu"
import { appOrigin } from "@/lib/site"

export const primaryLinks = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/support", label: "Support" },
] as const

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
      <div className="container-content flex h-16 items-center gap-6">
        <Link href="/" aria-label="Nthawi home" className="rounded-md">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {primaryLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ms-auto hidden items-center gap-2 md:flex">
          <a
            href={`${appOrigin}/sign-in`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Sign in
          </a>
          <a
            href={`${appOrigin}/sign-up`}
            className={buttonVariants({ size: "sm" })}
          >
            Create an account
          </a>
        </div>
        <MobileMenu
          links={primaryLinks}
          signInHref={`${appOrigin}/sign-in`}
          signUpHref={`${appOrigin}/sign-up`}
        />
      </div>
    </header>
  )
}
