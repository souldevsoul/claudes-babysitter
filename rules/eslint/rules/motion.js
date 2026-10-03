// Motion: overlays appear and disappear, they do not blink in and out.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { meta, elementName, getAttr, classTokens, classStrings, resolveConst } from "../util.js";

// headless UI libraries whose Content / Popup parts are overlays (a select list, a menu, a popover, a dialog…)
const LIBS = /^(@radix-ui\/|radix-ui$|@base-ui-components\/|@base-ui\/|@headlessui\/|@ariakit\/)/;
const PARTS = /^(Content|Popup|SubContent|Overlay|Backdrop)$/;
// what counts as motion: animation utilities (tw-animate-css / tailwindcss-animate), CSS transitions with Base UI's
// starting/ending styles, or a project's own animate-* utility
const ENTER = /(^|:)(animate-in|animate-(?!out\b|none\b)|fade-in|zoom-in|slide-in)|data-\[(state=open|open|starting-style|entering)\]:|data-(starting-style|open):|motion-safe:animate-/;
const EXIT = /(^|:)(animate-out|fade-out|zoom-out|slide-out)|data-\[(state=closed|closed|ending-style|exiting)\]:|data-(ending-style|closed):/;
const PLUGIN_CLASS = /(^|:)(animate-in|animate-out|fade-(in|out)-|zoom-(in|out)-|slide-(in|out)-from-|slide-(in|out)-to-)/;

const pkgCache = new Map();
/** Does the project that owns `file` have an animation-utility plugin (tw-animate-css / tailwindcss-animate)? */
function hasAnimatePlugin(file) {
  for (let dir = dirname(file); dir && dir !== dirname(dir); dir = dirname(dir)) {
    const pkg = join(dir, "package.json");
    if (pkgCache.has(pkg)) return pkgCache.get(pkg);
    if (!existsSync(pkg)) continue;
    let ok = null;
    try {
      const j = JSON.parse(readFileSync(pkg, "utf8"));
      const deps = { ...j.dependencies, ...j.devDependencies };
      ok = !!(deps["tw-animate-css"] || deps["tailwindcss-animate"]);
    } catch {}
    pkgCache.set(pkg, ok);
    return ok;
  }
  return null; // unknown: do not guess
}

/** 6.12 — overlays (select lists, menus, popovers, dialogs, tooltips) animate in and out. */
export const overlayMotion = {
  meta: meta("Overlays animate in and out (enter + exit, 120–200 ms, respecting reduced motion)", "6.12", "P59", {
    messages: {
      none: "<{{name}}> appears and disappears without motion. Give it an enter and an exit animation (opacity + a small scale or 4–8px slide, 120–200 ms; data-[state=open]:animate-in … data-[state=closed]:animate-out …) and motion-reduce:animate-none. [6.12]",
      enter: "<{{name}}> animates out but not in: add an enter animation (data-[state=open]:animate-in fade-in-0 zoom-in-95). [6.12]",
      exit: "<{{name}}> animates in but not out: add an exit animation (data-[state=closed]:animate-out fade-out-0 zoom-out-95) — closing must not blink away. [6.12]",
      plugin: "<{{name}}> uses animate-in / fade-in / zoom-in classes, but this project has no tw-animate-css (or tailwindcss-animate): they compile to nothing and it does not move. Install tw-animate-css and @import it next to tailwindcss. [6.12]",
    },
  }),
  create(context) {
    const locals = new Set(); // names bound to a headless-UI import (namespace or named)
    return {
      ImportDeclaration(node) {
        if (!LIBS.test(String(node.source.value))) return;
        for (const s of node.specifiers) locals.add(s.local.name);
      },
      JSXOpeningElement(node) {
        const name = elementName(node);
        const [obj, part] = name.split(".");
        if (!part || !locals.has(obj) || !PARTS.test(part)) return;
        if (/^(Overlay|Backdrop)$/.test(part) && !getAttr(node, "className")) return; // an unstyled backdrop is invisible anyway
        const attr = getAttr(node, "className");
        const tokens = classTokens(attr, context);
        // classes built by a variants helper — cn(drawerVariants({ side }), …) where drawerVariants = cva("…", { … }):
        // look inside its definition too
        const seen = new Set();
        const walk = (n) => {
          if (!n || typeof n !== "object") return;
          if (n.type === "CallExpression" && n.callee.type === "Identifier" && !seen.has(n.callee.name)) {
            seen.add(n.callee.name);
            const init = resolveConst(context, n.callee);
            if (init) tokens.push(...classStrings({ value: init }, context).join(" ").split(/\s+/).filter(Boolean));
          }
          for (const k of ["expression", "arguments", "callee", "consequent", "alternate", "left", "right", "elements"]) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object" && v.type) walk(v); }
        };
        if (attr && attr.value) walk(attr.value);
        const enter = tokens.some((t) => ENTER.test(t)), exit = tokens.some((t) => EXIT.test(t));
        if (!enter && !exit) return context.report({ node, messageId: "none", data: { name } });
        if (!enter) return context.report({ node, messageId: "enter", data: { name } });
        if (!exit) return context.report({ node, messageId: "exit", data: { name } });
        if (tokens.some((t) => PLUGIN_CLASS.test(t)) && hasAnimatePlugin(context.filename) === false) context.report({ node, messageId: "plugin", data: { name } });
      },
    };
  },
};
