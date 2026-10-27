# Jev: copy read once, findings triaged

Jev is a decision model: a "noul" question answers a probability, a "choice" question a distribution over named
options. Claude's Babysitter uses it for what rules cannot see in copy — two sentences that disagree, one thing called
two names, a promise the product does not keep — and to order a run's findings. Structure stays deterministic: native
controls, the kit, radii, tokens, motion and contrast are measured in the browser and by the AST checks, never asked of
Jev.

```bash
npx --no babysitter text                    # the text pass alone: every route read once, rules + Jev
npx --no babysitter text --no-jev           # the same read, the copy rules only
npx --no babysitter text --from-source      # no browser: the copy of the source (project map)
npx --no babysitter e2e                     # Jev on (a token): the text pass first, content.spec skips what it read
npx --no babysitter e2e --fast              # + the smaller matrix (below), express on
npx --no babysitter triage                  # Jev orders the last run's findings (e2e does it when Jev is on)
npx --no babysitter fix-plan --format agent # the plan + one JSON line per finding with the fragments to edit
npx --no babysitter profile                 # where the last run's time went, and the time of a bigger product
```

## The invariant: Jev never makes a hard rule pass

- Every deterministic check runs. Nothing is skipped because Jev saw no problem.
- content.spec skips its copy checks only when **the text pass ran the same rules** on its one read of the page
  (`playwright/text-collect.js` calls the functions content.spec calls, on the same collected copy). That depends on
  the text pass having run, never on a Jev answer — with Jev off the text pass still runs those rules.
- Jev **adds** findings (marked "Jev"), **labels** existing ones (triage: likely real / unsure / likely noise, with the
  reason) and **reports disagreements** with a rule that passed or is switched off. It never removes, downgrades or
  passes a deterministic finding.
- `test/jev.test.mjs` checks it: the text pass with a Jev that answers "no" to everything reports exactly the rule
  findings of the pass without Jev, and still fails on them.

## The text pass

One browser, desktop width (1440), every route once per locale × role (the signed-in roles of `babysitter prepare`).
Per page it reads the visible copy (the same collection as content.spec), the copy of collapsed sections (closed
`<details>`, `hidden="until-found"`, accordion panels — FAQ answers), and the dialogs a button opens (cookie settings,
"Add credit": opened once per role, read, closed with Escape; every request that is not a GET is aborted meanwhile).

1. **The copy rules** (CT1–CT31, P4, 6.15) run on that one read, site-wide over the records of every page — the work
   content.spec did with one page load per check and a second crawl per site-wide test. Collapsed sections and dialogs
   get the per-segment rules too (content.spec never saw them).
2. **Jev** (when a token is available):
   - the babysitter copy rules as questions, in any language (`rules/jev/copy-rules.json`): not-yet copy ("write as if
     it works": no "temporarily unavailable", "not open yet", "coming soon", "today" status lines outside the payment
     dialog), build notes, negative statements nobody asked for ("We do not operate a telephone line"), self-defence,
     jargon and internal identifiers, unexplained values ("rate ×1.6"), counts that differ from the list shown, sums
     that do not add up, one form per list or card set, one name per thing on a page, a control offered for something
     the page says is unavailable, raw paths in prose, legal document names, named pages that do not exist;
   - the text rule catalog (`rules/jev/catalog.json`, 122 rules: claims against the facts, proof, copy, legal, page,
     site and pair rules). `profile: "house"` rules encode a product fleet's house policy (prepaid credits, a fixed
     top-up range, one card list, no VAT …) and run with `jev.profile: "house"`; `facts: true` rules need `jev.facts`;
   - **the consistency engine** (below).
3. **Agreement.** A rule's hit stays the hard finding; a Jev question that mirrors that rule (`ct`) and fires on the
   same line folds into it ("Jev agrees"). A Jev-only hit ≥ `jev.min` (0.7) is a finding marked **Jev**; 0.5 ≤ p < 0.7
   is listed as **unsure, check by hand** and never fails. A contradiction Jev is ≥ 0.8 sure of is **hard**.
4. **Recall net.** Where a copy rule ran on a page and found nothing — or is switched off in `content.skip` — and the
   Jev question that mirrors it fires at ≥ 0.8, the finding says **"Babysitter passed/skipped, Jev disagrees"**: silent
   misses of the rule surface (on the benchmark site: CT1 had no "not open yet", "temporarily unavailable",
   "sends no email yet" in its lexicon).

Jev-marked findings are **advisory** by default: in findings.json, the summary and fix-plan, but they do not fail the
run or block the Stop hook (`jev.blocking: true` makes them blocking). Rule findings and hard contradictions block.

Writes `.babysitter/text-pass.json` (findings, unsure, cost, time), `.babysitter/text-pages.json` (the page models:
`--from-pages` re-runs Jev without a browser), `.babysitter/text-claims.json`, `.babysitter/terms.json` and
`.babysitter/project-map.json`, and merges its findings into findings.json (suite `text`).

## The consistency engine (`lib/jev/consistency.js`)

1. **Claims.** Every sentence that states something (a number, an amount, a duration, a rule, a promise, what exists,
   what is kept or deleted, who does what), on every page, language and role, the site chrome once.
2. **Topic** — a Jev choice per claim over 20 topics (price, limits, fees, currency, billing, balance, refund,
   cancellation, account closure, data collected, data storage, deletion controls, availability, inputs, eligibility,
   contact, notifications, payment security, acceptable use, naming); a claim sits in two topics when Jev hesitates.
3. **Partner** — per topic, every claim is shown with all the site's claims about it, and Jev picks the one about the
   very same point ("none" allowed). A topic too large for one question is read in overlapping windows.
4. **Verdict** — each candidate pair is put side by side: *conflict / differ / same / unrelated*, and *what would a
   careful customer who reads both conclude: inconsistent / one adds detail / different things*. Conflict ≥ 0.5 →
   `consistency/contradiction` (`consistency/one-page` when both are on one page; hard from 0.8); else
   inconsistent → `consistency/different-words`. Each finding quotes both places with route and section.
5. **Promises** — a statement on a document page that promises a control ("delete it with the delete control on the
   run page", "Settings → Export") is checked against the headings, buttons and links of the signed-in pages read:
   `consistency/promise-without-feature`. A page the source has and the read did not reach (project map) is not judged.
6. **Terms** — names that share a head word ("API key" / "deployment key", "routing fee" / "orchestration fee",
   "close account" / "delete account"; inflections are one name) are candidate pairs; Jev decides "the same thing
   here?" from a sentence of each. Clusters → `.babysitter/terms.json` (adopt it as the glossary) and
   `consistency/term` findings with the majority term. `content.terms.canonical` pins a term;
   `content.terms.distinct` keeps names of different things apart (a "pitch and finance specialist" and a "reviewer").

The whole text map is compared on every run: an unchanged page can contradict a changed one. Answers are cached by
content, so only new or changed claims cost calls.

## Triage and fix-plan

`babysitter triage` (run by e2e when Jev is on) asks two questions per finding: which known noise mechanism explains it
(alpha colours in contrast maths, visually hidden text, entrance animations, one-off timings, guessed URLs, layouts by
design, painted list markers, forms submitted by the tool, required copy, naming, copy read out of context) and
"measured correctly, is it a defect a visitor would notice?". p(real) = p(defect) × (1 − p(noise)). fix-plan orders
by it and lists the likely noise apart — "Jev thinks this is a false alarm because …". Nothing is dropped.

fix-plan gives repair context from the project map: for every finding the exact fragment (file, line range, the lines
themselves), both sides of a consistency finding, a suggested canonical wording (the statement on the more
authoritative page: policy > pricing > FAQ > other) and the place a fact should live once. `--format agent` prints one
JSON object per finding (`places: [{ side, route, file, from, to, lines }]`) so a repair agent edits only those
fragments.

## The project map (`.babysitter/project-map.json`)

A static pre-pass (2 s cold, 1 s warm on a 211-file app): per file its hash, its copy (JSX text, attributes, prose in
data literals — FAQ arrays, plan tables, blog posts in `.ts` — message files with keys) with line numbers and its UI
(native `select` / checkbox / radio / number inputs vs kit components, dialogs, menus, accordions, motion props,
transition classes, `@keyframes`); per route its page, layouts and every file it imports (the import graph of
`--changed`). The text pass merges what it rendered (`rendered: true`). Animation hints only pre-sort: visible motion
is still measured by 6.12. A file whose hash did not change reuses its extraction; the cross-page comparison never
skips.

## `--fast`: the smaller matrix

- viewports 390 + 1440 for every route; 768 only on one route per page template (the home page always) — a tablet
  layout is a breakpoint of a template, not a page of its own; 360 and 1280 are not projects of a --fast run;
- a route a second role sees with the same rendered main text (a legal page signed in) is checked once;
- copy is read once by the text pass; express mode on.

Every check the trim leaves out is listed in the summary under **By design scope (not run, on purpose)** with its
reason — never silent. `VIEWPORTS` and `babysitter.config.json → viewports` still win.

## Configuration

```json
"jev": { "enabled": true, "min": 0.7, "facts": "docs/facts.md", "context": "", "profile": "generic",
         "concurrency": 4, "deadline": 30, "budget": 2, "triage": true, "blocking": false, "skip": [] },
"content": { "terms": { "canonical": { "API key": ["deployment key"] }, "distinct": [["pitch specialist", "reviewer"]] } }
```

`facts`: what is true of the product today (rules marked `facts` compare claims with it; a stale facts file makes
them flag true sentences). `context`: a standard every product must meet (the house rules, read with
`profile: "house"`). `budget` (USD) stops new calls when spent and the summary says what was not read; `deadline`
(minutes) likewise. Token: `JEV_API_KEY`, `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`, or a dotenv file named by
`BABYSITTER_JEV_ENV` / `jev.envFile`. Without one: "Jev off: no token — copy checked by rules only". The token is
never printed or written. Cache: `.babysitter/jev-cache/`.

## Benchmark: the tester's cards

`test/jev-bench/` holds two products' text cards (anonymised) with what the read saw: site A — 140 cards a tester filed
in one day (rendered pages, as of the morning before the fixes), site B — 18 cards over two days (the source as of
each batch). `node test/jev-bench/score.mjs <text-pass.json>` scores a run: a card is caught when one finding is on one
of its pages, quotes one of its key fragments, and is of a kind that can stand for it (a dash finding that quotes a
contradicting sentence does not count as a caught contradiction).

| | site A (140 cards) | site B (18 cards, source) |
|---|---|---|
| 5.6.2 rules alone | 15 (10.7 %) — dashes, two not-yet lines | 0 |
| 5.7.0, generic rules, no facts | 67 (48 %) · 90 (64 %) with unsure | — |
| 5.7.0, house rules, no facts | 70 (50 %) · 101 (72 %) with unsure | 3 (17 %) · 5 (28 %) with unsure |
| 5.7.0, house rules + facts | 80 (57 %) · 105 (75 %) with unsure | 5 (28 %) · 11 (61 %) with unsure |

By kind on site A (house + facts, findings only): not-yet 15/17, negative statements 10/10, dashes 11/11,
contradictions between pages 26/46, inside one page 7/10, the same thing in different words 3/8, promises 2/4,
unclear values 0/7. Out of reach of a rendered read: 12 cards on a finished-job page, an upload or a currency switch.
Precision on a sample of 40 Jev findings: 22 real, 18 noise (mostly claims against a facts file older than the site).
Cost: $0.04–0.07 per site cold (≈ 650 claims, 3 600–6 400 questions), warm re-runs a fraction of a cent.

## Where the time goes (measured)

`babysitter profile` on a full normal run of the express fixture product (4 public routes + a signed-in page, a second
language, 5 viewports, 2 workers; 2 148 tests, 71 min wall):

| suite | share of test time | what it is |
|---|---|---|
| UI checks (babysitter.spec), per page | 58 % | every check × route × viewport × role, a page load each |
| layout, per page | 15 % | |
| acceptance, per page | 9 % | |
| states / languages (run.spec) | 9 % | dialogs, menus, wizards at the narrowest and widest viewport, each language |
| content, per page + site-wide | 3 % | once at desktop — copy was never the expensive part |
| forms, site-wide tests of every suite | 5 % | |

By viewport: 360 19 %, 390 20 %, 768 14 %, 1280 15 %, 1440 31 % (desktop also runs the once-per-route tests). 39 % of
the wall time is outside tests (worker start, browser launch, fixtures). The cost is page loads: one per check × route ×
viewport × locale × role.

Extrapolated (same per-test means, serial time / 4 workers): a 40-route product with 2 languages at the default
5 viewports ≈ **250 min**; at 3 viewports ≈ 170 min; with 3 roles over all 40 routes (120 route × role pages) ≈
500 min at 3 viewports, 750 at 5. That is the 2–4 hours.

Measured on the same fixture, same findings:

| mode | wall | distinct problems × page |
|---|---|---|
| `e2e` (normal, 5 viewports) | 4 266 s | 224 |
| `e2e --express` | 1 717 s (−60 %) | 224 (identical) |
| `e2e --fast` (express + 390/1440 + 768 sample + copy read once) | 1 177 s (−72 %) | 224 (identical; one CT22 finding is reported site-wide instead of on /) |

On the fixture every problem seen at 360, 768 or 1280 is also seen at 390 or 1440, so nothing was lost; on a real
product a defect only at 360 or 1280 would be — the summary lists those viewports as by design scope. Scaled by the
measured ratio, a 40-route × 2-language product runs `--fast` in ≈ 70 min (5-viewport baseline) or ≈ 47 min
(3-viewport baseline) at 4 workers; the 768 sample is one route per template, so on a product with many routes per
template the saving is larger than on the fixture (where every route is its own template).

The text pass itself: 32 pages (27 public + 5 signed in) read in 95 s with collapsed sections and dialogs (one browser,
one load each); content.spec took 921 s for the same pages at one viewport. On the fixture: content.spec 232 s, the text pass 39 s, every content.spec finding also a text-pass finding (`test/text-pass-parity.test.mjs`). Jev on those pages: 20 s and $0.04–0.07
cold, under a second and a fraction of a cent warm (answers cached by content). A live read-only smoke of 10 public
pages of a fleet site: 112 s, $0.028, 26 rule findings, 59 Jev findings, 56 unsure.

