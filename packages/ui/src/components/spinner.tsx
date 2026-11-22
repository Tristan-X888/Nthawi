import { cn } from "@workspace/ui/lib/utils"

const sizes = { sm: "size-4", md: "size-5", lg: "size-8" } as const

type SpinnerProps = {
  size?: keyof typeof sizes
  /** Accessible status text. Ignored when `decorative`. */
  label?: string
  /** Hide from assistive technology when a parent already announces state. */
  decorative?: boolean
  className?: string
}

/** Indeterminate loader. Under reduced motion it stops rotating but stays visible. */
function Spinner({
  size = "md",
  label = "Loading",
  decorative = false,
  className,
}: SpinnerProps) {
  const icon = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("animate-spin", sizes[size], className)}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
  if (decorative) return icon
  return (
    <span role="status" className="inline-flex items-center gap-2">
      {icon}
      <span className="sr-only">{label}</span>
    </span>
  )
}

export { Spinner, type SpinnerProps }
