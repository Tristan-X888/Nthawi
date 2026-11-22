import { cn } from "@workspace/ui/lib/utils"

/**
 * Original Nthawi mark: a clock face ("nthawi" means time in Chichewa) that is
 * also a speech bubble (the product answers conversations). Decorative by
 * default; the surrounding link provides the accessible name.
 */
function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn("size-8 shrink-0", className)}
    >
      <circle
        cx="16"
        cy="14.5"
        r="11"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <path
        d="M8.6 22.6 6 28.5l6.1-2.7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 14.5V8.5M16 14.5l4.6 2.6"
        stroke="var(--brand)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function Logo({
  className,
  wordmark = true,
}: {
  className?: string
  wordmark?: boolean
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-foreground",
        className
      )}
    >
      <LogoMark />
      {wordmark ? (
        <span className="font-heading text-xl leading-none font-semibold tracking-tight">
          Nthawi
        </span>
      ) : null}
    </span>
  )
}

export { Logo, LogoMark }
