import type * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Page anatomy (design-system.md "Page anatomy"): breadcrumbs, one h1, an
 * optional description and right-aligned actions that wrap below on mobile.
 */
function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  breadcrumbs?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn("flex flex-col gap-4", className)}>
      {breadcrumbs}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-(--prose-max) min-w-0 flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="text-base text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-3">{actions}</div>
        ) : null}
      </div>
    </header>
  )
}

export { PageHeader }
