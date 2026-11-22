"use client"

import { Field as FieldPrimitive } from "@base-ui/react/field"
import type * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

/*
 * The one form-field pattern (design-system.md "Forms"): label above, optional
 * help, one input group, one error. Base UI wires aria-describedby and
 * aria-invalid between the parts; never hand-roll those attributes.
 */

function Field({ className, ...props }: FieldPrimitive.Root.Props) {
  return (
    <FieldPrimitive.Root
      data-slot="field"
      className={cn("flex w-full flex-col gap-2", className)}
      {...props}
    />
  )
}

type FieldLabelProps = FieldPrimitive.Label.Props & {
  /** Adds the visual required marker. Put `required` on the control too. */
  required?: boolean
}

function FieldLabel({
  className,
  required,
  children,
  ...props
}: FieldLabelProps) {
  return (
    <FieldPrimitive.Label
      data-slot="field-label"
      className={cn("text-sm font-semibold text-foreground", className)}
      {...props}
    >
      {children}
      {required ? (
        <span aria-hidden="true" className="ms-1 text-destructive">
          *
        </span>
      ) : null}
    </FieldPrimitive.Label>
  )
}

function FieldDescription({
  className,
  ...props
}: FieldPrimitive.Description.Props) {
  return (
    <FieldPrimitive.Description
      data-slot="field-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function FieldError({ className, ...props }: FieldPrimitive.Error.Props) {
  return (
    <FieldPrimitive.Error
      data-slot="field-error"
      className={cn("text-sm font-medium text-destructive", className)}
      {...props}
    />
  )
}

/** The 48 px input shell from the Uiverse anatomy, mapped to tokens. */
function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      className={cn(
        "flex h-12 w-full items-center gap-3 rounded-md border-[1.5px] border-input bg-background px-3 text-foreground transition-colors duration-150 ease-standard",
        "focus-within:border-ring focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
        "has-[[aria-invalid=true]]:border-destructive has-[[data-disabled]]:opacity-60",
        className
      )}
      {...props}
    />
  )
}

function InputGroupIcon({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden="true"
      data-slot="input-group-icon"
      className={cn(
        "flex shrink-0 text-muted-foreground [&_svg]:size-5",
        className
      )}
      {...props}
    />
  )
}

/** Text control. 16 px text avoids iOS zoom; focus is shown on the group. */
function FieldControl({ className, ...props }: FieldPrimitive.Control.Props) {
  return (
    <FieldPrimitive.Control
      data-slot="field-control"
      className={cn(
        "h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed",
        className
      )}
      {...props}
    />
  )
}

export {
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  InputGroup,
  InputGroupIcon,
}
