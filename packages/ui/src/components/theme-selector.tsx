"use client"

import { Radio } from "@base-ui/react/radio"
import { RadioGroup } from "@base-ui/react/radio-group"
import { useTheme } from "next-themes"
import * as React from "react"

import { Icon, type IconName } from "@workspace/ui/components/icon"
import { cn } from "@workspace/ui/lib/utils"

const subscribeNever = () => () => {}

const options: ReadonlyArray<{ value: string; label: string; icon: IconName }> =
  [
    { value: "light", label: "Light", icon: "sun" },
    { value: "dark", label: "Dark", icon: "moon" },
    { value: "system", label: "System", icon: "system" },
  ]

/**
 * Segmented "indicator" selector for light, dark and system themes. A radio
 * group, so arrow keys move between options and the choice is announced.
 */
function ThemeSelector({
  className,
  compact = false,
}: {
  className?: string
  /** Icon-only buttons with accessible names, for tight spaces. */
  compact?: boolean
}) {
  const { theme, setTheme } = useTheme()
  const labelId = React.useId()
  // The stored theme is unknown during server rendering and hydration; report
  // "system" until the client snapshot is available, without an effect.
  const mounted = React.useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  )

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span
        id={labelId}
        className={compact ? "sr-only" : "text-sm font-semibold"}
      >
        Theme
      </span>
      <RadioGroup
        aria-labelledby={labelId}
        value={mounted ? (theme ?? "system") : "system"}
        onValueChange={(value) => setTheme(String(value))}
        className="inline-flex w-fit gap-1 rounded-lg border bg-muted p-1"
      >
        {options.map((option) => (
          <Radio.Root
            key={option.value}
            value={option.value}
            aria-label={compact ? option.label : undefined}
            className={cn(
              "inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 ease-standard hover:text-foreground",
              "data-checked:bg-background data-checked:text-foreground data-checked:shadow-xs",
              compact && "w-8 px-0"
            )}
          >
            <Icon name={option.icon} className="size-4" />
            {compact ? null : option.label}
          </Radio.Root>
        ))}
      </RadioGroup>
    </div>
  )
}

export { ThemeSelector }
