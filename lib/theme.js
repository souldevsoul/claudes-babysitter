// Theme tokens of a repo, read statically: CSS/SCSS custom properties (:root, .dark, [data-theme], @theme)
// and Tailwind config colours. Used by the contrast gate, the "theme first" gate and the fingerprint.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import postcss from "postcss";
import postcssScss from "postcss-scss";
import { parse as parseTs } from "@typescript-eslint/typescript-estree";
import { parseColor, contrast, toOklch } from "./colors.js";

const VENDOR = /(^|\/)(node_modules|vendor|vendors|tools\/claudes-babysitter)\/|\.min\.s?css$|(^|\/)(bootstrap|font-?awesome|fontawesome-all|animate|jquery[\w.-]*|swiper[\w-]*|slick[\w-]*)(\.[\w-]+)*\.s?css$/i;

export function repoFiles(repo) {
  try { return execSync("git ls-files --cached --others --exclude-standard", { cwd: repo, encoding: "utf8" }).split("\n").filter(Boolean); }
  catch { return []; }
}

/** Files that define theme tokens. */
export function themeFiles(repo, files = repoFiles(repo)) {
  const css = files.filter((f) => /\.s?css$/.test(f) && !VENDOR.test(f)).filter((f) => {
    try { return /--(background|foreground|primary|color-[\w-]+)\s*:|@theme\b/.test(readFileSync(join(repo, f), "utf8")); } catch { return false; }
  });
  const tw = files.filter((f) => /(^|\/)tailwind\.config\.(js|cjs|mjs|ts)$/.test(f));
  return [...css, ...tw];
}
export const isThemeFile = (f) => /(^|\/)tailwind\.config\.(js|cjs|mjs|ts)$/.test(f) || /\.s?css$/.test(f);

/** { light: Map(name→raw), dark: Map } with names normalised (no "--", no "color-" prefix). */
export function readTokens(repo, files = themeFiles(repo)) {
  const schemes = { light: new Map(), dark: new Map() };
  const norm = (p) => p.replace(/^--/, "").replace(/^color-/, "");
  for (const f of files) {
    const src = readFileSync(join(repo, f), "utf8");
    if (/tailwind\.config/.test(f)) { readTailwindConfig(src, schemes.light); continue; }
    let root;
    try { root = (f.endsWith(".scss") ? postcssScss : postcss).parse(src); } catch { continue; }
    root.walkDecls((d) => {
      if (!d.prop.startsWith("--")) return;
      const rule = d.parent;
      const sel = rule.type === "rule" ? rule.selector : rule.type === "atrule" ? `@${rule.name}` : "";
      const dark = /\.dark|data-theme=["']?dark|prefers-color-scheme:\s*dark/.test(sel) ||
        (rule.parent && rule.parent.type === "atrule" && /prefers-color-scheme:\s*dark/.test(rule.parent.params));
      const target = dark ? schemes.dark : schemes.light;
      if (/^(:root|html|body|@theme|\.light|\[data-theme=["']?light["']?\])$/.test(sel.trim()) || dark || sel.trim() === "") {
        const k = norm(d.prop);
        // @theme --color-x: var(--x) is an alias; keep the more concrete value
        if (!(target.has(k) && /^var\(/.test(d.value.trim()))) target.set(k, d.value.trim());
      }
    });
  }
  // dark inherits anything it does not override
  for (const [k, v] of schemes.light) if (!schemes.dark.has(k)) schemes.dark.set(k, v);
  if (![...schemes.dark.keys()].some((k) => !schemes.light.has(k) || schemes.light.get(k) !== schemes.dark.get(k))) schemes.dark = null;
  return schemes;
}

/** Static colours from tailwind.config: theme.colors / theme.extend.colors (string leaves only). */
function readTailwindConfig(src, out) {
  let ast;
  try { ast = parseTs(src, { jsx: false, range: false, loc: false }); } catch { return; }
  const walk = (node, path) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "Property" && node.key) {
      const key = node.key.name ?? node.key.value;
      const p = [...path, key];
      if (node.value.type === "Literal" && typeof node.value.value === "string") {
        const i = p.indexOf("colors");
        if (i >= 0) out.set(p.slice(i + 1).filter((x) => x !== "DEFAULT").join("-"), node.value.value);
      } else walk(node.value, p);
      return;
    }
    for (const k of Object.keys(node)) { if (k === "parent") continue; const v = node[k]; if (Array.isArray(v)) v.forEach((x) => walk(x, path)); else if (v && typeof v.type === "string") walk(v, path); }
  };
  walk(ast, []);
}

/** Resolve a token to a colour: follows var(--x), hsl(var(--x)), Tailwind <alpha-value>. */
export function resolveColor(map, name, depth = 0) {
  let raw = map.get(name);
  if (raw === undefined || depth > 8) return null;
  raw = raw.replace(/<alpha-value>/g, "1");
  const ref = raw.match(/^var\(--(?:color-)?([\w-]+)(?:,[^)]*)?\)$/);
  if (ref) return resolveColor(map, ref[1], depth + 1);
  // hsl(var(--primary)) / rgb(var(--x) / 0.5)
  const fnVar = raw.match(/^(hsla?|rgba?|oklch)\(\s*var\(--([\w-]+)\)\s*(\/\s*[\d.]+%?)?\s*\)$/);
  if (fnVar) { const inner = map.get(fnVar[2]); return inner ? parseColor(`${fnVar[1]}(${inner}${fnVar[3] ? " " + fnVar[3] : ""})`) : null; }
  return parseColor(raw);
}

/** WCAG pairs every product theme must satisfy (text ≥ 4.5:1). Missing tokens are skipped, not failed. */
export const PAIRS = [
  ["foreground", "background", "text / background"],
  ["muted-foreground", "background", "muted text / background"],
  ["muted-foreground", "muted", "muted text / muted surface"],
  ["primary-foreground", "primary", "button text / button"],
  ["secondary-foreground", "secondary", "secondary button text / secondary button"],
  ["destructive-foreground", "destructive", "destructive button text / destructive button"],
  ["accent-foreground", "accent", "accent text / accent"],
  ["card-foreground", "card", "card text / card"],
  ["popover-foreground", "popover", "popover text / popover"],
  // non-text (WCAG 1.4.11): the boundary that identifies a control — field and select borders
  ["input", "background", "field border / background", 3],
];

/** Pairs that block (spec: text/background, muted text/background, button text/button). The rest warn. */
export const REQUIRED_PAIRS = new Set(["foreground on background", "muted-foreground on background", "primary-foreground on primary", "input on background"]);

export function checkContrast(repo, { min = 4.5, files, aliases = {} } = {}) {
  const schemes = readTokens(repo, files || themeFiles(repo));
  // contrastTokens: { "background": "tg-common-color-black", "primary": "tg-theme-primary", … }
  for (const map of Object.values(schemes)) if (map) for (const [canon, actual] of Object.entries(aliases)) { const v = map.get(actual.replace(/^--/, "")); if (v !== undefined) map.set(canon, v); }
  const results = [];
  for (const [scheme, map] of Object.entries(schemes)) {
    if (!map) continue;
    const base = resolveColor(map, "background") || { r: 1, g: 1, b: 1, a: 1 };
    for (const [fg, bg, label, pairMin] of PAIRS) {
      const F = resolveColor(map, fg), B = resolveColor(map, bg);
      if (!F || !B) continue;
      const ratio = contrast(F, B, base);
      const need = pairMin || min;
      const pair = `${fg} on ${bg}`;
      results.push({ scheme, pair, label, min: need, ratio: Math.round(ratio * 100) / 100, ok: ratio >= need, required: REQUIRED_PAIRS.has(pair), fg: map.get(fg), bg: map.get(bg) });
    }
  }
  return results;
}

/* ───────────── stock theme (shadcn defaults) ───────────── */
const STOCK_PRIMARY = ["222.2 47.4% 11.2%", "240 5.9% 10%", "0 0% 9%", "oklch(0.205 0 0)", "oklch(0.21 0.006 285.885)", "oklch(0.208 0.042 265.755)", "hsl(222.2 47.4% 11.2%)", "hsl(240 5.9% 10%)"];
const STOCK_RADIUS = ["0.5rem", "0.625rem", "0.75rem"];
const STOCK_FONTS = /^(Inter|Geist|Geist_Mono|Roboto|Arial|system-ui)$/;

export function fonts(repo, files = repoFiles(repo)) {
  const layout = files.filter((f) => /layout\.(t|j)sx$|_app\.(t|j)sx$|_document\.(t|j)sx$/.test(f)).map((f) => readFileSync(join(repo, f), "utf8")).join("\n");
  const google = [...layout.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']next\/font\/google["']/g)].flatMap((m) => m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean));
  const css = themeFiles(repo, files).filter((f) => !/tailwind\.config/.test(f)).map((f) => readFileSync(join(repo, f), "utf8")).join("\n");
  const fam = [...css.matchAll(/--font-[\w-]+\s*:\s*([^;]+);/g), ...css.matchAll(/font-family\s*:\s*([^;]+);/g)]
    .map((m) => m[1].split(",")[0].replace(/["']/g, "").trim()).filter((f) => f && !/^var\(/.test(f) && !/^(ui-|system-ui|-apple|sans-serif|serif|monospace|inherit)/.test(f));
  const local = /next\/font\/local/.test(layout) || /@font-face/.test(css);
  return { list: [...new Set([...google, ...fam].map((f) => f.replace(/_/g, " ")))], local };
}

export function stockTheme(repo, files = repoFiles(repo)) {
  const isShadcn = existsSync(join(repo, "components.json")) || files.some((f) => /components\/ui\/button\.(t|j)sx$/.test(f) && /class-variance-authority/.test(readFileSync(join(repo, f), "utf8")));
  if (!isShadcn) return { applicable: false, stock: false, signals: [] };
  const { light } = readTokens(repo, themeFiles(repo, files));
  const primary = light.get("primary"), radius = light.get("radius");
  const f = fonts(repo, files);
  const btnFile = files.find((x) => /components\/ui\/button\.(t|j)sx$/.test(x));
  const btn = btnFile ? readFileSync(join(repo, btnFile), "utf8") : "";
  const variantNames = btn ? [...new Set([...btn.matchAll(/^\s{6,8}([a-z][\w-]*)\s*:/gm)].map((m) => m[1]))] : [];
  const STOCK_V = new Set(["default", "destructive", "outline", "secondary", "ghost", "link", "sm", "lg", "icon", "xs", "icon-sm", "icon-lg", "variant", "size"]);
  const signals = [
    { id: "primary", stock: !primary || STOCK_PRIMARY.includes(primary.replace(/\s+/g, " ")), detail: `--primary: ${primary || "not set"}` },
    { id: "radius", stock: !radius || STOCK_RADIUS.includes(radius), detail: `--radius: ${radius || "not set"}` },
    { id: "font", stock: !f.local && (f.list.length === 0 || f.list.every((x) => STOCK_FONTS.test(x.replace(/ /g, "_")))), detail: `fonts: ${f.list.join(", ") || "none"}` },
    { id: "button", stock: !!btn && /bg-primary text-primary-foreground (shadow(-xs)? )?hover:bg-primary\/90/.test(btn) && variantNames.every((v) => STOCK_V.has(v)), detail: `button variants: ${variantNames.filter((v) => !["variant", "size"].includes(v)).join(", ") || "stock"}` },
  ];
  const stockCount = signals.filter((s) => s.stock).length;
  return { applicable: true, stock: stockCount >= 2, signals };
}

/* ───────────── fingerprint ───────────── */
export function fingerprint(repo, files = repoFiles(repo)) {
  const { light, dark } = readTokens(repo, themeFiles(repo, files));
  const P = resolveColor(light, "primary") || resolveColor(light, "accent");
  const BG = resolveColor(light, "background");
  const p = P ? toOklch(P) : null;
  const radiusRaw = light.get("radius") || "";
  const radiusPx = /rem$/.test(radiusRaw) ? parseFloat(radiusRaw) * 16 : /px$/.test(radiusRaw) ? parseFloat(radiusRaw) : null;
  const f = fonts(repo, files);
  const fp = {
    hue: p && p.C > 0.03 ? Math.round(p.H) : null, // achromatic primaries have no meaningful hue
    chroma: p ? Math.round(p.C * 1000) / 1000 : null,
    lightness: p ? Math.round(p.L * 100) / 100 : null,
    radius: radiusPx === null ? null : Math.round(radiusPx),
    fonts: f.list.map((x) => x.toLowerCase()).sort(),
    mode: BG ? (toOklch(BG).L < 0.5 ? "dark" : "light") : null,
    darkScheme: !!dark,
  };
  const q = [fp.hue === null ? "n" : Math.round(fp.hue / 15), fp.chroma === null ? "n" : Math.round(fp.chroma * 20), fp.radius === null ? "n" : Math.round(fp.radius / 4), fp.fonts.join("+"), fp.mode].join("|");
  let h = 2166136261; for (const ch of q) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return { ...fp, hash: (h >>> 0).toString(16).padStart(8, "0") };
}

/** 0..1 similarity of two fingerprints (weights: hue .35, chroma/lightness .15, radius .15, fonts .25, mode .10). */
export function similarity(a, b) {
  const part = [];
  if (a.hue !== null && b.hue !== null) { const d = Math.min(Math.abs(a.hue - b.hue), 360 - Math.abs(a.hue - b.hue)); part.push([0.35, d <= 15 ? 1 : Math.max(0, 1 - (d - 15) / 45)]); }
  else part.push([0.35, a.hue === b.hue ? 1 : 0]);
  if (a.chroma !== null && b.chroma !== null) part.push([0.15, Math.max(0, 1 - (Math.abs(a.chroma - b.chroma) / 0.12 + Math.abs(a.lightness - b.lightness) / 0.3) / 2)]);
  if (a.radius !== null && b.radius !== null) { const d = Math.abs(a.radius - b.radius); part.push([0.15, d <= 2 ? 1 : Math.max(0, 1 - (d - 2) / 10)]); }
  const fa = new Set(a.fonts), fb = new Set(b.fonts);
  if (fa.size || fb.size) { const inter = [...fa].filter((x) => fb.has(x)).length; part.push([0.25, inter / new Set([...fa, ...fb]).size]); }
  if (a.mode && b.mode) part.push([0.1, a.mode === b.mode ? 1 : 0]);
  const w = part.reduce((s, [x]) => s + x, 0);
  return w ? part.reduce((s, [x, v]) => s + x * v, 0) / w : 0;
}
