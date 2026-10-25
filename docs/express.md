# Express runs: one load per page, only what a change touches

`babysitter e2e` opens the page again for every check: about 117 page loads per route × viewport × locale × role, and
the checks themselves take milliseconds. A product with 70 routes runs for hours. Two flags cut that down without
dropping anything:

```bash
npx --no babysitter e2e --express                 # every route, one load per page, the same findings
npx --no babysitter e2e --express --changed       # only the routes your branch's change reaches
npx --no babysitter e2e --express --since v1.4.0  # … reached by everything changed since a ref
npx --no babysitter e2e --express --no-cache      # measure everything again, no reused verdicts
npx --no babysitter e2e                           # the full run, a fresh page per check (nothing changes there)
```

## `--express`: one load, all checks

Every per-route describe of the tool's specs (UI checks, acceptance, layout, forms, content, and the states / languages
/ 3.8 tests of run.spec) becomes **one Playwright test per route × project** ("express: every check of this page, one
load"). It opens the page once and runs every check of the describe against it, in turn, each with its own time
budget, skip reasons, soft and hard failures and annotations. The site-wide tests (consistency across pages, footer,
cookies, dead links, …) run as they always do.

Each check's verdict is recorded exactly as its own test would have reported it — title, describe path, project,
status, error messages, annotations — and the run summary turns the page test back into one result per check. So
`findings.json`, `babysitter fix-plan`, `--last-failed`, the Stop hook and the "did NOT run" summary read an express run
like a normal one. The summary adds one line: how many check results, from how many page tests, with how many page
loads, how many cached, how many on their own page.

### What keeps the checks from affecting each other

- **A check gets the page its own open would have produced.** The spec's open function is served from the shared page
  only while that page is pristine: the same route, the same open function and arguments, and nothing done to it since.
- **Acting on the page marks it dirty.** Every Page, Locator, ElementHandle, Frame, Mouse, Keyboard, Touchscreen and
  BrowserContext call that is not a plain read — click, hover, focus, keyboard, typing, navigation, reload, viewport,
  cookies, init scripts, routes, style tags … — marks the page dirty, and the next check gets a fresh context and a
  fresh load, exactly as in a test of its own.
- **So does any difference left behind.** After every check a fingerprint of the page is compared with the pristine
  one: the DOM with every attribute and text, form values, scroll positions of the page and of every scroller, focus,
  the selection, open dialogs / popovers / fullscreen, localStorage, sessionStorage and cookies, stylesheets, running
  transitions, image load state and sizes, fonts, the URL and the viewport. A check that scrolled and left the page
  there gets the scroll put back first (and the fingerprint must match after that).
- **What the checks stamp is put back.** The attributes checks set to find elements again (`data-bs-*`, `data-bsf*`,
  `data-ui-*`) are restored to their pristine values after every check; listeners a check added are removed; contexts
  it opened are closed.
- **Read-only checks first.** The checks known to act on the page (hover, focus, menus, dialogs, cookies, motion,
  forms, states, viewport changes) run after the read-only ones; the last run's observations
  (`.babysitter/express-profile.json`) refine the order. Order only saves loads — correctness comes from the dirty
  tracking above.
- **A check that needs a page of its own gets one, and says so.** A check that touches the page before opening it
  (6.12 overlays that appear by themselves samples from the first paint) is run again from the start on its own fresh
  page; its annotations say `ran on its own fresh page`. Nothing is skipped.
- **Time.** A check keeps its own budget (its `test.setTimeout`, else `--timeout`); one that runs out is reported as
  "not tested (time budget)" exactly like a timed-out test, and the next check gets a fresh page.

The guarantee is tested on every release: `test/express-parity.test.mjs` runs a fixture product built to break many
checks (dialogs, menus, a burger, a form, a second language, a signed-in role) in both modes and requires every check
result and every finding to be identical; `test/express-order.test.mjs` puts checks that click, hover, type, focus,
scroll, set styles, stamp attributes, set cookies and change the viewport before read-only checks that would see it.

### Filters

`--quick`, `--project`, `--only`, `-g` / `--grep` / `--grep-invert`, roles, `authRoutes`, locales, colour schemes and
every skip and allow in babysitter.config.json work as in a normal run. `-g` selects checks, not page tests: the page
tests run and keep only the checks whose full title matches. `--last-failed` after an express run re-runs only the
checks that failed, on their pages (an express run is remembered in `.babysitter/run-mode.json`, so `--last-failed`
stays in express mode).

## The result cache

In express mode a pass or a skip is reused when nothing the check sees has changed since the run that produced it —
the summary says `cached (unchanged render)` and the check's annotations carry it. The key of a verdict is a hash of:

- the rendered page: the DOM with every attribute, text, form value and image size (React / Radix generated ids and
  nonces normalised), every stylesheet rule's text, the fonts, and the content of every script and stylesheet the
  load fetched;
- the project (viewport, colour scheme), the route and role, the locale and the open function's arguments;
- the tool's version, a hash of its check code, babysitter.config.json, the detected languages and stage, and the env
  that changes verdicts (`STRICT`, `--only`, `--quick`, `VIEWPORTS`, `LOCALES`, `BASE_URL` …).

Rules of the cache:

- **A failure is never reused.** Only passes and skips are stored; a check that fails is measured every run, and a
  stored pass that now fails is dropped.
- **Text that changes on every load is not normalised**: a page that shows a time, a random id or live data hashes
  differently every run, so its checks are simply measured again.
- **Interactions are cached only when deterministic**: a check that went to the network while it ran, opened another
  page or context, used the request fixture, opened the page twice, or samples over time (6.12 motion, 2.13 layout
  shift, the states walk, 3.8 navigation, 4.5 / J1 / D4 / J2, CT9/CT10 mail checks) is never stored.
- `--no-cache` measures everything. The cache lives in `.babysitter/express-cache/` (delete it to start over).

## `--changed` / `--since <ref>`: only what a change touches

`--changed` maps the git change — committed since the merge-base with `main` (or `origin/main`, `master`), plus staged,
unstaged and untracked files — to routes; `--since <ref>` uses that ref as the base. Each changed file is followed up
the import graph of the app (static imports, re-exports and barrels, `import()`, `next/dynamic`, `require()`,
`import()` with a template path → every file under its folder, tsconfig / jsconfig `paths` and `baseUrl`, `extends`)
to the Next.js `app/` and `pages/` page and layout files that use it:

| changed | runs |
|---|---|
| a page file | its route (every role that has it) |
| a component, hook, util, `*.module.css` | every route whose page imports it, however deep |
| a nested layout / template / loading / error file | every route under its folder |
| a message file (`messages/`, `locales/`, `translations/`, `i18n/*.json`) | the routes whose code uses the namespaces whose keys changed; every route when a namespace is not named in the code or messages are read without one |
| a file under `public/` | the routes whose code names its URL; every route when none does |
| global CSS, the theme or tokens, tailwind / postcss config, the UI kit (`components/ui`), root and route-group layouts, header / footer / navigation, middleware, i18n setup, `next.config`, `package.json` and lockfiles, `babysitter.config.json`, tsconfig, env files, the database schema, an API route handler or anything it imports, a deleted or unparseable source file, any file the graph cannot place | **every route** |
| docs, tests, CI, editor settings | nothing |

A crawled route that no page file maps to is always checked. The run prints every changed file with its effect and
every selected route with the import chain that selected it. Site-wide tests still compare every route (a change on one
page can make it differ from the others). Findings of the routes that were not opened are kept in `findings.json`
(marked `carried`), so the Stop hook and fix-plan still see them; the summary says the run was partial. When no change
reaches a page, nothing runs and the last run's findings stand. `changed.ignore` in babysitter.config.json adds globs
that do not render.

## When to run the full mode

Before a release, after upgrading the tool, and whenever an express run looks wrong: `babysitter e2e` without flags is
the reference, a fresh page for every check. A difference between the two is a bug in express mode — please report it
with both `findings.json` files.
