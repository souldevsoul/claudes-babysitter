// Stage: is the product in PRODUCTION (live) or in TESTING / DEVELOPMENT (test)? (5.2.0, owner rule)
//   source of truth: the Nexus project status — LIVE = live, anything else = test;
//   override: babysitter.config.json → stage: "live" | "test" (the reason in allowReasons.stage).
// `babysitter prepare` asks Nexus when NEXUS_URL and NEXUS_API_KEY (or NEXUS_API_KEYS) are set and writes
// .babysitter/stage.json { stage, status, testCredentials, at } — testCredentials is only true/false: the
// credentials themselves are never written. The stage gates (playwright/checks/stage.js) read resolveStage().
//   live — no test or generated entity may be shown (test specialists, "Arman Test", demo data): hard (ST1);
//   test — the main flows must be walkable: a non-empty catalog, an entity that can be hired, a test account per
//          role; test entities are allowed, but carry a visible "test" marker (ST2, ST3).
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const STAGES = ["live", "test"];
export const stageFromStatus = (status) => (String(status || "").toUpperCase() === "LIVE" ? "live" : "test");

/** { stage, from } — the config wins, then what prepare recorded from Nexus; null when neither says. */
export function resolveStage(cfg = {}, savedFile = null) {
  if (STAGES.includes(cfg.stage)) return { stage: cfg.stage, from: "babysitter.config.json → stage" };
  if (savedFile && existsSync(savedFile)) {
    try { const s = JSON.parse(readFileSync(savedFile, "utf8")); if (STAGES.includes(s.stage)) return { stage: s.stage, from: `Nexus project status ${s.status || "?"}`, testCredentials: s.testCredentials ?? null }; } catch { }
  }
  return null;
}

/** Asks Nexus for the project's status (GET /api/mcp/projects/<slug>). The key goes in the header only. */
export async function fetchStage({ url, key, slug, fetchImpl = globalThis.fetch }) {
  if (!url || !key || !slug) return null;
  const res = await fetchImpl(`${url.replace(/\/+$/, "")}/api/mcp/projects/${encodeURIComponent(slug)}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`Nexus ${slug}: HTTP ${res.status}`);
  const p = JSON.parse(await res.text());
  const tc = p.testCredentials;
  return { stage: stageFromStatus(p.status), status: p.status || null, testCredentials: !!(tc && (typeof tc === "string" ? tc.trim() : Object.keys(tc).length)), at: new Date().toISOString() };
}

export function saveStage(file, s) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, `${JSON.stringify(s, null, 2)}\n`); }

// what a test or generated entity looks like on a page: shared by ST1 (live: none may show) and ST2 (test: marked)
export const TEST_ENTITY = [
  /\b(test|demo|dummy|fake|sample|qa)[ -]?(user|account|specialist|profile|client|buyer|seller|customer|company|expert|freelancer|task|order|listing)\b/i,
  // a person named "… Test" (ArmanTest, Arman Test) — not "Unit Test", "A/B Test", "Speed Test", "QA & Test …"
  /\b(?!(?:Unit|Speed|Load|User|Usability|Beta|Smoke|Integration|Stress|Pen|Penetration|Split|Blood|Drug|Final|Free|Acid|Turing|Stress|Crash|Field|Pilot|Placement|Skills?|Knowledge|Entry|Online)\b)[A-Z][a-zà-ž]{2,} ?Test\b(?! (Automation|Case|Plan|Suite|Run|Drive|Data)\b)/u, /\[(test|demo)\]/i, /\(test\)/i,
  // test accounts as the products define them (lib/app-stage.ts): qa.*@ / *.review.*@mailto.plus, qa-nexus@…,
  // and the reserved domains (example.com / .org / .net, *.test, *.example, *.invalid)
  /\bqa[-_.]?[\w-]*@[\w.-]+/i, /\b[\w.+-]*\.review\.[\w.+-]*@[\w.-]+/i, /[\w.+-]+@(?:[\w-]+\.)*(example\.(com|org|net)|[\w-]+\.(test|example|invalid))\b/i,
  /\b(тест|тестовый|тестовая)\s+\p{L}+/iu,
];
export const testEntityMatch = (text) => { for (const re of TEST_ENTITY) { const m = String(text || "").match(re); if (m) return m[0]; } return null; };
