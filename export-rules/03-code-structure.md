# 03 — Architecture, style isolation and design tokens

> **How to use this file.** These are the structural rules behind the visual ones. A product
> that follows file 01 by hand, page by page, will drift back within a sprint; these rules are
> what keep it from drifting.
>
> The whole file rests on one boundary:
>
> > **`components/ui/` (the kit) owns every look. Everything outside it owns only layout and
> > content.**
>
> Each rule names the lint rule that enforces it (`ui/no-raw-palette`) where one exists, so a
> finding can be made automatic rather than argued.

---

## 1. The kit boundary

### 1.1 Where a look may be written

| Where | May define |
|---|---|
| `components/ui/**` (the kit) | colour, radius, border, shadow, padding, font, variants, motion |
| `app/globals.css`, the theme | tokens: colours, spacing scale, radii, z-index scale, text styles |
| everywhere else (pages, features, sections) | **layout only**: margin, width, grid/flex placement, order |

```jsx
// ❌ Нельзя — a look written in a page                     ui/no-styles-outside-kit
<div className="rounded-2xl border border-zinc-700 bg-[#12161D] p-6 shadow-lg">
  <h3 className="font-mono text-[0.65rem] uppercase tracking-widest">Starter</h3>
</div>

// ✅ Как надо — the look is a kit variant, the page places it
<Card variant="tier" className="col-span-1">
  <CardEyebrow>Starter</CardEyebrow>
</Card>
```

### 1.2 One component per role `[1.16, 1.18]` — `ui/kit-interactive`

One role = one component, defined **once**. Never:

- the same component defined in several files
- look-alikes: `XCard2`, `NewX`, `PillButton` beside `Button`, `Sheet` beside `Dialog`
- a block of an existing role rebuilt with local markup
- a wrapper that only forwards props to a kit component — `ui/no-thin-kit-wrapper`

```jsx
// ❌ Нельзя — a wrapper that adds nothing
export function PrimaryButton(props) { return <Button variant="primary" {...props} /> }

// ❌ Нельзя — a second implementation of a role that already exists
// components/ui/sheet.tsx  (next to dialog.tsx)

// ✅ Как надо — a variant of the one component
<Modal variant="sheet" side="right">…</Modal>
```

A missing look is **a new variant in the existing component**, never a new component.

### 1.3 Variant budget — `ui/variant-budget`

Variants are finite. When a component's variant list grows past the budget, the design has
drifted, not the code: go back to the design system before adding the next one.

---

## 2. No raw values anywhere

### 2.1 No raw palette hues — `ui/no-raw-palette`

Tailwind's stock palette is **not** a token.

```jsx
// ❌ Нельзя
<div className="bg-blue-600 text-slate-200 border-zinc-700">

// ✅ Как надо
<div className="bg-accent text-muted border-default">
```

### 2.2 No arbitrary values — `ui/no-arbitrary-values`, `ui/no-arbitrary-spacing`, `ui/no-spaced-arbitrary-value`

```jsx
// ❌ Нельзя
<div className="mt-[73px] rounded-[11px] text-[0.65rem] shadow-[0_2px_8px_rgba(0,0,0,.4)]">
<div className="grid grid-cols-[200px_1fr] gap-[18px]">        // spacing off the scale

// ✅ Как надо
<div className="mt-16 rounded-xl text-label shadow-card">
<div className="grid grid-cols-sidebar gap-4">                 // the template is a token
```

Spacing comes only from the scale; section padding from one shared section token (desktop
≤ 96 px per side, mobile ≤ 72 px). **NEVER** negative margins to fix overlap, and never
`lg:*-0` utilities that zero spacing in another layout `[2.7]`.

> A grid template like `grid-cols-[200px_1fr]` is the one arbitrary value worth a named token
> rather than a one-off: the same rail width appears on every page that has a rail, and a
> second page writing `[220px_1fr]` is exactly how two shells start drifting apart.

### 2.3 No inline styles — `ui/no-inline-style`

```jsx
// ❌ Нельзя — invisible to the theme, to dark mode and to every consistency check
<h2 style={{ color: "#FF3D8A", marginBottom: 12 }}>Delete account</h2>

// ✅ Как надо
<h2 className="h-section mb-3 text-destructive">Delete account</h2>
```

### 2.4 No CSS in JS literals — `ui/no-css-in-js-literals`

Colour, radius and shadow literals in constants are inline styles with extra steps.

```jsx
// ❌ Нельзя
const CARD = "#12161D", BORDER = "#3A4350", DIM = "#8B95A3"
<div style={{ background: CARD, border: `1px solid ${BORDER}` }}>

// ✅ Как надо — the token is defined once, in the theme
<Card>…</Card>
```

### 2.5 No dynamic class names — `ui/no-dynamic-classes`

Tailwind cannot see a class it never reads as a literal; it compiles to nothing.

```jsx
// ❌ Нельзя — `bg-lime-500` is never generated
<div className={`bg-${colour}-500 p-${size}`}>

// ✅ Как надо — whole class names, chosen by a map
const TONE = { ok: "bg-success", warn: "bg-warning", bad: "bg-destructive" }
<div className={TONE[tone]}>
```

### 2.6 No dead classes — `ui/no-dead-classes`

A class that compiles to nothing is not styling. This catches `animate-in` / `fade-in-0` /
`zoom-in-95` without `tw-animate-css` installed, utilities from a removed plugin, and typos.
**A class that generates no CSS is a defect, not a no-op.**

### 2.7 Tokens must support opacity `[6.3, P38]`

```css
/* ❌ Нельзя — bg-paper/80 generates nothing */
:root { --paper: #F5F0E6; }

/* ✅ Как надо */
:root { --paper: 245 240 230; }
/* tailwind: paper: "rgb(var(--paper) / <alpha-value>)"  — or Tailwind v4 @theme colours */
```

After adding a token, **verify `bg-token/80` actually generates CSS**.

---

## 3. CSS isolation

### 3.1 Everything is layered — `ui/require-layer` (stylelint) `[6.1, P04 P22]`

All custom CSS lives inside `@layer base | components | utilities`, or in CSS Modules.
Unlayered rules beat Tailwind v4 utilities.

```css
/* ❌ Нельзя — this silently overrode every radius on a whole site */
button, a { border-radius: inherit; }

/* ✅ Как надо */
@layer base {
  button, a { border-radius: inherit; }
}
```

### 3.2 No unscoped global class names `[6.2, P23 P30]`

```css
/* ❌ Нельзя — two routes will collide on these */
.title { … }
.band { … }
.rt-card { … }

/* ✅ Как надо — a CSS Module, or scoped under a zone root */
.pricing_title__x7f2 { … }            /* pricing.module.css */
.zone-admin .title { … }
```

Component styles live **with** the component, never in one page-level stylesheet.

### 3.3 Custom CSS never fights Tailwind positioning `[5.4, P22]`

Custom CSS **NEVER** sets `position`, `display` or `z-index` on classes that are combined with
Tailwind positioning utilities.

### 3.4 One z-index scale — `ui/z-index-scale` (stylelint) `[5.3]`

```css
/* ❌ Нельзя */
.dropdown { z-index: 9999; }

/* ✅ Как надо */
@layer components { .dropdown { z-index: var(--z-dropdown); } }
```

### 3.5 Token values only — `ui/token-values`, `ui/apply-values` (stylelint)

Declarations in custom CSS use theme variables, not literals — including inside `@apply`.

---

## 4. Typography as tokens `[6.5, P33 P45]`

Typography comes from text-style tokens (`text-label`, `text-body-sm`, `text-heading-2`).

```jsx
// ❌ Нельзя — an ad-hoc stack; the next element of the same role will differ
<span className="font-mono text-[0.65rem] uppercase tracking-widest text-zinc-500">

// ✅ Как надо
<span className="text-eyebrow">
```

- An element next to others of the same role uses the same style.
- **No element is left unstyled** to fall back to the page default.
- Headings use `text-wrap: balance` and a heading measure — never the 60–70ch body measure.
- Short labels and badges use `whitespace-nowrap`, or wrap without letter-spaced orphans.
- Centred text stays centred when it wraps.
- Check at 390 px for orphans.

**Two looks per heading level, and only two** `[6.5]`. The size and the face say which headings
are peers; a site with five h1 looks has lost the thread of which heading outranks which.
"Look" = family + weight + letter-spacing (in em) + case **as rendered** + size — so the same
token used once in capitals and once in sentence case is **two looks**.

```jsx
// ❌ Нельзя — one token, two looks: PageHero upper-cases, the auth shell does not
<h1 className="h-page">{title.toUpperCase()}</h1>     // "RELAYGPU PRICING"
<h1 className="h-page">{title}</h1>                   // "Sign in"

// ✅ Как надо — the case belongs to the token, decided once
<h1 className="h-page">{title.toUpperCase()}</h1>     // everywhere the console title is used
<h1 className="h-display">{post.title}</h1>           // the display headline: hero + article
```

---

## 5. Routing shells and layout ownership

| # | Rule | Tag |
|---|---|---|
| 5.1 | Every route renders inside a product layout group (`(marketing)/layout.tsx`, `(app)/layout.tsx`, `(auth)/layout.tsx`) that owns Header and Footer. Legal pages use the same layout and typography as the rest of the site. | `[3.1, P32]` |
| 5.2 | **Delete boilerplate.** No template layouts, headers, footers, mega-menus, starter favicons or demo pages left in the repo. | `[3.1, 1.11, 6.11]` |
| 5.3 | One `Header` component per product (variants for marketing/app), one `Footer`. Never hand-built headers per zone. | `[3.2, P12 P36]` |
| 5.4 | Page titles have exactly one source: either the layout renders `PageHeader` from route metadata, or the page does — **never both**. | `[3.3, P25 P26]` |
| 5.5 | Signed-in pages share one shell: same background, container width, padding and `PageHeader`. Never a per-page container or title style. | `[3.4, P31]` |
| 5.6 | The header height is a CSS variable (`--header-h`); sticky offsets add up from it; anchor targets carry `scroll-margin-top` equal to the total sticky height. | `[3.6, P14 P53]` |

---

## 6. Theming: identity lives in tokens `[6.11]`

Shipping the stock shadcn/ui theme — default `--primary`, default `--radius`, Inter/Geist only,
stock button variants — **is a defect**. The kit **MUST** be themed for the product: its own
primary colour, radius, type pairing and button variants.

```
❌ Нельзя
- raw palette hues or literal colours / radii / shadows in pages or component CSS
- `cva()` variant factories outside the kit
- the stock theme untouched

✅ Как надо
- product identity in tokens, fonts and kit variants
- expressive effects (blur, glow, gradient text, light display weights) are allowed —
  legibility is judged by measured contrast, not by notation
```

**Consistency inside a product, difference between products.** One accent colour per site
(CIELAB ΔE ≥ 30 between pages is drift) `[1.21]`. One brand mark: footer logo = header mark,
favicon hue within 40° of the mark, manifest name shares a word with the brand `[1.11]`.

---

## 7. Assets

| # | Rule | Tag |
|---|---|---|
| 7.1 | Raster assets are at least **2×** their largest rendered CSS size; full-bleed images ≥ 2560 px on the long edge. **NEVER** upscale a raster in layout. | `[6.10, P56]` |
| 7.2 | Logos, payment marks and icons are **SVG**. | `[6.10]` |
| 7.3 | Every `<img>` carries `width` + `height` or an `aspect-*` / `size` class — otherwise the layout shifts when it loads. Prefer the framework image component. | `[2.13, P43]` — `ui/img-dimensions` |
| 7.4 | Favicon, apple-touch and PWA icons are generated from the `Logo` source. A starter icon (create-next-app, CRA, Vite, Astro, Nuxt) or a file another product already ships is a defect. | `[6.11, 1.11]` |
| 7.5 | Icons come from one library; no OS emoji as UI, labels or bullets — including in seed data. | `[1.12]` — `ui/no-emoji` |

---

## 8. Data, mutations and forms

### 8.1 A mutation must change the page — `ui/mutation-refreshes-ui` `[FM5]`

A handler that sends a POST / PUT / PATCH / DELETE and then updates nothing on the page is a
finding.

```jsx
// ❌ Нельзя — the header still shows the old name
async function save() { await fetch("/api/account/name", { method: "POST", body }) }

// ✅ Как надо — any one of these counts
async function save() {
  await fetch("/api/account/name", { method: "POST", body })
  router.refresh()                    // or setState / revalidatePath / mutate /
}                                     // invalidateQueries / session update() / dispatch / onSaved()
```

Pure flags (`setLoading`, `setSaving`, `setError`, `setOpen`) do **not** count as an update.

### 8.2 Numeric fields are bounded — `ui/numeric-input-bounds` `[FM1]`

Any `input` / `Input` / `TextField` / `NumberInput` / `AmountInput` that is `type="number"`,
`inputMode="numeric|decimal"`, or named like amount / price / quantity / credits / IBAN / card
/ phone **MUST** be bounded, by any one of:

- both `min` and `max` on the element
- a zod/yup schema in the same file bounding the same key: `amount: z.number().min(1).max(20000)`
- `register("x", { min, max })`
- a clamp in the file: `Math.min` + `Math.max`, or `clamp(`

IBAN, card and phone need `maxLength` or `pattern`, or a schema `.max` / `.length` / `.regex`.
Out of scope: one-time codes, expiry, ZIP, search, ranges, always read-only or disabled fields.

**The bounds must also be printed next to the field** — a value refused with no stated range
is a finding of its own.

### 8.3 Form behaviour that the structure must support `[FM3, FM4, FM11, FM12]`

- A failed submit keeps every non-password value and says something. After a failed sign-in
  the password is cleared and the e-mail kept.
- A successful submit shows something within 2 s: new text, a toast, an `aria-live` message, a
  new URL, or the form going away.
- One failed submit shows **one** error — not a toast **and** an in-form message.
- A success message never shares the error message's styled look.
- Sign-up forms: one text field before the password says `autocomplete="username"` (never the
  name field); the e-mail field is `type="email"`; passwords say `new-password` on sign-up and
  `current-password` on sign-in.
- The account e-mail in settings is read-only unless the same box says a verification link
  will be sent.

---

## 9. Motion, statically checkable `[6.12]` — `ui/overlay-motion`, `ui/no-transition-all`, `ui/no-css-transition-on-motion`

- Every overlay has both enter **and** exit classes, and the library plays them.
- A hand-built `{open && …}` overlay cannot animate out: it is a structural defect, not a
  styling one.
- **Never `transition-all`** — name the properties.
- Never a CSS `transition` on an element whose motion is an animation (they fight).

---

## 10. Accessibility floor, in code

| # | Rule | Tag |
|---|---|---|
| 10.1 | No text below 12 px; weight ≥ 400 below 16 px, ≥ 300 from 16 px. | `[6.4]` — `ui/no-illegible-text` |
| 10.2 | No `opacity-*` on text. | `[6.4]` |
| 10.3 | Current nav item carries `aria-current="page"`. | `[3.5]` |
| 10.4 | A disabled control carries `aria-disabled` and `aria-describedby` pointing at the reason. | `[1.17]` |
| 10.5 | Unavailable dates carry `aria-disabled` and a dedicated disabled style. | `[1.10]` |
| 10.6 | No horizontal scroll rail for navigation or content. | `[2.2]` — `ui/no-scroll-rail` |

---

## 11. Explicit allowances

Everything above can be waived — **per project, in writing, visible in review**. Never by a
silent disable comment.

```jsonc
// babysitter.config.json
{
  "kit": ["Button", "Card", "StatTile"],          // the project's own kit components
  "uiKitPaths": ["**/components/ui/**"],
  "allow": {
    "rails": false,            // horizontal carousels for media galleries
    "emoji": false,            // a brand voice built on emoji
    "negativeMargins": false,  // editorial overlapping compositions
    "palette": false,          // raw Tailwind hues
    "lightWeights": false      // a brand built on light display weights
  }
}
```

```jsx
// ❌ Нельзя — invisible to review, and nobody will ever remove it
// eslint-disable-next-line ui/no-raw-palette

// ✅ Как надо — the allowance is declared once, with a reason, in config
```

---

## 12. Repository-level checklist

Run these before calling a codebase clean. **Always pass an explicit source path** (`src`,
`app`) — a bare search from the repository root walks build output and dependency trees and
can take minutes. Each should return nothing outside `components/ui/`; a hit inside a comment
is a false positive, so read the line before reporting it.

```bash
SRC=src          # or: SRC=app

# native controls and dialogs in page code
grep -rn --include='*.tsx' -E '<select[ >]|<input[^>]*type="(checkbox|radio|date|file|range)"|window\.(confirm|alert|prompt)|<details[ >]|<dialog[ >]|popover=' "$SRC" | grep -v '/components/ui/'

# headless libraries outside the kit
grep -rn --include='*.tsx' -E "from ['\"](@radix-ui|@headlessui|@ariakit|vaul|@base-ui)" "$SRC" | grep -v '/components/ui/'

# hand-built overlays
grep -rn --include='*.tsx' -E '\{ *[A-Za-z_]+ *&& *\(? *<div[^>]*(absolute|fixed)' "$SRC" | grep -v '/components/ui/'

# inline styles and colour literals
grep -rn --include='*.tsx' --include='*.ts' -E 'style=\{\{|#[0-9a-fA-F]{6}\b' "$SRC" | grep -v '/components/ui/'

# raw palette hues
grep -rn --include='*.tsx' -E '\b(bg|text|border|ring|fill)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}\b' "$SRC"

# arbitrary values
grep -rn --include='*.tsx' -E '\b[a-z-]+-\[[^]]+\]' "$SRC" | grep -v '/components/ui/'

# dynamic class strings (compile to nothing)
grep -rn --include='*.tsx' -E 'className=\{`[^`]*\$\{' "$SRC"

# transition-all
grep -rn --include='*.tsx' --include='*.css' 'transition-all' "$SRC"

# CSS outside @layer — read the file, these are the top-level rules
grep -n -E '^[.#a-zA-Z\[*:][^{]*\{' "$SRC"/app/globals.css 2>/dev/null | head -40

# duplicate roles in the kit — expect one file per role, no *-2 / new-* / pill-* / sheet+dialog
ls "$SRC"/components/ui | sort
```

With `ripgrep` installed the same searches run faster, but **the path argument is still
required**: `rg -n --glob '*.tsx' '<pattern>' src`.

- [ ] One file per interactive role in `components/ui/`; no second implementation, no thin wrapper
- [ ] No native control, headless import or hand-built overlay outside the kit
- [ ] No inline style, colour literal, raw palette hue or arbitrary value outside the kit
- [ ] No dynamic class strings; no class that compiles to nothing
- [ ] All custom CSS inside `@layer` or a CSS Module; no unscoped global class names
- [ ] One z-index scale, in the theme
- [ ] Colour tokens defined so `/<alpha>` works, and verified
- [ ] Typography from text-style tokens; ≤ 2 looks per heading level, case included
- [ ] One layout group owns Header and Footer; one source for page titles; boilerplate deleted
- [ ] The kit is themed for this product — not the stock shadcn defaults
- [ ] Every `<img>` has dimensions; logos and marks are SVG; rasters ≥ 2×
- [ ] Every mutation updates the page; every numeric field is bounded and states its range
- [ ] Every overlay has enter **and** exit; no `transition-all`
- [ ] Allowances declared in config with a reason — no `eslint-disable` comments
