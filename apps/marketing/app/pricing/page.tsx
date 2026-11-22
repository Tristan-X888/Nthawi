import type { Metadata } from "next"
import Link from "next/link"

import { Alert } from "@workspace/ui/components/alert"
import { buttonVariants } from "@workspace/ui/components/button"

import {
  allowances,
  CHECKOUT_AVAILABLE,
  launchPlan,
  termAllowances,
  type Allowance,
} from "@/lib/content"
import { appOrigin, indexable } from "@/lib/site"

export const metadata: Metadata = {
  title: "Pricing",
  description: `The Launch plan: ${launchPlan.price} for ${launchPlan.term}, with allowances shared by all your workspaces.`,
  ...(indexable ? { alternates: { canonical: "/pricing" } } : {}),
}

function AllowanceTable({
  caption,
  rows,
}: {
  caption: string
  rows: readonly Allowance[]
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-start text-sm">
        <caption className="border-b bg-muted/40 px-4 py-3 text-start font-semibold">
          {caption}
        </caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Allowance</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b last:border-b-0">
              <th
                scope="row"
                className="px-4 py-3 text-start align-top font-normal"
              >
                <span className="block font-medium">{row.label}</span>
                {row.note ? (
                  <span className="block text-muted-foreground">
                    {row.note}
                  </span>
                ) : null}
              </th>
              <td className="px-4 py-3 text-end align-top text-base font-semibold whitespace-nowrap tabular-nums">
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function PricingPage() {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="container-content flex flex-col gap-12 py-12 outline-none md:py-16"
    >
      <header className="flex max-w-(--prose-max) flex-col gap-4">
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
          Pricing
        </h1>
        <p className="text-lg text-muted-foreground">
          One plan, paid in Malawian kwacha, 30 days at a time.
        </p>
      </header>

      <section
        aria-labelledby="plan-title"
        className="grid gap-8 rounded-xl border bg-card p-6 shadow-sm sm:p-8 lg:grid-cols-12"
      >
        <div className="flex flex-col gap-4 lg:col-span-5">
          <h2 id="plan-title" className="text-2xl font-semibold">
            {launchPlan.name}
          </h2>
          <p className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-heading text-5xl font-semibold">
              {launchPlan.price}
            </span>
            <span className="text-base text-muted-foreground">
              for {launchPlan.term}
            </span>
          </p>
          {CHECKOUT_AVAILABLE ? null : (
            <Alert tone="info" title="Paid access is not available yet">
              You can create an account now. Checkout opens in a later release.
            </Alert>
          )}
          <a
            href={`${appOrigin}/sign-up`}
            className={buttonVariants({ size: "lg", className: "w-fit" })}
          >
            Create an account
          </a>
        </div>
        <ul className="flex flex-col gap-3 text-base lg:col-span-7">
          {[
            launchPlan.priceDetail,
            launchPlan.termDetail,
            launchPlan.renewal,
            launchPlan.trial,
          ].map((line) => (
            <li key={line} className="border-b pb-3 last:border-b-0">
              {line}
            </li>
          ))}
          <li>
            Read the{" "}
            <Link
              href="/legal/refunds"
              className="text-link underline underline-offset-4"
            >
              refund policy
            </Link>
            .
          </li>
        </ul>
      </section>

      <section aria-labelledby="included-title" className="flex flex-col gap-6">
        <div className="flex max-w-(--prose-max) flex-col gap-2">
          <h2 id="included-title" className="text-2xl font-semibold">
            What is included
          </h2>
          <p className="text-base text-muted-foreground">
            Allowances belong to your account and are shared by all your
            workspaces. Deleting a workspace does not give back allowance
            already used.
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <AllowanceTable caption="With your account" rows={allowances} />
          <AllowanceTable caption="In each 30-day term" rows={termAllowances} />
        </div>
      </section>
    </main>
  )
}
