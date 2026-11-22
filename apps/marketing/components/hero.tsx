import { buttonVariants } from "@workspace/ui/components/button"
import { Icon } from "@workspace/ui/components/icon"

import { launchPlan } from "@/lib/content"
import { appOrigin } from "@/lib/site"

/**
 * Always-dark band ("dark" scopes the dark tokens to this subtree) with the
 * original dark-matter field. Text sits on the left two-thirds; the example
 * conversation sits where the field glows (rule of thirds).
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="dark dark-matter">
      <div className="container-content grid items-center gap-12 py-16 md:py-24 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-7">
          <h1 id="hero-title" className="text-4xl font-semibold tracking-tight md:text-6xl">
            Answer website visitors from knowledge you approved.
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Nthawi answers questions on your website using the pages and files you review and
            publish. Answers cite the knowledge they use, Nthawi says when it does not know, and
            you can take over at any time.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href={`${appOrigin}/sign-up`} className={buttonVariants({ size: "lg" })}>
              Create an account
            </a>
            <a href="/pricing" className={buttonVariants({ variant: "outline", size: "lg" })}>
              See pricing
            </a>
          </div>
          <p className="text-sm text-muted-foreground">
            One plan: {launchPlan.price} for {launchPlan.term}. No free trial.
          </p>
        </div>

        <figure className="lg:col-span-5">
          <div className="flex flex-col gap-4 rounded-2xl border bg-card/90 p-4 shadow-2xl backdrop-blur sm:p-6">
            <div className="flex items-center gap-3 border-b pb-4">
              <span className="grid size-10 place-items-center rounded-full bg-secondary font-heading text-base font-semibold text-secondary-foreground">
                C
              </span>
              <div className="flex flex-col">
                <span className="text-sm font-semibold">Chikondi Crafts</span>
                <span className="text-xs text-muted-foreground">Website chat</span>
              </div>
            </div>

            <p className="reveal ms-auto max-w-[85%] rounded-2xl rounded-ee-sm bg-primary px-4 py-3 text-sm text-primary-foreground">
              Do you deliver to Zomba? How long does it take?
            </p>

            <div className="reveal reveal-2 flex max-w-[90%] flex-col gap-3 rounded-2xl rounded-es-sm bg-muted px-4 py-3 text-sm">
              <p>Yes, we deliver to Zomba. Orders arrive in 2 to 3 working days.</p>
              <p className="flex items-center gap-2 border-t pt-3 text-xs text-link">
                <Icon name="citation" className="size-4" />
                Source: Delivery information, a page the shop published
              </p>
            </div>

            <p className="reveal reveal-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Icon name="reply" className="size-4" />
              Thoko from Chikondi Crafts took over the conversation
            </p>

            <p className="reveal reveal-4 max-w-[90%] rounded-2xl rounded-es-sm border px-4 py-3 text-sm">
              Hello! If you need it sooner, I can arrange Saturday delivery.
            </p>
          </div>
          <figcaption className="mt-3 text-xs text-muted-foreground">
            Example conversation: an answer that cites a published page, then the owner taking
            over.
          </figcaption>
        </figure>
      </div>
    </section>
  )
}
