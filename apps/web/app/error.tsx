"use client"

import { Button } from "@workspace/ui/components/button"
import { ErrorState } from "@workspace/ui/components/state"

import { copy } from "@/lib/copy"

/**
 * Route error boundary. `digest` is the server-side correlation reference:
 * safe to show, and it lets support find the log line without exposing the
 * error message, stack or request data.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto w-full max-w-xl px-4 py-12 outline-none"
    >
      <ErrorState
        headingLevel={1}
        title={copy.error.title}
        description={copy.error.description}
        correlationId={error.digest}
        action={
          <Button variant="outline" onClick={() => reset()}>
            {copy.error.retry}
          </Button>
        }
      />
    </main>
  )
}
