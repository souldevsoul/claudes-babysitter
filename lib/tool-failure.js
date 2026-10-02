// A crash of the checker itself (missing node_modules, a bug) must never look like "your code has problems":
// node exits 1 on an uncaught error, the same code ui-check uses for findings, and the report would be empty.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..");

/** null when the run is a normal result (0 = clean, 1 = findings on stdout); otherwise a plain explanation. */
export function toolFailure(r) {
  if (!r) return null;
  const crashed = r.error || r.signal || (r.status !== 0 && r.status !== 1) || (r.status === 1 && !String(r.stdout || "").trim());
  if (!crashed) return null;
  const err = String(r.stderr || r.error?.message || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const line = err.find((l) => /^(Error|TypeError|ReferenceError|SyntaxError)|ERR_|Cannot find/.test(l)) || err[0] || `exit ${r.status ?? r.signal}`;
  const fix = /ERR_MODULE_NOT_FOUND|Cannot find (package|module)/.test(err.join("\n"))
    ? `its dependencies are missing — run: cd "${TOOL}" && npm install`
    : `run it by hand to see the full error: node "${join(TOOL, "bin/ui-check.mjs")}" --changed`;
  return `Claude's Babysitter itself failed — this is not a problem in your code.\n  ${line}\n  Fix: ${fix}`;
}
