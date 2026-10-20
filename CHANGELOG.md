# Changelog

Earlier releases (4.11.1 and before) are described in the README under "What changed in …".

## 5.1.0 — false alarms from the full runs on Praxis and Parallel (issue #3) (2026-10-19)

Each one has a fixture in `test/fp-510.test.mjs` that proves the false alarm is gone and that the real defect it looks
like still fires.

**New config key:** `layout.rateDecimals` (default 4). An exchange rate ("10 credits = $1 = €0.8909") may show up to
this many decimals. The message always said 2–4, but anything over 2 failed.

- **1.11 / FM8 / N4:** a "← Back to home" or "Back to sign in" link (an arrow icon and words) is no longer taken for
  the logo. 1.11 no longer reads it as a logo link that is too wide (Praxis /login). FM8 finds the logo by its brand
  name or picture, not by being the first link (Parallel /forgot-password). N4 accepts the logo plus "Back to home"
  pair that FM8 asks for. A text "Home" link next to the logo is still a duplicate.
- **4.6:** a link in the page flow that sits under the cookie banner on arrival passes when the reader can scroll it
  clear (short auth pages at 1280×720 with bottom padding). A link inside a fixed header, or a footer that stays
  under the banner at the very bottom of the page, still fails.
- **money:** "the header shows money" looks only at the site header, not at a page's own `<header>` title block
  (Praxis /dashboard/wallet). It also skips an amount on the same line as the word credits, because that amount is
  the hint the message asks for.
- **P2:** a collapsed contents bar counts as the "On this page" navigation: a button "Contents · …" with
  `aria-expanded` / `aria-controls`, or a `<details>` summary over the anchors. When the open list scrolls away, the
  check accepts the sticky bar instead (Parallel and Praxis policies on phones). No contents at all, or a list or
  bar that is not sticky, still fails.
- **P3:** "Wallet: your credit balance…" in a privacy policy's list of data categories is a label, not a reference to
  the page. "Top up from your Wallet" still has to be a link.
- **CT6:** "October 2026" on its own in a table group row or a heading names a month (a statement grouped by month).
  A day format cannot write it, so it is no longer reported. In a sentence, on a body line by itself, or with a day,
  it is still reported.
- **1.6:** the selected chip in a list of filter chips (one `<li>` each, Praxis /specialists sidebar) keeps its look
  under the pointer, the same way a selected chip in a row already did.
- **1.17:** a square row that spans a rounded card (a list's "Waiting (9)" group header) and the touching cells of a
  ruled grid inside a rounded frame (Parallel /pricing) are parts of that frame. A small square button inside a
  rounded card still fails.
- **2.11:** text that has scrolled out of a scroll box (the agreement panel on Praxis /onboarding) is clipped, not
  covered.
- **4.4:** pagination measures the list it pages (`<ul>`, a table, or a run of card `<div>`s just before it), never a
  box that also holds the pagination, such as the page's layout grid with the sidebar (Praxis /dashboard/tasks).
- **1.2:** dropdown order uses the page's language (`Intl.Collator(<html lang>)`). On an Azerbaijani page "C, Ç" and
  "S, Ş" are in order.
- **2.7:** painted content counts even when it is `aria-hidden`, such as a decorative marquee band between sections
  (Parallel /).
- **A3:** Radix's hidden "bubble" `<input aria-hidden>` next to `button[role=checkbox]` belongs to the same checkbox
  (Parallel /register). Two real consent checkboxes still fail.
- **1.3 / 1.16:** a field drawn as an underline only has no corner radius to count, so it adds no "input corner
  radius" variant. A compact select trigger drawn as a pill (rows per page) counts as a chip, not as a field.
- **Modal on arrival:** a modal dialog that is open right after load is closed with Esc or its close button before
  the page checks run. It is reported once per page as "modal open on arrival": soft when it closes, hard when it
  cannot be closed. One pending-application notice no longer causes about 75 failures (3.3 h1, 3.5 nav, F0 footer).
  Cookie and consent dialogs are left to 4.6.
- **Navigation flakes:** every suite opens its pages with `gotoStable`. It retries when the browser lands on
  `chrome-error://`, when a navigation is "interrupted by another navigation", and on `net::ERR_CONNECTION_*`. A page
  that still cannot be opened fails with "navigation flake: …". The run summary lists these separately as "Navigation
  flakes", keeps them out of `findings.json`, and prints the re-run command.
- Already fixed in 5.0.3 and checked again: 2.4 skips a table header kept for screen readers (`max-sm:sr-only`), and
  CT12 leaves a plain word like "credits" alone.

## 5.0.3 — three more false alarms from the fix round on Compass, Kindred, Threshold (2026-10-19)

- F3 accepts the studio's shared legal identity placeholder ("New Company 1" / "New Address 1" / "000000000") as the
  footer's company line; it has no legal form or jurisdiction until the owner assigns an entity
  (`acceptance.legalIdentity` overrides the strings; a footer with neither the placeholder nor a legal form still fails).
- CT12 no longer calls a plain word a translation key because a key has that name ("credits" on an English page is the
  unit word). Structured keys (`wallet.balance`, `walletBalance`, `wallet_balance`) still count; a plain English word
  left on another locale's page is CT11's untranslated text.
- 2.4 skips a table whose header row is hidden for the eye and kept for screen readers (the sr-only header of a table
  that becomes labelled cards on phones): there is no header position to align.

## 5.0.2 — three false alarms from the first 5.0 runs (Compass, Kindred, Threshold) (2026-10-19)

- FM6 read a year printed before a price as part of it ("14 Oct 2026 800 credits" → 2026800 credits, on every
  Compass task card). Balances and prices are now whole numbers or numbers in thousands groups, never glued to the
  digits before them.
- 3.5 "looks highlighted on a page it does not open" (soft) no longer fires for a call to action drawn as a link
  ("Sign in", "Open a case", "Post a brief", "Become a partner" …, or a link to /login, /signup, /new …): its emphasis
  is the same on every page by design. An emphasised page link (Pricing on /faq) still fires.
- The run summary names the layout and forms suites on their own (they were counted under "ui", so a run that left
  one of them out looked complete).

## 5.0.1 — the shared legal identity placeholder is not test data (2026-10-19)

- CT2 (test data) and CT11 (untranslated) no longer report the studio's shared legal identity placeholder,
  "New Company 1" / "New Address 1" / "000000000". The canon (R-OWN-08) requires it in the footer, the © line, Terms
  and Contact, identical in every language, until the owner assigns an entity; on Compass it was about half of the
  copy findings (every page, every language). New config key `content.legalIdentity` (default: those three strings;
  `[]` for a product with its own entity, where they are test data again). Only text made of the placeholder is exempt:
  real test data next to it still fires, and a label around it ("Company No.:" left in English on a Kazakh page) is
  still untranslated. Fixtures that stood for test data now use "New Company 2".

## 5.0.0 — every check runs everywhere it can fail (2026-10-16)

**Major: the default run model changed.** `babysitter e2e` now runs every suite, at five viewports, in every language
the site offers, for every role, in every state it can reach. A run that used to take minutes can take much longer;
`--quick` is the opt-in fast profile. Specs that relied on the old `--only ui` scope (babysitter + run only) now get
layout and forms too, and copy checks moved to their own suite.

Why: on Praxis (Oct 2026) 262 tester cards came in after a babysitter run. Only 23 of the 169 automatable ones were in
reach of an existing check, and most of those checks had simply never run there (`--only ui`, two viewports, English
only, pages at rest, no re-run after the merge).

### Run (docs/checks-run.md)
- All suites by default: UI (`babysitter.spec`), layout (`layout.spec`), forms (`forms.spec`), states/languages/scroll
  (`run.spec`), business acceptance (`acceptance.spec`), copy (`content.spec`), the product's `e2e/*.spec.ts`.
- Viewports 360, 390, 768, 1280, 1440 (`viewports` in the config, `VIEWPORTS=…`); `--quick` = 390 + 1440.
- `--only ui|acceptance|content|product` is a partial run and says so with a loud banner before and after.
- `prepare` finds every language (hreflang, the switcher, the repo) and verifies it switches (`.babysitter/locales.json`),
  one real instance of every dynamic route (`app/**/[param]/page.tsx`), and signs in every role (`roles` in the
  config → `.babysitter/storage-<role>.json`).
- States: dialogs, sheets, menus, top-up dialogs in no-pay mode, empty submits, wizard steps, pagination — the page
  checks re-run in each. Every non-GET request is aborted while states are driven.
- The run summary lists what did not run (suites, viewports, languages, roles, dynamic routes, unreachable controls)
  and the exact `--last-failed` command. `babysitter fix-plan` groups findings by cause with the files to change.
- `init` installs post-merge / post-rewrite hooks (`babysitter after-merge`), `--ci` a deploy workflow that runs the
  full suite against the deployed URL; findings are blocking (CLAUDE.md block + Stop hook); a NOT WIRED banner names
  what is missing.
- Threshold fixes: each password field needs its own eye (A1, also reset/change/settings pages and dialogs);
  thousands separators from 1,000 on money only (B4); payment logos need "We accept" (F5); a dropdown near the bottom
  opens upwards (1.2); 3.8 after client-side navigation and `#anchor` links; N6 clipped labels at every viewport.

### Copy (docs/checks-content.md)
- `babysitter content`: static lint of every locale's i18n files, JSX copy and email addresses (MX over DNS).
- `content.spec` CT1–CT18 on rendered pages, in every language: unfinished / defensive copy, test data, raw errors,
  trailing periods, dashes, date formats, plurals, email deliverability + mailto, untranslated text, keys printed as
  text, `<html lang>`/`dir`, legal document names, the © line, one term per concept, numbers that contradict each
  other across pages.

### Forms (docs/checks-forms.md)
- `forms.spec` FM1–FM10 in a network sandbox (nothing is really submitted): bounds of amount/quantity/credits/phone/
  IBAN fields, gibberish, failed and successful submits, a stale header after a save, credits shown before the click,
  the password lifecycle (eyes, change, reset), auth page shell, redirect flash, editable settings email.
- ESLint `ui/numeric-input-bounds` (error) and `ui/mutation-refreshes-ui` (warn).

### Layout, navigation, money (docs/checks-layout.md)
- `layout.spec`: header/footer nav parity, nav names vs page titles, logos link home (mobile menu too), the current nav
  item looks current, one heading style per level, words broken mid-word / split numbers / orphans, near-miss and table
  alignment, excess empty space, sticky header, long lists without pagination, favicon (defaults + cross-product
  registry), dropdown order / selected item / tick side, hover feedback, one mobile menu, money formatting in every
  switcher currency.

### Integration (this release)
- 2.5 nav wrapping checks site navigation only (header / top-level nav) at every language: footer columns, sidebars,
  breadcrumbs and "On this page" lists may wrap (was: false alarms at the default language).
- One report per phrase: acceptance B1 delegates to the CT1 rules (one source of truth) and runs only in
  `--only acceptance`; `*.vercel.app` preview hosts moved into CT1.
- One untranslated check: CT11 in `content.spec` has both heuristics (English left, or word for word the
  default-language page; `locales.keep`, `lang`-tagged and `translate=no` text excluded; `locales.untranslated:
  "warn"`). `run.spec` no longer reports it again per viewport.
- `content.spec` site-wide crawls sign in as each route's own role.
- The mobile menu helper waits for the menu's exit animation before deciding Escape did nothing (it used to press the
  toggle again, re-open the menu and then hang 30 s on truelogos.pro at 390).
- ESLint FORMS rules tuned on Praxis, Vertex and TrueLogos (11 → 2 findings, both real): reference / note / name
  fields, OTP boxes, fields validated with `aria-invalid={error}` or a two-sided range check of their value, kit
  wrappers (checked where used), module-level helpers that return the result, `setSaved(prev => …)` data setters,
  `signOut()`.
- `init` records the product `name` (favicon registry); the config template lists `viewports`, `roles`, `locales`,
  `states`, `content`, `forms`, `layout`.
- Every other language also gets 2.5 text breaks at phone widths (`run.spec` i18n): a word broken mid-word or a split
  number is hard, an orphan word in a heading soft (Praxis KK "ТАПСЫРМА" broken by letters at 360).
- `e2e --quick` / `--skip-prepare` no longer swallow the argument after them (`e2e --quick forms.spec` dropped
  forms.spec and ran everything else).
- FM1 no longer waits out the whole test on a loose calculator field: every locator call in the forms checks has its
  own timeout (inside the test runner the default action timeout is none; Praxis /pricing timed out at 240 s).
