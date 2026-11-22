import type { Metadata } from "next"

import { OwnerTextPlaceholder } from "@/components/legal-placeholder"

export const metadata: Metadata = { title: "Privacy notice" }

export default function Page() {
  return (
    <OwnerTextPlaceholder
      title="Privacy notice"
      purpose="How Nthawi collects, uses and deletes personal information."
    />
  )
}
