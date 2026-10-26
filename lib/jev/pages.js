// Page models for Jev: the rendered copy of every page (one per route × locale × role), the site chrome (lines on at
// least half the pages: header, footer, cookie banner) taken out and read once, numbered lines and sentences.

/** Lines on at least half of the pages (4+ pages) are chrome. */
export function splitChrome(pages) {
  const web = pages.filter((p) => !p.forceType);
  const count = new Map();
  for (const p of web) for (const t of new Set(p.lines.map((l) => l.text))) count.set(t, (count.get(t) || 0) + 1);
  const chrome = new Set([...count].filter(([, n]) => web.length >= 4 && n >= web.length / 2).map(([t]) => t));
  for (const p of pages) p.body = p.lines.filter((l) => !chrome.has(l.text));
  const first = web.find((p) => p.route === "/" && !p.auth) || web[0];
  const chromePage = first ? { route: "(header and footer)", locale: first.locale, auth: false, role: null, title: "site chrome", h1: "", chrome: true, lines: first.lines.filter((l) => chrome.has(l.text)), links: [], controls: [] } : null;
  if (chromePage) chromePage.body = chromePage.lines;
  return { chrome, chromePage };
}

/** "L012| [button] text" lines of a page (section headings marked "##"). */
export function numbered(lines, prefix = "L") {
  return lines.map((l, i) => {
    const id = `${prefix}${String(i + 1).padStart(3, "0")}`;
    const mark = l.kind === "heading" ? "## " : l.kind === "button" ? "[button] " : l.kind === "nav" ? "[link] " : l.li ? "• " : "";
    return { id, text: l.text, line: `${id}| ${mark}${l.text}`, ref: l };
  });
}

/** Split a line into sentences (keeps numbers like 1.15 and "e.g." together). */
export function sentences(text) {
  const out = [];
  const re = /[^.!?;]+(?:[.!?;](?=\S)[^.!?;]*)*[.!?;]?/g;
  for (const m of String(text).matchAll(re)) {
    const s = m[0].trim();
    if (!s) continue;
    // a fragment that starts lower-case or is very short belongs to the previous sentence ("e.g. x", "approx. 3")
    if (out.length && (s.length < 12 || /^[a-z(]/.test(s) || /\b(e\.g|i\.e|approx|incl|vs|etc|no|art|sec|§)\.$/i.test(out[out.length - 1]))) out[out.length - 1] += " " + s;
    else out.push(s);
  }
  return out;
}

export const pageKey = (p) => `${p.auth ? `[${p.role || "user"}] ` : ""}${p.route}${p.locale ? ` (${p.locale})` : ""}`;
