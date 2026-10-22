<!-- 5.5.0: every in-scope miss classified by hand (CAUGHT-NOW / NEW-CHECK / CANNOT-AUTOMATE / OUT-OF-SCOPE); each NEW-CHECK row is a check with a fixture in test/misses-550-*.test.mjs, named by card id. Group ids (G…) refer to the specs below; check ids proposed here were renumbered to avoid clashes — the final ids are in the 5.5.0 tables of docs/checks-*.md and CHANGELOG.md. -->
# Triage of the deferred MISSED rows: Praxis (22) + Parallel (12), babysitter 5.4.1

Inputs: `misses/praxis-2026-10-20.md` and `misses/parallel-2026-10-20.md` (every row marked "deferred" / "to do"), full card text in `ws/cards/*.json`.

**How this was checked (read-only):** each product was cloned into the scratchpad (`ws/src/praxis`, `ws/src/parallel`) and the fix commit for each card was found in its history. For the static checks I took a snapshot of the code from just before the fixes (Praxis `067d21c`, 2026-10-16 04:37 −0700, for the 10-16 copy cards; Parallel `9c641c9^`) and ran `babysitter content . --offline` (5.4.1) on it. Raw outputs are in `ws/src/pra-pre-content.txt` and the Parallel run above. No product repo, babysitter file or browser was touched. Rendered checks were judged from the code (`playwright/checks/run.js → measure`, `fit.js`, `acceptance.js`, `checks.js`), not run.

**Result:** 1 CAUGHT-NOW, 32 NEW-CHECK (24 groups), 1 CANNOT-AUTOMATE.

Things I found along the way:
- **9a8qvx is caught by CT21 (a) on the pre-fix Parallel code** (`components/layout/header.tsx:75`, `:163`, "Orders" → /dashboard/tasks). The fix text is off, though: it says to label the links "All tasks" (the label most links use) even though the report itself says "the page calls itself 'Tasks'". CHANGELOG/docs say "the page's own name wins", so `labelDrift` (lib/content-consistency.js ~l.557–570) should pick `pageNames(page)[0]` as the dominant label when one of the labels equals it.
- **P2 skips `/delivery-policy` completely.** `POLICY_RE` (acceptance.js l.36) needs a `/` right before `policy`, so `/delivery-policy` (and `/shipping-policy`, `/returns-policy`) never get P1/P2/P3. `/cancellation-policy` matches only because `cancellation-` is in the list.
- **izrv19 was put in the wrong bucket in the misses file.** It is not a cookie *dialog* overlap. Per fix `14b45f1`, it is the Cookie Policy page's table: a `whitespace-nowrap` cookie name runs into the Purpose column. See G11.
- **2.11 `overlappingText` skips `[role=dialog]` on purpose** (checks.js l.633), and `measure()` (run.js l.47) doesn't run 2.11, 2.7 or 1.9. So no check ever looks at alignment, overlap or input edges inside an opened panel.

---

## NEW-CHECK specs (grouped)

### G1 — CT19 `content/term-drift`: one spelling of a loanword per language (2ixn7g)
- **Kind:** static (message files of every locale), and on rendered pages per locale in `content.spec`.
- **Measure:** for each non-English locale L and each English source word W from a built-in loanword list (`cookie`, `e-mail/email`, `online`, `chat`, `login`, `dashboard`, `wallet`; extendable through `content.termGroups`), go through every message key whose default-locale value contains W. In the L value of those keys, take the tokens whose *normalised* stem equals norm(W). Normalisation: lowercase, strip diacritics, Cyrillic→Latin translit, `c→k`, `oo→u`, `ie→i`, `y→i`, doubled letters collapsed; compare the first 4+ characters, so suffixes such as `kukilər` or `cookie faylları` match. Group the matches by *surface family*: the original Latin spelling (`cookie*`) versus a transliteration (`kuki*`, `куки*`). If both families appear in one locale, raise a hard finding on each minority place. The dominant family is the `content.glossary[L]` preferred spelling, else the one used most.
- **Thresholds:** 2+ uses in total, at least one in each family. Inflections of one family count as one variant.
- **Bad (az.json):** `{"cookieSettings":"Kuki parametrləri","cookiePolicy":"Cookie siyasəti","banner":"PRAXIS yalnız zəruri kukilərdən istifadə edir"}` with en `Cookie settings / Cookie Policy / … necessary cookies`. Expected: CT19 "az: 'Kuki' 2× vs 'Cookie' 1×".
- **Good:** `"Cookie parametrləri","Cookie siyasəti","zəruri cookie fayllarından"`.
- **Look-alikes (must stay quiet):** (1) `"kukilər"` + `"kukiləri"` + `"Kuki parametrləri"` (one family, three inflections); (2) the storage key `praxis_cookie_consent` shown in a Cookie Policy table cell next to `"kuki"` prose (an identifier with `_` or code formatting doesn't count).
- **Plug:** `lib/content-consistency.js → TERM_GROUPS` gets a `locale: "*"` loanword builder that `termGroups(cc)` expands per locale (today only `en` and `fr` groups exist, l.44–121). The rendered side uses the same groups in `consistencyRendered` (checks/content.js l.410) for each `byLocale` entry.

### G2 — CT19: one verb for handing over the work (69ukru)
- **Kind:** static plus rendered (en).
- **Measure:** a new built-in group `concept: "work handover"`. Members: `delivered` = `/\bmark(?:s|ed|ing)?\s+(?:it|the work|the task|the hire|them)?\s*(?:as\s+)?delivered\b/i`; `complete` = the same with `(?:complete|completed|done|finished)`. `keep()` drops matches whose subject in the 40 characters before is the client or the system (`client|buyer|customer|automatically|the team|admin`): the client "completing" a hire is a different state.
- **Thresholds:** standard CT19. The minority is reported at each place. On the pre-fix Praxis snapshot that is "delivered" 4× (en.json 2093, 2775, 2860, Agreement §5.2) against "complete" 2× (en.json 418, 2641).
- **Bad:** `become-partner: "You accept, do the work and mark it complete on the task thread"` + `terms: "The specialist … marks it delivered on the task thread. You then accept the work"`.
- **Good:** both say "mark it delivered".
- **Look-alikes:** (1) `"The hire is marked complete when the client accepts the delivery"` (client subject, dropped by keep); (2) the status badge `"Completed"` on its own, and `"Once the client accepts, the task is complete"` (no "mark" verb).
- **Plug:** `TERM_GROUPS` in lib/content-consistency.js.

### G3 — CT20 `content/policy-conflict`: three new facts (lzldsx, q26219, 9slhlk)
Static (English sentences, same extraction pipeline as the refund-window fact, l.~270–300) and rendered (content.spec site-wide).
- **(a) `recourse after acceptance`** (lzldsx). An anchor sentence is one with `/\b(after|once)\s+(that|the specialist (has )?accepted|acceptance|they accept)\b/i`. When the sentence starts with "After that" and the sentence before it mentions `accept`, that counts too. Read the channel from the anchor sentence: `support` = `/\b(write|e-?mail|contact|message)\s+(to\s+)?(our\s+)?support\b/`, `dispute` = `/\b(open|raise|start)\s+a\s+dispute\b|\ba dispute decides\b/`. Two different channels make a hard conflict. The report gives the value most places use and every place of the other.
  - **Bad:** pricing `"You can cancel … while it waits for the specialist to accept. After that, write to support"` vs terms `"If something goes wrong after the specialist has accepted, open a dispute from the task"`.
  - **Good:** pricing `"After that, open a dispute from the task"`.
  - **Look-alikes:** (1) `"Unused credits can be refunded within 14 days … write to support"` (no acceptance anchor); (2) `"If credits do not appear after a payment, write to support … If a specialist doesn't deliver, open a dispute"` (two different situations, no anchor).
- **(b) `who sets the specialist's task list`** (q26219). Actor = specialist: `/\b(you|specialists?|they)\s+(choose|pick|select|decide)\s+(the\s+|which\s+|what\s+)?(tasks?|services?|work)\b[^.]{0,30}\b(offer|take on|list)\b|\bchoose what to take on\b/`. Actor = team: `/\btasks?\s+the\s+(team|PRAXIS|we)\s+(agrees?|assigns?|sets?|selects?|approves?)\b|\b(the team|we)\s+(assign|choose|select|decide)s?\s+(your|which|the)\s+tasks\b/`. Both actors present gives a hard conflict.
  - **Bad:** Agreement `"you are listed for the tasks the team agrees with you"` vs Payments `"Specialists set their own rates and choose the tasks they offer"`.
  - **Good:** Agreement `"you choose the tasks you offer; the team approves the listing"`. "Approves the listing" is not a task actor phrase, so it stays quiet.
  - **Look-alikes:** (1) `"Clients choose the task and the platform lists the specialists who offer it"` (client actor, not a member); (2) `"the team decides on your application within 5 business days"` (application, not tasks).
  - **Confidence note:** this is a closed phrase list, so different wording is missed. It only fires when both actor classes are written out. It's the weakest spec in this file. Accept it only with the two look-alike tests.
- **(c) `what the site stores`** (9slhlk). In cookie or consent copy (a key path or sentence with `cookie|consent|browser storage|banner`), read the list after `/\b(remember|entries for|stores?|keeps?)\s+your\b/` up to the end of the sentence. Split on `,`/`and`/`or`, drop `your/this/the`, and treat `cookie-notice choice` and `this choice` as the same item. A *closed* list (`only …`, or no `such as|for example|e.g.|and more`) that lacks an item another list has is a hard finding. A number word in front ("four browser-storage entries") must equal the length of its list.
  - **Bad:** banner `"PRAXIS uses only necessary cookies and browser storage: to keep you signed in and to remember your language, currency and this choice."` vs settings `"four browser-storage entries for your language, currency, this choice and an unfinished request"`. The banner is missing "unfinished request".
  - **Good:** banner `"…to remember your language, currency, this choice and an unfinished request"`.
  - **Look-alikes:** (1) `"for example your language"` (an open list); (2) `"three sign-in cookies"` next to a list of three cookie names (the count matches).
- **Plug:** add `facts` extractors in lib/content-consistency.js next to the refund-window / payment-method extractors (l.~279), and `content.policyAllow` applies. The rendered side shares `consistencyRendered`.

### G4 — CT15 `content/legal-naming`: brand prefix parity (tpp8au)
- **Kind:** static plus rendered.
- **Measure:** for each legal document (CT15 family), collect every name it goes by: footer label, `<h1>`, `<title>` without the brand suffix, checkbox or consent labels ("I accept the X"), and prose mentions. Brand = `content.brandTerms` ∪ `siteBrand(pages)`. Two names that differ only by a leading brand token are a hard finding ("PRAXIS Specialist Agreement" in the h1, onboarding card and checkbox vs "Specialist Agreement" in the footer). So is a family-level outlier: one legal doc named with the brand while every other legal doc goes without it. Today CT15, CT21 and CT22 all treat "a label that is a word subset" / "Acme Partner Agreement = Partner Agreement" as the same name. That rule stays for *matching*. The new part is about *naming*.
- **Bad:** footer `<a href="/specialist-agreement">Specialist Agreement</a>`, page `<h1>PRAXIS Specialist Agreement</h1>`, onboarding `<label>I accept the PRAXIS Specialist Agreement</label>`, and the other docs `Terms of Service`, `Privacy Policy`.
- **Good:** "Specialist Agreement" everywhere.
- **Look-alikes:** (1) `<title>Specialist Agreement · PRAXIS</title>` (brand suffix, already dropped); (2) `"…between you and PRAXIS LLC"` (the entity after "and/of/with" is not a prefix); (3) a site where *every* legal doc is "Acme Terms", "Acme Privacy Policy" (consistent).
- **Plug:** `namingFindings` (playwright/checks/content.js l.306) and the static legal-naming rule in lib/content-rules.js. Run per locale: AZ "PRAXIS mütəxəssis müqaviləsi" / "Mütəxəssis müqaviləsi" and KK show the same pattern.

### G5 — CT12 `content/key-as-text`: a link labelled with its path (49kc72)
- **Kind:** rendered (all routes) plus static (JSX).
- **Measure (rendered):** `a[href], button, [role=link]` whose trimmed visible label matches `^/[\w\-/\[\]]*$`, or `^https?://<same host>`, or equals its own `href` path (optionally after a "Step N ·" prefix split on `·|:|—`). Hard. **Static:** `<Link href={X}>{X}</Link>` or `{…}·{X}` where the child expression is the same identifier or member chain as `href`, or the label is a string literal that starts with `/`.
- **Bad:** `<a class="btn" href="/pricing">/pricing</a>` and `<Link href={step.route}>{step.route}</Link>`.
- **Good:** `<a href="/pricing">Pricing</a>`.
- **Look-alikes:** (1) `<a href="https://github.com/acme">github.com/acme</a>` (external, no scheme); (2) `<code>/api/v1/tasks</code>` in docs, not inside a link; (3) a profile-URL preview `praxis.com/u/erik` shown in a read-only input.
- **Plug:** rendered in `copyFindings` (checks/content.js l.143). The static part goes in rules/eslint/rules/content.js or lib/content-lint.js JSX walker.

### G6 — P2: contents rail parity across policies + the policy-path gap (gjfjnc)
- **Kind:** rendered, site-wide (acceptance).
- **Measure:** (1) `POLICY_RE` also matches a `-policy|-terms|-agreement` suffix (`/delivery-policy`, `/shipping-policy`). (2) `policyLayout` returns `{h2, toc:!!(toc||ctrl)}` per policy route. A new site-wide test compares them: if 2 or more policy pages have a contents rail, any policy page with 3 or more section `h2` and no rail fails P2 ("Cookies, Cancellation and Delivery have no 'On this page'; the other N policies do"). The existing absolute rule (`h2 >= 6`, l.619) stays.
- **Bad:** `/terms` and `/privacy` with a rail and 9 h2 each; `/cookies` (6 h2), `/cancellation-policy` (4 h2) and `/delivery-policy` (4 h2) without one.
- **Good:** every page has the rail.
- **Look-alikes:** (1) a 2-section `/imprint` without a rail; (2) a site where *no* policy has a rail and every policy has 3–5 sections (no parity to break; absolute P2 only).
- **Plug:** acceptance.js `policyLayout` returns `h2` and toc (already computed). Collect in acceptance.spec.js inside a site-wide `test("P2 every policy …")` like the footer site-wide test (l.~159–171).
- **Note:** `/cookies` (6 h2) already trips P2's ≥ 6 rule today, *if* the page's h2s are inside `main`. Only Cancellation and Delivery are truly new.

### G7 — F0: the footer is the same signed in and signed out (xp7pmu)
- **Kind:** rendered, acceptance site-wide.
- **Measure:** on one public route (default the first policy route, else `/`), collect the footer link set (`label → href`) anonymously and in each role's storage. A link present anonymously and missing for a signed-in role is hard, and so is the reverse. Ignore auth calls to action (`SIGN_IN_CTA_RE`, Sign out, Dashboard/Account, which A5 owns).
- **Bad:** anonymous footer Company column `About, Contact, Become a partner`; signed-in `About, Become a partner`.
- **Good:** the same three in both.
- **Look-alikes:** (1) anonymous footer has "Sign in" and the signed-in one has "Dashboard"; (2) a "Support" mailto line added for signed-in users (an addition beside the same links is soft at most).
- **Plug:** `a.footer(page, acc)` already reads the footer. Add a link-set collector and a test in acceptance.spec.js that uses `ctxFor(browser, auth, role)` (l.51) for both states.

### G8 — F5 / P3: "the marks shown in X" really are in X (992bgb)
- **Kind:** rendered, content.spec site-wide.
- **Measure:** a sentence `/\b(marks|logos|badges|icons)\b[^.]{0,40}\b(shown|displayed|pictured)\s+(in|on|at)\s+(.+?)(\.|$)/i`. Split the targets on `,|and`. `footer` maps to the footer, and a Title Case document name maps to its route through CT22's name map (`pageNames`). On each target route, `main` (not the footer) must contain a payment-mark image: the F5 detector (`img[alt|src]`/`svg title` matching `visa|mastercard|maestro|amex`). Failing that is hard.
- **Bad:** About: `"…by Visa or Mastercard card, the two marks shown in the footer and in the Payments Policy"`, and `/payments-policy` §03 reads only "By Visa or Mastercard card."
- **Good:** About says "shown in the footer". Or the Payments Policy §03 shows the two logos.
- **Look-alikes:** (1) `"the badges shown on each profile"` (target isn't a page name, skip); (2) `"logos shown in the footer"` where the footer has them.
- **Plug:** `pageRecord` (checks/content.js l.292) stores `marksInMain:boolean`. A new rule goes in `consistencyRendered` (l.410).

### G9 — money: shown rate reproduces amounts, calculator, repeated bracket range (0a32tm, 3v7u9n, 894xch)
- **Kind:** rendered, in every currency of the switcher.
- **Measure:**
  - (a) **Rate arithmetic** (3v7u9n). Parse the page's rate tokens `N credits = <money X>` (or `<money> = N credits`, `N per <money>`). For every other `M credits` with a money token in the same element or line (`creditsNear`), expect `round(M·X/N, 2)` and fail hard on a mismatch over 0.005 ("800 credits shown as €71.33; by the rate on screen, 10 credits = €0.89, it is €71.20 — show the rate exactly, or in the base currency"). Run once per currency. In USD everything reproduces, so only EUR fails.
  - (b) **Calculator** (0a32tm). An amount input with a sibling label `Credits at N per <money X>`: type a value within min/max (the max of 1000 and min), read the credit result, and expect `value/X·N` ±1 credit (floor/round). A mismatch is hard.
  - (c) **Bracket repeats the main amount** (894xch). In one sentence, a parenthetical whose money tokens equal (same currency, same numbers) the money tokens outside it, *or* a parenthetical saying "equivalent in <currency name>" when the amounts outside are already in that currency. Hard.
- **Bad:** `<p>10 credits = €0.89</p><li>800 credits <span>€71.33</span></li>`; `<label>Credits at 10 per €0.89</label><input value="6260"><output>70,206</output>`; `"A top-up is any whole amount from €5 to €20,000 (€5 to €20,000, or the equivalent in US dollars)."`
- **Good:** `10 credits = $1 (€1 = $1.1215)` with €71.33 computed from it; `Credits at 10 per $1` gives 70,206; `"from €5 to €20,000 ($6 to $22,430, or the equivalent in euros)"`.
- **Look-alikes:** (1) a volume-discounted pack `1,000 credits €80.19 (10% off)` (discount word in the element, skip); (2) "Today €1 = $1.1215" on its own (a currency-pair rate, not a credits rate); (3) `"$6 to $22,430 (€5 to €20,000 …)"` (different currency, quiet).
- **Plug:** `moneyFormat` (checks/layout.js l.1259), which already re-reads tokens after each switch. Add a `rateArithmetic(tokens)` step to `moneyIssues` and a calculator probe in `moneyFormat`. The input probe reuses `forms.js fillForm` typing.

### G10 — opened states: 1.9 and 2.7 inside dialogs and validation states (zu9088, 32q0gs)
- **Kind:** rendered, `stateChecks → measure()` (run.js l.47), which runs at rest and after every opener, empty submit and wizard step.
- **Measure:**
  - (a) `add("1.9", await c.inputVisibility(page))` inside `measure()`. Because `newIn` reports only what the state adds, an input whose edge falls under 3:1 *in the error state* is new. Also call it in FM2 `gibberish` after the submit on the filled fields.
  - (b) **New `dialogAxis(page)`** (2.7). In each open `[role=dialog]`, `dialog[open]` or sheet, classify every block child of the content box (heading, paragraph, button row, link) as `centre` (|leftGap − rightGap| ≤ 4px and both gaps > 8px) or `start` (leftGap ≤ padding + 2px). Neutral: full-width rows, and buttons that fill the row equally. If both classes appear and the minority isn't only the dialog title, fail hard. A button row packed to the start with more than 30% of the row empty while a sibling link is centred fails too.
- **Bad (a):** `.ring{border:1px solid #111} input[aria-invalid=true]{border-color:#e5484d}` on an orange band `#ff6a1f` (red on orange 1.2:1). The empty submit sets aria-invalid.
- **Good (a):** `aria-invalid` gives an ink border plus a ring.
- **Bad (b):** `<div role=dialog style="text-align:center"><h2>Cookie settings</h2><p>intro</p><div style="text-align:left">Necessary…</div><div style="display:flex;justify-content:flex-start"><button>Decline</button><button>Accept</button></div><a style="display:block;text-align:center">Cookie Policy</a></div>` at 360px.
- **Good (b):** everything left-aligned and the two buttons `flex:1`.
- **Look-alikes:** (1) a centred icon + title + text + one full-width button (all centre/neutral); (2) a dialog whose only centred element is the title; (3) an input whose error state shows a red border on white (5:1).
- **Plug:** `measure()` in playwright/checks/run.js, and `dialogAxis` in checks/layout.js next to `alignment`. The cookie panel is opened by `stateChecks` through the footer "Cookie settings" opener.

### G11 — 2.14: text runs into the next table cell or grid column (izrv19)
- **Kind:** rendered, every route and viewport and every state (`textCutOff` already runs in all three).
- **Measure:** for each `td, th, [role=cell], [role=gridcell]` (and children of a `grid`/`subgrid` row), take the union of the glyph Range rects of its text. If it extends more than 2px past the cell's right (or left, in RTL) edge *and* intersects the next cell's glyph rects or content box, fail hard ("'praxis_consultation_state' runs 64px into the Purpose column").
- **Bad:** `<table style="table-layout:fixed;width:360px"><tr><td style="width:120px"><span style="white-space:nowrap">praxis_consultation_state</span></td><td>Keeps an unfinished request…</td></tr></table>`.
- **Good:** `<span style="white-space:nowrap">praxis_</span><wbr><span style="white-space:nowrap">consultation_state</span>`.
- **Look-alikes:** (1) a cell with `overflow-x:auto` (a scroller); (2) a `colspan=2` cell whose text is wider than one column; (3) a cell with `text-overflow:ellipsis` (already the ellipsis rule).
- **Plug:** `textCutOff` in playwright/checks/fit.js as a fourth kind, `spill-cell`. Today "spill" needs a painted box (l.140–155), and an unpainted cell never counts.

### G12 — 1.20: one typeface for the header's word controls (f8e3xf, m0n604)
- **Kind:** rendered, every route at desktop widths (where the header shows its controls).
- **Measure:** in the header bar (`header, [role=banner]` top-most), take the visible `a, button, [role=combobox]` with a word label of at least 4 letters that is not all-caps. Codes such as EN, AZ, USD are exempt. Leave out the logo or wordmark link (`logoHome` candidate) and icon-only controls. Group them by the first family in computed `font-family`. Two or more families fail hard and list each family's labels ("body: Specialists, Services, Pricing…; display: Sign in, Join Platform, Currency"). Soft: font-size spread over 1px among them.
- **Bad:** `<header><nav><a style="font-family:Inter;font-size:13px">Specialists</a><a style="font-family:Inter">Services</a></nav><button style="font-family:Fraunces;font-size:12px">Currency</button><a style="font-family:Fraunces;font-size:12px">Sign in</a><a style="font-family:Fraunces">Join Platform</a></header>`.
- **Good:** every control in Inter 13px.
- **Look-alikes:** (1) the wordmark `<a href="/">PRAXIS</a>` in the display face; (2) the language toggle `EN · AZ · KK` in a mono face; (3) a mobile burger icon.
- **Plug:** a new `headerFaces(page)` in playwright/checks/looks.js, called per route in babysitter.spec.js under the 1.20 block (l.292). The data is per page, so it doesn't go through `roleLookOutliers`.

### G13 — 2.7: a marker or badge sits level with the label it marks (1r8w0p, m0oxf9)
- **Kind:** rendered, at rest, plus `measure()` for panels that open (the Parallel cookie panel is a collapsible).
- **Measure:**
  - (a) **Marker.** In each `li` or repeated sibling of a list (3 or more), find a decorative marker: `aria-hidden` or no text, at most 24px, `border-radius` ≥ 50%, usually `position:absolute`. Its label is the first text element of the same item. If the marker's vertical centre is more than max(4px, ½ line-height) from the centre of the label's first line box, fail hard. It stays quiet when the marker is level (±2px) with the top edge of the item's card (a connector into the card's edge).
  - (b) **Badge.** In a flex row with `align-items: flex-start|normal|stretch` that holds exactly one single-line label and one short (≤ 3 words) badge or caps span of a different font-size/line-height, compare their first-line centres. More than 2px apart fails hard ("use items-center or items-baseline").
- **Bad (a):** `<ol><li style="position:relative"><span aria-hidden style="position:absolute;top:6px;width:14px;height:14px;border-radius:50%"></span><div style="padding-left:32px"><div style="padding:28px"><span style="font-size:24px">01</span> Apply</div></div></li>…×4</ol>` (marker centre 13px, number centre about 44px).
- **Bad (b):** `<div style="display:flex;align-items:flex-start;gap:12px"><p style="font-size:14px;line-height:20px">Strictly necessary</p><span style="font-size:12px;line-height:16px;text-transform:uppercase">Always on</span></div>`.
- **Good:** the marker's `top` matches the number's line centre; `align-items:center` on the badge row.
- **Look-alikes:** (1) a timeline dot centred on the card's top border; (2) a two-line description next to a badge at its top (the label isn't single-line); (3) bullet `li::marker` (not an element).
- **Plug:** `alignment(page)` in playwright/checks/layout.js (l.473) gets two passes, `markerLevel` and `badgeLevel`. The badge pass also goes in `measure()`.

### G14 — 2.7: side nav and content start on one line, and on one line across account pages (dbrs0h)
- **Kind:** rendered, signed-in routes at 1280 and 1440 (each role), plus site-wide.
- **Measure:** an app shell is a grid or flex row with a column that holds `nav`/`aside` with 3 or more links and a sibling main column. Take the top of the first visible text line in each column (nav label "ACCOUNT", content eyebrow or h1) at scrollY = 0. If they differ by 4–96px, fail hard. Site-wide: the content's first text top for each route with the same shell differs by more than 4px from the mode, which is hard ("the masthead starts at 104px on /dashboard/wallet and at 64px on /dashboard").
- **Bad:** `<div style="display:grid;grid-template-columns:12rem 1fr;padding-top:40px"><nav><p>ACCOUNT</p><ul><li><a>Dashboard</a><li><a>Tasks</a><li><a>Wallet</a></ul></nav><section style="padding-top:40px"><span>STATEMENT</span><h1>Wallet</h1></section></div>`.
- **Good:** the section has no extra `padding-top`.
- **Look-alikes:** (1) a full-width page header above the grid (not inside a column); (2) a sidebar that starts with a search field and no text (use the field's top, Δ 0); (3) a sticky sidebar measured after scroll (always measure at 0).
- **Plug:** a new `shellTops(page)` in checks/layout.js, run per route in layout.spec.js. The site-wide part sits with `collectHeadings`/`headingVariants`.

### G15 — 2.6 / 2.12: one slot, one line count in a row of equals (ysspcg, tjm4fx)
- **Kind:** rendered, at rest, **hard**, and also in run.spec's `i18n [<code>]` test (every language × viewport).
- **Measure:** take sibling cards in one row (2.6, 3 or more same class signature) or repeated list rows (2.12). Match descendants by slot (tag + class signature + child-index path). For slots whose text is short (≤ 3 words or ≤ 24 chars, or a number/money+unit block), count line boxes from the Range rects. If the majority render in 1 line and an item renders in 2 or more, fail hard ("'IN PROGRESS' wraps to 2 lines; 'WAITING' and 'COMPLETED' fit 1"). For 2.12 rows also fail when that slot's top offset from the row top differs by more than 6px from the majority ("'1,200 kreditlər' starts 18px above the name in 2 of 5 rows").
- **Bad:** `<div style="display:flex;gap:12px;width:420px">` with three `flex:1;min-width:120px` cards and labels `<span style="letter-spacing:.2em;text-transform:uppercase">Waiting / In progress / Completed</span>`. AZ rows: `<div class=row><span>Erik O.</span><span class=price>800 kreditlər €71</span></div>` versus `1,200 kreditlər` wrapping.
- **Good:** labels fit on one line (wider middle tile, or `whitespace-nowrap`), and the price stays on one line in every row.
- **Look-alikes:** (1) card descriptions of 2–3 sentences (long text, not compared); (2) catalogue titles of 5+ words in an `h3`; (3) a slot that wraps in *every* card.
- **Plug:** `rowAlignment` (checks.js l.742) and `repeatedRowColumns` (l.922). Raise 2.12's slot-wrap case from `soft` to `hard` in babysitter.spec.js l.109 and add both to run.spec.js `i18n` (the docs list for that test has no 2.6/2.12). Needs a signed-in account with tasks (prepare already reaches /dashboard/tasks).

### G16 — 2.5: headings break into balanced lines on phones (c7p1wg)
- **Kind:** rendered, 360 and 390, h1–h3, every language.
- **Measure:** find line boxes from the word Range rects.
  - (a) **Forced break plus wrap.** The heading has a `<br>` or a `display:block` child span, *and* a segment between forced breaks wraps by itself. A line with 1 word, or narrower than 35% of the widest line, fails hard.
  - (b) **Unbalanced.** No `text-wrap: balance|pretty` and 3 or more lines. Clone the node off-screen with `text-wrap: balance` at the same width. If the clone has the same line count and its min/max line width ratio rises from below 0.4 to 0.6 or more, fail hard. The one-word orphan stays soft as today.
- **Bad:** `<h2 style="width:330px;font:900 32px/0.95 sans-serif;text-transform:uppercase">Reading a list is slower<br>than describing the job</h2>` (wraps to "READING A LIST IS / SLOWER / THAN DESCRIBING / THE JOB").
- **Good:** `<h2 style="text-wrap:balance">Reading a list is slower <br class="lg-only">than describing the job</h2>` (the `br` is hidden below lg).
- **Look-alikes:** (1) a deliberate 2-line poster heading where both segments fit their line (no segment wraps); (2) a 2-line heading with a 45%/100% split (ratio ≥ 0.4).
- **Plug:** `textBreaks(page)` in checks/layout.js (l.382), which already gets the per-character rects and runs at 390/360 and in run.spec i18n.

### G17 — 2.6: buttons stacked on a phone share one width (2jsnme)
- **Kind:** rendered, viewports ≤ 480px.
- **Measure:** in one container (same parent, or a flex-col/wrap group), take 2 or more *button-styled* controls (painted fill or four borders; text links don't count) that are stacked: their x ranges overlap by more than 50% and their y ranges are disjoint. If the widths differ by more than 8px and neither is at least 98% of the container's content width, fail hard. Also fail when one is full width and the other isn't.
- **Bad:** `<div style="display:flex;flex-direction:column;align-items:flex-start;gap:12px"><a class=btn>Post a task</a><a class=btn-outline>Browse specialists</a></div>` at 390px (widths 138 / 182).
- **Good:** `align-items:stretch` (both full width).
- **Look-alikes:** (1) a primary button above a plain "Cancel" text link; (2) two buttons in different cards that happen to stack in the page flow; (3) icon buttons in a vertical toolbar.
- **Plug:** `rowAlignment` (checks.js l.742, the 2.6 test) as a `stackedWidths` pass.

### G18 — 2.6: dividers follow the stacking (qgevme)
- **Kind:** rendered, every viewport (fires at phone widths).
- **Measure:** a group of 3 or more siblings in a divider pattern. Each child except the first draws `border-left` (or each except the last draws `border-right`, the Tailwind `divide-x`), with the same width and colour. If the siblings are *stacked* (same left within 2px, increasing tops), the vertical rule doesn't separate anything: fail hard ("vertical dividers left on a stacked strip; use divide-y below sm").
- **Bad:** `<dl style="display:flex;flex-direction:column"><div>Created</div><div style="border-left:1px solid #ddd">Specialist</div><div style="border-left:1px solid #ddd">Category</div></dl>` at 360px.
- **Good:** `flex-col divide-y sm:flex-row sm:divide-y-0 sm:divide-x`.
- **Look-alikes:** (1) a side nav `ul.border-l` whose `li a` each have `border-l-2` (every item, not "all but first"); (2) a vertical timeline line on the container; (3) blockquote-style accent borders on every card.
- **Plug:** the double-seam pass of `rowAlignment` (checks.js l.~892), which already reads touching borders.

### G19 — 6.5: one alignment for section headings on a page (k6c1vm)
- **Kind:** rendered, every route at 1280 and 1440.
- **Measure:** take the page's section `h2`s with the same look (6.5's face+size key), at least 3 of them. Skip any inside the first section (the hero), a band with its own background (CTA band), a card or a dialog. The effective alignment is `centre` when computed `text-align:center` or the line box is centred in its container (±4px); otherwise `start`. If at least two-thirds share one alignment and an outlier differs, fail hard.
- **Bad:** three `<h2 class=pk-heading>` left-aligned (`SPECIALISTS`, `PRICING`, `HOW IT WORKS`) and `<h2 class="pk-heading text-center">FROM BRIEF TO HIRED</h2>`, all on the page ground.
- **Good:** all left-aligned.
- **Look-alikes:** (1) a centred `h2` inside the orange closing CTA band; (2) a centred hero `h1`; (3) a page with only two section headings.
- **Plug:** `collectHeadings` (checks/layout.js l.339) records alignment and section context, plus a per-page comparison next to `headingVariants`.

### G20 — new 2.17: one content width per page (1xtxc4)
- **Kind:** rendered, at 1280 and 1440.
- **Measure:** for each top-level section, take its *visible box*: the nearest descendant with its own background or border **and** `border-radius > 0`, or else its widest text column. The page's content width is the median width of the text columns. A visible box wider than that by more than 8% and more than 64px, while not full-bleed (narrower than the viewport minus 2px, or rounded), fails hard ("the closing band is 1400px; the content above is 1248px").
- **Bad:** sections with `max-width:78rem` and a last section `max-width:100rem` holding `<div style="border-radius:24px;background:#ff6a1f;padding:56px 48px">BRING THE TASK…</div>`.
- **Good:** the band in the same `max-width:78rem` container.
- **Look-alikes:** (1) a full-bleed coloured section (edge to edge, no radius) whose inner text keeps 78rem; (2) a wide hero image as the first section; (3) a pricing table that is wider by 40px (under 64px).
- **Plug:** a new `contentWidths(page)` in checks/layout.js, run per route in layout.spec.js; docs go in `docs/checks-layout.md`.

### G21 — FM13: success doesn't look like the text it replaces (s6dz59)
- **Kind:** rendered, forms suite, where a success can be imitated (sandbox 200).
- **Measure:** before the submit, record the texts in the submit row and the form footer (same parent as the submit button, or within 48px). After the imitated success, find the success text (already found by FM4). If it takes the place of a prior text (same parent, or bbox overlap ≥ 50%) and has the same computed colour (ΔE < 10), the same weight (±100), no new fill or border, and no new icon or `role=status` styling, fail hard ("'Message received…' looks exactly like the hint that was there before; give it a success tone (colour, tick, box)").
- **Bad:** `<div class=row><button>Send</button><p style="color:#111;font-weight:600">We reply within a day.</p></div>` becoming `<p style="color:#111;font-weight:600">Message received…</p>`.
- **Good:** a green tick pill `<p role=status style="background:#e7f8ec;color:#137333;border-radius:12px">✓ Message received…</p>`.
- **Look-alikes:** (1) the whole form is replaced by a "Thanks" panel with a heading; (2) a toast in the corner; (3) prior text in muted grey and success in a bold accent colour.
- **Plug:** `submitOutcomes` (checks/forms.js l.495) next to the existing FM13 comparison (l.~557).

### G22 — FM1: the bounds the form states are accepted (dejlep)
- **Kind:** rendered, forms suite, and on every wizard step that has a numeric field.
- **Measure:** read the field's range from `min`/`max` and from the text next to it (hint, error, label): `between A and B`, `from A to B`, `A–B`, `at least A`, `minimum A`, `up to B`. Type A, then B. If either shows an inline error, `aria-invalid`, or disables the submit, fail hard ("25 is refused although the message says 'between 25 and 500'"). Type A − step and B + step: these must be refused (existing FM1 logic). The two must agree.
- **Bad:** `<input id=rate type=number> <p class=error>Your rate must be between 25 and 500 credits</p>` with the check `rate <= 25 → error`.
- **Good:** `rate < 25 → error`.
- **Look-alikes:** (1) "more than 25" (exclusive wording: 25 must be refused); (2) the range printed for another field in the same fieldset (match by `aria-describedby` or the closest field).
- **Plug:** `numericBounds` (checks/forms.js l.388) adds the stated bounds to `values`. `walkWizard` (run.js l.424) calls it on each step so the onboarding rate step is reached.

### G23 — new 2.19: an empty box doesn't scroll (prmi5d)
- **Kind:** rendered, every route (needs a task with no messages: a dynamic route instance from prepare).
- **Measure:** an element with `overflow-y:auto|scroll` and `scrollHeight > clientHeight + 1` whose content is an empty state: fewer than 2 repeated children, and text matching `/\b(no (messages|items|results|tasks|activity)( yet)?|nothing (here|yet)|empty)\b/i`, or a single child with a fixed height. Also fail when the overflow is under 64px and caused only by padding plus a fixed-height placeholder. Hard ("the 'No messages yet' box scrolls by 24px").
- **Bad:** `<div style="height:400px;display:flex;flex-direction:column"><div style="flex:1;min-height:0;overflow:auto"><div style="padding:16px"><div style="height:380px">No messages yet</div></div></div></div>`.
- **Good:** `<div style="height:100%">` for the placeholder.
- **Look-alikes:** (1) a thread with 3 messages that scrolls; (2) a box with `overflow:auto` that doesn't overflow; (3) a 1px rounding overflow (≤ 1).
- **Plug:** a new function in playwright/checks/details.js, registered in babysitter.spec.js next to 2.16 (l.64).

### G24 — wizard walk: satisfy what the step's error asks for, then 2.14 measures the next step (uzbnam)
- **Kind:** rendered, `stateChecks → walkWizard` (run.js l.424).
- **Measure:** no new detector. 2.14 `textCutOff` already reports a short text truncated with "…" ("Day" → "Da…") and runs in `measure()` after each step. The gap is reaching the step. When Continue doesn't advance and a new inline error sits in a `fieldset`/`[role=group]` of checkboxes or chip toggles ("Choose at least one discipline", "Pick the band that fits"), tick the first enabled option of that group and press Continue once more. Today `fillSample` (l.~91) skips non-required checkboxes that aren't consent boxes, so Parallel's step 2 never advanced to Identity (DOB).
- **Bad (fixture):** step 1 `<fieldset><legend>Disciplines</legend><label><input type=checkbox name=spec> ML</label>…</fieldset><button>Continue</button>` with JS that refuses to advance and shows "Choose at least one" until a box is ticked. Step 2 has `<button role=combobox style="width:52px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Day</button>`.
- **Expected:** the walk ticks one box, reaches step 2, and 2.14 reports "'Day' shows as 'Da…'".
- **Look-alikes:** (1) a step whose error is about a text field (already handled by `fillSample`); (2) a final step (FINAL_RE, still never pressed).
- **Plug:** `walkWizard` and `fillSample` in playwright/checks/run.js.

---

## Table (all 34 deferred rows)

| card | product | what | bucket | check / reason |
|---|---|---|---|---|
| 9slhlk | Praxis | Cookie banner doesn't list every stored item (no "unfinished request") | NEW-CHECK | G3 (c) CT20 `what the site stores`: a closed list missing an item another list has, plus the count word |
| 2ixn7g | Praxis | AZ "Kuki" vs "Cookie" | NEW-CHECK | G1 CT19 loanword spelling per locale (no built-in group today; CT19 has en/fr groups only) |
| tjm4fx | Praxis | AZ 360: price block wraps to 3 lines, off level with the name | NEW-CHECK | G15 2.12 slot line count and top offset, hard, also in run.spec i18n |
| qgevme | Praxis | 360: vertical dividers left on a stacked strip | NEW-CHECK | G18 2.6 divider pattern on stacked siblings |
| 32q0gs | Praxis | 360: cookie settings mixes centre and left | NEW-CHECK | G10 (b) `dialogAxis` in `measure()` (the opened dialog) |
| lzldsx | Praxis | Pricing "write to support" vs Terms/Payments/Refund "open a dispute" | NEW-CHECK | G3 (a) CT20 `recourse after acceptance` (not caught by 5.4.1 on the pre-fix snapshot) |
| q26219 | Praxis | Agreement: team agrees the tasks vs Payments/site: specialist chooses | NEW-CHECK | G3 (b) CT20 `who sets the specialist's task list` (closed phrase list; lowest confidence) |
| 69ukru | Praxis | /become-partner "mark it complete" vs Agreement/Terms "mark it delivered" | NEW-CHECK | G2 CT19 group `work handover` |
| 992bgb | Praxis | About says the card marks are in the Payments Policy; they aren't | NEW-CHECK | G8 F5/P3 claim "marks shown in X" checked against X's `main` |
| 0a32tm | Praxis | EUR calculator "10 per €0.89" doesn't reproduce the result | NEW-CHECK | G9 (b) calculator arithmetic in `moneyFormat` per currency |
| 894xch | Praxis | EUR: calculator range repeated twice in the brackets | NEW-CHECK | G9 (c) bracket repeats the main amounts / "equivalent in" the same currency |
| 3v7u9n | Praxis | Shown EUR rate doesn't reproduce prices or balance | NEW-CHECK | G9 (a) rate arithmetic `round(M·X/N,2)` |
| tpp8au | Praxis | "PRAXIS Specialist Agreement" vs footer "Specialist Agreement" | NEW-CHECK | G4 CT15 brand prefix parity (CT15/21/22 treat brand-prefixed names as one name by design; not caught on the snapshot) |
| f8e3xf | Praxis | Header: currency, Sign in, Join in another face than the nav | NEW-CHECK | G12 1.20 `headerFaces` |
| m0n604 | Praxis | Header: currency, Sign in, Join look serif | NEW-CHECK | G12 (same cause as f8e3xf, fix `fae5f6f`) |
| 1r8w0p | Praxis | /become-partner timeline circles not level with the step numbers | NEW-CHECK | G13 (a) 2.7 marker level with its label |
| dbrs0h | Praxis | Account pages: side nav label and page header start at different heights | NEW-CHECK | G14 2.7 `shellTops` (in-page and across account pages) |
| ysspcg | Praxis | Dashboard stat boxes: "In progress" wraps, the others don't | NEW-CHECK | G15 2.6 slot line count in a row of equal cards |
| dejlep | Praxis | Rate 25 refused although the message says "between 25 and 500" | NEW-CHECK | G22 FM1 stated bounds accepted |
| prmi5d | Praxis | Empty message thread area scrolls | NEW-CHECK | G23 new 2.19 empty scroll box |
| xp7pmu | Praxis | Footer Contact link disappears when signed in | NEW-CHECK | G7 F0 footer link set: anonymous vs each role |
| izrv19 | Praxis | Cookie Policy "Essential cookies" table: name runs into the Purpose column (fix `14b45f1`; not a dialog overlap) | NEW-CHECK | G11 2.14 `spill-cell`: glyphs past the cell edge into the next cell |
| gjfjnc | Parallel | Cookies, Cancellation and Delivery have no contents rail | NEW-CHECK | G6 P2 parity across policies + `POLICY_RE` misses `/delivery-policy`. /cookies (6 h2) already trips P2's ≥ 6 rule; the other two are new |
| 49kc72 | Parallel | How It Works buttons labelled "/pricing", "/register" | NEW-CHECK | G5 CT12 label is a path (rendered + static `href={x}>{x}`) |
| 9a8qvx | Parallel | "Tasks" in the cabinet vs "Orders" in the header menu | **CAUGHT-NOW** | **CT21 (a) `labelDrift`**, lib/content-consistency.js. Static, so the closed dropdown is read from JSX. On `9c641c9^` it reports header.tsx:75 and :163 "Orders" → /dashboard/tasks vs sidebar "All tasks"/page "Tasks". Minor: the suggested name is "All tasks", not the page's own "Tasks" |
| 2jsnme | Parallel | Stacked mobile buttons of different widths | NEW-CHECK | G17 2.6 `stackedWidths` |
| c7p1wg | Parallel | Awkward heading line breaks on mobile | NEW-CHECK | G16 2.5 forced `<br>` + wrap / balance test (cause in fix `4ce35fe`: a `<br>` kept at phone widths) |
| 2s63fa | Parallel | After creating a task the mobile shortlist sits left | CANNOT-AUTOMATE | The state exists only after posting a brief that creates a task (POST, which `stateChecks` aborts by design; the forms sandbox can only fake a 200, not the matcher's shortlist payload). The defect (fix `0a59397`: a wrapped price/badge group with no `w-full`/`ml-auto`) would be found by a "wrapped trailing group loses its right alignment" pass in G15/2.12 on any *reachable* list, but not on this page without a test account that already holds a matched brief (`states.allowPost` is a product decision) |
| m0oxf9 | Parallel | Cookie settings: "ALWAYS ON" not level with "Strictly necessary" | NEW-CHECK | G13 (b) 2.7 badge level with its label (in `measure()`, the panel is a collapsible) |
| k6c1vm | Parallel | Home: "From brief to hired" centred, other section headings left | NEW-CHECK | G19 6.5 heading alignment per page |
| 1xtxc4 | Parallel | The closing CTA band is wider than the content above | NEW-CHECK | G20 new 2.17 one content width per page |
| s6dz59 | Parallel | /contact success message looks like the text before it | NEW-CHECK | G21 FM13 success vs the text it replaces |
| zu9088 | Parallel | Input border disappears in the gibberish error state | NEW-CHECK | G10 (a) 1.9 `inputVisibility` in `measure()` and after FM2 (fix `72c1a53`: red border on the orange band) |
| uzbnam | Parallel | DOB day picker shows "Da…" on onboarding | NEW-CHECK | G24 the walk ticks the checkbox group the step error names; 2.14 ellipsis then catches "Da…" on the Identity step |
