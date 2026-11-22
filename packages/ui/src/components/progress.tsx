"use client"

import { Progress as ProgressPrimitive } from "@base-ui/react/progress"

import { cn } from "@workspace/ui/lib/utils"

type ProgressBarProps = {
  /** Visible label; also names the progressbar. */
  label: string
  value: number
  max?: number
  /** Visible text such as "2 of 5"; defaults to a percentage. */
  valueText?: string
  className?: string
}

/** Linear progress (usage allowances, setup progress). */
function ProgressBar({
  label,
  value,
  max = 100,
  valueText,
  className,
}: ProgressBarProps) {
  return (
    <ProgressPrimitive.Root
      value={value}
      max={max}
      getAriaValueText={valueText ? () => valueText : undefined}
      className={cn("grid w-full grid-cols-[1fr_auto] gap-y-2", className)}
    >
      <ProgressPrimitive.Label className="text-sm font-medium">
        {label}
      </ProgressPrimitive.Label>
      <span className="text-sm text-muted-foreground tabular-nums">
        {valueText ?? `${Math.round((value / max) * 100)}%`}
      </span>
      <ProgressPrimitive.Track className="col-span-2 h-2 overflow-hidden rounded-full bg-muted">
        <ProgressPrimitive.Indicator className="h-full rounded-full bg-primary transition-[width] duration-300 ease-standard" />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  )
}

/** Ring variant for compact cards (sidebar setup card). */
function ProgressRing({
  label,
  value,
  max = 100,
  size = 56,
  className,
}: Omit<ProgressBarProps, "valueText"> & { size?: number }) {
  const ratio = Math.min(1, Math.max(0, value / max))
  const radius = 22
  const circumference = 2 * Math.PI * radius
  const percent = Math.round(ratio * 100)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`${percent}%`}
      className={cn("relative inline-grid place-items-center", className)}
    >
      <svg viewBox="0 0 56 56" width={size} height={size} aria-hidden="true">
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="none"
          strokeWidth="5"
          className="stroke-muted"
        />
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          transform="rotate(-90 28 28)"
          className="stroke-primary"
        />
      </svg>
      <span
        aria-hidden="true"
        className="absolute text-xs font-semibold tabular-nums"
      >
        {percent}%
      </span>
    </div>
  )
}

export { ProgressBar, ProgressRing }
