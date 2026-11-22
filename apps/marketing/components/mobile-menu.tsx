"use client"

import Link from "next/link"
import * as React from "react"

import { buttonVariants } from "@workspace/ui/components/button"
import { Icon } from "@workspace/ui/components/icon"
import { Logo } from "@workspace/ui/components/logo"
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@workspace/ui/components/sheet"

/** Hamburger menu below md: a focus-trapped sheet that closes on navigation. */
export function MobileMenu({
  links,
  signInHref,
  signUpHref,
}: {
  links: ReadonlyArray<{ href: string; label: string }>
  signInHref: string
  signUpHref: string
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Open menu"
        className="ms-auto grid size-10 place-items-center rounded-md hover:bg-accent md:hidden"
      >
        <Icon name="menu" />
      </SheetTrigger>
      <SheetContent side="end" className="gap-6 p-4">
        <div className="flex items-center justify-between">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <Logo />
          <SheetClose aria-label="Close menu" className="grid size-10 place-items-center rounded-md hover:bg-accent">
            <Icon name="close" />
          </SheetClose>
        </div>
        <nav aria-label="Main">
          <ul className="flex flex-col gap-1">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="flex h-12 items-center rounded-md px-3 text-base font-medium hover:bg-accent"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-auto flex flex-col gap-3">
          <a href={signUpHref} className={buttonVariants({ size: "lg", width: "full" })}>
            Create an account
          </a>
          <a href={signInHref} className={buttonVariants({ variant: "outline", size: "lg", width: "full" })}>
            Sign in
          </a>
        </div>
      </SheetContent>
    </Sheet>
  )
}
