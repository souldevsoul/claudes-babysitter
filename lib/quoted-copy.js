// Which quoted runs in a finding's message are PAGE COPY, and which are values the check printed.
//
// 5.7.1 taught fix-plan to point at the source file that renders a finding's text ("look at", and the
// `text "…": file:line` lines). It locates that file by searching the repo for the quoted run. That is
// right for copy — "Unused credits are refundable within 14 " really is in refund/page.tsx — and wrong
// for a CSS value, which is never on the page at all:
//
//   dark page but color-scheme is "normal"      → searched for "normal"  → src/lib/blog.ts:35
//                                                  ("runs at normal (warm) latency")
//   clickable button shows cursor "default"     → searched for "default" → src/lib/models.ts:26,
//                                                  then components.json, eslint.config.mjs, next.config.ts
//
// Both land on whatever file happens to contain the word, and the reader is sent to edit it. A wrong
// pointer is worse than none: "look at" says "(no source match — search for the element's text /
// classes)" when nothing matches, which is honest.
//
// Found on relaygpu, 2026-10-28 (1.19 and H2 of a signed-in run).

/** CSS keyword values that a check prints as the measured value. Never page copy. */
const CSS_KEYWORDS = new Set([
  // global
  "inherit", "initial", "unset", "revert", "revert-layer", "auto", "none", "normal",
  // cursor
  "default", "pointer", "text", "move", "grab", "grabbing", "crosshair", "wait", "progress",
  "help", "cell", "alias", "copy", "no-drop", "not-allowed", "all-scroll", "zoom-in", "zoom-out",
  // display / position / box
  "block", "inline", "inline-block", "flex", "inline-flex", "grid", "inline-grid", "contents",
  "flow-root", "list-item", "table", "table-cell", "table-row",
  "static", "relative", "absolute", "fixed", "sticky",
  "content-box", "border-box", "padding-box",
  // overflow / visibility
  "visible", "hidden", "clip", "scroll", "collapse",
  // colour-ish
  "transparent", "currentcolor",
  // font / text
  "bold", "bolder", "lighter", "italic", "oblique", "small-caps",
  "uppercase", "lowercase", "capitalize", "nowrap", "pre", "pre-wrap", "pre-line", "break-word",
  "underline", "overline", "line-through", "solid", "dashed", "dotted", "double", "groove", "ridge",
  // alignment
  "baseline", "stretch", "center", "start", "end", "flex-start", "flex-end",
  "space-between", "space-around", "space-evenly",
  // misc
  "border", "content", "both", "row", "column", "row-reverse", "column-reverse", "wrap-reverse",
  "ltr", "rtl", "dark", "light", "only", "isolate", "cover", "contain", "repeat", "no-repeat",
  "ease", "linear", "ease-in", "ease-out", "ease-in-out", "infinite", "forwards", "backwards",
]);

/** A measured value rather than words on the page: a number, a colour, a CSS function, a keyword. */
export function isMeasuredValue(q) {
  const s = String(q ?? "").trim();
  if (!s) return true;
  // a CSS function holds spaces of its own — test it before the "copy has spaces" rule
  if (/^(rgba?|hsla?|oklch|oklab|lab|lch|color|color-mix|var|calc|clamp|min|max|url|attr|counter|translate[XYZ3d]*|scale[XYZ3d]*|rotate[XYZ3d]*|cubic-bezier|steps|(linear|radial|conic)-gradient)\(/i.test(s)) return true;
  if (/\s/.test(s)) return false; // copy has spaces between its words; a keyword does not
  if (/^-?[\d.]+(px|rem|em|%|vh|vw|vmin|vmax|s|ms|deg|rad|turn|fr|ch|ex|pt|pc|cm|mm|in)?$/i.test(s)) return true;
  if (/^#[0-9a-f]{3,8}$/i.test(s)) return true;
  if (/^[\d.]+:1$/.test(s)) return true; // a contrast ratio
  return CSS_KEYWORDS.has(s.toLowerCase());
}

/**
 * Every quoted run of a message, paired LEFT TO RIGHT the way a reader pairs them.
 *
 * The 5.7.1 regex `/"([^"]{4,60})"/g` let the length bound choose the pairs, so a label shorter
 * than four characters made the scanner pair that label's closing quote with the NEXT run's
 * opening quote and invent a phrase that is in no file:
 *
 *   button "OK" — clickable button shows cursor "default"
 *     regex → [' — clickable button shows cursor ']      (fabricated)
 *     here  → ['OK', 'default']                          (then "default" is dropped as a value)
 */
export function quotedRuns(message) {
  const s = String(message ?? "");
  const out = [];
  for (let i = 0; ;) {
    const a = s.indexOf('"', i);
    if (a < 0) break;
    const b = s.indexOf('"', a + 1);
    if (b < 0) break;
    out.push(s.slice(a + 1, b));
    i = b + 1;
  }
  return out;
}

/**
 * The quoted runs of a finding's message that are worth searching the repo for.
 * @param {string} message  `${where} ${what}` of a grouped problem
 * @returns {string[]} quoted page copy, in order, without duplicates
 */
export function quotedCopy(message) {
  const out = [];
  for (const q of quotedRuns(message)) {
    if (q.length < 4 || q.length > 60) continue; // too short to search for, too long to be a label
    if (/^\d|px|\[/.test(q)) continue; // 5.7.1's guard: sizes and selectors
    if (isMeasuredValue(q)) continue; // 5.7.2: CSS values are not on the page
    if (!out.includes(q)) out.push(q);
  }
  return out;
}
