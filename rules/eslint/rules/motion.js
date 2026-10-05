// Motion: overlays appear and disappear, they do not blink in and out.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { meta, elementName, getAttr, classTokens, classStrings, resolveConst } from "../util.js";

// headless UI libraries whose Content / Popup parts are overlays (a select list, a menu, a popover, a dialog…)
const LIBS = /^(@radix-ui\/|radix-ui$|@base-ui-components\/|@base-ui\/|@headlessui\/|@ariakit\/)/;
// only parts that float over the page count — tabs, accordions and collapsibles are content, not overlays
const OVERLAY = /(select|dialog|alert-?dialog|popover|dropdown-?menu|context-?menu|menubar|hover-?card|tooltip|navigation-?menu|menu|combobox|listbox|sheet|drawer|preview-?card|toast)/i;
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

const verCache = new Map();
/** Installed version of `pkg` as seen from `file` (nearest node_modules), else the lowest version its package.json range allows. */
function installedVersion(file, pkg) {
  const key = dirname(file) + "|" + pkg;
  if (verCache.has(key)) return verCache.get(key);
  let v = null;
  for (let dir = dirname(file); dir && dir !== dirname(dir) && !v; dir = dirname(dir)) {
    const p = join(dir, "node_modules", pkg, "package.json");
    if (existsSync(p)) { try { v = JSON.parse(readFileSync(p, "utf8")).version; } catch {} break; }
    const own = join(dir, "package.json");
    if (existsSync(own)) {
      try { const j = JSON.parse(readFileSync(own, "utf8")); const r = { ...j.dependencies, ...j.devDependencies }[pkg]; if (r) { const m = String(r).match(/(\d+)\.(\d+)(?:\.(\d+))?/); if (m) v = `${m[1]}.${m[2]}.${m[3] || 0}`; } } catch {}
    }
  }
  verCache.set(key, v);
  return v;
}
const older = (v, than) => { if (!v) return false; const a = v.split(".").map(Number), b = than.split(".").map(Number); for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) < (b[i] || 0); return false; };

// a hand-made overlay: {open && <div className="absolute … z-50 shadow …">…}
const OPEN_STATE = /(open|show|visible|expanded|menu|dropdown|popover|popup|list|picker)/i;
const POSITIONED = /^(absolute|fixed)$/;
const LAYERED = /^(z-|shadow|drop-shadow)/;

/** 6.12 — overlays (select lists, menus, popovers, dialogs, tooltips) animate in and out. */
export const overlayMotion = {
  meta: meta("Overlays animate in and out (enter + exit, 120–200 ms, respecting reduced motion)", "6.12", "P59", {
    messages: {
      none: "<{{name}}> appears and disappears without motion. Give it an enter and an exit animation (opacity + a small scale or 4–8px slide, 120–200 ms; data-[state=open]:animate-in … data-[state=closed]:animate-out …) and motion-reduce:animate-none. [6.12]",
      enter: "<{{name}}> animates out but not in: add an enter animation (data-[state=open]:animate-in fade-in-0 zoom-in-95). [6.12]",
      exit: "<{{name}}> animates in but not out: add an exit animation (data-[state=closed]:animate-out fade-out-0 zoom-out-95) — closing must not blink away. [6.12]",
      mount: "<{{name}}> is a hand-made overlay mounted with {{{cond}} && …}: it pops in and vanishes in one frame, and unmounting means it can never animate out. Use the kit's DropdownMenu / Popover / Select (they open and close with motion, Escape and arrow keys included), or keep it mounted and animate it both ways (data-state + transition, or AnimatePresence). [6.12]",
      selectExit: "<{{name}}> has exit classes, but @radix-ui/react-select {{version}} unmounts the list at once — they never play and the list blinks out. Update @radix-ui/react-select to ^2.3.0 (exit animations arrived there). [6.12]",
      plugin: "<{{name}}> uses animate-in / fade-in / zoom-in classes, but this project has no tw-animate-css (or tailwindcss-animate): they compile to nothing and it does not move. Install tw-animate-css and @import it next to tailwindcss. [6.12]",
    },
  }),
  create(context) {
    const locals = new Set(); // names bound to a headless-UI import (namespace or named)
    const selects = new Set(); // names bound to Radix Select
    return {
      ImportDeclaration(node) {
        const src = String(node.source.value);
        if (!LIBS.test(src)) return;
        // the package says what it is (@radix-ui/react-select), or — for an umbrella package — the imported name does
        for (const sp of node.specifiers) {
          const imported = sp.imported ? (sp.imported.name || sp.imported.value) : "";
          if (OVERLAY.test(src.replace(/^.*\//, "")) || OVERLAY.test(imported) || OVERLAY.test(sp.local.name)) locals.add(sp.local.name);
          if (src === "@radix-ui/react-select" || (src === "radix-ui" && imported === "Select")) selects.add(sp.local.name);
        }
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
        if (tokens.some((t) => PLUGIN_CLASS.test(t)) && hasAnimatePlugin(context.filename) === false) return context.report({ node, messageId: "plugin", data: { name } });
        if (part === "Content" && selects.has(obj)) {
          const version = installedVersion(context.filename, "@radix-ui/react-select");
          if (older(version, "2.3.0")) context.report({ node, messageId: "selectExit", data: { name, version } });
        }
      },
      // {open && <div className="absolute z-50 …">} / {open ? <div …> : null}
      "LogicalExpression, ConditionalExpression"(node) {
        let cond, el;
        if (node.type === "LogicalExpression" && node.operator === "&&" && node.right.type === "JSXElement") { cond = node.left; el = node.right; }
        else if (node.type === "ConditionalExpression") {
          const nul = (n) => !n || (n.type === "Literal" && n.value === null) || (n.type === "Identifier" && n.name === "undefined");
          if (node.consequent.type === "JSXElement" && nul(node.alternate)) { cond = node.test; el = node.consequent; }
          else if (node.alternate.type === "JSXElement" && nul(node.consequent)) { cond = node.test; el = node.alternate; }
        }
        if (!el || !node.parent || node.parent.type !== "JSXExpressionContainer") return;
        const condText = context.sourceCode.getText(cond);
        if (!OPEN_STATE.test(condText) || condText.length > 60) return;
        const name = elementName(el.openingElement);
        if (/^motion\./.test(name) || /^m\./.test(name)) return; // framer-motion: AnimatePresence handles the exit
        if (/^[A-Z]/.test(name)) return; // a component: its own markup decides
        for (let a = node.parent; a; a = a.parent) if (a.type === "JSXElement" && /(^|\.)AnimatePresence$/.test(elementName(a.openingElement))) return; // framer-motion keeps it until its exits finish
        const tokens = classTokens(getAttr(el.openingElement, "className"), context);
        if (!tokens.some((t) => POSITIONED.test(t)) || !tokens.some((t) => LAYERED.test(t))) return;
        context.report({ node: el.openingElement, messageId: "mount", data: { name, cond: condText.replace(/\s+/g, " ") } });
      },
    };
  },
};
