import { LoadingRegion, Skeleton } from "@workspace/ui/components/skeleton"

import { copy } from "@/lib/copy"

/** Route-level skeleton matching the page anatomy, so content does not shift. */
export default function Loading() {
  return (
    <LoadingRegion
      label={copy.loading}
      className="mx-auto flex w-full max-w-(--content-max) flex-col gap-8 px-4 py-8 md:px-8"
    >
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-10 w-72 max-w-full" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </LoadingRegion>
  )
}
