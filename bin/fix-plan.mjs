#!/usr/bin/env node
// babysitter fix-plan [--repo DIR] [--format md|agent|json] [--out FILE]
// Turns the last `babysitter e2e` run (.babysitter/findings.json) into a fix list a coding agent can work through:
// findings grouped by rule (one cause, many pages), each with the pages it is on, the elements, how to fix it, and the
// source files to look at — the route's page file (app/**/page.tsx via the route map), and the files that contain the
// element's text or its classes (a translation key followed to the component that renders it). Ends with the command
// that re-checks only what failed. Writes .babysitter/fix-plan.md as well.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { templateOf } from "../lib/route-map.js";
import { buildProjectMap, placesOf } from "../lib/project-map.js";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null; };
const repo = opt("repo") || process.env.BABYSITTER_ROOT || process.cwd();
const format = opt("format") || "md";
const src = join(repo, ".babysitter/findings.json");
if (!existsSync(src)) { console.error("babysitter fix-plan: no .babysitter/findings.json — run `babysitter e2e` first"); process.exit(2); }
const { findings = [], base, decisions = [], setupMissing = [] } = JSON.parse(readFileSync(src, "utf8"));
const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..");
const RUN = existsSync(join(repo, "node_modules/claudes-babysitter/bin/babysitter.mjs")) ? "npx --no babysitter" : `node ${relative(repo, join(TOOL, "bin/babysitter.mjs"))}`;

/* ───────── the repo's files ───────── */
const files = (() => { try { return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }).split("\n").filter(Boolean); } catch { return []; } })()
  .filter((f) => /\.(tsx|jsx|ts|js|mjs|vue|svelte|astro|html|mdx?|json|css|scss)$/.test(f) && !/(^|\/)(node_modules|\.next|dist|build|tools\/claudes-babysitter|\.babysitter)\//.test(f) && !/package(-lock)?\.json$|tsconfig/.test(f));
const cache = new Map();
const read = (f) => { if (!cache.has(f)) { try { cache.set(f, readFileSync(join(repo, f), "utf8")); } catch { cache.set(f, ""); } } return cache.get(f); };
const pages = files.map((f) => ({ f, t: templateOf(f) })).filter((x) => x.t !== null);
const tplRe = (t) => new RegExp("^" + t.replace(/^\/\[(locale|lang|lng|language)\]/, "(?:/[a-z]{2}(?:-[A-Za-z]{2,4})?)?").replace(/\/\[\[\.\.\.\w+\]\]/g, "(?:/.*)?").replace(/\[\.\.\.\w+\]/g, ".+").replace(/\[\w+\]/g, "[^/]+") + "/?$");
/** The page file that renders `route` (static segments beat dynamic ones), or null. */
function pageFile(route) {
  if (!route) return null;
  const path = route.split("?")[0];
  const hits = pages.filter((p) => tplRe(p.t).test(path)).sort((a, b) => (a.t.match(/\[/g) || []).length - (b.t.match(/\[/g) || []).length);
  return hits[0]?.f || null;
}
const lineOf = (text, needle) => { const i = text.indexOf(needle); return i < 0 ? 0 : text.slice(0, i).split("\n").length; };
/** Files that contain the element's text — through a translation key when the text lives in a messages file. */
function textHints(t) {
  const out = [];
  if (!t || t.length < 4) return out;
  const needle = t.replace(/…$/, "").trim();
  for (const f of files) {
    const s = read(f);
    if (!s.includes(needle)) continue;
    if (/\.json$/.test(f)) {
      // a messages file: find the key, then the components that use it
      const m = s.slice(Math.max(0, s.indexOf(needle) - 200), s.indexOf(needle)).match(/"([\w.-]+)"\s*:\s*"[^"]*$/);
      out.push(`${f}:${lineOf(s, needle)}${m ? ` (key "${m[1]}")` : ""}`);
      if (m) for (const g of files) if (/\.(tsx|jsx|ts|js|vue|svelte)$/.test(g) && new RegExp(`["'\`.]${m[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`).test(read(g))) out.push(`${g}:${lineOf(read(g), m[1])} (renders "${m[1]}")`);
    } else out.push(`${f}:${lineOf(s, needle)}`);
    if (out.length >= 4) break;
  }
  return out;
}
/** Files whose className holds the element's distinctive classes (not utility one-offs like "flex"). */
function classHints(where) {
  const sel = String(where).split(/\s+in\s+|\s"/)[0];
  const last = sel.split(" > ").pop() || "";
  const classes = last.split(".").slice(1).filter((c) => c.length > 3 && !/^(flex|grid|block|hidden|relative|absolute|items-|justify-|gap-|w-|h-|p[xytblr]?-|m[xytblr]?-|text-(xs|sm|base|lg)$)/.test(c));
  if (!classes.length) return [];
  const out = [];
  for (const f of files) {
    if (!/\.(tsx|jsx|vue|svelte|astro|html)$/.test(f)) continue;
    const s = read(f);
    if (classes.every((c) => s.includes(c))) out.push(`${f}:${lineOf(s, classes[0])}`);
    if (out.length >= 3) break;
  }
  return out;
}

/* ───────── the project map: where a finding's text lives ───────── */
let MAP = null;
try { MAP = buildProjectMap(repo).map; } catch { MAP = null; }
/** A fragment to edit: file, line range and the lines themselves (a repair agent reads these, not whole files). */
function fragment(place, around = 3) {
  const text = read(place.file);
  if (!text) return { ...place };
  const lines = text.split("\n");
  const at = place.line || (lineOf(text, place.text?.slice(0, 40) || "") || 1);
  const from = Math.max(1, at - around), to = Math.min(lines.length, at + around);
  return { file: place.file, from, to, at, ...(place.key ? { key: place.key } : {}), lines: lines.slice(from - 1, to).join("\n") };
}
const placesFor = (quote) => (MAP && quote ? placesOf(MAP, quote, { max: 6 }) : []);
// the page a statement is most authoritative on: a policy over pricing over FAQ over the rest
const AUTH = (route = "") => (/terms|privacy|polic|refund|cancel|cookie|aml|acceptable|legal/.test(route) ? 3 : /pricing|payment/.test(route) ? 2 : /faq|help|docs/.test(route) ? 1 : 0);

/* ───────── group: one rule, many pages ───────── */
const ruleOf = (item, test) => (item.what.match(/\[([A-Z]?\d+(?:\.\d+)?[a-z]?|[A-Z]\d|i18n)[,\]]/) || test.match(/^([A-Z]?\d+(?:\.\d+)?(?:\/[\d.]+)?|[A-Z]\d(?:[–-][A-Z]?\d)?|i18n|states)/) || [, "other"])[1];
const groups = new Map();
for (const f of findings) {
  const items = f.items.length ? f.items : [{ what: f.error.split("\n")[0] || f.test, where: "" }];
  for (const [ii, it] of items.entries()) {
    const rule = f.rule || ruleOf(it, f.test);
    // the same defect at several widths / languages / pages is one entry: normalise numbers and quoted text
    const sig = `${rule}|${it.what.replace(/^\[[\w-]+\]\s*/, "").replace(/\d+(\.\d+)?/g, "#").replace(/"[^"]*"/g, '""').slice(0, 160)}|${it.where.replace(/\d+/g, "#").slice(0, 120)}`;
    if (!groups.has(sig)) groups.set(sig, { rule, what: it.what, where: it.where, pages: new Set(), projects: new Set(), locales: new Set(), roles: new Set(), test: f.test, jev: f.jev || null, triage: null });
    const g = groups.get(sig);
    const tr = f.triage?.[ii];
    if (tr && (!g.triage || (tr.p ?? 0) > (g.triage.p ?? 0))) g.triage = tr;
    g.pages.add(f.route || "site-wide");
    g.projects.add(f.project);
    if (f.locale) g.locales.add(f.locale);
    if (f.auth) g.roles.add(f.role);
  }
}
const plan = [...groups.values()].map((g) => {
  const quoted = [...`${g.where} ${g.what}`.matchAll(/"([^"]{4,60})"/g)].map((m) => m[1]).filter((t) => !/^\d|px|\[/.test(t));
  const hints = [...new Set([...[...g.pages].map(pageFile).filter(Boolean).map((f) => `${f} (page)`), ...quoted.flatMap(textHints), ...classHints(g.where)])].slice(0, 6);
  // the exact fragments: where the quoted text lives (project map), and for a consistency finding the other side too
  const j = g.jev;
  const sides = j ? [{ side: "this", route: [...g.pages][0], quote: j.quote, section: j.section }, ...(j.other ? [{ side: "other", route: j.other.route, quote: j.other.quote, section: j.other.section }] : [])] : quoted.slice(0, 2).map((q) => ({ side: "this", route: [...g.pages][0], quote: q }));
  for (const sd of sides) sd.places = placesFor(sd.quote).map((p) => fragment(p));
  let canonical = null;
  if (j?.canonical) canonical = { term: j.canonical, why: "the name most of the site uses (or content.terms.canonical)" };
  else if (j?.other && /^consistency\/(contradiction|one-page|different-words)/.test(g.rule)) {
    const keep = AUTH(sides[1]?.route) > AUTH(sides[0]?.route) ? sides[1] : sides[0];
    canonical = { keep: keep.quote, on: keep.route, why: "suggestion: the statement on the more authoritative page (policy > pricing > FAQ > other); decide which is true, state it once (a constants / messages module) and use it on both pages", live: MAP?.messages?.[0] || null };
  }
  return { ...g, pages: [...g.pages], projects: [...g.projects], locales: [...g.locales], roles: [...g.roles], files: hints, sides, canonical };
}).sort((a, b) => tOrder(a) - tOrder(b) || (b.triage?.p ?? 0) - (a.triage?.p ?? 0) || b.pages.length - a.pages.length || a.rule.localeCompare(b.rule));
function tOrder(g) { return { "likely real": 0, unsure: 1, "not evaluated": 1, "likely noise": 3 }[g.triage?.verdict] ?? (g.jev ? 2 : 1); }
const byRule = new Map();
const noisy = plan.filter((p) => p.triage?.verdict === "likely noise");
// consistency findings are grouped by what they are about (one topic, one canonical wording)
const keyOf = (p) => (/^consistency\//.test(p.rule) ? `consistency: ${p.jev?.topic || "naming"}` : p.rule);
for (const p of plan.filter((x) => !noisy.includes(x))) { const k = keyOf(p); if (!byRule.has(k)) byRule.set(k, []); byRule.get(k).push(p); }

const rerun = `${RUN} e2e --skip-prepare --last-failed`;
if (format === "json") { console.log(JSON.stringify({ base, rerun, groups: plan, decisions, setupMissing }, null, 2)); process.exit(plan.length ? 1 : 0); }
// --format agent: one compact JSON object per finding (a repair agent edits only these fragments)
const agentItem = (p, n) => ({ n, rule: p.rule, level: p.jev?.level || "hard", triage: p.triage ? { verdict: p.triage.verdict, p: p.triage.p, reason: p.triage.reason } : null, why: p.what.replace(/\s+/g, " ").slice(0, 400),
  on: p.pages, ...(p.roles.length ? { roles: p.roles } : {}), ...(p.locales.length ? { locales: p.locales } : {}),
  places: (p.sides || []).flatMap((sd) => sd.places.map((x) => ({ side: sd.side, route: sd.route, ...x }))), ...(p.sides?.some((sd) => !sd.places.length) ? { unplaced: p.sides.filter((sd) => !sd.places.length).map((sd) => ({ side: sd.side, route: sd.route, quote: sd.quote })) } : {}),
  files: p.files, ...(p.canonical ? { canonical: p.canonical } : {}) });
const L = [];
// 5.7.0: what the last run did not check — at the top, so a "nothing to fix" is never read as "everything was checked"
const head = [];
const pagesOf = (g) => [...new Set((g.where || []).map((i) => `${i.route || "site-wide"}${i.auth ? ` [${i.role || "user"}]` : ""}`))];
if (setupMissing.length) {
  head.push(`## Not run — setup missing (${setupMissing.length}): fix the setup, then run \`${RUN} e2e\` again`, "");
  for (const g of setupMissing) head.push(`- ${g.rule}: ${g.reason}`);
  head.push("");
}
if (decisions.length) {
  head.push(`## Babysitter decided not to check (${decisions.length}) — check these by hand, or approve them in babysitter.config.json → acceptance.notApplicable { "<rule>": "<why>" }`, "");
  for (const g of decisions) { const p = pagesOf(g); head.push(`- ${g.rule}: ${g.reason} — ${p.slice(0, 8).join(", ")}${p.length > 8 ? `, … ${p.length - 8} more` : ""}`); }
  head.push("");
}
if (!plan.length) L.push(`Claude's Babysitter fix plan: nothing to fix in the last run${head.length ? " — but it did not check everything (below)" : ""}.`);
else {
  L.push(`# Babysitter fix plan — ${plan.length} problem(s) from ${findings.length} failed test(s)${base ? ` on ${base}` : ""}`, "");
  L.push("These are blocking. Fix the cause in the source (the kit component / the theme token / the translation), not per page; one fix usually clears every page listed.", "");
  let n = 0;
  for (const [rule, list] of byRule) {
    L.push(`## ${rule} (${list.length})`);
    for (const p of list) {
      n++;
      L.push(`${n}. ${p.jev ? `[Jev ${p.jev.p?.toFixed?.(2) ?? ""}${p.jev.level === "disagrees" ? ", babysitter passed" : ""}] ` : ""}${p.what}${p.triage?.verdict === "unsure" ? " (Jev triage: unsure)" : ""}`);
      if (p.where) L.push(`   - element: ${p.where}`);
      for (const sd of p.sides || []) if (sd.places.length) L.push(`   - ${sd.side === "other" ? "other side" : "text"} "${String(sd.quote).slice(0, 90)}": ${sd.places.map((x) => `${x.file}:${x.at}${x.key ? ` (key ${x.key})` : ""}`).join("; ")}`);
      if (p.canonical) L.push(p.canonical.term ? `   - one term: "${p.canonical.term}" (${p.canonical.why})` : `   - canonical wording: "${String(p.canonical.keep).slice(0, 160)}" (${p.canonical.on}) — ${p.canonical.why}`);
      L.push(`   - on: ${p.pages.join(", ")}${p.roles.length ? ` (signed in as ${p.roles.join(", ")})` : ""} @ ${p.projects.join(", ")}${p.locales.length ? ` in ${p.locales.join(", ")}` : ""}`);
      L.push(p.files.length ? `   - look at: ${p.files.join("; ")}` : "   - look at: (no source match — search for the element's text / classes)");
    }
    L.push("");
  }
  if (noisy.length) {
    L.push(`## Jev thinks these are false alarms (${noisy.length}) — still findings: look before dismissing`);
    for (const p of noisy) { n++; L.push(`${n}. ${p.what}`, `   - on: ${p.pages.join(", ")} @ ${p.projects.join(", ")}`, `   - Jev thinks this is a false alarm because ${p.triage.reason || "it does not look like a defect a visitor would notice"} (p(real) ${p.triage.p})`); }
    L.push("");
  }
  L.push("When every item is fixed, re-check only what failed:", `    ${rerun}`, "then run the full suite once before reporting done:", `    ${RUN} e2e`);
}
L.splice(plan.length ? 2 : 1, 0, ...(plan.length || !head.length ? head : ["", ...head]));
const text = L.join("\n");
writeFileSync(join(repo, opt("out") || ".babysitter/fix-plan.md"), text + "\n");
if (format === "agent") {
  // the plan in words, then the machine-readable block: one JSON object per line
  console.log(text.replace(/^#+ /gm, ""));
  console.log("\n--- babysitter fix-plan items (JSON lines: edit only the listed fragments) ---");
  [...[...byRule.values()].flat(), ...noisy].forEach((p, i) => console.log(JSON.stringify(agentItem(p, i + 1))));
} else console.log(text);
process.exit(plan.length ? 1 : 0);
