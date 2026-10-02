// Project mode: "strict" (hooks block) or "adoption" (hooks warn only, while existing debt is cleared).
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
export function projectMode(repo) {
  const p = join(repo, "babysitter.config.json");
  try { return (existsSync(p) && JSON.parse(readFileSync(p, "utf8")).mode) || "strict"; } catch { return "strict"; }
}
export const ADOPTION_NOTE = "adoption mode — a warning, nothing is blocked yet (see BABYSITTER-ADOPTION.md)";
