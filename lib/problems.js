// 5.7.1: one definition of "a problem" — the unit `babysitter fix-plan` lists, Jev triage labels and the run summary
// counts. A problem is one cause: the same message (numbers and quoted text normalised) on the same element, across
// pages, widths, languages and roles. Before, the summary counted failed checks, fix-plan "failed tests" (checks plus
// text-pass findings) and triage grouped by message alone, so a live run printed 745, 1106, 687 and 457 for one set of
// findings with no word on what each counted.
//
// 6.4 (small, light or faint text) is grouped by the component that renders the text, not by each element: the last
// selector step with its classes (th.cyber-label.!text-[10px]) is the component's markup, so four column headers of one
// table component are one problem with four sample texts, not four items that all read "10px".

const RULE_RE = /\[([A-Z]?\d+(?:\.\d+)?[a-z]?|[A-Z]\d|i18n)[,\]]/;
const TEST_RE = /^([A-Z]?\d+(?:\.\d+)?(?:\/[\d.]+)?|[A-Z]\d(?:[–-][A-Z]?\d)?|i18n|states)/;
/** The rule of one item of a finding: [6.4] in its text, else the test title's leading id, else "other". */
export const ruleOf = (item, test = "") => (String(item.what || "").match(RULE_RE) || String(test).match(TEST_RE) || [, "other"])[1];

const BY_COMPONENT = new Set(["6.4"]);
/** "div.a > span.b.text-[11px] \"3 total\"" → "span.b.text-[#px]" (the element's own markup, digits normalised). */
export function componentOf(where = "") {
  const sel = String(where).split(/\s+in\s+|\s"/)[0];
  const last = (sel.split(" > ").pop() || "").trim();
  return last.replace(/\d+/g, "#");
}
/** The quoted text of an element description ("… span.x \"3 total\"" → "3 total"). */
export const elementText = (where = "") => (String(where).match(/\s"([^"]{1,80})"?\s*$/) || [])[1] || null;

/** The grouping key of one item of a finding. */
export function problemKey(f, it) {
  const rule = f.rule || ruleOf(it, f.test || "");
  const what = String(it.what || "").replace(/^\[[\w-]+\]\s*/, "").replace(/\d+(\.\d+)?/g, "#").replace(/"[^"]*"/g, '""').slice(0, 160);
  const where = BY_COMPONENT.has(rule) && componentOf(it.where) ? `component ${componentOf(it.where)}` : String(it.where || "").replace(/\d+/g, "#").slice(0, 120);
  return { rule, sig: `${rule}|${what}|${where}` };
}

/** The items of a finding (a finding with no bullet items is one item: its first error line). */
export const itemsOf = (f) => (f.items?.length ? f.items : [{ what: String(f.error || "").split("\n")[0] || f.test || "", where: "" }]);

/**
 * @returns {Map<string, { rule, what, where, refs: [number, number][], pages: Set<string>, projects: Set<string>,
 *   locales: Set<string>, roles: Set<string>, texts: Set<string>, test, jev, first: any }>}
 */
export function groupProblems(findings) {
  const groups = new Map();
  for (const [fi, f] of findings.entries()) {
    for (const [ii, it] of itemsOf(f).entries()) {
      const { rule, sig } = problemKey(f, it);
      if (!groups.has(sig)) groups.set(sig, { rule, what: it.what, where: it.where || "", refs: [], pages: new Set(), projects: new Set(), locales: new Set(), roles: new Set(), texts: new Set(), test: f.test, jev: f.jev || null, first: f });
      const g = groups.get(sig);
      g.refs.push([fi, ii]);
      g.pages.add(f.route || "site-wide");
      if (f.project) g.projects.add(f.project);
      if (f.locale) g.locales.add(f.locale);
      if (f.auth) g.roles.add(f.role);
      const t = elementText(it.where);
      if (t) g.texts.add(t);
    }
  }
  return groups;
}

/** The counts a run's findings stand for, in words (fix-plan's header, the Stop hook). */
export function countsLine(findings, counts = null) {
  const text = findings.filter((f) => f.suite === "text" || f.project === "text");
  const checks = findings.length - text.length;
  const unit = counts?.unit === "check" ? "failed check(s)" : counts?.unit === "test" ? "failed test(s)" : "failed check(s)/test(s)";
  const pw = counts?.playwright && counts.unit === "check" ? ` (express: Playwright reported ${counts.playwright.failed} failed page test(s), each holding one or more failed checks)` : "";
  return `${checks} ${unit}${pw}${text.length ? ` + ${text.length} text-pass finding(s)` : ""}`;
}
