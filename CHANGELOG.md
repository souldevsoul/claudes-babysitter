# Changelog

Earlier releases (4.11.1 and before) are described in the README under "What changed in …".

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
