import { Alert } from "@workspace/ui/components/alert"

/**
 * Owner-supplied text only (prompt A5). The data attribute lets a release
 * check fail any production build that still contains a placeholder.
 */
export function OwnerTextPlaceholder({ title, purpose }: { title: string; purpose: string }) {
  return (
    <main id="main" tabIndex={-1} className="container-content flex flex-col gap-8 py-12 outline-none md:py-16">
      <header className="flex max-w-(--prose-max) flex-col gap-4">
        <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
        <p className="text-lg text-muted-foreground">{purpose}</p>
      </header>
      <div data-placeholder="owner-text" className="max-w-(--prose-max)">
        <Alert tone="warning" title="This page is waiting for its approved text">
          The final text will be published here before Nthawi launches.
        </Alert>
      </div>
    </main>
  )
}
