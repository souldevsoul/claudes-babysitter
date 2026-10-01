// Semantic role of a component from its name: StatCard and StatTile are the same role ("stat card"),
// CardHeader and CardTitle are not. Used to stop look-alike kit components (1.16, P46 P47).
const SYN = {
  card: ["card", "tile", "panel", "box", "block", "widget", "surface"],
  stat: ["stat", "stats", "metric", "metrics", "kpi", "figure", "number"],
  badge: ["badge", "pill", "chip", "tag"],
  button: ["button", "btn"],
  dialog: ["modal", "dialog", "popup", "lightbox"],
  select: ["select", "dropdown", "combobox"],
  toast: ["toast", "snackbar"],
  heading: ["header", "heading"],
  spinner: ["spinner", "loader", "loading"],
  avatar: ["avatar", "userpic"],
  input: ["input", "textbox", "textfield"],
  empty: ["empty", "placeholder", "blank"],
  row: ["row", "item", "entry", "line"],
  price: ["price", "pricing", "plan"],
};
const CANON = Object.fromEntries(Object.entries(SYN).flatMap(([k, v]) => v.map((w) => [w, k])));
const FILLER = new Set(["state", "view", "component", "ui", "base", "new", "custom", "simple", "fancy", "v2", "alt"]);

export const words = (name) => name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2").toLowerCase().split(/[\s_-]+/).filter(Boolean);
/** Canonical role key: sorted canonical words without filler. "StatCard" → "card stat". */
export function roleKey(name) {
  const w = words(name).map((x) => CANON[x] || x).filter((x) => !FILLER.has(x) && !/^\d+$/.test(x));
  return [...new Set(w)].sort().join(" ");
}
