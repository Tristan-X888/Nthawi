"use client"

import { Form as FormPrimitive } from "@base-ui/react/form"

import { cn } from "@workspace/ui/lib/utils"

/**
 * The only form element for product forms. It runs constraint validation on
 * submit, marks fields aria-invalid, moves focus to the first invalid field
 * and shows server errors passed through `errors` (keyed by Field `name`), so
 * API 422 responses land on the right field without custom wiring.
 */
function Form({ className, ...props }: FormPrimitive.Props) {
  return (
    <FormPrimitive
      data-slot="form"
      className={cn("flex w-full flex-col gap-6", className)}
      {...props}
    />
  )
}

export { Form }
