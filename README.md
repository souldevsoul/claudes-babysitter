# Claude's Babysitter

**Keeps AI code generators inside your product's UI system.**

Generators (Claude Code, Cursor, v0…) are fast, and they drift: a fifth copy of `StatTile`, `bg-[#4f46e5]` on one page and `bg-indigo-600` on the next, button text at 3.8:1, cards in a row that don't line up, a stock shadcn theme that makes every product look the same. Claude's Babysitter catches this **while the code is being written**, not in QA:

- **AST analysis** (ESTree via `@typescript-eslint`, CSS via PostCSS). It sees hard-coded colours, radii, shadows and type in classes, object maps, `cva()`, interpolated classes (`bg-${tone}-600`), styled-components/emotion, spread/inline styles and `@apply`.
- **Static WCAG 2.1 contrast of theme tokens**: text, muted text, button text (≥ 4.5:1) and field borders (≥ 3:1). It checks every time the theme changes, across hex, HSL, oklch, oklab, lab and lch, with `.dark` and `@theme` support.
- **Theme First**: no UI work on a stock shadcn theme. A **fingerprint registry** warns when a theme is ≥ 80% like another product's.
- **Component reuse on an AST graph**: barrels, dynamic imports, own-file use and transitive orphans. A new shared component must be exported, used, and must not repeat the role of an existing one (`StatCard` next to `StatTile` is blocked).
- **Rendered micro-checks** with Playwright on a running dev server, for the pages you changed: real contrast, aligned cards in rows, no sideways scroll, mobile tables, visible field borders.
- **Gates everywhere**: Claude Code hooks (after each edit, before finishing), a git `pre-commit` hook, and a CI workflow. Only new problems on changed lines block; old debt is listed for information.

It enforces [`docs/ui-architecture-guidelines.md`](docs/ui-architecture-guidelines.md): 58 recurring UI bug patterns (P01–P58) turned into rules.

## Quick start

Requires Node ≥ 22.18 and a git repo.

```bash
# in your project — an interactive wizard asks: new project (strict) or existing project (adoption)?
npx github:souldevsoul/claudes-babysitter init .
# no terminal (CI, generators): pass the answer
npx github:souldevsoul/claudes-babysitter init . --new        # strict from the start
npx github:souldevsoul/claudes-babysitter init . --existing   # adoption mode
```

| | New project (`--new`, strict) | Existing project (`--existing`, adoption) |
|---|---|---|
| Hooks (Claude Code + git pre-commit) | block new problems | **warn only**: the model gets the report as context, commits go through |
| Theme First | on | off |
| Checklist | — | `BABYSITTER-ADOPTION.md`: init → audit → clean up on `chore/tech-debt` → enable the firewall |

`init` also does the following:

1. Vendors the tool into `tools/claudes-babysitter`.
2. Writes `babysitter.config.json` (with `"mode"`).
3. Adds the Claude Code hooks, the agent rules in `CLAUDE.md`/`AGENTS.md` and the git pre-commit gate.
4. Adds a `babysitter` script to your `package.json`.

Then use it through npm:

```bash
npm run babysitter -- audit           # the whole picture: AST, CSS, contrast, dead/duplicated components
npm run babysitter -- enable-hooks    # adoption → strict, once the audit is green (--force to switch anyway)
npm run babysitter -- check --changed --format agent   # what a generator sees
npm run babysitter -- fingerprint . --register         # theme fingerprint / look-alikes
npm run babysitter -- content                          # static copy lint (every locale, JSX copy, email MX)
npm run babysitter -- e2e                              # the full runtime run (every suite, viewport, language, role)
npm run babysitter -- e2e --quick                      # fast profile while iterating: 390 + 1440
npm run babysitter -- fix-plan                         # the last run's findings grouped by cause, with files to change
npm run babysitter -- update                           # re-vendor the latest release; keeps babysitter.config.json and .babysitter/
npm run babysitter -- version-check                    # this copy vs the latest release: minor behind warns, major behind fails
npm run babysitter -- doctor                           # what is wired (hooks, CI, config) + the version check
```

> Use `npm run babysitter`, not a bare `npx babysitter`. The tool is vendored, not an npm dependency, so `npx babysitter` would download an unrelated package with that name from the registry.

Or install it as a dev dependency: `npm i -D github:souldevsoul/claudes-babysitter`. Then use `npx babysitter …`, which resolves to your installed copy, and `import ui from "claudes-babysitter/eslint"` / `"claudes-babysitter/stylelint"` in your own configs.

## Layout

| Path | What |
|---|---|
| `bin/` | CLI: `babysitter` (init, check, audit, fingerprint, micro-check), Claude Code hooks, git pre-commit hook |
| `lib/` | Colour/contrast maths, theme tokens and fingerprints, component graph, roles, registry, shared token definitions |
| `rules/eslint/` | ESLint plugin (`ui/*` rules) |
| `rules/stylelint/` | Stylelint plugin and config |
| `playwright/` | Runtime checks, full spec, login + crawl |
| `templates/` | Config, CI workflow, agent instructions, Claude settings |
| `docs/` | The guidelines the rules enforce |
| `test/`, `fixtures/` | `npm test`: RuleTester, Stylelint fixtures, end-to-end cases |

## What changed in 5.3.0 (copies do not fall behind: update and the version check)

`babysitter update` re-vendors the latest release into `tools/claudes-babysitter` (or moves a devDependency pin),
leaves `babysitter.config.json` and `.babysitter/` alone and prints what changed since the old version.
`babysitter version-check` compares the copy with the latest tag on GitHub: a minor behind warns, a major behind fails;
it runs in the CI templates, after `babysitter check` and in `babysitter doctor`. With every Nexus card visible
(souldevsoul/nexus#1), the miss loop's catch rate over the 16–20 October round is Praxis 0/38 and Parallel 0/23; three
of the newly visible misses are checks (2.15 cut shadows, 2.16 a pinned list that ends below the screen, 6.13 a link
marked by colour alone). Details: [`CHANGELOG.md`](CHANGELOG.md).

## What changed in 5.2.0 (the miss loop; text shown in full; one look per role; live vs test)

`babysitter misses` turns every tester round into a catch rate and a to-do list: each card a person filed is CAUGHT,
MISSED or OUT OF SCOPE (`misses/<product>-<date>.md`). This release closes the in-scope misses of the 16–20 October
round on Praxis and Parallel (catch rate 0/30 and 0/19): text cut off or spilling at 360 (2.14), plain labels broken by
letters (2.5), in-place steps and pages that keep the reader at the bottom (3.8 / 4.4), menus that do not scroll (3.5),
sign-out that takes two tries (A4), Decline that does nothing (C6) and dead links in the cookie window (C7), login
autofill (FM11), errors said twice (FM12), success dressed as an error (FM13), and buttons / tags whose corners differ
from page to page (1.20). The stage (live or test, from the Nexus project status) gates test entities (ST1–ST3).
Details: [`CHANGELOG.md`](CHANGELOG.md).

## What changed in 5.1.0 (false alarms from the Praxis and Parallel full runs)

This release fixes the false alarms that the Praxis runs and issue #3 reported. Each fix has a fixture that also
proves the real defect still fails. A modal that is open on arrival is closed before the page checks run and is
reported once. Navigation flakes (`chrome-error://`, an interrupted navigation) are retried, and the run summary lists
them as flakes, not as findings. New config key: `layout.rateDecimals` (default 4), the number of decimals an exchange
rate may show. Details: [`CHANGELOG.md`](CHANGELOG.md).

## What changed in 5.0.1 (the shared legal identity placeholder is not test data)

CT2 and CT11 pass the studio's legal identity placeholder ("New Company 1" / "New Address 1" / "000000000", canon
R-OWN-08), which every product carries until the owner assigns an entity. `content.legalIdentity` lists the strings
(that default); `[]` turns the exception off. Real test data next to it, and an untranslated label around it, still
fail. Details: [`CHANGELOG.md`](CHANGELOG.md).

## What changed in 5.0.0 (every check runs everywhere it can fail; copy, forms and layout suites) — major

Full list: [`CHANGELOG.md`](CHANGELOG.md). Details: [`docs/checks-run.md`](docs/checks-run.md),
[`docs/checks-content.md`](docs/checks-content.md), [`docs/checks-forms.md`](docs/checks-forms.md),
[`docs/checks-layout.md`](docs/checks-layout.md).

**The default run changed.** `npm run babysitter -- e2e` (BASE_URL = dev server or preview; LOGIN_EMAIL /
LOGIN_PASSWORD for signed-in pages) now runs, in one pass:

| Suite | Spec | What |
|---|---|---|
| UI | `babysitter.spec.ts` | the guideline checks on every page |
| Layout | `layout.spec.ts` | nav parity and names, logos home, current nav item, heading styles, mid-word breaks, alignment, empty space, sticky header, long lists, favicon, dropdowns, hover, one mobile menu, money in every currency |
| Forms | `forms.spec.ts` | FM1–FM10 in a network sandbox: bounds, gibberish, failed/successful submit, stale header, credits up front, password lifecycle, auth shell, redirect flash, settings email |
| States, languages, scroll | `run.spec.ts` | every dialog / menu / empty submit / wizard step / pagination, every language, 3.8 after navigation and `#anchors` |
| Acceptance | `acceptance.spec.ts` | money, footer, cookies, sign-in, policies, dead links … |
| Copy | `content.spec.ts` | CT1–CT18 in every language: unfinished copy, test data, raw errors, dates, untranslated text, emails that receive mail, legal names, numbers that agree |
| Product | `e2e/*.spec.ts` | your own journeys |

- **Viewports 360, 390, 768, 1280, 1440.** `--quick` (390 + 1440) is for iterating; config `viewports` or
  `VIEWPORTS=360,1280` pick others.
- **`--only ui|acceptance|content|product` is a partial run** and prints a loud "PARTIAL RUN … NOT RUN" banner before
  and after. A partial run is not a pass.
- **Languages** are found and verified by `prepare` (hreflang, the switcher, the repo). Config fallback:
  `"locales": { "list": ["en","az"], "default": "en", "cookie": "NEXT_LOCALE" | "storageKey": "…" | "prefix": true,
  "keep": ["Brand Pro"], "untranslated": "warn" }`, or `false` to switch the matrix off; `LOCALES=az` narrows a run.
- **Roles:** `"roles": [{ "name": "specialist", "env": { "LOGIN_EMAIL": "SPECIALIST_EMAIL", "LOGIN_PASSWORD":
  "SPECIALIST_PASSWORD" } }]` (values name env variables) — every signed-in check runs once per role.
- **The summary** lists what did not run and the re-check command; **`babysitter fix-plan`** groups the findings by
  cause with the pages, viewports, languages and source files to change; `e2e --skip-prepare --last-failed` re-checks
  only the failures.
- **`babysitter after-merge`** (git post-merge / post-rewrite hooks installed by `init`) re-checks what a merge or
  rebase brought in; `init --ci` adds a deploy workflow that runs the full suite against the deployed URL. Findings
  are blocking (agent block + Stop hook).
- **`babysitter content [repo] [--offline]`**: the static copy lint (every locale's i18n files, JSX copy, email
  addresses with an MX lookup); also part of `check`.
- **ESLint:** `ui/numeric-input-bounds` (error) and `ui/mutation-refreshes-ui` (warn).
- **New config keys:** `name`, `viewports`, `roles`, `locales`, `states` (`enabled`, `maxOpeners`, `maxForms`,
  `maxSteps`, `wallet`, `pageBudget`), `acceptance.thousandsFrom`, `content` (`dateFormat`, `dashes`, `allowDash`,
  `allowPhrases`, `glossary`, `brandTerms`, `defaultLocale`, `locales`, `skip`), `forms` (`zeroBalanceRole`,
  `zeroBalanceStorage`, `protectedRoute`, `forgot`, `skip`), `layout` (`headingVariants`, `emptySpaceRatio`,
  `stickyHeader`, `stickyDistance`, `maxListItems`, `maxHover`, `maxCurrencies`, `registerFavicon`). See
  `templates/babysitter.config.json`.
- One report per defect: acceptance B1 is CT1 (it runs only in `--only acceptance`); untranslated text is CT11 only.

## What changed in 4.11.1 (two false alarms: a modal menu's aria-hidden backdrop; a banner exit the probe started watching too early)

From fixing Praxis and Nexus AI (Oct 14, 2026).

- **Fix: an open mobile menu over a Radix Dialog / Sheet overlay is not "undimmed" (3.5).** Radix marks everything outside the dialog content `aria-hidden="true"`, its own overlay included, and the check skipped aria-hidden layers as invisible. Praxis's `bg-black/60 backdrop-blur` overlay dimmed the page but was reported as "53% of the page undimmed". A backdrop is now judged by what is painted: no box, `display:none`, `visibility:hidden` or an effective (ancestor-multiplied) opacity of about 0 hide it, and aria-hidden does not (`__uiPainted`). A backdrop that takes pointer events counts only where it is on top of the page at the sampled point. Fixed layers that were on screen before the menu opened, aria-hidden decoration included, are still not the menu's backdrop. A sheet with no backdrop still fails.
- **Fix: a cookie banner that fades out is not "hidden in one frame" (6.12, site-wide interactions).** The probe's ~700 ms watch window started when it was armed, not when the click landed. On a busy machine (several pages checked at once) the click on Nexus AI's "Accept" landed after the window had closed, so the 300 ms framer-motion fade + slide of the banner wrapper went unseen. The window now opens at the person's action (pointerdown / mousedown / keydown / click; it waits up to 4 s for one). The same applies to the dropdown/dialog check. The per-click style-rewrite count is reset on every click. Frames record effective opacity. A child also counts as moved when an ancestor that left the page with it changed its look on the way out. A banner removed at once still fails.
- Fixtures + tests for both (`mobile-menu.html?radix|bare|decor`, `banner-exit.html?waapi|js|instant`); the new tests fail on 4.11.0.

## What changed in 4.11.0 (sign-in behind a cookie banner; a focus check that survives re-renders; the cookie panel's own controls; a translated page; fewer false alarms)

From a full run on forge.actor, cipher.builders and facetai.space (Oct 13–14, 2026): what the babysitter could not do, and where it was wrong.

- **New: a page translated by the browser survives its controls (4.8, P60).** With Chrome / Edge / Yandex "Translate this page" on, forge and cipher crashed on "Get my price" with `insertBefore: not a child of this node`. React kept a reference to a text node the translator had replaced, and Next showed "Application error" until a reload. Russian-speaking visitors on an English site hit this all the time; no check translated the page. `translationSurvives` wraps every text node the way Google Translate does (`<font><font>…</font></font>`), then presses the page's buttons, form submits first, because the crash came from the submitting state. Every request other than GET is aborted for the duration, so nothing is sent or created. Empty fields get placeholder values so validation does not block the submit. A DOM-mismatch page error or the "Application error" screen fails the check and names the control. The fix it suggests: wrap swapped labels in `<span>`, mark the control `translate="no"`, or install a `removeChild`/`insertBefore` guard before hydration.
- **Fix: sign-in works when a cookie banner covers the form.** On forge the fixed banner sat over "Sign in", and the login click timed out, so no signed-in page was checked. `prepare` now answers the banner first, preferring "Reject all" / "Only necessary" over "Accept" (`playwright/consent.mjs`). It then presses the submit of the form that holds the password field, not the banner's own submit buttons. If something still covers it, it submits with Enter.
- **Fix (crash): the focus check survives an element that re-renders.** On 8 cipher pages, 1.9 threw `getComputedStyle: parameter 1 is not of type 'Element'` or `reading 'removeAttribute' of null`, so focus was never judged there. The probed element was replaced when it lost focus. Every sample now tolerates a missing probe and skips that element; the others are still judged.
- **Fix (miss): OS controls inside a cookie panel that expands in place.** forge's analytics/marketing boxes were native checkboxes. The 1.1 sweep for overlays looked only inside `role=dialog`, and the banner is not a dialog. `cookieFlow` now sweeps the opened banner too. Kit boxes (`appearance:none`) still pass.
- **Fix (false positive): a field box 28 px taller than its input is the field's edge.** The wrapper rule allowed 24 px; forge's hourly-rate field (`py-3` + `border-2` around `$ · input · /hour`) is 28 px taller. The limit is 32 px.
- **Fix (false positive): an endlessly pulsing caret is decoration.** facet ends headings in a blinking `_` (`animate-pulse`). Sampled mid-pulse it read 2.4:1. Text under an infinite opacity animation is no longer failed on a random frame: a 1–2 character caret is skipped, and longer pulsing text goes to "check by eye". A faint static `_` still fails.
- **Clearer message: a Radix Select list that closes in one frame names the upgrade.** It was reported as "add an exit animation", and the description printed the list's injected `<style>` (`"[data-radix-select-viewport]{scrollbar-w…"`). `@radix-ui/react-select` before 2.3 unmounts the list at once, so the exit classes never play; all three sites were on 2.2.6. The finding now says to update it, and element descriptions skip `<style>`/`<script>` text. This was a true finding all along: the static `ui/overlay-motion` rule reports the same thing.
- Fixtures: `translate.html` (with and without the guard), `focus-rerender.html`, `cookie-native.html`, `input-wrapper-tall.html`, `caret.html` and `login-banner.html`. Run against 4.10.0, the four check tests fail (the focus one with the exact cipher error); against 4.11.0 they pass.

## What changed in 4.10.0 (controls inside their card; switch thumbs in their track; the cookie banner found by its name)

From four products the babysitter had already been run on (Oct 5–7, 2026), where a person still found the bugs by eye.

- **New: a control stays inside the card it sits in, and no container cuts it off (2.10).** `horizontalOverflow` measured against the viewport only, and treated anything an `overflow:hidden` ancestor clipped as decorative bleed. On Praxis, "See all example profiles" ran 73 px past its hero card at 1440 px. It was still on screen, so nothing was reported. At 390 px it ran 169 px past the card, and the hero's `overflow:hidden` clipped it, so the check called it bleed. On Relaygpu's contact form at 390 px, a long topic widened the grid's implicit `auto` column, and the card clipped the dropdown and the fields under it by 43 px. `escapesBox` takes every control (links, buttons, fields, `role=button|combobox|switch|tab|link`). Its card is the nearest ancestor that paints a box (a fill, all four borders or a shadow) and is narrower than the viewport. The control must fit inside that card, and a clipping ancestor must not cut it. It skips anything absolutely or fixed placed on purpose (a close button hung on a corner, a skip link), scrollers, and carousel slides: `aria-hidden`/`inert` slides, or a clipper whose content runs a slide or more past it. Look-alikes are reported once with a count. It runs in the suite and in micro-check at every width.
- **New: a switch's thumb sits inside its track, on the side its state says (1.18).** The checked-state check only asked whether toggling changes something. On Mise the thumb was absolute with no `left`, so it started at the centre of its `<button>`: "off" drew it in the right half and read as on, and "on" drew it 20 px past the track. Toggling still changed something. `toggleGeometry` finds the thumb (the largest roughly square visible element inside a `role=switch`). It must be inside the track: left of centre when off, right of centre when on, and the reverse for `rtl`. Disabled switches are measured too, because nothing is toggled; Mise's broken "Necessary — always on" switch is disabled. It runs inside the 1.18 check.
- **Fix (miss): the cookie banner is found by its accessible name and by its text, not only by class or id.** Mise's banner is `<div role="region" aria-label="Cookie consent" class="presence …">`, with no "cookie" or "consent" in any class or id. The 4.6 flow never found it, never opened its settings, and never saw the panel's switches. Matching now also uses `aria-label`/`aria-labelledby` and a fixed or sticky box that mentions cookies and holds a control. With the panel open, its switches are measured with `toggleGeometry`, disabled ones included. Once the banner was found, Mise also failed the existing "settings replace the banner" rule: the panel opened over the banner, with two "Accept" buttons on screen.
- Fixture pages pin every case in `test/fixtures/runtime/`: `escape.html`, `switch.html` and `cookie-region.html`. Run against the live sites before their fixes, the new checks report all three bugs. After the fixes, and on the other routes of the same sites, they report nothing.

## What changed in 4.9.1 (the site-wide motion check finishes; no snap for a control the click removes)

From a live run on vertex.boutique, where the 4.9.0 site-wide check "every interactive element animates what it shows, hides or changes" timed out at 390 px after 17 min and lost every page's findings.

- **Fix: one stuck click no longer holds the whole run.** After a footer link to the page itself was clicked, the next control was still in the DOM but never visible, and `scrollIntoViewIfNeeded` (no timeout under `@playwright/test`) waited forever; the three page lanes stuck one by one. Every action now has its own timeout, every click a hard budget (`motion.clickBudget`, default 20 s: an abandoned click reloads the page and is listed as not tested), and every page a deadline (`motion.pageBudget`, default 180 s). What a budget leaves out is reported as "N not tested — time budget: …" in the Not tested note and printed in the run's output, never dropped. The run itself stops before Playwright's timeout, so the findings already gathered on other pages are always reported.
- **Faster:** pages load with `load` plus at most 8 s (3 s on the check's own reloads) of network quiet instead of an unbounded `networkidle` (long-polling, analytics and chat widgets never go idle), and four pages are checked at once (`motion.concurrency`). Vertex 390 px: timed out at 17 min → 79 s; 1440 px and truelogos.pro finish in about 1–2 min.
- **Fix (false positive): "its own state change snaps in one frame" on a control the click removes.** A cookie banner's "Got it" / "Accept all", or a quiz option replaced by the next question, is detached by the time it is read; every computed style is then empty and all six properties looked changed with no transition. A detached control's own state is no longer judged; one that stays and snaps is still reported.

## What changed in 4.9.0 (motion everywhere, the open mobile menu, classes that do nothing)

From live misses on truelogos.pro and sprout.boutique.

- **New: overlays that appear by themselves come and go with motion (6.12).** Cookie and consent banners, toasts, promo bars and chat bubbles are never opened by a trigger, so the overlay check never saw them. On truelogos the cookie banner popped in after 1 s in one frame and vanished in one frame on Accept/Reject. Each page is now loaded on its own fresh page (nothing remembered, so the banner shows) with `prefers-reduced-motion: no-preference`. Frames are sampled from the first paint until 3 s after load. Every fixed layer (and sticky bar at the screen edge) that shows up by itself is watched for 600 ms: a finite animation or transition, `element.animate()`, JS rewriting `style=` every frame, or a frame-to-frame change of opacity, transform, clip, position or size counts as motion. An endless spinner does not. Its dismiss control (Reject/Decline/Close before Accept) is then clicked, and the layer must leave with motion. Layers on the first frame, parser-inserted before `DOMContentLoaded`, or re-mounted in place by hydration are part of the page load. The finding names `animate-in` classes that promise motion and produce none.
- **New: every interactive element animates what it shows, hides or changes (6.12, site-wide).** Tabs, accordions, "show more", toggled sections, chips that reveal content, toasts, popovers, carousels and filters, not only 6.12's dropdowns and dialogs. Every visible clickable (buttons, same-page anchors, `role=button|tab|switch|menuitem|option|checkbox|radio`, `summary`, `aria-expanded` / `aria-controls` / `aria-haspopup` / `data-state`, `label[for]`, `onclick`, clickable `cursor:pointer` boxes) is clicked once per component look, with page navigations blocked. What appeared or disappeared in one frame with no opacity / transform / height / clip motion fails, on open and on toggling back. A control whose own fill, border or colour snaps on click is a soft finding. The page is reloaded every 6 clicks, and after any client-side navigation, so state does not cascade. Links to other pages, form submits, destructive actions, look-alikes, and anything over the cap (`motion.maxClicks`, default 30 per page) are listed in a "Not tested" note with counts and examples. The same component on many pages is one finding that lists the pages.
- **New: the open mobile menu is checked (3.5).** Every check ran with the burger closed. On truelogos the open panel was a white, square-cornered inset box on a navy site, with 32 px buttons next to 44–56 px pill CTAs and the page showing below it. Below 1024 px the menu toggle is found (hidden header links + `aria-expanded` / `aria-controls` / a "menu" label / an icon-only header button), opened, and its panel located, including links a portal sheet renders on opening. Hard: text in the panel is legible (6.4), nothing covers its items (a cookie banner over the menu is reported), it fits the screen, no sideways scroll. Soft: 44×44 px tap targets; it covers the page coherently (full height, or a backdrop that dims the rest; otherwise "N% of the screen shows the page undimmed, below it / at its sides"); its surface matches the theme, measured from pixels (a panel ≥3:1 away from both the header bar it opens under and the whole page is reported; a white panel on a light site under a navy header is fine). Site-wide (soft): the panel's buttons are compared with the site's CTA set (height ±4 px, pill/rounded/square shape and radius, font). Chips and dropdown triggers are not CTAs. An inset panel's corners are compared with the site's card radii. The menu is closed again afterwards. No toggle means the existing "every width has navigation" check applies.
- **New rule `ui/no-dead-classes`.** It flags the tailwindcss-animate family (`animate-in`, `animate-out`, `fade-in*`, `fade-out*`, `zoom-*`, `spin-*`, `slide-in-from-*`, `slide-out-to-*`) in `className` / `class`, `cn` / `clsx` / `cva` / `tv` / `twMerge` arguments and `…Class` constants when the plugin is not in effect. Not installed counts, and so does installed but never imported: Tailwind v4 without `@import "tw-animate-css"` (or `@plugin`), or v3 without it in `tailwind.config` plugins. `animate-accordion-*` / `animate-collapsible-*` are flagged when nothing defines their keyframes. A project's own `.fade-in {}` rule or `@utility` counts as CSS. With no `package.json` above the file, nothing is guessed. `ui/overlay-motion` uses the same detection.
- **New runtime cross-check (6.12):** an element whose active classes include `animate-in` / `animate-out` (plain, `motion-safe:`, or `data-[state=…]:` while in that state) and whose computed `animation-name` is `none` is a finding. When no stylesheet defines `.animate-in`, the message says the plugin is missing.
- micro-check also runs the dead-animation-class check and, at 390 px, the open mobile menu. The self-appearing and every-interaction checks need their own page loads, so they run in the suite only.
- Fixture pages pin every case in `test/fixtures/runtime/`: `self-appear.html`, `dead-anim.html`, `mobile-menu.html` and `interactions.html`. In each one the true positive fires and the false positive stays quiet.

## What changed in 4.8.0 (measured against what is painted; two new checks; nothing dropped)

From live runs on truelogos.pro and sprout.boutique, checked by hand.

- **Hover contrast is measured against the pixels behind the label.** When the colour arithmetic says < 3:1, the label is hidden for one frame, the area under it is captured and the label colour is composited over every pixel (the worst 10% decide). A white label on a `bg-gradient-to-r` button, a gradient footer, or a `bg-white/10` pill over a dark hero that is a *sibling* layer (not an ancestor) was measured against the white page (1.00:1). A fixed or sticky layer that covers the button is hidden while it is hovered and captured, and shown again afterwards; on a phone the cookie banner covered half the screen and its white panel was measured. If the pixels still cannot be read, an image/gradient case is a "check by eye" annotation, not a failure. Disabled controls (`disabled`, `aria-disabled="true"`, `inert`) are skipped, as WCAG exempts them.
- **Translucent text fails only on its effective contrast.** `opacity < 0.95` on readable text (a muted caption at 9:1) is no longer a 6.4 finding. Group opacity is now composited exactly: an ancestor's opacity fades its own fill and the text inside it over what is behind.
- **No silent caps.** 6.4 stopped after 40 findings and kept only 20 "check by eye" notes. Overlapping text checked only the first 400 elements. Row, column, field, underline, scrollbar, inline-style and palette checks stopped at 10–30. Every finding is now listed. Horizontal overflow, where one wide container drags all its descendants past the edge, lists 15 elements and then says how many more there are.
- **A field's edge may be drawn by its wrapper.** A `div.border-4` around a bare input, or an icon + input box, counts as the field's boundary (1.9) when it hugs the input and holds no other field.
- **Rows of cards are cards.** 2.6 skips page panels: a split screen (marketing panel + form in a `min-h-screen` flex), a form beside a sticky summary, and rows where one child shows nothing at this width or is parked off-screen. CTA links, fixed/sticky layers (the cookie banner) and image-dominated tiles (logo walls) are not cards. A per-item fill colour is not a style variant, either in a row or site-wide; filled vs clear, border, shadow, radius and padding still are.
- **Button height counts buttons.** Site-wide button signatures leave out nav and footer links, filter chips and segmented options (`aria-pressed`, tabs, radios, three or more look-alike siblings), and link-cards. A link counts only when it is dressed as a button.
- **New: every width has navigation (3.5).** On a phone, header links hidden with `hidden md:flex` and no visible menu button (aria-expanded / aria-controls / aria-haspopup, a "menu" label, an icon-only header button) is a finding. The aria-current check now reads the nav links in a closed menu too, instead of skipping.
- **New: checked looks checked (1.18).** Every checkbox, radio and switch (native or `role=`) is toggled by a DOM click, with no focus ring and no hover, and captured before and after, then put back. Covering fixed layers are moved out of the way first. It fails when nothing changes, or when only the edge changes colour. That was the Vertex bug: an `appearance:none` box whose `checked:` styles were never generated. Look-alike controls are toggled once and reported together.
- **Emoji are found where they hide (1.12).** Emoji in `aria-hidden` icon spans, in reveals that faded out again (`whileInView` without `once`), and in CSS `::before`/`::after` content are reported. Only `display:none`, `[hidden]` and sr-only clips hide them.
- **New rule `ui/no-spaced-arbitrary-value`.** It flags a space inside a Tailwind arbitrary value, for example `bg-[url("data:image/svg+xml,<svg xmlns='…' viewBox='0 0 16 16'>…")]` or `grid-cols-[1fr 2fr]`. The class list splits at the space, the class is never generated, and `cn()`/`twMerge()` may drop the classes next to the fragments. Write spaces as underscores, or move the value to plain CSS. The rule runs on `className`, `class` and `cn`/`clsx`/`twMerge`/`cva`/`tv` arguments.
- `test/checks-fp.test.mjs` pins each case with a fixture page in `test/fixtures/runtime/`: the false positive stays gone and the true positive still fires.

## What changed in 4.7.4 (the site-wide shapes count only fields and cards)

- **Input height and radius count text fields only.** A range slider (4 px tall), colour well, file picker or input-button was grouped with the text fields and reported as a sixth input height.
- **Scrolling during the checks is instant.** On a site with `scroll-behavior: smooth`, the reveal pass scrolled back to the top with an animation and "page loads scrolled to top" read 1-4 px now and then.
- **A card is boxed on all four sides (or shadowed), and is not a form control.** A textarea and a `border-t` divider between sections were counted as cards, which inflated "card style" with variants nobody would call a card.

## What changed in 4.7.3 (measured where it lands; passwordless sign-in; reveals that replay)

- **Overlays and hover colours are measured after their motion ends.** The interactive-state check opened a menu, waited a fixed 350 ms and measured; a mobile sheet that slides in for 500 ms was still 24 px past the edge and was reported "off-screen" although it fits exactly at rest. It now waits for the page's finite animations and transitions to finish (capped; spinners are not waited for). The hover-contrast check waits the same way instead of a fixed 250 ms.
- **Reveals and focus rings are measured where they settle.** `revealLazy` waited a fixed 700 ms after scrolling; staggered reveals (0.8 s plus 0.1 s per item) were still half-faded and their text was reported translucent. The focus check compared styles in one frame, so a ring drawn through `transition-all` read as "identical to unfocused". Both now wait for the transitions to finish.
- **A tick box the product draws is not a native control.** `appearance: none` on a select, checkbox or radio means the product draws it (a kit tick box keeps the real input for forms and the keyboard); date and file inputs are still reported, since they open system pickers.
- **`prepare` signs in without a password.** Sites with an emailed code, a magic link or Steam have no form to fill. `SESSION_COOKIES` (a JSON cookie list, or `name=value`) plus `authRoutes` in the config now crawls the signed-in pages from a session; a session that does not sign in stops with the reason instead of quietly checking only the public pages.
- **New rule `ui/no-css-transition-on-motion`.** A `<motion.*>` element with `transition` / `transition-all` / `transition-opacity` / `transition-transform`: framer-motion ends a reveal (or a hover/tap) by writing opacity/transform inline, and the CSS transition replays it — the block appears, blinks out and slides in a second time. `no-transition-all` no longer suggests `transition-opacity` / `transition-transform` as the fix.

## What changed in 4.5.1 (a page nobody opened is not a clean page)

- **micro-check follows a change to every page it reaches.** Editing a component (for example `components/gallery/controls.tsx`) now renders every page that imports it, through barrels and `import()`. Before, only changed page files were opened, and the configured routes stood in for everything else.
- **Dynamic routes get a real URL:** `app/[game]/gallery` → `/tf2/gallery`, from `sampleParams` or from the crawl (`.babysitter/routes.json`). When neither knows a value, the result is a finding, "not rendered [coverage]", with the fix — not a silent skip.
- **An error page is not the page.** A route answering 4xx/5xx is a finding, instead of its error page being checked and passing.
- `lib/route-map.js` + `test/route-map.test.mjs`.

## What changed in 4.5 (end-to-end tests the project owns, business acceptance)

- **`npm run test:e2e` in every project.** `babysitter init` now adds:
  - `e2e/babysitter.ts`, the helpers: `test`, `expect`, `open`, and a signed-in `user` page;
  - `e2e/journeys.spec.ts`, the product's own journeys, created once and then owned by the team;
  - an `acceptance` block in `babysitter.config.json`;
  - the `test:e2e` script.

  The new `babysitter e2e` command runs prepare (login + crawl), then the UI checks, business acceptance and `e2e/*.spec.ts` in one Playwright run (`--only ui|acceptance|product`). The agent instructions require a journey test for every user-facing feature, written in the same change.
- **Business acceptance** (`playwright/acceptance.spec.ts`, [docs/acceptance.md](docs/acceptance.md)) covers what the business side raised on product after product (about 960 business-QA cards).
  - **Footer:** Terms, then Privacy; Cookie Policy and "Manage cookies" last; no logo on the © line; a company line; a support email on the site's domain; "We accept".
  - **Cookies:** Accept, Reject and Manage, with per-category toggles; Analytics only if analytics actually loads.
  - **Money:** the chosen currency on every page; no "≈"; no VAT; thousands separators.
  - **Sign-in:** a password eye that Tab skips; one consent checkbox; the footer on sign-in; signed-in users are never offered Sign in; one-click Sign out; 2FA and Delete account in settings.
  - **Policies:** text spans its column; a sticky "On this page"; pages they name are links.
  - **Pages and copy:** no dead links; no `/gdpr`, `/press` or `/currency`; no build notes; no duplicate links or images; the hand cursor on everything clickable; no hover effect on cards that cannot be clicked.

  Owner decisions are config keys: `twoFactor`, `footerManageCookies`, `currencies`, `company`. Skipping a check needs a written reason.
- **Design coherence, measured in the browser** (micro-check and the suite):
  - **1.17 one shape language:** on a rounded site nothing is square-cornered, and the reverse;
  - **1.18 one palette:** colours come from the theme's tokens, and Tailwind's stock palette does not count;
  - **1.19 native parts follow the theme:** `color-scheme: dark` on dark sites, no number spinners.
- Reports and test results are written to the project's `.babysitter/`, not inside the tool. `playwright/project.ts` became `project.js`.
- Self-test: `test/acceptance.test.mjs` serves a good and a bad fixture site and runs the real suite. The good one must pass every check; the bad one must fail the 20 checks it breaks.

## What changed in 4.6.5 (the overlay that renders nothing while closed)

- `ui/kit-interactive` catches `if (!open) return null; … return (<div className="fixed inset-0 …">)` (and the same with `createPortal` or `role="dialog"`): the overlay mounts and unmounts in one frame, so it can neither open nor close with motion — found as Mise's /shop "Quick view" in production. Framer-motion roots and components (the kit Dialog) are left alone.
- Guideline 6.12: a page that 500s/404s in the check environment for lack of data must be seeded and checked — every overlay on it opened — not skipped. (Mise /shop was skipped because it 500s on an empty database, so its modal was never opened.)

## What changed in 4.6 (one component per interactive role)

- **`ui/kit-interactive` counts every role, not only the select**: dropdown (select, action/user menu, multi-pick filter, combobox — one component), modal (dialog, confirm, sheet, drawer — one component), button, input, textarea, checkbox, radio, switch, toast, tooltip, popover, disclosure, tabs. A role is recognised by the headless part a kit file builds on or by the kit file's name; a second implementation anywhere (kit included: `dropdown-menu.tsx` next to `select.tsx`, `pill-button.tsx` next to `button.tsx`) is an error naming the first one.
- **Raw fields in page code** (`<input>` text/email/password/search/tel/url/number, `<textarea>`) are flagged: use the kit Input / Textarea (raw `<button>` and links dressed as buttons were already `no-native-controls` / `no-adhoc-button`).
- Toast libraries (sonner, react-hot-toast…) count as the toast role; pages may still call `toast()`.
- Also caught (4.6.2): `{open && createPortal(<div>…)}` overlays whatever the state is called; links dressed as buttons through the project's own classes (`btn btn-primary`, `bl-btn`, `rx-btn`); `type={show ? "text" : "password"}` fields; `<input type="range">` (kit Slider); hand-drawn ARIA roles in page code (`role="radio|radiogroup|dialog|menu|listbox|tab|switch|slider|tooltip"`, `aria-modal`).

## What changed in 4.4 (interactive elements are reusable, animated kit components)

- **New rule `ui/kit-interactive` [1.18]**: every interactive element — the dropdown that replaces `<select>`, menus, popovers, tooltips, dialogs, sheets, accordions, collapsibles, tabs — is a reusable component from `components/ui`, one per role.
  - Page/feature code importing Radix / Base UI / Headless UI / Ariakit / vaul directly is flagged.
  - Hand-built ones are flagged: `{open && <div>…}`, `{openKey === key && …}`, `{expanded[i] && …}`, native `<details>`, `<dialog>`, `popover=`. `!open`, data called `open` (`sku.open`, `open.length`) and components are left alone.
  - **One custom dropdown per site**: a second Select / Listbox / Combobox implementation (Radix Select, Base UI Select/Combobox, react-select, downshift, `role="listbox"`) is an error, kit included.
- **Disclosures animate [6.12]**: `Accordion.Content` / `Collapsible.Content|Panel` must animate their height in and out (`ui/overlay-motion`), and the rendered check now opens accordions, "show more" panels and `<details>` too — a panel that jumps open or shut is a red finding.

## What changed in 4.3 (overlay motion is measured, not assumed)

- **Rendered check "overlay motion" [6.12]** (micro-check → Studio, and the Playwright suite): every trigger on the page — anything with `aria-haspopup` / `aria-expanded` / `aria-controls` / `role=combobox`, and buttons that look like one (a short label + a trailing chevron) — is opened and closed (Escape, then the trigger again). The page records the layer that appears and how it leaves, frame by frame: a CSS animation, a transition, a Web Animation or a per-frame change of opacity / transform / size counts as motion. A list that appears or vanishes in one frame is a red finding framed on its trigger, explained in plain words.
- **`ui/overlay-motion` sees hand-made overlays**: `{open && <div className="absolute … z-… shadow…">}` (or `open ? … : null`) is flagged — unmounting means no exit animation, ever. Components and framer-motion (`motion.*`, anything under `AnimatePresence`) are left alone.
- **Exit classes that cannot play**: Radix Select before 2.3.0 unmounts the list at once, so `data-[state=closed]:animate-out` never runs; the rule names the installed version and the fix (update to ^2.3.0).

## What changed in 4.0 (fixes wait next to the original; only what a person sees asks for approval)

The agent no longer edits the original to show you a fix. It scans, prepares each fix as a **proposal** next to the
original, and Studio shows them; the original files change only when you accept.

```bash
babysitter propose start                                   # the files as they are now = the original
# …edit: the fix…
babysitter propose save --title "Visible field edges" --for "control boundary"     # files go back to the original
babysitter propose save --title "style= → classes" --for "inline style" --kind code  # an invisible fix
babysitter propose auto --routes /,/pricing,/signup        # applies the code-only fixes — only if every page is
                                                           # pixel-identical with and without them (desktop + phone)
babysitter studio review --repo . --proposals < findings.json
babysitter propose edit <id> / save --id <id>              # revise a fix the reviewer commented on
```

- **Only what a person can see is listed.** Each entry has its fix with **Accept / Reject / Comment**; its frame on
  the page has **Before / After**: After shows the fixed version inside that frame only. The page itself is the
  original; *After (with fixes)* shows the whole page from a second dev server with the pending fixes applied — a
  commit built in a throwaway index, so the disk, the index and HEAD are never touched.
- **Accept** writes that fix (and any fix it `--requires`) into the original files; the entry moves to *Fixed*.
  **Reject** drops it. **Comment** prints `babysitter-event {"event":"comment",…}` for the agent, which revises the
  fix (`propose edit` → `propose save --id`); the panel picks the new version up by itself. **Approve all** applies
  every fix still waiting.
- **Code-only findings** (`style=`…) change nothing on screen, so they are not listed (only counted) and their fixes
  are applied without asking — but only after `propose auto` has rendered every given page from both versions and
  found them identical, pixel for pixel. A "code-only" fix that moves a pixel is refused and its differences listed.

## What changed in 3.14 (Before/After without a reload: snapshots at your view)

- **The Before/After switch no longer touches your files or reloads your page.** Swapping files under a dev server makes Next reload the page (twice per switch, scroll lost), and no staging avoids that. Studio now starts the base ref on a **second dev server in a git worktree** (node_modules linked, `.env*` copied; Next runs with `--webpack` there because Turbopack refuses a linked node_modules). It captures **both sides at your window's size, pixel ratio and scroll position**, with your localStorage and cookies (a closed cookie banner stays closed), and lays them over the page.
  - Before ↔ After flips instantly (B, or И on a Russian layout); Esc returns to the live page.
  - Scrolling shows the live page and re-captures where you stop.
  - **⇆ Slider**: a draggable divider with BEFORE on the left and AFTER on the right. **◫ Differences** tints the changed areas and counts them, and says plainly when a screen has none.
  - On Orbit the first switch takes ~13 s (starting the base server), then each one is instant: 0 reloads, scroll unchanged, your files untouched.
- The old file swap stays as **↻ Live**, for clicking around in the old version.
- Studio stops the base servers and removes their worktrees on Ctrl-C / SIGTERM. A capture can only open a path on the two dev servers.

## What changed in 3.13 (Before/After that the page really shows)

- **The dev server now follows the swap.** On Orbit (Next 16, Turbopack) the switch changed the files but the page kept the old look: the theme CSS was one step behind and Tailwind missed the classes of re-created files. Swaps are now staged (`applyStaged`): stylesheets first, a pause, the components, then one more real write of the stylesheets on a settled tree. The page is then reloaded with its scroll position and comment draft kept, so it shows the rebuilt CSS. Verified on Orbit: page, theme and Tailwind classes match the chosen side every time, within about 5 s.
- A decision taken mid-swap cancels it cleanly: the work is on disk at the end, the rescan marker never stays, no false conflict copies.
- **Frames have 6 px of air** around the element. **▣/▢ toggles the frames**; with frames off, clicking an entry shows its frame for a moment.
- **EN / RU switch** in the panel, remembered per site.

## What changed in 3.12 (Studio: a panel a reviewer can read)

- **Findings explained in plain language** (`lib/explain.js`, English and Russian; the panel follows the browser's language). Each finding names the element as a person would ("Dropdown «€ EUR» in the site header"), says what is wrong, why it matters (with the measured numbers) and how to fix it. Selectors, routes and rule ids go under *details*.
- **Repeats are grouped**: the same issue on the same element is one entry ("on 12 pages · 4 places"), and frames carry the entry's number.
- **The panel moves**: drag it by its header. It stays inside the window and keeps its place across reloads; double-click puts it back. The – button folds it, and a new review unfolds it.
- **One list for the whole site, by what a person sees.** Red: visible on the page (contrast, invisible field edges, browser-default controls). Yellow, dashed: only in the code (`style=`), fixing it changes nothing on screen. Green: fixed since the previous check (`studio review --fixed-from earlier.json`). Filter chips hide any kind, both in the list and on the page. An entry on another page opens that page and points at its frame.
- **Before / After is always shown.** When there is nothing to compare, it is off and says why. `studio review --repo . --base main` compares a whole branch with any ref, using the same journaled, crash-safe swap as the hooks.

## What changed in 3.11 (Claude Code integration without machine paths)

- **`init` package mode** — the team setup. It is chosen automatically when `claudes-babysitter` is installed or listed in `package.json`; `--package` forces it, and adds the devDependency pinned to the running version if it is missing. Everything `init` writes goes through `node_modules`, so every teammate's agent runs the version `package.json` pins:
  - `.claude/settings.json`: `if [ -f "$CLAUDE_PROJECT_DIR/node_modules/claudes-babysitter/bin/hook-stop.mjs" ]; then node …; fi`. Plain `node` rather than `npx`, because PostToolUse runs after every edit. The hook's exit code (2 = block) passes through. Before `npm install` it does nothing instead of failing every edit.
  - `CLAUDE.md`: `npx --no babysitter check --changed --format agent`, `npx --no babysitter prepare && npx --no babysitter test-ui`, `npx --no babysitter studio start --target …`.
  - git pre-commit via `install-hooks`; `"prepare": "babysitter install-hooks"`; `"babysitter": "babysitter"`; with `--ci`, `.github/workflows/babysitter.yml`.
- **Never a bare `npx babysitter`.** `babysitter` on the npm registry is an unrelated package, and without a TTY (an AI session, CI) npx installs and runs a missing package without asking. `--no` runs only the local copy, and fails otherwise. The 3.10 workflow template is fixed the same way.
- Re-running `init` moves a link-mode or vendored project to package mode in place: hooks are replaced, not duplicated. `BABYSITTER-ADOPTION.md` keeps its ticks and only its commands are refreshed. `enable-hooks` keeps the install type it finds.

## What changed in 3.10 (team rollout: install on npm install, gate in CI)

```jsonc
// package.json of the product
"devDependencies": { "claudes-babysitter": "github:souldevsoul/claudes-babysitter#v3.11.0" },
"scripts": { "prepare": "babysitter install-hooks", "babysitter": "babysitter" }
```

- **`babysitter install-hooks`** for `prepare`: every clone gets the git pre-commit gate on `npm install` / `pnpm i`. It is silent and never fails the install. It does nothing in CI or outside a git work tree. It is idempotent and runs the project's own `node_modules` copy, so it follows upgrades. A foreign `pre-commit` is kept as `pre-commit.local` and still runs first. Under husky (`core.hooksPath`) it never rewrites the other tool's hook; it prints the one line to add.
- **`babysitter audit --diff [origin/main]`** — the CI gate. It reports only what the branch added since it left the base (the merge-base, so debt that landed on main later is not the PR's). Old debt on touched or moved lines does not fail it (3.9). Under GitHub Actions each finding becomes an `::error` annotation on the PR line, plus a step summary. Exit 0 clean, 1 new problems, 2 unknown base (check out with `fetch-depth: 0`).
- `--format github` for `check`; `babysitter studio …`; `ws` and `http-proxy` are root dependencies, so a git install has Studio too.
- Workflow template: `templates/github-babysitter.yml`.

## What changed in 3.9 (the gate blocks new debt, not old debt that moved or was touched)

- **"New" now means new.** In `--changed` mode each changed file is also linted at the base version, and findings are matched as a multiset of rule + message. A finding is new only if the file has more of it than before. A codemod that rewrites one token on a line no longer owns the rest of that line's debt; adding one more copy of that debt still blocks. An override counts as the same finding when its classes are edited, because the finding is about the component.
- **Moved code is not new code (3.8.2).** A line removed in one place and added unchanged in another (extracting a shared component) keeps its old findings as information. A copy (the original stays), an edit on the way, and fresh debt next to it still block.
- Both kinds are listed under "For information only", marked *moved here unchanged* or *already in this file before your change*.
- 3.8.1: a crashed checker (e.g. missing node_modules) is reported as a tool failure, not as an empty "blocked".

## What changed in 3.8 (Studio: Visual Prompting)

- **🎯 Inspect** in the panel: point at any element, even one the automation did not flag, click and write what should change. Blue frames are human notes, red ones are findings. The picker snaps to the button around a `<span>` (Shift = exact element), Alt+↑ goes to the parent, and the app never sees the clicks.
- **Unique, stable selectors**: generated React / UI-kit ids and variant classes are skipped, and attribute values stay grep-able. Notes also carry the element's text and classes.
- **Notes reach Claude** as `Manual QA Feedback: - Element … - Instruction …`: with Reject or Send Comment, through the Stop hook when the checks are clean, or with the next prompt via the new `UserPromptSubmit` hook (`init` registers it).
- Studio e2e: 21 cases (selector checked on every element of the page, the picker flow, all three delivery routes).

## What changed in 3.7 (Studio: Time Travel)

- **After | 👁 Before (HEAD)** in the review panel. The frozen CLI swaps the changed UI files on disk between the working tree and HEAD, and the dev server's HMR redraws the page in place. Panel amber and frames hidden on Before.
- **The work cannot be lost:** journal-first, all-or-nothing on the way to Before, conflict copies on the way back, try/finally + signal and exit handlers, `recover()` on every hook start, and `babysitter restore`. See `studio/README.md`.
- New `test/time-travel.test.mjs` (SIGKILL, SIGTERM, SIGINT, uncaught exception, edits during the review). Studio e2e: 17 cases, including the real Stop hook killed while HEAD is on disk.

## What changed in 3.6 (Studio: visual review core)

- **Freeze & Resume in the Stop hook too.** With `"studio": { "enabled": true }`, a Claude turn with UI problems pauses with `⏳ Visual Review required. Open http://localhost:3001` until a human decides. Approve ends the turn, **Send Comment** hands the comment to Claude as the brief for the next iteration, Reject sends it back with the fix-list. Shared code: `lib/studio-gate.js`.
- **Send Comment is a decision now**, not a side note: it ends the review (`DECISION: comment`). The CLI prints `Reviewer comment: …` to stdout and exits 1.
- **Frames track the page**: scroll in any scroller, resize, element resize and DOM changes (HMR re-renders re-resolve the selector), at most once per animation frame. The old always-on rAF loop is gone. The panel header shows the count; clicking a problem scrolls to it.
- **3.5.1 security fix**: panel sockets only from the proxy's own origin, CLI sockets only without an Origin, server bound to 127.0.0.1 (cross-site WebSocket hijacking could approve a commit).
- Stop hook timeout raised to 1800 s by `init` so a frozen review is not killed.

## What changed in 3.5 (Babysitter Studio MVP)

- **`studio/` — `@babysitter/studio`**, an npm workspace. A local proxy injects a Shadow-DOM review panel into the dev site, and a WebSocket bus connects it to the CLI. See [`studio/README.md`](studio/README.md).
- **The git pre-commit gate can ask a human.** With `"studio": { "enabled": true }`, a commit with problems sends `REVIEW_REQUIRED`, red frames appear on the page, and the gate waits for the decision. Approve commits, reject or a timeout aborts, and if no studio is running the plain gate decides.
- **DOM findings now carry a unique `selector`** (`playwright/checks.js → __uiSelector`), so they can be outlined on the page.

## What changed in 3.4 (adoption wizard)

- **`init` is an interactive wizard** (`@clack/prompts`): "Куда мы устанавливаем Babysitter?" → a new project (strict) or an existing project (adoption).
  - With no terminal, `--new` / `--existing` answer it.
  - Without a flag, ≤ 5 pages means new and more means existing.
- **Adoption mode** (`"mode": "adoption"`, `"themeFirst": false`). The PostToolUse hook returns the report as `additionalContext` instead of blocking, the Stop hook only notes it, and the pre-commit gate prints a warning and lets the commit through.
- **`BABYSITTER-ADOPTION.md`**: a 4-step checklist with a snapshot of the current debt. `audit` ticks step 2 (and 3 when green), and `enable-hooks` ticks step 4.
- **`babysitter audit`** is now the whole-project summary. The reuse/theme audit alone is `audit-components`.
- **`babysitter enable-hooks`** re-runs `init` in strict mode (hooks refreshed, Theme First on). It refuses until the audit is green; `--force` switches anyway, since old debt never blocks, only changed lines do.
- **`npm run babysitter`** script added to the project.
- **Fixed**: a rename in 2.3 had left a control character in place of "init"/"start"/"end" in messages, the ESLint config names and the `CLAUDE.md` markers. Re-running `init` now finds the old markers and replaces them.

## What changed in 3.3.1

- **Dark-theme checks really test the dark theme.** Class-based themes (shadcn `.dark`, `data-theme`) ignore `prefers-color-scheme`. When a run emulates dark, the checks now switch `<html>` to `.dark` / `data-theme="dark"` after hydration, the way a theme toggle does. Before, the "dark" pass measured the light theme a second time.
- **Hover checks look at the page's own document only.** Playwright's `$$` pierces shadow roots, which pulled in the Next.js dev-tools button.

## What changed in 3.3 (strict styles + DOM sniper)

- **`ui/no-inline-style` rewritten** (`rules/eslint/rules/ui-no-inline-style.js`). The `style` prop is forbidden on every element, DOM or component. Spreads inside `style` are forbidden, and so are references and conditionals.
  - The only exception is an object literal whose keys are **all** CSS custom properties: `style={{ "--progress": value }}`.
  - Style objects written in other modules are judged where they are written.
  - UI-kit primitives stay exempt.
- **Strict scale in CSS**: `stylelint-declaration-strict-value` on `/color/`, `margin`, `padding`, `gap`, `width`, `height`, `border-radius`, `border`.
  - Allowed values: `0, auto, inherit, transparent, currentColor, 100%, none, 1px, var(…), calc(…)`, plus the border-style keywords `solid`, `dashed` and `dotted`, so `border: 1px solid var(--border)` works.
  - Token definitions (custom properties in `:root` / `@theme`) are not checked.
  - The plugin is a runtime **dependency** imported by the config, so it resolves inside any project.
- **DOM sniper in `micro-check`**: every rendered `[style]` whose declarations are not all `--custom-properties` fails with `❌ [Playwright] Нарушение архитектуры! Обнаружены хардкодные inline-стили в DOM: <tag> содержит запрещенные свойства …`. It sees styles no static check can, such as `dangerouslySetInnerHTML`, scripts and imported props.
  - Built-in exceptions: framework internals (Next.js scripts and route announcer, `next/image`, Radix/Floating-UI popper wrappers, toasters), visually-hidden a11y helpers (≤ 1×1, absolutely positioned) and motion properties written by animation libraries (`transform`, `opacity`…).
  - Configure with `domSniper.allowProps` and `domSniper.skip`; `domSniper.strict: true` removes all exceptions.

## What changed in 3.2 (red-team pass)

A chaos agent tried seven forbidden patterns, each with one disguise after the first block. Five disguises got through 3.1; all five are blocked in 3.2, with a regression test each.

| Attack (disguise that worked) | 3.2 fix |
|---|---|
| `"bg-" + color + "-500"`, `["bg", c, "500"].join("-")` | `ui/no-dynamic-classes` follows `+` chains and array joins |
| `style` object moved to an imported `.ts` module and spread as props | `style: { … }` objects are judged where they are written (CSS visual keys only outside JSX); spreading an imported object onto a DOM element is unverifiable → blocked; `.ts/.js/.mjs` files are linted and hooked |
| raw `<style>{\`…#bada55…\`}</style>` / `dangerouslySetInnerHTML` | parsed as CSS by `ui/no-css-in-js-literals` |
| `const Field = "select"; <Field/>`, `type={"da" + "te"}`, `React.createElement("select")` | `ui/no-native-controls` statically evaluates tags and types; the rendered micro-check also looks for native controls |
| kit component only *mentioned* (`void PaymentBadge`) | a bare mention is not a use; only render, call or passing it somewhere counts |

Also fixed during the pass: route handlers (`GET`/`POST`) are no longer taken for components, and `scripts/`, `prisma/`, `migrations/`, `db/` are not UI and are ignored by default.

## What changed in 3.1 (spec compliance pass)

- **Component audit on the AST** (`lib/components.js`, typescript-estree), no regexes. It reads definitions, exports, imports (aliases from tsconfig, relative paths, barrels/re-exports, `import()` and `next/dynamic`) and real uses (JSX render or call).
  - A component rendered inside its own file (`DialogOverlay` inside `DialogContent`) is used.
  - A barrel import (`from "@/components/animation"`) is a use.
  - Orphans are resolved to a fixpoint: something used only by dead components is dead too, and the message names the chain.
  - On a pilot product this matched a manual review exactly: 40 removable + 2 kept on purpose.
- **Placement rule:** a component imported from another route/folder must live in a shared folder (`sharedDirs`, default `components, layout(s), shared, ui, widgets, features`). Colocated page parts, providers and `contexts/` are exempt.
- **Every commit:** `init` installs a git `pre-commit` gate (`bin/hook-pre-commit.mjs`) with the same static checks, theme gates and micro-check as the Stop hook. This covers commits by people and other generators. It chains into an existing hook or husky `core.hooksPath`; `--no-verify` bypasses it deliberately; `init --no-git-hook` skips it.
- **Contrast pair `input / background` ≥ 3:1** (WCAG 1.4.11) and micro-checks for clipped mobile tables (2.3) and invisible control borders (1.9), from the live dashboard run.

## What changed in 3.0 (from the independent review)

| # | Change | Where |
|---|---|---|
| 1 | **Evasions closed by AST analysis** (ESTree via `@typescript-eslint`, CSS via PostCSS). Every class-like string is judged where it is written: attribute, object map `styles.card = "…"`, const, `cn()`. New rules: `ui/no-dynamic-classes` (`bg-${tone}-600`) and `ui/no-css-in-js-literals` (styled-components/emotion templates and objects). `ui/no-inline-style` follows `style={obj}`, `{...base}` and `{...{style}}`. Stylelint `ui/apply-values` handles `@apply` with arbitrary values/palette | `rules/eslint/rules/ast.js`, `rules/classes.js`, `rules/content.js`, `rules/stylelint/plugin.js`, `lib/tokens.js` |
| 2 | **Static WCAG 2.1 contrast of theme tokens**: CSS vars, `@theme`, `.dark`, Tailwind config; hex/rgb/hsl/shadcn-HSL/oklch/oklab/lab/lch. text/background, muted/background and button text/button below 4.5:1 **block**; other pairs warn. `contrastTokens` maps custom token names | `lib/colors.js`, `lib/theme.js`, `bin/ui-check.mjs` |
| 3 | **Theme First in the loop**: any UI edit on a stock shadcn theme is blocked with "Сначала обнови тему (Theme First)". Opt out with `"themeFirst": false` | `lib/theme.js → stockTheme`, `bin/ui-check.mjs` |
| 4 | **Component heuristic instead of the kitFiles allowlist**: a shared component (under `components/`) must be exported, used at least once, and must not repeat the role of an existing one (StatCard ≈ StatTile ≈ MetricPanel; synonyms in `lib/roles.js`) | `lib/roles.js`, `bin/ui-audit.mjs` |
| 5 | **Rendered micro-run in the Stop hook**: if `devServer` (or `BABYSITTER_DEV_URL`) answers, the changed pages (mapped from `app/**/page.tsx`, `sampleParams` for `[id]`) are opened at 390 and 1280. It measures contrast, card rows (same y and height, CTAs and prices aligned) and mobile overflow. Skipped silently with no server | `bin/micro-check.mjs`, `bin/hook-stop.mjs` |
| 6 | **Theme fingerprint registry**: hue, chroma, lightness, radius, fonts and mode, plus a hash. Weighted similarity against a local JSON (`~/.claudes-babysitter/registry.json`) or an HTTP endpoint (GET list / POST entry); **warning** at ≥ 80%. `babysitter fingerprint [repos…] [--register]`; `init` registers automatically | `lib/theme.js → fingerprint/similarity`, `lib/registry.js`, `bin/fingerprint.mjs` |

## Set up a project in one command

```bash
npx github:souldevsoul/claudes-babysitter init path/to/project [--ci] [--url https://preview] [--link] [--dry-run]
```

`init` detects the stack (Tailwind/layers, shadcn, UI-kit, theme file), then sets up the project:

1. Copies the tool into `tools/claudes-babysitter` and installs it. Use `--link` to reference this checkout instead.
2. Writes `babysitter.config.json` (with `--dev-url` for the rendered micro-check), registers the theme fingerprint and reports contrast and look-alikes.
3. Adds the Claude Code hooks to `.claude/settings.json`, merged and de-duplicated with existing hooks.
4. Puts the generator rules into `CLAUDE.md`/`AGENTS.md` between markers.
5. Adds `.babysitter/` to `.gitignore`.
6. With `--ci`, adds the CI workflow.

It finishes with the theme verdict ("THEME FIRST" if the kit is stock shadcn) and the existing-debt summary. It is safe to re-run: the second run changes nothing.

## What changed in 2.2 (from the pilots on three products)

- **Audit blocks only new problems in `--changed` mode.**
  - The base version is unpacked with `git archive` to a temp dir; the repo is untouched.
  - Findings that already existed are listed as *"for information — do not fix unless the task asks"*.
  - A new shared component under `components/` counts as consolidation, not a duplicate.
  - This stopped generators from refactoring unrelated pages to clear old debt.
- **`@layer` is required only where CSS is already layered.** That means Tailwind, or a project already using `@layer`; override with `"cssLayers": true|false`. In unlayered Bootstrap/SCSS templates, forcing `@layer` made the product's own CSS lose to every template rule.
- **SCSS is checked** (`postcss-scss`). `$variables`, `@variables` and colour functions of tokens (`rgba($primary,.5)`, `color-mix(… var(--x) …)`) count as tokens.
- **`public/` is no longer skipped wholesale.** Template projects keep their theme there. Only vendored dirs, `*.min.css` and well-known libraries (Bootstrap, Font Awesome, jQuery UI, Swiper…) are ignored.
- **Theme audit only runs on shadcn/ui kits.** It compares against shadcn defaults, so it is skipped elsewhere.
- **Only `ui/*` ESLint findings are reported.** The product's own `eslint-disable` comments for plugins we don't load are not noise any more.
- **`npm test` now includes end-to-end `ui-check` cases** on throwaway repos.

## Quick start in a product repo

```bash
cp templates/babysitter.config.json ./           # set baseURL, routes, login, allowances
# merge templates/claude-settings.json into .claude/settings.json  # generator hooks
node tools/claudes-babysitter/bin/ui-audit.mjs . --init  # record the reviewed kit (kitFiles)
node tools/claudes-babysitter/bin/ui-check.mjs           # whole repo
node tools/claudes-babysitter/bin/ui-check.mjs --changed --format agent   # only what you changed, as a fix-list
LOGIN_EMAIL=… LOGIN_PASSWORD=… node tools/claudes-babysitter/playwright/prepare.mjs   # login + crawl
npx playwright test -c tools/claudes-babysitter/playwright/playwright.config.ts
```

- **CI:** `templates/.github/workflows/claudes-babysitter.yml`. It lints changed files, then runs the runtime checks against the preview.
- **Code generators (enforced, not advisory):** merge `templates/claude-settings.json` into `.claude/settings.json`.
  - **PostToolUse** hook: after every edit of a `.jsx/.tsx/.css` file, that file's *changed lines* are checked. Problems go straight back to the model.
  - **Stop** hook: the model cannot finish a turn while changed UI code has problems. After 3 blocked attempts it stops and must tell the user what remains.
  - Also paste `templates/AGENTS.babysitter.md` into `AGENTS.md`/`CLAUDE.md`. Adding `eslint-disable` for a `ui/*` rule is itself reported.
- `--changed` reports only **changed lines**: old debt in untouched lines is not shown, use `--all-lines` to see it. `public/`, `vendor/` and `*.min.css` are ignored, and `ignore` in the config adds more.

## Project allowances (`babysitter.config.json`)

Some rules encode design choices rather than bugs. A project can opt out explicitly, with a reason, and the opt-out is visible in review.

| Key | Effect |
|---|---|
| `allow.rails` | Horizontal galleries allowed (`ui/no-scroll-rail` off). The page still must not scroll sideways (2.1). |
| `allow.emoji` | Emoji allowed (lint + runtime). |
| `allow.negativeMargins` | Overlapping editorial compositions. |
| `allow.lightWeights` | Light/extralight body type. Contrast is still measured. |
| `allow.palette` | Raw Tailwind palette hues allowed in pages (`ui/no-raw-palette` off). |
| `kit` | Extra project components treated as kit (e.g. `StatTile`). |
| `consistency` | How many radii/heights/fonts per role, and card styles, the site may use. Button fonts are counted per variant. |
| `motion.maxClicks` | Clicks per page for "every interactive element animates what it changes" (default 30). What is over the cap is listed as not tested, never dropped. |
| `motion.clickBudget` | Hard time budget per click in that check, ms (default 20000). A click that runs over is abandoned and listed as not tested (time budget). |
| `motion.pageBudget` | Time budget per page in that check, ms (default 180000). Controls left when it runs out are listed as not tested (time budget). |
| `motion.concurrency` | Pages that check runs at once (default 4). |
| `ignore` | Extra paths (regex) excluded from `ui-check`. |
| `cssLayers` | Force `ui/require-layer` on/off (default: on only if Tailwind or `@layer` is detected). |
| `audit.exclude` | Paths the reuse audit ignores (e.g. design experiments). |
| `colorSchemes` | `["light","dark"]` runs everything in both. |

## Rule map

### ESLint

| Rule | Guideline | Patterns |
|---|---|---|
| `no-native-controls`: `<select>`, date/time/file/checkbox/radio inputs, raw `<button>` outside the kit | 1.1 | P01 P03 P04 P20 P50 |
| `no-native-dialogs`: `confirm`/`alert`/`prompt` | 1.1 | P20 |
| `kit-interactive`: interactive elements come from the kit — no headless-library imports or hand-built dropdowns/menus/dialogs/accordions/tabs in pages (`{open && <div>}`, `<details>`, `<dialog>`, `popover=`); exactly one dropdown component replaces `<select>` per site | 1.18 | P01 P59 |
| `overlay-motion`: select lists, menus, popovers, dialogs, drawers animate in **and** out; `animate-in`/`fade-in-0` classes without `tw-animate-css` are flagged (they compile to nothing); hand-made overlays mounted with `{open && <div className="absolute z-… shadow…">}` are flagged (they can never animate out); Radix Select below 2.3.0 is flagged (its exit classes never play) | 6.12 | P59 |
| `no-dead-classes`: tailwindcss-animate classes (`animate-in`, `fade-in-0`, `slide-in-from-*`, `zoom-*`, …) when tw-animate-css / tailwindcss-animate is not installed **and** imported; accordion/collapsible height classes with no keyframes | 6.12 | P59 |
| `no-auth-library-pages` | 1.14 | P20 |
| `no-adhoc-button`: *clickable* element with fill/border + padding + radius | 1.3 / 1.5 | P04 P05 |
| `no-visual-classname-override`: visual/state classes, `style`, or variable `className` on kit components | 1.3 / 1.4 / 1.15 | P04 P06 P46 |
| `no-thin-kit-wrapper`: `HeroButton = p => <Button {...p}/>` | 1.16 | P46 P47 |
| `no-inline-style`: colour/type/spacing/z-index in `style={{}}` (geometry and CSS variables are fine) | 1.15 / 6.5 / 5.3 | P22 P33 P46 |
| `no-spaced-arbitrary-value`: a space inside `[…]` (`grid-cols-[1fr 2fr]`, a data-URI with spaces) — the class is never generated | 6.5 | P33 |
| `no-arbitrary-values`: `text-[#…]`, `rounded-[…]`, `shadow-[…]`, `text-[15px]`, `tracking-[…]` outside theme paths | 6.3 / 6.5 / 1.16 | P04 P33 P46 P47 |
| `no-raw-palette`: `bg-blue-600`, `text-zinc-900`, `border-slate-200` outside the kit (white/black allowed) | 6.3 / 6.5 / 1.16 | P04 P33 P46 P47 |
| `no-styles-outside-kit`: `cva()` / `tv()` in page or feature code | 1.15 / 1.16 | P04 P46 P47 |
| `variant-budget`: a kit component with more than 10 looks on one variant axis (`variantBudget` in the config) | 1.16 | P46 P47 |
| `no-arbitrary-spacing` (`allowNegative` option) | 2.7 / 2.8 | P28 P29 |
| `no-illegible-text`: font size < 12px only. Weight and translucency are judged at runtime by measured contrast | 6.4 | P11 |
| `no-scroll-rail` | 2.2 | P15 P16 |
| `no-arbitrary-z-index` | 5.3 | P14 P19 P22 |
| `no-transition-all` | 6.8 | — |
| `no-css-transition-on-motion` | 6.8 | P59 |
| `no-emoji` | 1.12 | P40 |
| `img-dimensions` | 2.13 | P43 |

### ui-audit

| Check | Guideline | Patterns |
|---|---|---|
| Look-alike names (`PricingCard2`, `CardNew`, `ButtonAlt`) next to an existing base | 1.16 | P47 |
| The same component name defined in several files | 1.16 | P47 |
| `*Button`/`*Card`/`*Badge`/`*Modal`/`*Input`… that does not render the kit component | 1.16 | P46 |
| Near-duplicate files (≥75% shared class vocabulary) | 1.16 | P47 |
| Same JSX block (≥5 elements, ≥4 styled) in several files: **copy** (≥90% same classes) or **drifted copy** (same structure, 40–90% same classes = same role, different look) | 1.16 | P46 P47 |
| New `components/ui` file not in the reviewed `kitFiles` | 1.16 | — |
| Stock shadcn theme: default primary, radius, Inter/Geist only, stock button variants (≥2 → error) | 6.11 | identity |

### Playwright (per route × widths × colour schemes)

| Check | Guideline | Patterns |
|---|---|---|
| No horizontal scroll / nothing outside the viewport (decorative bleed clipped by `body { overflow-x: hidden }` is fine) | 2.1 | P15 P16 |
| Controls stay inside the card they sit in, and no container clips them (corner-hung, scrolling and carousel content exempt) | 2.10 | P16 |
| No native controls in the DOM | 1.1 | P01 P03 P50 |
| Text ≥12px, legible weight, **measured** contrast ≥4.5:1 (≥3:1 large). Alpha is blended; `lab()`/`oklab()` are resolved via canvas. Gradient-filled text and text over images are reported as "check by eye" annotations, not failures | 6.4 | P11 P34 |
| Cards in a row: same radius and padding; same fill/border/shadow (one featured card may differ); offer cards (with price/CTA) equal height; CTAs and prices aligned; no double seams. Bento/masonry tiles without price/CTA may differ in height | 2.6 / 1.7 / 1.16 | P27 P46 P55 |
| Repeated rows keep column positions | 2.12 | P48 |
| Scroll containers not rounded | 5.1 | P21 |
| Inputs visible at rest (border ≥3:1 or distinct fill, on the input or on a wrapper that hugs it); the finding names the lightest edge that passes, so the fix does not overshoot | 1.9 | P09 |
| Button label readable on hover (≥3:1), measured against the pixels behind it when colours alone cannot tell (gradients, images, translucent pills over sibling layers); disabled controls exempt | 1.4 | P06 |
| Checkboxes, radios and switches look different when checked (not only a border colour); a switch's thumb sits inside its track, on the side its state says (disabled switches included) | 1.18 | — |
| Every width has navigation: hidden nav links come with a visible menu button | 3.5 | P10 |
| Every dropdown/menu/dialog trigger is opened: popup on-screen, content scrolls, header doesn't move, no overflow | 1.2 / 5.2 / 5.3 | P02 P18 P22 |
| Overlays that appear by themselves (cookie banner, toast, promo bar, chat bubble) appear and leave with motion; `animate-in` classes produce an animation | 6.12 | P59 |
| The open mobile menu: legible, uncovered, on-screen (hard); 44 px targets, full height or a dimming backdrop, a surface that matches the theme (soft) | 3.5 / 6.4 | P10 |
| **Site-wide:** every interactive element animates what it shows/hides/changes, both ways; the clicked control's state change transitions (soft); not-clicked controls listed | 6.12 | P59 |
| **Site-wide:** the open mobile menu's buttons match the site's CTAs (height, shape, font); an inset panel's corners match the cards (soft) | 3.5 / 1.3 / 1.16 | P04 P46 |
| Cookie settings replace the banner (one "Accept"), panel fits, its switches are drawn right; the banner is found by class/id, accessible name or text | 4.6 | P19 P18 |
| Cookie banner does not cover navigation | 4.6 | P57 |
| A page translated by the browser (text nodes swapped for `<font>`) survives its buttons and form submits; non-GET requests aborted during the check | 4.8 | P60 |
| One `h1`; `aria-current` on the active nav item; load at top; CLS < 0.1 | 3.3 / 3.5 / 3.8 / 2.13 | P26 P10 P52 P43 |
| Images ≥1.5× (target 2×) in real file pixels | 6.10 | P56 |
| Logo link hugs the logo | 1.11 | P58 |
| Nav items don't wrap; no covered text; underline only on links; visible focus (heuristic, `STRICT=0` → warnings) | 2.5 / 2.11 / 6.9 / 1.9 | P35 P49 P54 P09 |
| **Site-wide:** filled-button radii, button fonts (per variant) and heights, input heights/radii, card radii and full card styles counted across all pages against `consistency` limits | 1.3 / 1.16 | P04 P46 P47 |

## Still not automated

These need review or the design system itself:

- 1.13 badge placement
- 3.1 / 3.4 / 3.7 layout groups, shell and footer structure, partly visible via site-wide consistency
- 4.1–4.3 error boundaries, skeletons, empty states (these need forced states)
- 4.4 wizard scroll
- 4.5 chart labels
- 6.7 payment-mark sizing
- Whether a design is *good*. The guardrails make it consistent and legible, not tasteful.

## Self-test

```bash
npm install && npm test        # RuleTester for every rule, Stylelint fixtures, runtime fixtures, end-to-end runs
npx eslint fixtures/bad.jsx    # 17 errors
npx eslint fixtures/good.jsx   # clean
```
