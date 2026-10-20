// Stage gates (5.2.0): the same product is judged differently in production and in testing — see lib/stage.js.
//   ST1 (live)  no test or generated entity is shown: an entity name ("Arman Test", "Test Specialist", "Demo
//               client"), a QA / example.com e-mail, a "[test]" tag, an element the product marks as a test entity
//               ([data-test-entity], the marker it shows in testing). CT2 (test data) knew "test user" and
//               "john doe", not a person named "… Test".
//   ST2 (test)  a test entity is allowed but says so: next to its name there is a visible marker ([data-test-entity]
//               with text, or a badge reading Test / Demo / Тест, or `stage.testMarker` from the config), so it is
//               never presented as a real person.
//   ST3 (test)  the main flows can be walked: the catalog lists at least one entity, one of them can be hired (an
//               enabled Hire / Request / Book control on the list or its page), and every role has a test account.
// Findings follow ../checks.js. Needs checks.install(page).
import { TEST_ENTITY } from "../../lib/stage.js";

const SOURCES = TEST_ENTITY.map((r) => ({ s: r.source, f: r.flags }));
// the texts that NAME an entity: headings, links, card titles, table cells, short labels inside a list item / card
// (only inside a listing — a list item, an article, a table row, a card — or as a page / card title: the signed-in
// user's own name and e-mail in a settings form are not an entity presented to others)
const NAMING = "h1, h2, h3, h4, a, strong, b, td, figcaption, [class*=name i], li span, article span, [class*=card i] span, li p";
const LISTING = "li, article, tr, [role=listitem], [role=row], [class*=card i]";
const MARKER_RE = /^\s*(test|demo|test (data|profile|account|entity)|тест|тестовый|sample)\s*$/i;

/** Every visible entity name that looks like test data: [{ text, match, marked, where, selector }]. */
export const testEntities = (page, { marker = null } = {}) => page.evaluate(({ SOURCES, NAMING, LISTING, MARKER, marker }) => {
  const W = window;
  const RES = SOURCES.map((x) => new RegExp(x.s, x.f));
  const MK = new RegExp(MARKER, "i");
  const out = [];
  const seen = new Set();
  const markedNear = (el) => {
    const box = el.closest("li, article, tr, [class*=card i], [role=listitem]") || el.closest("a[href]") || el.parentElement;
    if (!box) return false;
    if (marker && (box.matches(marker) || box.querySelector(marker))) return true;
    const tagged = [box, ...box.querySelectorAll("[data-test-entity]")].find((x) => x.hasAttribute && x.hasAttribute("data-test-entity") && W.__uiVisible(x));
    if (tagged && (tagged.innerText || "").trim()) return true;
    return Array.from(box.querySelectorAll("span, small, em, div, b, strong, i")).some((x) => W.__uiVisible(x) && MK.test((x.innerText || "").trim()));
  };
  for (const el of Array.from(document.querySelectorAll(NAMING))) {
    if (!W.__uiVisible(el) || el.closest("script, style, noscript, footer, form, dl, header, nav, [role=dialog] form")) continue;
    if (!el.closest(LISTING) && !/^H[1-3]$/.test(el.tagName)) continue;
    const t = (el.innerText || "").replace(/\s+/g, " ").trim();
    if (!t || t.length > 80) continue;
    let m = null;
    for (const re of RES) { const x = t.match(re); if (x) { m = x[0]; break; } }
    if (!m) continue;
    const key = `${t}|${(el.closest("li, article, tr, [class*=card i]") || el).getBoundingClientRect().top | 0}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text: t.slice(0, 60), match: m, marked: markedNear(el), where: W.__uiDescribe(el), selector: W.__uiSelector(el), human: W.__uiHuman(el) });
  }
  // what the product itself marks as a test entity is one too, whatever it is called
  for (const el of Array.from(document.querySelectorAll("[data-test-entity]"))) {
    if (!W.__uiVisible(el)) continue;
    const t = ((el.closest("li, article, tr, [class*=card i], a[href]") || el).innerText || "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (out.some((o) => o.text === t)) continue;
    out.push({ text: t, match: "[data-test-entity]", marked: !!(el.innerText || "").trim(), where: W.__uiDescribe(el), selector: W.__uiSelector(el), human: W.__uiHuman(el) });
  }
  return out;
}, { SOURCES, NAMING, LISTING, MARKER: MARKER_RE.source, marker });

/** ST1 — live: none may show. */
export async function liveTestEntities(page, opts = {}) {
  return (await testEntities(page, opts)).map((e) => ({ id: "ST1", what: `test entity shown in production: "${e.text}" (${e.match}) — hide test and generated records on the live site (APP_STAGE=live), or delete them [ST1, stage live]`, where: e.where, selector: e.selector, human: e.human }));
}
/** ST2 — test: each one carries a visible marker. */
export async function unmarkedTestEntities(page, opts = {}) {
  return (await testEntities(page, opts)).filter((e) => !e.marked).map((e) => ({ id: "ST2", what: `test entity "${e.text}" is presented as real — show a visible "Test" marker next to it (data-test-entity) so nobody takes it for a real person [ST2, stage test]`, where: e.where, selector: e.selector, human: e.human }));
}

export const HIRE_RE = /^(hire|hire (now|them|this specialist|specialist)|book|book (now|a call|a session)|request|request (a quote|this specialist|service)|send (a )?request|describe your task|order|start (a )?task|нанять|заказать|выбрать|işə götür|sifariş|жалдау|тапсырыс)\b/i;
/**
 * ST3 — test: the catalog at this page lists entities and one can be hired. Returns { items, hireable, detail } —
 * items: links to the entity pages under the catalog path; hireable: an enabled control matching HIRE_RE here.
 */
export const catalogState = (page, path) => page.evaluate(({ path, HIRE }) => {
  const W = window;
  const base = path.replace(/\/+$/, "");
  const items = [...new Set(Array.from(document.querySelectorAll("a[href]")).filter((a) => W.__uiVisible(a) && !a.closest("header, footer, nav")).map((a) => { try { return new URL(a.href).pathname; } catch { return ""; } }).filter((p) => p.startsWith(`${base}/`) && p.length > base.length + 1))];
  // a catalog drawn as buttons that open a dossier (Praxis /specialists): the long, repeated entity buttons count too
  document.querySelectorAll("[data-bs-entity]").forEach((e) => e.removeAttribute("data-bs-entity"));
  const ebtn = Array.from(document.querySelectorAll("main button, main [role=button], main [role=link]")).filter((b) => W.__uiVisible(b) && (b.innerText || "").trim().length > 40 && b.getBoundingClientRect().height > 60);
  if (ebtn[0]) ebtn[0].setAttribute("data-bs-entity", "");
  const H = new RegExp(HIRE, "i");
  const hire = Array.from(document.querySelectorAll("button, a[href], [role=button]")).find((b) => W.__uiVisible(b) && !b.closest("header, footer, nav") && !b.disabled && b.getAttribute("aria-disabled") !== "true" && H.test((b.innerText || b.getAttribute("aria-label") || "").trim()));
  const empty = /no (specialists|experts|results|items|profiles|listings)|nothing (here|found|yet)|ничего не найдено|пока нет/i.test(document.body.innerText || "");
  return { items, buttons: ebtn.length, hireable: hire ? (hire.innerText || hire.getAttribute("aria-label") || "").trim().slice(0, 40) : null, empty };
}, { path, HIRE: HIRE_RE.source });
