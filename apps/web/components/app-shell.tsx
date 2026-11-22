"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"

import { Icon } from "@workspace/ui/components/icon"
import { Logo, LogoMark } from "@workspace/ui/components/logo"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import {
  BottomNav,
  Sidebar,
  SidebarCollapseToggle,
  SidebarProvider,
  SidebarSection,
  useSidebar,
  type NavItem,
  type NavSection,
} from "@workspace/ui/components/sidebar"

const COLLAPSE_COOKIE = "nthawi_sidebar_collapsed"

function persistCollapsed(collapsed: boolean) {
  // Read by the server layout to render the right width without a shift.
  document.cookie = `${COLLAPSE_COOKIE}=${collapsed ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`
}

function SidebarBrand() {
  const { collapsed } = useSidebar()
  return (
    <>
      <Link href="/" aria-label="Nthawi home" className="rounded-md">
        {collapsed ? <LogoMark /> : <Logo />}
      </Link>
      <SidebarCollapseToggle />
    </>
  )
}

/**
 * Owner application shell: sidebar (lg+), top bar with breadcrumbs, mobile
 * drawer and bottom navigation (below lg). Pages render inside <main>.
 */
function AppShell({
  sections,
  mobilePrimary,
  breadcrumbs,
  topbarEnd,
  sidebarFooter,
  defaultCollapsed = false,
  children,
}: {
  sections: readonly NavSection[]
  mobilePrimary: readonly Pick<NavItem, "id" | "label" | "href" | "icon">[]
  breadcrumbs?: React.ReactNode
  topbarEnd?: React.ReactNode
  sidebarFooter?: React.ReactNode
  defaultCollapsed?: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = React.useState(false)

  return (
    <SidebarProvider
      currentPath={pathname}
      defaultCollapsed={defaultCollapsed}
      onCollapsedChange={persistCollapsed}
      linkComponent={Link}
    >
      <div className="flex min-h-dvh">
        <Sidebar header={<SidebarBrand />} footer={sidebarFooter}>
          {sections.map((section) => (
            <SidebarSection key={section.id} section={section} />
          ))}
        </Sidebar>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur md:px-8">
            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
              <SheetTrigger
                aria-label="Open navigation"
                className="grid size-10 place-items-center rounded-md hover:bg-accent lg:hidden"
              >
                <Icon name="menu" />
              </SheetTrigger>
              <SheetContent
                side="start"
                className="bg-sidebar text-sidebar-foreground"
              >
                <div className="flex h-16 items-center justify-between px-4">
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  <Logo />
                  <SheetClose
                    aria-label="Close navigation"
                    className="grid size-10 place-items-center rounded-md hover:bg-sidebar-accent"
                  >
                    <Icon name="close" />
                  </SheetClose>
                </div>
                <SidebarProvider currentPath={pathname} linkComponent={Link}>
                  <nav
                    aria-label="Main"
                    className="flex-1 overflow-y-auto px-4 pb-6"
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("a"))
                        setDrawerOpen(false)
                    }}
                  >
                    {sections.map((section) => (
                      <SidebarSection key={section.id} section={section} />
                    ))}
                  </nav>
                </SidebarProvider>
              </SheetContent>
            </Sheet>
            <div className="min-w-0 flex-1">{breadcrumbs}</div>
            {topbarEnd}
          </header>

          <main
            id="main"
            tabIndex={-1}
            className="mx-auto w-full max-w-(--content-max) flex-1 px-4 pt-8 pb-24 outline-none md:px-8 lg:pb-12"
          >
            {children}
          </main>
        </div>
      </div>
      <BottomNav
        items={mobilePrimary}
        currentPath={pathname}
        linkComponent={Link}
      />
    </SidebarProvider>
  )
}

export { AppShell, COLLAPSE_COOKIE }
