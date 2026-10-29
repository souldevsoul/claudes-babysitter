# 01 — UI components, states and motion

> **How to use this file.** Every rule is mandatory. Each exists because the bug it prevents
> was filed repeatedly by QA across a fleet of products. **MUST** and **NEVER** have no
> exceptions unless the rule names one. If a rule blocks the task, stop and ask — do not work
> around it.
>
> Tags in brackets (`[1.18]`, `[P01]`, `[FM7]`) are the Babysitter rule IDs — quote them when
> you report a finding so the result can be traced back.
>
> **Definition of done for any UI change:** checked at 390 / 768 / 1280 / 1440 px; no
> horizontal page scroll at any width; every interactive element checked at rest, hover,
> focus-visible, active/selected and disabled.

---

## 1. Native controls are forbidden

### 1.1 The banned list `[1.1, 1.18, P01 P03 P04 P20 P50]`

**NEVER** use any of these in page or feature code:

| Banned | Use instead |
|---|---|
| `<select>` | the kit `Select` |
| `<input type="checkbox">` | the kit `Checkbox` |
| `<input type="radio">` | the kit `RadioGroup` |
| `<input type="date">` / `time` / `datetime-local` | the kit `DatePicker` |
| `<input type="file">` | the kit `FileUpload` / dropzone |
| `<input type="range">` | the kit `Slider` |
| bare `<button>`, `<input>`, `<textarea>` | `Button`, `Input`, `Textarea` |
| `<details>` / `<summary>`, `popover=`, `<dialog>` | `Disclosure`, `Dialog` |
| `window.confirm()`, `window.alert()`, `window.prompt()` | `AlertDialog` |

**A styled native control is still a native control.** `appearance-none` only paints the
closed box; the open list, the tick, the calendar and the file chooser are drawn by the
operating system and cannot be themed.

```jsx
// ❌ Нельзя — the dropdown that opens is the OS's, not yours
<select className="appearance-none rounded-lg border px-3 py-2">
  <option value="eur">EUR</option>
  <option value="usd">USD</option>
</select>

// ❌ Нельзя — a "styled" checkbox is still an OS checkbox
<input type="checkbox" className="h-4 w-4 accent-lime-500" checked={on} onChange={…} />

// ❌ Нельзя
if (window.confirm("Delete this endpoint?")) remove(id)
```

```jsx
// ✅ Как надо
<Select value={currency} onValueChange={setCurrency}>
  <SelectTrigger><SelectValue /></SelectTrigger>
  <SelectContent>
    <SelectItem value="eur">EUR</SelectItem>
    <SelectItem value="usd">USD</SelectItem>
  </SelectContent>
</Select>

<Checkbox checked={on} onCheckedChange={setOn} id="terms" />

<AlertDialog>
  <AlertDialogTrigger asChild><Button variant="destructive">Delete</Button></AlertDialogTrigger>
  <AlertDialogContent>…</AlertDialogContent>
</AlertDialog>
```

**Exception, and the only one:** a native control is allowed inside the kit component that
replaces it (a visually hidden `<input type="checkbox">` under a custom box is correct — it is
how the kit gets keyboard and form semantics). The ban is on page and feature code.

**If a native date control is genuinely unavoidable** (rare), set `color-scheme` so the OS
widget matches the theme `[1.10, P03]`.

### 1.2 One component per role, for the whole site `[1.18, 1.16, P01 P04 P47 P59]`

Every interactive element is a **reusable kit component — exactly one per role per site**,
built once in `components/ui/` and used everywhere.

The roles: **dropdown** (the `<select>` replacement *and* action/user menus *and* multi-pick
filters — select / menu / multi are modes of one component, one look, one motion), **modal**
(dialog, confirm, sheet, drawer are variants of one component), **button**, **input**,
**textarea**, **checkbox**, **radio**, **switch**, **toast**, **tooltip**, **popover**,
**disclosure** (accordion / collapsible), **tabs**.

A second implementation of any role is a defect:

```
❌ Нельзя                                  ✅ Как надо
components/ui/select.tsx                   components/ui/dropdown.tsx
components/ui/dropdown-menu.tsx              └─ mode="select" | "menu" | "multi"
components/ui/combobox.tsx

components/ui/dialog.tsx                   components/ui/modal.tsx
components/ui/sheet.tsx                      └─ variant="dialog" | "sheet" | "confirm"
components/ui/confirm-modal.tsx

components/ui/button.tsx                   components/ui/button.tsx
components/ui/pill-button.tsx                └─ variant="pill"
```

Page and feature code **NEVER** creates or restyles an interactive element:

```jsx
// ❌ Нельзя — a hand-built dropdown: no portal, no collision flip, cannot animate out
{open && (
  <div className="absolute top-full left-0 z-50 rounded-lg border bg-black p-2">
    {options.map(o => <div key={o} onClick={() => pick(o)}>{o}</div>)}
  </div>
)}

// ❌ Нельзя — a headless library imported in page code
import * as Popover from "@radix-ui/react-popover"

// ❌ Нельзя — a link dressed as a button
<a href="/signup" className="rounded-lg bg-lime-400 px-4 py-2 font-bold">Create account</a>

// ❌ Нельзя — a wrapper that only forwards props
export function PrimaryButton(p) { return <Button variant="primary" {...p} /> }
```

```jsx
// ✅ Как надо
<Dropdown mode="menu" trigger={<Button variant="ghost">Account</Button>}>…</Dropdown>

<Button asChild><Link href="/signup">Create account</Link></Button>
```

Other shapes that count as "hand-built" and are banned: `openKey === key && …`,
`hidden={!open}`, `if (!open) return null` in front of a fixed/absolute or `role="dialog"`
overlay.

**A missing look or behaviour is a new variant of the existing component, never a new
component.**

### 1.3 Library screens never reach a user `[1.14, P20]`

Auth.js / NextAuth / Clerk default pages (sign-out confirmation, error, verify) **MUST NEVER**
be shown. Route them to the product's own pages, built with the kit and the product layout.

---

## 2. The call site may not restyle the kit

### 2.1 `className` carries layout only `[1.15, P46]`

Kit components accept **only** variant/size props for their look. At the call site
`className` may carry margin, width, grid/flex placement — **NEVER** radius, border, colour,
padding, font or shadow.

```jsx
// ❌ Нельзя
<Button className="rounded-full bg-emerald-600 px-8 py-4 text-lg shadow-lg">Top up</Button>
<Card className="rounded-2xl border-2 border-cyan-500 p-10">…</Card>

// ✅ Как надо
<Button variant="primary" size="lg" className="w-full sm:w-auto">Top up</Button>
<Card variant="feature" className="col-span-2">…</Card>
```

### 2.2 Never override a variant's interactive colours `[1.4, P06]`

A variant's hover/active background and text colour are **one pair**. Changing one of them is
how text disappears on hover.

```jsx
// ❌ Нельзя — the variant's hover text colour is still white; now white on white
<Button variant="primary" className="hover:bg-white">Continue</Button>

// ✅ Как надо — a new variant in the kit, with both halves of the pair
<Button variant="inverse">Continue</Button>
```

### 2.3 Same role, same variant `[1.5, P05]`

Buttons with the same role in one group (pricing-card CTAs, a row of tier buttons, paired
"See / Hide") **MUST** use the same variant and size. Emphasis on one item is a badge, border
or ring **on its card** — never a different button variant.

```jsx
// ❌ Нельзя
<Button variant="ghost">Choose Starter</Button>
<Button variant="primary" size="lg">Choose Pro</Button>   {/* "popular" tier */}
<Button variant="ghost">Choose Max</Button>

// ✅ Как надо — one variant; the emphasis lives on the card
<Card className="ring-2 ring-accent"><Badge>Most popular</Badge>…<Button variant="primary">Choose Pro</Button></Card>
```

### 2.4 Interactive and static are different components `[1.6, 1.7, P07 P08 P55]`

`Card` is static — no hover, no pointer. `InteractiveCard` has link/button semantics, hover
and focus-visible. Hover/lift classes **NEVER** go on a non-interactive block.

Hover and selected states in a grid are drawn with `outline` / `ring` / `box-shadow` or the
card's own full border — **never** by recolouring borders that neighbours share.
Grid lines have one owner: the container (`gap-px` over a background, or `divide-*`), **NEVER**
per-cell borders with sides removed by hand.

---

## 3. States — every one of them

### 3.1 The five states `[definition of done]`

Every interactive element is checked at **rest, hover, focus-visible, active/selected,
disabled**. A missing state is a finding.

### 3.2 Hover must change something `[1.6, hoverFeedback]`

A button or button-styled link whose computed look does not change on hover (self,
`::before`/`::after`, first 14 descendants) is **hard**. Accordion questions and clickable
cards that do not react are soft.

Hover **MUST NOT** make an even edge uneven or move the card ≥ 2 px `[1.6, Kindred 1rto89]`.

```css
/* ❌ Нельзя — the row grows 2px and the whole grid jumps */
.card:hover { border-width: 3px; }

/* ✅ Как надо — the box keeps its size */
.card:hover { box-shadow: 0 0 0 1px var(--accent); background: var(--surface-hover); }
```

### 3.3 Focus `[1.9, 6.9, P09, Compass h59hxv]`

Exactly **one** focus ring per field, on **one** element — the wrapper **OR** the input, never
both. On a framed field (a box drawn by the wrapper) the ring goes on the frame, not on the
inner `<input>`.

```jsx
// ❌ Нельзя — two rings, and the inner one sits inside the frame
<div className="rounded-lg border focus-within:ring-2">
  <input className="focus:ring-2 focus:outline-none" />
</div>

// ✅ Как надо
<div className="rounded-lg border focus-within:ring-2 focus-within:ring-accent">
  <input className="outline-none" />
</div>
```

### 3.4 Selected `[1.8, 3.5, P10]`

Selectable options (plan cards, session types, filter chips) **MUST** have a `selected` style
from a token that is clearly distinct — solid border/ring plus background, or a check icon —
**not** an opacity tweak of the default border.

Every navigation (header, burger, sidebar, tabs, section menu) **MUST** mark the current item
with a distinct style **and** `aria-current="page"`, matched as
`pathname === href || pathname.startsWith(href + "/")` — **NEVER** a bare prefix match, which
makes `/` match everything.

Site-wide: the current item has a look its siblings do not, and **no** non-current item wears
the current item's highlight.

### 3.5 Disabled must say why `[1.17, P44]`

**NEVER** a silently greyed-out button.

```jsx
// ❌ Нельзя
<Button disabled>Register</Button>

// ✅ Как надо
<Button disabled aria-disabled aria-describedby="why">Register</Button>
<p id="why" className="text-sm text-muted">Accept the terms to continue.</p>
```

The same holds for an action the balance cannot pay for `[FM6]`: before the click, either the
price and the shortfall are stated, or a "not enough credits / top up" note sits next to the
button. A disabled button with no reason is **hard**.

### 3.6 The hand cursor `[H2, BQA 3]`

Everything clickable shows `cursor: pointer`. A card that does nothing on click has **no**
hover effect `[H1]`.

---

## 4. Motion — in and out, both ways

### 4.1 Overlays animate in **and** out `[6.12, P59]`

Select lists, menus, popovers, dialogs, drawers, tooltips **MUST** animate both ways:
opacity plus a small scale (0.95 → 1) or a 4–8 px slide, **120–200 ms**, ease-out on enter,
ease-in on exit. **Nothing blinks in or out.**

```jsx
// ❌ Нельзя — unmounts in one frame; there is no exit animation to play
{open && <div className="absolute animate-in fade-in-0">…</div>}

// ✅ Как надо — the library keeps it mounted through the exit
<DropdownMenuContent
  className="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95
             data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
>…</DropdownMenuContent>
```

Three traps this check catches:

1. **Classes that compile to nothing are not motion.** `animate-in` / `fade-in-0` /
   `zoom-in-95` need `tw-animate-css` (or `tailwindcss-animate`) installed. Verify the
   utility generates CSS.
2. **Exit classes only count if the library plays them.** Radix `Select` before 2.3.0
   unmounts the list at once — the exit classes never run.
3. **A page that 404s or 500s for lack of data is not "out of scope".** Seed it until it
   renders, then open every overlay on it.

### 4.2 Disclosures animate their height `[6.12]`

Accordion items, collapsibles and "show more" **MUST** animate open and closed —
`animate-accordion-down` / `animate-accordion-up`, or a `grid-template-rows: 0fr → 1fr`
transition. Tab panels **SHOULD** cross-fade.

```css
/* ✅ Как надо — height animation without a measured pixel height */
.panel { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 180ms ease-out; }
.panel[data-state="open"] { grid-template-rows: 1fr; }
.panel > div { overflow: hidden; }
```

### 4.3 Overlays nobody opened `[6.12]`

A cookie/consent banner, a toast, a promo bar, a chat bubble appear **and leave** (on Accept /
Reject / Close) with motion, not in one frame.

### 4.4 Everything a click changes `[6.12]`

Whatever a click shows, hides or swaps — tab panels, show-more, toggled sections, filtered
lists, carousel slides — **MUST** move both ways, and the clicked control's own state change
**SHOULD** transition (`transition-colors`).

### 4.5 Never `transition-all` `[6.8]`

Transition only the properties that change: `transition-colors`,
`transition-[transform,box-shadow]`, 150–200 ms.

```jsx
// ❌ Нельзя — animates layout properties too; janky, and fights the browser
<Button className="transition-all duration-300">…</Button>

// ✅ Как надо
<Button className="transition-colors duration-150">…</Button>
```

### 4.6 Reduced motion `[6.12]`

Under `prefers-reduced-motion` the motion goes — `motion-reduce:animate-none`, or opacity
only. Never remove the state change itself, only the movement.

### 4.7 No layout shift on load `[2.13, P43]`

Every async block reserves its final size (a skeleton, or `min-height` of the expected
content) so nothing below it — including the footer — moves when it arrives. Images and media
always carry explicit `width`/`height` or `aspect-ratio`.

---

## 5. Floating layers

### 5.1 Portal, collision detection, side flip `[1.2, P02 P22]`

Every floating element (Select list, DropdownMenu, Popover, Tooltip, Combobox) **MUST** render
in a Portal with collision detection and side flipping (open upwards when there is no room
below), and **MUST NOT** change the layout of its trigger's container.

### 5.2 One z-index scale `[5.3, P14 P19 P22]`

One scale in the theme (header 30, sticky subnav 35, dropdown 40, modal 50, toast 60).
**NEVER** literal z-index values in components.

### 5.3 Radius and scrolling never share an element `[5.1, P21 P24]`

```jsx
// ❌ Нельзя — the scrollbar draws across the rounded corner
<div className="max-h-80 overflow-y-auto rounded-xl border">…</div>

// ✅ Как надо
<div className="overflow-hidden rounded-xl border">
  <div className="max-h-80 overflow-y-auto">…</div>
</div>
```

This applies to **scroll containers only**. **NEVER** add `overflow-hidden` to a card "just in
case": a card with an edge badge must keep the badge outside the clipped frame.

### 5.4 Dialog and drawer geometry `[5.2, P18]`

Fixed header and footer, body `flex-1 min-h-0 overflow-y-auto`, panel
`max-h-[calc(100dvh-…)]`. A max-height **MUST NEVER** be smaller than the content without the
body scrolling.

### 5.5 A pinned panel's scroll box ends on the screen `[2.16]`

A scroll box with hidden content inside a sticky or fixed panel must not end below the bottom
of the screen while the panel is pinned — its last items could never be shown.

---

## 6. Shape, colour and marks

### 6.1 One shape language `[S1]`

On a rounded site no button, field, tab, card or badge has square corners; on a square site
nothing is rounded. The site's shape is the median radius across all pages.
Within one corner family, radii more than ~4 px apart are a finding `[1.20]`.

### 6.2 One look per role across pages `[1.20, 1.3/1.16]`

Buttons (filled / outlined), tags (badges, chips, status pills), cards and inputs: the look
most pages use is the site's. A page whose pieces of a role are square while the rest are
rounded or pills, or whose buttons change case, is **hard**.

Practical budgets the checker enforces by default:

| Property | Variants allowed |
|---|---|
| filled-button corner radius | 2 |
| button font family (per variant) | 1 |
| button height | 3 |
| input height | 2 |
| input corner radius | 2 |
| card corner radius | 3 |
| card skin (radius + fill + border + shadow + padding) | 4 |

### 6.3 Input borders `[1.9, P09]`

At rest the border **MUST** meet 3:1 contrast against its background. Aim just above 3:1 — a
near-black edge passes but reads harsh. Keep it in one theme token. Errors: destructive ring
plus a message **under the field**.

### 6.4 One logo component `[1.11, P25 P51 P58]`

One `Logo` component is the only way to render the brand mark (header, footer, auth, emails).
**NEVER** redraw it with divs or text. Its SVG `viewBox` contains all paths including stroke
width. A page renders the logo once — if the layout renders it, the page does not. The logo
links home, and the link wraps the mark only (`inline-flex`, sized to the logo), never a block
or a stretched flex item. Favicon, apple-touch and PWA icons come from the same source;
boilerplate icons **MUST** be deleted.

### 6.5 Icons and emoji `[1.12, P40]`

Icons come from one library. **NEVER** OS emoji as UI icons, labels or list bullets —
including in seeded or demo data. An icon ≤ 24 px sits at least 3 px from its label `[2.24]`.

### 6.6 Badges on card edges `[1.13, P24]`

A badge straddling a card edge ("Popular", "Best value") **MUST NOT** be clipped by the card.
Its position is one rule for the whole product. Two badges on one card never overlap.

### 6.7 Payment marks `[6.7, F5, P37]`

One component, one fixed height for all marks, the canonical files.

---

## 7. Responsive and overflow

| # | Rule | Tag |
|---|---|---|
| 7.1 | **NEVER** horizontal scroll of the page, at any width. No exceptions. | `[2.1, P15 P16]` |
| 7.2 | **NEVER** horizontal scrollers for navigation or content lists (chip rows, tab rows, card rails, `min-w-max`, `snap-x`). Below the width where the row fits: section menu → `Select`/burger, cards → stacked grid. A carousel is allowed only for media galleries, with visible controls, and only when the project declares it. | `[2.2, P15]` |
| 7.3 | Tables **MUST** have a mobile representation: below 640 px rows render as stacked blocks (label + value). `overflow-x-auto` is a last resort for genuinely wide data tables in signed-in admin views, inside the table's own container — never the page. | `[2.3, P16]` |
| 7.4 | Text columns left, numeric/money columns right; header cells aligned exactly like their column, same grid template **and gap** as body rows. | `[2.4, P17]` |
| 7.5 | User-supplied or translated text in a constrained place (header, nav, pills, buttons, table cells) **MUST** have a width limit and an overflow rule (`truncate` + full text in `title`, or `line-clamp-N`). Navigation is checked with the longest supported locale; items that do not fit move into the menu, they never wrap to two lines. | `[2.5, P13 P35]` |
| 7.6 | Cards in a row **MUST** be equal height: `h-full flex flex-col` on the card, `mt-auto` on the bottom block. Rows use `items-stretch`. | `[2.6, P27]` |
| 7.7 | Repeated rows use one shared `grid-template-columns`, **NEVER** `flex justify-between` whose positions depend on text length. | `[2.12, P17 P48]` |
| 7.8 | Nothing overlaps. Content is offset by the height of any fixed/sticky header (`padding-top: var(--header-h)`); text containers grow with their content — **NEVER** a fixed `height` on a box containing text; `absolute` decorations never sit over flowing text. | `[2.11, P24 P49]` |
| 7.9 | Text is shown in full: nothing straddles the screen edge or the edge of a clipping box, nothing spills out of its button / badge / card, no list option, menu item, tab or short label is truncated with "…". | `[2.14]` |
| 7.10 | Mobile header below 768 px: a burger containing **every** nav item and **every** account action. Every action in the mobile menu is also reachable on desktop. Exactly **one** mobile menu — two toggles that both reveal the site navigation is a finding. | `[2.10, 3.10, P12 P54]` |
| 7.11 | The **open** mobile menu is part of the design: legible text, targets ≥ 44×44 px, nothing covers it, it fills the height or dims the page behind it, its surface is the site's own, its buttons and corners are the site's. Every item must be reachable by scrolling. | `[3.5]` |

---

## 8. Page-level structure and flow

| # | Rule | Tag |
|---|---|---|
| 8.1 | Spacing comes only from tokens. **NEVER** arbitrary values (`mt-[73px]`), negative margins to fix overlap, or `lg:*-0` utilities that zero spacing in another layout. | `[2.7, P28 P29]` |
| 8.2 | `gap` only spaces direct children: when a wrapper sits between the flex/grid parent and the items, the wrapper carries the layout. Every page keeps bottom padding before the footer. | `[2.8, P29]` |
| 8.3 | Content in a column stretched to its neighbour's height starts at the top. **NEVER** vertically centre a panel inside a stretched column. | `[2.9, P28]` |
| 8.4 | One content top per shell: pages that share a layout start their content at the same height, and a page with a side rail starts both columns on one line. | `[2.7]` |
| 8.5 | Two-column blocks follow one rule across the whole site: the right column starts on the same line of the left one (the eyebrow, or the heading) in every block. | `[2.22]` |
| 8.6 | Even rhythm: no gap in a list more than 1.6× the median; gaps in a row within 6 px of each other. | `[2.23]` |
| 8.7 | Sticky elements: the header height is a CSS variable (`--header-h`); every sticky element below it uses `top: var(--header-h)`; every anchor target has `scroll-margin-top` equal to the total sticky height. **NEVER** a sticky element that can slide under another. A hide-on-scroll header ignores overscroll and always reappears on upward scroll. | `[3.6, N1, P14 P53]` |
| 8.8 | Navigation to a new page starts at the top. The router's scroll-to-top is never disabled; pages never auto-scroll to a block on load. Only back/forward restores a position. | `[3.8, P52]` |
| 8.9 | Multi-step flows scroll the step container into view on every step change, and scroll to the result after submit. | `[4.4, P42]` |
| 8.10 | Every list/table/dashboard with no data renders an `EmptyState` (icon, description, CTA). An empty state never scrolls. Lists longer than one screen paginate; more than 20 same-shaped items with no pager, "Load more" or virtualization is a finding. | `[4.3, 2.19]` |
| 8.11 | Loading uses skeletons shaped like the content. Complex blocks sit in Error Boundaries; a DOM error never crashes the page; local errors are non-blocking toasts. | `[4.1, 4.2]` |
| 8.12 | Cookie consent: banner and preferences panel are **one** component with **one** state. Opening preferences hides the banner. There is never more than one consent surface or two "Accept" buttons on screen. While the banner shows, the page gets bottom padding equal to its height, and it never covers navigation, the mobile menu or account actions. | `[4.6, P19 P57]` |
| 8.13 | Dropdown options are in a readable order (alphabetical, numeric, sizes, months, weekdays, dates — either direction; a placeholder first and "Other" last are fine). The selected option looks different when the list is open, and is scrolled into view. The tick sits on the same side in every dropdown on the site. | `[1.2]` |
| 8.14 | No duplicates: the same link never appears twice in the header or footer, two labels never lead to one page, the same image never appears twice on a page. | `[N4, D3]` |
| 8.15 | Paged card grids end on a full row; column counts divide the item count, or the incomplete last row follows one product-wide rule. | `[L1, 2.12]` |
| 8.16 | Charts draw a label only if the measured text width fits the shape; otherwise hide it and expose it in a tooltip. **NEVER** decide by shape size alone. | `[4.5, P41]` |

---

## 9. Legibility and contrast

| # | Rule | Tag |
|---|---|---|
| 9.1 | Body and navigation text ≥ 12 px. Weight ≥ 400 below 16 px, ≥ 300 from 16 px. Display type ≥ 24 px is free. | `[6.4, P11 P34]` |
| 9.2 | **No `opacity-*` on text.** Translucent colour tokens are fine — the measured contrast decides, not the notation. | `[6.4]` |
| 9.3 | Every text measures ≥ 4.5:1 against its **actual** background (≥ 3:1 for large text). | `[6.4]` |
| 9.4 | Font weights used **MUST** be ones actually loaded. Never request a weight the font file does not have. | `[6.4]` |
| 9.5 | Link affordance is exclusive: underline and link colour appear **only** on real links and buttons. Every underlined text navigates or acts. | `[6.9, P54]` |
| 9.6 | A link inside running text is not marked by colour alone: it needs an underline, bottom border, fill, +200 weight, icon or other font — unless its colour is ≥ 3:1 from the text around it. | `[6.13, WCAG F73]` |
| 9.7 | A shadow is not cut off by a box that clips it. | `[2.15]` |
| 9.8 | Glass/translucent surfaces use one shared class (background fill + `backdrop-blur`). **NEVER** SVG/CSS filters on panels containing text or UI. | `[6.6, P38 P39]` |

---

## 10. Review checklist

Run through this list against any screen before calling it done.

- [ ] No `<select>`, `<input type=checkbox|radio|date|file|range>`, bare `<button>`/`<input>`/`<textarea>`, `<details>`, `<dialog>`, `popover=`, `window.confirm/alert/prompt` outside `components/ui/`
- [ ] No headless-library import (Radix, Base UI, Headless UI, Ariakit, vaul) outside `components/ui/`
- [ ] No `{open && <div className="absolute …">}` hand-built overlay anywhere
- [ ] Exactly one component per role; no `*-2.tsx`, `new-*.tsx`, thin wrappers, or a second dropdown/modal/button file
- [ ] Every kit call site passes variants, not look classes; `className` carries layout only
- [ ] Every interactive element checked at rest / hover / focus-visible / active / disabled
- [ ] One focus ring per field, on one element
- [ ] Every disabled control says why
- [ ] Every overlay animates in **and** out, 120–200 ms, and the animation utilities actually compile
- [ ] Every disclosure animates its height both ways
- [ ] No `transition-all`
- [ ] `prefers-reduced-motion` removes the movement, not the state
- [ ] No horizontal page scroll at 390 / 768 / 1280 / 1440
- [ ] Nothing overlaps, nothing is clipped, nothing is truncated with "…"
- [ ] Cards in a row are equal height; repeated rows share one grid template
- [ ] Current nav item is distinct and carries `aria-current="page"`
- [ ] Every text ≥ 4.5:1 (≥ 3:1 large); no `opacity` on text
- [ ] One shape language, one palette, one logo component, one icon library, no emoji
