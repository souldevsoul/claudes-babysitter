#!/usr/bin/env node
// babysitter content [repo] [--offline] [--format text|json|agent] [--files a,b] [--rule content/xyz]
// Static copy lint of the product's source: i18n message files of every locale, JSX copy, email addresses.
// Rules and ids: docs/checks-content.md. Exit 1 on any problem (soft findings never fail). --offline skips the
// MX lookups (preview / reserved hosts are still caught). The rendered-page half: `babysitter e2e --only content`.
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { lintContent } from "../lib/content-lint.js";

const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf(`--${n}`); if (i < 0) return d; const v = args[i + 1]; return v && !v.startsWith("--") ? v : true; };
const repo = resolve(args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && !["--offline"].includes(args[i - 1]))) || opt("repo", ".") || ".");
if (!existsSync(repo)) { console.error(`babysitter content: no such repository: ${repo}`); process.exit(2); }
const format = opt("format", "text");
const files = typeof opt("files") === "string" ? opt("files").split(",").filter(Boolean) : null;
const only = opt("rule");
const res = await lintContent(repo, { files, dns: !opt("offline") });
let problems = res.problems;
if (typeof only === "string") problems = problems.filter((p) => p.rule === only || p.id === only);
if (format === "json") console.log(JSON.stringify({ problems, soft: res.soft, info: res.info, stats: res.stats }, null, 2));
else {
  const by = new Map();
  for (const p of problems) (by.get(p.file) || by.set(p.file, []).get(p.file)).push(p);
  for (const [file, list] of by) {
    console.log(file);
    for (const p of list.sort((a, b) => a.line - b.line)) console.log(`  L${p.line} ${p.rule}: ${p.message}`);
  }
  for (const i of res.info) console.log(`(info) ${i.file}: ${i.message}`);
  const counts = {};
  for (const p of problems) counts[p.rule] = (counts[p.rule] || 0) + 1;
  console.log(`\nbabysitter content: ${problems.length} problem(s) — ${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ${n}`).join(", ") || "clean"}`);
  console.log(`checked ${res.stats.messageFiles} message file(s) in ${res.stats.groups} group(s), ${res.stats.jsxFiles} JSX file(s), ${res.stats.strings} string(s), ${res.stats.emails} email address(es)`);
}
process.exitCode = problems.length ? 1 : 0;
