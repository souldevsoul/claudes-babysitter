# Layout, navigation and money checks

Runtime checks in `playwright/checks/layout.js`, run by `playwright/layout.spec.js` on every route at the
same widths as the main suite. Fixture tests (one true positive and one look-alike false positive per check)
are in `test/layout.test.mjs` (`npm run test:layout`).

They cover recurring card patterns that the per-element checks missed: nav and footer naming, logos that don't
link home, an active item you can't see, headings styled per page, words broken mid-word, near-miss alignment,
empty space, headers that scroll away, endless lists, default favicons, unsorted dropdowns, buttons with no hover
state, two mobile menus, and messy converted prices.

**Hard** findings fail the test. **Soft** findings fail too while `STRICT` is on (the default), but through
`expect.soft`. With `STRICT=0` they become warnings. Anything a check could not examine (over a cap, covered,
didn't open) is listed under a "not tested" annotation. Nothing is dropped without a note.

| Test | Function | Hard | Soft |
|---|---|---|---|
| 3.7 header links are in the footer under the same name | `navParity` | the same destination has two labels (header "Pricing", footer "Plans") | a header route is missing from the footer (links into the signed-in areas in `authRoutes` / `roles[].authRoutes` are app navigation and are left out) |
| 3.7 nav names match their pages (site-wide) | `navTitleMismatches` | a legal document's nav label is not its page title / h1, word for word ("Terms" vs "Terms of Service", "License" vs "Licence") | a nav label shares no word with the page's h1 or title |
| 1.11 logos link home | `logoHome` | a header, footer, auth-page or open-mobile-menu logo (mark, `logo`/`brand` attributes, or the brand name as a wordmark) that is not a link | a logo that links somewhere other than `/` or the locale root |
| 3.5 the current nav item looks different, and only it | `activeNavStyle` | the current item has the same computed look as its siblings (colour, weight, visible underline, background, border, pseudo-element bar, child indicator); a non-current item shares the current item's highlight | a section page (`/blog/x`) whose section item is plain; a non-current item looks highlighted on a page with no current item |
| 6.5 one heading style per level (site-wide) | `collectHeadings`, `headingVariants` | h1 in more than `layout.headingVariants` (2) **faces** per breakpoint (family, weight, tracking in em, case as rendered) | more than 2 **looks** (face + size) for h1 or h2; more than 2 h2 faces |
| 2.5 text breaks (390 and 360) | `textBreaks` | a word broken mid-word in a heading, button, button-link, nav item, badge, label or table header (found with per-character Range rects, so a break after a real hyphen passes); a number or amount split across lines | an orphan: a multi-line h1–h4 whose last line is one short word |
| 2.7 / 2.4 near-miss alignment | `alignment` | a table column header aligned differently from its values (HTML tables and `role=table/grid`) | stacked siblings whose visible left edges differ by 2–12 px; side-by-side columns whose first lines (same size) start 2–12 px apart; form fields or a label off by 2–12 px |
| 2.7 excess empty space | `emptySpace` | — | a gap between sections more than 2.5× the page's median gap and over 160 px; a section taller than the screen with an empty band over 60% of it. Crops are attached. |
| 3.6 sticky header | `stickyHeader` | no header bar at the top after scrolling 1000 px (hide-on-scroll headers included) | the same when `layout.stickyHeader` is `false` |
| 4.3 long lists | `longLists` | — | more than 20 same-shaped items (cards, rows, `li`) with no pager, "Load more", next link or virtualization near them. Prose bullets, marquees, carousels, logo walls and choice sets (checkbox, radio, switch or pressed-toggle chips; the items of a fieldset or `[role=group]`) are skipped. |
| 6.11 favicon (once per run) | `favicon` | none at all; declared but not served or not an image; a framework starter icon (create-next-app, CRA, Vite, Astro, Nuxt); the same file as another product in the registry | no apple-touch-icon |
| 1.2 dropdowns | `dropdowns`, `orderOf` | the selected option looks like the others when open; it is scrolled out of view; the tick sits left in one dropdown and right in another (on a page, and site-wide) | options in no readable order (alphabetical, numeric, sizes, months, weekdays and dates are recognised in either direction; a placeholder first and "Other" last are allowed; "Sort by" lists are skipped) |
| 1.6 hover feedback (desktop widths) | `hoverFeedback` | a button or button-styled link whose computed look (self, `::before`/`::after`, first 14 descendants) doesn't change on hover | a text button (an accordion question) or a clickable card that doesn't change on hover |
| 2.10 one mobile menu | `oneMobileMenu` | two header toggles (burger and avatar) that both reveal the site navigation (3 or more shared destinations, or half of the smaller set) | — |
| money | `moneyFormat`, `moneyIssues`, `parseMoney` | in the current currency **and in every currency of the switcher**: 3+ decimals (4+ or a non-unit price), decimals on a zero-decimal currency (JPY…), one currency written two ways (`US$` and `$`, `€` before and after, with and without a space), two decimal separators, 4+ digit amounts without grouping, two grouping styles | a 3-decimal per-unit price; converted pack prices not rounded while the base currency's were (over 80% round in the base, over half dirty after the switch); an exchange rate ("$1 = €0.89165") with more than `layout.rateDecimals` (4) decimals; a header balance in money on a product that sells credits (the site header only, not a page's own title block; an amount on the same line as the credits is the hint; "sells credits" is the run's money model, the same as M2's — 5.7.1) |

## Configuration (`babysitter.config.json`)

```json
{
  "name": "acme",
  "layout": {
    "headingVariants": 2,
    "emptySpaceRatio": 2.5,
    "stickyHeader": true,
    "stickyDistance": 1000,
    "maxListItems": 20,
    "maxHover": 40,
    "maxCurrencies": 8,
    "rateDecimals": 4,
    "registerFavicon": true
  }
}
```

## Favicon registry

There is one file per machine: `~/.babysitter/favicons.json`. Set `BABYSITTER_FAVICON_REGISTRY` to use a different
path. It maps the sha256 of each favicon file to the products that served it. A file already registered by another
product is a hard finding. Entries count as the same product when the name, the origin, or a distinctive name
token matches: `vertex` on localhost and `vertex.boutique` live are one product. Generic tokens like `app`,
`www` and `vercel` don't count. Keep `name` in `babysitter.config.json` stable. Set `layout.registerFavicon: false` to check
the favicon without recording it.

## Measurer traps handled

- Text lines are counted with `Range.getClientRects()`, never with element height.
- An underline in a transparent colour is not an underline. On sprout.boutique every nav item carries `underline`
  with `decoration-color: transparent`.
- A text wordmark linking home ("V VERTEX ELITE") is the logo, not a highlighted nav item.
- `/#faq` is an anchor: it is never the current page, and never the logo.
- Letter-spacing is compared in em, and all-caps source text counts the same as `text-transform: uppercase`.
- Headings whose number sits on its own line by layout (block or flex children) are not orphans.
- A table's left edge is its box, so cell padding is not reported as a stray offset.
- A section carried by a picture is not empty.
- A float like `7.4899999` is parsed as one amount (the grouping pattern may not be followed by a digit).
  A 3-digit tail is read as a decimal only when the page itself uses that separator for decimals.

## 5.2.0 — from the miss loop (`babysitter misses`)

- **2.14 text is shown in full** (`playwright/checks/fit.js`, babysitter.spec, every language in run.spec, every
  state in the states run): the glyphs of every text run are measured. Hard when text straddles the screen edge or
  the edge of a box that clips it (overflow hidden / clip; a scroller is not a clip), when it is hidden below the
  bottom of a screen-tall fixed panel that does not scroll, when it spills out of its painted button / badge / card,
  and when a list option, menu item, tab, label or short text is truncated with "…". Left out: closed accordions,
  carousel and marquee tracks, line clamps, ellipsis on long titles, horizontal scrollers. Faint decorative text goes
  to "check by eye".
- **2.5** also measures short plain labels (≤ 40 characters: a pagination caption, a row label); there only a word
  of letters broken by letters counts, so a long e-mail or URL may still break.
- **1.20 one look per role across pages** (`playwright/checks/looks.js`, babysitter.spec site-wide, 390 + 1440):
  buttons (filled / outlined), tags (badges, chips, status pills — a dot inside is fine), cards and inputs. The look
  most pages use is the site's; a page whose pieces of a role are square while the rest are rounded or pills, or
  whose buttons change case, is hard. The same corner family with a radius more than `consistency.radiusTolerance`
  (4) px apart is soft.
- **3.5** the open mobile menu: an item that is still off the screen after it was scrolled into view, or that only
  a script could scroll to (an overflow: hidden panel), cannot be reached — hard.

## 5.5.0 — every missed card a check (Praxis, Parallel, Kindred, Compass)

`playwright/checks/rhythm.js` (layout.spec "rhythm", run.spec i18n for the language-dependent ones) and
`playwright/checks/boxes.js` (babysitter.spec, layout.spec, and `measure()` in every opened state). Fixtures:
`test/misses-550-layout-a.test.mjs`, `test/misses-550-layout-b.test.mjs`.

| ID | What | Cards |
|---|---|---|
| 2.5 | a money / credits range on two lines (per currency and language); a heading with a forced break that still wraps to a one-word or under-35 % line; 3+ lines that `text-wrap: balance` would even out (soft); the wordmark on one line at every width | Compass 34ebhu rqgkrl 9rkp6z ct4lge 69q0rj; Parallel c7p1wg; Kindred spdonv |
| 2.6 | one short slot wraps in a row of equal cards; stacked phone buttons of different widths; `divide-x` left on a stacked strip | Praxis ysspcg qgevme; Parallel 2jsnme |
| 2.7 | a marker / badge more than 2–4 px off its label's first line; side nav and content first lines 4–96 px apart (and the content top differs between pages of one shell); fields of one form row more than 2 px apart; a caption on the list's decorative rule (soft) | Praxis 1r8w0p dbrs0h; Parallel m0oxf9; Compass spixep zk611j |
| 2.11 | the glyphs of two texts intersect anywhere on the page (fixed / sticky layers, faint text and dialogs left out) | Compass 25x6e8 |
| 2.12 | a key–value row lacks the leader the others have, its value ends elsewhere, or its label wraps; a short slot more than 6 px off in flex rows | Praxis tjm4fx; Compass 69q0rj x2okne k25bx0 25x6e8 |
| 2.14 | text running into the next table cell; an icon (≤ 64 px) cut by a clipping box or squeezed by flex (`shrink-0`) | Praxis izrv19; Kindred x099su |
| 2.17 | one content width per page: a framed band wider than the median container by > 8 % and > 64 px (desktop) | Parallel 1xtxc4 |
| 2.18 | a box rounded ≥ 8 px on a right corner that scrolls itself (a desktop scrollbar draws across the corner; headless Chrome hides it) | Kindred 5k8emt |
| 2.19 | an empty state ("No messages yet") that scrolls | Praxis prmi5d |
| 2.20 | a panel that scrolls sideways although nothing in flow is wider | Kindred 1zetde |
| 2.21 | 10+ words at under 2.2 words per line, in a box under 35 % of its container or beside 40 % empty room | Compass akf9f4 2qp6hw 3ypscy |
| 2.22 | two-column blocks: the right column starts on no line of the left one, or blocks follow different rules on a page / across the site | Compass 1wq9va 76glyk uiv7nb 2ghvum tp3fvq khokf3 |
| 2.23 | even rhythm: one gap in a list over 1.6× the median, gaps in a row spread over 6 px, a framed row off centre | Compass xfm2up iiy7tk |
| 2.24 | an icon ≤ 24 px under 3 px from its label (hard), under 4 px / 0.25 em (soft) | Kindred dq793h |
| 1.6 | hover makes an even edge uneven (hard) or moves the card ≥ 2 px (soft, once per group); `layout.maxHoverEdge` | Kindred 1rto89 |
| 1.11 | one brand mark: footer logo = header mark, favicon hue within 40° of the mark, manifest name shares a word with the brand | Kindred kytm39 bmlrc4 |
| 1.20 | one typeface for the header's word controls (codes like EN / USD and the wordmark exempt); one placement of the "Most popular" badge | Praxis f8e3xf m0n604; Kindred fqsn52 |
| 1.21 | one accent colour per site (CIELAB ΔE ≥ 30 between pages) | Compass u5brwv 9ln1xx |
| 1.22 | (soft) a card in a row of ≥ 4 lacks a part ≥ 75 % of the others have | Compass 01s1e1 |
| 3.5 | at ≥ 1024 px a header with no internal links while ≥ 3 destinations sit in its menu / footer (`layout.desktopNav: "menu"` opts out) | Kindred sxnm89 62i3ff |
| 3.10 | a burger at desktop width that opens only links the header already shows | Compass 6d0aki |
| 6.5 | among 3+ section h2s of one look an outlier alignment (hero, bands, cards, closing CTA left out); an h1 in capitals while the site's h1s are mixed case; heading accent italic vs upright (soft) | Parallel k6c1vm; Kindred 9ha0j4; Compass 5dudz9 |
| 6.9 | focus drawn on the inner input of a framed field instead of the frame | Compass h59hxv |
| B5 | in the top-up dialog the custom amount is a tile like the packages (`acceptance.customAmount: false` when there is none by design) | Kindred c25ux3 |

Issue #4 (5.5.0): 1.3 / 1.16 count a select trigger (`role=combobox`, `aria-haspopup=listbox`) with the fields, not as
an outlined button; 2.7 skips a column whose content is a sticky contents list (its band is where the nav travels); 3.5
takes only the longest matching prefix as the current section; 6.12 judges toggling back on what the click opened, not on
the page's own re-render.
