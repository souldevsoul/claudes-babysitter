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
| A6 | The sign-in and sign-up pages have the normal footer. | 2 products |
| A5 | A signed-in user is never offered Sign in or Sign up, and `/login` redirects them away. | 1 product; BQA 6 |
| A7 | Tours and pop-ups show once and can be closed. | 3 products |
| A4 | Sign out works with one click, and the account stays closed afterwards. Runs last, in its own session. | 2 products |
| A9 | Account settings offer "Delete account". | BQA 10 |
| 2FA | Account settings offer two-factor sign-in (see `twoFactor`). | Owner rule |

### Pages and copy

| ID | Check | Sources |
|---|---|---|
| B1 | No build notes ("No mailbox is connected to this build", `vercel.app`, TODO). Self-justifying copy ("we would rather", "is not a promise") is reported too. | 14 products |
| D1 | No internal link answers 4xx or 5xx. | 1 product; BQA 2 |
| D2 | `/gdpr`, `/press` and `/currency` do not exist. | BQA 1 |
| P1 | Policy text spans its column. | 3 products |
| P2 | Long policies have a sticky "On this page" that fits the screen. | 3 products |
| P3 | Pages a policy names are links. | 4 products |

## Not automated (needs a person)

- Whether a page is needed at all, and which footer column a link belongs to.
- Pricing levels and discount steps (3 / 5 / 7 %).
- Policy depth ("as descriptive as a contract").
- Whether contact mail actually arrives.
- Copy that sounds AI-written.
- Fonts, logos and sentences shared across sibling products. The theme fingerprint registry (`babysitter fingerprint`) covers part of this.
