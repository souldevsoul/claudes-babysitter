// Can this address receive mail? MX lookup over DNS-over-HTTPS (dns.google), A/AAAA to tell "no such domain"
// from "domain without a mail server". Cached on disk (.babysitter/dns-cache.json: a day for answers, an hour
// for failures) and in memory, so a crawl of 50 pages with the same support address asks once.
// Used by `babysitter content` and playwright/checks/content.js (CT9). Network errors never fail a check:
// the result is { ok: null, reason } = "could not verify", reported for information.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { UNDELIVERABLE_HOST } from "./content-rules.js";

const DAY = 86_400_000, HOUR = 3_600_000;
const mem = new Map();
let diskPath = null, disk = null;

function loadDisk(path) {
  if (diskPath === path && disk) return disk;
  diskPath = path;
  try { disk = path && existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {}; } catch { disk = {}; }
  return disk;
}
function saveDisk() {
  if (!diskPath) return;
  try { mkdirSync(dirname(diskPath), { recursive: true }); writeFileSync(diskPath, JSON.stringify(disk, null, 1)); } catch {}
}

async function doh(name, type, fetchImpl) {
  const url = `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetchImpl(url, { signal: ctl.signal, headers: { accept: "application/dns-json" } });
    if (!r.ok) throw new Error(`dns.google answered ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

/**
 * @returns {Promise<{ ok: boolean|null, reason: string, mx?: string[] }>}
 *   ok true: MX found · ok false: no MX / null MX / no such domain / preview host · ok null: could not check
 */
export async function checkDomain(domain, { cache = null, fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const host = String(domain).toLowerCase().replace(/\.$/, "");
  if (UNDELIVERABLE_HOST.test(host)) return { ok: false, reason: `${host} is a preview / reserved host — it has no mailbox` };
  if (mem.has(host)) return mem.get(host);
  const store = loadDisk(cache);
  const hit = store[host];
  if (hit && now - hit.at < (hit.ok === true ? DAY : HOUR)) { mem.set(host, hit.res); return hit.res; }
  let res;
  try {
    const mx = await doh(host, "MX", fetchImpl);
    const answers = (mx.Answer || []).filter((a) => a.type === 15).map((a) => String(a.data).trim());
    if (mx.Status === 3) res = { ok: false, reason: `${host} does not exist (NXDOMAIN)` };
    else if (answers.length && answers.every((a) => /^0\s+\.?$/.test(a))) res = { ok: false, reason: `${host} publishes a null MX ("0 .") — it refuses all mail` };
    else if (answers.length) res = { ok: true, reason: "MX found", mx: answers.map((a) => a.split(/\s+/).pop().replace(/\.$/, "")) };
    else {
      const a = await doh(host, "A", fetchImpl);
      const hasA = (a.Answer || []).some((x) => x.type === 1);
      res = { ok: false, reason: hasA ? `${host} has no MX record (only an A record — mail falls back to a web server that does not accept it)` : `${host} has no MX and no A record` };
    }
  } catch (e) {
    res = { ok: null, reason: `could not check ${host}: ${e.message || e}` };
  }
  mem.set(host, res);
  if (res.ok !== null) { store[host] = { at: now, ok: res.ok, res }; saveDisk(); }
  return res;
}

/** Many addresses at once (each domain asked once). @returns {Promise<Map<string, {ok, reason}>>} email → result */
export async function checkEmails(emails, opts = {}) {
  const out = new Map();
  const domains = [...new Set(emails.map((e) => e.split("@")[1]?.toLowerCase()).filter(Boolean))];
  const res = new Map(await Promise.all(domains.map(async (d) => [d, await checkDomain(d, opts)])));
  for (const e of emails) out.set(e, res.get(e.split("@")[1]?.toLowerCase()));
  return out;
}

/** test hook */
export function _resetDnsCache() { mem.clear(); disk = null; diskPath = null; }
