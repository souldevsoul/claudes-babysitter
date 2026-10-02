#!/usr/bin/env node
// Claude Code PostToolUse hook (Edit|Write|MultiEdit): lint the file that was just written, changed lines only.
// Exit 2 sends the fix-list back to the model immediately, so problems are fixed while the context is fresh.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { projectMode, ADOPTION_NOTE } from "../lib/mode.js";

let input = "";
for await (const chunk of process.stdin) input += chunk;
let file;
try { const j = JSON.parse(input); file = j.tool_input?.file_path || j.tool_input?.path; } catch {}
if (!file || !/\.(jsx|tsx|ts|js|mjs|s?css)$/.test(file) || /\.d\.ts$/.test(file)) process.exit(0);

const repo = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const r = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), "ui-check.mjs"), "--repo", repo, "--changed", "HEAD", "--file", file, "--format", "agent"], { encoding: "utf8" });
if (r.status === 1) {
  if (projectMode(repo) === "adoption") {
    // adoption: tell the model (so it can fix what it touched) but do not block the edit
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: `Claude's Babysitter (${ADOPTION_NOTE}):\n${r.stdout}` } }));
    process.exit(0);
  }
  process.stderr.write(r.stdout);
  process.exit(2);
}
process.exit(0);
