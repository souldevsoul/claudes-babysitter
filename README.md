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
# in your project
npx github:souldevsoul/claudes-babysitter init . --dev-url http://localhost:3000 --ci
```

`init` vendors the tool into `tools/claudes-babysitter`, writes `babysitter.config.json`, adds the Claude Code hooks to `.claude/settings.json`, the agent rules to `CLAUDE.md`/`AGENTS.md`, the git pre-commit gate and (with `--ci`) a GitHub Actions workflow. Then it reports the theme verdict, contrast, look-alikes and existing debt. It is safe to re-run.

```bash
npx github:souldevsoul/claudes-babysitter check --changed --format agent   # what a generator sees
npx github:souldevsoul/claudes-babysitter audit .                           # reuse + theme audit
npx github:souldevsoul/claudes-babysitter fingerprint . --register          # theme fingerprint / look-alikes
npx github:souldevsoul/claudes-babysitter micro-check --url http://localhost:3000 --routes /,/pricing
```

Or install it as a dev dependency: `npm i -D github:souldevsoul/claudes-babysitter`. Then use `npx babysitter …`, and `import ui from "claudes-babysitter/eslint"` / `"claudes-babysitter/stylelint"` in your own configs.

## Layout

| Path | What |
|---|---|
| `bin/` | CLI: `babysitter` (init, check, audit, fingerprint, micro-check), Claude Code hooks, git pre-commit hook |
| `lib/` | Colour/contrast maths, theme tokens and fingerprints, component graph, roles, registry, shared token definitions |
| `rules/eslint/` | ESLint plugin (18 `ui/*` rules) |
| `rules/stylelint/` | Stylelint plugin and config |
| `playwright/` | Runtime checks, full spec, login + crawl |
| `templates/` | Config, CI workflow, agent instructions, Claude settings |
| `docs/` | The guidelines the rules enforce |
| `test/`, `fixtures/` | `npm test`: RuleTester, Stylelint fixtures, end-to-end cases |

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
| `no-auth-library-pages` | 1.14 | P20 |
| `no-adhoc-button`: *clickable* element with fill/border + padding + radius | 1.3 / 1.5 | P04 P05 |
| `no-visual-classname-override`: visual/state classes, `style`, or variable `className` on kit components | 1.3 / 1.4 / 1.15 | P04 P06 P46 |
| `no-thin-kit-wrapper`: `HeroButton = p => <Button {...p}/>` | 1.16 | P46 P47 |
| `no-inline-style`: colour/type/spacing/z-index in `style={{}}` (geometry and CSS variables are fine) | 1.15 / 6.5 / 5.3 | P22 P33 P46 |
| `no-arbitrary-values`: `text-[#…]`, `rounded-[…]`, `shadow-[…]`, `text-[15px]`, `tracking-[…]` outside theme paths | 6.3 / 6.5 / 1.16 | P04 P33 P46 P47 |
| `no-raw-palette`: `bg-blue-600`, `text-zinc-900`, `border-slate-200` outside the kit (white/black allowed) | 6.3 / 6.5 / 1.16 | P04 P33 P46 P47 |
| `no-styles-outside-kit`: `cva()` / `tv()` in page or feature code | 1.15 / 1.16 | P04 P46 P47 |
| `no-arbitrary-spacing` (`allowNegative` option) | 2.7 / 2.8 | P28 P29 |
| `no-illegible-text`: font size < 12px only. Weight and translucency are judged at runtime by measured contrast | 6.4 | P11 |
| `no-scroll-rail` | 2.2 | P15 P16 |
| `no-arbitrary-z-index` | 5.3 | P14 P19 P22 |
| `no-transition-all` | 6.8 | — |
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
| No native controls in the DOM | 1.1 | P01 P03 P50 |
| Text ≥12px, legible weight, **measured** contrast ≥4.5:1 (≥3:1 large). Alpha is blended; `lab()`/`oklab()` are resolved via canvas. Gradient-filled text and text over images are reported as "check by eye" annotations, not failures | 6.4 | P11 P34 |
| Cards in a row: same radius and padding; same fill/border/shadow (one featured card may differ); offer cards (with price/CTA) equal height; CTAs and prices aligned; no double seams. Bento/masonry tiles without price/CTA may differ in height | 2.6 / 1.7 / 1.16 | P27 P46 P55 |
| Repeated rows keep column positions | 2.12 | P48 |
| Scroll containers not rounded | 5.1 | P21 |
| Inputs visible at rest (border ≥3:1 or distinct fill) | 1.9 | P09 |
| Button label readable on hover (≥3:1) | 1.4 | P06 |
| Every dropdown/menu/dialog trigger is opened: popup on-screen, content scrolls, header doesn't move, no overflow | 1.2 / 5.2 / 5.3 | P02 P18 P22 |
| Cookie settings replace the banner (one "Accept"), panel fits | 4.6 | P19 P18 |
| Cookie banner does not cover navigation | 4.6 | P57 |
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
npm install && npm test        # RuleTester for 17 rules + Stylelint fixtures
npx eslint fixtures/bad.jsx    # 17 errors
npx eslint fixtures/good.jsx   # clean
```
