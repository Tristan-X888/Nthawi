import type { Metadata } from "next"

import { OwnerTextPlaceholder } from "@/components/legal-placeholder"

export const metadata: Metadata = { title: "Cookie notice" }

export default function Page() {
  return <OwnerTextPlaceholder title="Cookie notice" purpose="The cookies Nthawi uses and why." />
}
