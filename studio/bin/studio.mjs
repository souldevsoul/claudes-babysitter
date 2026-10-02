#!/usr/bin/env node
// babysitter-studio [start] [--port 3001] [--target http://localhost:3000]
// babysitter-studio review [--url http://localhost:3001] [--title "…"] [--timeout 900] < problems.json
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
  process.on("SIGINT", async () => { await s.close(); process.exit(0); });
} else if (cmd === "review") {
  let problems = [];
  try { problems = JSON.parse(readFileSync(0, "utf8") || "[]"); } catch { console.error("review: stdin must be a JSON array of problems"); process.exit(2); }
  const url = opt("url", process.env.BABYSITTER_STUDIO || "http://localhost:3001");
  const r = await requestReview({
    url, problems, title: opt("title", "UI review"), timeoutMs: Number(opt("timeout", 900)) * 1000,
    onWaiting: () => console.error(`⏳ Visual Review required. Open ${url} — ${problems.length} problem(s)`),
  });
  if (r.decision === "approve") { console.error(`✅ Approved in Studio${r.text ? `: ${r.text}` : ""}.`); process.exit(0); }
  const manual = (r.manual || []).map((n) => `- Element: \`${n.selector}\`\n- Instruction: ${JSON.stringify(n.comment)}`).join("\n\n");
  if (manual) console.log(`Manual QA Feedback:\n${manual}`);
  if (r.decision === "comment") { if (r.text) console.log(`Reviewer comment: ${r.text}`); process.exit(1); }
  if (r.decision === "reject") { console.error(`❌ Rejected in Studio${r.text ? `: ${r.text}` : ""}.`); process.exit(1); }
  if (r.decision === "timeout") { console.error("⌛ No decision in time — treated as rejected."); process.exit(1); }
  console.error(`Babysitter Studio is not running at ${url}.`); process.exit(2);
} else {
  console.error("usage: babysitter-studio [start|review] …"); process.exit(2);
}
