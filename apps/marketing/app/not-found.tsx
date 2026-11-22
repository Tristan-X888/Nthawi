import Link from "next/link"

import { buttonVariants } from "@workspace/ui/components/button"

/** Exported as 404.html; owner paths such as /dashboard also land here (profile M). */
export default function NotFound() {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="container-content flex flex-col items-start gap-6 py-24 outline-none"
    >
      <h1 className="text-4xl font-semibold tracking-tight">Page not found</h1>
      <p className="max-w-(--prose-max) text-lg text-muted-foreground">
        This page does not exist. Check the address, or start from the home
        page.
      </p>
      <Link href="/" className={buttonVariants()}>
        Go to the home page
      </Link>
    </main>
  )
}
