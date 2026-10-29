# 02 — Copy: voice, terminology, consistency, localisation

> **How to use this file.** These rules catch the copy defects that came back on product after
> product: build notes shipped to users, test data, raw errors, three names for one document,
> numbers that contradict each other, and untranslated strings.
>
> Tags (`[CT19]`, `[CT20]`) are the Babysitter rule IDs — quote them in a finding.
>
> The decisive idea behind most of this file: **one concept, one name; one policy, one set of
> facts; one destination, one label.** A reader who meets the same thing under two names
> assumes they are two things.

---

## 1. The site describes what works

### 1.1 No build notes, no "not yet" `[CT1]` — **hard**

The site states what the product does **now**. Anything that reads as a note from the team to
itself, or as an apology for an unfinished feature, is a defect.

Caught in **any word order**: a negation or absence (not, no, isn't, doesn't, don't, has no,
sends no, nothing …) together with a "for now" word (yet, for now, at the moment, currently …)
in one clause.

```
❌ Нельзя
"Email delivery is not enabled on this plan yet."
"Relaygpu sends no email yet."
"What we don't do yet"
"Full fine-tune is not open yet."
"· not open yet"
"We do not currently collect …"
"Coming soon" · "Open at launch" · "Temporarily unavailable" · "switched off"
"This isn't working yet" · "has not launched" · "we don't promise"
TBD · TODO · FIXME · lorem · #highlighted# · {{name}} · *.vercel.app in copy
"Example profile" · "Placeholder"
```

```
✅ Как надо
"Write to us through the contact form."            (instead of "the support mailbox doesn't work yet")
"Endpoints run on 16, 24 and 48 GB GPUs."          (instead of "more tiers coming soon")
— or remove the block entirely until the feature exists
```

**Stays quiet** (these are correct copy, do not report them):

| Shape | Example |
|---|---|
| an empty state | "No runs yet." · "Nothing here yet" |
| the reader's own state | "You haven't added a card." · "Don't have an account yet?" |
| a process still running | "Weights aren't ready for this run yet" |
| a transient error | "… not available, try again" |
| the payment dialog's own error | "temporarily unavailable" on the pay button and its error |
| code comments, API routes, server code | — |

Languages read: en, ru, uk, bg, kk, ky, az, fr, de, es, pt, it, sk, sl, el, ar, ja — each with
its own empty-state / reader / process exceptions.

### 1.2 No test data `[CT2]` — **hard**

```
❌ Нельзя: "New Company 2" · "Test User" · "John Doe" · asdf · qwerty · @example.com · 0000000
✅ Как надо: the real entity, the real address, the real number
```

Input placeholders and "like you@example.com" hints pass. A studio-wide legal-identity
placeholder declared in config is required copy and passes.

### 1.3 No raw errors `[CT3]` — **hard**

```
❌ Нельзя
"[object Object]" · "NaN" · "undefined" · "Invalid Date" · "Error: ECONNREFUSED"
"Internal Server Error" · "error 500" · a stack frame
"Unexpected token < in JSON at position 0" · "Failed to fetch" · "<!DOCTYPE"
a raw score in prose: "confidence 0.7029"

✅ Как надо
"We couldn't reach the billing service. Try again in a minute."
"confidence 70%"
```

### 1.4 Promises the legal pages do not back `[CT23]` — **hard**

A promise in marketing copy (escrow, a guarantee, an SLA, a certification) that no legal page
describes. "No questions asked" while a policy sets conditions is a contradiction.

---

## 2. Tone of voice and micro-typography

| # | Rule | Tag |
|---|---|---|
| 2.1 | **No trailing period** in h1–h3, button labels, nav items or `<title>`. Ellipsis and "Inc." pass. | `[CT4]` |
| 2.2 | **No em dash** (`—`) and no `--` in copy, including "—" as an empty table value. Use a comma, a colon, brackets, or "Not set". En-dash ranges pass. | `[CT5]` |
| 2.3 | One letter case per heading (English). "Choosing a Compute Tier: a worked Example" mixes Title Case and sentence case. Acronyms (AI, ML, API) keep their capitals. | `[CT28]` |
| 2.4 | A heading in capitals while the site's headings are mixed case is a finding. | `[6.5]` |
| 2.5 | Grammar and number agreement: "1 PROFILES", "1 items", "0 item left", "5 credit." Use ICU plurals / `Intl.PluralRules`. "1 of 3", "1.5 hours", "30 day refund" pass. | `[CT8]` |
| 2.6 | No double spaces; no space before `, . : ? ;` **in English**; no unmatched `“ ” « » ( )`; no stray straight quotes. | `[CT8]` |
| 2.7 | **French typography is the opposite:** a space (U+00A0 / U+202F) **before** `? ! : ;` is correct. A missing one is the finding. | `[CT8]` |
| 2.8 | A sentence starts with a capital. | `[CT8]` |
| 2.9 | No slug shown as a name: kebab-case text on screen, `{x.slug}` rendered as a label. | `[CT26]` |
| 2.10 | An e-mail address is never drawn uppercase, capitalised or in small caps. | `[CT29]` |
| 2.11 | Every page has its own `<title>` — never only the brand on a non-home page. | `[6.15]` |

```jsx
// ❌ Нельзя
<h1>Choose your plan.</h1>
<Button>Save changes.</Button>
<p>Delivery — 5 days</p>
<span>{count} items</span>
<td>{endpoint.slug}</td>      // renders "qwen-2-5-14b-instruct"

// ✅ Как надо
<h1>Choose your plan</h1>
<Button>Save changes</Button>
<p>Delivery: 5 days</p>
<span>{t("items", { count })}</span>
<td>{endpoint.name}</td>      // "Qwen2.5 14B Instruct"
```

---

## 3. One concept, one name `[CT19]` — **hard**

The same thing **MUST** carry the same name everywhere, per language. The dominant name wins;
every other name is reported at each of its places.

Concept groups that are checked by default:

| Concept | Names that collide |
|---|---|
| the person who does the work | specialist / expert / executor / freelancer / professional / contractor / pro |
| closing the account | delete / close / remove / deactivate / erase / cancel |
| giving money back | refund / money back / reimbursement / return of funds |
| the card | credit card / debit card / credit or debit card / bank card / payment card |
| a currency in prose | USD vs dollars · EUR vs euros · GBP vs pounds / sterling |
| handing over the work | delivered vs complete |
| a loanword, per language | cookie / kuki / куки |

```
❌ Нельзя — three names for one person across the site
/about     "Our experts deploy your model."
/pricing   "A specialist takes it from there."
/faq       "Your freelancer will reply within a day."

✅ Как надо — pick one and use it everywhere
"Our engineers deploy your model." / "An engineer takes it from there." / "Your engineer will reply within a day."
```

**Not drift** (do not report): adjectives ("an expert review", "professional and friendly"),
"Pro" as a plan name, "pros and cons", "independent contractors" as a legal term, the provider
ending an account ("we may suspend or close your account" — the provider's act, not the
holder's), account *data*, quoted passages, e-mails, URLs, code, lists of currency codes,
amounts, and a role named with its own qualifier used consistently ("tax and payroll
specialist").

**Two acts named apart on purpose** are legitimate, but must be declared:

```jsonc
// babysitter.config.json
"content": {
  "termAllow": [{
    "term": "close", "concept": "account deletion", "where": "terms",
    "reason": "'We close an account' is what the provider does (Terms §Sanctions); 'you delete your account' is what the holder does from /settings."
  }]
}
```

### Banned variants `[CT17]`

A glossary maps the preferred term to the ones it replaces; every banned variant is hard,
on pages and in source. Mixed "Sign in" / "Log in", "Sign up" / "Register", "email" / "e-mail"
across buttons and links are listed for a human to settle.

```jsonc
"content": { "glossary": { "Terms of Service": ["Terms & Conditions"], "specialist": ["freelancer", "expert"] } }
```

---

## 4. One policy, one set of facts `[CT20]` — **hard**

The same fact **MUST** carry the same number on every page. Facts that are compared:

- the refund window, and the refund processing time
- the statutory withdrawal period (its own clock — it may differ from the refund window)
- how long account deletion takes
- how long each kind of data is kept (financial records, logs, backups, files)
- the accepted payment methods
- the currencies offered, and the billing currency
- prices shown in a currency the site does not offer

```
❌ Нельзя
/refund   "Unused credits are refunded within 14 days."
/terms    "Refunds are processed within 30 days of the request."
/faq      "We accept Visa, Mastercard and Amex."
/checkout  (offers Visa and Mastercard only)

✅ Как надо — one value, decided once, repeated
/refund /terms /faq  "14 days" · "Visa and Mastercard"
```

Rules of reading: weeks become days; "at least 5 years" agrees with "7 years"; a value stated
beside the main one in the same statement is qualified, not a conflict ("credit refunds:
5 days; cash refunds: 5–10 days"); an open list ("euros, pounds and other currencies")
disagrees only by naming one the full list lacks; negated sentences are skipped.

Facts are **one pool across languages**: "14 days" on `/refund` against "30 jours" on
`/fr/refund` is a conflict.

A genuine per-segment difference is declared, not left to collide:

```jsonc
"content": { "policyAllow": [{ "fact": "refund window", "value": "30 days", "where": "/business", "reason": "business accounts have 30 days" }] }
```

### Numbers that disagree `[CT18]` — **note**

The same fact with different numbers across pages (refund/cancel/trial days, fees and
commission %, response hours, payout and delivery times, "N credits = $M"). Reported with both
quotes for a human; never fails the run.

### A worked example that does not add up `[CT27]`

An example that balances in credits but not in money (or the reverse) is a defect.

---

## 5. One destination, one name `[CT21]` — **hard**

### (a) Links to one page carry one label

```
❌ Нельзя — three names for /help
header  "Support"
footer  "Help Centre"
body    "see the FAQ"

✅ Как надо — the page's own name wins
header / footer / body  "Help Centre"      (the page's <h1> is "Help Centre")
```

What counts as a name: nav, footer and button links with any label; body links when the label
is a short name. **Not** names: calls to action ("Upload video"), whole sentences, card links
named by their heading, links inside a sentence, generic labels ("Learn more", "Back").
"Back to Sign in" **does** name Sign in. A label that is a word subset of another is the same
name; British/American spelling and plurals are one name.

A deliberate set is declared:

```jsonc
"content": { "labelAllow": { "/sign-up": ["Sign up", "Create account", "Get started"] } }
```

### (b) A nav label the page does not carry

A near miss of the page's `<h1>` / `<title>` ("Cookie notice" in the footer → the page is
headed "Cookie Policy") is a finding. So is a label whose words name a **different** page
better than the one it opens.

### (c) One action, one label

Buying credits (Buy credits / Top up / Add credits / Purchase credits / Recharge / Add funds)
and contacting the team (Contact us / Contact support / Get in touch / Talk to us) — on
buttons and body links. Statically, two buttons whose `onClick` opens the same thing
(`setBuyOpen(true)`) with different labels are the same defect.

### (d) The page's name in prose

What the copy calls a destination must be what that page calls itself: "download it from
**My videos**" while the page is headed "Video Library" is a finding.

### A control is not a name

A link found **on the very page it opens** is a control on that page — a status filter, a tab,
a sort order, an anchor — not a menu item naming it. Six status filters labelled "ALL 0",
"PENDING 0", … on `/admin/requests` do **not** mean the nav calls that page "ALL 0".

---

## 6. No page named that does not exist `[CT22]` — **hard**

- **(a)** A link to a path that is not a page: statically, no route, route handler, `public/`
  file or redirect source matches; on rendered pages, the request answers 4xx/5xx.
- **(b)** A document named in Title Case — "Specialist Service Terms", "Acceptable Use
  Policy", "the Help Centre", "our FAQ", also inside quotes — that no page `<h1>`, `<title>`,
  layout title or link label carries.
- **(c)** A page file whose route a redirect always catches (a dead page), and links to a
  redirected path (link the final URL).

Passes: generic phrases ("this Agreement", "Changes to This Policy"), another company's
document ("Stripe's Services Agreement", "Google Privacy Policy"), a heading that only labels
its own block. Documents that genuinely live elsewhere are declared in
`content.knownDocuments`.

---

## 7. Legal documents and the footer

| # | Rule | Tag |
|---|---|---|
| 7.1 | One document, one name: the footer label, the page `<h1>` and the `<title>` say the same thing, word for word. A multi-word mention in the text uses the same form ("Terms of Service" vs footer "Terms", "Cookies Notice" vs "Cookie Policy", "Anti-Money Laundering Policy" vs "AML Policy"). Per locale too. | `[CT15]` |
| 7.2 | A document named with and without the brand in front is two names. | `[CT15]` |
| 7.3 | "Last updated" is rendered **with** a date; one document has **one** date — not two in the page, the JSX file or the i18n namespace, and not a different date in another locale. | `[CT7]` |
| 7.4 | The © line is identical on every page — one footer component. | `[CT16]` |
| 7.5 | A policy's section numbers run 1, 2, 3 … and its contents list matches. | `[P4]` |
| 7.6 | Footer structure is fixed: brand/contact block, labelled link groups (product, company, legal), cookie control in the legal group. Links are a grid of groups, **NEVER** one flex-wrap row. | `[3.7, P36]` |
| 7.7 | The footer carries a support e-mail that can receive mail. | `[F3]` |
| 7.8 | Payment marks shown in the footer are labelled ("We accept") and are the canonical files. "The marks shown in X" — page X must actually show them. | `[F5]` |

---

## 8. E-mail addresses

| # | Rule | Tag |
|---|---|---|
| 8.1 | Every address shown (text, `mailto:`, legal pages, footer, translations, e-mail templates) resolves: never `*.vercel.app`, `*.netlify.app`, `pages.dev`, herokuapp, localhost, `example.com`, `.test`; the domain has an MX record. A network error is "could not verify", never a failure. | `[CT9]` |
| 8.2 | A visible address is inside `a[href^="mailto:"]`, and the link text matches the `mailto:`. | `[CT10]` |
| 8.3 | The address is not drawn uppercase or in small caps. | `[CT29]` |

```jsx
// ❌ Нельзя
<p>Write to support@relaygpu.vercel.app</p>
<a href="mailto:hello@acme.com">support@acme.com</a>

// ✅ Как надо
<a href="mailto:support@acme.com">support@acme.com</a>
```

---

## 9. Numbers, dates and money

### 9.1 One date format `[CT6]`

Everything on the site uses one format. Without a declared `content.dateFormat`, the site's own
formatter decides: if the code calls
`toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })`, then
"20 October 2026" **is** the format and `20.10.2026` elsewhere is the finding.

```
❌ Нельзя — four formats on one site
"October 20, 2026" · "20 Oct 2026" · "10/20/2026" · "2026-10-20T14:03:00Z"

✅ Как надо — one, everywhere
"20.10.2026"
```

### 9.2 Money formatting `[money]`

Checked in the current currency **and in every currency of the switcher**:

| ❌ Нельзя | ✅ Как надо |
|---|---|
| 3+ decimals on a price (`$0.000111`) | `Intl.NumberFormat` with the currency's minor unit, or a unit that reads cleanly (`$0.40 / GPU-hour`) |
| decimals on a zero-decimal currency (`¥1,200.00`) | `¥1,200` |
| one currency written two ways (`US$10` and `$10`; `10 €` and `€10`) | one notation |
| two decimal separators on one site (`1,5` and `1.5`) | one separator |
| 4+ digits without grouping (`10000`) | `10,000` |
| two grouping styles (`10,000` and `10 000`) | one style |
| an exchange rate with more than 4 decimals (`$1 = €0.89165`) | `$1 = €0.8917` |
| converted pack prices left dirty while the base currency's are round | round both |

### 9.3 Currency and balance `[M1, M2]`

- The currency the visitor chose applies on **every** page. A page still showing `$0.50` after
  EUR was picked is a finding.
- A product that sells **credits** shows a credit balance in the header; a product that sells
  **money** shows money. The run decides which from the amounts on the pages, not from the word
  "credit".

---

## 10. Localisation

| # | Rule | Tag |
|---|---|---|
| 10.1 | No untranslated text: a value identical to the default locale (2+ real words), English function words in another locale, Latin-only copy in a Cyrillic or Arabic-script locale, or text word for word the same as the default language's. | `[CT11]` |
| 10.2 | The browser tab is copy too: a `<title>` left in the default language is `[CT11]`. | `[6.15]` |
| 10.3 | No translation key on screen: `home.title`, `MISSING_MESSAGE`. | `[CT12]` |
| 10.4 | `<html lang>` is present and is the locale shown; `dir` is correct for rtl languages. Cyrillic text under `lang="en"` is a finding. | `[CT13]` |
| 10.5 | Key parity across the locale files of one group (plural suffixes normalised); no empty translations. | `[CT14]` |
| 10.6 | Unfinished copy at a key in **one** locale is reported at that key in **all** of them. | `[CT1]` |
| 10.7 | Terminology, labels and document names are compared **within** one language. A French label is never compared with an English one. | `[CT19, CT21, CT22]` |
| 10.8 | Navigation is checked with the **longest** supported locale: items that do not fit move into the menu, they never wrap to two lines. | `[2.5]` |

**Never treated as the site's copy:** what a user wrote (`data-user-content`, a chat log, a
quote), text kept as written (`translate="no"`, an element with another `lang`), and learned
brand words.

```jsx
// ❌ Нельзя
<html lang="en">…<p>Добро пожаловать</p>            // lang does not match the text
<p>{t("dashboard.welcome")}</p>                     // renders "dashboard.welcome"
<h1>Pricing</h1>                                    // on /fr/tarifs

// ✅ Как надо
<html lang="ru">…<p>Добро пожаловать</p>
<h1>Tarifs</h1>
<blockquote data-user-content>{review.body}</blockquote>   // never flagged as untranslated
```

---

## 11. Cross-product and misc.

| # | Rule | Tag |
|---|---|---|
| 11.1 | A product's `<h1>` must not be within one stemmed word of a sibling product's `<h1>`. | `[CT24]` |
| 11.2 | A URL on a host carrying the brand that is not the site's own domain. | `[CT25]` |
| 11.3 | 4+ like items all showing `0` for the same unit — render an empty state instead. | `[CT30]` |
| 11.4 | (soft) The same 4+ names listed in two different orders on two pages. | `[CT31]` |
| 11.5 | The payment API accepts every currency the switcher offers. | `[M3]` |

---

## 12. Review checklist

- [ ] No "yet" / "soon" / "not available" / "temporarily unavailable" copy outside empty states, the reader's own state, a running process or a transient error
- [ ] No TODO, TBD, lorem, `{{placeholder}}`, preview host, "Example profile"
- [ ] No test data: "Test User", "John Doe", `@example.com`, `0000000`
- [ ] No `[object Object]`, `NaN`, `undefined`, `Invalid Date`, stack frames, raw scores
- [ ] No trailing period in headings, buttons, nav items, `<title>`
- [ ] No em dash; no double spaces; quotes and brackets matched
- [ ] One case per heading; sentences start with a capital
- [ ] Plurals through ICU / `Intl.PluralRules` — no "1 items"
- [ ] One name per concept, per language — role, account closure, refund, card, currency
- [ ] One value per policy fact across every page and every locale
- [ ] One label per destination; the page's own name wins
- [ ] Every named document exists; every link resolves
- [ ] Legal document: footer label = `<h1>` = `<title>`; one "last updated" date; sections numbered in order
- [ ] © line identical on every page; footer has a working support address
- [ ] Every shown e-mail has MX and sits in a `mailto:` whose text matches
- [ ] One date format site-wide
- [ ] Money: ≤ 2 decimals, one notation, one separator, grouped thousands, the chosen currency on every page
- [ ] `<html lang>` matches the text; no keys on screen; key parity across locales; nav fits the longest locale
