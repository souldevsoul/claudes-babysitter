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
```

> Use `npm run babysitter`, not a bare `npx babysitter`. The tool is vendored, not an npm dependency, so `npx babysitter` would download an unrelated package with that name from the registry.

Or install it as a dev dependency: `npm i -D github:souldevsoul/claudes-babysitter`. Then use `npx babysitter …`, which resolves to your installed copy, and `import ui from "claudes-babysitter/eslint"` / `"claudes-babysitter/stylelint"` in your own configs.

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
| Inputs visible at rest (border ≥3:1 or distinct fill); the finding names the lightest edge that passes, so the fix does not overshoot | 1.9 | P09 |
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
