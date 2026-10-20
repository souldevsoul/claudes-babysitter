# Details checks (5.3.0): shadows, pinned scroll boxes, links in sentences

Three page checks from the cards that became visible once Nexus listed every card of the 16–20 October round
(souldevsoul/nexus#1). They run on every route and viewport (`babysitter.spec.ts`); code in
`playwright/checks/details.js`, fixtures in `test/misses-521.test.mjs`.

| id | test | reports | stays quiet on |
|---|---|---|---|
| 2.15 | a shadow is not cut off by a box that clips | a box shadow that shows on one side of a card and is cut on another by an ancestor that clips (overflow hidden / clip, or an `auto` axis that does not scroll — `overflow-x: hidden` makes `overflow-y` auto). Hard when 12px or more of the shadow's reach is cut; a smaller cut is "check by eye". Grouped by look-alike. | a shadow cut on every side (it is invisible, not a hard edge); a scroller that scrolls in that direction; shadows under 4px |
| 2.16 | a pinned panel's scroll box ends on the screen | a scroll box with hidden content inside a sticky (with a `top`) or fixed panel that ends below the bottom of the screen while the panel is pinned: its last items can never be shown | a sticky panel whose container is not taller than it (it never pins); a drawer whose scroll box ends at the screen bottom; a box with nothing hidden |
| 6.13 | a link in a sentence is not marked by colour alone | a link inside running text (20+ letters of its own in the block) with no underline, bottom border, fill, +200 weight, icon or other font, whose colour is within 3:1 of the text around it (WCAG 1.4.1, failure F73) | nav and footer link lists (the link is the whole item), button-like links, links 3:1 or more from the text, bold links |

Cards: Praxis 4tzjjnds (dashboard tiles' shadow cut under the last row, 2.15), bq9a2b (the /specialists skill-area list,
2.16), 47lv7o (the cookie banner's "Cookie Policy", 6.13).
