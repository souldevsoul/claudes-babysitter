# FORMS checks: inputs, validation, auth lifecycle, feedback, state freshness

These checks cover the form defects that came back on project after project in the factory's QA cards: amount fields
without bounds, contact forms that accept gibberish, forms that empty themselves on an error, missing or false
"sent" messages, stale headers, late "not enough credits" errors, broken password resets, cluttered auth pages,
pages that flash before a redirect, and email fields you can edit with no verification.

| Where | File |
|---|---|
| Runtime checks | `playwright/checks/forms.js` |
| Playwright tests | `playwright/forms.spec.ts`, run once at `desktop-1440` |
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

`forms.spec.ts` runs FM1 to FM4 and FM7c on every route. On signed-in routes it also runs FM5, FM6 and FM10. FM7a,
FM7b, FM8, FM9 and data export run once for the whole site.

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
    "forgot": "/forgot-password"
  }
}
```

The sign-in, sign-up and settings paths come from `acceptance.auth`. If those are not set, the checks look for routes
named `/login`, `/register` and similar. `acceptance.auth.passwordless` turns off the password checks.

## Known limits

- Only `<form>` and `[role=form]` count as forms. A formless group of inputs plus a button is checked by FM1 (number
  fields outside forms) and is not covered by FM2, FM3 or FM4.
- A Server Action's reply cannot be imitated. FM4 success and FM5 report such forms as "not checked".
- FM5 checks the display name only. Balance after a top-up and list counts after a delete or add need a real
  mutation, which these checks do not make on shared accounts. The ESLint rule covers them statically.
- FM6 needs both a visible balance and a price in credits on the same page.
