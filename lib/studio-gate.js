// Freeze & Resume: instead of failing outright, hand the findings to a human in Babysitter Studio and hold this
// process (await, no polling) until they decide in the browser panel. Used by the Stop hook and the pre-commit gate.
//   approve → { decision: "approve" }          the caller lets the turn end / the commit through
//   reject  → { decision: "reject", text }     the caller blocks
//   comment → { decision: "comment", text }    the caller blocks and hands the comment to the author as the brief
//   timeout → { decision: "timeout" }          fail closed
//   null                                       Studio is off or not running: the caller's plain gate decides
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { snapshot, applyStaged, guard } from "./time-travel.js";

const BIN = join(dirname(fileURLToPath(import.meta.url)), "..", "bin");
const run = (script, args) => spawnSync(process.execPath, [join(BIN, script), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 180000 });

export function studioConfig(repo) {
  const p = join(repo, "babysitter.config.json");
  try { const s = existsSync(p) && JSON.parse(readFileSync(p, "utf8")).studio; return s && s.enabled ? s : null; } catch { return null; }
}

/** Static findings on changed lines (file:line) + rendered findings (route + unique selector → red frames). */
export function collectProblems(repo, changed = []) {
  const problems = [];
  // keep what the explanations need (rule / check, the raw detail, the element as a person names it)
  try { for (const p of JSON.parse(run("ui-check.mjs", ["--repo", repo, "--changed", ...changed, "--format", "json"]).stdout).problems) problems.push({ message: `${p.rule}: ${p.message}`, rule: p.rule, file: p.file, line: p.line }); } catch {}
  try { for (const p of JSON.parse(run("micro-check.mjs", ["--repo", repo, "--format", "json"]).stdout || "[]")) problems.push({ message: `${p.check}: ${p.what}`, check: p.check, what: p.what, props: p.props, human: p.human, route: p.route, selector: p.selector || undefined }); } catch {}
  return problems;
}

/** Notes a human pinned to elements in the panel, formatted for Claude's next prompt (stderr / additionalContext). */
export function formatManual(manual = []) {
  if (!manual.length) return "";
  const q = (s) => JSON.stringify(String(s));
  return "Manual QA Feedback:\n" + manual.map((n) => {
    const ctx = [n.route && `page ${n.route}`, n.text && `text ${q(n.text.length > 80 ? n.text.slice(0, 80) + "…" : n.text)}`, n.classes && `class ${q(n.classes.length > 100 ? n.classes.slice(0, 100) + "…" : n.classes)}`].filter(Boolean).join("; ");
    return `- Element: \`${n.selector}\`${ctx ? `  (${ctx})` : ""}\n- Instruction: ${q(n.comment)}`;
  }).join("\n\n") + "\n\n(Find each element by its text and classes in the source; the selector is from the rendered page.)\n";
}

/** Notes pinned while no review was waiting. [] when Studio is off or not running. */
export async function pendingNotes(repo) {
  const cfg = studioConfig(repo);
  if (!cfg) return [];
  const { takeNotes } = await import("../studio/lib/review-client.js");
  return takeNotes({ url: process.env.BABYSITTER_STUDIO || cfg.url || "http://localhost:3001" });
}

export async function freezeForReview({ repo, problems, title, out = process.stderr }) {
  const cfg = studioConfig(repo);
  if (!cfg || !problems.length) return null;
  const { requestReview } = await import("../studio/lib/review-client.js");
  const url = process.env.BABYSITTER_STUDIO || cfg.url || "http://localhost:3001";
  // Time Travel (on unless "studio": { "timeTravel": false }): both versions of the changed UI files are journaled
  // before anything is swapped, and AFTER is guaranteed back on disk when this function leaves — by any path.
  const tt = cfg.timeTravel === false ? null : snapshot(repo);
  const dispose = tt ? guard(tt, (m) => out.write(m + "\n")) : () => {};
  try {
    const r = await requestReview({
      url, problems, title: title || `Babysitter: ${problems.length} problem(s)`, timeoutMs: (cfg.timeoutSec || 900) * 1000,
      diff: { repo, base: "HEAD", files: tt ? tt.journal.files.length : 0, skipped: tt ? tt.journal.skipped.length : 0 },
      diffNote: cfg.timeTravel === false ? "off" : "nothing",
      onToggle: tt && ((side) => applyStaged(tt, side)), // staged: the dev server's CSS follows the swap
      onWaiting: () => out.write(`\n⏳ Visual Review required. Open ${url}  (${problems.length} problem(s); this process waits for your decision)\n`),
    });
    return r.decision === "unavailable" ? null : r;
  } finally {
    dispose(); // AFTER back on disk, journal removed, signal handlers detached
  }
}
