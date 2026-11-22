import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { Icon, type IconName } from "@workspace/ui/components/icon"
import { cn } from "@workspace/ui/lib/utils"

/*
 * Page-level message (design-system.md "Feedback"). Inline field errors use
 * FieldError; background confirmations use a toast. Colour is never the only
 * signal: every tone has its own icon and the title states the outcome.
 */
const alertVariants = cva(
  "grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border p-4 text-sm text-foreground",
  {
    variants: {
      tone: {
        info: "border-info-border bg-info-surface [&_[data-slot=alert-icon]]:text-info",
        success:
          "border-success-border bg-success-surface [&_[data-slot=alert-icon]]:text-success",
        warning:
          "border-warning-border bg-warning-surface [&_[data-slot=alert-icon]]:text-warning",
        error:
          "border-destructive-border bg-destructive-surface [&_[data-slot=alert-icon]]:text-destructive",
      },
    },
    defaultVariants: { tone: "info" },
  }
)

const toneIcon: Record<NonNullable<AlertProps["tone"]>, IconName> = {
  info: "info",
  success: "success",
  warning: "warning",
  error: "error",
}

type AlertProps = Omit<React.ComponentProps<"div">, "title"> &
  VariantProps<typeof alertVariants> & {
    title: React.ReactNode
    /**
     * "polite" announces updates without interrupting (default for info and
     * success); "assertive" is for errors that block the task.
     */
    live?: "polite" | "assertive" | "off"
  }

function Alert({
  className,
  tone = "info",
  title,
  live,
  children,
  ...props
}: AlertProps) {
  const resolvedTone = tone ?? "info"
  const politeness = live ?? (resolvedTone === "error" ? "assertive" : "polite")
  return (
    <div
      data-slot="alert"
      role={
        politeness === "assertive"
          ? "alert"
          : politeness === "polite"
            ? "status"
            : undefined
      }
      aria-live={politeness}
      className={cn(alertVariants({ tone: resolvedTone }), className)}
      {...props}
    >
      <span data-slot="alert-icon" className="row-span-2 mt-0.5 flex">
        <Icon name={toneIcon[resolvedTone]} className="size-5" />
      </span>
      <p className="font-semibold">{title}</p>
      {children ? (
        <div className="text-foreground [&_a]:text-link [&_a]:underline">
          {children}
        </div>
      ) : null}
    </div>
  )
}

export { Alert, alertVariants, type AlertProps }
