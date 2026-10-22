# Changelog

Earlier releases (4.11.1 and before) are described in the README under "What changed in …".

## 5.5.0 — issues #4 and #5 closed; every in-scope missed card is a check (2026-10-21)

The owner's decision of 21.10: before the ratchet / baseline step, close the holes, then make the tool catch every bug it
missed. (The brief named this release 5.4.0; 5.4.0 and 5.4.1 had already shipped from another session, so it is 5.5.0.)

**Catch rate, re-measured** (a card counts as caught when a check reports the defect as the card describes it, proven by
a fixture of the card as shipped; reports in `misses/kindred-2026-10-21.md`, `misses/compass-2026-10-21.md`,
`misses/praxis-parallel-deferred-2026-10-21.md`):

| product | cards | out of scope | in scope | caught by 5.4.1 / last run | caught by 5.5.0 | cannot automate |
|---|---|---|---|---|---|---|
| Kindred (all 53 cards since 08-29) | 53 | 11 | 42 | 0 by a run (12 by checks that existed but never ran there) | **39 / 42 = 93 %** | 3 |
| Compass (since 08-26, re-triaged) | 122 rows | 5 | 117 | 0 (the 4 "caught" were unrelated findings) | **109 / 117 = 93 %** | 8 |
| Compass, cards since the first babysitter run (20.10) | 31 | 2 | 29 | 0 / 29 | **28 / 29 = 97 %** | 1 |
| Praxis + Parallel, the 34 rows 5.3.0 deferred (incl. the 9 Helena items) | 34 | 0 | 34 | 1 (CT21, 5.4.0) | **33 / 34** | 1 |

Rows that cannot be checked automatically, and why:

| card | product | what | why not |
|---|---|---|---|
| 2jhzy1 | Kindred | AI match explanation names initials next to anonymous handles | the text exists only after a real POST to the matcher (AI output); judging "N.R." as a leaked identity needs meaning |
| m87322 | Kindred | task page: narrow frame, small chat | a narrow frame is a legitimate choice elsewhere; no threshold without an owner layout decision (taste) |
| qvarju | Kindred | after onboarding, "Become a Partner" offered again | exists only right after a real onboarding in the same session (stale role in the JWT) |
| qr60yb | Compass | "Find a match" always errors | a server failure on a real POST; `states.allowPost` would show the error state, the cause is backend |
| 64fac9 | Compass | wallet history says "Custom Task" | needs a real hire to create the transaction row |
| cwyzwv | Compass | hired for a service only another specialist offers | backend data integrity after a real hire |
| xluiul, bgp3u0 | Compass | brief template validation by its brackets | product-specific template semantics |
| 17s9ne | Compass | brief to a preselected specialist shows "Finding matches" | judging that a status contradicts the flow's intent, after a real submit |
| awyi64 | Compass | a failed applicant sees "pending" | needs a fresh account failing the quiz, then a judgement of meaning |
| xnahco | Compass | "TRIAL PASSED 80 %" next to "You need at least 60 %" | needs passing a real quiz |
| 2s63fa | Parallel | after creating a task the mobile shortlist sits left | exists only after a real brief POST creates a task; the layout rule (2.12) catches it on any list it can reach |
| af1p4q (half) | Compass | "upload always fails" | needs a real upload; the missing formats / size hint is FM15 |

**Issue #4 (onboarding Kindred) and #5 (Compass): every item closed** (`test/issues-550.test.mjs`, `test/issues-550-browser.test.mjs`, each from the real case):
- **A run whose signed-in pages were never reached fails.** `init` writes `login.url` from the sign-in route it detects
  (it wrote `acceptance.auth.signIn` and left `login.url` empty, so every role was skipped with "no login.url" while the
  run summed up as normal); `prepare` falls back to `acceptance.auth.signIn` for older configs. When roles, `LOGIN_EMAIL`
  or `SESSION_COOKIES` are configured and not one signed-in page is reached, `prepare` exits 1 with "NO SIGNED-IN PAGE WAS
  REACHED" and each role's reason; a role that did not sign in makes `e2e` partial and exit 1 ("SIGNED-IN PAGES NOT
  CHECKED for …"), never "Clean.". `BABYSITTER_SIGNED_OUT=1` says a signed-out run is meant.
- **The vendored copy stays out of the product's `tsc` and `eslint`.** `init --vendor` and `update` add
  `tools/claudes-babysitter` to tsconfig `exclude` (JSONC with comments kept; `node_modules` kept when there was no
  exclude) and an `{ ignores: ["tools/claudes-babysitter/**"] }` entry to a flat ESLint config (`export default [...]`,
  `defineConfig([...])`, `tseslint.config(...)`, `const x = [...]; export default x`), `.eslintrc*` ignorePatterns and
  `.eslintignore`; what it cannot edit it says. Proved with the real `tsc -p` and `eslint .` on a Next-style project
  (without the exclude, `templates/e2e/journeys.spec.ts` of the copy breaks a Next tsconfig).
- **`--quick` and `--project` runs check page states at phone width.** The states / scroll suite runs at the narrowest and
  the widest viewport of the run; a run narrowed with `--project` (mobile-390 + desktop-1440, as sharded runs do) still
  took 360 from the full list, so the phone states never ran. `e2e` / `test-ui` pass the selected projects
  (`BABYSITTER_PROJECTS`) and the specs pick from those.
- **`update` asks the remote.** It always runs one `git ls-remote` — never the 12-hour version-check cache, never a
  `BABYSITTER_LATEST` pin — refreshes the cache with what it saw, says the tag it saw ("asked just now"), and a `--to`
  tag that is not on the remote says so ("not pushed yet?").
- **`misses` writes into the product, not into the copy**: from `tools/claudes-babysitter` or
  `node_modules/claudes-babysitter` reports go to `.babysitter/misses/` (gitignored); the tool's own repository keeps
  `misses/`.
- **A timeout is not a finding.** A test that only ran out of time (`Test timeout of …ms exceeded`, a teardown that ran
  out, a page closed by the timeout) is listed as "Not tested — time budget" and kept out of `findings.json` and
  `fix-plan`; a real failure that also timed out stays a finding.
- **Robustness:** `e2e` (and its `prepare`) run Playwright asynchronously and pass SIGTERM / SIGINT / SIGHUP / SIGALRM on;
  a second signal or 15 s kills the child; no orphaned Playwright with its browsers.

False alarms fixed:
- **CT2** a message is an input hint by its use: a key only ever shown as `placeholder={t("…")}` (Kindred
  `auth.astronautEmail = "you@example.com"`) is no longer test data; the same address shown as text still is.
- **CT2 / CT9 / CT10** the signed-in test account's own address: every configured account (`LOGIN_EMAIL` and each
  `roles[].env.LOGIN_EMAIL`) is the user's own on a signed-in page (Kindred / Compass /settings).
- **`ui/overlay-motion`** follows a lookup map: `className={cn(DIALOG_MOTION[variant], …)}` reads every entry of the
  const object (also `as const` / `satisfies` / typed); a map without motion still fails (Kindred dialog.tsx).
- **1.19** "dark page" is judged from the painted top-level surface (the opaque box spanning the width under a few points
  of the screen), not `<body>`: a leftover dark root theme under a cream page is a light page (Kindred).
- **ST3** "Open a case" (Kindred), "Start a brief with this profile" (Compass) and other request-flow CTAs are hire steps;
  a link into the request flow (`/request`, `/brief`, `/hire`, `/book`, `/order`, `/checkout`, `…/new`) is followed one
  step; `stageGates.hireLabel` adds a product's own wording; `stageGates.catalogRole` walks the catalog as a QA role when
  test entities are shown to QA viewers only (owner decision 20.10).
- **C1** "OK" / "Got it" / "I understand" count as the banner's accept (Compass: "OK" + "Manage"); a notice with only
  "OK" on a site that stores nothing beyond the strictly necessary before or after it is compliant (Kindred) — measured:
  storage and analytics requests; if more is stored the notice needs Reject. An "OK" of an ordinary dialog is not a banner.
- **FM1** a range "15 to 34" / "€1 – €500" counts as the hint, and so does the text the field names with
  `aria-describedby` (Kindred IBAN; the static `ui/numeric-input-bounds` already accepted "1 to {max}").
- **CT11** what a user wrote is shown back as written: `[data-user-content]`, chat logs, quotes and text kept with its line
  breaks (`white-space: pre-wrap`) are not untranslated copy (Compass /dashboard/tasks [kk]).
- **M1, A1/A3/A6** a roles-only project (no `LOGIN_EMAIL`) uses its first role's storage instead of crashing on
  `storage.json` (ENOENT); the product's `user` fixture too (Compass).
- **A4** account menus first: triggers labelled account / user / profile / avatar in the header, nav or sidebar are opened
  before the other menus, up to 8 (Compass: the avatar dropdown came after the language and currency switchers).

Misses of issue #5:
- **A — CT1 in English**: "not switched on yet", "not yet enabled / activated / connected", "once / until / when (card)
  payment(s) / checkout / payouts / top-ups … is live / switched on" (and ru / az / kk equivalents); "Once your profile
  is live" passes. **The same message in every language:** unfinished copy found at a key in one locale is reported at
  the same key in each other locale (Compass: caught in az "hələ aktiv deyil", missed in en). A text left in English in
  another locale is not a source.
- **B** see `--project` above. **C** `states.wallet: false` opens the top-up / checkout dialog and measures it (every
  non-GET request is aborted anyway); nothing inside it is pressed.

**Every missed card a check** — six areas, each card pinned by a fixture named after it (bad fails, the fix passes,
look-alikes stay quiet; `test/misses-550-{layout-a,layout-b,content-a,content-b,money,states}.test.mjs`). Per-check text
and the cards behind each id: the 5.5.0 sections of docs/checks-layout.md, checks-content.md, checks-run.md,
checks-forms.md and acceptance.md.
- **Rhythm** (`playwright/checks/rhythm.js`): 2.5 a money range split at its dash (every currency and language), heading
  breaks and balance, the wordmark on one line; 2.6 one slot wraps in a row of equals, stacked phone buttons of one width,
  dividers that follow the stacking; 2.7 marker / badge level, side nav vs content top, fields of a row share a top; 2.11
  glyph overlap on the whole page; 2.12 key–value rows; new 2.17 one content width, 2.21 squeezed text, 2.22 two-column
  blocks share one rule, 2.23 even rhythm; 6.5 heading alignment per page.
- **Boxes, icons, header, brand** (`playwright/checks/boxes.js`): 2.14 cell spill and icons cut / squeezed; new 2.18
  rounded box that scrolls, 2.19 empty box that scrolls, 2.20 sideways scroll over nothing, 2.24 icon gap; 1.6 hover edge;
  1.11 one brand mark (footer, favicon, manifest); 1.20 header faces and popular-badge placement; new 1.21 one accent,
  1.22 sibling parts (soft); 3.5 desktop header shows its nav (`layout.desktopNav: "menu"`); new 3.10 burger repeats the
  nav; 6.5 h1 case and heading accent; 6.9 one focus ring; new B5 custom amount tile.
- **Site-wide copy** (lib/content-consistency.js, lib/content-site.js): CT19 loanword spelling per language and the
  handover verb; CT20 recourse after acceptance, who sets the task list, what the site stores, minimum age, closed payment
  lists vs the checkout, refused countries offered; CT15 brand prefix, lower-case and qualified document names; CT21 the
  page's own name is the suggested label; new CT23 promises backed by the policies, CT27 worked examples add up, CT31 one
  order per list (soft), F5 "marks shown in X", M3 the payment API accepts every switcher currency.
- **Copy rules** (lib/copy-rules.js, playwright/checks/copy.js): CT12 path labels; new CT24 near-copy of a sibling
  product's headline (`~/.claudes-babysitter/copy.json`), CT25 brand URL on another host (`content.ownDomains`),
  CT26 slugs as names, CT28 heading case and acronyms, CT29 e-mail case, CT30 a catalogue of zeros, 6.15 one `<title>` per
  page, P4 numbering vs contents; CT8 sentence capital and count placeholders; CT3 raw scores and fetch / JSON errors.
  The copy rules now run in every state of the states run.
- **Money and acceptance** (`playwright/checks/money.js`): B4 the stated rate reproduces the prices, the calculator
  follows its label, a bracket does not repeat its amounts, unconverted amounts after a switch, one price per pack across
  pages and the top-up dialog, one unit per rate, one number grouping per state (credits included), x.10–x.90 tails are
  round; 2.14 a placeholder cut by its field; P2 rail parity; F0 footer parity per role; F5 label line and the studio's
  logo files; A4 lands home; new A10 closed signed-in areas, M2 header balance, LS1 the switcher switches; C1 Manage when
  settings exist; C2 Allow all that allows nothing. `WALLET_RE` matches Cyrillic labels; a segmented currency row is
  found before a dropdown; a guessed locale prefix that answers 4xx is not "verified".
- **States, links, forms, crawl** (playwright/checks/run.js, forms.js, prepare.mjs): 1.9 and 2.7 (dialog axis) in every
  state; new 3.9 a selection's result opens on screen, 6.14 a button does something, `states.allowPost` for read-only
  result screens, the wizard ticks the group a step asks for; new 4.5 a card's action carries its card, J1 a CTA carries
  its context, J2 a guest's choice survives sign-in, D4 a page loads without a data error; FM1 stated bounds, FM3 HTML
  error reply, FM4 no request / outcome contrast, FM13 prior text, new FM14 phone, FM15 file; new COV1 the crawl opens the
  repo's unlinked static routes (`crawl.unlinked`, `crawl.unlinkedMax`).
- Fixed on the way: CT19 / CT20 / CT7 site-wide findings were reported only when CT21 or CT22 was on (a comment had
  swallowed a closing brace).

**Issue #4 items 13–17** (added during this round): 1.3 / 1.16 count a select trigger with the fields; 2.7 skips a column
whose content is a sticky contents list; 6.12 judges toggling back on what the click opened (not the page's re-render
after "Manage cookies"); P2 accepts a collapsible contents list at the top on phones (`layout.tocMobile`); 3.5 takes
the longest matching prefix as the current section.

**Not done here, on purpose:** products are not updated (the coordinator rolls 5.5.0 out). Checks with the highest
false-alarm risk on real sites — 6.14 dead buttons, 3.9 selections, 4.5 card actions, 2.21–2.23 — can each be switched
off (`states.deadButtons`, `states.selections`, `acceptance.skip` / the check id); the first rollout run should be read
by eye. Live probes on Compass and Kindred public pages (/, /pricing, /specialists, /about at 390 and 1440) tightened the
rhythm and boxes rules; what they still report looks real (Compass stat rows wrapping their price band, stacked hero CTAs
of different widths, `.fg-plate` cards lifting on hover; a squeezed icon on Kindred /pricing at 390).

## 5.4.1 — page names the copy uses, redirects, package mode on Node 26, husky (2026-10-21)

Two copy problems 5.4.0 missed on a product, and two problems of products that install the tool as a package.

**CT21: a page's name in the copy.** A dashboard page called itself "Video Library" (sidebar label, layout title,
`<title>`) while 15 places in the copy, the emails and the user menu sent readers to "My videos" ("download it from
My videos"). 5.4.0 compared only labels of one href, and the menu item pointed at the wrong href (/dashboard), so no
two labels met. New:
- each route's own names (its `<h1>`, layout title, `<title>` without the brand part, the nav / sidebar label of the
  links that open it) against the names prose, locale strings and **email templates** give it as a destination
  ("from My videos", "in your Video Library", "open Settings"): a name that is not the page's is reported at every place,
  with "write the page's name there, or rename the page everywhere". Codes ("in USD"), a contract's defined terms ("the
  Service"), extra words ("your Account Settings" for "Settings") and names that go on in lowercase ("Back to Sign up")
  pass;
- a menu label whose words name another page better than the one it opens ("My videos" → /dashboard while
  /dashboard/videos exists) says which href to use;
- email templates are copy now: `*email*` modules (also under services/), `emails/`, `mail/`, `notifications/`, and
  `.html` / `.mjml` / `.hbs` files; an HTML string is split into its texts (for every content check).

**CT21 / CT22: redirects.** `next.config.(js|mjs|cjs|ts)` `redirects()` / `rewrites()` and `vercel.json` are read
(path-to-regexp sources such as `/:locale(en|fr)?/docs`, `:path*`, hops; conditional `has` / `missing` rules and
`headers()` are not redirects). New: **CT22** a page file whose route a redirect always catches is reported as dead
(never rendered), and a link to a redirected path ("link /help directly"); **CT21** links are grouped by where they land
(a /docs link that redirects to /help is one of the names of /help), and two links in one nav / footer group that land
on the same page are reported ("Docs" /docs → /help next to "Help centre" /help). On rendered pages the run asks each
linked path once (`maxRedirects: 0`); a locale prefix or the sign-in gate is not a moved page.

**Package mode on Node 26 (blocker).** Installed as a dependency, `babysitter e2e` / `test-ui` never ran on Node ≥ 23.6:
Playwright loaded `node_modules/claudes-babysitter/playwright/playwright.config.ts`, Node refused to strip types under
node_modules (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING), and the summary only said "No report". The Playwright config
and every spec are plain ES modules now (`playwright/*.spec.js`, `playwright.config.js`; nothing the package ships is
TypeScript but a `.d.ts`). A run that stops before Playwright writes its report (the report file did not change) exits
non-zero with "Playwright stopped before it wrote a report — nothing was checked" instead of summarising nothing, or
the previous run. `prepare` and `micro-check` (the Stop hook's rendered check) load no TypeScript and were not
affected. `test/package-mode.test.mjs` copies what `npm pack` ships under a project's node_modules and runs `e2e` there
against a local site.

**Typed fixtures.** `playwright/fixtures.d.ts`: a strict TypeScript project compiles `e2e/babysitter.ts` (which
re-exports `fixtures.js`) and its specs — no TS7016, `test` knows the `user` fixture.

**husky.** With `core.hooksPath` on husky's stubs (v9 `.husky/_`, v4–8 `.husky`), the wiring check (doctor, init,
the e2e banner) read the stubs and reported the git gate, post-merge and post-rewrite as missing although the lines
were in `.husky/<name>`. It now reads the script husky runs, and `install-hooks` / `init` append the babysitter lines to
`.husky/<name>` once (the team's commands stay, a husky stub is never edited). `test/husky.test.mjs` (v9 and v8, a real
commit through the stub).

Verified read-only on three products: on the product the feedback came from (copy fixed since), three page files
that redirects make dead are left (real); on two others the new checks add one finding (a page named in a "Back to …"
label that differs from the page's own heading and menu label, real) and no false alarm.

## 5.4.0 — one name per concept, one set of facts per policy, one label per destination, no page named that does not exist (2026-10-21)

Business QA feedback on a product: texts had no common denominator — the same thing was described differently between
pages and inside one page (card payment, refunds, account deletion, prices in different currencies, the role
"Specialist / Expert / executor"), buttons and pages were named differently in different places, and the copy referred
to pages that did not exist ("Specialist Service Terms").

**What existed before, per class:** CT17 enforced a configured `content.glossary` per string and listed mixed
Sign in / Log in, Sign up / Register, email / e-mail (buttons and links, rendered only, a note); nothing found competing
words for one concept on its own. CT18 compared numbers next to a keyword across rendered pages (refund days, fees …)
as a note: no payment methods, no currencies, no clocks told apart, nothing in the source. CT15 kept one name per
*legal* document (footer = `<h1>` = `<title>` = mentions, rendered only); acceptance N4 flagged two labels for one page
inside one header or footer; nothing compared labels across pages or a nav label with an ordinary page's heading, or
labels of one action. D1 found links that answer 4xx (rendered, acceptance) and P3 named pages that are not links;
nothing found a link to a path that is not a route in the source, nor a document named in the copy that the site does
not have.

**New checks** (hard; `babysitter content` over the source — every locale's messages, JSX, copy kept in code, link
objects followed through their translation keys, the app routes — and the site-wide test of `e2e --only content` over
the crawl; lib/content-consistency.js holds the rules both use, lib/content-site.js reads the source):
- **CT19 `content/term-drift`** — one concept, one name, per language: the role (specialist / expert / executor /
  freelancer / professional / contractor / pro; translator / reviewer where hired or assigned), closing the account,
  refunds (money back, reimbursement, return of funds; a chargeback only where the shop says it issues one), the card
  (credit / debit / credit or debit / bank / payment card), currency names in prose (USD / dollars, EUR / euros,
  GBP / pounds / sterling); French groups for the role and closing the account. The dominant name (the glossary's
  preferred term, else the most used), every place of the others, "replace X with Y". Config: `content.termGroups`,
  `content.termAllow`; glossary-banned variants stay CT17's.
- **CT20 `content/policy-conflict`** — one policy, one set of facts: refund window, refund processing time and the
  statutory withdrawal period told apart, account deletion time, retention per kind of data, accepted payment methods,
  currencies offered, billing currency, prices in a currency the site does not offer (`content.currencies` /
  `acceptance.currencies`). "At least 5 years" agrees with 7; an open list ("euros, pounds and other currencies")
  disagrees only by naming one the full list lacks; two values in one statement are qualified. `content.policyAllow`.
  On rendered pages CT18 leaves refund and retention numbers to CT20.
- **CT21 `content/label-drift`** — one destination, one name (links to one page with different names across the site;
  `content.labelAllow`), a nav / footer label that is a near miss of the page's own name ("Cookie notice" → "Cookie
  Policy") or names a page what another link calls a different one, one action with one label (Buy credits / Top up /
  Add credits …, Contact us / Contact support …, and statically buttons whose onClick opens the same thing).
- **CT22 `content/missing-page`** — links to a path no route, route handler, `public/` file or redirect serves
  (statically; on rendered pages D1 reports 4xx in a full run, CT22 with `--only content`), and documents named in
  Title Case ("Specialist Service Terms", "Acceptable Use Policy", "the Help Centre", "our FAQ", also in quotes) that
  no page heading, title, layout title or link label carries. `content.knownDocuments`.

Output: each place to change is a file:line problem; `babysitter content` ends with "Site-wide copy (CT19–CT22)", one
entry per concept with the dominant variant, every variant's places and the fix; `--format json` carries the groups
(`consistency`); on rendered pages one finding per concept, so `fix-plan` keeps one item per cause.
`babysitter check --changed` reports a new minority term / value / label on a changed line only (the base version's
marks are counted, so old drift on a line touched for another reason is not new). The admin area is left out
(`content.consistencyAdmin: true` checks it), `content.consistencyIgnore` leaves files out.

**CT8 French typography:** a space, U+00A0 or U+202F before ? ! : ; is right in `fr` / `fr-*` (message files, `<html
lang="fr">`, an element's `lang`) and no longer fails; a missing one in a French sentence is a soft note (`(check)` in
`babysitter content`, "check by eye" in the run). The rendered rule follows the page's language now (it used none).

**Measured on three real products (read-only; the source, and one product's rendered pages on its dev server):**
every hit was inspected by hand and the rules tuned until the remaining ones were real.
- A Next 14 + next-intl product (en, fr): 3 static findings, all real — a "Closing Your Account" heading in one
  policy while every other place says delete (CT19); a user-menu item named "My videos" that opens /dashboard, which
  the button and the page call "Dashboard" (CT21); "Contact us" vs "Contact support" for one action (CT21). The
  rendered pass also found a footer "Docs" link opening a page headed "Help Center" while another footer link of that
  name opens /help (CT21). CT8: its French "Combien puis-je recharger ?" strings no longer fail (6 false failures in
  5.3.1), and no French spacing notes remain.
- A marketplace (en, az, kk): 16 findings — "expert" 6× against "specialist" 157×, "money back" next to "refund",
  EUR / USD named both ways in prose, currency lists that disagree (one adds two currencies the main list lacks), a
  refund window of 14 days in one place and 30 in six, three names for one dashboard page, Sign In vs Log In, a nav
  call to action vs "Create an account", AML Policy vs Anti-Money Laundering Policy, Add credits vs Top up, and a
  "Specialist Agreement" the onboarding asks people to accept that no page carries (the feedback's exact class).
- A second marketplace: 11 findings — "executor" 5× and "expert" 7× against "specialist" 73× (the feedback's exact
  case), close vs delete account, prices in € and in $ for the same credits, several pages reached under two names.

**Known false positives / limits (left as they are):** a call to action in the nav or footer ("Get started", "Browse") counts as a name for its page — accept it with `content.labelAllow`; currency naming
(USD vs dollars) also fires on developer-facing copy that lives in the message files; the role group cannot tell two
real roles that share a word apart (a reviewer who is staff vs a reviewer who is hired) — `content.termAllow`; static
labels built from values (`{count} credits`) and dynamic hrefs are skipped, so drift there is found only on rendered
pages; CT20 reads English sentences only and does not compare a month with 30 days; CT21 and CT22 compare English
labels and names only (other languages: CT19 and the French spacing rule).

Tests: `test/content-consistency.test.mjs` (15 cases: every rule's catches and look-alikes, cross-rule cases, the
fixture Next.js app `test/fixtures/content/site`, `check --changed`), a routed fixture site in
`test/content-runtime.test.mjs`, the content-lint fixture's two dead links.

## 5.3.1 — the upgrade runs on deskhand, proxy and tandem: three false alarms fixed, the closed password reset named (2026-10-21)

deskhand, proxy and tandem moved from 4.11.1 to 5.3.0 with `babysitter update` (their 4.11.1 copies' lock file was out
of sync, so `npm ci --prefix tools/claudes-babysitter` failed; 5.3.0's installs). Each ran `e2e` against production
at 390 + 1440, the old copy and the new one on the same pages (deskhand: all 19 public pages; proxy and tandem: 8):
failing tests 39 → 92 (deskhand), 60 → 79 (proxy), 59 → 70 (tandem). The new ones come from 5.x checks the 4.11.1
copies never had; most are real:
- password reset by email is closed on all three (deskhand / proxy: "closed right now… write to us"; tandem: "can't
  send email yet") — FM7; the products wait for an e-mail provider, so it is known, but no user can reset a password;
- the sign-up e-mail field has no `autocomplete="username"` on all three — FM11 (the Praxis autofill bug);
- the full site footer on sign-in / sign-up / reset on all three — FM8;
- deskhand: the footer wordmark is not a link (1.11, one cause on every page), Reject is not remembered after a reload
  (C6), an ISO date in a legal page (CT6);
- proxy: a failed sign-in (500) says nothing and keeps the password (FM3/FM4), buttons pill on some pages and rounded
  on others (1.20), no apple-touch-icon (6.11);
- tandem: headings that end with a period (CT4), a country option cut with an ellipsis (2.14).
deskhand's CT8 hits ("…under the .") come from the company-details placeholder, which is an owner decision for now.

Fixed false alarms (fixtures in `test/misses-521.test.mjs`):
- **3.6** an auth page's minimal header (the logo and "Back to home", which FM8 asks for) no longer has to stay on
  screen: there is no navigation to keep in reach (deskhand, proxy: /signin, /signup, /forgot-password).
- **1.11** a photo is not the logo: an image cropped to fill its box (`object-fit: cover`) or taller than 160px, and
  "brand" in an image's file path (`/brand/r4/assistants.webp`), no longer make a logo candidate (proxy home).
- **FM7** names a reset page that says reset by email "is closed", "can't send email" or "write to us from the contact
  page" as not available, instead of "no email field".

Still reported, to look at by eye: 2.7 near-miss alignment and 1.6 hover on select triggers (soft checks), 6.5 heading
looks per level, 1.2 contact topics in a deliberate order (proxy, tandem), deskhand's /faq accordion regions measured
above the screen (1.2), tandem /terms contents links measured before the scroll settled (3.8), proxy "One credit is
$0.112" (money: a unit price with 3 decimals — `layout.rateDecimals` covers rates, not this).

## 5.3.0 — copies do not fall behind: `babysitter update` and the version check; catch rate over every card: Praxis 0/38, Parallel 0/23 (2026-10-20)

**Catch rate, every card** (`babysitter misses`, cards since 2026-10-16, suggested buckets — a person confirms them in
`misses/labels/*.json`): **Praxis 0/38** (92 cards: 38 missed, 54 out of scope), **Parallel 0/23** (63 cards: 23
missed, 40 out of scope). 5.2.0 measured 0/30 and 0/19 on the cards Nexus listed through an API key (only those with a
severity); souldevsoul/nexus#1 is deployed now and `?all=1` lists every card, so 40 more Praxis cards and 16 more
Parallel cards of the round were classified — all of them Helena's voice-review cards, most of them design decisions.
The 12 in-scope ones: 3 are checks in this release (2.15, 2.16, 6.13, `test/misses-521.test.mjs`); 9 are listed in the
reports with the reason (fonts per header row, a timeline marker level with its label, side-nav vs content top,
one label wrapping in a row of equal cards, a badge level with its label, heading alignment per page, one content
width per page, a success message dressed like plain text). The heuristic matched 6 Praxis and 12 Parallel cards to a
finding of the last run; none was the defect the card describes (a hover finding on the same list, a pagination
finding on the same route, a timeout) — the labels say so. Reports: `misses/praxis-2026-10-20.md`,
`misses/parallel-2026-10-20.md`.

**New command: `babysitter update [repo]`** — re-vendors the latest release tag (or `--to vX.Y.Z`) into
`tools/claudes-babysitter`: files the release added, changed or removed, the same files `init --vendor` copies, the
copy's `node_modules` refreshed with npm install. A pinned devDependency (`github:…#vX.Y.Z`) gets its pin moved.
`babysitter.config.json`, `.babysitter/` (findings, baseline, state), allowances, the product's e2e, hooks and
CLAUDE.md are not touched. It prints the release notes since the old version (CHANGELOG.md, and the README's "What
changed in …" for releases before 5.0.0), refuses to overwrite uncommitted edits inside the copy (`--force`), and adds
the version check to the CI workflows `init --ci` wrote before (once, after the step that installs the copy).
`--dry-run`, `--no-install`, `--brief`. `test/update.test.mjs` runs it against a local upstream with release tags.

**New command: `babysitter version-check`** — the product's copy (vendored, installed or pinned) against the latest
release tag on GitHub (`git ls-remote`, cached 12 h; `BABYSITTER_LATEST` pins it): a patch behind is a note, a minor
behind warns, **a major behind fails** (exit 1, `::error` under GitHub Actions); offline is a note, never a failure.
It runs in the CI templates `init --ci` writes (PR gate, after-deploy run, package-mode gate), after `babysitter
check` (a major behind fails the check; `--format json|agent`, `--file` and `BABYSITTER_NO_VERSION_CHECK=1` leave it
out — the editor hooks call ui-check directly and never ask the network), and in the new **`babysitter doctor`**
(what is wired and what is not, then the version line). The wiring banner names a CI without the version check.

**New checks** (`playwright/checks/details.js`, `docs/checks-details.md`, every route and viewport):
- **2.15 a shadow is not cut off by a box that clips** — a card shadow that shows on one side and is cut on another
  by an ancestor with overflow hidden / clip (or an `auto` axis that does not scroll). Hard from 12px cut, smaller
  cuts are "check by eye". (Praxis /dashboard tiles: the column is `overflow-hidden`.)
- **2.16 a pinned panel's scroll box ends on the screen** — a sticky / fixed panel whose scroll box ends below the
  screen while pinned: its last items can never be shown. (Praxis /specialists skill-area list.)
- **6.13 a link in a sentence is not marked by colour alone** — WCAG 1.4.1 (F73): no underline, border, fill, weight
  or icon, and within 3:1 of the text around it. (Praxis cookie banner "Cookie Policy".)

Live, public pages at 1440 and 390 (Praxis /, /specialists, /pricing, /contact; Parallel /, /pricing, /about; vertex,
truelogos, sprout, deskhand, proxy, tandem): 2.15 and 2.16 stay quiet (the Praxis tiles and skill-area list are fixed
on the site, the fixtures keep them); 6.13 finds the Parallel cookie banner's "Cookie Policy" (font-medium
text-primary, 2.87:1 against the sentence — the Praxis card's defect, still live on Parallel). Its first pass also took
the footer brand names of truelogos, deskhand and proxy (an `inline-flex` text logo beside its tagline) for links in a
sentence; a link laid out as a box of its own is now left alone, with a fixture.

**False alarms on the products moving from 4.11.1** (found by the upgrade runs, each with RuleTester cases):
- **FM5 `ui/mutation-refreshes-ui`**: a send-only endpoint (forgot / reset password, resend code, contact) whose
  handler shows a done / sent notice is not stale UI — the notice is the update (deskhand forgot / reset password,
  tandem forgot, verify-email, confirm-email). A data endpoint with only a "done" flag still fails.
- **FM1 `ui/numeric-input-bounds`**: a change handler that keeps digits only and caps the length
  (`.replace(/\D/g, "").slice(0, 3)`), a card number capped in its handler, the kit's `invalid={…}` on a digits-only
  field, and a range written in the field wrapper's label or hint ("1 to {max}", "From … to …") are bounds (deskhand
  card number, hours, refund credits, top-up amount; proxy card number; tandem partial refund). A cap without the
  digit filter, or digits without a cap, still fail.

## 5.2.0 — the miss loop: catch rate 0/30 on Praxis, 0/19 on Parallel; 24 of the 49 misses are now checks (2026-10-20)

**Catch rate** (`babysitter misses`, cards since 2026-10-16, suggested buckets — a person confirms them in
`misses/labels/*.json`): **Praxis 0/30** (52 cards: 30 missed, 22 out of scope), **Parallel 0/19** (47 cards: 19
missed, 28 out of scope). No card of the round had been reported by a run before it was filed. The rate covers the
cards Nexus lists through an API key (the ones with a severity); souldevsoul/nexus#1 lists the rest. Reports:
`misses/praxis-2026-10-20.md`, `misses/parallel-2026-10-20.md`. 24 of the 49 missed cards became a fixture and a check
in this release (`test/misses-520.test.mjs`, 22 fixtures: every one fails on 5.1.0 except the look-alike control); the
other 25 are listed in the reports with the reason and the round they belong to (policy contradictions, currency and
cookie-banner coverage are brief §4).

**New command: `babysitter misses`** — people's Nexus cards for each adopted project (`misses/projects.json`) since
the last run (`misses/state.json`), Admin and "QA · …" deploy cards left out, each card CAUGHT (the last run's
`findings.json` reported it) / MISSED / OUT OF SCOPE, written to `misses/<product>-<date>.md` with the catch rate
CAUGHT / (CAUGHT + MISSED). A heuristic or an LLM may suggest the bucket; the file marks it "suggested — needs human
confirm" until the labels file says `confirmed: true`. Needs `NEXUS_URL` and `NEXUS_API_KEY`; the key is never printed.

**New: stage — live or test.** `babysitter prepare` reads the Nexus project status (LIVE = live, anything else =
test) into `.babysitter/stage.json`; `"stage"` in `babysitter.config.json` overrides it. ST1 (live): no test or
generated entity is shown. ST2 (test): a test entity carries a visible marker ("Test profile", `data-test-entity`).
ST3 (test): the catalog lists an entity, one can be hired, every role has a test account (`test/stage.test.mjs`).

Why the old checks passed, and what changed:
- **2.14 text is shown in full (new, `playwright/checks/fit.js`).** 2.1 called anything cut by `body { overflow-x:
  hidden }` or a full-width `overflow-x-hidden` page root "decorative bleed"; 2.10 measures controls, not a price or a
  label; N6 looked for an ellipsis in buttons only. Now the glyphs are measured: cut by the screen edge or a clipping
  box, hidden below a screen-tall fixed panel that does not scroll, spilling out of their button / badge / card, a
  list option truncated. Page, every language, every state. (Praxis: hero CTA in az/kk, close-band CTA, task header
  price, status timeline, "Azərbaycan…", /contact topic list; Parallel: the Task Details drawer.)
- **2.5** also measures short plain labels: "Səhifə 1 / 2" and "ТАПСЫРМА" were `<span>`s, never candidates.
- **3.8 / 4.4 an in-place step opens at its top.** The states run judged only a new h1–h4 against the window. Now the
  changed region's top is measured in its own scroll box (a dialog that scrolls itself), re-found after React replaces
  it, Back is pressed once, a Next that waits for an option gets one, and a form whose first button is Back is walked.
  (Praxis brief wizard and task-board pager, Praxis onboarding, Parallel /onboarding Back / Continue.)
- **3.5** the open mobile menu: an item nothing can scroll to is hard (scrollIntoView also scrolls an
  `overflow: hidden` panel, which a finger cannot). (Parallel signed-in menu.)
- **A4 sign out**: it was skipped on every run of a role-based project (it needed `LOGIN_EMAIL`); it now signs in with
  the first role's credentials, presses the confirmation (a dialog or a /logout page), and checks the host. The
  signed-in acceptance and forms suites use a role's storage when there is no default one. (Parallel.)
- **C6** Decline really declines and is remembered; **C7** a link in the cookie settings opens its page and closes the
  window. C1 only checked that a Reject button exists. (Parallel, Praxis.)
- **FM11** autocomplete: a sign-up with a name and an e-mail before the password needs `autocomplete="username"`.
  **FM12** one failed submit, one error (not a toast and an inline message). **FM13** success does not wear the
  error's look. (Praxis login autofill, Parallel login errors.)
- **1.20 one look per role across pages (new, `playwright/checks/looks.js`).** 1.17 compares each piece with the site's
  median as square / rounded, and skipped a badge with a dot; 1.3/1.16 count filled buttons and cards only. Now
  buttons, chips, badges, cards and inputs are compared page by page: square here, round elsewhere is hard; rounded vs
  pill, a change of case and a radius more than 4px apart are soft. (Parallel How It Works, Pending tag, square frames.)

Live, narrow runs of the new and changed checks (Praxis and Parallel production, 360 + 1440, signed in as the QA
account): the real defects of the round were already fixed on both sites, and the checks stay quiet on them; they
found what was still there — Parallel /register has no `autocomplete="username"` (the Praxis autofill bug, FM11) and a
specialist name "Amani" cut to "Aman…" at 360 (2.14). 1.20 also reports, as soft (check by eye): the Praxis
dashboard CTAs in normal case beside UPPER CASE CTAs everywhere else, the Praxis /pricing top-up field rounded beside
pill fields, and the Parallel /contact topic chips in normal case beside UPPER CASE filter chips. A4 (sign out, now
run for the first time on both), ST2 and ST3 pass on both sites: both run APP_STAGE=test and show "Test profile" on
their test specialists. Not reached live: the Praxis brief wizard (behind a service choice) and both onboarding
wizards (Continue needs data the check cannot invent); their fixtures cover them. The false alarms of the first live pass were fixed, each
pinned by a fixture (a bordered scroll box, a line-clamped card button, a rows-per-page trigger, chips vs badges,
"QA & Test Automation", the account's own e-mail in settings, a catalog of dossier buttons, a /logout confirmation page).

## 5.1.0 — false alarms from the full runs on Praxis and Parallel (issue #3) (2026-10-19)

Each one has a fixture in `test/fp-510.test.mjs` that proves the false alarm is gone and that the real defect it looks
like still fires.

**New config key:** `layout.rateDecimals` (default 4). An exchange rate ("10 credits = $1 = €0.8909") may show up to
this many decimals. The message always said 2–4, but anything over 2 failed.

- **1.11 / FM8 / N4:** a "← Back to home" or "Back to sign in" link (an arrow icon and words) is no longer taken for
  the logo. 1.11 no longer reads it as a logo link that is too wide (Praxis /login). FM8 finds the logo by its brand
  name or picture, not by being the first link (Parallel /forgot-password). N4 accepts the logo plus "Back to home"
  pair that FM8 asks for. A text "Home" link next to the logo is still a duplicate.
- **4.6:** a link in the page flow that sits under the cookie banner on arrival passes when the reader can scroll it
  clear (short auth pages at 1280×720 with bottom padding). A link inside a fixed header, or a footer that stays
  under the banner at the very bottom of the page, still fails.
- **money:** "the header shows money" looks only at the site header, not at a page's own `<header>` title block
  (Praxis /dashboard/wallet). It also skips an amount on the same line as the word credits, because that amount is
  the hint the message asks for.
- **P2:** a collapsed contents bar counts as the "On this page" navigation: a button "Contents · …" with
  `aria-expanded` / `aria-controls`, or a `<details>` summary over the anchors. When the open list scrolls away, the
  check accepts the sticky bar instead (Parallel and Praxis policies on phones). No contents at all, or a list or
  bar that is not sticky, still fails.
- **P3:** "Wallet: your credit balance…" in a privacy policy's list of data categories is a label, not a reference to
  the page. "Top up from your Wallet" still has to be a link.
- **CT6:** "October 2026" on its own in a table group row or a heading names a month (a statement grouped by month).
  A day format cannot write it, so it is no longer reported. In a sentence, on a body line by itself, or with a day,
  it is still reported.
- **1.6:** the selected chip in a list of filter chips (one `<li>` each, Praxis /specialists sidebar) keeps its look
  under the pointer, the same way a selected chip in a row already did.
- **1.17:** a square row that spans a rounded card (a list's "Waiting (9)" group header) and the touching cells of a
  ruled grid inside a rounded frame (Parallel /pricing) are parts of that frame. A small square button inside a
  rounded card still fails.
- **2.11:** text that has scrolled out of a scroll box (the agreement panel on Praxis /onboarding) is clipped, not
  covered.
- **4.4:** pagination measures the list it pages (`<ul>`, a table, or a run of card `<div>`s just before it), never a
  box that also holds the pagination, such as the page's layout grid with the sidebar (Praxis /dashboard/tasks).
- **1.2:** dropdown order uses the page's language (`Intl.Collator(<html lang>)`). On an Azerbaijani page "C, Ç" and
  "S, Ş" are in order.
- **2.7:** painted content counts even when it is `aria-hidden`, such as a decorative marquee band between sections
  (Parallel /).
- **A3:** Radix's hidden "bubble" `<input aria-hidden>` next to `button[role=checkbox]` belongs to the same checkbox
  (Parallel /register). Two real consent checkboxes still fail.
- **1.3 / 1.16:** a field drawn as an underline only has no corner radius to count, so it adds no "input corner
  radius" variant. A compact select trigger drawn as a pill (rows per page) counts as a chip, not as a field.
- **Modal on arrival:** a modal dialog that is open right after load is closed with Esc or its close button before
  the page checks run. It is reported once per page as "modal open on arrival": soft when it closes, hard when it
  cannot be closed. One pending-application notice no longer causes about 75 failures (3.3 h1, 3.5 nav, F0 footer).
  Cookie and consent dialogs are left to 4.6.
- **Navigation flakes:** every suite opens its pages with `gotoStable`. It retries when the browser lands on
  `chrome-error://`, when a navigation is "interrupted by another navigation", and on `net::ERR_CONNECTION_*`. A page
  that still cannot be opened fails with "navigation flake: …". The run summary lists these separately as "Navigation
  flakes", keeps them out of `findings.json`, and prints the re-run command.
- Already fixed in 5.0.3 and checked again: 2.4 skips a table header kept for screen readers (`max-sm:sr-only`), and
  CT12 leaves a plain word like "credits" alone.

## 5.0.3 — three more false alarms from the fix round on Compass, Kindred, Threshold (2026-10-19)

- F3 accepts the studio's shared legal identity placeholder ("New Company 1" / "New Address 1" / "000000000") as the
  footer's company line; it has no legal form or jurisdiction until the owner assigns an entity
  (`acceptance.legalIdentity` overrides the strings; a footer with neither the placeholder nor a legal form still fails).
- CT12 no longer calls a plain word a translation key because a key has that name ("credits" on an English page is the
  unit word). Structured keys (`wallet.balance`, `walletBalance`, `wallet_balance`) still count; a plain English word
  left on another locale's page is CT11's untranslated text.
- 2.4 skips a table whose header row is hidden for the eye and kept for screen readers (the sr-only header of a table
  that becomes labelled cards on phones): there is no header position to align.

## 5.0.2 — three false alarms from the first 5.0 runs (Compass, Kindred, Threshold) (2026-10-19)

- FM6 read a year printed before a price as part of it ("14 Oct 2026 800 credits" → 2026800 credits, on every
  Compass task card). Balances and prices are now whole numbers or numbers in thousands groups, never glued to the
  digits before them.
- 3.5 "looks highlighted on a page it does not open" (soft) no longer fires for a call to action drawn as a link
  ("Sign in", "Open a case", "Post a brief", "Become a partner" …, or a link to /login, /signup, /new …): its emphasis
  is the same on every page by design. An emphasised page link (Pricing on /faq) still fires.
- The run summary names the layout and forms suites on their own (they were counted under "ui", so a run that left
  one of them out looked complete).

## 5.0.1 — the shared legal identity placeholder is not test data (2026-10-19)

- CT2 (test data) and CT11 (untranslated) no longer report the studio's shared legal identity placeholder,
  "New Company 1" / "New Address 1" / "000000000". The canon (R-OWN-08) requires it in the footer, the © line, Terms
  and Contact, identical in every language, until the owner assigns an entity; on Compass it was about half of the
  copy findings (every page, every language). New config key `content.legalIdentity` (default: those three strings;
  `[]` for a product with its own entity, where they are test data again). Only text made of the placeholder is exempt:
  real test data next to it still fires, and a label around it ("Company No.:" left in English on a Kazakh page) is
  still untranslated. Fixtures that stood for test data now use "New Company 2".

## 5.0.0 — every check runs everywhere it can fail (2026-10-16)

**Major: the default run model changed.** `babysitter e2e` now runs every suite, at five viewports, in every language
the site offers, for every role, in every state it can reach. A run that used to take minutes can take much longer;
`--quick` is the opt-in fast profile. Specs that relied on the old `--only ui` scope (babysitter + run only) now get
layout and forms too, and copy checks moved to their own suite.

Why: on Praxis (Oct 2026) 262 tester cards came in after a babysitter run. Only 23 of the 169 automatable ones were in
reach of an existing check, and most of those checks had simply never run there (`--only ui`, two viewports, English
only, pages at rest, no re-run after the merge).

### Run (docs/checks-run.md)
- All suites by default: UI (`babysitter.spec`), layout (`layout.spec`), forms (`forms.spec`), states/languages/scroll
  (`run.spec`), business acceptance (`acceptance.spec`), copy (`content.spec`), the product's `e2e/*.spec.ts`.
- Viewports 360, 390, 768, 1280, 1440 (`viewports` in the config, `VIEWPORTS=…`); `--quick` = 390 + 1440.
- `--only ui|acceptance|content|product` is a partial run and says so with a loud banner before and after.
- `prepare` finds every language (hreflang, the switcher, the repo) and verifies it switches (`.babysitter/locales.json`),
  one real instance of every dynamic route (`app/**/[param]/page.tsx`), and signs in every role (`roles` in the
  config → `.babysitter/storage-<role>.json`).
- States: dialogs, sheets, menus, top-up dialogs in no-pay mode, empty submits, wizard steps, pagination — the page
  checks re-run in each. Every non-GET request is aborted while states are driven.
- The run summary lists what did not run (suites, viewports, languages, roles, dynamic routes, unreachable controls)
  and the exact `--last-failed` command. `babysitter fix-plan` groups findings by cause with the files to change.
- `init` installs post-merge / post-rewrite hooks (`babysitter after-merge`), `--ci` a deploy workflow that runs the
  full suite against the deployed URL; findings are blocking (CLAUDE.md block + Stop hook); a NOT WIRED banner names
  what is missing.
- Threshold fixes: each password field needs its own eye (A1, also reset/change/settings pages and dialogs);
  thousands separators from 1,000 on money only (B4); payment logos need "We accept" (F5); a dropdown near the bottom
  opens upwards (1.2); 3.8 after client-side navigation and `#anchor` links; N6 clipped labels at every viewport.

### Copy (docs/checks-content.md)
- `babysitter content`: static lint of every locale's i18n files, JSX copy and email addresses (MX over DNS).
- `content.spec` CT1–CT18 on rendered pages, in every language: unfinished / defensive copy, test data, raw errors,
  trailing periods, dashes, date formats, plurals, email deliverability + mailto, untranslated text, keys printed as
  text, `<html lang>`/`dir`, legal document names, the © line, one term per concept, numbers that contradict each
  other across pages.

### Forms (docs/checks-forms.md)
- `forms.spec` FM1–FM10 in a network sandbox (nothing is really submitted): bounds of amount/quantity/credits/phone/
  IBAN fields, gibberish, failed and successful submits, a stale header after a save, credits shown before the click,
  the password lifecycle (eyes, change, reset), auth page shell, redirect flash, editable settings email.
- ESLint `ui/numeric-input-bounds` (error) and `ui/mutation-refreshes-ui` (warn).

### Layout, navigation, money (docs/checks-layout.md)
- `layout.spec`: header/footer nav parity, nav names vs page titles, logos link home (mobile menu too), the current nav
  item looks current, one heading style per level, words broken mid-word / split numbers / orphans, near-miss and table
  alignment, excess empty space, sticky header, long lists without pagination, favicon (defaults + cross-product
  registry), dropdown order / selected item / tick side, hover feedback, one mobile menu, money formatting in every
  switcher currency.

### Integration (this release)
- 2.5 nav wrapping checks site navigation only (header / top-level nav) at every language: footer columns, sidebars,
  breadcrumbs and "On this page" lists may wrap (was: false alarms at the default language).
- One report per phrase: acceptance B1 delegates to the CT1 rules (one source of truth) and runs only in
  `--only acceptance`; `*.vercel.app` preview hosts moved into CT1.
- One untranslated check: CT11 in `content.spec` has both heuristics (English left, or word for word the
  default-language page; `locales.keep`, `lang`-tagged and `translate=no` text excluded; `locales.untranslated:
  "warn"`). `run.spec` no longer reports it again per viewport.
- `content.spec` site-wide crawls sign in as each route's own role.
- The mobile menu helper waits for the menu's exit animation before deciding Escape did nothing (it used to press the
  toggle again, re-open the menu and then hang 30 s on truelogos.pro at 390).
- ESLint FORMS rules tuned on Praxis, Vertex and TrueLogos (11 → 2 findings, both real): reference / note / name
  fields, OTP boxes, fields validated with `aria-invalid={error}` or a two-sided range check of their value, kit
  wrappers (checked where used), module-level helpers that return the result, `setSaved(prev => …)` data setters,
  `signOut()`.
- `init` records the product `name` (favicon registry); the config template lists `viewports`, `roles`, `locales`,
  `states`, `content`, `forms`, `layout`.
- Every other language also gets 2.5 text breaks at phone widths (`run.spec` i18n): a word broken mid-word or a split
  number is hard, an orphan word in a heading soft (Praxis KK "ТАПСЫРМА" broken by letters at 360).
- `e2e --quick` / `--skip-prepare` no longer swallow the argument after them (`e2e --quick forms.spec` dropped
  forms.spec and ran everything else).
- FM1 no longer waits out the whole test on a loose calculator field: every locator call in the forms checks has its
  own timeout (inside the test runner the default action timeout is none; Praxis /pricing timed out at 240 s).
