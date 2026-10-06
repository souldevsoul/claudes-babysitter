# UI Architecture & Consistency Guidelines

**CRITICAL INSTRUCTION FOR AI AGENT:** Every rule below is mandatory. Each one exists because the bug it prevents was filed, repeatedly, by QA across the product fleet (source: Nexus, 58 recurring UI-consistency patterns). "MUST" and "NEVER" have no exceptions unless the rule names one. If a rule blocks the task, stop and ask; do not work around it.

Tags like `[P06]` reference the bug pattern IDs in `nexus-ui-consistency-bugs.json`; `[—]` marks a preventive rule with no recorded pattern.

**Definition of done for any UI change:** checked at 390px, 768px, 1280px and 1440px; no horizontal page scroll; every interactive element checked at rest, hover, focus-visible, active/selected and disabled.

---

## 1. Component architecture & UI-kit

1.1 **NEVER** use native `<select>`, `<input type="date">`, `<input type="checkbox">`, `<input type="radio">`, `<input type="file">`, `window.confirm()` / `alert()`, or a raw `<button>` in page or feature code. Use the project's UI-kit components only (`Select`, `DatePicker`, `Checkbox`, `RadioGroup`, `FileUpload`/dropzone, `Dialog`/`AlertDialog`, `Button`), built on Radix (or shadcn/ui on Radix). A styled native `<select>` is still forbidden: `appearance-none` only styles the closed box; the open list is drawn by the OS. `[P01, P03, P04, P20, P50]`

1.2 Every floating element (Select list, DropdownMenu, Popover, Tooltip, Combobox) **MUST** render in a Portal with collision detection and side-flipping (open upwards when there is no room below). It **MUST NOT** change the layout of its trigger's container. `[P02, P22]`

1.3 **NEVER** style a button with utility classes on a page (`className="bg-… rounded-… px-…"`). Use `<Button variant size>`. Missing look → add a variant to `Button`, never a one-off. `[P04]`

1.4 **NEVER** override a variant's interactive colours at the call site (`hover:bg-…`, `hover:text-…`, `focus:…` on a `<Button>`/`<Link>` that already has a variant). A variant's hover/active background and text colour are one pair; changing one of them is how text disappears on hover. Need a different hover → new variant. `[P06]`

1.5 Buttons with the same role in the same group (pricing cards, a row of tier CTAs, paired actions like "See / Hide") **MUST** use the same variant and size. Emphasis on one item is shown with a badge, border or ring on its card, never a different button variant. `[P05]`

1.6 Separate `Card` (static, no hover, no pointer) from `InteractiveCard` (link/button semantics, hover, focus-visible, active). Hover/lift classes **NEVER** go on non-interactive blocks. `[P07]`

1.7 Hover and selected states on items in a grid **MUST** be drawn with `outline`/`ring`/`box-shadow` (or the card's full own border), never by recolouring borders that are shared or removed between neighbours. Grid lines have one owner: the container (`gap-px` over a background, or `divide-*`), **NEVER** per-cell borders with sides removed by hand (double seams, missing edges). `[P08, P55]`

1.8 Selectable options (plan cards, session types, filter chips) **MUST** have a `selected` style from a token that is clearly distinct (solid border/ring + background or check icon), not an opacity tweak of the default border. `[P10]`

1.9 Inputs: at rest the border **MUST** meet 3:1 contrast against its background. Aim for just above 3:1 (the check names the lightest passing edge): a near-black edge passes too but reads harsh — it **SHOULD NOT** go much darker than needed. Keep it in one theme token. Exactly one focus ring per field, on one element (the wrapper OR the input, never both). Errors: destructive ring + message under the field. `[P09]`

1.10 DatePicker: use the UI-kit calendar; constrain its width (`max-w-sm`-ish); unavailable dates use a dedicated `disabled` style (strikethrough or ≤40% + `cursor-not-allowed` + `aria-disabled`), visibly different from available ones. If a native date control is ever unavoidable, set `color-scheme` to match the theme. `[P03]`

1.11 One `Logo` component is the only way to render the brand mark (header, footer, auth, emails). **NEVER** redraw it with divs/text. Its SVG `viewBox` **MUST** contain all paths including stroke width (no clipping). A page renders the logo once: if the layout renders it, the page does not. Favicon, apple-touch and PWA icons are generated from the same Logo source; boilerplate icons **MUST** be deleted. The logo link wraps the mark only (`inline-flex`, sized to the logo); **NEVER** a block or stretched flex item. `[P25, P51, P58]`

1.12 Icons come from one library (e.g. Lucide). **NEVER** OS emoji as UI icons, labels or list bullets, including in seeded/demo data. A product whose brand voice uses emoji may opt out explicitly (`allow.emoji` in `ui-guardrails.config.json`, with a reason). `[P40]`

1.13 Badges straddling a card edge ("Popular", "Best value"): the card **MUST NOT** clip them (`overflow-visible` on the card, or the badge rendered outside the clipped layer). Position is one rule for the whole product (centred on the top edge). Two badges on one card **MUST NOT** overlap. `[P24]`

1.14 Auth/system screens from libraries (sign-out confirmation, error, verify pages of Auth.js etc.) **MUST NEVER** be shown to users. Route them to the product's own pages built with the UI-kit and the product layout. `[P20]`

1.15 UI-kit components (`Select`, `Card`, `Input`, `Badge`, `Dialog`…) accept **only** variant/size props for their look. At the call site `className` may carry layout only (margin, width, grid/flex placement); **NEVER** radius, border, colour, padding, font or shadow. A missing look is a new variant in the component. `[P46]`

1.16 One role = one component everywhere. Stat tiles, feature blocks, pricing cards, plan cards and list rows with the same role **MUST** be the same component (same background, alignment, typography) on every page and section; **NEVER** rebuild a block of an existing role with local markup, define the same component in several files, create look-alikes (`XCard2`, `NewX`) or wrappers that only forward props to a kit component — a new look is a new variant of the existing component. `[P05, P47]`

1.17 A disabled control **MUST** say why: helper text next to it or the blocking field highlighted (e.g. "Accept the terms to continue" under a disabled Register), plus `aria-disabled` / `aria-describedby`. **NEVER** a silently greyed-out button. Errors on submit name the field and the reason. `[P44]`

1.18 Every interactive element is a **reusable kit component — exactly one per role per site**, built once in `components/ui` and used everywhere, animated in and out. Roles: **dropdown** (one component for the `<select>` replacement *and* action/user menus *and* multi-pick filters — select / menu / multi are modes of it, one look, one motion), **modal** (dialog, confirm, sheet, drawer are variants of one component), **button**, **input**, **textarea**, **checkbox**, **radio**, **switch**, **toast**, **tooltip**, **popover**, **disclosure** (accordion / collapsible), **tabs**. A second implementation of any role — `dropdown-menu.tsx` next to `select.tsx`, `pill-button.tsx` next to `button.tsx`, `sheet.tsx` next to `dialog.tsx` — is a defect: merge it into the one component as a variant. Page and feature code **NEVER** creates or restyles an interactive element: no headless-library imports (Radix, Base UI, Headless UI, Ariakit, vaul…), no hand-built ones (`{open && <div>…}`, `openKey === key && …`, `hidden={!open}`, native `<details>`, `<dialog>`, `popover=`), no raw `<button>`, `<input>`, `<textarea>`, no link dressed as a button — only the existing kit components; a missing look or behaviour is a new variant of the existing component, never a new component. `[P01, P04, P59]` (`ui/kit-interactive`, `ui/no-native-controls`, `ui/no-adhoc-button`)

## 2. Layout, grids & responsive behaviour

2.1 **NEVER** horizontal scroll of the page at any width. No exceptions. `[P15, P16]`

2.2 **NEVER** horizontal scrollers for navigation or content lists (chip rows, tab rows, section menus, card rails, `min-w-max`, `snap-x` rails). Below the breakpoint where the full row fits, replace it: a section menu → `Select`/burger section menu; cards → stacked grid. A carousel is allowed only for media galleries, with visible controls, and only when the project declares it (`allow.rails`); the page itself still never scrolls horizontally (2.1). `[P15]`

2.3 Tables **MUST** have a mobile representation: below 640px render rows as stacked blocks (label + value). `overflow-x-auto` is a last resort for genuinely wide data tables in signed-in admin views only, and then inside the table's own container, never the page. `[P16]`

2.4 Table alignment: text columns left, numeric/money columns right, header cells aligned exactly like their column (header row uses the same grid template **and the same gap** as body rows). The last column keeps a right gutter; no single column may take all spare width. `[P17]`

2.5 Any user-supplied or translated text in a constrained place (header, nav, pills, buttons, table cells, cards) **MUST** have a width limit and an overflow rule (`truncate` + full text in `title`, or `line-clamp-N`). Navigation **MUST** be checked with the longest supported locale; if it does not fit, items move into the menu, they never wrap to two lines. `[P13, P35]`

2.6 Cards in a row **MUST** be equal height: `h-full flex flex-col` on the card, `mt-auto` on the bottom block (price/CTA/divider). Rows use `items-stretch`, never `items-start`, for card grids. `[P27]`

2.7 Spacing comes only from tokens: section padding from one shared section token (desktop ≤ 96px per side, mobile ≤ 72px), gaps from the spacing scale. **NEVER** arbitrary values (`mt-[73px]`), negative margins to fix overlap, or `lg:*-0` utilities that zero spacing in another layout. Intentional overlapping compositions (editorial layouts) may use negative margins when the project declares `allow.negativeMargins`. `[P28, P29]`

2.8 `gap` only spaces direct children: when a wrapper (`<form>`, fragment-turned-div) sits between the flex/grid parent and the items, the wrapper **MUST** carry the layout (`flex flex-col gap-*`). Every page **MUST** keep bottom padding before the footer, and the footer has its own top margin; no block may touch another. `[P29]`

2.9 Content in a column that stretches to its neighbour's height starts at the top; **NEVER** vertically centre a panel inside a stretched column (creates empty bands). `[P28]`

2.10 Mobile header: below 768px the horizontal nav is replaced by a burger menu that contains every nav item and every account action (Profile, Sign out, Sign in/Sign up). **NEVER** hide nav without a replacement. The reverse also holds: every action in the mobile menu (Sign out, Profile…) **MUST** also be reachable on desktop. Check both breakpoints for action parity. `[P12, P54]`

2.11 Nothing overlaps. Content **MUST** be offset by the height of any fixed/sticky header (`padding-top: var(--header-h)` on the main wrapper); text containers grow with their content (**NEVER** a fixed `height` on a box containing text); `absolute` elements (badges, decorations) **MUST NOT** sit over flowing text. Verify with the longest locale and at 390px. `[P24, P49]`

2.12 Repeated rows (price lists, cost tables, spot rows, label/value lists) use one shared `grid-template-columns` for every row, **NEVER** `flex justify-between` whose positions depend on text length. Grid column counts **MUST** divide the item count, or the incomplete last row follows one product-wide rule (centred). `[P17, P48]`

2.13 No layout shift on load. Every async block reserves its final size (skeleton or `min-height` of the expected content) so nothing below it — including the footer — moves when it arrives. Images and media always have explicit width/height or `aspect-ratio`. `[P43]`

## 3. Navigation & routing shells

3.1 Every route renders inside a product layout group (`(marketing)/layout.tsx`, `(app)/layout.tsx`, `(auth)/layout.tsx`) that owns Header and Footer. **NEVER** leave boilerplate/template layouts, headers, footers or mega-menus in the repo; delete them. Legal pages use the same layout and typography as the rest of the site. `[P32]`

3.2 There is one `Header` component per product (with variants for marketing/app), not separate hand-built headers per zone. Same for `Footer`. `[P12, P36]`

3.3 Page titles: exactly one source. Either the layout renders `PageHeader` from route metadata, or the page does; never both. `[P25, P26]`

3.4 Signed-in pages share one shell: same background, container width, padding and `PageHeader` (icon, title, description). **NEVER** a per-page container or title style. `[P31]`

3.5 Active state: every nav (header, burger, sidebar, tabs, section menu) **MUST** mark the current item with a distinct `selected` style and `aria-current="page"`, matching `usePathname()` exactly or as a nested route (`pathname === href || pathname.startsWith(href + "/")`); **NEVER** a bare prefix match (`/` must not match everything). `[P10]`

3.6 Sticky elements: the header height is a CSS variable (`--header-h`). Every sticky element below it uses `top: var(--header-h)` (stacked offsets add up), and every anchor target has `scroll-margin-top` equal to the total sticky height. **NEVER** a sticky element that can slide under another. A hide-on-scroll header **MUST** ignore overscroll (negative `scrollY`, `overscroll-behavior-y: none` on the root) and always reappear on upward scroll. `[P14, P53]`

3.7 Footer structure is fixed for the product: brand/contact block, labelled link groups (product, company, legal), cookie control in the legal group. Links are a grid of groups, **NEVER** one flex-wrap row; the company block never merges with link columns. `[P36]`

3.8 Navigation to a new page **MUST** start at the top (the router's default scroll-to-top is never disabled, and pages never auto-scroll to a block on load). Only browser back/forward restores the previous scroll position. `[P52]`

## 4. State, errors & interactions

4.1 Wrap complex blocks (generation, charts, editors) in Error Boundaries; local errors use non-blocking toasts. A DOM error **MUST NOT** crash the page. `[—]`

4.2 Loading of content blocks uses skeletons shaped like the content. `[—]`

4.3 Every list/table/dashboard with no data renders `EmptyState` (icon, description, CTA). Lists longer than one screen paginate. `[—]`

4.4 Multi-step flows: on every step change scroll the step container into view (`ref.scrollIntoView({ block: "start" })`), and after submit scroll to / show the result. **NEVER** leave the viewport where the button was. `[P42]`

4.5 Charts: a label is drawn only if its measured text width fits the shape; otherwise hide it and expose it in a tooltip. **NEVER** decide by shape size alone. `[P41]`

4.6 Cookie consent: banner and preferences panel are one component with one state. Opening preferences hides the banner; closing preferences after a saved choice closes everything; there is never more than one consent surface (or two "Accept" buttons) on screen. While the banner is visible the page gets bottom padding equal to its height, and it **NEVER** covers navigation, the mobile menu or account actions (Sign out). `[P19, P57]`

## 5. Layers, overflow & scrollbars

5.1 Never put `border-radius` and scrolling on the same element: rounded frame `overflow-hidden rounded-*` on the parent, `overflow-y-auto` on an inner wrapper. This applies to scroll containers only; **NEVER** add `overflow-hidden` to a card just in case — a card with an edge badge keeps the badge outside the clipped frame (rule 1.13). `[P21, P24]`

5.2 Dialogs/Drawers/panels: fixed header and footer, body `flex-1 min-h-0 overflow-y-auto`, panel `max-h-[100dvh-…]`. A max-height **MUST NEVER** be smaller than the content without the body scrolling. `[P18]`

5.3 One z-index scale in the theme (e.g. header 30, dropdown 40, sticky subnav 35, modal 50, toast 60). **NEVER** literal z-index values in components. `[P14, P19, P22]`

5.4 Custom CSS **NEVER** sets `position`, `display` or `z-index` on classes that are combined with Tailwind positioning utilities. `[P22]`

## 6. Styling, theming & assets

6.1 All custom CSS lives inside `@layer base | components | utilities` (or CSS Modules). **NEVER** unlayered CSS: unlayered rules beat Tailwind v4 utilities (`button, a { border-radius: inherit }` silently overrode every radius on a site). `[P04, P22]`

6.2 **NEVER** unscoped global class names that a route can share with another (`.title`, `.band`, `.rt-*`); route/zone styles are CSS Modules or scoped under a zone root class. Component styles live with the component, not in one page-level stylesheet. `[P23, P30]`

6.3 Colour tokens **MUST** be defined so opacity modifiers work (`--paper: 245 240 230;` + `rgb(var(--paper) / <alpha-value>)`, or Tailwind v4 `@theme` colours). After adding a token, verify that `bg-token/80` actually generates CSS. `[P38]`

6.4 Text legibility floor: body and navigation text ≥ 12px; weight ≥ 400 below 16px and ≥ 300 from 16px (display type ≥ 24px is free; a brand built on light weights may declare `allow.lightWeights`); no `opacity-*` on text; every text **MUST** measure ≥ 4.5:1 contrast against its actual background (≥ 3:1 for large text). Translucent colour tokens are allowed — the measured contrast decides, not the notation. Font weights used **MUST** be ones actually loaded; never request a weight the font file does not have. `[P11, P34]`

6.5 Typography comes from text-style tokens (e.g. `text-label`, `text-body-sm`, `text-heading-2`). **NEVER** ad-hoc stacks like `font-mono text-[0.65rem] uppercase tracking-widest`; an element next to others of the same role uses the same style. No element is left unstyled to fall back to the page default. Headings use `text-wrap: balance` and a heading measure (never the 60–70ch body measure); short labels and badges use `whitespace-nowrap` (or wrap without letter-spaced orphans); centred text stays centred when it wraps. Check at 390px for orphans. `[P33, P45]`

6.6 Glass/translucent surfaces use one shared class: background fill + `backdrop-blur`. **NEVER** SVG/CSS filters (`filter`, displacement) on panels that contain text or UI. `[P38, P39]`

6.7 Payment marks (Visa, Mastercard…) use one component with one fixed height for all marks. `[P37]`

6.8 Interactive elements transition only the properties that change (`transition-colors`, `transition-[transform,box-shadow]`, 150–200ms). **NEVER** `transition-all`. `[—]`

6.9 Link affordance is exclusive: underline and link colour are used **only** on real links/buttons; **NEVER** underline or link-colour decorative or static text. Every underlined text **MUST** navigate or act. `[P54]`

6.10 Raster assets **MUST** be at least 2× their largest rendered CSS size (full-bleed images ≥ 2560px on the long edge); logos, payment marks and icons **MUST** be SVG. **NEVER** upscale a raster in layout. `[P56]`

6.11 Consistency inside a product, difference between products. The UI-kit **MUST** be themed for the product: its own primary colour, radius, type pairing and button variants. Shipping the stock shadcn/ui theme (default `--primary`, `--radius`, Inter/Geist only, stock button variants) is a defect. Product identity lives in tokens, fonts and kit variants — never in hard-coded values at call sites: no raw palette hues (`bg-blue-600`) or literal colours/radii/shadows in pages or component CSS, no `cva()` variant factories outside the kit. Expressive effects (blur, glow, gradient text, light display weights, overlapping compositions) are allowed; legibility is judged by measured contrast. `[—]`

6.12 Overlays — select lists, menus, popovers, dialogs, drawers, tooltips — **MUST** animate in **and** out: opacity plus a small scale (0.95→1) or a 4–8px slide, 120–200ms, ease-out on enter and ease-in on exit; nothing blinks in or out. Under `prefers-reduced-motion` the motion goes (`motion-reduce:animate-none`, or opacity only). The utilities must exist in the project: `animate-in` / `fade-in-0` / `zoom-in-95` need `tw-animate-css` (or `tailwindcss-animate`) — classes that compile to nothing are not motion. This holds however the overlay is built: a hand-made `{open && <div className="absolute …">}` unmounts in one frame and can never animate out — use the kit's DropdownMenu / Popover / Select, or keep it mounted and animate both ways (data-state + transition, or framer-motion's AnimatePresence). Exit classes only count if the library plays them: Radix Select before 2.3.0 unmounts the list at once. Disclosures that expand in place — accordion items, collapsibles, "show more" — **MUST** animate their height both ways too (`animate-accordion-down` / `animate-accordion-up`, or a `grid-template-rows: 0fr → 1fr` transition); tab panels **SHOULD** cross-fade. Checked statically and measured in the browser (every trigger is opened and closed, frame by frame; in-place panels are found through `aria-controls` or as the box that appears next to the trigger). `[P59]` (`ui/overlay-motion`, rendered check "overlay motion")
