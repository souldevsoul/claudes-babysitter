#!/usr/bin/env node
// babysitter profile [--report .babysitter/report.json] [--target 40x3x2x3] [--workers 4] [--format md|json]
// Where a run's time went: per suite, per viewport, per locale, per role, per-page vs site-wide tests — from the
// Playwright JSON report of a normal (not express) run, and an extrapolation to a product of another size:
//   --target ROUTESxVIEWPORTSxLOCALESxROLES (default 40x3x2x3: 40 routes, 3 viewports, 2 languages, 3 roles)
// Model: a per-page test costs its measured mean per route × viewport it ran at × locale (when it reads a language)
// × role; a site-wide test reads every page, so it grows with routes × roles × locales. Times are serial (one
// worker); wall time ≈ serial / workers.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseTitle } from "../lib/run-summary.js";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const ROOT = resolve(process.env.BABYSITTER_ROOT || process.cwd());
const report = JSON.parse(readFileSync(resolve(opt("report", join(ROOT, ".babysitter/report.json"))), "utf8"));
const [TR, TV, TL, TRo] = opt("target", "40x3x2x3").split("x").map(Number);
const WORKERS = Number(opt("workers", 4));

export function profile(report, { target = [40, 3, 2, 3], workers = 4 } = {}) {
  const [tr, tv, tl, tro] = target;
  const list = [];
  const walk = (s, path) => {
    for (const x of s.suites || []) walk(x, [...path, x.title]);
    for (const sp of s.specs || []) for (const t of sp.tests || []) for (const r of (t.results || []).slice(-1)) list.push({ path: [...path, sp.title], title: sp.title, project: t.projectName, status: r.status, ms: r.duration || 0, file: sp.file || path[0] });
  };
  for (const s of report.suites || []) walk(s, [s.title]);
  const ran = list.filter((r) => r.status !== "skipped");
  const projects = [...new Set(list.map((r) => r.project))].filter((p) => p !== "product");
  const pageKeys = new Set(), roles = new Set(), locales = new Set();
  for (const r of ran) { const t = parseTitle(r.path); r.t = t; if (t.route) pageKeys.add(`${t.role || "public"} ${t.route}`); roles.add(t.role || "public"); if (t.locale) locales.add(t.locale); }
  const fx = { routes: pageKeys.size || 1, viewports: projects.length || 1, locales: 1 + locales.size, roles: roles.size || 1 };
  const suiteOf = (r) => (r.project === "product" ? "product" : parseTitle(r.path).suite);
  const fam = new Map();
  for (const r of ran) {
    const t = parseTitle(r.path);
    const key = `${suiteOf(r)}|${t.route ? "page" : "site"}|${r.title.replace(/\[[a-z]{2,3}(-[A-Za-z]{2,4})?\]/g, "[loc]")}`;
    if (!fam.has(key)) fam.set(key, { suite: suiteOf(r), kind: t.route ? "page" : "site", title: r.title, n: 0, ms: 0, projects: new Set(), locale: false });
    const f = fam.get(key);
    f.n++; f.ms += r.ms; f.projects.add(r.project); if (t.locale || /^(i18n|states) \[/.test(r.title)) f.locale = true;
  }
  const out = { fixture: { ...fx, tests: ran.length, skipped: list.length - ran.length, serialMs: ran.reduce((a, r) => a + r.ms, 0) }, target: { routes: tr, viewports: tv, locales: tl, roles: tro, workers }, suites: {}, byProject: {}, byLocale: {}, byRole: {} };
  for (const r of ran) {
    out.byProject[r.project] = (out.byProject[r.project] || 0) + r.ms;
    const lo = r.t.locale || "default"; out.byLocale[lo] = (out.byLocale[lo] || 0) + r.ms;
    const ro = r.t.role || (r.t.route ? "public" : "site-wide"); out.byRole[ro] = (out.byRole[ro] || 0) + r.ms;
  }
  for (const f of fam.values()) {
    const s = (out.suites[`${f.suite}${f.kind === "site" ? " (site-wide)" : ""}`] ||= { fixtureMs: 0, targetMs: 0, tests: 0, targetTests: 0 });
    s.fixtureMs += f.ms; s.tests += f.n;
    const vpShare = f.projects.size / (fx.viewports || 1); // runs at every viewport, or at some (desktop only, the edges)
    const locs = f.locale ? Math.max(1, tl - 1) : 1;      // a locale test runs per other language
    if (f.kind === "page") {
      const unit = f.ms / f.n; // per route × viewport × locale × role
      const count = tr * tro * Math.max(1, Math.round(tv * vpShare)) * locs;
      s.targetMs += unit * count; s.targetTests += count;
    } else {
      // a site-wide test reads every page of every language it covers: it grows with the pages
      const grow = (tr * tro * tl) / (fx.routes * fx.locales);
      s.targetMs += f.ms * grow * (Math.max(1, Math.round(tv * vpShare)) / Math.max(1, f.projects.size)); s.targetTests += f.n;
    }
  }
  // time the report does not give to a test: worker start, browser launch, fixtures (wall × workers − Σ tests)
  const wall = report.stats?.duration || 0, w = Number(report.config?.workers || report.config?.metadata?.actualWorkers || 1);
  out.fixture.wallMs = wall;
  out.fixture.overheadShare = wall ? Math.max(0, 1 - out.fixture.serialMs / (wall * w)) : 0;
  out.targetSerialMs = Object.values(out.suites).reduce((a, s) => a + s.targetMs, 0) / Math.max(0.05, 1 - out.fixture.overheadShare);
  out.targetWallMs = out.targetSerialMs / workers;
  return out;
}

const min = (ms) => (ms / 60000).toFixed(ms >= 600000 ? 0 : 1);
const p = profile(report, { target: [TR, TV, TL, TRo], workers: WORKERS });
if (opt("format", "md") === "json") console.log(JSON.stringify(p, null, 2));
else {
  const f = p.fixture, t = p.target;
  console.log(`Fixture: ${f.routes} route×role page(s), ${f.viewports} viewport(s), ${f.locales} language(s), ${f.roles} role(s) — ${f.tests} tests ran (${f.skipped} skipped), ${min(f.serialMs)} min serial`);
  if (f.wallMs) console.log(`Wall ${min(f.wallMs)} min; outside tests (worker start, browser launch, fixtures): ${(100 * f.overheadShare).toFixed(0)}% — counted in the target`);
  console.log(`Target: ${t.routes} routes × ${t.viewports} viewports × ${t.locales} languages × ${t.roles} roles — ${min(p.targetSerialMs)} min serial, ~${min(p.targetWallMs)} min wall at ${t.workers} workers\n`);
  console.log("| suite | fixture s | share | target tests | target min (serial) |\n|---|---|---|---|---|");
  for (const [k, s] of Object.entries(p.suites).sort((a, b) => b[1].targetMs - a[1].targetMs)) console.log(`| ${k} | ${(s.fixtureMs / 1000).toFixed(0)} | ${((100 * s.fixtureMs) / f.serialMs).toFixed(0)}% | ${s.targetTests} | ${min(s.targetMs)} |`);
  console.log(`\nby viewport: ${Object.entries(p.byProject).map(([k, v]) => `${k} ${(v / 1000).toFixed(0)} s`).join(" · ")}`);
  console.log(`by language: ${Object.entries(p.byLocale).map(([k, v]) => `${k} ${(v / 1000).toFixed(0)} s`).join(" · ")}`);
  console.log(`by role: ${Object.entries(p.byRole).map(([k, v]) => `${k} ${(v / 1000).toFixed(0)} s`).join(" · ")}`);
}
