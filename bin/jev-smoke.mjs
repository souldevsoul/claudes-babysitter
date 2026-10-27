#!/usr/bin/env node
// npm run jev:smoke -- <https://site> [--max 10] [--facts FILE] [--profile house] [--context FILE]
// One live run of the text pass against a public site, signed out, read-only (GET pages only; the dialog reader aborts
// every request that is not a GET): at most --max pages found from / and the sitemap. Prints time, Jev cost and the
// findings. Needs a Jev token (JEV_API_KEY, AI_GATEWAY_API_KEY, VERCEL_OIDC_TOKEN or BABYSITTER_JEV_ENV=<dotenv file>).
// Not part of `npm test` (it calls the network and costs money).
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (k, d = null) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const base = args.find((a) => /^https?:\/\//.test(a));
if (!base) { console.error("usage: npm run jev:smoke -- https://site [--max 10]"); process.exit(2); }
const origin = new URL(base).origin;
const MAX = Number(opt("max", 10));
const SKIP = /^\/(api|_next|admin)(\/|$)|\.(png|jpe?g|svg|webp|ico|pdf|xml|txt|js|css|json)$|\/(logout|signout|sign-out|delete|remove)\b/i;
const seen = new Set(["/"]), queue = ["/"], pages = [];
try { const sm = await (await fetch(`${origin}/sitemap.xml`, { signal: AbortSignal.timeout(15000) })).text(); for (const m of sm.matchAll(/<loc>([^<]+)<\/loc>/g)) { try { const p = new URL(m[1]).pathname; if (!seen.has(p) && !SKIP.test(p)) { seen.add(p); queue.push(p); } } catch { } } } catch { }
while (queue.length && pages.length < MAX) {
  const p = queue.shift();
  const r = await fetch(origin + p, { redirect: "follow", signal: AbortSignal.timeout(20000) }).catch(() => null);
  if (!r || !r.ok || !(r.headers.get("content-type") || "").includes("html")) continue;
  const final = new URL(r.url).pathname;
  if (/^\/(dashboard|app|account|settings|billing)(\/|$)|sign-?in|login/.test(final) && final !== p) continue; // a redirect to sign-in
  if (!pages.includes(final)) pages.push(final);
  const html = await r.text();
  for (const m of html.matchAll(/href="([^"#?]+)/g)) { try { const u = new URL(m[1], origin); if (u.origin === origin && !seen.has(u.pathname) && !SKIP.test(u.pathname)) { seen.add(u.pathname); queue.push(u.pathname); } } catch { } }
}
const repo = mkdtempSync(join(tmpdir(), "bs-jev-smoke-"));
const jev = { budget: Number(opt("budget", 1)) };
if (opt("profile")) jev.profile = opt("profile");
if (opt("facts")) { writeFileSync(join(repo, "facts.md"), readFileSync(resolve(opt("facts")), "utf8")); jev.facts = "facts.md"; }
if (opt("context")) { writeFileSync(join(repo, "context.md"), readFileSync(resolve(opt("context")), "utf8")); jev.context = "context.md"; }
writeFileSync(join(repo, "babysitter.config.json"), JSON.stringify({ name: new URL(base).hostname.split(".")[0], baseURL: origin, routes: pages, jev }));
console.error(`jev:smoke: ${pages.length} public page(s) of ${origin}: ${pages.join(", ")}`);
const t0 = Date.now();
const r = spawnSync(process.execPath, [join(TOOL, "bin/text-pass.mjs"), "--no-merge"], { cwd: repo, stdio: "inherit", env: { ...process.env, BABYSITTER_ROOT: repo, BASE_URL: origin, ROUTES: pages.join(","), BABYSITTER_DNS: "0", BABYSITTER_COPY_RECORD: "0", BABYSITTER_TEXT_DEAD: "0" } });
const res = JSON.parse(readFileSync(join(repo, ".babysitter/text-pass.json"), "utf8"));
console.log(`\njev:smoke ${origin}: ${res.pages} page(s), ${Math.round((Date.now() - t0) / 1000)} s (read ${Math.round(res.readMs / 1000)} s), Jev ${res.jev.on ? `$${res.jev.costUsd} in ${res.jev.calls} call(s), ${res.jev.questions} question(s)` : res.jev.note} — ${res.findings.filter((f) => !f.jev).length} rule finding(s), ${res.findings.filter((f) => f.jev).length} Jev finding(s), ${res.unsure.length} unsure · ${join(repo, ".babysitter/text-pass.json")}`);
process.exit(r.status === 2 ? 2 : 0);
