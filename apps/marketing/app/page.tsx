import Link from "next/link"

import { Alert } from "@workspace/ui/components/alert"
import { buttonVariants } from "@workspace/ui/components/button"
import { Icon, type IconName } from "@workspace/ui/components/icon"

import { Hero } from "@/components/hero"
import {
  allowances,
  CHECKOUT_AVAILABLE,
  languages,
  launchPlan,
  steps,
  termAllowances,
} from "@/lib/content"

const assurances: ReadonlyArray<{
  icon: IconName
  title: string
  body: string
}> = [
  {
    icon: "citation",
    title: "Answers you can check",
    body: "Each answer points to the knowledge it used. When your knowledge does not cover a question, Nthawi says so instead of guessing.",
  },
  {
    icon: "security",
    title: "Nothing is used until you approve it",
    body: "Imported pages and files wait for your review. Editing approved text sends it back for approval.",
  },
  {
    icon: "website",
    title: "English and Chichewa",
    body: languages,
  },
]

export default function HomePage() {
  const highlights = [
    allowances[0],
    termAllowances[0],
    termAllowances[1],
    allowances[1],
  ]
  return (
    <main id="main" tabIndex={-1} className="outline-none">
      <Hero />

      <section
        id="how-it-works"
        aria-labelledby="how-title"
        className="container-content scroll-mt-24 py-16 md:py-24"
      >
        <div className="flex max-w-(--prose-max) flex-col gap-4">
          <h2
            id="how-title"
            className="text-3xl font-semibold tracking-tight md:text-4xl"
          >
            How Nthawi works
          </h2>
          <p className="text-lg text-muted-foreground">
            Four steps from your own knowledge to answers on your website.
          </p>
        </div>
        <ol className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="flex flex-col gap-3 border-t-2 border-primary pt-6"
            >
              <span
                aria-hidden="true"
                className="font-heading text-3xl font-semibold text-link"
              >
                {index + 1}
              </span>
              <h3 className="text-xl font-semibold">{step.title}</h3>
              <p className="text-base text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="assurance-title"
        className="border-y bg-muted/40"
      >
        <div className="container-content grid gap-12 py-16 md:py-24 lg:grid-cols-12">
          <h2
            id="assurance-title"
            className="text-3xl font-semibold tracking-tight md:text-4xl lg:col-span-4"
          >
            You stay in charge of every answer
          </h2>
          <ul className="grid gap-8 sm:grid-cols-2 lg:col-span-8 lg:grid-cols-3">
            {assurances.map((item) => (
              <li key={item.title} className="flex flex-col gap-3">
                <span className="grid size-10 place-items-center rounded-md bg-secondary text-secondary-foreground">
                  <Icon name={item.icon} />
                </span>
                <h3 className="font-sans text-base font-semibold">
                  {item.title}
                </h3>
                <p className="text-sm text-muted-foreground">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        aria-labelledby="price-title"
        className="container-content py-16 md:py-24"
      >
        <div className="grid gap-12 lg:grid-cols-12 lg:items-start">
          <div className="flex flex-col gap-4 lg:col-span-5">
            <h2
              id="price-title"
              className="text-3xl font-semibold tracking-tight md:text-4xl"
            >
              One plan, paid in kwacha
            </h2>
            <p className="text-lg text-muted-foreground">{launchPlan.trial}</p>
          </div>
          <div className="flex flex-col gap-6 rounded-xl border bg-card p-6 shadow-sm sm:p-8 lg:col-span-7">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-heading text-4xl font-semibold">
                {launchPlan.price}
              </span>
              <span className="text-base text-muted-foreground">
                for {launchPlan.term}
              </span>
            </div>
            <dl className="grid gap-4 sm:grid-cols-2">
              {highlights.map((item) =>
                item ? (
                  <div key={item.label} className="flex flex-col gap-1">
                    <dt className="text-sm text-muted-foreground">
                      {item.label}
                    </dt>
                    <dd className="text-lg font-semibold tabular-nums">
                      {item.value}
                    </dd>
                  </div>
                ) : null
              )}
            </dl>
            {CHECKOUT_AVAILABLE ? null : (
              <Alert tone="info" title="Paid access is not available yet">
                You can create an account now. Checkout opens in a later
                release.
              </Alert>
            )}
            <Link
              href="/pricing"
              className={buttonVariants({
                variant: "outline",
                className: "w-fit",
              })}
            >
              See everything included
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
