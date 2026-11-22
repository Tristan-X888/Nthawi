import type * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

/*
 * Placeholder sized to the final layout so content never shifts (CLS).
 * Purely visual: the loading region announces itself once via LoadingRegion.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton"
      className={cn("skeleton rounded-md", className)}
      {...props}
    />
  )
}

/** Wraps skeletons and tells assistive technology what is loading. */
function LoadingRegion({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={className}
    >
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}

export { LoadingRegion, Skeleton }
