#!/usr/bin/env node
// Claude Code UserPromptSubmit hook: notes the user pinned on the page in Babysitter Studio (🎯 Inspect) ride along
// with their next prompt as additional context. No Studio configured or running → silent, ~instant.
import { recover } from "../lib/time-travel.js";
import { pendingNotes, formatManual } from "../lib/studio-gate.js";

for await (const _ of process.stdin); // drain the hook payload
const repo = process.env.CLAUDE_PROJECT_DIR || process.cwd();
try { recover(repo); } catch {}
const manual = await pendingNotes(repo).catch(() => []);
if (manual.length) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: `The user pinned these notes on the running page in Babysitter Studio:\n\n${formatManual(manual)}` } }));
}
process.exit(0);
