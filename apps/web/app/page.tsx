import { Logo } from "@workspace/ui/components/logo"
import { ThemeSelector } from "@workspace/ui/components/theme-selector"

import { copy } from "@/lib/copy"

/** Honest holding page until the Phase 6.2 sign-in page replaces it. */
export default function HomePage() {
  return (
    <main id="main" tabIndex={-1} className="grid min-h-dvh place-items-center px-4 py-12 outline-none">
      <div className="flex w-full max-w-md flex-col gap-8">
        <Logo />
        <div className="flex flex-col gap-3">
          <h1 className="text-4xl font-semibold tracking-tight">{copy.home.title}</h1>
          <p className="text-base text-muted-foreground">{copy.home.description}</p>
        </div>
        <ThemeSelector />
      </div>
    </main>
  )
}
