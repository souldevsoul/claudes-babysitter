# Content checks (CT1–CT18)

Copy problems that came back on product after product: build notes and "not live yet" copy, test data,
raw errors, trailing periods, the em dash, foreign date formats, "1 PROFILES", emails that cannot receive mail,
untranslated text, legal documents with three names, numbers that contradict each other.

The same rules (`lib/content-rules.js`) run in two places:

| Where | Command | What it reads |
|---|---|---|
| Source (static) | `babysitter content [repo] [--offline]`, and inside `babysitter check` / the hooks (offline) | i18n message files of **every** locale (json / ts / js / yaml under `messages/`, `locales/`, `lib/i18n/`, `public/locales/`, `i18n/`, `translations/`, `dictionaries/` …), JSX copy (text, `title` / `placeholder` / `aria-label` / `alt` / `label` …), email addresses in product code, email templates and translations |
| Rendered pages | `babysitter e2e --only content` (`playwright/content.spec.ts`) | every crawled route, once at desktop width; every configured locale; site-wide comparisons |

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
| CT8 | `content/grammar` | hard | "1 PROFILES", "1 items", "0 item left", "5 credit."; double spaces (message files, attributes); a space before , . : ? ; unmatched “ ” « » ( ) and odd straight quotes. "1 of 3", "1.5 hours", "30 day refund" pass. | ICU plural / Intl.PluralRules |
| CT9 | `content/email-domain` | hard | every address shown (text, mailto, legal pages, footer, translations, email templates, contact constants): `*.vercel.app` / `*.netlify.app` / `pages.dev` / herokuapp / localhost / `example.com` / `.test` always; no MX, null MX or no such domain over DNS-over-HTTPS (dns.google, cached a day in `.babysitter/dns-cache.json`). Network errors are "could not verify", never a failure. `BABYSITTER_DNS=0` turns lookups off at runtime; `--offline` statically. | an address with a working mailbox |
| CT10 | `content/mailto` | hard | a visible address that is not inside `a[href^="mailto:"]`, or a link whose text and mailto differ. The signed-in user's own address (`LOGIN_EMAIL`) and table cells pass. | `<a href="mailto:…">` |
| CT11 | `content/untranslated` | hard | static: a value identical to the default locale (2+ real words), English function words in another locale, Latin-only copy in a Cyrillic / Arabic-script locale. Rendered (one check, both heuristics, one finding per string): English left in a non-English locale, **or** text word for word the same as on that page in the default language (2+ words, 8+ chars; `lang`-tagged, `translate=no`, `locales.keep` and brand words excluded) — this replaces run.spec's separate "untranslated" test; `locales.untranslated: "warn"` lists without failing. Brand words are learned (Latin words kept inside translated sentences) + `content.brandTerms`. | translate |
| CT12 | `content/key-as-text` | hard | a translation key on screen ("home.title", `MISSING_MESSAGE`) — exact keys from the product's message files when present | add the key everywhere |
| CT13 | `content/lang-attr` | hard | `<html lang>` missing, not the locale shown, Cyrillic text under `lang="en"`; `dir` wrong for rtl languages | set lang / dir on locale change |
| CT14 | `content/missing-key` | hard | key parity across the locale files of one group (plural suffixes normalised); empty translations | add it |
| CT15 | `content/legal-naming` | hard | a legal document's footer name ≠ its page `<h1>` ≠ its `<title>`, another footer naming it differently, a multi-word mention in the text in another form ("Terms of Service" vs footer "Terms", "Cookies Notice" vs "Cookie Policy", "Anti-Money Laundering Policy" vs "AML Policy"). Per locale too. | one name everywhere |
| CT16 | `content/copyright-line` | hard | the © line differs between pages | one footer component |
| CT17 | `content/glossary` | hard / note | `content.glossary: { "Terms of Service": ["Terms & Conditions"] }` variants are hard on every page and in source; mixed "Sign in" / "Log in", "Sign up" / "Register", "email" / "e-mail" across buttons and links are listed for a human | one term per concept |
| CT18 | `content/numeric-fact` | note | the same fact with different numbers on different pages: refund / cancel / trial days, fees and commission %, response hours, payout, delivery, "N credits = $M". Both quotes in the report; never fails the run. | decide which is true |

## Configuration (`babysitter.config.json` → `content`)

```json
{
  "content": {
    "dateFormat": "DD.MM.YYYY",
    "dashes": "forbid",
    "allowDash": [],
    "allowPhrases": [],
    "glossary": { "specialist": ["freelancer", "expert"] },
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

`"content": false` turns the static half off inside `babysitter check`. Without `content.locales` the spec follows
the page's `<link rel="alternate" hreflang>`.

## Changed elsewhere

- `playwright/acceptance.js` F3: preview hosts (`*.vercel.app` …) no longer skip the footer email check — the
  same-domain comparison waits (the product's domain is unknown there), but an address on a preview host fails.
- `bin/babysitter.mjs`: `content` subcommand, `e2e --only content`.
- `bin/hook-post-edit.mjs`: runs on translation files (`messages/`, `locales/`, `i18n/` … json / yaml).

Tests: `test/content-lint.test.mjs` (rules, parsers, fixture repo `test/fixtures/content/repo`, `check --changed`),
`test/content-runtime.test.mjs` (fixture pages `test/fixtures/content/pages`, DNS mocked).
