# Changelog

Earlier releases (4.11.1 and before) are described in the README under "What changed in …".

## 5.3.1 — the upgrade runs on deskhand, proxy and tandem: three false alarms fixed, the closed password reset named (2026-10-21)

deskhand, proxy and tandem moved from 4.11.1 to 5.3.0 with `babysitter update` (their 4.11.1 copies' lock file was out
of sync, so `npm ci --prefix tools/claudes-babysitter` failed; 5.3.0's installs). Each ran `e2e` against production
at 390 + 1440, the old copy and the new one on the same pages (deskhand: all 19 public pages; proxy and tandem: 8):
failing tests 39 → 92 (deskhand), 60 → 79 (proxy), 59 → 70 (tandem). The new ones come from 5.x checks the 4.11.1
copies never had; most are real:
- password reset by email is closed on all three (deskhand / proxy: "closed right now… write to us"; tandem: "can't
  send email yet") — FM7; the products wait for an e-mail provider, so it is known, but no user can reset a password;
- the sign-up e-mail field has no `autocomplete="username"` on all three — FM11 (the Praxis autofill bug);
- the full site footer on sign-in / sign-up / reset on all three — FM8;
- deskhand: the footer wordmark is not a link (1.11, one cause on every page), Reject is not remembered after a reload
  (C6), an ISO date in a legal page (CT6);
- proxy: a failed sign-in (500) says nothing and keeps the password (FM3/FM4), buttons pill on some pages and rounded
  on others (1.20), no apple-touch-icon (6.11);
- tandem: headings that end with a period (CT4), a country option cut with an ellipsis (2.14).
deskhand's CT8 hits ("…under the .") come from the company-details placeholder, which is an owner decision for now.

Fixed false alarms (fixtures in `test/misses-521.test.mjs`):
- **3.6** an auth page's minimal header (the logo and "Back to home", which FM8 asks for) no longer has to stay on
  screen: there is no navigation to keep in reach (deskhand, proxy: /signin, /signup, /forgot-password).
- **1.11** a photo is not the logo: an image cropped to fill its box (`object-fit: cover`) or taller than 160px, and
  "brand" in an image's file path (`/brand/r4/assistants.webp`), no longer make a logo candidate (proxy home).
- **FM7** names a reset page that says reset by email "is closed", "can't send email" or "write to us from the contact
  page" as not available, instead of "no email field".

Still reported, to look at by eye: 2.7 near-miss alignment and 1.6 hover on select triggers (soft checks), 6.5 heading
looks per level, 1.2 contact topics in a deliberate order (proxy, tandem), deskhand's /faq accordion regions measured
above the screen (1.2), tandem /terms contents links measured before the scroll settled (3.8), proxy "One credit is
$0.112" (money: a unit price with 3 decimals — `layout.rateDecimals` covers rates, not this).

## 5.3.0 — copies do not fall behind: `babysitter update` and the version check; catch rate over every card: Praxis 0/38, Parallel 0/23 (2026-10-20)

**Catch rate, every card** (`babysitter misses`, cards since 2026-10-16, suggested buckets — a person confirms them in
`misses/labels/*.json`): **Praxis 0/38** (92 cards: 38 missed, 54 out of scope), **Parallel 0/23** (63 cards: 23
missed, 40 out of scope). 5.2.0 measured 0/30 and 0/19 on the cards Nexus listed through an API key (only those with a
severity); souldevsoul/nexus#1 is deployed now and `?all=1` lists every card, so 40 more Praxis cards and 16 more
Parallel cards of the round were classified — all of them Helena's voice-review cards, most of them design decisions.
The 12 in-scope ones: 3 are checks in this release (2.15, 2.16, 6.13, `test/misses-521.test.mjs`); 9 are listed in the
reports with the reason (fonts per header row, a timeline marker level with its label, side-nav vs content top,
one label wrapping in a row of equal cards, a badge level with its label, heading alignment per page, one content
width per page, a success message dressed like plain text). The heuristic matched 6 Praxis and 12 Parallel cards to a
finding of the last run; none was the defect the card describes (a hover finding on the same list, a pagination
finding on the same route, a timeout) — the labels say so. Reports: `misses/praxis-2026-10-20.md`,
`misses/parallel-2026-10-20.md`.

**New command: `babysitter update [repo]`** — re-vendors the latest release tag (or `--to vX.Y.Z`) into
`tools/claudes-babysitter`: files the release added, changed or removed, the same files `init --vendor` copies, the
copy's `node_modules` refreshed with npm install. A pinned devDependency (`github:…#vX.Y.Z`) gets its pin moved.
`babysitter.config.json`, `.babysitter/` (findings, baseline, state), allowances, the product's e2e, hooks and
CLAUDE.md are not touched. It prints the release notes since the old version (CHANGELOG.md, and the README's "What
changed in …" for releases before 5.0.0), refuses to overwrite uncommitted edits inside the copy (`--force`), and adds
the version check to the CI workflows `init --ci` wrote before (once, after the step that installs the copy).
`--dry-run`, `--no-install`, `--brief`. `test/update.test.mjs` runs it against a local upstream with release tags.

**New command: `babysitter version-check`** — the product's copy (vendored, installed or pinned) against the latest
release tag on GitHub (`git ls-remote`, cached 12 h; `BABYSITTER_LATEST` pins it): a patch behind is a note, a minor
behind warns, **a major behind fails** (exit 1, `::error` under GitHub Actions); offline is a note, never a failure.
It runs in the CI templates `init --ci` writes (PR gate, after-deploy run, package-mode gate), after `babysitter
check` (a major behind fails the check; `--format json|agent`, `--file` and `BABYSITTER_NO_VERSION_CHECK=1` leave it
out — the editor hooks call ui-check directly and never ask the network), and in the new **`babysitter doctor`**
(what is wired and what is not, then the version line). The wiring banner names a CI without the version check.

**New checks** (`playwright/checks/details.js`, `docs/checks-details.md`, every route and viewport):
- **2.15 a shadow is not cut off by a box that clips** — a card shadow that shows on one side and is cut on another
  by an ancestor with overflow hidden / clip (or an `auto` axis that does not scroll). Hard from 12px cut, smaller
  cuts are "check by eye". (Praxis /dashboard tiles: the column is `overflow-hidden`.)
- **2.16 a pinned panel's scroll box ends on the screen** — a sticky / fixed panel whose scroll box ends below the
  screen while pinned: its last items can never be shown. (Praxis /specialists skill-area list.)
- **6.13 a link in a sentence is not marked by colour alone** — WCAG 1.4.1 (F73): no underline, border, fill, weight
  or icon, and within 3:1 of the text around it. (Praxis cookie banner "Cookie Policy".)

Live, public pages at 1440 and 390 (Praxis /, /specialists, /pricing, /contact; Parallel /, /pricing, /about; vertex,
truelogos, sprout, deskhand, proxy, tandem): 2.15 and 2.16 stay quiet (the Praxis tiles and skill-area list are fixed
on the site, the fixtures keep them); 6.13 finds the Parallel cookie banner's "Cookie Policy" (font-medium
text-primary, 2.87:1 against the sentence — the Praxis card's defect, still live on Parallel). Its first pass also took
the footer brand names of truelogos, deskhand and proxy (an `inline-flex` text logo beside its tagline) for links in a
sentence; a link laid out as a box of its own is now left alone, with a fixture.

**False alarms on the products moving from 4.11.1** (found by the upgrade runs, each with RuleTester cases):
- **FM5 `ui/mutation-refreshes-ui`**: a send-only endpoint (forgot / reset password, resend code, contact) whose
  handler shows a done / sent notice is not stale UI — the notice is the update (deskhand forgot / reset password,
  tandem forgot, verify-email, confirm-email). A data endpoint with only a "done" flag still fails.
- **FM1 `ui/numeric-input-bounds`**: a change handler that keeps digits only and caps the length
  (`.replace(/\D/g, "").slice(0, 3)`), a card number capped in its handler, the kit's `invalid={…}` on a digits-only
  field, and a range written in the field wrapper's label or hint ("1 to {max}", "From … to …") are bounds (deskhand
  card number, hours, refund credits, top-up amount; proxy card number; tandem partial refund). A cap without the
  digit filter, or digits without a cap, still fail.

## 5.2.0 — the miss loop: catch rate 0/30 on Praxis, 0/19 on Parallel; 24 of the 49 misses are now checks (2026-10-20)

**Catch rate** (`babysitter misses`, cards since 2026-10-16, suggested buckets — a person confirms them in
`misses/labels/*.json`): **Praxis 0/30** (52 cards: 30 missed, 22 out of scope), **Parallel 0/19** (47 cards: 19
missed, 28 out of scope). No card of the round had been reported by a run before it was filed. The rate covers the
cards Nexus lists through an API key (the ones with a severity); souldevsoul/nexus#1 lists the rest. Reports:
`misses/praxis-2026-10-20.md`, `misses/parallel-2026-10-20.md`. 24 of the 49 missed cards became a fixture and a check
in this release (`test/misses-520.test.mjs`, 22 fixtures: every one fails on 5.1.0 except the look-alike control); the
other 25 are listed in the reports with the reason and the round they belong to (policy contradictions, currency and
cookie-banner coverage are brief §4).

**New command: `babysitter misses`** — people's Nexus cards for each adopted project (`misses/projects.json`) since
the last run (`misses/state.json`), Admin and "QA · …" deploy cards left out, each card CAUGHT (the last run's
`findings.json` reported it) / MISSED / OUT OF SCOPE, written to `misses/<product>-<date>.md` with the catch rate
CAUGHT / (CAUGHT + MISSED). A heuristic or an LLM may suggest the bucket; the file marks it "suggested — needs human
confirm" until the labels file says `confirmed: true`. Needs `NEXUS_URL` and `NEXUS_API_KEY`; the key is never printed.

**New: stage — live or test.** `babysitter prepare` reads the Nexus project status (LIVE = live, anything else =
test) into `.babysitter/stage.json`; `"stage"` in `babysitter.config.json` overrides it. ST1 (live): no test or
generated entity is shown. ST2 (test): a test entity carries a visible marker ("Test profile", `data-test-entity`).
ST3 (test): the catalog lists an entity, one can be hired, every role has a test account (`test/stage.test.mjs`).

Why the old checks passed, and what changed:
- **2.14 text is shown in full (new, `playwright/checks/fit.js`).** 2.1 called anything cut by `body { overflow-x:
  hidden }` or a full-width `overflow-x-hidden` page root "decorative bleed"; 2.10 measures controls, not a price or a
  label; N6 looked for an ellipsis in buttons only. Now the glyphs are measured: cut by the screen edge or a clipping
  box, hidden below a screen-tall fixed panel that does not scroll, spilling out of their button / badge / card, a
  list option truncated. Page, every language, every state. (Praxis: hero CTA in az/kk, close-band CTA, task header
  price, status timeline, "Azərbaycan…", /contact topic list; Parallel: the Task Details drawer.)
- **2.5** also measures short plain labels: "Səhifə 1 / 2" and "ТАПСЫРМА" were `<span>`s, never candidates.
- **3.8 / 4.4 an in-place step opens at its top.** The states run judged only a new h1–h4 against the window. Now the
  changed region's top is measured in its own scroll box (a dialog that scrolls itself), re-found after React replaces
  it, Back is pressed once, a Next that waits for an option gets one, and a form whose first button is Back is walked.
  (Praxis brief wizard and task-board pager, Praxis onboarding, Parallel /onboarding Back / Continue.)
- **3.5** the open mobile menu: an item nothing can scroll to is hard (scrollIntoView also scrolls an
  `overflow: hidden` panel, which a finger cannot). (Parallel signed-in menu.)
- **A4 sign out**: it was skipped on every run of a role-based project (it needed `LOGIN_EMAIL`); it now signs in with
  the first role's credentials, presses the confirmation (a dialog or a /logout page), and checks the host. The
  signed-in acceptance and forms suites use a role's storage when there is no default one. (Parallel.)
- **C6** Decline really declines and is remembered; **C7** a link in the cookie settings opens its page and closes the
  window. C1 only checked that a Reject button exists. (Parallel, Praxis.)
- **FM11** autocomplete: a sign-up with a name and an e-mail before the password needs `autocomplete="username"`.
  **FM12** one failed submit, one error (not a toast and an inline message). **FM13** success does not wear the
  error's look. (Praxis login autofill, Parallel login errors.)
- **1.20 one look per role across pages (new, `playwright/checks/looks.js`).** 1.17 compares each piece with the site's
  median as square / rounded, and skipped a badge with a dot; 1.3/1.16 count filled buttons and cards only. Now
  buttons, chips, badges, cards and inputs are compared page by page: square here, round elsewhere is hard; rounded vs
  pill, a change of case and a radius more than 4px apart are soft. (Parallel How It Works, Pending tag, square frames.)

Live, narrow runs of the new and changed checks (Praxis and Parallel production, 360 + 1440, signed in as the QA
account): the real defects of the round were already fixed on both sites, and the checks stay quiet on them; they
found what was still there — Parallel /register has no `autocomplete="username"` (the Praxis autofill bug, FM11) and a
specialist name "Amani" cut to "Aman…" at 360 (2.14). 1.20 also reports, as soft (check by eye): the Praxis
dashboard CTAs in normal case beside UPPER CASE CTAs everywhere else, the Praxis /pricing top-up field rounded beside
pill fields, and the Parallel /contact topic chips in normal case beside UPPER CASE filter chips. A4 (sign out, now
run for the first time on both), ST2 and ST3 pass on both sites: both run APP_STAGE=test and show "Test profile" on
their test specialists. Not reached live: the Praxis brief wizard (behind a service choice) and both onboarding
wizards (Continue needs data the check cannot invent); their fixtures cover them. The false alarms of the first live pass were fixed, each
pinned by a fixture (a bordered scroll box, a line-clamped card button, a rows-per-page trigger, chips vs badges,
"QA & Test Automation", the account's own e-mail in settings, a catalog of dossier buttons, a /logout confirmation page).

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
