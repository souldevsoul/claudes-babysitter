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

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null; };
const repo = opt("repo") || process.env.BABYSITTER_ROOT || process.cwd();
const format = opt("format") || "md";
const src = join(repo, ".babysitter/findings.json");
if (!existsSync(src)) { console.error("babysitter fix-plan: no .babysitter/findings.json — run `babysitter e2e` first"); process.exit(2); }
const { findings = [], base } = JSON.parse(readFileSync(src, "utf8"));
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

/* ───────── group: one rule, many pages ───────── */
const ruleOf = (item, test) => (item.what.match(/\[([A-Z]?\d+(?:\.\d+)?[a-z]?|[A-Z]\d|i18n)[,\]]/) || test.match(/^([A-Z]?\d+(?:\.\d+)?(?:\/[\d.]+)?|[A-Z]\d(?:[–-][A-Z]?\d)?|i18n|states)/) || [, "other"])[1];
const groups = new Map();
for (const f of findings) {
  const items = f.items.length ? f.items : [{ what: f.error.split("\n")[0] || f.test, where: "" }];
  for (const it of items) {
    const rule = ruleOf(it, f.test);
    // the same defect at several widths / languages / pages is one entry: normalise numbers and quoted text
    const sig = `${rule}|${it.what.replace(/^\[[\w-]+\]\s*/, "").replace(/\d+(\.\d+)?/g, "#").replace(/"[^"]*"/g, '""').slice(0, 160)}|${it.where.replace(/\d+/g, "#").slice(0, 120)}`;
    if (!groups.has(sig)) groups.set(sig, { rule, what: it.what, where: it.where, pages: new Set(), projects: new Set(), locales: new Set(), roles: new Set(), test: f.test });
    const g = groups.get(sig);
    g.pages.add(f.route || "site-wide");
    g.projects.add(f.project);
    if (f.locale) g.locales.add(f.locale);
    if (f.auth) g.roles.add(f.role);
  }
}
const plan = [...groups.values()].map((g) => {
  const quoted = [...`${g.where} ${g.what}`.matchAll(/"([^"]{4,60})"/g)].map((m) => m[1]).filter((t) => !/^\d|px|\[/.test(t));
  const hints = [...new Set([...[...g.pages].map(pageFile).filter(Boolean).map((f) => `${f} (page)`), ...quoted.flatMap(textHints), ...classHints(g.where)])].slice(0, 6);
  return { ...g, pages: [...g.pages], projects: [...g.projects], locales: [...g.locales], roles: [...g.roles], files: hints };
}).sort((a, b) => b.pages.length - a.pages.length || a.rule.localeCompare(b.rule));
const byRule = new Map();
for (const p of plan) { if (!byRule.has(p.rule)) byRule.set(p.rule, []); byRule.get(p.rule).push(p); }

const rerun = `${RUN} e2e --skip-prepare --last-failed`;
if (format === "json") { console.log(JSON.stringify({ base, rerun, groups: plan }, null, 2)); process.exit(plan.length ? 1 : 0); }
const L = [];
if (!plan.length) L.push("Claude's Babysitter fix plan: nothing to fix in the last run.");
else {
  L.push(`# Babysitter fix plan — ${plan.length} problem(s) from ${findings.length} failed test(s)${base ? ` on ${base}` : ""}`, "");
  L.push("These are blocking. Fix the cause in the source (the kit component / the theme token / the translation), not per page; one fix usually clears every page listed.", "");
  let n = 0;
  for (const [rule, list] of byRule) {
    L.push(`## ${rule} (${list.length})`);
    for (const p of list) {
      n++;
      L.push(`${n}. ${p.what}`);
      if (p.where) L.push(`   - element: ${p.where}`);
      L.push(`   - on: ${p.pages.join(", ")}${p.roles.length ? ` (signed in as ${p.roles.join(", ")})` : ""} @ ${p.projects.join(", ")}${p.locales.length ? ` in ${p.locales.join(", ")}` : ""}`);
      L.push(p.files.length ? `   - look at: ${p.files.join("; ")}` : "   - look at: (no source match — search for the element's text / classes)");
    }
    L.push("");
  }
  L.push("When every item is fixed, re-check only what failed:", `    ${rerun}`, "then run the full suite once before reporting done:", `    ${RUN} e2e`);
}
const text = L.join("\n");
writeFileSync(join(repo, opt("out") || ".babysitter/fix-plan.md"), text + "\n");
console.log(format === "agent" ? text.replace(/^#+ /gm, "") : text);
process.exit(plan.length ? 1 : 0);
