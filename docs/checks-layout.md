# Layout, navigation and money checks

Runtime checks in `playwright/checks/layout.js`, run by `playwright/layout.spec.ts` on every route at the
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
| 3.7 header links are in the footer under the same name | `navParity` | the same destination has two labels (header "Pricing", footer "Plans") | a header route is missing from the footer |
| 3.7 nav names match their pages (site-wide) | `navTitleMismatches` | a legal document's nav label is not its page title / h1, word for word ("Terms" vs "Terms of Service", "License" vs "Licence") | a nav label shares no word with the page's h1 or title |
| 1.11 logos link home | `logoHome` | a header, footer, auth-page or open-mobile-menu logo (mark, `logo`/`brand` attributes, or the brand name as a wordmark) that is not a link | a logo that links somewhere other than `/` or the locale root |
| 3.5 the current nav item looks different, and only it | `activeNavStyle` | the current item has the same computed look as its siblings (colour, weight, visible underline, background, border, pseudo-element bar, child indicator); a non-current item shares the current item's highlight | a section page (`/blog/x`) whose section item is plain; a non-current item looks highlighted on a page with no current item |
| 6.5 one heading style per level (site-wide) | `collectHeadings`, `headingVariants` | h1 in more than `layout.headingVariants` (2) **faces** per breakpoint (family, weight, tracking in em, case as rendered) | more than 2 **looks** (face + size) for h1 or h2; more than 2 h2 faces |
| 2.5 text breaks (390 and 360) | `textBreaks` | a word broken mid-word in a heading, button, button-link, nav item, badge, label or table header (found with per-character Range rects, so a break after a real hyphen passes); a number or amount split across lines | an orphan: a multi-line h1–h4 whose last line is one short word |
| 2.7 / 2.4 near-miss alignment | `alignment` | a table column header aligned differently from its values (HTML tables and `role=table/grid`) | stacked siblings whose visible left edges differ by 2–12 px; side-by-side columns whose first lines (same size) start 2–12 px apart; form fields or a label off by 2–12 px |
| 2.7 excess empty space | `emptySpace` | — | a gap between sections more than 2.5× the page's median gap and over 160 px; a section taller than the screen with an empty band over 60% of it. Crops are attached. |
| 3.6 sticky header | `stickyHeader` | no header bar at the top after scrolling 1000 px (hide-on-scroll headers included) | the same when `layout.stickyHeader` is `false` |
| 4.3 long lists | `longLists` | — | more than 20 same-shaped items (cards, rows, `li`) with no pager, "Load more", next link or virtualization near them. Prose bullets, marquees, carousels and logo walls are skipped. |
| 6.11 favicon (once per run) | `favicon` | none at all; declared but not served or not an image; a framework starter icon (create-next-app, CRA, Vite, Astro, Nuxt); the same file as another product in the registry | no apple-touch-icon |
| 1.2 dropdowns | `dropdowns`, `orderOf` | the selected option looks like the others when open; it is scrolled out of view; the tick sits left in one dropdown and right in another (on a page, and site-wide) | options in no readable order (alphabetical, numeric, sizes, months, weekdays and dates are recognised in either direction; a placeholder first and "Other" last are allowed; "Sort by" lists are skipped) |
| 1.6 hover feedback (desktop widths) | `hoverFeedback` | a button or button-styled link whose computed look (self, `::before`/`::after`, first 14 descendants) doesn't change on hover | a clickable card that doesn't change on hover |
| 2.10 one mobile menu | `oneMobileMenu` | two header toggles (burger and avatar) that both reveal the site navigation (3 or more shared destinations, or half of the smaller set) | — |
| money | `moneyFormat`, `moneyIssues`, `parseMoney` | in the current currency **and in every currency of the switcher**: 3+ decimals (4+ or a non-unit price), decimals on a zero-decimal currency (JPY…), one currency written two ways (`US$` and `$`, `€` before and after, with and without a space), two decimal separators, 4+ digit amounts without grouping, two grouping styles | a 3-decimal per-unit price; converted pack prices not rounded while the base currency's were (over 80% round in the base, over half dirty after the switch); a header balance in money on a product that sells credits |

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
    "registerFavicon": true
  }
}
```

## Favicon registry

There is one file per machine: `~/.babysitter/favicons.json`. Set `BABYSITTER_FAVICON_REGISTRY` to use a different
path. It maps the sha256 of each favicon file to the products that served it. A file already registered by another
product (a different name and a different origin) is a hard finding. Set `layout.registerFavicon: false` to check
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
