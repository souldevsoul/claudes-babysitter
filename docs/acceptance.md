# Business acceptance

These checks come from what business QA (BQA) keeps raising on the products it reviews. The source is about 960 BQA cards filed across 23 products between 2026-09-01 and 2026-10-05, plus the BQA checklist built from them (sections 1–11, cited as "BQA n"). Each check was raised on at least two products.

## Run them

```bash
npm run test:e2e                                  # prepare (login + crawl) + UI checks + acceptance + e2e/*.spec.ts
npm run test:e2e -- --only acceptance             # this suite alone
BASE_URL=http://localhost:3000 LOGIN_EMAIL=… LOGIN_PASSWORD=… npm run test:e2e
```

`babysitter init` adds the following to a project:

- `npm run test:e2e`;
- an `acceptance` block in `babysitter.config.json`, holding the owner decisions;
- `e2e/babysitter.ts`, the helpers;
- `e2e/journeys.spec.ts`, the product's own journeys. The generator adds a test there for each user-facing feature.

Per-page checks run at 390 px and 1440 px. Site-wide checks run once, at 1440 px.

## Turning a check off

Write the check's ID into `acceptance.skip`, and the reason into `acceptance.skipReasons`. The reason is printed in the report, and a human approves it.

## When Babysitter decides a check does not apply (5.7.0)

Some checks judge first whether they apply: the site shows no credits (M2), does not claim 2FA, has fewer than 3 policy
pages (P2), no sign-in page was found (A1, FM7, FM8, FM11), no header bar was found (1.20, 3.5). Each such decision is
listed in the run summary under "Babysitter decided not to check", with the pages it applies to, and the run does not end
"Clean." while one stands. Check it by hand; when the owner agrees, approve it:

```json
"acceptance": { "notApplicable": { "2FA": "no accounts on this site", "M2 /wallet": "the balance is shown on the page" } }
```

A key is a rule ID (every page) or `"<rule> <route>"` (one page). Approved decisions are listed under "Not applicable
(owner-approved)". Missing setup (a login, a role's storage, the stage, prepare's files) is listed under "Setup missing —
the run is PARTIAL"; a login or role `babysitter.config.json` declares but the run lacks makes `e2e` exit 1.

## Stage: live or test (5.2.0)

The stage comes from the Nexus project status (LIVE = live, anything else = test): `babysitter prepare` asks Nexus
when `NEXUS_URL` and `NEXUS_API_KEY` are set (project slug: `nexus.project`, else `name`) and writes
`.babysitter/stage.json` (stage, status, and whether testCredentials exist — never the credentials). Override it
with `"stage": "live" | "test"` in `babysitter.config.json`. With no stage known, ST1–ST3 are skipped and say so.

## Owner decisions (`babysitter.config.json` → `acceptance`)

| Key | Default | Why it is a decision |
|---|---|---|
| `twoFactor` | `"required"` | 4 products |
| `footerManageCookies` | `true` | 2 products |
| `footerCurrencySelector` | `false` | 3 products |
| `paymentLogos` | `true` | BQA |
| `currencies` | `["EUR","USD"]` | BQA |
| `company` | `{name, supportEmail, number}` | BQA |
| `accountDeletion` | `true` | BQA 10 |
| `noTax` | `true` | BQA 11 |
| `forbiddenPages` | `/gdpr`, `/press`, `/currency` | 6 products |
| `auth` | detected by `init` | BQA |

## Checks

### Look and feel

| ID | Check | Sources |
|---|---|---|
| S1 | **One shape language.** On a rounded site no button, field, tab, card or badge has square corners; on a square site nothing is rounded. Attached groups are fine. The site's shape is the median radius across all pages, or `design.shape`. | 3 products |
| S2 | **One palette.** Fills, borders and text come from the theme's colour tokens. Tailwind's stock palette is not a token. | 3 products |
| K1 | **Native parts follow the theme.** A dark site declares `color-scheme: dark`. Number fields hide their spinners. Native `select`, checkbox, radio, date and file inputs are already blocked by UI check 1.1. | 2 products; BQA 9 |
| H2 | Everything clickable shows the hand cursor. | 1 product; BQA 3 |
| H1 | A card that does nothing on click has no hover effect. | 4 products |
| N1 | A sticky header stays flush with the top. | 2 products |
| N4 | The same link does not appear twice in the header or footer. Two labels do not lead to one page. | 3 products |
| N6 | Labels fit their buttons and dropdowns. | 3 products |
| D3 | The same image does not appear twice on a page. | 3 products |
| L1 | Paged card grids end on a full row. | 3 products |

### Footer

| ID | Check | Sources |
|---|---|---|
| F0 | Every page has the site footer, including sign-in and the dashboard. | 5 products |
| F1 | Legal links run Terms, then Privacy. Cookie Policy and "Manage cookies" come last. | 7 products |
| F2 | No logo in front of the © line. | 5 products |
| F3 | The footer has a company line and a support email on the site's own domain. | 6 products |
| F4 | No second currency switcher in the footer. | 3 products |
| F5 | "We accept" Visa and Mastercard, set in the site's font. | 3 products |

### Cookies

| ID | Check | Sources |
|---|---|---|
| C1 | On a first visit the banner offers Accept, Reject (or Necessary only) and Manage. Manage shows per-category toggles. | 3 products; BQA 7 |
| C2 | The banner offers Analytics or Marketing only when such scripts actually load after "Accept all". | 12 products |
| C4 | Closing the preferences closes everything; the banner does not stay underneath. | 2 products |
| C5 | Only strictly necessary cookies are locked on. | 1 product |
| ST1 | Stage live: no test or generated entity is shown (an entity named "… Test", "Demo client", a QA / example.com e-mail, a `[test]` tag, anything marked `data-test-entity`). (5.2.0) | Praxis |
| ST2 | Stage test: a test entity carries a visible marker next to its name (`data-test-entity` with text, a "Test" / "Demo" / "Тест" badge, or `stageGates.testMarker`). (5.2.0) | owner rule |
| ST3 | Stage test: the main flows can be walked — every catalog page (`catalog`, default /specialists, /experts, /catalog, /tasks …) lists an entity, one of them can be hired (an enabled Hire / Request / Book), every role has a test account and the Nexus project has testCredentials. (5.2.0) | owner rule |
| C6 | Decline / Reject really declines: the banner closes, nothing beyond what is strictly necessary is stored (cookies, localStorage, sessionStorage; `acceptance.essentialStorage` names more), no analytics host is called, and the choice persists after a reload and on the next page. (5.2.0) | Parallel |
| C7 | A link inside the cookie settings (or any open dialog) opens its page and the dialog closes; it never navigates under a still-open window. Run at one phone and one desktop width. (5.2.0) | Praxis |

### Money

| ID | Check | Sources |
|---|---|---|
| M1 | The chosen currency appears on every page, public and signed in. | 6 products |
| B2 | No "≈" approximations. | 5 products |
| B3 | No VAT or tax wording. | BQA 11 |
| B4 | Large amounts carry a thousands separator. | 1 product; BQA 5 |

### Sign-in and account

| ID | Check | Sources |
|---|---|---|
| A1 | Every password field has a show/hide eye, and Tab skips it. | 1 product; BQA 10 |
| A3 | Sign-up has one consent checkbox, linking both Terms and Privacy. | 2 products |
| A6 | The sign-in and sign-up pages have a footer. A minimal one (legal links, ©, support email) is enough; the full site footer and nav there are FM8 findings (docs/checks-forms.md). | 2 products |
| A5 | A signed-in user is never offered Sign in or Sign up, and `/login` redirects them away. | 1 product; BQA 6 |
| A7 | Tours and pop-ups show once and can be closed. | 3 products |
| A4 | Sign out works with one click, and the account stays closed afterwards. Runs last, in its own session. | 2 products |
| A9 | Account settings offer "Delete account". | BQA 10 |
| 2FA | Account settings offer two-factor sign-in (see `twoFactor`). | Owner rule |

### Pages and copy

| ID | Check | Sources |
|---|---|---|
| B1 | No build notes ("No mailbox is connected to this build", `vercel.app`, TODO) and no self-justifying copy ("we would rather", "is not a promise"). **B1 = CT1:** the phrases are the CT1 rules of `lib/content-rules.js` (one source of truth), reported by `content.spec`; B1 runs only in `e2e --only acceptance`, so a phrase is reported once. | 14 products |
| D1 | No internal link answers 4xx or 5xx. | 1 product; BQA 2 |
| D2 | `/gdpr`, `/press` and `/currency` do not exist. | BQA 1 |
| P1 | Policy text spans its column. | 3 products |
| P2 | Long policies have a sticky "On this page" that fits the screen. | 3 products |
| P3 | Pages a policy names are links. | 4 products |
| CT19 | One concept, one name: the role (specialist / expert / executor …), closing the account, refunds, card payment and currency names are not described with competing words, across pages or inside one page. Reported by `babysitter content` and content.spec (docs/checks-content.md). (5.4.0) | business QA |
| CT20 | One policy, one set of facts: refund window and processing time, account deletion, retention, accepted payment methods and currencies say the same everywhere; prices are in a currency the site offers. (5.4.0) | business QA |
| CT21 | One destination, one name: links to one page carry one label, a nav / footer label matches the page's own name, one action (buying credits, contacting the team) has one label. (5.4.0) | business QA |
| CT22 | No page named that does not exist: links go to real routes, and a document named in the copy ("Specialist Service Terms") is a page, heading or link of the site. With D1 (links that answer 4xx) and P3 (a named page is a link). (5.4.0) | business QA |

## Not automated (needs a person)

- Whether a page is needed at all, and which footer column a link belongs to.
- Pricing levels and discount steps (3 / 5 / 7 %).
- Policy depth ("as descriptive as a contract").
- Whether contact mail actually arrives.
- Copy that sounds AI-written.
- Fonts, logos and sentences shared across sibling products. The theme fingerprint registry (`babysitter fingerprint`) covers part of this.

## 5.5.0 — from the miss loop and issues #4 / #5

| ID | Check | Cards |
|---|---|---|
| P2 | contents-rail parity across policy pages (3+ sections, when 2+ policies have a rail); `-policy`, `-agreement`, `-notice` paths are policies; on phones a collapsible contents list before the first section counts when `layout.tocMobile: "collapsible"` (owner decision; a sticky bar is the default) | Parallel gjfjnc; issue #4 item 16 |
| F0 | the footer links are the same signed in as signed out, per role (links only signed-in users get are soft) | Praxis xp7pmu |
| F5 | "We accept" on the logos' line, before Visa; the marks are the studio's files (`acceptance.paymentLogoSet`, sha256) | Compass r98e7t cnfovs |
| A4 | sign out lands on `acceptance.afterSignOut` (default `/`) or a locale root; account menus (account / user / profile / avatar triggers in header, nav or sidebar) are opened first, up to 8 | Compass 3v77n0; issue #5 |
| A10 | signed-in and admin areas are not rendered to signed-out visitors or to another role | Kindred gm21xv |
| M2 | the signed-in header shows the credit balance (`acceptance.headerBalance`) | Compass gcrh4v |
| LS1 | a language offered in the switcher switches the page | Compass htmhfi |
| C1 | "OK" / "Got it" count as accept; an essential-only "OK" notice is compliant when nothing beyond the strictly necessary is stored (measured), and still needs "Manage" when the footer opens a settings window | issues #4 #5; Compass y28qwn |
| C2 | "Allow all" must allow something | Compass faefuc |
| ST3 | request-flow CTAs ("Open a case", "Start a brief with this profile"), a link into the request flow followed one step, `stageGates.hireLabel`, `stageGates.catalogRole` (walk the catalog as a QA role) | issues #4 #5 |
| M1, A1/A3/A6 | a roles-only project uses its first role's storage | issue #5 |
