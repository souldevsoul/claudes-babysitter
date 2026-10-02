# @babysitter/studio — Babysitter Studio (MVP)

A visual review sandbox that works with Claude's Babysitter. When the Claude Code Stop hook or the git pre-commit gate finds problems, it does not have to fail outright: it **freezes** (an awaited promise, no polling) and asks a human in the browser. The problems are outlined in red on the running page, and the developer approves, rejects or sends the work back with a comment.

```
 Stop / commit ─► hook ─────────► REVIEW_REQUIRED ─┐        ┌─ browser (your dev site via the proxy)
                     ▲  (waits)                     ▼        │   Shadow-DOM panel + red frames
                     └──── DECISION ◄──── WebSocket bus ◄────┘   APPROVE · REJECT · COMMENT
                                         (same port as the proxy, /__babysitter/ws)
```

| Part | File | What it does |
|---|---|---|
| Local proxy | `lib/server.js` | `http-proxy` in front of the dev server (`:3001 → :3000`). Requests `identity` encoding, injects `<script src="/__babysitter/injector.js">` before the **last** `</body>` of HTML responses, and passes everything else through, including the dev server's HMR WebSocket |
| WebSocket bus | `lib/bus.js`, `lib/protocol.js` | `ws` on `/__babysitter/ws`. The CLI (`?role=cli`) sends `REVIEW_REQUIRED`. Panels (`?role=studio`) send `APPROVE` / `REJECT` / `COMMENT`. Each of the three ends the review; the bus answers the CLI with `DECISION` (`approve` / `reject` / `comment` + text). Only the proxy's own origin may open a panel socket and only an origin-less (non-browser) client may act as the CLI; the server listens on 127.0.0.1. A panel that opens later is replayed pending reviews; when the CLI disconnects, the review is withdrawn |
| CLI client | `lib/review-client.js`, `bin/studio.mjs review` | Sends the review and waits. Prints `⏳ Visual Review required. Open http://localhost:3001` and waits. Exit **0** approve, **1** reject, comment (printed to stdout as `Reviewer comment: …`) or timeout (fail closed), **2** no studio running. The hooks use `lib/studio-gate.js` (`collectProblems` + `freezeForReview`) |
| Time Travel | `../lib/time-travel.js`, `../lib/studio-gate.js` | Journaled HEAD/working-tree swap for the After / Before switch (see below) |
| Visual Prompting | `client/injector.js`, `lib/bus.js`, `../bin/hook-prompt.mjs` | 🎯 Inspect picker, unique selectors, notes on the bus, delivery to Claude (see below) |
| Injector | `client/injector.js` | Vanilla JS in a Shadow DOM, so the site's Tailwind cannot reach it. A floating panel ("Babysitter: N problems", a clickable list that scrolls to the element, a comment box, Send Comment / Reject / Approve) and numbered red frames over `document.querySelector(selector)`. Frames are repositioned on scroll (capture, any scroller), resize, element resize and DOM mutations (HMR re-renders re-resolve the selector), at most once per animation frame. Only problems of the current route are framed; clicking another route's problem navigates there |

## Time Travel: After / Before (HEAD)

While a review is frozen, the panel shows **After | 👁 Before (HEAD)**. No iframe and no second server: the frozen CLI swaps the changed UI files on disk between the working tree and `git show HEAD:<file>`, and the dev server's own HMR re-renders the page (checked with Next 16: the page updates in place, no reload). On Before the panel turns amber and the frames hide, since the old DOM may not have those nodes. On After they come back.

```
panel ── TOGGLE_DIFF {side} ──► bus ──► the CLI that owns the review ── writes files ──► HMR
panel ◄── DIFF_STATE {side, error?} ◄── bus ◄──┘
```

The developer's work cannot be lost (`lib/time-travel.js`, 6 tests with real kills):

- **Journal first.** Both versions of every file are copied to `.babysitter/time-travel/` before anything changes. The journal says `BEFORE` before the first file is swapped, and `AFTER` only after the last one is back.
- **Only what we wrote gets overwritten.** Switching to Before checks that every file still holds the journaled AFTER content. If an editor or formatter touched one, nothing is swapped and the panel says which file.
- **Going back never refuses and never destroys.** Anything unknown found while restoring is copied to `.babysitter/time-travel-conflicts/<time>/` first.
- **Guaranteed restore.** `freezeForReview` uses try/finally, plus SIGINT/SIGTERM/SIGHUP and `exit` handlers. After a SIGKILL, every hook starts with `recover()`. By hand: `babysitter restore`.
- **Scope.** Untracked new files disappear for Before; deleted files come back. Modes are kept, writes are atomic (temp file + rename), Buffers make it binary-safe. Never swapped: `package.json`, lockfiles, `tsconfig`, `*.config.*`, `.env*`, files over 2 MB and non-UI files.
- **Narrow channel.** Panels send only the side enum. File paths come from git inside the CLI.

Off: `"studio": { "timeTravel": false }`.

## Visual Prompting: 🎯 Inspect

Point at **any** element, including one the automation did not flag, and leave a note for Claude.

- **Picking.** A blue frame follows the cursor (one `elementFromPoint` per animation frame, a 60 ms glide) with a `button.btn 120×40` label. It snaps to the nearest button, link or field around a `<span>` or `<svg>`. **Shift** picks the exact element, **Alt+↑** or ⬆ Parent goes up a level, **Esc** steps back. While you pick, the app never receives the clicks.
- **Note.** Clicking locks the frame and opens a popup next to the element ("What should change here?"). **Enter** saves. The note stays on the page as a blue `M1` frame (red frames are the automation's) and in the panel under **Manual Feedback**. Notes are kept on the bus, so they survive reloads and route changes; click one to scroll to it, × removes it.
- **Selector.** Unique and stable, built one step at a time from the element up: a stable id, then test or aria attributes, then up to two stable classes, then `:nth-child`. It stops as soon as the chain is unique. Generated ids (React `:r1:` / `«r1»` / `_R_…_`, base-ui, Radix, hashes) and utility classes with variants (`hover:…`) are skipped. Attribute values stay readable so Claude can grep them. The note also carries the element's text, classes and size, which are usually what finds it in the source.
- **Delivery.** Each note reaches Claude once, formatted like this:

  ```
  Manual QA Feedback:
  - Element: `button[aria-label="Период: Выручка"]`  (page /dashboard; text "Неделя"; class "flex w-fit …")
  - Instruction: "Make this a secondary button"
  ```

  | When | How |
  |---|---|
  | A review is waiting | Attached to **Reject** or **Send Comment** (Send Comment works with notes alone). **Approve** leaves them pending. |
  | Claude's turn ends with clean checks | The Stop hook returns them (exit 2). |
  | Nothing is waiting | The `UserPromptSubmit` hook (`bin/hook-prompt.mjs`) adds them to your next prompt as `additionalContext`. |

  Hooks take notes in two steps (`NOTES_TAKE` → `NOTES_OFFER` → `NOTES_ACK`), so a hook that times out loses nothing.

The page under review runs on the same origin as the panel, so its own scripts could add notes too. That is fine for your own dev server. Don't point Studio at third-party sites.

## Use

```bash
npx babysitter-studio start --port 3001 --target http://localhost:3000   # open http://localhost:3001
```

In `babysitter.config.json` of the project:

```json
"studio": { "enabled": true, "url": "http://localhost:3001", "timeoutSec": 900 }
```

From then on, a Claude turn or a commit with UI problems waits for your decision in the panel:

| In the panel | Stop hook (Claude Code) | git pre-commit |
|---|---|---|
| **Approve** | exit 0, the turn ends | exit 0, the commit goes through (deliberate human override) |
| **Send Comment** | exit 2: the comment goes to Claude as the brief for the next iteration | exit 1, comment on stdout |
| **Reject** / timeout | exit 2: "Review rejected by user" + the fix-list | exit 1, the commit is aborted |
| Studio not running | the usual 3-attempt blocking loop | the usual blocking gate |

The Stop hook reports back with exit 2, not 1: Claude Code only feeds a Stop hook's stderr to the model on exit 2. `init` sets the Stop hook timeout to 1800 s so a frozen review is not killed.

DOM problems come from the rendered micro-check, with a unique CSS selector each. Static problems (file:line) are listed in the panel without a frame.

Manual review from any script:

```bash
echo '[{"selector":"#country","message":"native select"}]' | npx babysitter-studio review --url http://localhost:3001
```

`npm test` (from this folder) runs the end-to-end suite: a real HTTP target, the proxy, a real browser and real `git commit`s through the pre-commit gate.
