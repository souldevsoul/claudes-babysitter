// A crashed checker must be reported as a tool failure, never as an empty list of code problems.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { toolFailure } from "../lib/tool-failure.js";

const node = (code) => spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8" });
let n = 0; const ok = (m) => { n++; console.log("  ✓", m); };

assert.equal(toolFailure(node("process.exit(0)")), null);
assert.equal(toolFailure(node('console.log("src/a.tsx\\n  L1 ui/x: bad"); process.exit(1)')), null, "findings on stdout are a normal result");
ok("clean (0) and findings (1 + report) are normal results");

const missing = toolFailure(node('await import("eslint-that-does-not-exist")'));
assert.match(missing, /itself failed — this is not a problem in your code/);
assert.match(missing, /ERR_MODULE_NOT_FOUND|Cannot find package/);
assert.match(missing, /npm install/);
ok("missing dependency (exit 1, empty report) → tool failure with the npm install fix");

assert.match(toolFailure(node('throw new TypeError("boom")')), /TypeError: boom/);
assert.match(toolFailure(node("process.exit(3)")), /itself failed/);
ok("uncaught error and unexpected exit codes → tool failure with the error line");
console.log(`tool-failure: ${n} cases passed`);
