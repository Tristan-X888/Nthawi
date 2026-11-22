"use client"

import "@workspace/ui/globals.css"

import { copy } from "@/lib/copy"

/** Last-resort boundary when the root layout itself fails. No dependencies. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en" data-surface="app">
      <body className="grid min-h-dvh place-items-center bg-background px-4 text-foreground">
        <main className="flex max-w-md flex-col gap-4">
          <h1 className="text-2xl font-semibold">{copy.error.title}</h1>
          <p className="text-muted-foreground">{copy.error.description}</p>
          {error.digest ? (
            <p className="text-xs text-muted-foreground">
              Reference for support: <code className="font-mono">{error.digest}</code>
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            className="h-10 w-fit rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            {copy.error.retry}
          </button>
        </main>
      </body>
    </html>
  )
}
