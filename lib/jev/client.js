// The Jev client (a decision model: "noul" questions answer a probability, "choice" questions a distribution over named
// options). Used by the text pass (`babysitter text`), the consistency engine, the finding triage and the recall net.
//
// Provider: JEV_API_KEY (+ JEV_BASE_URL) is the direct API; else AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN through the
// Vercel AI Gateway. A dotenv file named by BABYSITTER_JEV_ENV or babysitter.config.json → jev.envFile is read when
// nothing is set in the environment. BABYSITTER_JEV_URL points the client at another endpoint (the tests' mock).
// The token is never printed, logged or written anywhere.
//
// Every request is cached on disk by a hash of its body (.babysitter/jev-cache/): a re-run pays only for what changed.
// 60 s timeout per request, up to 6 tries with jittered back-off honouring Retry-After, concurrency drops to 2 then 1
// on 429 and recovers, no new calls after the deadline or once the budget (USD) is spent — a run always ends with a
// (possibly partial) result, and says so.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const GATEWAY = "https://ai-gateway.vercel.sh/typesafe/v1/systemone";
const DIRECT = "https://jevtypesafeai.com/api/v1/decide";

/** Read KEY=VALUE lines of a dotenv file into env (keys already set win). Never echoes values. */
export function readEnvFile(file, env = process.env) {
  if (!file) return false;
  try {
    for (const l of fs.readFileSync(file, "utf8").split("\n")) {
      const m = l.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, "$2");
    }
    return true;
  } catch { return false; }
}

/** Which provider a run would use, without the secret: { ok, provider, endpoint, model } (ok false: no token). */
export function jevProvider(env = process.env, cfg = {}) {
  readEnvFile(env.BABYSITTER_JEV_ENV || cfg?.jev?.envFile, env);
  const direct = !!env.JEV_API_KEY;
  const token = env.JEV_API_KEY || env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN || "";
  const endpoint = env.BABYSITTER_JEV_URL || (direct ? env.JEV_BASE_URL || DIRECT : GATEWAY);
  return { ok: !!token, token, direct, provider: env.BABYSITTER_JEV_URL ? "custom endpoint" : direct ? "Jev API" : "AI Gateway", endpoint, model: direct ? "jev-latest" : "typesafe-ai/jev" };
}

const tok = (x) => Math.ceil((typeof x === "string" ? x : JSON.stringify(x)).length / 3.6);

/**
 * @param {{ cache?: string|null, concurrency?: number, deadlineMin?: number, budgetUsd?: number, env?: object, cfg?: object,
 *   log?: (...a: any[]) => void, fetchImpl?: typeof fetch, retryBaseMs?: number }} o
 */
export function makeJev({ cache = null, concurrency = 4, deadlineMin = 30, budgetUsd = 2, env = process.env, cfg = {}, log = (...a) => console.error(...a), fetchImpl = globalThis.fetch, retryBaseMs = 5000 } = {}) {
  const P = jevProvider(env, cfg);
  if (!P.ok) throw new Error("Jev off: no token (JEV_API_KEY, AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN)");
  const MAX_Q = P.direct ? 50 : 1000; // the direct API caps a request at 50 questions
  if (cache) fs.mkdirSync(cache, { recursive: true });
  const deadline = Date.now() + deadlineMin * 60000;
  const stats = { calls: 0, cached: 0, cost: 0, failed: 0, throttled: 0, questions: 0, budgetHit: false, deadlineHit: false, ms: 0 };
  const gate = { limit: concurrency, active: 0, ok: 0, waiters: [] };
  const acquire = () => new Promise((res) => { const go = () => { if (gate.active < gate.limit) { gate.active++; res(); } else gate.waiters.push(go); }; go(); });
  const release = () => { gate.active--; const w = gate.waiters.shift(); if (w) w(); };
  const throttle = () => { gate.limit = gate.limit > 2 ? 2 : 1; gate.ok = 0; };
  const recover = () => { if (++gate.ok >= 15 && gate.limit < concurrency) { gate.limit++; gate.ok = 0; const w = gate.waiters.shift(); if (w) w(); } };
  const past = () => { if (Date.now() > deadline) stats.deadlineHit = true; return stats.deadlineHit; };
  const broke = () => { if (budgetUsd > 0 && stats.cost >= budgetUsd) stats.budgetHit = true; return stats.budgetHit; };

  async function call(state, questions, tries = 6) {
    const body = JSON.stringify({ model: P.model, state, questions });
    const file = cache && path.join(cache, crypto.createHash("sha1").update(body).digest("hex") + ".json");
    if (file && fs.existsSync(file)) { stats.cached++; return JSON.parse(fs.readFileSync(file, "utf8")); }
    let last = "";
    for (let t = 0; t < tries && !past() && !broke(); t++) {
      await acquire();
      let r, d;
      const t0 = Date.now();
      try {
        r = await fetchImpl(P.endpoint, { method: "POST", signal: AbortSignal.timeout(60000), headers: { Authorization: `Bearer ${P.token}`, "Content-Type": "application/json" }, body });
        d = await r.json().catch(() => ({}));
      } catch (e) { r = { ok: false, status: 0, headers: new Headers() }; d = { message: String(e?.message || e).replace(P.token, "***") }; }
      stats.ms += Date.now() - t0;
      release();
      if (r.ok && d.answers) {
        recover(); stats.calls++; stats.questions += Object.keys(questions).length;
        stats.cost += Number(d.provider_metadata?.gateway?.cost || d.usage?.cost_usd || 0);
        if (file) fs.writeFileSync(file, JSON.stringify(d.answers));
        return d.answers;
      }
      if (r.status === 401 || r.status === 403) { stats.failed++; throw Object.assign(new Error(`Jev ${r.status}: the token was refused (refresh it)`), { auth: true }); }
      if ([400, 413, 422].includes(r.status)) { last = `${r.status} ${JSON.stringify(d).slice(0, 300)}`; break; }
      if (r.status === 429) { stats.throttled++; throttle(); }
      last = `${r.status} ${String(d.error?.message || d.message || "").slice(0, 120)}`;
      const after = Number(r.headers?.get?.("retry-after")) * 1000;
      await new Promise((s) => setTimeout(s, after > 0 ? Math.min(after, 90000) : Math.min(90000, retryBaseMs * 2 ** t) * (0.5 + Math.random())));
    }
    stats.failed++;
    log(`Jev call failed${stats.deadlineHit ? " (deadline)" : stats.budgetHit ? " (budget spent)" : ""}: ${last}`);
    return null;
  }

  /** Ask a set of questions about one state; split so each request stays under ~60k tokens. Missing answers: absent keys. */
  async function ask(state, questions) {
    // Jev 400s a choice with fewer than 2 options and fails the whole request: answer a one-option choice here.
    const local = {}, send = {};
    for (const [k, q] of Object.entries(questions)) {
      const opts = q.type === "choice" ? Object.keys(q.criteria || {}) : null;
      if (!opts || opts.length >= 2) send[k] = q;
      else if (opts.length === 1) local[k] = { choice: opts[0], probabilities: { [opts[0]]: 1 }, confidence: 1 };
    }
    const base = tok(state), parts = [];
    let cur = {}, size = base;
    for (const [k, q] of Object.entries(send)) {
      const s = tok(q);
      if (Object.keys(cur).length && (size + s > 60000 || Object.keys(cur).length >= MAX_Q)) { parts.push(cur); cur = {}; size = base; }
      cur[k] = q; size += s;
    }
    if (Object.keys(cur).length) parts.push(cur);
    const got = await Promise.all(parts.map((q) => call(state, q)));
    return Object.assign({}, local, ...got.filter(Boolean));
  }
  async function pool(items, fn, n = concurrency) {
    const out = new Array(items.length);
    let i = 0;
    await Promise.all(Array.from({ length: Math.max(1, n) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
    return out;
  }
  return { ask, pool, stats, past, broke, provider: { name: P.provider, model: P.model } };
}

export const noul = (instructions) => ({ type: "noul", instructions });
export const choice = (instructions, criteria) => ({ type: "choice", instructions, criteria });
/** p(yes) of a noul answer, 0 when missing. */
export const pYes = (a) => (a && typeof a.noul === "number" ? a.noul : 0);
