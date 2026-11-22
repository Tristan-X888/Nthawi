import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

/** Status labels and counters (sidebar status indicators, state chips). */
const badgeVariants = cva(
  "inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-xs font-medium whitespace-nowrap tabular-nums [&_svg]:size-3.5",
  {
    variants: {
      tone: {
        neutral: "border-border bg-muted text-muted-foreground",
        brand: "border-transparent bg-secondary text-secondary-foreground",
        success: "border-success-border bg-success-surface text-success",
        warning: "border-warning-border bg-warning-surface text-warning",
        error:
          "border-destructive-border bg-destructive-surface text-destructive",
        info: "border-info-border bg-info-surface text-info",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
)

function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ tone }), className)}
      {...props}
    />
  )
}

/** "9+" style counter with a full spoken label for screen readers. */
function CountBadge({
  count,
  max = 9,
  label,
  className,
}: {
  count: number
  max?: number
  label: string
  className?: string
}) {
  const shown = count > max ? `${max}+` : String(count)
  return (
    <Badge tone="neutral" className={cn("min-w-6 justify-center", className)}>
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{`${count} ${label}`}</span>
    </Badge>
  )
}

export { Badge, badgeVariants, CountBadge }
