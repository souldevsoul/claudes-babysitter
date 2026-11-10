// FM16 — every role has its own door (docs/checks-forms.md, export-rules/01-ui-components.md 8.17).
// A product with a supply side (specialists, assistants, engineers, reviewers, crew, partners …) links to it from the
// customer site: "Apply as a specialist", "Become an engineer", "Work with us", "For assistants". The page that link
// lands on must be visibly the role's own: its heading, lead, side panel, "New here?" link and <title> say whom it is
// for. Guildhall: "Apply as a specialist" opened /signin?role=specialist, word for word the customer sign-in — the
// customer marketing panel, "Welcome back", "New here? Open your hall" — and only the URL differed.
//
// Pure functions: the in-page reading is playwright/checks/role-auth.js; this file decides.

/** Supply-side nouns: who works in the product, as opposed to who buys from it. Singular; plurals are matched. */
export const ROLE_WORDS = [
  "specialist", "assistant", "expert", "engineer", "reviewer", "crew", "partner", "provider", "professional", "pro",
  "freelancer", "contractor", "tutor", "teacher", "coach", "mentor", "host", "driver", "courier", "rider", "seller",
  "vendor", "merchant", "creator", "consultant", "agent", "operator", "translator", "designer", "developer", "writer",
  "editor", "therapist", "doctor", "practitioner", "organizer", "organiser", "instructor", "trainer", "cleaner",
  "technician", "builder", "artist", "photographer", "talent", "worker", "tasker", "helper", "caregiver", "nanny",
  "advisor", "adviser", "lawyer", "accountant", "affiliate", "supplier", "landlord", "broker", "guide", "member of staff",
];
/** Nouns that name the customer side: "Join as a customer" is the ordinary sign-up, not a role door. */
const CUSTOMER_WORDS = /^(customer|client|user|buyer|member|guest|patient|student|shopper|traveller|traveler|subscriber|individual|team|business|company|owner|admin|administrator)s?$/i;
const STOP = new Set("a an the and or of to in on for with your you our we us is are be at by as it this that from new here".split(" "));

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const plural = (w) => `${esc(w)}(?:e?s)?`;

/** The settings, from babysitter.config.json → forms.roleAuth, with the defaults filled in. */
export function roleAuthConfig(cfg = {}) {
  const r = { ...(cfg.forms?.roleAuth || {}) };
  const fromRoles = (cfg.roles || []).map((x) => String(x.name || "").toLowerCase()).filter((n) => n && !CUSTOMER_WORDS.test(n) && !/^(admin|superadmin|staff|moderator|support|default|user)$/.test(n));
  const roleWords = [...new Set([...(r.roleWords || []), ...fromRoles, ...ROLE_WORDS].map((w) => w.toLowerCase()))];
  return {
    roleWords,
    entryText: (r.entryText || []).map((s) => new RegExp(s, "i")),
    entrySelectors: r.entrySelectors || [],
    pages: r.pages || null,
    routes: r.routes || [],
    maxEntries: r.maxEntries ?? 6,
    maxSimilarity: r.maxSimilarity ?? 0.8,
    entryRe: entryRegex(roleWords, r.entryText || []),
  };
}

/** The words that make a link a door into the supply side ("Apply as a specialist", "For engineers", "Work with us"). */
export function entryRegex(roleWords = ROLE_WORDS, extra = []) {
  const R = roleWords.map(plural).join("|");
  const parts = [
    String.raw`\bapply\b(?!\s+(?:coupon|code|promo|filters?|discount|changes|now to save))`,
    String.raw`\bbecome\s+(?:a|an|one of our)\s+\w+`,
    String.raw`\bjoin\s+(?:as\s+(?:a|an)\s+\w+|our\s+(?:team|network|roster|crew|bench|guild|community of)|the\s+(?:team|network|roster|crew|bench|guild))`,
    String.raw`\bwork\s+(?:with|for)\s+us\b`,
    String.raw`\b(?:sign\s?up|register|sign\s?in|log\s?in|apply)\s+as\s+(?:a|an)\s+\w+`,
    String.raw`\bfor\s+(?:${R})\b`,
    String.raw`\b(?:${R})\s+(?:sign[\s-]?in|sign[\s-]?up|log[\s-]?in|login|portal|area|hub|application|apply|access|dashboard|program(?:me)?)\b`,
    String.raw`\bare\s+you\s+(?:a|an)\s+(?:${R})\b`,
    String.raw`\b(?:earn|get paid)\s+(?:as|with)\b`,
    ...extra,
  ];
  return new RegExp(parts.join("|"), "i");
}

/**
 * The role an entry is for: the noun after "as a" / "become a" / "for", a role word in the text, the link or the page
 * it reached, else null. A customer noun ("Join as a customer") returns "customer" — the caller drops that entry.
 */
export function entryRole({ text = "", href = "", landing = "" } = {}, roleWords = ROLE_WORDS) {
  const t = String(text).toLowerCase();
  const named = t.match(/\b(?:as|become|be)\s+(?:a|an|one of our)\s+([a-z-]+)/) || t.match(/\bjoin\s+as\s+(?:a|an)\s+([a-z-]+)/);
  if (named) {
    if (CUSTOMER_WORDS.test(named[1])) return "customer";
    return roleWords.find((w) => new RegExp(`^${plural(w)}$`).test(named[1])) || named[1];
  }
  const inText = (s) => roleWords.find((w) => new RegExp(`\\b${plural(w)}\\b`, "i").test(s));
  let u = "";
  try { const x = new URL(href, "http://x/"); u = `${x.pathname} ${[...x.searchParams.values()].join(" ")}`.replace(/[/_-]+/g, " "); } catch { u = String(href); }
  return inText(t) || inText(u) || inText(String(landing)) || null;
}

/** Does `text` name the role (any case, singular or plural, "Specialist" in "Specialist sign-in")? */
export function namesRole(text, role) {
  if (!role || !text) return false;
  return new RegExp(`\\b${plural(String(role).toLowerCase())}\\b`, "i").test(String(text));
}

export const tokens = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
/** Word-set overlap, 0…1 (Jaccard). Two empty texts are not "the same" — they are nothing to compare. */
export function similarity(a, b) {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / (A.size + B.size - both);
}
const sentences = (s) => String(s || "").split(/(?<=[.!?])\s+|\n+/).map((x) => x.replace(/\s+/g, " ").trim()).filter((x) => x.length >= 25);
const norm = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
/** The path + query of a link, the way two links to one page compare equal. */
export function target(href, base = "http://x/") {
  if (!href) return "";
  try { const u = new URL(href, base); return (u.pathname.replace(/\/+$/, "") || "/") + (u.search || ""); } catch { return String(href); }
}
const q = (s, n = 60) => `"${String(s).replace(/\s+/g, " ").trim().slice(0, n)}${String(s).trim().length > n ? "…" : ""}"`;

/**
 * Compare the page a role entry reached with the customer's page of the same kind (sign-in with sign-in, sign-up with
 * sign-up). Surfaces come from playwright/checks/role-auth.js → authSurface:
 *   { path, title, heading, lead, eyebrow, aside, body, kind, switchLink: { text, href } | null }
 * `entry` is { text, from } — the link that led here, for the message.
 */
export function compareAuthSurfaces(customer, role, { role: who, entry = {}, maxSimilarity = 0.8 } = {}) {
  const out = [];
  const name = who || "the role";
  const door = entry.text ? `"${entry.text}"${entry.from ? ` (on ${entry.from})` : ""} → ${role.path}` : role.path;
  const where = role.path;
  const kind = role.kind === "signUp" ? "sign-up" : "sign-in";
  const sameAsCustomer = target(role.path) === target(customer.path);

  // 1. the words a visitor reads: identical, or nearly so
  const sim = similarity(role.body, customer.body);
  if (sim >= maxSimilarity) {
    const same = [];
    if (role.heading && norm(role.heading) === norm(customer.heading)) same.push(`heading ${q(role.heading)}`);
    if (role.lead && norm(role.lead) === norm(customer.lead)) same.push(`lead ${q(role.lead)}`);
    if (role.aside && norm(role.aside) === norm(customer.aside)) same.push("side panel");
    out.push({ id: "FM16", what: `${door} is the customer ${kind} page${sameAsCustomer ? " itself" : ` ${customer.path} again`}: ${Math.round(sim * 100)}% of its words are the same${same.length ? ` (same ${same.join(", ")})` : ""} — a ${name} cannot tell which door they came through. Give the ${name} ${kind} its own heading and lead naming the ${name}, a ${name} side panel (what they get, requirements, how approval works) and its own "New here?" link [FM16, role-auth-surface]`, where });
  }

  // 2. nothing on the page names the role
  const label = [role.title, role.heading, role.lead, role.eyebrow].join(" \n ");
  if (who && !namesRole(label, who)) {
    out.push({ id: "FM16", what: `${door}: neither the heading ${role.heading ? q(role.heading) : "(none)"}, the lead, a badge nor the <title> says "${name}" — name the role where the eye lands: "${cap(name)} sign-in", "Apply as a ${name}" [FM16, role-auth-surface]`, where });
  }

  // 3. the customer marketing panel on the role's page
  const custLines = sentences(customer.aside);
  if (custLines.length) {
    const body = norm(role.body);
    const reused = custLines.filter((s) => body.includes(norm(s)));
    if (reused.length && reused.length / custLines.length >= 0.5) {
      out.push({ id: "FM16", what: `${door} shows the customer side panel (${reused.length} of its ${custLines.length} sentences, e.g. ${q(reused[0], 70)}) — the ${name} panel says what a ${name} gets, what they need and how approval works [FM16, role-auth-surface]`, where });
    }
  }

  // 4. "New here?" sends the role to the customer sign-up
  const rl = role.switchLink;
  const cl = customer.switchLink;
  if (rl && cl && target(rl.href) === target(cl.href) && !namesRole(`${rl.href} ${rl.text}`, who)) {
    out.push({ id: "FM16", what: `${door}: ${q(rl.text, 50)} leads to ${target(rl.href)} — the customer's ${role.kind === "signUp" ? "sign-in" : "sign-up"}. Point it at the ${name}'s own ${role.kind === "signUp" ? "sign-in" : "application / sign-up"} [FM16, role-auth-surface]`, where });
  }

  // 5. the tab says the same
  if (role.title && norm(role.title) === norm(customer.title) && !namesRole(role.title, who)) {
    out.push({ id: "FM16", soft: true, what: `${door}: the <title> ${q(role.title)} is the customer page's — name the ${name} in it ("${cap(name)} sign-in · Brand") [FM16, role-auth-surface]`, where });
  }
  return out;
}

/** The customer's own sign-in / sign-up: it must not open as the supply side's door. */
export function customerAdvertisesRole(customer, roleWords = ROLE_WORDS) {
  const out = [];
  const head = `${customer.heading} ${customer.eyebrow}`;
  const inHead = roleWords.find((w) => namesRole(head, w));
  if (inHead) out.push({ id: "FM16", soft: true, what: `the customer ${customer.kind === "signUp" ? "sign-up" : "sign-in"} ${customer.path} is headed for a ${inHead} (${q(head.trim())}) — the customer door names the customer; the ${inHead} has their own [FM16, role-auth-surface]`, where: customer.path });
  const l = customer.switchLink;
  const inLink = l && roleWords.find((w) => namesRole(`${l.text} ${l.href}`, w));
  if (inLink) out.push({ id: "FM16", soft: true, what: `the customer ${customer.kind === "signUp" ? "sign-up" : "sign-in"} ${customer.path}: its main "New here?" link ${q(l.text, 50)} goes to the ${inLink} path (${target(l.href)}) — it should open the customer sign-up; a small "Are you a ${inLink}?" link may sit below [FM16, role-auth-surface]`, where: customer.path });
  return out;
}

const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
