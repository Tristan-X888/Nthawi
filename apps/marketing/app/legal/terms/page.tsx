import type { Metadata } from "next"

import { OwnerTextPlaceholder } from "@/components/legal-placeholder"

export const metadata: Metadata = { title: "Terms of service" }

export default function Page() {
  return <OwnerTextPlaceholder title="Terms of service" purpose="The rules for using Nthawi." />
}
