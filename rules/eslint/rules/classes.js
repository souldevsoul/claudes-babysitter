// Rules that inspect Tailwind class strings in className.
import { meta, elementName, getAttr, classTokens, base, fileMatches, DEFAULT_KIT, DEFAULT_THEME_PATHS } from "../util.js";
import { arbitraryKind, isPalette, isClassList, tinyText } from "../../../lib/tokens.js";

/** Visual utilities that must come from variants, not from call sites. Layout utilities stay allowed. */
const VISUAL = [
  /^bg-/, /^text-(?!left$|center$|right$|justify$|start$|end$|wrap$|nowrap$|balance$|pretty$|ellipsis$|clip$)/,
  /^rounded/, /^border/, /^shadow/, /^ring/, /^outline/, /^p[xytrbl]?-/, /^font-/, /^h-/, /^min-h-/, /^leading-/,
  /^tracking-/, /^opacity-/, /^from-/, /^to-/, /^via-/, /^backdrop-/, /^fill-/, /^stroke-/,
];
const STATE_PREFIX = /(^|:)(hover|focus|focus-visible|active|disabled|data-\[[^\]]+\]|aria-[a-z]+|group-hover):/;
const kitOption = { type: "object", properties: { components: { type: "array", items: { type: "string" } } }, additionalProperties: false };

/** 1.4/1.15 — UI-kit components accept layout-only className, and the className must be readable statically. */
export const noVisualClassnameOverride = {
  meta: meta("UI-kit components accept layout-only className", "1.3 / 1.4 / 1.15", "P04 P06 P46", {
    schema: [kitOption],
    messages: {
      override: '<{{name}} className="… {{token}} …"> overrides the component\'s look. Use an existing variant/size; className may only carry layout (margin, width, flex/grid placement). A look used in one place is not a new variant: it is a role of its own (nav row, pager step, skip link) and gets its own kit component. [1.15, P46]',
      dynamic: "<{{name}} className={…}> is built from a variable, so its classes cannot be checked. Pass a variant prop instead, or inline the layout classes. [1.15, P46]",
      style: "<{{name}} style={…}> restyles a kit component. Add a variant instead. [1.15, P46]",
    },
  }),
  create(context) {
    const kit = new Set((context.options[0] && context.options[0].components) || DEFAULT_KIT);
    return {
      JSXOpeningElement(node) {
        const name = elementName(node);
        if (!kit.has(name) && !kit.has(name.split(".")[0])) return;
        const styleAttr = getAttr(node, "style");
        if (styleAttr) return context.report({ node, messageId: "style", data: { name } });
        const attr = getAttr(node, "className");
        if (!attr) return;
        const e = attr.value && attr.value.type === "JSXExpressionContainer" ? attr.value.expression : null;
        if (e && (e.type === "MemberExpression" || (e.type === "Identifier" && !classTokens(attr, context).length))) return context.report({ node, messageId: "dynamic", data: { name } });
        for (const tok of classTokens(attr, context)) {
          const b = base(tok);
          if (STATE_PREFIX.test(tok) || VISUAL.some((re) => re.test(b))) return context.report({ node, messageId: "override", data: { name, token: tok } });
        }
      },
    };
  },
};

function tokenRule({ description, guideline, patterns, message, test, schema = [], skipThemePaths = false }) {
  return {
    meta: meta(description, guideline, patterns, { messages: { bad: message }, schema }),
    create(context) {
      const opts = context.options[0] || {};
      if (skipThemePaths && fileMatches(context.filename, opts.themePaths || DEFAULT_THEME_PATHS)) return {};
      return {
        JSXAttribute(node) {
          if (!node.name || !["className", "class"].includes(node.name.name)) return;
          for (const tok of classTokens(node, context)) {
            if (test(base(tok), opts)) context.report({ node, messageId: "bad", data: { token: tok } });
          }
        },
      };
    },
  };
}

/** 6.8 — no transition-all. */
export const noTransitionAll = tokenRule({
  description: "Name the transitioned properties",
  guideline: "6.8",
  patterns: "—",
  message: '"{{token}}" animates layout properties and causes jumps/jank. Use transition-colors / transition-opacity / transition-transform. [6.8]',
  test: (b) => b === "transition-all" || b === "transition",
});

/** 2.7 — spacing comes from the scale. Negative margins are allowed only when the project opts in. */
export const noArbitrarySpacing = tokenRule({
  description: "Use spacing tokens only",
  guideline: "2.7 / 2.8",
  patterns: "P28 P29",
  schema: [{ type: "object", properties: { allowNegative: { type: "boolean" } }, additionalProperties: false }],
  message: '"{{token}}" is a negative margin. Use the spacing tokens and a gap wrapper instead of pulling blocks around (or set allow.negativeMargins for deliberate overlapping layouts). [2.7, P28 P29]',
  test: (b, o) => !o.allowNegative && /^-(m|space)[xytrbl]?-/.test(b),
});

/**
 * 6.4 — size floor only. Weight and translucency are design choices; their legibility is
 * measured at runtime (Playwright contrast check), not guessed from class names.
 */
export const noIllegibleText = tokenRule({
  description: "Text must be ≥12px",
  guideline: "6.4",
  patterns: "P11 P34",
  message: '"{{token}}" is below the 12px legibility floor. Use a text-style token ≥ 12px. [6.4, P11]',
  test: (b) => {
    const m = b.match(/^text-\[(\d+(?:\.\d+)?)(px|rem)\]$/);
    return m ? (m[2] === "px" ? Number(m[1]) < 12 : Number(m[1]) < 0.75) : false;
  },
});

/**
 * 6.3 / 6.5 / 1.16 — visual values come from theme tokens. Every string that looks like a Tailwind class
 * list is judged where it is WRITTEN: a className attribute, an object map (styles.card = "…"), a const,
 * cn()/clsx() arguments, cva() config. Reported once, at the definition.
 */
const classLiteralVisitor = (context, onToken) => {
  const opts = context.options[0] || {};
  if (fileMatches(context.filename, opts.themePaths || DEFAULT_THEME_PATHS)) return {};
  const check = (node, text) => {
    if (!isClassList(text)) return;
    for (const tok of text.split(/\s+/).filter(Boolean)) onToken(node, tok);
  };
  return {
    Literal(node) { if (typeof node.value === "string" && !(node.parent && node.parent.type === "ImportDeclaration")) check(node, node.value); },
    TemplateElement(node) { check(node, node.value.cooked || ""); },
  };
};
export const noArbitraryValues = {
  meta: meta("Colours, radii, shadows, spacing and type sizes come from theme tokens", "6.3 / 6.5 / 1.16", "P04 P33 P46 P47", {
    schema: [{ type: "object", properties: { themePaths: { type: "array", items: { type: "string" } } }, additionalProperties: false }],
    messages: { bad: '"{{token}}" hard-codes a {{kind}}. Add a theme token (@theme / CSS variable) and use it — `[var(--token)]` is fine — so every place renders the same value. [6.5, P33 P46]' },
  }),
  create(context) {
    return classLiteralVisitor(context, (node, tok) => {
      const kind = arbitraryKind(tok);
      if (kind && !tinyText(tok)) context.report({ node, messageId: "bad", data: { token: tok, kind } });
    });
  },
};
export const noRawPalette = {
  meta: meta("Use semantic colour tokens, not palette hues, outside the kit", "6.3 / 6.5 / 1.16", "P04 P33 P46 P47", {
    schema: [{ type: "object", properties: { themePaths: { type: "array", items: { type: "string" } } }, additionalProperties: false }],
    messages: { bad: '"{{token}}" is a raw palette colour. Use a semantic token (bg-primary, text-muted-foreground, border-border…) defined in the theme, so the product has one palette. [6.5, P33 P46]' },
  }),
  create(context) {
    return classLiteralVisitor(context, (node, tok) => { if (isPalette(tok)) context.report({ node, messageId: "bad", data: { token: tok } }); });
  },
};

/** 2.2 — no horizontal scroll rails (unless the project declares rails allowed, e.g. media galleries). */
export const noScrollRail = {
  meta: meta("No horizontally scrolling rails", "2.1 / 2.2", "P15 P16", {
    messages: { rail: "Horizontal scroll rail ({{token}}). Wrap into a responsive grid or a stacked list instead. If this is a media gallery with visible controls, allow rails in babysitter.config.json. [2.2, P15 P16]" },
  }),
  create(context) {
    return {
      JSXAttribute(node) {
        if (!node.name || node.name.name !== "className") return;
        const toks = classTokens(node, context).map(base);
        const scrollX = toks.find((t) => t === "overflow-x-auto" || t === "overflow-x-scroll" || t === "overflow-auto" || t === "overflow-scroll");
        if (!scrollX) return;
        const railHint = toks.find((t) => /^snap-x/.test(t) || t === "flex-nowrap" || t === "min-w-max" || t === "w-max" || t === "whitespace-nowrap");
        if (railHint) context.report({ node, messageId: "rail", data: { token: `${scrollX} + ${railHint}` } });
      },
    };
  },
};

/** 1.16 — no thin wrapper components around a kit component: that is a variant, not a new component. */
export const noThinKitWrapper = {
  meta: meta("Extend the kit with variants instead of wrapper components", "1.16", "P05 P46 P47", {
    schema: [kitOption],
    messages: { wrapper: "{{comp}} only wraps <{{name}}> and forwards props. Use one of {{name}}'s existing variants instead of a look-alike component; if the look is a distinct role, make it a kit component of its own in components/ui. [1.16, P46 P47]" },
  }),
  create(context) {
    const kit = new Set((context.options[0] && context.options[0].components) || DEFAULT_KIT);
    if (fileMatches(context.filename, DEFAULT_THEME_PATHS)) return {};
    return {
      JSXOpeningElement(node) {
        const name = elementName(node);
        if (!kit.has(name)) return;
        if (!node.attributes.some((a) => a.type === "JSXSpreadAttribute")) return;
        const el = node.parent;
        const p = el.parent;
        const isRoot = p && (p.type === "ReturnStatement" || (p.type === "ArrowFunctionExpression" && p.body === el));
        if (!isRoot) return;
        const comp = (() => { for (let q = p; q; q = q.parent) { if (q.type === "FunctionDeclaration" || q.type === "ArrowFunctionExpression" || q.type === "FunctionExpression") { let v = q.parent; while (v && v.type === "CallExpression") v = v.parent; return q.id ? q.id.name : v && v.type === "VariableDeclarator" ? v.id.name : null; } } return null; })();
        if (comp && /^[A-Z]/.test(comp) && comp !== name) context.report({ node, messageId: "wrapper", data: { comp, name } });
      },
    };
  },
};

/**
 * 1.15 / 1.16 — variant factories (cva, tv) belong to the kit. A cva() in a page is a private
 * component style that nothing else reuses and nothing checks.
 */
export const noStylesOutsideKit = {
  meta: meta("Variant factories (cva/tv) live in the UI-kit", "1.15 / 1.16", "P04 P46 P47", {
    schema: [{ type: "object", properties: { themePaths: { type: "array", items: { type: "string" } } }, additionalProperties: false }],
    messages: { bad: "{{fn}}() defines a component style outside the UI-kit. Move it into components/ui as a variant of the kit component (or a new reviewed kit component) and use that. [1.16, P46 P47]" },
  }),
  create(context) {
    const opts = context.options[0] || {};
    if (fileMatches(context.filename, opts.themePaths || DEFAULT_THEME_PATHS)) return {};
    return {
      CallExpression(node) {
        const c = node.callee;
        if (c.type === "Identifier" && ["cva", "tv"].includes(c.name)) context.report({ node, messageId: "bad", data: { fn: c.name } });
      },
    };
  },
};

/**
 * 1.16 — a design system has a handful of looks per component. Moving every call-site override into a
 * "named variant" satisfies no-visual-classname-override and changes nothing: a button with 109 variants
 * (seen on a real product, 2026-10) is the same drift under new names. Each variant axis of a kit
 * component — a cva/tv `variants: { variant: {…}, size: {…} }` axis, or a const map such as VARIANTS / LOOKS
 * / buttonTones — may hold at most `max` (default 10) looks. Merge near-duplicates; a look one screen uses
 * is a role of its own and becomes its own kit component.
 */
const MAP_NAME = /^(?:[A-Z_]*(?:VARIANTS?|LOOKS?|TONES?|SIZES?|KINDS?|INTENTS?)|[a-z]\w*(?:Variants|Looks|Tones|Sizes|Kinds|Intents)|variants|looks|tones|sizes)$/;
const AXIS_NAME = /^(variant|look|tone|size|kind|intent|appearance|color|colour)s?$/i;
const isStyleValue = (v) => v && ((v.type === "Literal" && typeof v.value === "string") || v.type === "TemplateLiteral" || (v.type === "ArrayExpression" && v.elements.every((e) => e && e.type === "Literal" && typeof e.value === "string")));
export const variantBudget = {
  meta: meta("A kit component has at most a handful of looks per variant axis", "1.16", "P46 P47", {
    schema: [{ type: "object", properties: { max: { type: "integer", minimum: 2 }, themePaths: { type: "array", items: { type: "string" } } }, additionalProperties: false }],
    messages: { budget: "{{where}} has {{n}} looks (budget {{max}}). That is call-site overrides renamed, not a design system: merge near-duplicates into the core looks, and move a look only one screen uses into a kit component of its own (nav row, pager step, skip link). [1.16, P46 P47]" },
  }),
  create(context) {
    const opts = context.options[0] || {};
    const max = opts.max || 10;
    if (!fileMatches(context.filename, opts.themePaths || DEFAULT_THEME_PATHS)) return {};
    const check = (obj, where) => {
      const props = obj.properties.filter((p) => p.type === "Property");
      if (props.length <= max) return;
      if (props.filter((p) => isStyleValue(p.value)).length < props.length * 0.8) return;
      context.report({ node: obj, messageId: "budget", data: { where, n: props.length, max } });
    };
    return {
      ObjectExpression(node) {
        const parent = node.parent;
        // cva/tv: variants: { variant: {…}, size: {…} } — every axis counts
        if (parent && parent.type === "Property" && parent.value === node) {
          const key = parent.key && (parent.key.name || parent.key.value);
          const outer = parent.parent && parent.parent.parent;
          if (outer && outer.type === "Property" && (outer.key.name || outer.key.value) === "variants") return check(node, `variant axis "${key}"`);
          if (AXIS_NAME.test(String(key)) && !(outer && outer.type === "Property")) return check(node, `"${key}" map`);
        }
        if (parent && parent.type === "VariableDeclarator" && parent.id.type === "Identifier" && MAP_NAME.test(parent.id.name)) return check(node, parent.id.name);
        if (parent && parent.type === "TSAsExpression" && parent.parent.type === "VariableDeclarator" && parent.parent.id.type === "Identifier" && MAP_NAME.test(parent.parent.id.name)) return check(node, parent.parent.id.name);
      },
    };
  },
};
