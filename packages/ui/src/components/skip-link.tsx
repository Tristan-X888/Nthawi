/** First focusable element on every page (WCAG 2.4.1). Target needs id and tabIndex={-1}. */
function SkipLink({
  href = "#main",
  children = "Skip to main content",
}: {
  href?: string
  children?: string
}) {
  return (
    <a
      href={href}
      className="fixed inset-s-4 top-4 z-50 -translate-y-24 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md transition-transform duration-150 focus-visible:translate-y-0"
    >
      {children}
    </a>
  )
}

export { SkipLink }
