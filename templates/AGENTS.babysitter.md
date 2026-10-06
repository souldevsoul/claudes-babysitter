## Claude's Babysitter — required for every UI change

Hooks in `.claude/settings.json` run these checks automatically after each edit and before you finish; do not work around them.

Before you say a UI task is done:

1. Run `node tools/claudes-babysitter/bin/ui-check.mjs --changed --format agent`.
2. Fix every item it lists, then run it again. Repeat until it prints `Claude's Babysitter: clean.`
3. If the change is deployed to a preview, run the runtime check:
   `node tools/claudes-babysitter/playwright/prepare.mjs && npx playwright test -c tools/claudes-babysitter/playwright/playwright.config.ts`
4. For a human visual review, the user runs Babysitter Studio over the dev server: `{{RUN}} studio start --target http://localhost:3000`, then opens http://localhost:3001. Notes they pin on the page reach you as "Manual QA Feedback" — apply them.

End-to-end tests (`npm run test:e2e`):
- They cover three things in one run:
  - the rendered UI checks;
  - **business acceptance**: what the business side checks on every product;
  - the product's own journeys in `e2e/*.spec.ts`.
- **Every user-facing feature you build gets a journey test in `e2e/`, in the same change.** Import `test, expect, open` from `./babysitter`. The `user` fixture is a signed-in page. Assert what the user sees.
- Before you say a feature is done, run `BASE_URL=http://localhost:3000 npm run test:e2e` (add `LOGIN_EMAIL` / `LOGIN_PASSWORD` for signed-in pages) until it is green.
- Acceptance failures are business rules. Fix the product, do not skip the test:
  - **Controls:** every control comes from the kit (no default `select`, checkbox or number spinners); one corner radius and one colour palette across the site; `color-scheme: dark` on dark sites; the hand cursor on everything clickable; no hover effect on cards that cannot be clicked.
  - **Footer:** Terms, then Privacy; Cookie Policy then "Manage cookies" last; no logo on the © line; a company line; a support email on the site's domain; "We accept" Visa/Mastercard.
  - **Cookies:** Accept / Reject / Manage with per-category toggles; Analytics or Marketing only if such scripts really load.
  - **Money:** the chosen currency applies everywhere; no "≈"; no VAT/tax wording; thousands separators.
  - **Sign-in:** a password eye that Tab skips; one consent checkbox linking Terms and Privacy; sign-in pages have the site footer; a signed-in user is never offered Sign in; Sign out works with one click; settings offer two-factor sign-in and Delete account.
  - **Policies:** text spans its column; a sticky "On this page"; pages they name are links.
  - **Pages and content:** no build notes or self-justifying copy; no dead links; no `/gdpr`, `/press` or `/currency` page; no duplicate links or images; paged grids end on a full row.
- Owner decisions live in `babysitter.config.json` → `acceptance` (2FA, footer "Manage cookies", currencies, company line). Turning a check off needs `acceptance.skip` plus a reason in `acceptance.skipReasons`, approved by a human.

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
