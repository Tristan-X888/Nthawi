import type { Metadata } from "next"

import { OwnerTextPlaceholder } from "@/components/legal-placeholder"

export const metadata: Metadata = { title: "Support" }

export default function Page() {
  return <OwnerTextPlaceholder title="Support" purpose="How to get help with Nthawi. Support is provided in English." />
}
