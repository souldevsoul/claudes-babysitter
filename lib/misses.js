// `babysitter misses` — the miss loop. After every tester round: pull the people's cards for each babysitter-adopted
// project from Nexus, put each one in exactly one bucket, write misses/<product>-<date>.md and print the catch rate.
//   CAUGHT        the last run's findings.json reported it — and it shipped anyway: a process problem (it should block)
//   MISSED        in scope, but no check, or a check that passed: becomes a fixture + a check that fails on the old version
//   OUT OF SCOPE  a product decision, taste, or a copy judgement — with the reason
// A heuristic (or an LLM, through the labels file) may SUGGEST the bucket; only a person confirms it. Every suggested
// bucket is printed as "suggested — needs human confirm" until misses/labels/<product>.json says confirmed: true.
// catch rate = CAUGHT / (CAUGHT + MISSED), suggested and confirmed together (the file says how many are unconfirmed).
// Plain JavaScript, no dependencies (global fetch). The Nexus key is read from the environment and never printed.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export const BUCKETS = ["CAUGHT", "MISSED", "OUT OF SCOPE"];
const readJson = (f, fallback = null) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return fallback; } };

/* ───────────────────────── Nexus ───────────────────────── */

/** The Nexus base URL and API key from the environment (NEXUS_URL; NEXUS_API_KEY, or the first of NEXUS_API_KEYS). */
export function nexusEnv(env = process.env) {
  const url = String(env.NEXUS_URL || "").replace(/\/+$/, "");
  const key = String(env.NEXUS_API_KEY || String(env.NEXUS_API_KEYS || "").split(",")[0] || "").trim();
  return { url, key };
}

/**
 * Every card of a project the REST API lists (GET /api/mcp/projects/<slug>/bugs — the bug cards: severity set).
 * `fetchImpl` is injectable for tests. The key goes in the Authorization header only; errors never echo it.
 */
export async function fetchCards({ url, key, slug, limit = 2000, fetchImpl = globalThis.fetch }) {
  if (!url) throw new Error("NEXUS_URL is not set");
  if (!key) throw new Error("NEXUS_API_KEY (or NEXUS_API_KEYS) is not set");
  const res = await fetchImpl(`${url}/api/mcp/projects/${encodeURIComponent(slug)}/bugs?limit=${limit}`, { headers: { Authorization: `Bearer ${key}` } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Nexus ${slug}: HTTP ${res.status}${res.status === 404 ? " (no such project for this key's organisation)" : ""}`);
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`Nexus ${slug}: the reply is not JSON`); }
  const list = Array.isArray(data) ? data : data.bugs || data.cards || [];
  return list;
}

/* ───────────────────────── which cards count ───────────────────────── */

export const DEFAULT_EXCLUDE_AUTHORS = ["Admin"];
// "QA · deploy 2026-10-19 …" — the cards a deploy check opens by itself
export const QA_DEPLOY_RE = /^\s*QA\s*[·•∙|:-]\s/;

const author = (c) => (c.createdBy && (c.createdBy.name || c.createdBy.email)) || c.createdByName || "";

/** A person's card, created after `since`: not by an excluded author (Admin), not a "QA · …" deploy card. */
export function humanCards(cards, { since = null, until = null, excludeAuthors = DEFAULT_EXCLUDE_AUTHORS } = {}) {
  const ex = new Set(excludeAuthors.map((x) => x.toLowerCase()));
  const s = since ? new Date(since).getTime() : -Infinity, u = until ? new Date(until).getTime() : Infinity;
  const out = { cards: [], excluded: { author: 0, deploy: 0, before: 0 } };
  for (const c of cards) {
    const t = new Date(c.createdAt).getTime();
    if (!(t > s && t <= u)) { out.excluded.before++; continue; }
    if (ex.has(String(author(c)).toLowerCase())) { out.excluded.author++; continue; }
    if (QA_DEPLOY_RE.test(c.title || "")) { out.excluded.deploy++; continue; }
    out.cards.push(c);
  }
  out.cards.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return out;
}

/** The card's one-line title: markdown labels ("**Name:**", "[BUG]", "**Заголовок (RU):**") and bullets removed. */
export function cardTitle(c) {
  const raw = `${c.title || ""}\n${c.description || ""}`;
  for (const line of raw.split("\n")) {
    const t = line.replace(/\*\*[^*]{1,30}:\*\*/g, "").replace(/^\s*(\[BUG\]|[*•-])\s*/i, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
    if (t.length > 3 && !/^(steps|шаги|где|actual|expected)\b/i.test(t)) return t.length > 140 ? `${t.slice(0, 139)}…` : t;
  }
  return "(no title)";
}

/* ───────────────────────── findings of the last run ───────────────────────── */

/** findings.json files (several shards or viewports of one run) → one flat list. */
export function loadFindings(files) {
  const list = [];
  const at = [];
  for (const f of files) {
    const d = readJson(f);
    if (!d) throw new Error(`${f}: not a findings.json`);
    if (d.at) at.push(d.at);
    for (const x of d.findings || []) list.push(x);
  }
  return { findings: list, at: at.sort().at(-1) || null };
}

// what a card talks about → the checks that cover it (by the id in the finding's test title)
const TOPICS = [
  { re: /scroll|прокру|scrolled|stays (at the )?bottom|остаётся внизу|к началу|to the top/i, checks: ["3.8", "4.4"] },
  { re: /cookie|куки|consent|decline|reject|отклон/i, checks: ["4.6", "C1", "C2", "C4", "C5"] },
  { re: /overflow|выходит за|обрез|clipped|cut off|шире экрана|wider than|spills|не помещается/i, checks: ["2.1", "2.10", "N6", "2.3"] },
  { re: /по буквам|letter by letter|mid-?word|перенос|wrap/i, checks: ["2.5"] },
  { re: /radius|скругл|углы|corners|square|квадрат/i, checks: ["1.17", "1.3/1.16", "1.3"] },
  { re: /autofill|autocomplete|подставляется|username/i, checks: ["FM", "A"] },
  { re: /error|ошибк|success|успех/i, checks: ["FM3", "FM4"] },
  { re: /contrast|контраст|unreadable|не читается/i, checks: ["6.4"] },
  { re: /hover|навед/i, checks: ["1.6", "H1"] },
  { re: /footer|футер/i, checks: ["F0", "F1", "N4", "3.7"] },
  { re: /policy|политик|terms|agreement/i, checks: ["P1", "P2", "P3", "CT"] },
];

/** Paths a card names (URLs on any host, or "/route" words). */
export function cardRoutes(c) {
  const text = `${c.title || ""}\n${c.description || ""}`;
  const out = new Set();
  for (const m of text.matchAll(/https?:\/\/[^\s/)]+(\/[^\s)?#»"'`,]*)?/g)) out.add((m[1] || "/").replace(/\/+$/, "") || "/");
  for (const m of text.matchAll(/(?:^|[\s(«"'`])(\/[a-z][a-z0-9-]*(?:\/[a-z0-9<>[\]-]+)*)/gi)) if (!/^\/(api|_next)\b/.test(m[1])) out.add(m[1].replace(/<[^>]+>|\[[^\]]+\]/g, "*"));
  return [...out];
}
const routeMatch = (pattern, route) => { if (!route) return false; const rx = new RegExp(`^${pattern.replace(/[.+?^${}()|\\]/g, "\\$&").replace(/\*/g, "[^/]+")}$`); return rx.test(route) || (pattern !== "/" && route.startsWith(`${pattern}/`)); };

/** The check ids a finding carries: the tokens of its test title before the first "[" ("states 2.10/2.1/…/4.4 inside …"
 *  → 2.10, 2.1, 4.4) and the ids its items cite ("… [4.4, P52]"). */
export function findingIds(f) {
  const ids = new Set();
  const head = String(f.test || "").split("[")[0];
  for (const t of head.split(/[\s/–]+/)) if (/^([0-9]+\.[0-9]+|[A-Z]{1,3}[0-9]{0,2})$/.test(t)) ids.add(t);
  for (const it of f.items || []) for (const m of String(it.what || "").matchAll(/\[([^\]]+)\]/g)) for (const t of m[1].split(/[,\s/]+/)) if (/^([0-9]+\.[0-9]+|[A-Z]{1,3}[0-9]{1,2})$/.test(t)) ids.add(t);
  return ids;
}
/** Findings of the last run that look like this card: a check of the card's topic, on a page the card names. */
export function matchFindings(c, findings) {
  const text = `${c.title || ""}\n${c.description || ""}`;
  const checks = TOPICS.filter((t) => t.re.test(text)).flatMap((t) => t.checks);
  if (!checks.length) return [];
  // a card that names no page cannot be tied to a finding: no suggestion of CAUGHT from the heuristic (an LLM or a
  // person labels it instead) — "any page" matched every finding of the topic and inflated the catch rate
  const routes = cardRoutes(c);
  if (!routes.length) return [];
  return findings.filter((f) => { const ids = findingIds(f); return checks.some((id) => ids.has(id) || (id.length <= 3 && /^[A-Z]+$/.test(id) && [...ids].some((x) => x.startsWith(id)))) && routes.some((r) => routeMatch(r, f.route)); });
}

/* ───────────────────────── buckets ───────────────────────── */

const DECISION = /\b(kind|type):decision\b/;
/**
 * One bucket per card. A label from misses/labels/<product>.json wins (confirmed: true = a person decided; otherwise it
 * is a suggestion, from an LLM or a person who has not confirmed yet). Without a label the heuristic suggests:
 * a finding of the last run that matches → CAUGHT; a card labelled as a decision → OUT OF SCOPE; else MISSED.
 */
export function classify(c, { findings = [], labels = {} } = {}) {
  const id = c.id;
  const short = String(id).slice(-6);
  const label = labels[id] || labels[short];
  if (label && BUCKETS.includes(label.bucket))
    return { bucket: label.bucket, confirmed: label.confirmed === true, by: label.by || (label.confirmed ? "person" : "suggested"), why: label.why || "", check: label.check || "", fixture: label.fixture || "", oldPassed: label.oldPassed || "", summary: label.summary || "", findings: label.bucket === "CAUGHT" ? matchFindings(c, findings) : [] };
  const hits = matchFindings(c, findings);
  if (hits.length)
    return { bucket: "CAUGHT", confirmed: false, by: "heuristic", why: `the last run reported ${hits.length} matching finding(s): ${[...new Set(hits.map((h) => `${String(h.test).split(" ")[0]} on ${h.route}`))].slice(0, 3).join("; ")}`, check: "", fixture: "", oldPassed: "", summary: "", findings: hits };
  if (DECISION.test((c.labels || []).join(" ")))
    return { bucket: "OUT OF SCOPE", confirmed: false, by: "heuristic", why: "labelled as a product decision", check: "", fixture: "", oldPassed: "", summary: "", findings: [] };
  return { bucket: "MISSED", confirmed: false, by: "heuristic", why: "no finding of the last run matches it", check: "", fixture: "", oldPassed: "", summary: "", findings: [] };
}

export function catchRate(rows) {
  const n = (b) => rows.filter((r) => r.bucket === b).length;
  const caught = n("CAUGHT"), missed = n("MISSED"), oos = n("OUT OF SCOPE");
  const rate = caught + missed ? caught / (caught + missed) : null;
  return { caught, missed, oos, total: rows.length, unconfirmed: rows.filter((r) => !r.confirmed).length, rate, text: rate === null ? "n/a (nothing in scope)" : `${caught}/${caught + missed} = ${Math.round(rate * 100)}%` };
}

/* ───────────────────────── report ───────────────────────── */

const cell = (s) => String(s || "").replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
const status = (r) => (r.confirmed ? "confirmed" : "**suggested — needs human confirm**");

/** misses/<product>-<date>.md. Authors are left out unless `authors` (the repo is public; cards are people's work). */
export function renderReport({ product, slug, since, until, findingsAt, findingsFiles = [], rows, excluded, version, authors = false }) {
  const r = catchRate(rows);
  const L = [];
  L.push(`# Misses — ${product} — ${until.slice(0, 10)}`, "");
  L.push(`Cards from people on Nexus project \`${slug}\` created after ${since} and up to ${until}, against the last run's findings${findingsAt ? ` (run at ${findingsAt})` : ""}. Babysitter ${version}.`, "");
  L.push(`**Catch rate: ${r.text}** — CAUGHT ${r.caught} · MISSED ${r.missed} · OUT OF SCOPE ${r.oos} · ${r.total} cards${r.unconfirmed ? ` · **${r.unconfirmed} suggested, need a person to confirm**` : " · all confirmed"}.`, "");
  L.push(`Left out: ${excluded.author} by an excluded author (Admin), ${excluded.deploy} "QA · …" deploy cards. Source: Nexus REST \`GET /api/mcp/projects/${slug}/bugs\`, which lists the cards that have a severity — a card filed without one is not seen here.`, "");
  L.push("CAUGHT = the last run reported it (a process problem: the finding should have blocked). MISSED = in scope, no check or a check that passed — it gets a fixture that fails on the old version. OUT OF SCOPE = a product decision, taste or a copy judgement.", "");
  for (const b of BUCKETS) {
    const list = rows.filter((x) => x.bucket === b);
    L.push(`## ${b} (${list.length})`, "");
    if (!list.length) { L.push("None.", ""); continue; }
    if (b === "MISSED") {
      L.push(`| card | date | ${authors ? "by | " : ""}what | check / fixture | why the old check passed | status |`, `|---|---|${authors ? "---|" : ""}---|---|---|---|`);
      for (const x of list) L.push(`| ${x.short} | ${x.date} | ${authors ? `${cell(x.author)} | ` : ""}${cell(x.summary || x.title)} | ${cell([x.check, x.fixture].filter(Boolean).join(" — ") || "to do")} | ${cell(x.oldPassed || x.why)} | ${status(x)} |`);
    } else {
      L.push(`| card | date | ${authors ? "by | " : ""}what | why | status |`, `|---|---|${authors ? "---|" : ""}---|---|---|`);
      for (const x of list) L.push(`| ${x.short} | ${x.date} | ${authors ? `${cell(x.author)} | ` : ""}${cell(x.summary || x.title)} | ${cell(x.why)}${x.check ? ` (${cell(x.check)})` : ""} | ${status(x)} |`);
    }
    L.push("");
  }
  if (findingsFiles.length) L.push(`Findings compared: ${findingsFiles.length} findings.json file(s).`, "");
  L.push("To confirm or change a bucket: edit `misses/labels/" + slug + ".json` (`\"confirmed\": true`) and run `babysitter misses` again.", "");
  return L.join("\n");
}

/* ───────────────────────── one product ───────────────────────── */

export function loadState(file) { return readJson(file, { projects: {} }) || { projects: {} }; }
export function saveState(file, state) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`); }

/**
 * The whole loop for one product. Returns { rows, rate, file, text }. `now` and `fetchImpl` are injectable.
 * since: the --since option, else the state file's last run for this project, else 14 days back.
 */
export async function runMisses({ slug, product = slug, since = null, findingsFiles = [], labelsFile, outDir, stateFile, version = "?", env = process.env, fetchImpl, now = new Date(), write = true, authors = false, excludeAuthors }) {
  const state = loadState(stateFile);
  const from = since || state.projects?.[slug]?.lastRun || new Date(now.getTime() - 14 * 864e5).toISOString();
  const until = now.toISOString();
  const { url, key } = nexusEnv(env);
  const all = await fetchCards({ url, key, slug, fetchImpl });
  const { cards, excluded } = humanCards(all, { since: from, until, excludeAuthors });
  const { findings, at } = findingsFiles.length ? loadFindings(findingsFiles) : { findings: [], at: null };
  const labels = (labelsFile && readJson(labelsFile, {})) || {};
  const rows = cards.map((c) => ({ id: c.id, short: String(c.id).slice(-6), date: String(c.createdAt).slice(0, 10), author: author(c), title: cardTitle(c), ...classify(c, { findings, labels }) }));
  const rate = catchRate(rows);
  const text = renderReport({ product, slug, since: from, until, findingsAt: at, findingsFiles, rows, excluded, version, authors });
  const file = join(outDir, `${slug}-${until.slice(0, 10)}.md`);
  if (write) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(file, text);
    state.projects = state.projects || {};
    state.projects[slug] = { lastRun: until, since: from, cards: rows.length, catchRate: rate.text, report: file.split(/[\\/]/).slice(-2).join("/") };
    saveState(stateFile, state);
  }
  return { rows, rate, file, text, excluded, findingsAt: at };
}
