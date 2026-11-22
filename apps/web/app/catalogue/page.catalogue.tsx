import type { Metadata } from "next"

import { Alert } from "@workspace/ui/components/alert"
import { Badge, CountBadge } from "@workspace/ui/components/badge"
import { Breadcrumbs } from "@workspace/ui/components/breadcrumb"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Icon } from "@workspace/ui/components/icon"
import { PageHeader } from "@workspace/ui/components/page-header"
import { ProgressBar, ProgressRing } from "@workspace/ui/components/progress"
import { LoadingRegion, Skeleton } from "@workspace/ui/components/skeleton"
import { SidebarCallout, type NavSection } from "@workspace/ui/components/sidebar"
import { Spinner } from "@workspace/ui/components/spinner"
import { EmptyState, ErrorState } from "@workspace/ui/components/state"
import { ThemeSelector } from "@workspace/ui/components/theme-selector"

import { AppShell } from "@/components/app-shell"
import { FormDemo } from "@/components/catalogue/form-demo"

export const metadata: Metadata = { title: "Component catalogue" }

const sections: NavSection[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { id: "overview", label: "Overview", href: "/catalogue", icon: "dashboard" },
      { id: "knowledge", label: "Knowledge", href: "/catalogue/knowledge", icon: "knowledge", unavailable: true },
      {
        id: "conversations",
        label: "Conversations",
        href: "/catalogue/conversations",
        icon: "inbox",
        badge: { count: 12, label: "unread conversations" },
      },
    ],
  },
  {
    id: "account",
    label: "Account",
    items: [
      {
        id: "settings",
        label: "Settings",
        href: "/catalogue/settings",
        icon: "settings",
        children: [
          { id: "profile", label: "Profile", href: "/catalogue/settings/profile" },
          { id: "security", label: "Security", href: "/catalogue/settings/security" },
          { id: "sessions", label: "Sessions", href: "/catalogue/settings/sessions" },
        ],
      },
      { id: "help", label: "Help", href: "/catalogue/help", icon: "help" },
    ],
  },
]

const mobilePrimary = [
  { id: "overview", label: "Overview", href: "/catalogue", icon: "dashboard" },
  { id: "conversations", label: "Inbox", href: "/catalogue/conversations", icon: "inbox" },
  { id: "settings", label: "Settings", href: "/catalogue/settings", icon: "settings" },
] as const

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 border-t pt-8">
      <h2 id={id} className="text-2xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

export default function CataloguePage() {
  return (
    <AppShell
      sections={sections}
      mobilePrimary={mobilePrimary}
      breadcrumbs={
        <Breadcrumbs items={[{ label: "Catalogue", href: "/catalogue" }, { label: "Foundation" }]} />
      }
      topbarEnd={<ThemeSelector compact />}
      sidebarFooter={
        <SidebarCallout>
          <div className="flex items-center gap-3">
            <ProgressRing label="Setup progress" value={40} />
            <p className="text-sm font-semibold">Finish setup</p>
          </div>
          <p className="text-xs text-muted-foreground">2 of 5 setup steps done.</p>
          <Button size="sm" width="full">
            Continue setup
          </Button>
        </SidebarCallout>
      }
    >
      <div className="flex flex-col gap-12">
        <PageHeader
          title="Component catalogue"
          description="Foundation components on the 8 pt grid, in light and dark themes. Development builds only."
          actions={<Button variant="outline">Secondary action</Button>}
        />

        <Section id="buttons" title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Delete workspace</Button>
            <Button variant="link">Link</Button>
            <Button loading>Saving</Button>
            <Button disabled>Disabled</Button>
            <Button size="icon" variant="outline" aria-label="Refresh">
              <Icon name="refresh" />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small 32</Button>
            <Button>Medium 40</Button>
            <Button size="lg">Large 48</Button>
          </div>
        </Section>

        <Section id="forms" title="Form pattern">
          <FormDemo />
        </Section>

        <Section id="feedback" title="Feedback">
          <div className="grid gap-4 md:grid-cols-2">
            <Alert tone="info" title="Checkout is not available yet">
              Paid access opens in a later release.
            </Alert>
            <Alert tone="success" title="Workspace created">
              You can rename it at any time in settings.
            </Alert>
            <Alert tone="warning" title="Your session expires soon">
              Sign in again to keep working.
            </Alert>
            <Alert tone="error" title="Workspace could not be renamed">
              Another change was saved first. Reload and try again.
            </Alert>
          </div>
        </Section>

        <Section id="status" title="Status and progress">
          <div className="flex flex-wrap items-center gap-3">
            <Badge>Neutral</Badge>
            <Badge tone="brand">Setup</Badge>
            <Badge tone="success">
              <Icon name="check" /> Verified
            </Badge>
            <Badge tone="warning">Expires soon</Badge>
            <Badge tone="error">Failed</Badge>
            <Badge tone="info">Later</Badge>
            <CountBadge count={12} label="unread conversations" />
          </div>
          <div className="grid max-w-md gap-6">
            <ProgressBar label="Active workspaces" value={1} max={2} valueText="1 of 2" />
            <ProgressRing label="Setup progress" value={60} className="justify-self-start" />
          </div>
        </Section>

        <Section id="loading" title="Loading">
          <LoadingRegion label="Loading workspaces" className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </LoadingRegion>
          <Spinner label="Loading conversations" />
        </Section>

        <Section id="cards" title="Cards and widgets">
          <div className="grid gap-6 md:grid-cols-2">
            <Card aria-labelledby="usage-title">
              <CardHeader>
                <CardTitle id="usage-title">
                  <Icon name="usage" className="text-link" /> Usage this term
                </CardTitle>
                <CardAction>
                  <a href="#usage" className="text-sm font-medium text-link underline-offset-4 hover:underline">
                    View all
                  </a>
                </CardAction>
                <CardDescription>Allowances shared by all workspaces.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ProgressBar label="AI answers" value={0} max={1000} valueText="0 of 1,000" />
                <ProgressBar label="Conversation messages" value={0} max={10000} valueText="0 of 10,000" />
              </CardContent>
            </Card>
            <EmptyState
              icon="workspace"
              title="No workspaces yet"
              description="Create a workspace for each website you want Nthawi to answer on."
              action={<Button>Create workspace</Button>}
            />
          </div>
          <ErrorState
            title="Workspaces could not load"
            description="The service did not respond. Try again in a moment."
            correlationId="req-7f3a9c2e"
            action={<Button variant="outline">Try again</Button>}
          />
        </Section>

        <Section id="theme" title="Theme">
          <ThemeSelector />
        </Section>
      </div>
    </AppShell>
  )
}
