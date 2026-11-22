# Nthawi design system (Phase 6)

Status: **binding for every Phase 6 page**, from the landing site to the owner
dashboard. Implemented in `packages/ui` on branch `feat/phase-6-foundation`.
Every rule below is enforced by a test, a lint rule or a review checklist item;
the source of truth for values is `packages/ui/src/styles/globals.css`.

Separate workstream chats (see [workstream prompts](workstream-prompts.md)) must
read this file first and must not introduce new colours, spacing values, type
sizes, radii, shadows or one-off component variants. If a screen needs
something this system lacks, add it to `packages/ui` with a test and update
this document in the same change.

## 1. Sources and decisions

| Input                                                                                                                                                                    | How it is used                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner theme (teal hue 184.2, Geist, Lora; radius 0.75rem app, 0.5rem landing)                                                                                            | Adopted verbatim except the AA corrections in section 3. The two supplied themes differ only in `--radius`, implemented as `[data-surface="marketing"]`.               |
| Second pasted summary (blue-cyan hue 224.6, Bitter headings)                                                                                                             | **Not applied.** It contradicts the explicit CSS in the Phase 6 prompt. Owner decision requested (agent.md, D-UI-1).                                                   |
| Reference images (sidebar structure, spacing, secondary level, calls to action, dashboard structure, widgets, charts, grid, F-pattern, forms, settings, personalisation) | Section 9 (sidebar), section 10 (page anatomy and dashboards), section 11 (forms), section 12 (settings).                                                              |
| Uiverse form (JohnnyCSilva)                                                                                                                                              | Anatomy only: label above, icon input group, full-width primary, outlined social button. Hex colours, the fixed 450 px width and off-grid sizes were mapped to tokens. |
| withanimation.app                                                                                                                                                        | SwiftUI motion reference only (cannot run on the web). Section 6.                                                                                                      |
| Uilora dark-matter hero, breadcrumbs, skeletons; Iconly Pro                                                                                                              | Paid or unpublished licence terms. **Original token-based equivalents** were built; licensed assets can replace them later (section 7) after G-08 and owner approval.  |
| framer-motion / motion                                                                                                                                                   | **Not added** (standing owner decision 2026-11-06: no new npm packages; also conflicts with the strict CSP's style rules). CSS motion and skeletons cover the brief.   |

## 2. Principles

1. **Honest product.** Never show a control that does nothing. Later-phase
   features appear as an explicit "available in a later release" state.
2. **One way to do each thing.** One form pattern, one alert, one empty state,
   one error state, one page anatomy. Composition over configuration.
3. **Accessible by construction.** WCAG 2.2 AA; Base UI supplies ARIA wiring,
   focus management and keyboard support. Colour is never the only signal.
4. **Grid discipline.** 8 pt spacing (4 pt for fine alignment), a 12-column
   layout grid, line heights on the 4 pt grid.
5. **Restraint.** One memorable element per page; everything else quiet.
   Applied UI principles: symmetry and rule of thirds for hero and marketing
   sections, generous white space, colour theory (single hue family plus
   status hues), typographic hierarchy, consistency, proximity, contrast and
   continuity.
6. **Secure surfaces.** No inline script without a nonce or hash; no
   third-party scripts; no secrets or owner configuration in browsers.

## 3. Colour tokens

Semantic tokens only; components never use raw colours. Light values sit on
`:root`, dark values on `.dark` (next-themes toggles the class; any subtree
with `class="dark"` also renders dark, which the always-dark hero uses).

AA corrections (measured by `packages/ui/test/contrast.test.mjs`):

| Token                       | Supplied                   | Shipped                    | Reason                                                                         |
| --------------------------- | -------------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| `--primary` (light, dark)   | `oklch(0.605 0.107 184.2)` | `oklch(0.52 0.107 184.2)`  | White label was 3.67:1; now 5.09:1 (needs 4.5).                                |
| `--link` (new)              | (primary)                  | light `0.52`, dark `0.685` | Text links need 4.5:1 on their surface.                                        |
| `--ring` (light)            | `0.605 / 0.9`              | `0.52` solid               | A solid ring keeps 3:1 on every surface.                                       |
| `--input`                   | light `0.925`, dark `0.29` | light `0.66`, dark `0.50`  | Input boundaries were 1.25:1 / 1.40:1; now 3.10:1 / 3.29:1.                    |
| `--sidebar-primary` (light) | `0.605`                    | `0.52`                     | Active item carries white text.                                                |
| `--sidebar-ring` (light)    | `0.925`                    | `0.52`                     | Focus ring on the sidebar was 1.19:1.                                          |
| `--brand` (new)             |                            | `0.605 0.107 184.2`        | The supplied teal, kept for decoration only (glows, logo hands, illustration). |
| `--font-heading` fallback   | `sans-serif`               | `serif`                    | Lora is a serif.                                                               |

Added semantic families (not in the supplied theme, required for alerts,
badges and snackbars): `--success`, `--warning`, `--info` and
`--destructive-surface`, each with `-surface` and `-border`, plus
`--destructive-foreground` mapped into `@theme` and `--overlay` for scrims.

Rules:

- Text uses `foreground`, `muted-foreground`, `link` or a status colour; all
  pass 4.5:1 on `background`, `card` and their own surfaces in both themes.
- Hover and pressed fills darken with `color-mix(..., black N%)`. Never lower
  the opacity of a filled control: over white it lightens the fill and breaks
  label contrast.
- `--border` is decorative (cards, dividers). Interactive boundaries use
  `--input` (3:1).
- Charts use `chart-1` to `chart-5` (one hue, five lightness steps). Pair
  colour with labels or patterns; follow the dataviz guidance (relationship,
  comparison, composition, distribution) from the reference images.

## 4. Typography

| Role                                | Family                   | Use                                                                            |
| ----------------------------------- | ------------------------ | ------------------------------------------------------------------------------ |
| Headings `h1`-`h3`, display numbers | Lora (`font-heading`)    | Page titles, section titles, prices                                            |
| UI and body                         | Geist (`font-sans`)      | Everything else, including card titles (`font-sans` on `h2`/`h3` inside cards) |
| Code, IDs, correlation references   | Geist Mono (`font-mono`) | Snippets, support references                                                   |

Scale (rem / line height), every line height on the 4 pt grid: `xs` 0.75/1,
`sm` 0.875/1.25, `base` 1/1.5, `lg` 1.125/1.75, `xl` 1.25/1.75, `2xl` 1.5/2,
`3xl` 2/2.5, `4xl` 2.5/3, `5xl` 3/3.5, `6xl` 3.75/4.

- One `h1` per page. Page title `text-3xl` (app) or `text-4xl`-`text-6xl`
  (marketing hero). Headings use `text-wrap: balance`, body `pretty`.
- Body copy at most 65 characters per line (`max-w-(--prose-max)`).
- Inputs use 16 px text (prevents iOS zoom).
- No all-caps labels, no accenting single words in headlines, no middle-dot
  metadata strings, no "→" appended to links (generated-design tells).
- Fonts load through `next/font/google` at build time and are served from our
  origin (`font-src 'self'`); no runtime third-party requests.

## 5. Space, grid, radius, elevation

- **Spacing**: Tailwind's 4 px unit. Use 8 pt steps for layout (`2, 4, 6, 8,
10, 12, 16, 20, 24` = 8 to 96 px) and 4 pt steps (`1, 3`) only for fine
  alignment inside components.
- **Controls**: heights 32 (`sm`), 40 (`md`, default), 48 (`lg`, forms and
  primary actions). Touch targets are at least 24 x 24 px (WCAG 2.5.8); prefer
  40+.
- **Layout grid**: 12 columns; `container-content` (max 1280 px, 16 px gutters
  on mobile, 32 px from 768 px). Breakpoints verified at 320, 375, 414, 768,
  1024, 1280 and 1440 px with no horizontal scroll (browser-tested).
- **Radius** follows hierarchy: `rounded-md` controls, `rounded-lg` alerts,
  `rounded-xl` cards, `rounded-2xl` featured panels, `rounded-full` badges and
  avatars. App radius 12 px, marketing 8 px.
- **Elevation**: `shadow-xs` cards, `shadow-sm` raised forms, `shadow-md`
  menus, `shadow-xl` sheets and dialogs, `shadow-2xl` the hero illustration.
- **Layout tokens**: `--sidebar-width` 240 px, `--sidebar-width-collapsed`
  80 px, `--topbar-height` 64 px, `--content-max` 1280 px, `--prose-max` 720 px.
- **Z-index**: header 20-30, overlay 40, sheet/dialog 50; popovers and
  toasts render in Base UI portals above.

## 6. Motion

- Durations 150 ms (state changes), 200 ms (sheets, collapse), 300 ms
  (progress), easing `ease-standard` / `ease-emphasized`.
- **One orchestrated moment per page at most** (the landing hero reveals its
  example conversation in reading order). No entrance animations on every
  section, no hover animation on every card.
- Motion that answers an action (open, expand, confirm) is welcome when it
  shows what changed.
- `prefers-reduced-motion: reduce` removes animation globally; components
  that animate content in must render their final state immediately (tested).
- Skeletons use the CSS `skeleton` utility (shimmer), sized to the final
  layout to avoid layout shift (CLS).

## 7. Iconography and imagery

- One family through `Icon` (`packages/ui/src/components/icon.tsx`): product
  code names meaning (`knowledge`, `inbox`, `session-current`), never glyphs.
  Default 20 px at 1.75 stroke; 16 px inside badges and dense rows; 24 px in
  the bottom navigation.
- Licensed Iconly Pro flat/animated/3D icons may replace glyphs in the
  registry only after purchase approval (G-08). 3D renders count against the
  LCP budget and need responsive, pre-sized assets.
- Icons are decorative (`aria-hidden`) unless they are the only content of a
  control, which then needs an accessible name.
- Logo: original clock-face speech bubble ("nthawi" means time; the product
  answers conversations), in `Logo`/`LogoMark`.

## 8. Components (`@workspace/ui/components/*`)

| Component                                                                                                                      | Purpose and rules                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`, `buttonVariants`                                                                                                     | Variants `primary`, `secondary`, `outline`, `ghost`, `destructive`, `link`; sizes `sm`/`md`/`lg` and icon sizes; `loading` keeps focus, sets `aria-busy`, blocks double submit. Each variant sets exactly one border colour (regression-tested). Links styled as buttons use `buttonVariants`. |
| `Form`                                                                                                                         | The only form element: validates on submit, marks fields `aria-invalid`, focuses the first invalid field, and maps server errors via `errors={{ fieldName: "..." }}`.                                                                                                                          |
| `Field`, `FieldLabel` (`required`), `FieldDescription`, `FieldError` (`match`), `FieldControl`, `InputGroup`, `InputGroupIcon` | The single field pattern (section 11).                                                                                                                                                                                                                                                         |
| `Card` (+ `Header`, `Title` with `headingLevel`, `Description`, `Action`, `Content`, `Footer`)                                 | Widget anatomy: heading with icon, filter or customisation slot, link to the full view, simplified content.                                                                                                                                                                                    |
| `Alert` (`tone` info/success/warning/error)                                                                                    | Page-level messages. Errors are `role="alert"`; others `role="status"`. Title states the outcome.                                                                                                                                                                                              |
| `Badge`, `CountBadge`                                                                                                          | Status chips and "9+" counters with full spoken labels.                                                                                                                                                                                                                                        |
| `ProgressBar`, `ProgressRing`                                                                                                  | Allowances and setup progress, with visible and spoken values.                                                                                                                                                                                                                                 |
| `Skeleton`, `LoadingRegion`                                                                                                    | Layout-matched placeholders announced once.                                                                                                                                                                                                                                                    |
| `Spinner`                                                                                                                      | Inline pending state with a status label.                                                                                                                                                                                                                                                      |
| `Breadcrumbs`                                                                                                                  | Classic breadcrumbs; current page `aria-current="page"`; `renderLink` for `next/link`.                                                                                                                                                                                                         |
| `PageHeader`                                                                                                                   | Breadcrumbs, one `h1`, description, actions.                                                                                                                                                                                                                                                   |
| `EmptyState`, `ErrorState`                                                                                                     | Empty: what is missing and the next action. Error: human message, correlation reference, retry.                                                                                                                                                                                                |
| `ThemeSelector`                                                                                                                | Indicator-style segmented selector (light, dark, system) as an arrow-key radio group; `compact` icon-only mode with names.                                                                                                                                                                     |
| `Sheet` (+ `Trigger`, `Content` `side`, `Title`, `Description`, `Close`)                                                       | Edge drawer: focus trap, Escape, scroll lock, focus return. Mobile navigation and small editors.                                                                                                                                                                                               |
| `Sidebar` family, `BottomNav`                                                                                                  | Section 9.                                                                                                                                                                                                                                                                                     |
| `SkipLink`, `StagingBanner`, `Logo`, `CSPProvider`                                                                             | Page chrome; `CSPProvider` passes the request nonce to Base UI inline tags.                                                                                                                                                                                                                    |

**Still to build, in the workstream that first needs them** (use Base UI
primitives already installed: dialog, alert-dialog, popover, tooltip, toast,
menu, select, switch, checkbox, radio-group, slider, tabs, toggle-group,
scroll-area, avatar, collapsible):

| Component                                                                 | Workstream | Notes                                                                                                                                             |
| ------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Dialog`, `AlertDialog` (destructive confirm)                             | 6.3, 6.5   | Typed confirmation for workspace deletion; focus returns to the trigger.                                                                          |
| `Toast` / snackbar                                                        | 6.3+       | Background confirmations only ("Session revoked"); never the only error channel.                                                                  |
| `Menu` (profile, workspace switcher)                                      | 6.4, 6.5   | Keyboard type-ahead; switcher lists at most the owner's workspaces.                                                                               |
| `Switch`, `Checkbox`, `RadioGroup` (card and minimal selectors), `Select` | 6.4, 6.6   | Checkboxes for multi-choice, radios/select for one choice. Card selectors for setup choices; glass/indicator variants only on dark hero surfaces. |
| `Tooltip` (standalone)                                                    | 6.3+       | Supplementary only; never essential information.                                                                                                  |
| `SearchField`                                                             | 6.6        | Only when a list exceeds 6-8 items (settings guidance).                                                                                           |
| `Tabs`                                                                    | 6.6        | Settings sub-pages when not using routes.                                                                                                         |
| `Avatar`                                                                  | 6.3, 6.6   | Initials fallback; uploads are out of Phase 6 scope unless approved.                                                                              |
| `OtpInput`                                                                | 6.2        | **One** native input (`inputmode="numeric"`, `autocomplete="one-time-code"`, `maxlength=6`), not Base UI's multi-input OTP field.                 |
| `PasswordInput`                                                           | 6.2        | Show/hide toggle with `aria-pressed`, as in the catalogue form demo.                                                                              |

Every new component: typed props with safe defaults, refs and ARIA wiring
built in, a catalogue entry, a Playwright behaviour test, axe clean in both
themes, and a usage note here (do/don't).

## 9. Owner navigation (sidebar), from the reference images

Structure (top to bottom): brand logo and the minimise/maximise toggle on the
sidebar edge; labelled sections of main items; a secondary item group; flexible
space; a call-to-action card; settings and help; divider; the workspace row.

| Measure                | Value                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Width                  | 240 px expanded, 80 px collapsed rail (cookie-persisted, read by the server layout to avoid shift)                           |
| Header                 | 64 px, logo left, toggle centred on the right edge                                                                           |
| Section label          | 12 px muted text; names its list (`aria-labelledby`), not a heading                                                          |
| Items                  | 40 px high, 4 px apart, 12 px inner padding, 20 px icon + 12 px gap                                                          |
| Section spacing        | 24 px                                                                                                                        |
| Active item            | filled `sidebar-primary` with `aria-current="page"`                                                                          |
| Hover                  | `sidebar-accent` tint                                                                                                        |
| Status indicator       | right-aligned `CountBadge` ("9+") with a spoken label                                                                        |
| Secondary level        | expandable primary item (chevron rotates) with 32 px children on a tree rail and leading lines; never deeper than two levels |
| Unavailable item       | muted, not a link, "Later" marker and spoken "(available in a later release)"                                                |
| Collapsed rail         | icons only, labels kept for screen readers, tooltips on hover/focus; groups act as links to their overview                   |
| Call to action         | bottom card (setup progress ring plus one action); hidden in the rail                                                        |
| Mobile (below 1024 px) | sidebar hidden; hamburger opens the same navigation in a `Sheet`; `BottomNav` with 3-5 destinations (64 px, icon plus label) |

Proposed owner information architecture (owner approval in 6.4/6.5):
Workspace: Overview, Knowledge (later), Conversations (later), Widget (later),
Usage; Account: Settings (Profile, Security, Sessions, Appearance), Help.
Billing appears as "later" until Phase 7.

## 10. Page anatomy and dashboards

- Shell: sidebar + 64 px top bar (hamburger on mobile, breadcrumbs, profile
  menu and notifications on the right) + `main#main` (focus target of the
  skip link), max 1280 px, 32 px top padding.
- Page header: breadcrumbs (for hierarchy below the top level), `h1`,
  description, actions aligned right and wrapping below on mobile.
- Dashboards follow the F-pattern: the most important status in the first
  row; grid of content widgets (boxes reflecting the screen width: patterns A
  to D from the grid reference); each widget is a `Card` with a heading and
  icon, an optional filter, a link to the full view and a simplified summary.
- Content widths: forms 448 px (`max-w-md`), prose 720 px, tables full width
  with horizontal scroll inside their own container (never the page).
- States for every data view: loading (skeleton), empty (`EmptyState`),
  partial, error (`ErrorState` with correlation ID and retry), slow network
  (keep skeleton, then a "still loading" status after 10 s), 401 (redirect to
  sign-in with a safe return path), 403/404 (the same not-found page), 409
  (conflict alert with reload), 422 (field errors via `Form errors`), 429
  (alert with the retry time), 5xx (`ErrorState`).

## 11. Forms (Uiverse anatomy on tokens)

```
Form (max-w-md, card, p-6/p-8, gap 24)
  h1/h2 title + one-line purpose ("Fields marked * are required.")
  Field (gap 8)
    FieldLabel (14/600, required marker *)        [ link e.g. Forgot password? ]
    InputGroup (48 px, radius-md, 1.5 px --input border, icon 20 px, gap 12)
      InputGroupIcon + FieldControl (16 px text) [+ trailing icon button]
    FieldDescription (14, muted)  /  FieldError (14/500, destructive)
  Button primary lg full-width ("Sign in", "Create workspace": the action)
  divider "or"
  Button outline lg full-width (Google)
  footer link line (centered, 14)
```

- Labels always visible; placeholders show format examples only.
- Required fields: asterisk plus the form-level note; optional fields are
  unmarked.
- Validate on submit, then on change for fields already in error. Errors say
  what to do ("Enter an email address in the format name@example.com").
- Correct input types and `autocomplete` (`email`, `current-password`,
  `new-password`, `one-time-code`, `name`, `organization`, `url`).
- Primary action names the outcome; secondary is visually quieter. A pending
  submit shows the loading state and cannot be sent twice.
- No account-existence disclosure: sign-in, sign-up and recovery responses are
  identical for known and unknown addresses.

## 12. Settings (from the profile-settings references)

Group settings into labelled categories (Profile, Security, Sessions,
Appearance, Legal), give each row an icon, use plain labels ("Log out", not
"Leave app"), keep the most frequent settings first and move the rest to
sub-pages, add search only past 6-8 items, address the owner by name, and
place settings where people expect them (profile menu and the sidebar).
Defaults come from onboarding (timezone Africa/Blantyre, language English).

## 13. Surfaces and security

| Surface             | App              | Rendering                           | CSP                                                                                                                                                                                                      |
| ------------------- | ---------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Landing (profile M) | `apps/marketing` | Static export to `out/`, CDN-served | Build-time hashes in `out/_headers` (one site-wide rule); `script-src 'self'` + hashes, no `unsafe-inline`/`unsafe-eval`; `style-src-attr 'unsafe-inline'` only because Base UI renders style attributes |
| Owner (profile O)   | `apps/web`       | Dynamic (nonce requires it)         | `proxy.ts`: per-request nonce, `'strict-dynamic'`, `frame-ancestors 'none'`, `private, no-store`, `noindex`, COOP                                                                                        |

Do not use `next-themes`' `disableTransitionOnChange` on the static site: it
injects a runtime `<style>` the hashed policy blocks (caught by tests).

## 14. Voice and copy

Plain English, active voice, sentence case. Name things by what owners
understand ("Sessions", "Knowledge", not "auth tokens", "ingestion"). Buttons
say what happens; the same action keeps its name ("Create workspace" then
"Workspace created"). Errors state what happened and how to fix it, without
apologising. All strings live in each app's copy module (`apps/web/lib/copy.ts`,
`apps/marketing/lib/content.ts`). Marketing copy restates only v0.3 facts and
is a draft until the owner approves it (Q2).

## 15. Quality gates per change

- `pnpm --filter @workspace/ui test` (contrast and structure), typecheck, lint.
- Owner: `node --test apps/web/test/*.test.mjs`; catalogue build
  (`NTHAWI_CATALOGUE=1`) and `playwright test` in `apps/web`.
- Marketing: `pnpm --filter @nthawi/marketing test`, `build`, `playwright test`.
- axe: no serious or critical issues in light and dark; manual keyboard pass;
  NVDA (Windows) and VoiceOver (iOS) passes before acceptance.
- Screenshots at 320, 375, 414, 768, 1024, 1280 and 1440 in both themes
  (`NTHAWI_SCREENSHOT_DIR`).
- Performance budgets (proposed, need approval): LCP at most 2.5 s and CLS at
  most 0.1 on throttled mobile, INP at most 200 ms; landing JS at most 150 KiB
  gzip on the home route.
