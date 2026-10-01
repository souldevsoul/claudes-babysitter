## Claude's Babysitter — required for every UI change

Hooks in `.claude/settings.json` run these checks automatically after each edit and before you finish; do not work around them.

Before you say a UI task is done:

1. Run `node tools/claudes-babysitter/bin/ui-check.mjs --changed --format agent`.
2. Fix every item it lists, then run it again. Repeat until it prints `Claude's Babysitter: clean.`
3. If the change is deployed to a preview, run the runtime check:
   `node tools/claudes-babysitter/playwright/prepare.mjs && npx playwright test -c tools/claudes-babysitter/playwright/playwright.config.ts`

Order of work on a new product:
1. **Theme first.** Until the theme has its own primary colour, radius, fonts and button variants, every UI edit is blocked with "Сначала обнови тему (Theme First)".
2. **Contrast lives in the tokens.** When you change the theme, text/background, muted text/background and button text/button must each be ≥ 4.5:1, or the edit is blocked. Fix the token, never individual components.
3. **Then build pages from the kit.** If a dev server is configured, your changed pages are also opened in a headless browser before you finish: measured contrast, aligned cards in rows, no sideways scroll on mobile.

How to fix, not dodge:
- Build from `components/ui`. A new look = a new **variant/size** in the kit component + a **token** in the theme. Never restyle a kit component at the call site, never `style={{…}}` for colour/type/spacing, never hex/arbitrary values or raw palette hues (`bg-blue-600`) in `className`, never `cva()` outside `components/ui`, never literal colours/radii/shadows in component CSS — use `var(--token)`. Interpolated classes (`bg-${tone}-600`), class maps with arbitrary values, `@apply` with arbitrary values, styled-components/emotion with literal values and style objects passed by spread are all checked.
- A new shared component goes in `components/` (kit pieces in `components/ui/`), is exported, is used at least once, and must not repeat the role of an existing one (`StatCard` next to `StatTile` is blocked — add a variant).
- Before creating a component, search for an existing one with the same role (card, tile, row, badge, modal). Extend it; do not create `XCard2`, `NewX`, a wrapper that only forwards props, or copy a JSX block from another page — extract a component.
- Do not add `eslint-disable` for `ui/*` rules. A real exception goes into `babysitter.config.json` → `allow` with a reason, and is reviewed by a human.
- The product must keep its own identity: its own primary colour, radius, fonts and button variants. Consistency inside a product, difference between products.
- Distinctive design is welcome: blur/glow, gradient text, light display weights, overlapping layouts, galleries (if allowed in config). What is not welcome is the same role drawn differently on different pages.
