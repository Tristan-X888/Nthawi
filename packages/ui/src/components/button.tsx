import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@workspace/ui/lib/utils"
import { Spinner } from "@workspace/ui/components/spinner"

/*
 * Hover and active states darken with color-mix instead of lowering opacity:
 * a translucent fill over white lightens the button and drops label contrast
 * below 4.5:1. Heights follow the 8 pt grid: 32 (sm), 40 (md), 48 (lg).
 * Each variant sets exactly one border colour: Tailwind orders same-property
 * utilities by name, so a base `border-transparent` would always defeat
 * `border-input` and erase the outline variant's boundary.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border text-sm font-medium whitespace-nowrap transition-colors duration-150 ease-standard select-none disabled:cursor-not-allowed disabled:opacity-60 aria-busy:cursor-progress [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary:
          "border-transparent bg-primary text-primary-foreground hover:bg-[color-mix(in_oklch,var(--primary),black_14%)] active:bg-[color-mix(in_oklch,var(--primary),black_22%)]",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_6%)]",
        outline:
          "border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
        ghost:
          "border-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-[color-mix(in_oklch,var(--destructive),black_12%)]",
        link: "h-auto border-transparent px-0 text-link underline underline-offset-4 hover:decoration-2",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-base",
        "icon-sm": "size-8",
        icon: "size-10",
        "icon-lg": "size-12",
      },
      width: {
        auto: "",
        full: "w-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      width: "auto",
    },
  }
)

type ButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    /** Shows a spinner, sets aria-busy and blocks repeat activation. */
    loading?: boolean
  }

function Button({
  className,
  variant,
  size,
  width,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      // Keep focus on a pending button so keyboard and screen-reader users
      // are not moved when a form submits.
      focusableWhenDisabled={loading}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size, width }), className)}
      {...props}
    >
      {loading ? <Spinner size="sm" decorative /> : null}
      {children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants, type ButtonProps }
