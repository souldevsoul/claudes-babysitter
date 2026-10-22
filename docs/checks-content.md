# Content checks (CT1–CT22)

Copy problems that came back on product after product: build notes and "not live yet" copy, test data,
raw errors, trailing periods, the em dash, foreign date formats, "1 PROFILES", emails that cannot receive mail,
untranslated text, legal documents with three names, numbers that contradict each other — and, site-wide (5.4.0), one
concept described with competing words, one policy stated with different facts, one page reached through links with
different names, and documents named in the copy that the site does not have.

The same rules (`lib/content-rules.js`) run in two places:

| Where | Command | What it reads |
|---|---|---|
| Source (static) | `babysitter content [repo] [--offline]`, and inside `babysitter check` / the hooks (offline) | i18n message files of **every** locale (json / ts / js / yaml under `messages/`, `locales/`, `lib/i18n/`, `public/locales/`, `i18n/`, `translations/`, `dictionaries/` …), JSX copy (text, `title` / `placeholder` / `aria-label` / `alt` / `label` …), email addresses in product code, email templates and translations |
| Rendered pages | `babysitter e2e --only content` (`playwright/content.spec.js`) | every crawled route, once at desktop width; every configured locale; site-wide comparisons |

`babysitter check --changed` (the hooks) reports only copy problems on lines you changed that were not already in
the base version; translation files trigger the edit hook too.

## Rules

| Id | Rule | Hard? | Detects | Fix |
|---|---|---|---|---|
| CT1 | `content/unfinished` | hard | build notes, not-yet copy, defensive copy, template markers: "not live yet", "open at launch", "switched off", "isn't available yet", "isn't working yet", "not available on the platform yet", "has not launched", "coming soon", "we don't promise", "there is nothing else", "does not review deliverables", "example profile", "placeholder", "lorem", TBD / TODO / FIXME, `#highlighted#`, `{{name}}` on a page, a `*.vercel.app` preview host in copy; acceptance B1 delegates here (one source of truth); az / kk / ru variants ("hələ mümkün deyil", "söz vermirik", "әзірге қолжетімсіз", "уәде бермейміз", "пока недоступно" …). A transient "isn't available yet, try again" error passes. | say what works now or remove the block |
| CT2 | `content/test-data` | hard | "New Company 2", "New Address 7", "Test User", "test … account", "John Doe", asdf, qwerty, `@example.com`, 0000000. Input placeholders, `*Placeholder` / `*Example` keys and "like you@example.com" hints pass. The studio's shared legal identity placeholder ("New Company 1", "New Address 1", "000000000"; canon R-OWN-08) is required copy and passes, here and in CT11 (`content.legalIdentity`; `[]` turns the exception off for a product with its own entity). | real content |
| CT3 | `content/raw-error` | hard | `[object Object]`, NaN, undefined, null, Invalid Date, a leading "Error:", JS / Prisma / Auth.js error names, stack frames, "Internal Server Error", "error 500". In message files only the unambiguous ones. | catch it, show a plain message |
| CT4 | `content/trailing-period` | hard | h1–h3 (the last line of a split heading), button labels, nav items, `<title>`; i18n keys `*title` / `*heading` / `*button` / `cta` / `nav.*`. Ellipsis and "Inc." pass. | drop the period |
| CT5 | `content/dash` | hard | "—" and "--" in copy (studio rule), incl. "—" as an empty table value. En-dash ranges pass. `content.dashes: "allow"`, `content.allowDash: [regex]`. | comma, colon, brackets, "Not set" |
| CT6 | `content/date-format` | hard | "Month D, YYYY", "D Month YYYY", "Mon YYYY", MM/DD/YYYY, ISO timestamps, D.M.YYYY, ru / az / kk month names — anything not in `content.dateFormat` (default `DD.MM.YYYY`) | one format |
| CT7 | `content/last-updated` | hard | a rendered "Last updated" with no date; two different "last updated" (or "effective") dates in one document (page, JSX file, i18n namespace); the same key / route with a different date in another locale | one date per document |
| CT8 | `content/grammar` | hard | "1 PROFILES", "1 items", "0 item left", "5 credit."; double spaces (message files, attributes); a space before , . : ? ; unmatched “ ” « » ( ) and odd straight quotes. "1 of 3", "1.5 hours", "30 day refund" pass. **French** (a `fr` / `fr-*` message file, `<html lang="fr">` or an element's `lang`): a space, U+00A0 or U+202F before ? ! : ; is correct typography and passes; a missing one ("Nouveau? Vos…") is a soft note (`(check)` in `babysitter content`, "check by eye" in the run). (5.4.0) | ICU plural / Intl.PluralRules |
| CT9 | `content/email-domain` | hard | every address shown (text, mailto, legal pages, footer, translations, email templates, contact constants): `*.vercel.app` / `*.netlify.app` / `pages.dev` / herokuapp / localhost / `example.com` / `.test` always; no MX, null MX or no such domain over DNS-over-HTTPS (dns.google, cached a day in `.babysitter/dns-cache.json`). Network errors are "could not verify", never a failure. `BABYSITTER_DNS=0` turns lookups off at runtime; `--offline` statically. | an address with a working mailbox |
| CT10 | `content/mailto` | hard | a visible address that is not inside `a[href^="mailto:"]`, or a link whose text and mailto differ. The signed-in user's own address (`LOGIN_EMAIL`) and table cells pass. | `<a href="mailto:…">` |
| CT11 | `content/untranslated` | hard | static: a value identical to the default locale (2+ real words), English function words in another locale, Latin-only copy in a Cyrillic / Arabic-script locale. Rendered (one check, both heuristics, one finding per string): English left in a non-English locale, **or** text word for word the same as on that page in the default language (2+ words, 8+ chars; `lang`-tagged, `translate=no`, `locales.keep` and brand words excluded) — this replaces run.spec's separate "untranslated" test; `locales.untranslated: "warn"` lists without failing. Brand words are learned (Latin words kept inside translated sentences) + `content.brandTerms`. | translate |
| CT12 | `content/key-as-text` | hard | a translation key on screen ("home.title", `MISSING_MESSAGE`) — exact keys from the product's message files when present | add the key everywhere |
| CT13 | `content/lang-attr` | hard | `<html lang>` missing, not the locale shown, Cyrillic text under `lang="en"`; `dir` wrong for rtl languages | set lang / dir on locale change |
| CT14 | `content/missing-key` | hard | key parity across the locale files of one group (plural suffixes normalised); empty translations | add it |
| CT15 | `content/legal-naming` | hard | a legal document's footer name ≠ its page `<h1>` ≠ its `<title>`, another footer naming it differently, a multi-word mention in the text in another form ("Terms of Service" vs footer "Terms", "Cookies Notice" vs "Cookie Policy", "Anti-Money Laundering Policy" vs "AML Policy"). Per locale too. | one name everywhere |
| CT16 | `content/copyright-line` | hard | the © line differs between pages | one footer component |
| CT17 | `content/glossary` | hard / note | `content.glossary: { "Terms of Service": ["Terms & Conditions"] }` variants are hard on every page and in source; mixed "Sign in" / "Log in", "Sign up" / "Register", "email" / "e-mail" across buttons and links are listed for a human | one term per concept |
| CT18 | `content/numeric-fact` | note | the same fact with different numbers on different pages: refund / cancel / trial days, fees and commission %, response hours, payout, delivery, "N credits = $M". Both quotes in the report; never fails the run. Refund windows and retention periods are CT20's when it runs. | decide which is true |
| CT19 | `content/term-drift` | hard | **one concept, one name**, per language: the person who does the work (specialist / expert / executor / freelancer / professional / contractor / pro; translator / reviewer only where they are hired, assigned or paid), closing the account (delete / close / remove / deactivate / erase / cancel), giving money back (refund / money back / reimbursement / return of funds; a chargeback only where the shop says it issues one), the card (credit card / debit card / credit or debit card / bank card / payment card), and how a currency is named in prose (USD vs dollars, EUR vs euros, GBP vs pounds / sterling). French: spécialiste / expert / prestataire / freelance / exécutant and supprimer / fermer / désactiver le compte. Reported at every place of each minority name, with the dominant one (the `content.glossary` preferred term when it is in the group, else the most used) and every other location. Not counted: adjectives ("an expert review", "professional and friendly"), "Pro" as a plan, "pros and cons", "independent contractors", the provider ending an account ("we may suspend or close your account"), account *data*, quoted passages, emails, URLs, code, a list of currency codes, amounts, the admin area (`content.consistencyAdmin: true` adds it). Variants `content.glossary` bans stay CT17's. | replace the minority name with the dominant one at the places listed (or `content.termAllow`) |
| CT20 | `content/policy-conflict` | hard | **one policy, one set of facts**: the refund window, the refund processing time, the statutory withdrawal period (its own clock), how long account deletion takes, how long each kind of data is kept (financial records, logs, backups, files), the accepted payment methods ("we accept Visa, Mastercard" vs "Visa, Mastercard, Amex"), the currencies offered ("pay in GBP, EUR or USD" vs "prices in USD only"), the billing currency, and prices shown in a currency the site does not offer (or, with nothing stated, in more than one currency). English sentences; weeks become days; a value said only next to the main one in the same statement ("credit refunds: 5 days; cash refunds: 5–10 days") is qualified; "at least 5 years" agrees with "7 years"; an open list ("euros, pounds and other currencies") disagrees only by naming one the full list lacks; negated sentences are skipped. | decide which is true; the report names the value most places state and every place of the others |
| CT21 | `content/label-drift` | hard | **one destination, one name**: (a) links to the same page with different names ("Help Centre" / "Support" / "FAQ" → /help); nav, footer and button links with any label, body links when the label is a short name (calls to action such as "Upload video", sentences, card links named by their heading, links inside a sentence and generic labels — "Learn more", "Back" — are not names; "Back to Sign in" names Sign in; a label that is a word subset of another is the same name; British / American spelling and plurals are one); the page's own name wins, else the label most links use; `content.labelAllow: { "/sign-up": ["Sign up", "Create account"] }` accepts a set. (b) a nav / footer label the page does not carry: a near miss of its `<h1>` / `<title>` ("Cookie notice" → "Cookie Policy") or a page whose own name is what another link calls a different page ("Docs" → a page headed "Help Center" while "Help centre" opens /help); taglines and questions ("How can we help you?") and the brand part of the title are not names; on rendered pages legal documents of one family are CT15's. (c) one action, one label: buying credits (Buy credits / Top up / Add credits / Purchase credits / Recharge / Add funds) and contacting the team (Contact us / Contact support / Get in touch / Talk to us) on buttons and body links; statically also buttons whose `onClick` opens the same thing (`setBuyOpen(true)`, `openCreditsDialog()`) with different labels. Static: links in JSX, link objects (`{ key: "terms", href: "/terms" }` rendered through `t(l.key)`), `t("key")` followed to the default language. (5.4.1) (d) the page's name in the copy: each route's own names (`<h1>`, layout title, `<title>` without the brand, nav / sidebar labels) against the names prose, locale strings and email templates give it as a destination ("download it from My videos" vs "Video Library"); a menu label whose words name another page better than the one it opens gets the right href; links are grouped where they land after redirects, and two links in one nav / footer group that land on one page are reported. | one name everywhere (or the allow-list) |
| CT22 | `content/missing-page` | hard | **no page named that does not exist**: (a) a link to a path that is not a page — statically: not an app / pages route (`[locale]` segments and route groups understood, dynamic segments match), route handler, `public/` file or `next.config` / `vercel.json` redirect source; on rendered pages the request answers 4xx / 5xx (reported by D1 in a full run, by CT22 with `--only content`). (b) a document or page named in Title Case — "Specialist Service Terms", "Acceptable Use Policy", "Data Processing Agreement", "the Help Centre", "our FAQ", also inside quotes — that no page `<h1>` / `<title>`, layout title (`<PolicyLayout title>`), or link label of the site carries. A name of the same legal family as a page the site has exists (CT15 / CT21 rename it); generic phrases ("this Agreement", "Changes to This Policy", "Company FAQ", "Data Center"), another company's document ("Stripe's Services Agreement", "Google Privacy Policy") and a heading that only labels its own block pass; "Acme Partner Agreement" and "Partner Agreement" are one name. `content.knownDocuments` lists documents that live elsewhere. (5.4.1) (c) a page file whose route a `next.config` / `vercel.json` redirect always catches (dead page), and links to a redirected path (link the final URL). | link the name to the page it means and use that page's name, or create the page, or remove the reference |

## Configuration (`babysitter.config.json` → `content`)

```json
{
  "content": {
    "dateFormat": "DD.MM.YYYY",
    "dashes": "forbid",
    "allowDash": [],
    "allowPhrases": [],
    "glossary": { "specialist": ["freelancer", "expert"] },
    "termGroups": { "dashboard": ["dashboard", "workspace", "control panel"], "role": false },
    "termAllow": [{ "term": "expert", "where": "pricing", "reason": "the Expert tier is a plan name" }],
    "policyAllow": [{ "fact": "refund window", "value": "30 days", "where": "/business", "reason": "business accounts have 30 days" }],
    "currencies": ["EUR", "USD"],
    "labelAllow": { "/sign-up": ["Sign up", "Create account", "Get started"] },
    "knownDocuments": ["Stripe Connected Account Agreement"],
    "consistencyAdmin": false,
    "brandTerms": ["PRAXIS"],
    "legalIdentity": ["New Company 1", "New Address 1", "000000000"],
    "defaultLocale": "en",
    "locales": [
      { "code": "az", "localStorage": { "praxis-locale": "az" } },
      { "code": "kk", "prefix": "/kk" },
      { "code": "de", "cookie": { "NEXT_LOCALE": "de" } }
    ],
    "skip": ["CT18"],
    "skipReasons": { "CT18": "owner checks numbers by hand" }
  }
}
```

CT19–CT22 config: `glossary` (preferred → banned; CT17 enforces the banned ones, CT19 takes the preferred one as the
dominant name of its group), `termGroups` (concept → names: adds a group, or replaces a built-in one; `false` drops a
built-in group), `termAllow` (`"term"` or `{ term?, concept?, where?, reason }`; `where` is a regex on the place),
`policyAllow` (`{ fact?, value?, where?, reason }`), `currencies` (what the site offers; `acceptance.currencies` is
used when it is set), `labelAllow` (path → labels that may share it), `knownDocuments`, `consistencyAdmin` (check the
admin area too), `consistencyIgnore` (regexes of files left out of CT19–CT22). `content.skip: ["CT20"]` turns one off.

How they report: `babysitter content` lists each place to change as file:line, then a "Site-wide copy (CT19–CT22)"
list with one entry per concept — the dominant name / value, every variant with its places, and the fix
(`--format json` carries the same groups under `consistency`). `babysitter check --changed` reports a new minority
name / value / label on a changed line; one already in the file at the base version is old debt. On rendered pages
(`e2e --only content`, the site-wide test) each concept is one finding listing the pages; `fix-plan` keeps them one
item per concept.

`"content": false` turns the static half off inside `babysitter check`. Without `content.locales` the spec follows
the page's `<link rel="alternate" hreflang>`.

## Changed elsewhere

- `playwright/acceptance.js` F3: preview hosts (`*.vercel.app` …) no longer skip the footer email check — the
  same-domain comparison waits (the product's domain is unknown there), but an address on a preview host fails.
- `bin/babysitter.mjs`: `content` subcommand, `e2e --only content`.
- `bin/hook-post-edit.mjs`: runs on translation files (`messages/`, `locales/`, `i18n/` … json / yaml).

Tests: `test/content-lint.test.mjs` (rules, parsers, fixture repo `test/fixtures/content/repo`, `check --changed`),
`test/content-consistency.test.mjs` (CT19–CT22 and CT8 in French: every rule's catches and look-alikes, cross-rule
cases, the fixture Next.js app `test/fixtures/content/site`, `check --changed`), `test/content-runtime.test.mjs`
(fixture pages `test/fixtures/content/pages` and a routed fixture site for CT19–CT22, DNS mocked).

## 5.5.0 — every missed card a check (Praxis, Parallel, Kindred, Compass)

Static (`babysitter content`) and rendered (content.spec, and `measure()` in every state). Fixtures:
`test/misses-550-content-a.test.mjs`, `test/misses-550-content-b.test.mjs`, `test/issues-550.test.mjs`.

| ID | What | Cards |
|---|---|---|
| CT1 | English not-yet copy: "not switched on yet", "not yet enabled / connected", "once / until (card) payment(s) / checkout / payouts … is live / switched on" (ru / az / kk too); **the same message in every language** — unfinished copy at a key in one locale is reported at that key in the others | Compass dqdasz evwgc7 4670bf chqsch yvewhx (issue #5 A) |
| CT2 | a message is an input hint by its use (`placeholder={t("…")}`); the signed-in accounts' own addresses (`LOGIN_EMAIL`, `roles[].env`) are not test data | issues #4, #5 |
| CT3 | raw scores (0.7029) in prose; the browsers' fetch / JSON errors ("Failed to fetch", "is not valid JSON", "<!DOCTYPE") | Compass 41j7mo; Kindred x6wx1s |
| CT8 | a sentence starts with a capital; `{n} minutes` outside an ICU plural (static, English) | Compass zrb0pz q0qz7n |
| CT11 | what a user wrote (`[data-user-content]`, chat logs, quotes, `pre-wrap` text) is not untranslated copy | issue #5 |
| CT12 | a link / button labelled with its own path ("/pricing") or `<Link href={x}>{x}</Link>` | Parallel 49kc72 |
| CT15 | a document named with and without the brand in front; a lower-case mention of a footer document; one "Specialist …" document under two names | Praxis tpp8au; Compass k7ue1f qcq5fq u23b9o |
| CT19 | one spelling of a loanword per language (cookie / kuki / куки); one verb for handing over the work (delivered vs complete) | Praxis 2ixn7g 69ukru |
| CT20 | what to do after acceptance; who sets the task list; what the site stores (closed lists, count words); minimum age; a closed list of payment methods vs what the checkout offers; a refused country offered in a list | Praxis lzldsx q26219 9slhlk; Kindred 3h4bom ff5psx; Compass msds2g vgs44j |
| CT21 | the page's own name is the suggested label | Parallel 9a8qvx |
| CT23 | a promise (escrow, guarantees, SLA, certifications …) no legal page describes; "no questions asked" while a policy sets conditions | Kindred ancvgr ql7sv4 |
| CT24 | an h1 within one stemmed word of a sibling product's h1 (registry `~/.claudes-babysitter/copy.json`, `BABYSITTER_COPY_REGISTRY`) | Kindred brypwi |
| CT25 | a URL on a host carrying the brand that is not the site's (`content.ownDomains`) | Kindred 2b9nt9 |
| CT26 | a slug shown as a name (kebab-case text; `{x.slug}` in JSX) | Compass r7i2dc ebev0t |
| CT27 | a worked example that adds up in credits but not in money | Compass wy8h00 |
| CT28 | one letter case per heading (English); acronyms (AI, ML, API) keep their capitals | Compass 33jce3 8t3qh1 |
| CT29 | an e-mail address drawn uppercase / capitalised / small caps | Compass wee3g3 |
| CT30 | 4+ like items that all show 0 for the same unit (an empty state instead) | Compass 4bw126 3eikk6 |
| CT31 | (soft) the same 4+ names in two orders on two pages | Compass ey1511 |
| 6.15 | every page has its own `<title>`, never only the brand on a non-home page | Compass bymtup 853l4n |
| P4 | a policy's section numbers run 1, 2, 3 and its contents list matches | Compass 2hxrol |
| F5 | "the marks shown in X" — page X shows them | Praxis 992bgb |
| M3 | (static) the payment API accepts every currency the switcher offers | Kindred 2895jy |

Fixed in 5.5.0: the site-wide CT19 / CT20 / CT7 findings were reported only when CT21 or CT22 was on (a comment had
swallowed a closing brace in content.spec).
