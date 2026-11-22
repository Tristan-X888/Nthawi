/**
 * Landing copy. DRAFT FOR OWNER APPROVAL (Phase 6 Q2): every product statement
 * restates docs/release/v0.3/release-specification.md (with v0.2); nothing
 * here promises availability, an SLA, a trial or automatic renewal. Legal,
 * refund, cookie and support text is owner-supplied and appears only as
 * marked placeholders until provided (prompt A5).
 */

/** Flip only when Phase 7 live checkout passes its acceptance gate. */
export const CHECKOUT_AVAILABLE = false

export const launchPlan = {
  name: "Launch",
  /** v0.3: MWK 20,000.00 gross = 2,000,000 minor units, exactly 30 x 24 h. */
  price: "MWK 20,000.00",
  term: "30 days",
  termDetail: "Each payment gives exactly 30 days (720 hours) of access.",
  priceDetail:
    "MWK 20,000.00 is the final total. Applicable taxes, if due, are included, and Nthawi pays the payment fees.",
  renewal: "Renew by paying for another 30 days. Nothing renews automatically.",
  trial: "There is no free trial, and nothing is processed before you pay.",
} as const

export type Allowance = { label: string; value: string; note?: string }

/** v0.3 purchased allowances: owner-wide, shared by all workspaces. */
export const allowances: readonly Allowance[] = [
  {
    label: "Active workspaces",
    value: "2",
    note: "One per website you want answered.",
  },
  {
    label: "Knowledge sources",
    value: "100",
    note: "Each imported web page or uploaded file is one source.",
  },
  {
    label: "Knowledge storage",
    value: "1 GiB",
    note: "Originals, extracted text and search data.",
  },
  {
    label: "Versions kept per source",
    value: "3",
    note: "Including the published version.",
  },
  { label: "Largest file", value: "10 MiB", note: "Per uploaded document." },
]

export const termAllowances: readonly Allowance[] = [
  {
    label: "AI answers",
    value: "1,000",
    note: "In previews, the widget and the API alike.",
  },
  {
    label: "Conversation messages",
    value: "10,000",
    note: "From visitors, you and Nthawi.",
  },
  { label: "Knowledge imports and refreshes", value: "100" },
  { label: "API requests", value: "25,000", note: "At most 60 per minute." },
  { label: "Knowledge processing", value: "5,000,000 tokens" },
]

export const steps = [
  {
    title: "Add your knowledge",
    body: "Import pages from your website, or upload PDFs with selectable text, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), Markdown or plain-text files.",
  },
  {
    title: "Review, then publish",
    body: "Check what Nthawi extracted before anything is used. Only the exact version you approve can appear in answers.",
  },
  {
    title: "Add the chat to your website",
    body: "Paste one script into your site. The chat opens only on the websites you allow.",
  },
  {
    title: "Answer, or take over",
    body: "Nthawi answers with citations and says when it does not know. Step in from your inbox at any time.",
  },
] as const

export const languages =
  "Knowledge and answers work in English and Chichewa. The app, emails and support are in English."
