// Express run results → one result per check, exactly where its own test would have been in a normal run.
// An express page test ("express: every check of this page, one load", playwright/express.js) attaches
// express-results.json: every check it ran with its title, status, error messages and annotations. expand() replaces
// the page test by those results (same file, same describe path, same project), so the run summary, findings.json,
// fix-plan and the Stop hook read an express run like a normal one.
import { CONTAINER_TITLE } from "./express-title.js";

export { CONTAINER_TITLE };

const strip = (s) => String(s || "").replace(/\u001b\[[0-9;]*m/g, "");

/**
 * One error message without what Playwright appends around it: the code frame of the spec ("  41 |", "> 41 |",
 * "     | ^", "   at file:line") and the stack lines. The message part is what a check reported; the rest is the
 * spec's source, which differs between a test of its own and the express page test.
 */
export function cleanError(message) {
  const lines = strip(message).split("\n");
  const out = [];
  for (const l of lines) {
    if (/^\s*>?\s*\d+ \|/.test(l) || /^\s+\|\s*\^/.test(l) || /^\s+at\s+\S.*:\d+(?::\d+)?\)?$/.test(l) || /^\s{3}at\s/.test(l)) break;
    out.push(l);
  }
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out.join("\n");
}

const bodyOf = (att) => {
  if (!att) return null;
  try {
    if (att.body) return JSON.parse(Buffer.from(att.body, "base64").toString("utf8"));
  } catch { }
  return null;
};

/**
 * @param {any[]} list results(report) entries; each may carry `attachments`
 * @returns {{ list: any[], express: null | { pages: number, rules: number, loads: number, cached: number, own: number, ms: number, broken: any[] } }}
 */
export function expand(list) {
  const out = [];
  let stats = null;
  for (const r of list) {
    if (r.title !== CONTAINER_TITLE) { out.push(r); continue; }
    stats ??= { pages: 0, rules: 0, loads: 0, cached: 0, own: 0, ms: 0, broken: [], profile: [] };
    const payload = bodyOf((r.attachments || []).find((a) => a.name === "express-results.json"));
    if (!payload) {
      // skipped: no check of this page matched -g / --last-failed (in a normal run those tests do not exist either)
      if (r.status === "skipped") continue;
      // the page test stopped before it could say what it checked (a crash, the worker killed): reported as it is
      stats.broken.push(r);
      out.push(r);
      continue;
    }
    stats.pages++;
    stats.loads += payload.stats?.loads || 0;
    stats.ms += payload.stats?.ms || 0;
    const prefix = r.path.slice(0, -1);
    for (const x of payload.rules || []) {
      stats.rules++;
      if (x.cached) stats.cached++;
      if (x.served === "own page") stats.own++;
      stats.profile.push({ file: r.path[0], title: x.title, dirty: !!x.dirty, own: x.served === "own page" && !!x.retry });
      out.push({
        path: [...prefix, ...(x.titles || [x.title])],
        title: x.title,
        file: payload.file || r.file,
        project: r.project,
        status: x.status,
        outcome: x.status === "skipped" ? "skipped" : x.status === "passed" ? "expected" : "unexpected",
        error: (x.errors || []).map((e) => e.message || "").join("\n"),
        errors: (x.errors || []).map((e) => e.message || ""),
        annotations: x.annotations || [],
        express: { served: x.served, cached: !!x.cached, dirty: !!x.dirty, ms: x.ms, container: payload.containerId },
      });
    }
  }
  return { list: out, express: stats };
}
