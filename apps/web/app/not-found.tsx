import Link from "next/link"

import { buttonVariants } from "@workspace/ui/components/button"
import { Logo } from "@workspace/ui/components/logo"

import { copy } from "@/lib/copy"

/**
 * Missing and foreign resources render this same page (an owner probing
 * another owner's workspace ID learns nothing; see workspace-access.ts).
 */
export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="grid min-h-dvh place-items-center px-4 py-12 outline-none">
      <div className="flex w-full max-w-md flex-col items-start gap-6">
        <Logo />
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{copy.notFound.title}</h1>
          <p className="text-base text-muted-foreground">{copy.notFound.description}</p>
        </div>
        <Link href="/" className={buttonVariants({ variant: "primary" })}>
          {copy.notFound.action}
        </Link>
      </div>
    </main>
  )
}
