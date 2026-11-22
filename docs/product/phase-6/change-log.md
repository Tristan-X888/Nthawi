# Phase 6 change log (debugging and design corrections)

One entry per reproduced problem: hypothesis, single change, result.
Evidence labels: local, CI, mock, live staging.

## 2026-11-22 foundation (local)

1. **Supplied theme fails AA.** Contrast probe: white on primary 3.67:1,
   input borders 1.25:1 / 1.40:1, light sidebar ring 1.19:1. Change: darken
   only the failing tokens (section 3 of design-system.md). Result: 66 pair
   checks pass in both themes; a regression test proves the supplied primary
   fails.
2. **Error alert title 4.31:1.** Hypothesis: tinted surface too dark for the
   supplied destructive red. Change: surface `0.97 -> 0.985`. Result: pass.
3. **`apps/web` could not import Base UI.** Hypothesis: pnpm isolation (Base
   UI is a dependency of `packages/ui` only). Change: expose `CSPProvider` and
   a `Sheet` from `@workspace/ui` instead of adding a dependency. Result:
   typecheck passes.
4. **Form errors not announced.** Test red: no `aria-invalid` after submit.
   Hypothesis: a plain `<form>` does not drive Base UI field validation.
   Change: Base UI `Form` added to the design system. Result: green.
5. **Hashed CSP blocked a runtime style.** Test red: console CSP violation on
   every marketing page. Hypothesis: next-themes `disableTransitionOnChange`.
   Change: option removed on the static site. Result: 0 violations.
6. **Outline buttons invisible.** Screenshot review. Hypothesis:
   `.border-transparent` sorted after `.border-input`. Evidence: compiled CSS
   offsets. Change: one border colour per variant. Result: regression tests
   green in both apps.
7. **Reduced motion hid hero messages.** Screenshot review. Hypothesis: the
   global rule shortens duration but keeps `animation-delay` with fill-mode
   both. Change: `animation: none` under reduced motion. Result: regression
   test green.
8. **Lint.** `no-control-regex` in the return-path guard: replaced escapes
   with `\p{Cc}`/`\p{Z}` (stricter: C1 controls and Unicode spaces).
   `set-state-in-effect` in the theme selector: `useSyncExternalStore`.
   Generated `out/` was linted: ignored with Node globals for scripts.
9. **Intermittent `next build` exit 1** (NEXT-01): not a code defect; a
   Next.js security notice. Reported for the owner's decision.
