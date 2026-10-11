// Dead utility classes: Tailwind classes that generate no CSS in this project. They read as motion in review and do
// nothing on the page (truelogos.pro cookie banner, 2026-10: `animate-in fade-in slide-in-from-bottom-4 duration-500`
// without tailwindcss-animate / tw-animate-css — computed animation-name `none`, the banner popped in and out in one frame).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { meta, base } from "../util.js";

// the tailwindcss-animate / tw-animate-css family
const ANIMATE = /^(animate-in|animate-out|(fade|zoom|spin)-(in|out)(-\S+)?|slide-in-from-\S+|slide-out-to-\S+)$/;
// height animations for accordions / collapsibles: tw-animate-css ships them; elsewhere the project defines the keyframes
const DISCLOSURE = /^animate-(accordion|collapsible)-(down|up)$/;

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", ".nuxt", ".svelte-kit", ".output", ".turbo", ".vercel", ".babysitter", "dist", "build", "out", "coverage", "test-results", "playwright-report", "storybook-static"]);
const PLUGIN = /(tw-animate-css|tailwindcss-animate)/;
const readJson = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };

/** CSS (+ tailwind.config) text of a project, walked once: styles, imports and config, capped. */
function scan(root) {
  const css = [], config = [];
  let files = 0;
  const walk = (dir, depth) => {
    if (depth > 7 || files > 4000) return;
    let list;
    try { list = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of list) {
      if (++files > 4000) return;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) walk(join(dir, e.name), depth + 1); continue; }
      const p = join(dir, e.name);
      try {
        if (/\.(css|scss|sass|pcss|postcss|less)$/.test(e.name) && css.length < 400) css.push(readFileSync(p, "utf8").slice(0, 1_000_000));
        else if (/^tailwind\.config\.(js|cjs|mjs|ts|cts|mts)$/.test(e.name)) config.push(readFileSync(p, "utf8"));
      } catch {}
    }
  };
  walk(root, 0);
  return { css: css.join("\n"), config: config.join("\n"), hasConfig: config.length > 0 };
}

const stateCache = new Map();
/**
 * Is an animation-utility plugin (tw-animate-css / tailwindcss-animate) in effect for the project that owns `file`?
 *   { available: true }                       — imported in CSS (@import / @plugin) or listed in tailwind.config
 *   { available: false, why }                 — not installed, or installed but never imported (Tailwind v4) / not in plugins (v3)
 *   { available: null }                       — no package.json above the file, or nothing to tell from: do not guess
 * plus `defines(token)`: the project defines that class itself (a `.fade-in {}` rule, `@utility`, keyframes for accordion-down).
 */
export function animatePluginState(file) {
  if (!file) return { available: null, defines: () => false };
  let nearest = null, top = null;
  for (let dir = dirname(file); dir && dir !== dirname(dir); dir = dirname(dir)) {
    const pkg = join(dir, "package.json");
    if (existsSync(pkg)) {
      if (!nearest) nearest = dir;
      const j = readJson(pkg);
      if (j && j.workspaces) top = dir;
    }
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) top = dir;
  }
  if (!nearest) return { available: null, defines: () => false };
  const root = top || nearest;
  if (stateCache.has(root + "|" + nearest)) return stateCache.get(root + "|" + nearest);
  const deps = {};
  for (const d of new Set([nearest, root])) { const j = readJson(join(d, "package.json")) || {}; Object.assign(deps, j.dependencies, j.devDependencies, j.peerDependencies); }
  const { css, config, hasConfig } = scan(root);
  const twAnimateCss = !!deps["tw-animate-css"], twcssAnimate = !!deps["tailwindcss-animate"];
  const cssImports = /@(import|plugin)\s+(url\()?\s*["'][^"']*(tw-animate-css|tailwindcss-animate)/.test(css);
  const configUses = PLUGIN.test(config);
  const tw4 = /@import\s+(url\()?\s*["']tailwindcss["']|@import\s+["']tailwindcss\//.test(css) || /^\D*4/.test(String(deps.tailwindcss || ""));
  let available, why = "";
  if (cssImports || configUses) available = true;
  else if (twAnimateCss || twcssAnimate) {
    const name = twAnimateCss ? "tw-animate-css" : "tailwindcss-animate";
    if (tw4) { available = false; why = `${name} is installed but never imported — Tailwind v4 needs \`@import "${name}"\` (or \`@plugin\`) in the CSS that imports tailwindcss`; }
    else if (hasConfig) { available = false; why = `${name} is installed but not in tailwind.config's plugins`; }
    else available = null;
  } else { available = false; why = "neither tw-animate-css nor tailwindcss-animate is installed or imported"; }
  const text = css + "\n" + config;
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\/:%]/g, (c) => "\\\\?\\" + c);
  const defines = (token) => {
    if (new RegExp(`\\.${esc(token)}(?![\\w-])`).test(text) || new RegExp(`@utility\\s+${esc(token)}(?![\\w-])`).test(text)) return true;
    const m = token.match(DISCLOSURE);
    if (m) return (available && twAnimateCss) || new RegExp(`${m[1]}-${m[2]}`).test(text);
    return false;
  };
  const state = { available, why, twAnimateCss, defines };
  stateCache.set(root + "|" + nearest, state);
  return state;
}
export const _resetDeadClassCache = () => stateCache.clear();

const HELPERS = /^(cn|cx|clsx|classnames|classNames|twMerge|twJoin|cva|tv|ctl)$/;
/** Is this string literal a class list (className / class attribute, a cn/clsx/cva/tv argument, a `…Class(es)` const)? */
function inClassContext(node) {
  for (let p = node.parent, i = 0; p && i < 12; p = p.parent, i++) {
    if (p.type === "JSXAttribute") return !!p.name && /^(className|class)$/.test(p.name.name);
    if (p.type === "CallExpression") {
      const c = p.callee;
      const name = c.type === "Identifier" ? c.name : c.type === "MemberExpression" && !c.computed ? c.property.name : "";
      return HELPERS.test(name);
    }
    if (p.type === "Property" && p.value === node && p.key && /^(className|class)$/.test(p.key.name || p.key.value)) return true;
    if (p.type === "VariableDeclarator") return p.id.type === "Identifier" && /(class|cls|styles?|variants?)$/i.test(p.id.name);
    if (/Statement|Declaration|Function/.test(p.type)) return false;
  }
  return false;
}

/** Dead tokens in a class string for this file's project. */
function deadTokens(str, state) {
  const out = [];
  for (const tok of String(str).split(/\s+/).filter(Boolean)) {
    const b = base(tok);
    if (DISCLOSURE.test(b)) { if (!state.defines(b)) out.push(tok); continue; }
    if (!ANIMATE.test(b)) continue;
    if (state.available === false && !state.defines(b)) out.push(tok);
  }
  return out;
}

/** 6.12 — Tailwind classes that generate no CSS in this project (the animation-utility family) are flagged. */
export const noDeadClasses = {
  meta: meta("Utility classes must generate CSS in this project (animate-in / fade-in / slide-in-from-* need tw-animate-css or tailwindcss-animate)", "6.12", "P59", {
    messages: {
      dead: "{{tokens}} generate no CSS here: {{why}}. They do nothing — the element appears and disappears in one frame. Install tw-animate-css and add `@import \"tw-animate-css\";` next to `@import \"tailwindcss\";` (Tailwind v3: tailwindcss-animate in tailwind.config plugins), or animate it another way. [6.12]",
      disclosure: "{{tokens}} generate no CSS here: no `accordion-down`/`collapsible-down` keyframes are defined and tw-animate-css is not in effect. The panel jumps open and shut. Import tw-animate-css, or define the keyframes (--animate-accordion-down in @theme). [6.12]",
    },
  }),
  create(context) {
    const file = context.filename || (context.getFilename && context.getFilename());
    let state = null;
    const check = (node, str) => {
      if (!str || !/(animate-|fade-|zoom-|spin-|slide-)/.test(str) || !inClassContext(node)) return;
      state = state || animatePluginState(file);
      if (state.available === null && !/animate-(accordion|collapsible)/.test(str)) return;
      const dead = deadTokens(str, state);
      if (!dead.length) return;
      const disc = dead.filter((t) => DISCLOSURE.test(base(t)));
      const anim = dead.filter((t) => !DISCLOSURE.test(base(t)));
      if (anim.length) context.report({ node, messageId: "dead", data: { tokens: anim.map((t) => `\`${t}\``).join(", "), why: state.why || "the animation plugin is not in effect" } });
      if (disc.length && state.available !== null) context.report({ node, messageId: "disclosure", data: { tokens: disc.map((t) => `\`${t}\``).join(", ") } });
    };
    return {
      Literal(node) { if (typeof node.value === "string") check(node, node.value); },
      TemplateLiteral(node) { check(node, node.quasis.map((q) => q.value.cooked || "").join(" ")); },
    };
  },
};
