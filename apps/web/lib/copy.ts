/**
 * English copy for the owner application (UI language: English, v0.3).
 * Every user-visible string lives here so wording stays consistent: the same
 * action keeps the same name through a flow ("Create workspace" -> "Workspace
 * created"). Errors state what happened and what to do; they never apologise.
 */
export const copy = {
  product: "Nthawi",
  skipLink: "Skip to main content",
  staging: "Staging environment. Use synthetic test data only.",
  home: {
    title: "Nthawi",
    description:
      "Sign-in and account pages are being built in this release. This page becomes your sign-in page when they are ready.",
  },
  notFound: {
    title: "Page not found",
    description:
      "This page does not exist, or you do not have access to it. Check the address, or go back to the start.",
    action: "Go to the start",
  },
  error: {
    title: "This page could not load",
    description:
      "Something went wrong on our side. Try again; if it keeps happening, contact support with the reference below.",
    retry: "Try again",
  },
  loading: "Loading page",
} as const
