#!/usr/bin/env node
// Claude Code PostToolUse hook (Edit|Write|MultiEdit): lint the file that was just written, changed lines only.
// Exit 2 sends the fix-list back to the model immediately, so problems are fixed while the context is fresh.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let input = "";
for await (const chunk of process.stdin) input += chunk;
let file;
try { const j = JSON.parse(input); file = j.tool_input?.file_path || j.tool_input?.path; } catch {}
if (!file || !/\.(jsx|tsx|css)$/.test(file)) process.exit(0);

const repo = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const r = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), "ui-check.mjs"), "--repo", repo, "--changed", "HEAD", "--file", file, "--format", "agent"], { encoding: "utf8" });
if (r.status === 1) {
  process.stderr.write(r.stdout);
  process.exit(2);
}
process.exit(0);
