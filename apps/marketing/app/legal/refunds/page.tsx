import type { Metadata } from "next"

import { OwnerTextPlaceholder } from "@/components/legal-placeholder"

export const metadata: Metadata = { title: "Refund policy" }

export default function Page() {
  return (
    <OwnerTextPlaceholder
      title="Refund policy"
      purpose="When and how payments are refunded."
    />
  )
}
