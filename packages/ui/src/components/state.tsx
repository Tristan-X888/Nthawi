import type * as React from "react"

import { Icon, type IconName } from "@workspace/ui/components/icon"
import { cn } from "@workspace/ui/lib/utils"

/** Empty state: says what is missing and offers the next action. */
function EmptyState({
  icon = "inbox",
  title,
  description,
  action,
  headingLevel = 2,
  className,
}: {
  icon?: IconName
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  headingLevel?: 2 | 3
  className?: string
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2"
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-12 text-center",
        className
      )}
    >
      <span className="grid size-12 place-items-center rounded-full bg-secondary text-secondary-foreground">
        <Icon name={icon} className="size-6" />
      </span>
      <div className="flex max-w-sm flex-col gap-2">
        <Heading className="font-sans text-base font-semibold">{title}</Heading>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}

/**
 * Error state: a human message, the correlation ID support needs, and a retry.
 * Never shows stack traces, SQL, provider responses or secrets.
 */
function ErrorState({
  title,
  description,
  correlationId,
  action,
  headingLevel = 2,
  className,
}: {
  title: string
  description: React.ReactNode
  correlationId?: string
  action?: React.ReactNode
  headingLevel?: 1 | 2 | 3
  className?: string
}) {
  const Heading = headingLevel === 1 ? "h1" : headingLevel === 3 ? "h3" : "h2"
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-4 rounded-xl border border-destructive-border bg-destructive-surface p-6",
        className
      )}
    >
      <span className="flex items-center gap-3 text-destructive">
        <Icon name="error" className="size-6" />
        <Heading className="font-sans text-lg font-semibold text-foreground">
          {title}
        </Heading>
      </span>
      <div className="text-sm text-foreground">{description}</div>
      {correlationId ? (
        <p className="text-xs text-muted-foreground">
          Reference for support:{" "}
          <code className="font-mono text-foreground select-all">
            {correlationId}
          </code>
        </p>
      ) : null}
      {action}
    </div>
  )
}

export { EmptyState, ErrorState }
