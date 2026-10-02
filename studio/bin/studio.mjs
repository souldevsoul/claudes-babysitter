#!/usr/bin/env node
// babysitter-studio [start] [--port 3001] [--target http://localhost:3000]
// babysitter-studio review [--url http://localhost:3001] [--title "…"] [--timeout 900] [--repo .] [--base main] [--fixed-from earlier.json] < problems.json
//   --repo enables Before/After for this review (BEFORE = --base, default HEAD); AFTER is restored when it ends
//   problems.json: [{ "selector": "main > button", "message": "native control", "file": "src/app/page.tsx", "line": 4 }]
//   exit 0 = approved, 1 = rejected, commented (the comment goes to stdout) or timed out (fail closed), 2 = no studio running
// http-proxy still calls util._extend (DEP0060); harmless, and noise in a hook's output
process.noDeprecation = true;
import { readFileSync } from "node:fs";
import { startStudio } from "../lib/server.js";
import { requestReview } from "../lib/review-client.js";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const cmd = args[0] && !args[0].startsWith("--") ? args[0] : "start";

if (cmd === "start") {
  const s = await startStudio({ port: Number(opt("port", 3001)), target: opt("target", "http://localhost:3000") });
  console.log(`Open http://localhost:${s.port} instead of the dev server — the review panel lives there.`);
  // close cleanly on Ctrl-C and on kill: stops the base sites (Before/After) and removes their worktrees
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, async () => { await s.close(); process.exit(0); });
} else if (cmd === "review") {
  // stdin: [problems…] or { problems: […], fixed: […] }; --fixed-from <earlier.json>: whatever that earlier
  // check found and this one no longer does is listed as fixed (green)
  let problems = [], fixed = [];
  try { const j = JSON.parse(readFileSync(0, "utf8") || "[]"); problems = Array.isArray(j) ? j : j.problems || []; fixed = Array.isArray(j) ? [] : j.fixed || []; }
  catch { console.error("review: stdin must be a JSON array of problems (or { problems, fixed })"); process.exit(2); }
  if (opt("fixed-from", null)) {
    let earlier = [];
    try { const j = JSON.parse(readFileSync(opt("fixed-from"), "utf8")); earlier = Array.isArray(j) ? j : j.problems || []; } catch (e) { console.error(`review: --fixed-from: ${e.message}`); process.exit(2); }
    const key = (p) => [p.route || "", p.viewport || "", p.check || p.rule || "", p.selector || p.where || `${p.file}:${p.line}`].join("|");
    const now = new Set(problems.map(key));
    fixed = fixed.concat(earlier.filter((p) => !now.has(key(p))));
  }
  const url = opt("url", process.env.BABYSITTER_STUDIO || "http://localhost:3001");
  if (args.includes("--proposals")) { await reviewProposals({ url, problems, fixed }); }
  // Before/After: the same journaled, crash-safe swap the hooks use
  let tt = null, dispose = () => {};
  const repo = opt("repo", null);
  if (repo) {
    const { snapshot, guard } = await import("../../lib/time-travel.js");
    tt = snapshot(repo, { base: opt("base", "HEAD") });
    if (tt) dispose = guard(tt, (m) => console.error(m));
    else console.error(`Before/After: nothing to compare against ${opt("base", "HEAD")} in ${repo}.`);
  }
  const { applyStaged } = tt ? await import("../../lib/time-travel.js") : {};
  const r = await requestReview({
    url, problems, fixed, title: opt("title", "UI review"), timeoutMs: Number(opt("timeout", 900)) * 1000,
    diff: repo ? { repo: (await import("node:path")).resolve(repo), base: opt("base", "HEAD"), files: tt ? tt.journal.files.length : 0, skipped: tt ? tt.journal.skipped.length : 0 } : null,
    onToggle: tt && ((side) => applyStaged(tt, side)),
    diffNote: repo ? "nothing" : "no-repo",
    onWaiting: () => console.error(`⏳ Visual Review required. Open ${url} — ${problems.length} problem(s)`),
  });
  if (r.decision === "approve") { console.error(`✅ Approved in Studio${r.text ? `: ${r.text}` : ""}.`); process.exit(0); }
  dispose(); // AFTER is back on disk before anything else is printed
  const manual = (r.manual || []).map((n) => `- Element: \`${n.selector}\`\n- Instruction: ${JSON.stringify(n.comment)}`).join("\n\n");
  if (manual) console.log(`Manual QA Feedback:\n${manual}`);
  if (r.decision === "comment") { if (r.text) console.log(`Reviewer comment: ${r.text}`); process.exit(1); }
  if (r.decision === "reject") { console.error(`❌ Rejected in Studio${r.text ? `: ${r.text}` : ""}.`); process.exit(1); }
  if (r.decision === "timeout") { console.error("⌛ No decision in time — treated as rejected."); process.exit(1); }
  console.error(`Babysitter Studio is not running at ${url}.`); process.exit(2);
} else {
  console.error("usage: babysitter-studio [start|review] …"); process.exit(2);
}

/*
 * studio review --repo . --proposals < findings.json
 * Each finding is shown with the fix prepared for it (babysitter propose save): Before = the page as it is,
 * After = the original with the pending fixes applied, on its own dev server. Nothing reaches the original files
 * until a fix is approved — one by one in its entry, or all at once with Approve. Every decision is printed to
 * stdout as one JSON line (`babysitter-event {...}`), so the agent that prepared the fixes can follow along and
 * revise a fix the reviewer commented on (propose save --id <id>); the panel picks the new version up by itself.
 */
async function reviewProposals({ url, problems, fixed }) {
  const { resolve } = await import("node:path");
  const { statSync, readdirSync, existsSync } = await import("node:fs");
  const P = await import("../../lib/proposals.js");
  const repo = resolve(opt("repo", "."));
  const event = (e) => console.log(`babysitter-event ${JSON.stringify(e)}`);
  let open = problems, done = fixed;
  const signature = () => { const d = P.proposalsDir(repo); return existsSync(d) ? readdirSync(d).map((f) => { try { return `${f}:${statSync(`${d}/${f}`).mtimeMs}`; } catch { return f; } }).sort().join("|") : ""; };
  const state = () => {
    const list = P.list(repo).filter((p) => p.kind !== "code"); // code-only fixes never wait for a person
    open = P.assign(open.map(({ proposal, ...f }) => f), list);
    const { sha, applied, failed } = P.proposalCommit(repo);
    const proposals = list.map((p) => ({ id: p.id, title: p.title, status: failed.some((f) => f.id === p.id) ? "conflict" : p.status, error: failed.find((f) => f.id === p.id)?.error || p.error, files: p.files, requires: p.requires, comment: p.comments?.at(-1)?.text, findings: open.filter((f) => f.proposal === p.id).length }));
    return { problems: open, fixed: done, proposals, diff: { repo, mode: "proposals", ref: sha, files: applied.length } };
  };
  let seen = signature();
  const s0 = state();
  const moveFixed = (ids) => { const now = open.filter((f) => ids.includes(f.proposal)); open = open.filter((f) => !ids.includes(f.proposal)); done = done.concat(now.map((f) => ({ ...f, applied: true }))); };
  const onProposal = async ({ id, decision, text }, api) => {
    try {
      if (decision === "approve") { const ids = P.approve(repo, id); moveFixed(ids); event({ event: "approved", id, applied: ids }); }
      if (decision === "reject") { P.setStatus(repo, id, "rejected"); event({ event: "rejected", id }); }
      if (decision === "comment") { const p = P.get(repo, id); P.setStatus(repo, id, "revising", { comments: [...(p?.comments || []), { text: text || "", at: Date.now() }] }); event({ event: "comment", id, text: text || "", title: p?.title, files: p?.files }); }
    } catch (e) { event({ event: "error", id, decision, error: e.message }); }
    seen = signature();
    api.update({ ...state(), event: { id, decision } });
  };
  let watch = null;
  const r = await requestReview({
    url, problems: s0.problems, fixed: s0.fixed, proposals: s0.proposals, diff: s0.diff, onProposal,
    title: opt("title", "UI review"), timeoutMs: Number(opt("timeout", 900)) * 1000,
    onWaiting: () => console.error(`⏳ Visual Review required. Open ${url} — ${s0.problems.length} problem(s), ${s0.proposals.filter((p) => p.status === "pending").length} fix(es) proposed`),
    // a fix revised by the agent (propose save --id) shows up in the panel without restarting the review
    onOpen: (api) => { watch = setInterval(() => { const sig = signature(); if (sig === seen) return; seen = sig; event({ event: "reloaded" }); api.update({ ...state(), event: { decision: "revised" } }); }, 1000); },
  });
  clearInterval(watch);
  if (r.decision === "approve") {
    // Approve all: every fix still pending goes into the original files
    for (const p of P.list(repo).filter((x) => x.status === "pending" || x.status === "revising")) {
      try { const ids = P.approve(repo, p.id); event({ event: "approved", id: p.id, applied: ids }); } catch (e) { event({ event: "error", id: p.id, decision: "approve", error: e.message }); }
    }
    console.error(`✅ Approved in Studio${r.text ? `: ${r.text}` : ""}.`); process.exit(0);
  }
  if (r.decision === "reject") { for (const p of P.list(repo).filter((x) => x.status === "pending" || x.status === "revising")) P.setStatus(repo, p.id, "rejected"); console.error(`❌ Rejected in Studio${r.text ? `: ${r.text}` : ""}. The original files were not changed.`); process.exit(1); }
  const manual = (r.manual || []).map((n) => `- Element: \`${n.selector}\`\n- Instruction: ${JSON.stringify(n.comment)}`).join("\n\n");
  if (manual) console.log(`Manual QA Feedback:\n${manual}`);
  if (r.decision === "comment") { if (r.text) console.log(`Reviewer comment: ${r.text}`); process.exit(1); }
  if (r.decision === "timeout") { console.error("⌛ No decision in time — nothing applied."); process.exit(1); }
  console.error(`Babysitter Studio is not running at ${url}.`); process.exit(2);
}
