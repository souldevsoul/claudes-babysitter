# RUN: every check runs everywhere it can fail, and its findings get fixed

The Praxis study (Oct 2026) found that 8% of the testers' cards were misses although a check for them existed, and that
almost all of those checks had simply never run: `--only ui` skipped the business suite, only 390 and 1440 px were
opened, only English, only pages at rest, no dynamic route, no wallet, and nothing ran again after the fixes were
merged onto a main that had moved by 83 commits. This part of Claude's Babysitter changes the execution model so that
cannot happen quietly.

## What runs by default

`babysitter e2e` (= `npm run test:e2e`) runs, in one Playwright pass:

| Suite | File | What |
|---|---|---|
| UI checks | `playwright/babysitter.spec.ts` | the guideline checks on every page |
| States, languages, scroll | `playwright/run.spec.ts` | see below |
| Business acceptance | `playwright/acceptance.spec.ts` | copy leaks, money, footer, cookies, sign-in, … |
| Product journeys | `e2e/*.spec.ts` | the product's own tests |

- **Viewports:** 360, 390, 768, 1280, 1440 (`project.js → viewports`). `--quick` (or `BABYSITTER_PROFILE=quick`) is
  the opt-in fast profile: 390 + 1440. `babysitter.config.json → viewports` or env `VIEWPORTS=360,1280` pick others.
- **Workers** scale with the machine (one Chrome per ~2.5 GB RAM, two cores left free; `WORKERS` overrides);
  `TEST_TIMEOUT` raises the per-test timeout; the state and language tests set their own budgets
  (`states.pageBudget`).
- **`--only ui|acceptance|product`** still works but is a *partial run*: it prints a loud banner listing every suite it
  skips, before and after the run.
- **The summary** at the end of every run lists what did **not** run: suites, viewports, languages (and why a language
  could not be switched on), roles that could not sign in, dynamic routes with no page found, the crawl cap, controls the
  state checks could not reach, and checks switched off in `babysitter.config.json`. Then the failures by page and the
  exact command that re-checks only them: `babysitter e2e --skip-prepare --last-failed`.
- A run from a directory that is not wired (no hooks, no CI, no agent block) prints a **NOT WIRED** banner.

## prepare: languages, dynamic routes, roles

`babysitter prepare` (part of `e2e`) now writes:

- `.babysitter/locales.json` — every language the site offers and *how to switch it on*, found from
  `<link rel=alternate hreflang>`, the language switcher (clicked: the URL prefix / `?lang=` / domain / cookie /
  localStorage change it makes is recorded) and the repo (`lib/locales.js`: next-intl / i18next configs,
  `type Locale = …`, `messages/*.json`, `app/[locale]`, the storage key or cookie the code uses). Each locale is then
  opened that way and **verified** (`<html lang>` or the page text changed). Unverified ones are listed, not dropped.
  `LOCALES=az,kk` narrows a run; `babysitter.config.json → locales` is the fallback (`{ "list": ["en","az"],
  "default": "en", "cookie": "NEXT_LOCALE" | "storageKey": "…" | "prefix": true }`) or `false` to switch the matrix
  off; `locales.keep` lists strings that stay the same in every language (brand names); `locales.untranslated: "warn"`
  makes untranslated text a warning.
- `.babysitter/routes.json` — with one real instance of every dynamic route: the route templates are read from the
  repo (`app/**/page.tsx`), links to a template not seen yet jump the crawl queue (and are allowed past the page cap),
  and on signed-in pages a list row that navigates by click (no `href`) is followed once. Pages of another language
  under a URL prefix are not separate routes (the language runs cover them). Each signed-in route carries its `role`.
- **Roles:** `babysitter.config.json → roles: [{ "name": "specialist", "env": { "LOGIN_EMAIL": "SPECIALIST_EMAIL",
  "LOGIN_PASSWORD": "SPECIALIST_PASSWORD" } }]` (values name env variables; `SESSION_COOKIES` works too; optional
  `authRoutes`, `login`), or env `BABYSITTER_ROLES` (JSON with the values). Each role gets
  `.babysitter/storage-<role>.json`; every signed-in check runs once per role.
- `.babysitter/crawl.json` — what was not reached: dynamic templates without an instance, roles that could not sign in,
  links over the cap, rows followed by click.

## run.spec.ts

| Test | Where | What |
|---|---|---|
| `i18n [<code>]` | every route × every non-default language × every viewport | 2.1 overflow, 2.10 escapesBox, 6.4 legibility/contrast, B4 money, N6 clipped labels, 2.5 text breaks at phone widths (mid-word / split number hard, orphan soft); header-nav wrapping and covered text as warnings. **Untranslated text is CT11 in `content.spec`** (once per language, both heuristics: English left, or word for word the default-language page) |
| `states[ <code>]` | every route × every language × narrowest + widest viewport | `checks/run.js → stateChecks`: the same checks (plus A1 password eye) re-run in each state, reporting only what the state adds over the page at rest |
| `3.8 …` | every route, narrowest + widest | an in-app link followed from the bottom of the page opens the new page at its top; every `#anchor` target lands below the sticky header |

### States (`checks/run.js → stateChecks`)

1. **Dialogs, sheets, dropdowns, menus:** every control that opens something (the opener discovery of 6.12's
   `interactionMotion`; look-alike openers are each opened). Steps inside an opened dialog are walked (e.g.
   *Add credits → amount → Continue*).
2. **Wallet "no-pay" mode:** top-up / checkout openers (*Add credits, Top up, Buy credits, Deposit*, AZ/KK/RU too) are
   opened first and checked; `states.wallet: false` turns this off.
3. **Empty submit:** each form is submitted empty; the validation state is measured and the first error must be on
   screen, not above it or under the sticky header (4.4).
4. **Wizards:** multi-step forms are walked with sample data (`fillSample`: emails, phones, numbers within min/max,
   dates, text long enough for `minlength`, the first real option, required tick boxes); after each step the step's new
   heading must be on screen (4.4). **Never pressed:** a button that would be final (*Pay, Checkout, Submit application,
   Confirm hire, Send, Delete …*, AZ/KK/RU too); a step with card or bank fields stops the walk.
5. **Pagination:** after *Next / 2*, the new page of results must start on screen.

**Every request other than GET is aborted for the whole state run**, so nothing is sent, created or paid even if a
button is misread. What could not be reached (over `states.maxOpeners`/`maxForms`, time budget, card forms) is listed
in the summary. Config: `states: { enabled, maxOpeners: 15, maxForms: 3, maxSteps: 6, wallet: true, pageBudget: 240000 }`.

## Threshold fixes in existing checks

- **A1 password eye:** each password field needs its own toggle — the eye is looked for only inside the field's own
  wrapper (the ancestors that hold no other password field). Runs on sign-in, sign-up, every crawled reset / forgot /
  change-password / settings page (per role), and in dialogs via the state run.
- **B4 thousands separators:** from 1,000 (4 digits) on, money and credits only (a currency sign, code or the word
  credits next to the number, also in a sibling element); years, ids, phones and postcodes are never flagged.
  `acceptance.thousandsFrom` moves the threshold.
- **F5 payment logos:** Visa / Mastercard logos without a "We accept" label (in the page language) next to them fail.
- **1.2 dropdown near the bottom:** a list that opens downward, hides options behind an inner scroll and would fit
  entirely above its trigger fails — it must open upwards.
- **3.8 scroll:** also after client-side navigation and `#anchor` links (above), and the 4.4 checks after
  pagination / wizard steps / submit.

## Re-run after merge / deploy, and "must get fixed"

- `babysitter init` installs git **post-merge and post-rewrite** hooks (`babysitter after-merge`): the static check of
  what the merge / rebase brought in, then the full suites (`--quick`) on the routes it reaches, in the background, when
  the dev server answers — else the exact command is printed and recorded in `.babysitter/after-merge.json`.
- `babysitter init --ci` also writes `.github/workflows/babysitter-deploy.yml`: on a successful `deployment_status` of
  the default branch / Production (or a push to main with `vars.BABYSITTER_URL`), the full suite against the deployed
  URL, the fix plan in the job summary, the report as an artifact.
- The CLAUDE.md block says it plainly: **babysitter findings are blocking**; the loop is `e2e` → `fix-plan` → fix →
  `e2e --skip-prepare --last-failed` → one full `e2e`.
- The **Stop hook** blocks finishing while the last run (`.babysitter/findings.json`) has findings on routes the work
  changed (changed files followed through the import graph to their pages; a layout, stylesheet or messages file
  counts for every page).
- `init` (and `e2e`) print a **NOT WIRED** banner naming every missing piece.
- `babysitter fix-plan [--format md|agent|json]`: the last run's findings grouped by cause (the same defect on many
  pages / widths / languages is one entry), each with the pages, roles, viewports and languages, and the source files to
  look at — the route's page file, files containing the element's text (a translation key is followed to the component
  that renders it) or its classes. Written to `.babysitter/fix-plan.md` too.

## Tests

`npm run test:run` (part of `npm test`): `test/run-acceptance.test.mjs` (A1 / B4 / F5 true and false positives),
`test/run-states-dropdown.test.mjs` (1.2 flip-up), `test/run-states.test.mjs` (dialogs, empty submit, wizard,
pagination, 3.8 navigation and anchors, untranslated — each TP and FP; asserts nothing was paid or POSTed),
`test/run-prepare.test.mjs` (locale detection by switcher + hreflang, dynamic route by row click, roles, the e2e
summary, `--last-failed`, fix-plan), `test/run-wiring.test.mjs` (init hooks + CI + agent block, Stop hook blocking,
after-merge, summary).

## 5.2.0 — an in-place step opens at its top

Every Next / Continue, one Back after the walk, and a pagination click are judged by where the changed region's
top lands: the step pane, the form or the list, inside the box that scrolls it (the window, or a dialog / drawer
that scrolls itself). The reader is put at the button first. The region is found again after React replaces it.
The walk also starts when a form's first button is Back, picks an option when Next waits for a choice, counts a
step titled by a `<p>`, and walks Next buttons outside every form even when the page has other forms.
