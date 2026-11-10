# FORMS checks: inputs, validation, auth lifecycle, feedback, state freshness

These checks cover the form defects that came back on project after project in the factory's QA cards: amount fields
without bounds, contact forms that accept gibberish, forms that empty themselves on an error, missing or false
"sent" messages, stale headers, late "not enough credits" errors, broken password resets, cluttered auth pages,
pages that flash before a redirect, and email fields you can edit with no verification.

| Where | File |
|---|---|
| Runtime checks | `playwright/checks/forms.js` |
| Playwright tests | `playwright/forms.spec.js`, run once at `desktop-1440` |
| ESLint rules | `rules/eslint/rules/numeric-input-bounds.js`, `rules/eslint/rules/mutation-refreshes-ui.js` |
| Fixture tests | `test/forms.test.mjs` with pages in `test/fixtures/forms/`, plus `rules/eslint/test-forms.mjs` |

## Safety: nothing is really submitted

Any check that clicks a submit button first installs `sandbox(page)`. It answers every non-GET request inside the
browser with `page.route → fulfill`, so nothing reaches the server: a 200 that echoes the request's JSON for the
"success" case, or a 500/422 for the "failure" case. GET requests go through, so pages and data load normally.
Service workers are blocked, so they cannot carry a request past the sandbox.

Some forms are never submitted at all; the checks only type into their fields:

- **Payment forms**: pay, checkout, top up, buy, card, CVC, IBAN, amount or credits fields, Stripe frames.
- **Destructive forms**: delete, remove, deactivate, cancel a subscription, unsubscribe.

Search and filter forms (GET forms, `role=search`) are skipped.

You can safely run the suite against production and shared demo accounts. Still, the stale-UI check (FM5) is only
sure of its result when the page applies the echoed reply. When the page re-reads its data instead, the result is
"not checked" and has to be confirmed by hand.

## Checks

A check is either hard, soft or "not checked". A **hard** check fails the test. A **soft** check is a heuristic: with
`STRICT=0` it becomes a warning, otherwise it fails too. A **"not checked"** result is attached to the test as a note.

| Id | Check | How it decides | Hard / soft |
|---|---|---|---|
| FM1 | Number, amount, quantity, credits, phone, IBAN and card fields refuse bad values. | In each field it types `-1`, `999999999`, `abc`, and also `1.5` where only whole numbers make sense. A value passes if the field clamps it, rejects it, marks itself `aria-invalid`, shows a message next to it, or blocks or disables the action. Fields in payment and destructive forms are only typed into. Other forms are submitted in the sandbox. | Hard when the value is accepted or sent. Soft when the value is blocked but nothing says why, or when an amount field has `min`/`max` but the range is not printed next to it. |
| FM2 | Contact, feedback and profile forms reject gibberish. | It fills Name `q`, Subject `qq`, Message `asdf` and submits in the sandbox. A form that sends this has no check in the browser. Whether the server checks it is unknown, because nothing reaches the server. | Soft |
| FM3 | A failed submit keeps the values and shows an error. | The sandbox answers 500. The check fails if any non-password value is emptied, or if the page says nothing. After a failed sign-in, the password should be cleared and the email kept. | Hard. The sign-in password rule is soft. |
| FM4 | Feedback after a submit. | After a failed submit, no success text may show. After a successful submit (sandbox 200), something visible must appear within 2 s: new text, a toast or `aria-live` message, a new URL, or the form going away. Sign-in, sign-up, Server Action and full-page-post forms are not faked as successful. | Hard |
| FM5 | A saved display name shows in the header without a reload. | This runs on signed-in pages where the name field's value appears in the header, nav or user menu. If the header does not change and the page re-reads nothing, it is a finding. If the page re-reads its data (an RSC refresh or a GET to its API), the result is "not checked". | Soft |
| FM6 | An action the balance cannot pay for says so before the click. | It reads the balance ("Balance: N", or "N credits" in the header or sidebar) and each action's price in credits. When the price is higher than the balance, a disabled button with no reason fails, and so does an enabled button with no "not enough credits / top up" note. It uses `forms.zeroBalanceRole` (a role from `roles`, signed in by `prepare`) or `forms.zeroBalanceStorage` when one is set, otherwise the signed-in user's balance. | Hard |
| FM7 | The password lifecycle works. | (a) "Forgot password?" goes to a real page, not a 404 or a "not available" pop-up. That page has an email field, and its submit (sandboxed) shows a neutral confirmation. (b) Change password rejects the current password as the new one before anything is sent, and asks for the new password twice. (c) Every password field on settings, reset, confirm and other pages has its own show/hide eye. The eye is searched only inside that field's own wrapper, so the Password field's eye never counts for Confirm password (praxis #171). Sign-in and sign-up pages stay with acceptance A1. | (a) hard, with a soft wording check. (b) soft. (c) hard. |
| FM8 | Auth pages have a minimal shell. | On sign-in, sign-up and reset pages, the logo links to `/`, a "Back to home" link exists (soft), there is no full site nav (3 or more non-auth links), and the footer is minimal (fewer than 4 non-legal links). | Hard |
| FM9 | No other page flashes before an auth redirect. | A `requestAnimationFrame` recorder logs what paints until the URL settles. It visits a protected page while signed out and the sign-in page while signed in. If a different page with real content (a heading, a password form, or more than 300 characters) paints before the final URL, that is a flash. "Loading…" and "Redirecting…" screens are fine. | Hard |
| FM10 | The account email is safe to change, and data can be exported. | An email input in settings that shows the user's own address must be read-only, unless the same box says a verification link will be sent. Settings should also offer "Export my data". | Email: hard. Export: soft. |
| FM11 | The browser saves the e-mail as the login. (5.2.0) | In a form with a password and two or more text fields before it (a sign-up), one of them says `autocomplete="username"`; a name field never does. The e-mail field is `type=email`; passwords say `new-password` on a sign-up and `current-password` on a sign-in. | Missing username: hard. Type and password tokens: soft. |
| FM12 | One failed submit, one error message. (5.2.0) | After a failed submit (the sandbox answers 500) the error is not shown both in a toast and in the form. | Hard. |
| FM13 | Success does not look like an error. (5.2.0) | Where a success can be imitated, the success message must not share the error message's styled look (the same box fill and border, or the same error-red text). | Hard. |
| FM14 | A phone field takes a real number. (5.5.0) | See "5.5.0 — from the miss loop" below. | Hard / soft. |
| FM15 | A file field says what it takes. (5.5.0) | See "5.5.0 — from the miss loop" below. | Hard. |
| FM16 | Every role has its own door. (5.8.0) | Links on the home page and the public pages whose words open the supply side ("Apply as a specialist", "Become an engineer", "Join as a reviewer", "Work with us", "For assistants", "Specialist portal") are followed — through one landing page if needed — to the sign-in / sign-up they reach. That page is read (heading, lead, badge, side panel, main text, "New here?" link, `<title>`) and compared with the customer's page of the same kind. See "FM16" below. | Same words (≥ 80%), no role named, the customer side panel, "New here?" to the customer sign-up: hard. Same `<title>`, a customer sign-in that opens as the role's door: soft. |

`forms.spec.js` runs FM1 to FM4 and FM7c on every route. On signed-in routes it also runs FM5, FM6 and FM10. FM7a,
FM7b, FM8, FM9, FM11, FM16 and data export run once for the whole site.

## Acceptance A6 and FM8

A6 still requires a footer on the sign-in and sign-up pages, as the business asked. FM8 limits what that footer may
contain: legal links, ©, a support email. The full site footer and the site navigation are findings there. Both
rules hold at the same time.

## ESLint rules

### `ui/numeric-input-bounds` (error, FM1)

This rule applies to `input`, `Input`, `TextField`, `NumberInput`, `AmountInput` and similar fields that are any of
these:

- `type="number"`
- `inputMode="numeric"` or `inputMode="decimal"`
- named like amount, price, quantity, credits, IBAN, card or phone

The field passes if any of these is true:

- It has both `min` and `max`.
- A zod or yup schema in the same file bounds the same key, for example `amount: z.number().min(1).max(20000)`.
- It uses `register("x", { min, max })`.
- The file clamps the value with `Math.min` + `Math.max` or `clamp(`.

IBAN, card and phone fields need `maxLength` or `pattern`, or a schema with `.max`, `.length` or `.regex`. One-time
codes, expiry, ZIP, search, ranges, and always read-only or disabled fields are out of scope.

### `ui/mutation-refreshes-ui` (warn, FM5)

This rule looks at `"use client"` files. It flags a handler that sends a mutation and then updates nothing on the
page. A mutation is a `fetch` with POST, PUT, PATCH or DELETE, or a `.post`, `.put`, `.patch` or `.delete` call on
`axios`, `api`, `http` or `client`.

Any of these counts as an update:

- a state setter other than a pure flag like `setLoading`, `setSaving`, `setError` or `setOpen`
- `router.refresh`, `router.push` or `router.replace`
- `revalidatePath` or `revalidateTag`
- SWR `mutate`
- React Query `invalidateQueries`, `refetch` or `setQueryData`
- a session `update()`
- `dispatch`
- an `onSomething()` callback prop

A handler that returns the response to its caller also passes.

## Configuration (`babysitter.config.json`)

```json
{
  "forms": {
    "skip": ["FM2"],
    "skipReasons": { "FM2": "contact form is a third-party widget" },
    "zeroBalanceRole": "empty-wallet",
    "protectedRoute": "/dashboard",
    "forgot": "/forgot-password",
    "roleAuth": {
      "routes": [{ "role": "specialist", "signIn": "/specialists/sign-in", "signUp": "/specialists/apply" }],
      "roleWords": ["scout"],
      "entryText": ["\\bscout hub\\b"],
      "entrySelectors": ["[data-role-entry]"],
      "pages": ["/", "/how-it-works"],
      "maxEntries": 6,
      "maxSimilarity": 0.8
    }
  }
}
```

`forms.roleAuth` (FM16) is optional. Every key has a default: the role words are a built-in list of supply-side nouns
(specialist, assistant, expert, engineer, reviewer, crew, partner, provider, freelancer, tutor, coach, host, driver,
seller, vendor, creator, consultant …) plus every name in `roles` except admin-like ones; the pages searched for doors
are `/` and up to 7 public routes; `routes` adds a role's sign-in / sign-up even when no link points at it.

The sign-in, sign-up and settings paths come from `acceptance.auth`. If those are not set, the checks look for routes
named `/login`, `/register` and similar. `acceptance.auth.passwordless` turns off the password checks.

## FM16 — every role has its own door (5.8.0)

The owner's words: the sign-in and sign-up of an assistant or a specialist must differ from the customer's — "right now
they are absolutely identical, not even a line of text tells them apart". Guildhall: "Apply as a specialist" opened
`/signin?role=specialist`, the customer sign-in word for word — "Welcome back", the customer marketing panel on the
left, "New here? Open your hall" — only the URL differed. The rule is export-rules/01-ui-components.md 8.17.

1. **Doors.** On `/` and up to 7 public routes (`forms.roleAuth.pages`), every same-origin link — hidden mobile-menu
   copies too — whose text matches the door words, or `forms.roleAuth.entrySelectors`. "Apply coupon", "Join now", "Get
   started" are not doors; "Join as a customer" is the customer's own. `forms.roleAuth.routes` adds doors by path.
2. **Where it lands.** A sign-in / sign-up is a page with a password field, or an e-mail field and auth words in the
   heading / path / title. A landing page ("Become a specialist") is followed one hop, through its main
   "Apply / Start your application / Sign up" link. A door that reaches neither is listed as "not checked".
3. **Whose door.** The role is the noun after "as a" / "become a" / "for", a role word in the link (`?role=specialist`,
   `/engineers/apply`), else in the heading or title it reached.
4. **Compared with** the customer page of the same kind (`acceptance.auth.signIn` / `signUp`, else `/login`, `/register`):
   - main text (header, nav, footer left out) ≥ `maxSimilarity` (0.8) the same words — **hard**;
   - the role is named nowhere in the heading, lead, badge / eyebrow or `<title>` — **hard**;
   - half or more of the customer side panel's sentences appear on the role's page — **hard**;
   - the "New here?" link goes to the customer sign-up (and does not name the role) — **hard**;
   - the `<title>` is the customer's — **soft**.
5. **The customer door** may not open as the role's: a customer sign-in / sign-up headed for a role, or whose "New
   here?" link goes to the role's application, is **soft**.

No door found: on a product whose `roles` hold a supply-side role it is a decision ("Babysitter decided not to check",
list the doors in `forms.roleAuth.routes`); on any other product it is a "not checked" note. Fixtures:
`test/fixtures/role-auth`, `test/role-auth.test.mjs`.

## Known limits

- FM16 compares signed-out pages. Where a role lands **after** signing in (its own area, not the customer dashboard)
  is not checked at runtime: review it by hand or in the product's own journeys (`e2e/journeys.spec.ts`).

- Only `<form>` and `[role=form]` count as forms. A formless group of inputs plus a button is checked by FM1 (number
  fields outside forms) and is not covered by FM2, FM3 or FM4.
- A Server Action's reply cannot be imitated. FM4 success and FM5 report such forms as "not checked".
- FM5 checks the display name only. Balance after a top-up and list counts after a delete or add need a real
  mutation, which these checks do not make on shared accounts. The ESLint rule covers them statically.
- FM6 needs both a visible balance and a price in credits on the same page.

## 5.5.0 — from the miss loop

Fixtures: `test/misses-550-states.test.mjs`, `test/issues-550-browser.test.mjs`.
- **FM1 stated bounds:** the range the page states for a field ("between 25 and 500", "€1 to €17,800", "at least 5") is
  typed; a refused end is hard (Praxis dejlep). A range "15 to 34" or the `aria-describedby` hint explains a refused
  value (issue #4, Kindred IBAN).
- **FM3 HTML error reply:** the sandbox also answers a failure with an HTML 404 page; showing "Unexpected token … is not
  valid JSON" / "<!DOCTYPE" after it is hard (Compass av0m5i).
- **FM4 no request:** a success message without any request sent is hard (Kindred vv08yz); an error or success message
  under 4.5:1 on its toast is hard (Compass b4jdlq).
- **FM13 prior text:** a success that takes the place of the text next to the submit in the same colour, weight and
  size, without a box or icon (Parallel s6dz59).
- **FM14 phone:** "+44 7700 900123" and "+1 415 555 0134" must be accepted; a digits-only hint beside a "+…" example and
  Country after Phone are soft (Compass 1r8kpw ay9r6a).
- **FM15 file:** a file input with no `accept` and no visible formats / size hint (Compass af1p4q).
