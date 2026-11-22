/**
 * Staging overlay (profile S): a visible, non-dismissible notice. Robots
 * headers are not authorization; this banner exists so nobody mistakes
 * staging for the real service.
 */
function StagingBanner() {
  return (
    <div
      role="note"
      className="border-b border-warning-border bg-warning-surface px-4 py-2 text-center text-sm font-medium text-foreground"
    >
      Staging environment. Use synthetic test data only.
    </div>
  )
}

export { StagingBanner }
