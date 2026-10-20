// ui/mutation-refreshes-ui (FORMS FM5, heuristic → "warn") — in a client component, a handler that sends a
// mutation (fetch with POST/PUT/PATCH/DELETE, axios/api/http/client .post/.put/.patch/.delete) also updates what
// the page shows: a state setter, router.refresh(), revalidatePath/Tag, SWR mutate, React Query invalidate/refetch,
// a navigation, a session update(), a dispatch, or a callback prop (onSaved()). Otherwise the header balance, the
// display name or the list keeps the old value until a reload — 31 projects had that card.
// The handler may also hand the response back (return …) for its caller to apply; that is accepted.
import { meta } from "../util.js";

const MUTATING = /^(post|put|patch|delete|del)$/i;
const CLIENTS = /^(axios|api|http|client|request|apiClient|fetcher|ky)$/;
const REFRESH = /\brouter\.(refresh|push|replace)\s*\(|\brevalidate(Path|Tag)\s*\(|\bmutate\s*\(|invalidateQueries|refetch\w*\s*\(|setQueryData|resetQueries|location\.(reload|assign|replace)\s*\(|location\.href\s*=|\bdispatch\s*\(|\bupdate(Session)?\s*\(|\bon[A-Z]\w*\s*\(|\bonSuccess\b|\breload\w*\s*\(|\bload\w*\s*\(|\bfetch(Data|User|Balance|Items|List|Profile)\w*\s*\(|\bstartTransition\s*\(|\bredirect\s*\(|\bnavigate\s*\(|\bsign(Out|In)\s*\(|\bsetState\s*\(|\.set\s*\(|\bupdate[A-Z]\w*\s*\(|\brefresh\w*\s*\(/;

// setters that only flip the form's own flags (busy, error, dialog open, "Saved!" message) do not refresh data
const FLAG_SETTER = /^set(Is|Has)?(Loading|Saving|Submitting|Pending|Busy|Error|Errors|FormError|Open|Show\w*|Modal\w*|Dialog\w*|Disabled|Sending|Processing|Message|Status|Success|Done|Sent|Saved|Toast\w*|Step|Visible|Editing|Copied|Dirty|Touched|Confirm\w*|Deleting|Updating|Creating|Submitted|Feedback|Notice|Alert)$/;
// …but a "saved / done" setter that stores data (setSaved((prev) => ({ ...prev, [type]: file.name })), an object or a
// variable) is the page's record of what was saved (Praxis onboarding uploads)
const DATA_FLAG = /^set(Saved|Done|Sent|Submitted|Success)$/;
// an endpoint that only SENDS something (a reset link, a code, a contact message) changes nothing the page lists: the
// "done / sent" notice the handler shows is the whole update (deskhand / tandem forgot-password, resend-code, 5.3.0)
const SEND_ONLY = /\/auth\/[\w-]+|\/(forgot|reset|resend|verify|verification|magic-?link|otp|contact|support|feedback|newsletter|subscribe|unsubscribe|enquir\w*|inquir\w*)\b/i;
const DONE_FLAG = /\bset(Done|Sent|Success|Submitted|Saved|Notice|Message|Status)\s*\(/;
const refreshesState = (text) => [...text.matchAll(/\b(set[A-Z]\w*)\s*\(\s*([^)\s]?)/g)].some((m) => !FLAG_SETTER.test(m[1]) || (DATA_FLAG.test(m[1]) && /[({\[]/.test(m[2])));
const isFunc = (n) => n && /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(n.type);
const funcName = (f) => (f.id && f.id.name) || (f.parent && f.parent.type === "VariableDeclarator" && f.parent.id.type === "Identifier" ? f.parent.id.name : "");
const isComponentOrHook = (f) => /^[A-Z]|^use[A-Z]/.test(funcName(f));

export const mutationRefreshesUi = {
  meta: meta("A client-side mutation updates the UI that shows the changed data", "FM5", "stale-ui", {
    messages: {
      stale: "This {{how}} changes data but nothing in the handler updates the page afterwards (no state setter, router.refresh(), revalidate, mutate/invalidate, navigation or callback). The header / list keeps the old value until a reload: apply the response to state or refresh after it succeeds. [FM5, stale-ui]",
    },
  }),
  create(context) {
    let client = false;
    return {
      Program(node) {
        client = node.body.some((s) => s.type === "ExpressionStatement" && s.directive === "use client");
      },
      CallExpression(node) {
        if (!client) return;
        const c = node.callee;
        let how = null, url0 = "";
        if (c.type === "Identifier" && c.name === "fetch") {
          const opts = node.arguments[1];
          if (!opts || opts.type !== "ObjectExpression") return;
          const m = opts.properties.find((p) => p.type === "Property" && p.key.type === "Identifier" && p.key.name === "method");
          const v = m && m.value.type === "Literal" ? String(m.value.value) : m && m.value.type === "TemplateLiteral" && !m.value.expressions.length ? m.value.quasis[0].value.cooked : null;
          if (!v || !MUTATING.test(v)) return;
          how = `fetch(…, { method: "${v.toUpperCase()}" })`;
          const url = node.arguments[0];
          url0 = url && url.type === "Literal" ? String(url.value) : url && url.type === "TemplateLiteral" ? url.quasis.map((q) => q.value.cooked).join("…") : "";
        } else if (c.type === "MemberExpression" && c.property.type === "Identifier" && MUTATING.test(c.property.name) && c.object.type === "Identifier" && CLIENTS.test(c.object.name)) {
          how = `${c.object.name}.${c.property.name}(…)`;
        } else return;
        // the handler: the outermost function below the component / hook (callbacks inside it included)
        let scope = null, inComponent = false;
        for (let p = node.parent; p; p = p.parent) {
          if (!isFunc(p)) continue;
          if (isComponentOrHook(p)) { inComponent = true; break; }
          scope = p;
        }
        if (!scope) return; // at component level (effects are reads) or module level
        const text = context.sourceCode.getText(scope);
        // a module-level helper outside any component that returns a result (uploadToStore → { url } | { error }):
        // its caller applies it (truelogos lib/upload-client.ts)
        if (!inComponent && /\breturn\s+[^;\s]/.test(text)) return;
        if (REFRESH.test(text) || refreshesState(text)) return;
        if (SEND_ONLY.test(url0) && DONE_FLAG.test(text)) return;
        // handing the result back to the caller: `return fetch(…)` / `return res.json()` / `return await …`
        if (/\breturn\s+(await\s+)?[\w.]+\s*(\(|$)/m.test(text) && /\breturn\s+(await\s+)?(fetch|axios|api|http|client|res|response|r|data|json|result)\b/.test(text)) return;
        context.report({ node, messageId: "stale", data: { how } });
      },
    };
  },
};
