// Shared helpers for the claudes-babysitter ESLint rules.

const GUIDE = "https://github.com/souldevsoul/claudes-babysitter/blob/main/docs/ui-architecture-guidelines.md";

/** Rule metadata with a pointer to the guideline rule and the Nexus bug patterns it prevents. */
export function meta(description, guideline, patterns, extra = {}) {
  return {
    type: "problem",
    docs: { description: `${description} (guideline ${guideline}; patterns ${patterns})`, url: `${GUIDE}#${guideline}` },
    schema: extra.schema || [],
    messages: extra.messages,
  };
}

/** Name of a JSX element: "button", "Button", "Select.Trigger" → "Select.Trigger". */
export function elementName(node) {
  const n = node.name;
  if (!n) return "";
  if (n.type === "JSXIdentifier") return n.name;
  if (n.type === "JSXMemberExpression") {
    const parts = [];
    let cur = n;
    while (cur && cur.type === "JSXMemberExpression") {
      parts.unshift(cur.property.name);
      cur = cur.object;
    }
    if (cur && cur.type === "JSXIdentifier") parts.unshift(cur.name);
    return parts.join(".");
  }
  return "";
}

export function getAttr(node, name) {
  return node.attributes.find((a) => a.type === "JSXAttribute" && a.name && a.name.name === name) || null;
}

/** Static string value of an attribute (literal or {"literal"}), else null. */
export function staticAttrValue(attr) {
  if (!attr || !attr.value) return null;
  const v = attr.value;
  if (v.type === "Literal" && typeof v.value === "string") return v.value;
  if (v.type === "JSXExpressionContainer") {
    const e = v.expression;
    if (e.type === "Literal" && typeof e.value === "string") return e.value;
    if (e.type === "TemplateLiteral" && e.expressions.length === 0) return e.quasis.map((q) => q.value.cooked).join("");
  }
  return null;
}

/**
 * Every static class string inside a className value: plain strings, template
 * literal chunks, and string arguments to cn()/clsx()/twMerge()/cva(),
 * including both branches of ternaries and && chains.
 */
export function classStrings(attr, context) {
  const out = [];
  if (!attr || !attr.value) return out;
  const seen = new Set();
  const visit = (n) => {
    if (!n) return;
    switch (n.type) {
      case "MemberExpression": {
        // className={styles.card} where const styles = { card: "…" }
        if (!context) break;
        const v = resolveMember(context, n);
        if (v) visit(v);
        break;
      }
      case "Identifier": {
        // className={cardCls} where const cardCls = "…" / cva(…) / cn(…) in scope
        if (!context || seen.has(n.name)) break;
        seen.add(n.name);
        const init = resolveConst(context, n);
        if (init) visit(init);
        break;
      }
      case "Literal":
        if (typeof n.value === "string") out.push(n.value);
        break;
      case "TemplateLiteral":
        n.quasis.forEach((q) => out.push(q.value.cooked || ""));
        n.expressions.forEach(visit);
        break;
      case "JSXExpressionContainer":
        visit(n.expression);
        break;
      case "CallExpression":
        n.arguments.forEach(visit);
        break;
      case "ConditionalExpression":
        visit(n.consequent);
        visit(n.alternate);
        break;
      case "LogicalExpression":
        visit(n.left);
        visit(n.right);
        break;
      case "ArrayExpression":
        n.elements.forEach(visit);
        break;
      case "ObjectExpression":
        // clsx({ "class-a": cond })
        n.properties.forEach((p) => {
          if (p.key && p.key.type === "Literal" && typeof p.key.value === "string") out.push(p.key.value);
        });
        break;
      default:
        break;
    }
  };
  visit(attr.value);
  return out;
}

/** Individual utility tokens ("hover:bg-red-500", "px-4") from the class strings. */
export function classTokens(attr, context) {
  return classStrings(attr, context)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Strip variant prefixes: "md:hover:bg-red-500" → "bg-red-500", "!px-4" → "px-4". */
export function base(token) {
  const parts = token.split(":");
  return parts[parts.length - 1].replace(/^!/, "");
}

/** Minimal glob → RegExp for path allowlists ("**", "*"). */
export function globToRegExp(glob) {
  const re = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "§D")
    .replace(/\*\*/g, "§A")
    .replace(/\*/g, "[^/]*")
    .replace(/§D/g, "(?:.*/)?")
    .replace(/§A/g, ".*");
  return new RegExp(`(^|/)${re}$`);
}

export function fileMatches(filename, globs) {
  const f = (filename || "").replace(/\\/g, "/");
  return (globs || []).some((g) => globToRegExp(g).test(f));
}

/** Components of the UI-kit. Projects extend this via babysitter.config.json → "kit". */
export const DEFAULT_KIT = [
  "Button", "Select", "SelectTrigger", "SelectContent", "SelectItem", "Card", "CardHeader", "CardContent", "CardFooter",
  "Input", "Textarea", "Badge", "Dialog", "DialogContent", "AlertDialog", "AlertDialogContent", "Sheet", "SheetContent",
  "Popover", "PopoverContent", "DropdownMenuContent", "DropdownMenuItem", "Tabs", "TabsList", "TabsTrigger", "Checkbox",
  "Switch", "RadioGroup", "DatePicker", "Tooltip", "TooltipContent", "Table", "Label",
];

/** Paths where the kit and theme live: visual values are defined there, so visual rules are relaxed. */
export const DEFAULT_THEME_PATHS = ["**/components/ui/**", "**/theme/**", "**/design-system/**"];

/** Enclosing function of a node, if it is a React component (Capitalised name). */
export function enclosingComponentName(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type === "FunctionDeclaration") return p.id && /^[A-Z]/.test(p.id.name) ? p.id.name : null;
    if (p.type === "ArrowFunctionExpression" || p.type === "FunctionExpression") {
      let q = p.parent;
      // forwardRef(...) / memo(...)
      while (q && q.type === "CallExpression") q = q.parent;
      if (q && q.type === "VariableDeclarator" && q.id.type === "Identifier") return /^[A-Z]/.test(q.id.name) ? q.id.name : null;
      return null;
    }
  }
  return null;
}

/** Initializer of a const binding visible from node, or null. */
export function resolveConst(context, id) {
  try {
    let scope = context.sourceCode.getScope(id);
    for (; scope; scope = scope.upper) {
      const v = scope.set.get(id.name);
      if (!v) continue;
      const def = v.defs[0];
      if (def && def.type === "Variable" && def.parent && def.parent.kind === "const" && def.node.init) return def.node.init;
      return null;
    }
  } catch {}
  return null;
}

/** Tailwind palette hues: bg-blue-600, text-zinc-900/80, border-slate-200 … */
export const PALETTE_LEGACY = /^(bg|text|border(-[trblxy])?|ring|outline|fill|stroke|from|via|to|decoration|divide|placeholder|shadow|accent|caret)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|[1-9]00|950)(\/\S+)?$/;

/** styles.card where `const styles = { card: … }` → the property value node, or null. */
export function resolveMember(context, mem) {
  if (mem.type !== "MemberExpression" || mem.object.type !== "Identifier") return null;
  const obj = resolveConst(context, mem.object);
  if (!obj || obj.type !== "ObjectExpression") return null;
  const name = mem.computed ? (mem.property.type === "Literal" ? String(mem.property.value) : null) : mem.property.name;
  const prop = obj.properties.find((p) => p.type === "Property" && (p.key.name ?? String(p.key.value)) === name);
  return prop ? prop.value : null;
}
