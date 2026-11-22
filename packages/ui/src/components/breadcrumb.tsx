import type * as React from "react"

import { Icon } from "@workspace/ui/components/icon"
import { cn } from "@workspace/ui/lib/utils"

export type BreadcrumbItem = {
  label: string
  /** Omit for the current page, which is announced with aria-current. */
  href?: string
}

type BreadcrumbsProps = {
  items: readonly BreadcrumbItem[]
  /** Render links with the host framework's link (for example next/link). */
  renderLink?: (item: Required<BreadcrumbItem>, className: string) => React.ReactNode
  className?: string
}

const linkClass =
  "rounded-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"

/** Classic breadcrumbs: a labelled nav with an ordered list (WAI-ARIA APG). */
function Breadcrumbs({ items, renderLink, className }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
        {items.map((item, index) => {
          const last = index === items.length - 1
          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {item.href && !last ? (
                renderLink ? (
                  renderLink({ label: item.label, href: item.href }, linkClass)
                ) : (
                  <a href={item.href} className={linkClass}>
                    {item.label}
                  </a>
                )
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className="truncate font-medium text-foreground"
                >
                  {item.label}
                </span>
              )}
              {last ? null : (
                <Icon name="chevron-right" className="size-4 text-muted-foreground" />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export { Breadcrumbs }
