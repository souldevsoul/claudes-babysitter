// FORMS — inputs, validation, the auth lifecycle, feedback after a submit and state freshness (docs/checks-forms.md).
// Plain JavaScript (see ../checks.js). Every check returns finding objects { id, what, where, selector?, soft? }:
//   what  — what is wrong, in plain words, and how to fix it;  where — the field / form / page it is about.
//   soft  — a heuristic (the spec reports it as a warning with STRICT=0, as a failure otherwise).
//   na    — the check could not run on this page/form (reason in `what`); the spec shows it as an annotation.
// SAFETY: every check that clicks a submit button first installs sandbox(page): every non-GET request the page
// makes is answered inside the browser (page.route → fulfill) and never reaches the server. Payment and destructive
// forms are never submitted at all; their fields are only typed into.

/* ───────────────────────── in-page library ───────────────────────── */

/** Installed into the page on demand (survives nothing — call lib(page) after every navigation). */
export function pageLib() {
  if (window.__bsf) return true;
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const vis = (el) => {
    if (!el || el.nodeType !== 1) return false;
    if (window.__uiVisible) return window.__uiVisible(el);
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0 && !el.closest("[hidden], [aria-hidden=true]");
  };
  const where = (el) => (window.__uiDescribe ? window.__uiDescribe(el) : el.tagName.toLowerCase() + (el.id ? "#" + el.id : ""));
  const selector = (el) => (window.__uiSelector ? window.__uiSelector(el) : null);
  // error / success / busy wording (EN + RU — the factory's two languages)
  const ERR = /\berror|invalid|required|\bmust\b|at least|at most|too (short|long|many|few|large|small|high|low|big)|minimum|maximum|\bmin(imum)?\b\.?\s*\d|\bmax(imum)?\b\.?\s*\d|between \S+ and|please (enter|provide|fill|use|choose|select|add|type|write)|^(choose|select|pick|enter|provide|add) (a|an|one|your|the|at least)\b|enter (a|an|your|valid)|not (a )?valid|isn't valid|is not allowed|can't be|cannot be|should (be|contain|have)|failed|could ?n[o']t|unable to|went wrong|try again|whole number|greater than|less than|exceed|no more than|up to \S+ (characters|chars)|incorrect|wrong|doesn't match|do not match|different from|same as (your )?(current|old)|не удалось|ошибк|обязательн|неверн|некоррект|минимум|максимум/i;
  const OK = /thank|success|\bsent\b|\bsaved\b|received|delivered|subscribed|submitted|we('ll| will) (get back|reply|respond|be in touch|contact|email)|check your (inbox|e-?mail|mail)|\bupdated\b|confirmed|you're (in|all set)|спасибо|отправлен|сохранен|успешно/i;
  const BUSY = /^(sending|saving|submitting|loading|please wait|processing|signing in|logging in|creating|updating|redirecting)\b|…$|\.\.\.$/i;
  const labelOf = (f) => {
    let t = clean(f.getAttribute("aria-label"));
    if (!t && f.id) { const l = document.querySelector(`label[for="${CSS.escape(f.id)}"]`); if (l) t = clean(l.textContent); }
    if (!t && f.closest("label")) t = clean(f.closest("label").textContent);
    if (!t && f.getAttribute("aria-labelledby")) t = clean(f.getAttribute("aria-labelledby").split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" "));
    if (!t) {
      // a label-ish sibling right above the field (Label + Input inside one wrapper)
      const wrap = f.parentElement;
      const l = wrap && Array.from(wrap.parentElement?.children || []).concat(Array.from(wrap.children)).find((x) => x !== f && x.contains && !x.contains(f) && /^(label|span|p|div)$/i.test(x.tagName) && clean(x.textContent).length > 1 && clean(x.textContent).length < 40);
      if (l) t = clean(l.textContent);
    }
    return t || clean(f.getAttribute("placeholder")) || clean(f.getAttribute("name")) || clean(f.id);
  };
  const keyOf = (f) => clean([f.getAttribute("name"), f.id, f.getAttribute("placeholder"), f.getAttribute("aria-label"), f.getAttribute("autocomplete"), labelOf(f)].join(" ")).toLowerCase();
  const NOT_NUMERIC = /otp|one[- ]?time|verification code|\bcode\b|2fa|pin\b|zip|postal|post ?code|search|cvc|cvv|security code|expir|\bexp\b|mm\s*\/\s*yy|coupon|promo|referral/;
  /** null, or { kind, integer, values } — the values Babysitter types to probe the field. */
  function numericKind(f) {
    if (f.tagName !== "INPUT" || f.disabled || f.readOnly) return null;
    const type = (f.getAttribute("type") || "text").toLowerCase();
    if (!["text", "number", "tel", ""].includes(type)) return null;
    const im = (f.getAttribute("inputmode") || "").toLowerCase();
    // the placeholder is an example, not a name ("Credits not returned" in a Subject field) — keywords come from the rest
    const k = clean([f.getAttribute("name"), f.id, f.getAttribute("aria-label"), f.getAttribute("autocomplete"), labelOf(f) === clean(f.getAttribute("placeholder")) ? "" : labelOf(f)].join(" ")).toLowerCase();
    if (NOT_NUMERIC.test(k)) return null;
    if (type !== "number" && !im && type !== "tel" && /subject|message|title|description|comment|note|reason|e-?mail|\bname\b|address|company|city/.test(k)) return null;
    let kind = null;
    if (/\biban\b/.test(k)) kind = "iban";
    else if (/card ?number|cc-number|credit card/.test(k)) kind = "card";
    else if (type === "tel" || /phone|mobile|\btel\b|whatsapp/.test(k)) kind = "phone";
    else if (/credits?\b/.test(k)) kind = "credits";
    else if (/qty|quantity|seats|units|how many|number of/.test(k)) kind = "quantity";
    else if (/price|cost|budget|rate\b/.test(k)) kind = "price";
    else if (/amount|top[- ]?up|deposit|withdraw|payout|sum\b|\btip\b|donat/.test(k)) kind = "amount";
    else if (type === "number" || im === "numeric" || im === "decimal") kind = "number";
    if (!kind) return null;
    const step = f.getAttribute("step");
    const integer = ["credits", "quantity"].includes(kind) ? !(step && Number(step) < 1) : (type === "number" ? !step || (step !== "any" && Number(step) >= 1) : im === "numeric") && kind !== "amount" && kind !== "price";
    const values = ["phone"].includes(kind) ? ["abc", "1".repeat(25)]
      : ["iban", "card"].includes(kind) ? ["abc", "1".repeat(40)]
        : ["-1", "999999999", "abc", ...(integer ? ["1.5"] : [])];
    return { kind, integer, values };
  }
  function roleOf(f) {
    const tag = f.tagName.toLowerCase(), type = (f.getAttribute("type") || "text").toLowerCase(), k = keyOf(f);
    if (tag === "textarea") return /subject|title/.test(k) ? "subject" : "message";
    if (tag === "select") return "select";
    if (["checkbox", "radio", "file", "date", "datetime-local", "time", "month", "week", "range", "color"].includes(type)) return type;
    if (type === "password") return "password";
    if (type === "email" || /e-?mail/.test(k)) return "email";
    if (type === "search" || /search|find|filter/.test(k)) return "search";
    if (type === "url" || /website|\burl\b|link/.test(k)) return "url";
    if (/otp|one[- ]?time|verification code|\bcode\b/.test(k)) return "otp";
    const n = numericKind(f);
    if (n) return n.kind === "phone" ? "phone" : "number";
    if (/subject|topic|title/.test(k)) return "subject";
    if (/message|comment|question|feedback|details|describe|your note|how can we help/.test(k)) return "message";
    if (/company|organi[sz]ation|business/.test(k)) return "company";
    if (/(first|last|full|display|user|nick|your)[ -_]?name|^name\b|\bname$|\bname\b/.test(k)) return "name";
    return "text";
  }
  const FIELD_SEL = "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]), textarea, select";
  const fieldsOf = (form) => Array.from(form.querySelectorAll(FIELD_SEL)).filter((f) => vis(f) || (["checkbox", "radio"].includes(f.type) && vis(f.parentElement || f)));
  const isStepper = (b) => /^[+\-−–]$/.test(clean(b.textContent)) || /increase|decrease|increment|decrement|plus|minus/i.test(b.getAttribute("aria-label") || "");
  function submitOf(form) {
    if (form.getAttribute("data-bsf-form") === "pseudo") return Array.from(form.querySelectorAll("button, [role=button]")).find((b) => vis(b) && !isStepper(b) && ACTION.test(clean(b.textContent)) && !/show|hide|eye|toggle/i.test(b.getAttribute("aria-label") || "")) || null;
    const own = Array.from(form.querySelectorAll('button[type=submit], input[type=submit], button:not([type])')).filter((b) => vis(b) && !isStepper(b) && !/show|hide|password|eye|toggle/i.test([b.getAttribute("aria-label"), b.className].join(" ")) || false);
    const ext = form.id ? Array.from(document.querySelectorAll(`[form="${CSS.escape(form.id)}"]`)).filter(vis) : [];
    const all = [...own, ...ext];
    return all.find((b) => b.type === "submit" || b.getAttribute("type") === "submit") || all[all.length - 1] || null;
  }
  const PAY = /\bpay\b|payment|checkout|top[- ]?up|add (credits|funds|money)|buy\b|purchase|card number|\bcvc\b|\bcvv\b|billing|withdraw|deposit|payout|transfer|\biban\b|оплат|пополн/i;
  const DESTRUCT = /\bdelete\b|\bremove\b|deactivate|close (my |your )?account|cancel (my |your |the )?(subscription|plan|order|booking|project)|unsubscribe|revoke|erase|удалить/i;
  function kindOf(form) {
    const fields = fieldsOf(form);
    const roles = fields.map(roleOf);
    const text = clean(form.innerText);
    const btn = submitOf(form);
    const btnText = btn ? clean(btn.textContent || btn.value) : "";
    const pw = roles.filter((r) => r === "password").length;
    const method = (form.getAttribute("method") || "").toLowerCase();
    const k = fields.map(keyOf).join(" ");
    const payment = PAY.test(btnText) || fields.some((f) => { const n = numericKind(f); return n && ["amount", "credits", "price", "iban", "card"].includes(n.kind); }) || !!form.querySelector("iframe[src*=stripe], iframe[name*=stripe i], [class*=StripeElement]") || /card number|\bcvc\b/i.test(text);
    const destructive = DESTRUCT.test(btnText);
    const search = form.getAttribute("role") === "search" || !!form.closest("[role=search]") || (method === "get" && !pw) || (fields.length && roles.every((r) => ["search", "select", "checkbox", "radio"].includes(r)));
    let kind = "other";
    // "current / old password" read from the password fields themselves ("18 or older" in a consent line is not it)
    const pwKeys = fields.filter((f, i) => roles[i] === "password").map(keyOf).join(" | ");
    if (pw >= 2 && /\b(current|old|existing|present)\b/.test(pwKeys)) kind = "password-change";
    else if (pw >= 1 && (/new password|reset|set (a )?password|choose (a )?password/i.test(text) && !roles.includes("email"))) kind = "password-reset";
    else if (pw >= 2 || (pw === 1 && roles.includes("name")) || (pw === 1 && /sign ?up|register|create (an |your )?account|get started|join/i.test(btnText))) kind = "signup";
    else if (pw === 1) kind = "signin";
    // passwordless (magic link / code): told apart by the button and the page
    else if (roles.includes("email") && /sign ?in|log ?in|magic link|continue with e-?mail|send (me )?(a )?(login|sign-?in) (link|code)|войти/i.test(btnText) || (/^\/(login|log-in|signin|sign-in)(\/|$)/i.test(location.pathname) && roles.includes("email") && !roles.includes("message"))) kind = "signin";
    else if (roles.includes("email") && /sign ?up|register|create (an |your |my )?account|регистр/i.test(btnText) || (/^\/(register|signup|sign-up)(\/|$)/i.test(location.pathname) && roles.includes("email") && !roles.includes("message"))) kind = "signup";
    else if (roles.length && roles.every((r) => r === "email" || r === "checkbox")) kind = /reset|forgot|recover|send (me )?(a )?(reset |magic )?link/i.test(text) ? "forgot" : "newsletter";
    else if (roles.includes("message") || roles.includes("subject")) kind = "contact";
    else if (roles.includes("name") && /setting|profile|account/i.test(location.pathname + " " + text)) kind = "profile";
    else if (roles.includes("name") && roles.includes("email")) kind = "contact";
    return { kind, payment, destructive, search, pw, roles, button: btnText, method };
  }
  /** Visible forms (form, [role=form]) with their fields, each tagged data-bsf="<form>-<field>" for the Node side. */
  const ACTION = /save|send|submit|update|continue|apply|create|add|request|subscribe|sign ?(in|up)|log ?in|register|join|confirm|change|reset|book|order|buy|pay|top ?up|get|start|сохран|отправ/i;
  /** Fields that live outside any <form>: grouped by the nearest box that also holds an action button (a settings card with "Save"). */
  function pseudoForms() {
    const boxes = new Set();
    for (const f of Array.from(document.querySelectorAll(FIELD_SEL)).filter((x) => vis(x) && !x.closest("form, [role=form], [data-bsf-form]"))) {
      let box = f.parentElement;
      for (let d = 0; d < 6 && box && box !== document.body; d++, box = box.parentElement) {
        const btn = Array.from(box.querySelectorAll("button, [role=button]")).find((b) => vis(b) && !isStepper(b) && ACTION.test(clean(b.textContent)) && !/show|hide|eye|toggle/i.test(b.getAttribute("aria-label") || ""));
        if (btn) { if (!box.closest("header, nav, [role=search]")) boxes.add(box); break; }
      }
    }
    // the innermost boxes only
    return [...boxes].filter((b) => ![...boxes].some((o) => o !== b && b.contains(o)));
  }
  function describe() {
    document.querySelectorAll("[data-bsf-form=pseudo]").forEach((e) => e.removeAttribute("data-bsf-form"));
    const real = Array.from(document.querySelectorAll("form, [role=form]")).filter((f) => vis(f) && !f.parentElement?.closest("form, [role=form]"));
    const forms = [...real, ...pseudoForms()];
    forms.forEach((f) => f.setAttribute("data-bsf-form", f.tagName === "FORM" || f.getAttribute("role") === "form" ? "form" : "pseudo"));
    return forms.map((form, i) => {
      form.setAttribute("data-bsf", String(i));
      const k = kindOf(form);
      const btn = submitOf(form);
      if (btn) btn.setAttribute("data-bsf-submit", String(i));
      const fields = fieldsOf(form).map((f, j) => {
        f.setAttribute("data-bsf", `${i}-${j}`);
        return { id: `${i}-${j}`, role: roleOf(f), label: labelOf(f).slice(0, 60), type: (f.getAttribute("type") || f.tagName).toLowerCase(), numeric: numericKind(f), required: f.required || f.getAttribute("aria-required") === "true", readOnly: f.readOnly || f.disabled, value: f.type === "checkbox" || f.type === "radio" ? String(f.checked) : f.value, where: where(f), selector: selector(f) };
      });
      return { index: i, ...k, fields, hasSubmit: !!btn, submitDisabled: !!btn && (btn.disabled || btn.getAttribute("aria-disabled") === "true"), where: where(form), selector: selector(form), heading: clean((form.querySelector("h1,h2,h3,legend") || form.closest("section, [role=dialog], main")?.querySelector("h1,h2,h3") || {}).textContent).slice(0, 60) };
    });
  }
  /** Numeric / amount fields that are not inside a form (pricing calculators, top-up widgets). */
  function looseNumeric() {
    return Array.from(document.querySelectorAll("input")).filter((f) => vis(f) && !f.closest("form, [role=form], [data-bsf-form]") && numericKind(f)).map((f, j) => {
      f.setAttribute("data-bsf", `x-${j}`);
      // the action this field feeds: the nearest real button around it (not a +/- stepper)
      let box = f.parentElement, btn = null;
      for (let d = 0; d < 6 && box && !btn; d++, box = box.parentElement) btn = Array.from(box.querySelectorAll("button, a[href], [role=button]")).find((b) => vis(b) && !isStepper(b) && clean(b.textContent).length > 2) || null;
      if (btn) btn.setAttribute("data-bsf-submit", `x-${j}`);
      const ctx = clean((box || document.body).innerText).slice(0, 400);
      return { id: `x-${j}`, role: "number", label: labelOf(f).slice(0, 60), type: (f.getAttribute("type") || "text").toLowerCase(), numeric: numericKind(f), where: where(f), selector: selector(f), payment: true, context: ctx, button: btn ? clean(btn.textContent).slice(0, 40) : "" };
    });
  }
  const lines = () => new Set((document.body.innerText || "").split("\n").map(clean).filter((l) => l.length > 1));
  function mark() { window.__bsBefore = lines(); window.__bsUrl = location.href; return true; }
  /** Lines of text that appeared since mark() (busy "Sending…" lines left out). */
  function fresh() {
    const before = window.__bsBefore || new Set();
    return [...lines()].filter((l) => !before.has(l) && !BUSY.test(l)).slice(0, 40);
  }
  /** After an action: errors that appeared, inline (next to the field / inside its form) or elsewhere (toast). */
  function errorsFor(fieldId) {
    const f = document.querySelector(`[data-bsf="${fieldId}"]`);
    const region = f && (f.closest("form, [role=form], [data-bsf-form]") || (() => { let b = f.parentElement; for (let d = 0; d < 4 && b?.parentElement; d++) b = b.parentElement; return b; })());
    // the allowed range printed next to the field all along ("Min $5 · Max $10,000") explains a blocked value
    let near = f && f.parentElement; for (let d = 0; d < 2 && near?.parentElement; d++) near = near.parentElement;
    const hint = !!near && /(min(imum)?|max(imum)?|up to|from|between|limit|range)\D{0,25}\d/i.test(near.innerText || "");
    const out = { hint, inline: [], elsewhere: [], invalid: !!f && f.getAttribute("aria-invalid") === "true", native: !!f && f.validity && !f.validity.valid, value: f ? f.value : null };
    for (const line of fresh()) {
      if (!ERR.test(line)) continue;
      const els = Array.from(document.querySelectorAll("body *")).filter((e) => vis(e) && clean(e.innerText) === line);
      const el = els[els.length - 1];
      const near = el && f && (region?.contains(el) || (() => { const a = el.getBoundingClientRect(), b = f.getBoundingClientRect(); return Math.abs(a.top - b.bottom) < 140 && a.left < b.right && a.right > b.left; })());
      (near ? out.inline : out.elsewhere).push(line.slice(0, 120));
    }
    return out;
  }
  /** What the page says after a submit: new text, split into error / success / other; url change; form gone. */
  function outcome(formIndex) {
    const form = document.querySelector(`[data-bsf="${formIndex}"]`);
    const news = fresh();
    const alerts = Array.from(document.querySelectorAll("[role=alert], [role=status], [aria-live], [data-sonner-toast], [class*=toast i]")).filter(vis).map((e) => clean(e.innerText)).filter(Boolean);
    const all = [...new Set([...news, ...alerts.filter((a) => !(window.__bsBefore || new Set()).has(a))])];
    const invalid = form ? Array.from(form.querySelectorAll("[aria-invalid=true]")).filter(vis).length : 0;
    return {
      lines: all.slice(0, 12),
      errors: all.filter((l) => ERR.test(l)).slice(0, 6),
      success: all.filter((l) => OK.test(l) && !ERR.test(l)).slice(0, 6),
      invalid,
      urlChanged: location.href.split("#")[0] !== (window.__bsUrl || "").split("#")[0],
      formGone: !form || !vis(form),
      nativeInvalid: !!form && form.tagName === "FORM" && !form.checkValidity(),
    };
  }
  window.__bsf = { clean, vis, where, selector, labelOf, keyOf, numericKind, roleOf, fieldsOf, submitOf, kindOf, describe, looseNumeric, mark, fresh, errorsFor, outcome, ERR, OK, BUSY, PAY, DESTRUCT };
  return true;
}

export const lib = (page) => page.evaluate(pageLib).catch(() => false);

/* ───────────────────────── network sandbox ───────────────────────── */

const TRACKING = /googletagmanager|google-analytics|analytics\.google|plausible|segment\.(io|com)|hotjar|facebook\.(net|com)\/tr|clarity\.ms|posthog|mixpanel|amplitude|vercel-insights|va\.vercel-scripts|\/_vercel\/(insights|speed-insights)|sentry|ingest\.|datadoghq|newrelic|intercom|crisp\.chat|\/(g\/)?collect\b|\/v1\/(batch|track|identify|page|rgstr|initialize)\b|\/beacon\b|\/rum\b|statsig|growthbook|launchdarkly|cloudflareinsights|stripe\.com\/b\/|m\.stripe\.(com|network)|r\.stripe\.com/i;

/**
 * Answer every non-GET request of the page inside the browser. mode: "ok" (200, the request's JSON echoed back),
 * a status number (that status, JSON error body) — switch with setMode(). Nothing mutating reaches the server.
 * GETs fall through (route.fallback) so pages and data load normally.
 */
export async function sandbox(page, mode = "ok") {
  const state = { mode, log: [], since: 0 };
  const handler = async (route) => {
    const req = route.request();
    const m = req.method();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.fallback();
    const url = req.url();
    const h = req.headers();
    const e = { url, method: m, at: Date.now(), action: !!(h["next-action"]), nav: req.isNavigationRequest(), tracking: TRACKING.test(url), body: (req.postData() || "").slice(0, 4000) };
    state.log.push(e);
    if (e.tracking) return route.fulfill({ status: 204, body: "" }).catch(() => {});
    if (state.mode === "ok") {
      if (e.nav) return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Received</title><main><h1>Received</h1><p>Babysitter sandbox: the request was answered in the browser.</p></main>" }).catch(() => {});
      let echo = {};
      try { const j = JSON.parse(e.body); if (j && typeof j === "object" && !Array.isArray(j)) echo = j; } catch { }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...echo, ok: true, success: true, data: echo, user: echo }) }).catch(() => {});
    }
    const status = typeof state.mode === "number" ? state.mode : 500;
    return route.fulfill({ status, contentType: e.nav ? "text/html" : "application/json", body: e.nav ? "<!doctype html><title>Error</title><h1>Server error</h1>" : JSON.stringify({ error: "Request failed", message: "Request failed" }) }).catch(() => {});
  };
  await page.route("**/*", handler);
  return {
    state,
    setMode(m) { state.mode = m; },
    mark() { state.since = state.log.length; },
    /** submissions since mark(): non-GET, not analytics */
    sent() { return state.log.slice(state.since).filter((x) => !x.tracking); },
    async stop() { await page.unroute("**/*", handler).catch(() => {}); },
  };
}

/* ───────────────────────── node-side helpers ───────────────────────── */

const SAMPLE = {
  email: "qa.babysitter@example.com", password: "Babysitter-Test-12345!", phone: "+14155550123", url: "https://example.com",
  name: "Alex Morgan", subject: "Question about my account", company: "Example Ltd", text: "Example text",
  message: "Hello, I would like to know more about how your service works for my team. Thank you!",
};
const sampleNumber = async (loc) => loc.evaluate((f) => { const min = Number(f.getAttribute("min")); const max = Number(f.getAttribute("max")); if (Number.isFinite(min) && f.getAttribute("min") !== null && min > 0) return String(min); if (Number.isFinite(max) && f.getAttribute("max") !== null && max < 1) return String(max); return f.value && Number(f.value) > 0 ? f.value : "1"; }, null, { timeout: 2000 }).catch(() => "1");

async function settle(page, ms = 700) {
  await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(ms);
}
/** Reload the page and re-tag its forms. Returns the fresh description. */
export async function reopen(page, url) {
  await page.goto(url || page.url(), { waitUntil: "load", timeout: 45_000 }).catch(() => {});
  await settle(page);
  await lib(page);
  return page.evaluate(() => window.__bsf.describe()).catch(() => []);
}
export async function describeForms(page) {
  await lib(page);
  return page.evaluate(() => window.__bsf.describe()).catch(() => []);
}

/** Fill every field of a form with a plausible value. Returns { fieldId: value } of what was entered. */
export async function fillForm(page, form, overrides = {}) {
  const entered = {};
  for (const f of form.fields) {
    if (f.readOnly) continue;
    const loc = page.locator(`[data-bsf="${f.id}"]`).first();
    try {
      if (f.role === "checkbox") {
        const zone = await loc.evaluate((el) => (el.closest("label") || el.parentElement)?.textContent || "", null, { timeout: 2000 }).catch(() => "");
        if (f.required || /terms|privacy|agree|accept|consent|соглас/i.test(zone)) { await loc.check({ force: true, timeout: 2000 }).catch(() => {}); }
        continue;
      }
      if (f.role === "radio") {
        // one choice per group: the first option of a group that has none picked
        await loc.evaluate((r) => { const g = r.name ? Array.from(document.getElementsByName(r.name)) : [r]; if (!g.some((x) => x.checked) && g[0] === r) r.click(); }, null, { timeout: 2000 }).catch(() => {});
        continue;
      }
      if (["file", "range", "color", "date", "datetime-local", "time", "month", "week", "search"].includes(f.role)) continue;
      if (f.role === "select") { await loc.evaluate((s) => { if (s.options.length > 1 && !s.value) { s.selectedIndex = 1; s.dispatchEvent(new Event("change", { bubbles: true })); } }, null, { timeout: 2000 }).catch(() => {}); continue; }
      let v = overrides[f.id] ?? overrides[f.role];
      if (v === undefined) {
        if (f.role === "number") v = await sampleNumber(loc);
        else if (f.role === "otp") continue;
        else v = SAMPLE[f.role] ?? SAMPLE.text;
      }
      if (f.value && overrides[f.id] === undefined && overrides[f.role] === undefined && f.role !== "password") { entered[f.id] = f.value; continue; } // prefilled (profile): keep it
      await loc.fill(String(v), { timeout: 3000 });
      entered[f.id] = await loc.inputValue({ timeout: 2000 }).catch(() => String(v));
    } catch { /* a field we cannot type into is left as it is */ }
  }
  // custom dropdowns (Radix / headless Select: a button role=combobox and a listbox of role=option) still on their placeholder
  const combos = page.locator(`[data-bsf="${form.index}"] [role=combobox]:not(input)`);
  for (let i = 0; i < Math.min(await combos.count().catch(() => 0), 6); i++) {
    const cb = combos.nth(i);
    if (!(await cb.isVisible().catch(() => false))) continue;
    const txt = (await cb.innerText({ timeout: 2000 }).catch(() => "")).trim();
    if (txt && !/^(pick|select|choose|—|-|выбер)/i.test(txt) && !(await cb.getAttribute("data-placeholder", { timeout: 1000 }).catch(() => null))) continue;
    await cb.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(250);
    const opt = page.locator("[role=option]:not([aria-disabled=true]):not([data-disabled])").filter({ visible: true }).first();
    if (await opt.count()) await opt.click({ timeout: 2000 }).catch(() => {}); else await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(150);
  }
  // Radix / headless consent boxes (button role=checkbox) next to Terms
  await page.locator(`[data-bsf="${form.index}"] [role=checkbox][aria-checked=false]`).evaluateAll((bs) => bs.filter((b) => /terms|privacy|agree|accept|consent/i.test((b.closest("label") || b.parentElement)?.textContent || "")).forEach((b) => b.click())).catch(() => {});
  return entered;
}

async function clickSubmit(page, key) {
  const btn = page.locator(`[data-bsf-submit="${key}"]`).first();
  if (await btn.isVisible().catch(() => false)) {
    if (await btn.isDisabled().catch(() => false)) return "disabled";
    await btn.click({ timeout: 3000 }).catch(() => btn.click({ force: true, timeout: 2000 }).catch(() => {}));
    return "clicked";
  }
  const last = page.locator(`[data-bsf^="${key}-"]`).last();
  await last.press("Enter", { timeout: 3000 }).catch(() => {});
  return "enter";
}

/** Wait until the page sent a submission or `ms` passed. */
async function waitSent(page, sb, ms = 2500) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (sb.sent().length) break; await page.waitForTimeout(100); }
  return sb.sent();
}

const skipForm = (f) => f.search || !f.hasSubmit || !f.fields.some((x) => !x.readOnly && !["checkbox", "radio", "select"].includes(x.role));
const formName = (f) => `${f.heading ? `"${f.heading}" ` : ""}form (${f.kind}, button "${f.button || "submit"}")`;

/* ───────────────────────── FM1 numeric / amount bounds ───────────────────────── */

/**
 * FM1 — every number / amount / quantity / credits / phone / IBAN field refuses -1, 999999999, "abc" and (where
 * whole numbers are expected) 1.5: it clamps or rejects the value, or shows a message next to the field and blocks
 * the submit. Fields in payment / top-up widgets and in destructive forms are only typed into, never submitted;
 * other forms are submitted inside the sandbox.
 */
export async function numericBounds(page, { maxFields = 8 } = {}) {
  const out = [];
  const url = page.url();
  let forms = await describeForms(page);
  const loose = await page.evaluate(() => window.__bsf.looseNumeric()).catch(() => []);
  const targets = [];
  for (const f of forms) if (!f.search) for (const x of f.fields) if (x.numeric && !x.readOnly) targets.push({ form: f, field: x, typeOnly: f.payment || f.destructive || !f.hasSubmit });
  for (const x of loose) targets.push({ form: null, field: x, typeOnly: true });
  // typed-only fields first: a submitted field reloads the page, which drops the tags of the others
  targets.sort((a, b) => Number(b.typeOnly) - Number(a.typeOnly));
  if (!targets.length) return out;
  const sb = await sandbox(page, "ok");
  try {
    for (const t of targets.slice(0, maxFields)) {
      const bad = [], quiet = [];
      // the clean state: errors are what appears after it (a message left standing by the previous value still counts)
      if (t.typeOnly) await page.evaluate(() => window.__bsf.mark());
      for (const v of t.field.numeric.values) {
        if (!t.typeOnly) { forms = await reopen(page, url); const f = forms[t.form.index]; if (!f) break; await fillForm(page, f, { [t.field.id]: "1" }); await page.evaluate(() => window.__bsf.mark()); }
        const loc = page.locator(`[data-bsf="${t.field.id}"]`).first();
        if (!(await loc.isVisible().catch(() => false))) break;
        // every locator call has its own timeout: inside the test runner the default action timeout is "none", so a
        // field that cannot be edited or a submit button that does not exist waited out the whole test (Praxis /pricing)
        await loc.fill("", { timeout: 3000 }).catch(() => {});
        await loc.pressSequentially(v, { delay: 5, timeout: 8000 }).catch(() => {});
        await loc.press("Tab", { timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(350);
        const typed = await loc.inputValue({ timeout: 2000 }).catch(() => "");
        const changed = typed.replace(/[\s,]/g, "") !== v;
        const btnKey = t.form ? String(t.form.index) : t.field.id;
        const err0 = await page.evaluate((id) => window.__bsf.errorsFor(id), t.field.id).catch(() => ({ inline: [], elsewhere: [], invalid: false, native: false }));
        const btnOff = await page.locator(`[data-bsf-submit="${btnKey}"]`).first().evaluate((b) => b.disabled || b.getAttribute("aria-disabled") === "true", null, { timeout: 1000 }).catch(() => false);
        if (changed || err0.inline.length || err0.invalid) continue; // clamped / rejected / explained
        if (t.typeOnly) {
          if (err0.native || btnOff) { if (!err0.hint) quiet.push(v); } // blocked; quiet unless the range is printed next to it
          else bad.push(v);
          continue;
        }
        sb.mark();
        const how = await clickSubmit(page, btnKey);
        const sent = how === "disabled" ? [] : await waitSent(page, sb, 2500);
        await page.waitForTimeout(400);
        const err = await page.evaluate((id) => window.__bsf.errorsFor(id), t.field.id).catch(() => ({ inline: [], elsewhere: [], native: false }));
        if (sent.length) bad.push(v);
        else if (!err.inline.length && !err.native && !err.invalid && !err.hint) quiet.push(v);
      }
      const name = `"${t.field.label || t.field.kind}" (${t.field.numeric.kind})`;
      const place = t.form ? `${formName(t.form)} → ${t.field.where}` : `${t.field.where}${t.field.button ? ` (next to "${t.field.button}")` : ""}`;
      if (bad.length) out.push({ id: "FM1", what: `${name} accepts ${bad.map((v) => JSON.stringify(v)).join(", ")}${t.typeOnly ? " without a word" : " and sends it"} — give it bounds (min/max, a whole-number step, a length/pattern) and clamp or show the allowed range under the field [FM1, numeric-input-validation]`, where: place, selector: t.field.selector });
      else if (quiet.length) out.push({ id: "FM1", soft: true, what: `${name}: ${quiet.map((v) => JSON.stringify(v)).join(", ")} is blocked, but nothing next to the field says why — show the allowed range / the reason under the field [FM1]`, where: place, selector: t.field.selector });
    }
    // the allowed range is printed next to an amount field that has one (voicecraft, playfix)
    const ranges = await page.evaluate(() => Array.from(document.querySelectorAll("[data-bsf]")).filter((f) => f.tagName === "INPUT" && f.type !== "range" && window.__bsf.vis(f) && f.getAttribute("min") !== null && f.getAttribute("max") !== null && /amount|credits?|top|deposit|price/i.test(window.__bsf.keyOf(f))).map((f) => {
      let box = f.parentElement; for (let d = 0; d < 3 && box?.parentElement; d++) box = box.parentElement;
      const txt = (box?.innerText || "").replace(/[\s,  ]/g, "");
      const shown = (n) => txt.includes(String(Number(n))) || txt.includes(Number(n).toLocaleString("en-US").replace(/,/g, ""));
      return shown(f.getAttribute("min")) && shown(f.getAttribute("max")) ? null : { where: window.__bsf.where(f), selector: window.__bsf.selector(f), min: f.getAttribute("min"), max: f.getAttribute("max"), label: window.__bsf.labelOf(f) };
    }).filter(Boolean)).catch(() => []);
    for (const r of ranges) out.push({ id: "FM1", soft: true, what: `"${r.label}" allows ${r.min}–${r.max}, but the range is not written next to it — print "from ${r.min} to ${r.max}" under the field [FM1, voicecraft]`, where: r.where, selector: r.selector });
  } finally { await sb.stop(); }
  return out;
}

/* ───────────────────────── FM2 gibberish ───────────────────────── */

/**
 * FM2 — contact / feedback / profile forms reject one-letter names, a two-letter subject and a four-letter
 * message. Submitted inside the sandbox (nothing is sent). A form that sends the gibberish has no client check;
 * whether the server checks cannot be known without sending, so the finding is soft and says so.
 */
export async function gibberish(page) {
  const out = [];
  const url = page.url();
  const forms = (await describeForms(page)).filter((f) => ["contact", "profile"].includes(f.kind) && !skipForm(f) && !f.payment && !f.destructive);
  if (!forms.length) return out;
  const sb = await sandbox(page, "ok");
  try {
    for (const f0 of forms) {
      const f = (await reopen(page, url))[f0.index];
      if (!f) continue;
      const over = {};
      for (const x of f.fields) { if (x.role === "name") over[x.id] = "q"; if (x.role === "subject") over[x.id] = "qq"; if (x.role === "message") over[x.id] = "asdf"; if (x.role === "company") over[x.id] = "q"; }
      if (!Object.keys(over).length) continue;
      await fillForm(page, f, over);
      await page.evaluate(() => window.__bsf.mark());
      sb.mark();
      const how = await clickSubmit(page, String(f.index));
      const sent = how === "disabled" ? [] : await waitSent(page, sb, 2500);
      await page.waitForTimeout(500);
      const o = await page.evaluate((i) => window.__bsf.outcome(i), f.index).catch(() => ({ errors: [], invalid: 0, nativeInvalid: false, success: [] }));
      const fields = f.fields.filter((x) => over[x.id]).map((x) => `${x.label || x.role} "${over[x.id]}"`).join(", ");
      if (sent.length && !o.errors.length && !o.invalid) out.push({ id: "FM2", soft: true, what: `${formName(f)} sends ${fields} — no check in the browser (the server's answer is not known: Babysitter answers it in a sandbox). Require real text: name ≥ 2 letters, subject ≥ 3, message ≥ 10 characters, with the message under the field [FM2, form-validation]`, where: f.where, selector: f.selector, server: sent[0].action ? "server action" : new URL(sent[0].url).pathname });
      else if (!sent.length && !o.errors.length && !o.invalid && !o.nativeInvalid && how !== "disabled") out.push({ id: "FM2", soft: true, what: `${formName(f)}: with ${fields} the submit does nothing and says nothing — show what is wrong under each field [FM2]`, where: f.where, selector: f.selector });
    }
  } finally { await sb.stop(); }
  return out;
}

/* ───────────────────────── FM3 / FM4 submit outcomes ───────────────────────── */

/**
 * FM3 — a failed submit (the sandbox answers 500) keeps every value the user typed and shows an error;
 *        a failed sign-in clears the password and keeps the email (soft).
 * FM4 — a failed submit never shows a success message; a successful one (sandbox 200) shows a visible status
 *        within 2 s (toast, inline message, aria-live, a new page). Sign-in/up and Server-Action forms are not
 *        faked as successful: their real answer cannot be imitated.
 */
export async function submitOutcomes(page, { failStatus = 500 } = {}) {
  const out = [], na = [];
  const url = page.url();
  const forms = (await describeForms(page)).filter((f) => !skipForm(f) && !f.payment && !f.destructive);
  if (!forms.length) return out;
  const sb = await sandbox(page, failStatus);
  try {
    for (const f0 of forms) {
      // ── failure
      sb.setMode(failStatus);
      let f = (await reopen(page, url))[f0.index];
      if (!f) continue;
      const entered = await fillForm(page, f);
      await page.evaluate(() => window.__bsf.mark());
      sb.mark();
      const how = await clickSubmit(page, String(f.index));
      const sent = how === "disabled" ? [] : await waitSent(page, sb, 3000);
      if (!sent.length) { na.push({ id: "FM3", na: true, what: `${formName(f)} sent nothing with sample values (${how === "disabled" ? "button stays disabled" : "client validation or a captcha stopped it"}) — not checked`, where: f.where }); continue; }
      const action = sent.some((x) => x.action), nav = sent.some((x) => x.nav);
      await page.waitForTimeout(2000);
      if (!nav) {
        const o = await page.evaluate((i) => window.__bsf.outcome(i), f.index).catch(() => null);
        const now = await page.evaluate((ids) => Object.fromEntries(ids.map((id) => { const el = document.querySelector(`[data-bsf="${id}"]`); return [id, el ? el.value : null]; })), Object.keys(entered)).catch(() => ({}));
        const lost = f.fields.filter((x) => entered[x.id] !== undefined && x.role !== "password" && now[x.id] !== entered[x.id]);
        if (lost.length) out.push({ id: "FM3", what: `${formName(f)}: after a failed submit ${lost.map((x) => `"${x.label || x.role}"`).join(", ")} ${lost.length > 1 ? "are" : "is"} emptied — keep what the user typed when the request fails${action ? " (Server Action: return the error as data instead of throwing, keep the form mounted)" : ""} [FM3, form-reset-on-error]`, where: f.where, selector: f.selector });
        if (o && o.success.length) out.push({ id: "FM4", what: `${formName(f)} shows "${o.success[0]}" although the request failed (${failStatus}) — show success only after the server confirms [FM4, submit-feedback]`, where: f.where, selector: f.selector });
        else if (o && !o.errors.length && !o.invalid && !o.lines.length) out.push({ id: "FM3", what: `${formName(f)}: the request failed (${failStatus}) and the page says nothing — show an error next to the form and keep the values [FM3/FM4, submit-feedback]`, where: f.where, selector: f.selector });
        if (f.kind === "signin") {
          const pw = f.fields.find((x) => x.role === "password");
          if (pw && now[pw.id]) out.push({ id: "FM3", soft: true, what: `${formName(f)}: after a failed sign-in the password is still filled — clear the password, keep the email [FM3, playfix/orbit/praxis]`, where: pw.where, selector: pw.selector });
        }
      }
      // ── success (only where a reply can be imitated)
      if (action || nav || ["signin", "signup", "password-reset"].includes(f.kind)) { na.push({ id: "FM4", na: true, what: `${formName(f)}: success not imitated (${action ? "Server Action" : nav ? "full-page post" : "sign-in/up"}) — check its confirmation by hand`, where: f.where }); continue; }
      sb.setMode("ok");
      f = (await reopen(page, url))[f0.index];
      if (!f) continue;
      await fillForm(page, f);
      await page.evaluate(() => window.__bsf.mark());
      sb.mark();
      await clickSubmit(page, String(f.index));
      if (!(await waitSent(page, sb, 3000)).length) continue;
      let seen = null;
      for (let t = 0; t < 20 && !seen; t++) {
        await page.waitForTimeout(100);
        const o = await page.evaluate((i) => window.__bsf.outcome(i), f.index).catch(() => null);
        if (o && (o.urlChanged || o.formGone || o.lines.length || o.invalid)) seen = o;
      }
      if (!seen) out.push({ id: "FM4", what: `${formName(f)}: after a successful submit nothing visible happens for 2 s — show a toast / inline "Sent" message (aria-live) or move to the next page [FM4, submit-feedback]`, where: f.where, selector: f.selector });
    }
  } finally { await sb.stop(); }
  return [...out, ...na];
}

/* ───────────────────────── FM5 stale UI ───────────────────────── */

/**
 * FM5 — after saving the display name (sandbox reply echoes what was sent), the header / user menu shows the new
 * name without a reload. With a sandboxed reply a refetch can only bring back the old name, so when the page
 * re-reads data (an RSC refresh or a GET to its API) the result is "na: verify by hand", not a finding.
 */
export async function staleAfterSave(page) {
  const url = page.url();
  const forms = (await describeForms(page)).filter((f) => !skipForm(f) && !f.payment && !f.destructive && ["profile", "other", "contact"].includes(f.kind));
  for (const f0 of forms) {
    const nameField = f0.fields.find((x) => x.role === "name" && !x.readOnly && x.value && x.value.length >= 2);
    if (!nameField) continue;
    const inHeader = await page.evaluate((v) => Array.from(document.querySelectorAll("header, nav, [role=banner], aside, [aria-label*=account i], [aria-label*=user i], [aria-label*=profile i]")).some((e) => window.__bsf.vis(e) && (e.innerText || "").includes(v)), nameField.value).catch(() => false);
    if (!inHeader) continue;
    const sb = await sandbox(page, "ok");
    const gets = [];
    const onReq = (r) => { if (r.method() === "GET" && (r.headers()["rsc"] || /\/api\/|_rsc=|graphql|\/trpc\//.test(r.url()))) gets.push(r.url()); };
    try {
      const f = (await reopen(page, url))[f0.index];
      if (!f) continue;
      const fresh = "Babysitter QA";
      await page.locator(`[data-bsf="${nameField.id}"]`).fill(fresh, { timeout: 3000 }).catch(() => {});
      sb.mark();
      page.on("request", onReq);
      await clickSubmit(page, String(f.index));
      if (!(await waitSent(page, sb, 3000)).length) return [{ id: "FM5", na: true, what: `${formName(f)}: changing the name sent nothing — not checked`, where: f.where }];
      await page.waitForTimeout(2500);
      const shows = await page.evaluate((v) => Array.from(document.querySelectorAll("header, nav, [role=banner], aside")).some((e) => (e.innerText || "").includes(v)), fresh).catch(() => false);
      if (shows) return [];
      if (gets.length) return [{ id: "FM5", na: true, what: `after saving, the page re-reads its data (${new URL(gets[0]).pathname}) — with a sandboxed reply the header cannot change; confirm by hand that "${nameField.label}" updates the header`, where: f.where }];
      return [{ id: "FM5", soft: true, what: `after saving "${nameField.label}" the header / user menu still shows "${nameField.value}" and nothing re-reads the data — update the session/user state or call router.refresh() after the save [FM5, stale-ui]`, where: f.where, selector: f.selector }];
    } finally { page.off("request", onReq); await sb.stop(); }
  }
  return [];
}

/* ───────────────────────── FM6 credits up front ───────────────────────── */

/**
 * FM6 — where the page shows a credit balance and an action with a price in credits, an action the balance cannot
 * pay for says so before the click: the button is disabled with the reason, or a "not enough credits / top up"
 * note sits next to it. Measured on whatever balance the signed-in user has (forms.zeroBalanceStorage for a
 * zero-balance user).
 */
export const creditsUpFront = async (page) => (await lib(page), page.evaluate(() => {
  const B = window.__bsf;
  const num = (s) => Number(String(s).replace(/[,\s  ]/g, ""));
  const text = (e) => B.clean(e.innerText || e.textContent);
  let balance = null, balanceEl = null, balanceNamed = false;
  for (const e of Array.from(document.querySelectorAll("body *")).filter((x) => x.children.length < 5 && B.vis(x))) {
    const t = text(e);
    if (t.length > 80) continue;
    const named = t.match(/(?:balance|credits? (?:left|available|remaining)|available credits|wallet)\s*[:·\-]?\s*((?<![\d.,])(?:\d{1,3}(?:[,  ]\d{3})+|\d+)(?![\d]))/i);
    // "120 credits" alone is a balance only in the header / sidebar / a balance widget — in a card it is a price
    const bare = !named && e.closest("header, nav, aside, [class*=balance i], [class*=wallet i]") && t.match(/^((?<![\d.,])(?:\d{1,3}(?:[,  ]\d{3})+|\d+)(?![\d]))\s*(?:credits?|cr)\s*(?:left|available|remaining)?$/i);
    const m = named || bare;
    if (m && (balance === null || (named && !balanceNamed))) { const n = num(m[1]); if (Number.isFinite(n)) { balance = n; balanceEl = e; balanceNamed = !!named; } }
  }
  if (balance === null) {
    // a label and its figure in separate elements ("AVAILABLE" / "3,900" / "credits"), or a header chip linking to the wallet
    for (const e of Array.from(document.querySelectorAll("body *")).filter((x) => x.children.length === 0 && B.vis(x) && /^(available( balance)?|balance|your balance|credit balance|wallet balance|credits available|current balance)$/i.test(text(x)))) {
      const m = text(e.parentElement).replace(text(e), "").match(/^\s*[:·]?\s*((?<![\d.,])(?:\d{1,3}(?:[,  ]\d{3})+|\d+)(?![\d]))/) || text(e.parentElement.parentElement || e).match(new RegExp(text(e).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[:·]?\\s*([\\d][\\d,  ]*)", "i"));
      if (m) { balance = num(m[1]); balanceEl = e.parentElement; break; }
    }
    if (balance === null) {
      const chip = Array.from(document.querySelectorAll("a[href*=wallet i], a[href*=credit i], a[href*=balance i], a[href*=billing i]")).find((x) => B.vis(x) && /^(?<![\d.,])(?:\d{1,3}(?:[,  ]\d{3})+|\d+)(?![\d])\b/.test(text(x)));
      if (chip) { balance = num(text(chip).match(/^(?<![\d.,])(?:\d{1,3}(?:[,  ]\d{3})+|\d+)(?![\d])/)[0]); balanceEl = chip; }
    }
  }
  if (balance === null) return [{ id: "FM6", na: true, what: "no credit balance on this page", where: location.pathname }];
  const out = [];
  for (const b of Array.from(document.querySelectorAll("button, [role=button], a[href]")).filter(B.vis)) {
    if (balanceEl && (balanceEl.contains(b) || b.contains(balanceEl))) continue;
    let box = b, price = null;
    for (let d = 0; d < 3 && box && price === null; d++, box = box.parentElement) {
      const m = text(box).match(/((?<![\d.,])(?:\d{1,3}(?:[,  ]\d{3})+|\d+)(?![\d]))\s*(?:credits?|cr)\b/i);
      if (m && text(box).length < 300) price = num(m[1]);
    }
    const label = text(b);
    if (price === null || !price || !/run|generate|start|create|book|buy|hire|order|submit|use|unlock|apply|send|launch|post|request|continue|confirm/i.test(label) || /top ?up|(buy|get|add|purchase)\b.*credits?|credits? (pack|plan)|pricing|upgrade|plans?\b/i.test(label)) continue;
    if (price <= balance) continue;
    const off = b.disabled || b.getAttribute("aria-disabled") === "true";
    const reason = /insufficient|not enough|top ?up|add credits|buy (more )?credits|need \d|low balance|недостаточно/i.test(text(box || b) + " " + (b.getAttribute("title") || "") + " " + (b.getAttribute("aria-describedby") ? (document.getElementById(b.getAttribute("aria-describedby"))?.textContent || "") : ""));
    if (!reason) out.push({ id: "FM6", what: `"${label.slice(0, 40)}" costs ${price} credits, the balance is ${balance}, and nothing says so before the click${off ? " (the button is disabled without a reason)" : ""} — show "Not enough credits (need ${price}, you have ${balance}) · Top up" next to it and disable the action [FM6, late-insufficient-credits-warning]`, where: B.where(b), selector: B.selector(b) });
  }
  return out;
}));

/* ───────────────────────── FM7 password lifecycle ───────────────────────── */

const FORGOT_RE = /forgot|reset (your |my )?password|trouble (signing|logging) in|can'?t (sign|log) in|recover|забыли/i;
const NOT_REAL_RE = /not (yet )?available|coming soon|not (yet )?(supported|implemented)|contact (our )?support to reset|email us to reset|пока недоступ|скоро/i;
const NEUTRAL_RE = /if (an |the )?account|if (this|that|the) (e-?mail|address)|check your (inbox|e-?mail|mail)|we('ve| have)? sent|sent (you )?(a|an|the)? ?(reset|recovery|password|magic)? ?(link|email|instructions)|instructions|link (is )?on its way|письм|ссылк/i;

/** FM7a — the sign-in page links "Forgot password?" to a real page with an email field; its submit (sandboxed) confirms neutrally. */
export async function forgotPassword(page, signInPath) {
  const out = [];
  await page.goto(signInPath, { waitUntil: "load" }).catch(() => {});
  await settle(page);
  await lib(page);
  const link = page.locator("a, button, [role=button]").filter({ hasText: FORGOT_RE }).filter({ visible: true }).first();
  const hasPassword = await page.locator("input[type=password]").filter({ visible: true }).count().catch(() => 0);
  if (!hasPassword && !(await link.count())) return [{ id: "FM7", na: true, what: `${signInPath} signs in without a password (magic link / code) — no reset needed`, where: signInPath }];
  if (!(await link.count())) return [{ id: "FM7", what: `${signInPath} has no "Forgot password?" link — add one under the password field, to a page that sends a reset link [FM7, forgot-pw]`, where: signInPath }];
  const label = (await link.innerText({ timeout: 2000 }).catch(() => "")).trim().slice(0, 40);
  const href = await link.getAttribute("href", { timeout: 1000 }).catch(() => null);
  const status = { code: 200 };
  if (href && !/^(#|javascript:)/.test(href)) {
    const res = await page.goto(new URL(href, page.url()).href, { waitUntil: "load" }).catch(() => null);
    status.code = res ? res.status() : 0;
    if (!res || res.status() >= 400) return [{ id: "FM7", what: `"${label}" goes to ${href}, which answers ${res ? res.status() : "nothing"} — build the reset page [FM7, forgot-pw]`, where: signInPath }];
  } else {
    await link.click({ timeout: 3000 }).catch(() => {});
  }
  await settle(page, 500);
  await lib(page);
  const where = new URL(page.url()).pathname;
  const body = await page.evaluate(() => document.body.innerText || "").catch(() => "");
  if (NOT_REAL_RE.test(body)) out.push({ id: "FM7", what: `the password reset at ${where} says it is not available ("${(body.match(NOT_REAL_RE) || [""])[0]}") — make the reset work: email field → reset link → new password [FM7, forgot-pw, praxis]`, where });
  const forms = await page.evaluate(() => window.__bsf.describe()).catch(() => []);
  const f = forms.find((x) => x.fields.some((y) => y.role === "email") && !x.fields.some((y) => y.role === "password"));
  if (!f) { out.push({ id: "FM7", what: `"${label}" opens ${where} with no email field to send a reset link to — the reset starts with the account's email [FM7, forgot-pw]`, where }); return out; }
  const sb = await sandbox(page, "ok");
  try {
    await fillForm(page, f);
    await page.evaluate(() => window.__bsf.mark());
    sb.mark();
    await clickSubmit(page, String(f.index));
    const sent = await waitSent(page, sb, 3000);
    let o = null;
    for (let t = 0; t < 25; t++) { await page.waitForTimeout(100); o = await page.evaluate((i) => window.__bsf.outcome(i), f.index).catch(() => null); if (o && (o.lines.length || o.urlChanged)) break; }
    const said = o ? o.lines.join(" | ") : "";
    if (sent.some((x) => x.action)) out.push({ id: "FM7", na: true, what: `the reset form at ${where} posts a Server Action — its real confirmation cannot be imitated; check the wording by hand (neutral: "If an account exists…")`, where: f.where });
    else if (!sent.length && !(o && o.lines.length)) out.push({ id: "FM7", what: `the reset form at ${where} sends nothing and says nothing — submit the email and confirm [FM7, forgot-pw]`, where: f.where, selector: f.selector });
    else if (!NEUTRAL_RE.test(said) && !(o && o.urlChanged)) out.push({ id: "FM7", soft: true, what: `after asking for a reset link the page says ${said ? `"${said.slice(0, 80)}"` : "nothing"} — confirm neutrally: "If an account exists for that email, we've sent a reset link" [FM7, forgot-pw]`, where: f.where, selector: f.selector });
    if (/no (account|user)|not found|doesn'?t exist|not registered/i.test(said)) out.push({ id: "FM7", what: `the reset form says "${said.slice(0, 60)}" — it tells strangers which emails have accounts; answer the same way for every address [FM7]`, where: f.where });
  } finally { await sb.stop(); }
  return out;
}

/** Settings often hide the change-password form behind a "Change password" button / dialog: open it (no request). */
export async function openPasswordChange(page) {
  const has = async () => (await describeForms(page)).some((f) => f.kind === "password-change");
  if (await has()) return true;
  const btn = page.locator("button, [role=button], a[href^='#']").filter({ hasText: /^\s*(change|update|set|reset) (your |my )?password/i }).filter({ visible: true }).first();
  if (!(await btn.count())) return false;
  await btn.click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(700);
  return has();
}

/** FM7b — change password (signed in) rejects the current password as the new one before sending; has a confirm field. */
export async function changePasswordSame(page) {
  const forms = (await describeForms(page)).filter((f) => f.kind === "password-change");
  if (!forms.length) return [];
  const out = [];
  const sb = await sandbox(page, "ok");
  try {
    for (const f of forms) {
      const pws = f.fields.filter((x) => x.role === "password");
      if (pws.length < 3 && !pws.some((x) => /confirm|repeat|again/i.test(x.label))) out.push({ id: "FM7", soft: true, what: `${formName(f)} has no "Confirm new password" field — ask for the new password twice [FM7, pw-change]`, where: f.where, selector: f.selector });
      const same = "Babysitter-Same-Pass-1!";
      await fillForm(page, f, { password: same });
      await page.evaluate(() => window.__bsf.mark());
      sb.mark();
      await clickSubmit(page, String(f.index));
      const sent = await waitSent(page, sb, 2500);
      await page.waitForTimeout(400);
      const o = await page.evaluate((i) => window.__bsf.outcome(i), f.index).catch(() => null);
      if (sent.length && !(o && o.errors.length)) out.push({ id: "FM7", soft: true, what: `${formName(f)} sends a new password equal to the current one — reject it in the form ("New password must be different from the current one") and on the server [FM7, pw-change]`, where: f.where, selector: f.selector });
    }
  } finally { await sb.stop(); }
  return out;
}

/**
 * FM7c — every password field has its OWN show/hide eye: searched only inside the field's wrapper (the largest
 * ancestor holding no other password field), so Password's eye never counts for Confirm password (praxis #171).
 */
export const passwordEyes = async (page) => (await lib(page), page.evaluate(() => {
  const B = window.__bsf;
  const out = [];
  const PW = 'input[type=password], input[data-bs-pw], input[autocomplete*=password i], input[name*=password i], input[id*=password i]';
  const fields = Array.from(document.querySelectorAll(PW)).filter((i) => B.vis(i) && /password|text/.test(i.type));
  for (const inp of fields) {
    let wrap = inp, eye = null;
    for (let up = inp.parentElement, d = 0; up && d < 4; up = up.parentElement, d++) {
      if (Array.from(up.querySelectorAll(PW)).filter((x) => x !== inp && B.vis(x)).length) break; // the wrapper of another field too
      wrap = up;
    }
    const pool = wrap === inp ? [inp.previousElementSibling, inp.nextElementSibling].filter(Boolean).flatMap((x) => (x.matches("button, [role=button]") ? [x] : Array.from(x.querySelectorAll("button, [role=button]")))) : Array.from(wrap.querySelectorAll("button, [role=button]"));
    eye = pool.find((b) => B.vis(b) && /show|hide|password|eye|reveal|visib|показ|скры/i.test([b.getAttribute("aria-label"), b.getAttribute("title"), b.textContent, b.className, b.querySelector("svg")?.getAttribute("class")].join(" ")) && b.getAttribute("type") !== "submit" && !/submit|sign|log ?in|continue|forgot|generate|update|save|change|reset|create|confirm/i.test(b.textContent || ""));
    if (!eye) out.push({ id: "FM7", what: `password field "${B.labelOf(inp)}" has no show/hide eye of its own — add the eye inside this field (tabindex=-1) [FM7, pw-toggle]`, where: B.where(inp), selector: B.selector(inp) });
  }
  return out;
}));

/* ───────────────────────── FM8 auth page shell ───────────────────────── */

/**
 * FM8 — sign-in / sign-up / reset pages: the logo links to "/", a "Back to home" link exists, and there is no full
 * site navigation. A footer is allowed (acceptance A6 requires one) when it is minimal: legal links, ©, contact.
 */
export const authShell = async (page) => (await lib(page), page.evaluate(() => {
  const B = window.__bsf;
  const out = [];
  const path = location.pathname;
  const links = Array.from(document.querySelectorAll("a[href]")).filter(B.vis);
  const home = (a) => { try { const u = new URL(a.href); return u.origin === location.origin && (u.pathname === "/" || u.pathname === ""); } catch { return false; } };
  const logo = links.find((a) => a.querySelector("img, svg, [class*=logo i]") && a.getBoundingClientRect().top < 200) || links.find((a) => /logo|brand/i.test(a.className + " " + (a.getAttribute("aria-label") || "")));
  const logoish = Array.from(document.querySelectorAll("img[alt*=logo i], [class*=logo i], header svg")).filter((e) => B.vis(e) && e.getBoundingClientRect().top < 200)[0];
  if (logo && !home(logo)) out.push({ id: "FM8", what: `the logo links to ${logo.getAttribute("href")} — on an auth page it links home ("/") [FM8, logo-link]`, where: B.where(logo), selector: B.selector(logo) });
  else if (!logo && logoish) out.push({ id: "FM8", what: "the logo is not a link — wrap it in a link to \"/\" [FM8, logo-link]", where: B.where(logoish), selector: B.selector(logoish) });
  const back = links.find((a) => home(a) && /back|home|главн|←/i.test(B.clean(a.textContent) + " " + (a.getAttribute("aria-label") || "")));
  if (!back) out.push({ id: "FM8", soft: true, what: 'no "← Back to home" link — add one under the logo [FM8, auth-minimal-layout]', where: path });
  const AUTH_LINK = /sign ?in|log ?in|sign ?up|register|create (an )?account|forgot|reset|back|home|terms|privacy|cookie|help|support|contact|войти|регистрац/i;
  const nav = Array.from(document.querySelectorAll("header, nav, [role=navigation], [role=banner]")).filter((e) => B.vis(e) && !e.closest("footer, [role=contentinfo]"));
  const navLinks = [...new Set(nav.flatMap((e) => Array.from(e.querySelectorAll("a[href], button")).filter(B.vis)))].filter((a) => a !== logo && !home(a) && !AUTH_LINK.test(B.clean(a.textContent) + " " + (a.getAttribute("aria-label") || "")) && B.clean(a.textContent).length > 1);
  if (navLinks.length >= 3) out.push({ id: "FM8", what: `the full site navigation is shown (${navLinks.slice(0, 5).map((a) => `"${B.clean(a.textContent).slice(0, 20)}"`).join(", ")}${navLinks.length > 5 ? " …" : ""}) — an auth page shows the logo and "Back to home" only [FM8, auth-minimal-layout]`, where: B.where(nav[0]), selector: B.selector(nav[0]) });
  const LEGAL = /terms|privacy|cookie|refund|legal|policy|disclaimer|imprint|aml|kyc|contact|support|help|status|accessibility|©|@|manage cookies|условия|конфиденц/i;
  const foot = Array.from(document.querySelectorAll("footer, [role=contentinfo]")).filter(B.vis).pop();
  if (foot) {
    const extra = Array.from(foot.querySelectorAll("a[href], button")).filter(B.vis).filter((a) => !LEGAL.test(B.clean(a.textContent) + " " + (a.getAttribute("href") || "")) && !/visa|master|payment|logo/i.test(a.innerHTML.slice(0, 300)) && !home(a));
    if (extra.length >= 4) out.push({ id: "FM8", what: `the full site footer is shown (${extra.slice(0, 4).map((a) => `"${B.clean(a.textContent).slice(0, 18)}"`).join(", ")} …) — on auth pages keep a minimal footer: legal links, ©, support email [FM8, auth-minimal-layout; A6 needs a footer, not the full one]`, where: B.where(foot), selector: B.selector(foot) });
  }
  return out;
}));

/* ───────────────────────── FM9 flash before a redirect ───────────────────────── */

/**
 * FM9 — open `path` and record what paints, frame by frame, until the URL settles. If the page ends on another
 * URL (a redirect) and, on the way, a different page with real content painted (a dashboard shell before the
 * sign-in page, a sign-in form before the dashboard), that is the flash users see.
 */
export async function redirectFlash(page, path, { settleMs = 4000 } = {}) {
  const frames = [];
  await page.exposeBinding("__bsFrame", (_s, f) => { frames.push(f); }).catch(() => {});
  await page.addInitScript(() => {
    let last = "";
    const tick = () => {
      try {
        const b = document.body;
        if (b) {
          const clone = b.innerText || "";
          const main = document.querySelector("main") || b;
          const txt = (main.innerText || "").replace(/\s+/g, " ").trim();
          const sig = location.pathname + "|" + txt.length + "|" + !!document.querySelector("input[type=password]");
          if (sig !== last) {
            last = sig;
            const h = document.querySelector("h1, h2");
            window.__bsFrame({ path: location.pathname, t: performance.now(), len: txt.length, text: txt.slice(0, 300), h: h ? (h.innerText || "").trim().slice(0, 80) : "", pw: !!Array.from(document.querySelectorAll("input[type=password]")).find((i) => i.getBoundingClientRect().width > 0), all: clone.length });
          }
        }
      } catch { }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const start = new URL(path, "http://x").pathname;
  await page.goto(path, { waitUntil: "load" }).catch(() => {});
  await page.waitForTimeout(settleMs);
  const end = new URL(page.url()).pathname;
  if (end === start) return { redirected: false, frames, findings: [] };
  const final = frames.filter((f) => f.path === end).pop();
  const finalText = final ? final.text : "";
  const LOADING = /^(loading|redirecting|please wait|checking|verifying|signing you in|one moment)\b/i;
  const flash = frames.filter((f) => f.path !== end && f.len > 80 && !LOADING.test(f.text) && (f.h || f.pw || f.len > 300) && !(finalText && finalText.slice(0, 120) === f.text.slice(0, 120)));
  const findings = flash.length ? [{ id: "FM9", what: `${start} paints ${flash[0].pw ? "a sign-in form" : `"${flash[0].h || flash[0].text.slice(0, 40)}"`} before redirecting to ${end} — redirect on the server (middleware / redirect() in the layout) or render nothing until the session is known [FM9, loading-state]`, where: `${start} → ${end}`, frames: flash.length }] : [];
  return { redirected: true, frames, findings };
}

/* ───────────────────────── FM10 account settings ───────────────────────── */

/** FM10 — the email in settings is read-only unless a verified change flow exists (a "verify / we'll send a link" note). */
export const settingsEmail = async (page) => (await lib(page), page.evaluate(() => {
  const B = window.__bsf;
  const out = [];
  for (const f of Array.from(document.querySelectorAll("input")).filter((i) => B.vis(i) && (i.type === "email" || /e-?mail/i.test(B.keyOf(i))))) {
    if (f.readOnly || f.disabled || f.closest("[role=search]")) continue;
    if (!f.value || !/@/.test(f.value)) continue; // an empty email field is an invite / contact field, not the account's own
    const box = f.closest("form, section, [role=dialog]") || f.parentElement;
    if (/verif|confirm(ation)? (link|email)|we('ll| will) send|send (a )?(confirmation|verification)|подтвержд/i.test(box?.innerText || "")) continue;
    out.push({ id: "FM10", what: `the account email "${f.value}" can be edited in place, with no verification — show it read-only, or change it through "Change email" that verifies the new address first [FM10, email-change]`, where: B.where(f), selector: B.selector(f) });
  }
  return out;
}));
export const DATA_EXPORT_RE = /export (my |your |all )?(data|account)|download (my |your |all )?(data|account|information)|data export|request (a copy of )?(my |your )?data|экспорт|выгруз/i;
