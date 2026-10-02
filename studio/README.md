# @babysitter/studio — Babysitter Studio (MVP)

A visual review sandbox that works with Claude's Babysitter. When the git pre-commit gate finds problems, it does not have to fail outright: it can **ask a human in the browser**. The problems are outlined in red on the running page, and the developer approves, rejects or comments.

```
 git commit ─► hook-pre-commit ─► REVIEW_REQUIRED ─┐        ┌─ browser (your dev site via the proxy)
                     ▲  (waits)                     ▼        │   Shadow-DOM panel + red frames
                     └──── DECISION ◄──── WebSocket bus ◄────┘   APPROVE · REJECT · COMMENT
                                         (same port as the proxy, /__babysitter/ws)
```

| Part | File | What it does |
|---|---|---|
| Local proxy | `lib/server.js` | `http-proxy` in front of the dev server (`:3001 → :3000`). Requests `identity` encoding, injects `<script src="/__babysitter/injector.js">` before the **last** `</body>` of HTML responses, and passes everything else through, including the dev server's HMR WebSocket |
| WebSocket bus | `lib/bus.js`, `lib/protocol.js` | `ws` on `/__babysitter/ws`. The CLI (`?role=cli`) sends `REVIEW_REQUIRED`. Panels (`?role=studio`) send `APPROVE` / `REJECT` / `COMMENT`. The bus answers the CLI with `DECISION` / `COMMENT`. A panel that opens later is replayed pending reviews; when the CLI disconnects, the review is withdrawn |
| CLI client | `lib/review-client.js`, `bin/studio.mjs review` | Sends the review and waits. Exit **0** approve, **1** reject or timeout (fail closed), **2** no studio running |
| Injector | `client/injector.js` | Vanilla JS in a Shadow DOM, so the site's Tailwind cannot reach it. A floating panel with Approve / Reject / Comment and red frames over `document.querySelector(selector)`, kept in place on scroll and resize. Only problems of the current route are framed; clicking another route's problem navigates there |

## Use

```bash
npx babysitter-studio start --port 3001 --target http://localhost:3000   # open http://localhost:3001
```

In `babysitter.config.json` of the project:

```json
"studio": { "enabled": true, "url": "http://localhost:3001", "timeoutSec": 900 }
```

From then on, a commit with UI problems waits for your decision in the panel:

- **Approve** lets the commit through, as a deliberate human override.
- **Reject**, or no answer before the timeout, aborts it.
- If Studio is not running, the normal blocking gate applies.

DOM problems come from the rendered micro-check, with a unique CSS selector each. Static problems (file:line) are listed in the panel without a frame.

Manual review from any script:

```bash
echo '[{"selector":"#country","message":"native select"}]' | npx babysitter-studio review --url http://localhost:3001
```

`npm test` (from this folder) runs the end-to-end suite: a real HTTP target, the proxy, a real browser and real `git commit`s through the pre-commit gate.
