// Which routes a run checks page by page. `babysitter e2e --changed` / `--since <ref>` writes the routes a change reaches
// to a file (BABYSITTER_SELECTED); every per-route describe of every spec asks isSelected() before it registers.
// No file → every route (the normal run). Site-wide tests always see every route: a change on one page can make it
// differ from the others.
import { existsSync, readFileSync } from "node:fs";

export const routeKey = (route) => `${route.auth ? route.role || "user" : "public"} ${String(route.path).split("#")[0]}`;

let SEL;
function selection() {
  if (SEL !== undefined) return SEL;
  const f = process.env.BABYSITTER_SELECTED;
  SEL = null;
  if (f && existsSync(f)) {
    try {
      const j = JSON.parse(readFileSync(f, "utf8"));
      if (!j.all) SEL = new Set((j.routes || []).map((r) => (typeof r === "string" ? r : routeKey(r))));
    } catch { SEL = null; }
  }
  return SEL;
}

/** true when this route's per-page checks run in this run */
export function isSelected(route) {
  const s = selection();
  return !s || s.has(routeKey(route));
}
