"use client"

import { Collapsible } from "@base-ui/react/collapsible"
import { Tooltip } from "@base-ui/react/tooltip"
import * as React from "react"

import { CountBadge } from "@workspace/ui/components/badge"
import { Icon, type IconName } from "@workspace/ui/components/icon"
import { cn } from "@workspace/ui/lib/utils"

/*
 * Owner navigation (design-system.md "Sidebar"), from the supplied references:
 * 240 px expanded / 80 px collapsed; 40 px items with 4 px gaps; sections 24 px
 * apart; filled active item; tinted hover; count badges; one secondary level
 * with leading tree lines; a call-to-action slot and the workspace row at the
 * bottom. Never deeper than two levels.
 */

export type NavLeaf = {
  id: string
  label: string
  href: string
}

export type NavItem = NavLeaf & {
  icon: IconName
  badge?: { count: number; label: string }
  /** Later-phase destination: shown honestly as unavailable, never as a link. */
  unavailable?: boolean
  children?: readonly NavLeaf[]
}

export type NavSection = { id: string; label: string; items: readonly NavItem[] }

type LinkComponent = React.ElementType<{
  href: string
  className?: string
  "aria-current"?: "page"
  children?: React.ReactNode
}>

type SidebarContextValue = {
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
  currentPath: string
  Link: LinkComponent
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) throw new Error("Sidebar parts must be used inside SidebarProvider.")
  return context
}

function isActive(currentPath: string, href: string) {
  return currentPath === href || currentPath.startsWith(`${href}/`)
}

function SidebarProvider({
  children,
  currentPath,
  defaultCollapsed = false,
  onCollapsedChange,
  linkComponent = "a",
}: {
  children: React.ReactNode
  currentPath: string
  defaultCollapsed?: boolean
  /** Persist the choice (for example in a cookie read by the server layout). */
  onCollapsedChange?: (collapsed: boolean) => void
  linkComponent?: LinkComponent
}) {
  const [collapsed, setCollapsedState] = React.useState(defaultCollapsed)
  const setCollapsed = React.useCallback(
    (next: boolean) => {
      setCollapsedState(next)
      onCollapsedChange?.(next)
    },
    [onCollapsedChange]
  )
  const value = React.useMemo(
    () => ({ collapsed, setCollapsed, currentPath, Link: linkComponent }),
    [collapsed, setCollapsed, currentPath, linkComponent]
  )
  return (
    <SidebarContext.Provider value={value}>
      <Tooltip.Provider delay={300}>{children}</Tooltip.Provider>
    </SidebarContext.Provider>
  )
}

function Sidebar({
  label = "Main",
  header,
  footer,
  children,
  className,
}: {
  /** Accessible name of the navigation landmark. */
  label?: string
  header?: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  const { collapsed } = useSidebar()
  return (
    <aside
      data-collapsed={collapsed || undefined}
      className={cn(
        "group/sidebar sticky top-0 hidden h-dvh shrink-0 flex-col border-e border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-standard lg:flex",
        collapsed ? "w-(--sidebar-width-collapsed)" : "w-(--sidebar-width)",
        className
      )}
    >
      <div className="relative flex h-16 shrink-0 items-center px-4">{header}</div>
      <nav aria-label={label} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4">
        {children}
      </nav>
      {footer ? (
        <div className="flex shrink-0 flex-col gap-4 border-t border-sidebar-border p-4">
          {footer}
        </div>
      ) : null}
    </aside>
  )
}

/** The minimize/maximize control on the sidebar edge. */
function SidebarCollapseToggle({ className }: { className?: string }) {
  const { collapsed, setCollapsed } = useSidebar()
  return (
    <button
      type="button"
      aria-expanded={!collapsed}
      aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
      onClick={() => setCollapsed(!collapsed)}
      className={cn(
        "absolute -inset-e-3 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full border border-sidebar-border bg-background text-muted-foreground shadow-xs transition-colors hover:text-foreground",
        className
      )}
    >
      <Icon name={collapsed ? "chevron-right" : "chevron-left"} className="size-4" />
    </button>
  )
}

function SidebarSection({ section }: { section: NavSection }) {
  const { collapsed } = useSidebar()
  const headingId = React.useId()
  return (
    <div className="flex flex-col gap-1 pt-6 first:pt-2">
      {/* Names the list for screen readers without adding headings before the page h1. */}
      <span
        id={headingId}
        className={cn(
          "px-3 pb-1 text-xs font-medium text-muted-foreground",
          collapsed && "sr-only"
        )}
      >
        {section.label}
      </span>
      <ul aria-labelledby={headingId} className="flex flex-col gap-1">
        {section.items.map((item) => (
          <li key={item.id}>
            {item.children?.length ? <SidebarGroup item={item} /> : <SidebarLink item={item} />}
          </li>
        ))}
      </ul>
    </div>
  )
}

const itemBase =
  "flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors duration-150 ease-standard"

function WithTooltip({ label, children }: { label: string; children: React.ReactElement }) {
  const { collapsed } = useSidebar()
  if (!collapsed) return children
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner side="right" sideOffset={12}>
          <Tooltip.Popup className="rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background shadow-md">
            {label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

function ItemContent({ item }: { item: NavItem }) {
  const { collapsed } = useSidebar()
  return (
    <>
      <Icon name={item.icon} />
      <span className={cn("min-w-0 flex-1 truncate text-start", collapsed && "sr-only")}>
        {item.label}
      </span>
      {item.unavailable && !collapsed ? (
        <span className="text-xs font-normal text-muted-foreground">Later</span>
      ) : null}
      {item.badge && !collapsed ? (
        <CountBadge count={item.badge.count} label={item.badge.label} />
      ) : null}
    </>
  )
}

function SidebarLink({ item }: { item: NavItem }) {
  const { collapsed, currentPath, Link } = useSidebar()
  const active = isActive(currentPath, item.href)
  if (item.unavailable) {
    return (
      <WithTooltip label={`${item.label}: available in a later release`}>
        <span
          aria-disabled="true"
          className={cn(itemBase, "cursor-not-allowed text-muted-foreground", collapsed && "justify-center px-0")}
        >
          <ItemContent item={item} />
          <span className="sr-only">(available in a later release)</span>
        </span>
      </WithTooltip>
    )
  }
  return (
    <WithTooltip label={item.label}>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          itemBase,
          active
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          collapsed && "justify-center px-0"
        )}
      >
        <ItemContent item={item} />
      </Link>
    </WithTooltip>
  )
}

/** Expandable primary item with a secondary level drawn with leading lines. */
function SidebarGroup({ item }: { item: NavItem }) {
  const { collapsed, currentPath, Link } = useSidebar()
  const containsActive =
    isActive(currentPath, item.href) ||
    (item.children ?? []).some((child) => isActive(currentPath, child.href))
  const [open, setOpen] = React.useState(containsActive)

  // In the 80 px rail a group behaves as a link to its overview page.
  if (collapsed) return <SidebarLink item={{ ...item, children: undefined }} />

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger
        className={cn(
          itemBase,
          containsActive ? "text-foreground" : "text-sidebar-foreground",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        <ItemContent item={item} />
        <Icon
          name="chevron-down"
          className={cn("size-4 transition-transform duration-200", open && "rotate-180")}
        />
      </Collapsible.Trigger>
      <Collapsible.Panel>
        <ul className="ms-5 mt-1 flex flex-col gap-1 border-s border-sidebar-border ps-3">
          {(item.children ?? []).map((child) => {
            const active = isActive(currentPath, child.href)
            return (
              <li key={child.id} className="relative">
                {/* Leading line from the tree rail to the item (decorative). */}
                <span
                  aria-hidden="true"
                  className="absolute -inset-s-3 top-1/2 h-px w-2 bg-sidebar-border"
                />
                <Link
                  href={child.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-8 items-center rounded-md px-2 text-sm transition-colors duration-150",
                    active
                      ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  {child.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

/** Call-to-action card for the bottom of the sidebar; hidden in the rail. */
function SidebarCallout({ children, className }: { children: React.ReactNode; className?: string }) {
  const { collapsed } = useSidebar()
  if (collapsed) return null
  return (
    <div className={cn("flex flex-col gap-3 rounded-lg border border-sidebar-border bg-background p-4", className)}>
      {children}
    </div>
  )
}

/** Mobile primary navigation (below lg): 4–5 destinations, icon plus label. */
function BottomNav({
  items,
  currentPath,
  linkComponent: Link = "a",
}: {
  items: readonly Pick<NavItem, "id" | "label" | "href" | "icon">[]
  currentPath: string
  linkComponent?: LinkComponent
}) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-flow-col auto-cols-fr">
        {items.map((item) => {
          const active = isActive(currentPath, item.href)
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium",
                  active ? "text-link" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon name={item.icon} className="size-6" />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export {
  BottomNav,
  Sidebar,
  SidebarCallout,
  SidebarCollapseToggle,
  SidebarProvider,
  SidebarSection,
  useSidebar,
}
