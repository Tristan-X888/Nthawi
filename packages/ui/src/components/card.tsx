import type * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

/** Surface for one coherent piece of content. Padding steps: 24 px (md+), 16 px (mobile). */
function Card({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="card"
      className={cn(
        "flex flex-col gap-6 rounded-xl border bg-card p-4 text-card-foreground shadow-xs sm:p-6",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-wrap items-start gap-x-4 gap-y-2", className)}
      {...props}
    />
  )
}

function CardTitle({
  className,
  headingLevel = 2,
  ...props
}: React.ComponentProps<"h2"> & {
  /** Keep the page outline logical: 3 when the card sits under an h2. */
  headingLevel?: 2 | 3 | 4
}) {
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4"
  return (
    <Heading
      data-slot="card-title"
      className={cn(
        "flex items-center gap-2 font-sans text-base font-semibold",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("basis-full text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

/** Right-aligned header slot for a filter or a "view all" link (widget anatomy). */
function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("ms-auto flex items-center gap-2", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn(className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex flex-wrap items-center gap-3", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
}
