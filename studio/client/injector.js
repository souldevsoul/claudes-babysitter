/* Babysitter Studio — review panel injected by the local proxy. Vanilla JS, everything inside a Shadow DOM
 * so the site's CSS (Tailwind resets included) cannot touch it and it cannot touch the site. */
(() => {
  if (window.__babysitterStudio) return;
  window.__babysitterStudio = true;

  const host = document.createElement("div");
  host.id = "__babysitter-studio";
  host.style.cssText = "all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
  const root = host.attachShadow({ mode: "open" });
  // Smooth-scroll libraries (Lenis, Locomotive, GSAP ScrollSmoother) take every wheel/touch event on the window
  // and scroll the page themselves, so the panel's own list never scrolls. Events that start inside the panel
  // stop at the host; Lenis also honours data-lenis-prevent. The page under the panel keeps its scrolling.
  host.setAttribute("data-lenis-prevent", "");
  for (const type of ["wheel", "touchstart", "touchmove"]) {
    host.addEventListener(type, (e) => { if (e.composedPath().some((n) => n.classList?.contains("panel"))) e.stopPropagation(); }, { passive: true });
  }
  root.innerHTML = `
<style>
  :host { all: initial; }
  * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .layer { position: fixed; inset: 0; pointer-events: none; }
  .box { position: fixed; border: 2px solid #ef4444; border-radius: 4px; background: none; box-shadow: 0 0 0 1px rgb(255 255 255 / 0.6); transition: box-shadow .2s; } /* outline only: nothing tints the element being judged */
  .box.pulse { box-shadow: 0 0 0 6px rgb(239 68 68 / 0.35); }
  .layer.off .box { display: none; }
  /* Before/After by screenshots: laid exactly over the viewport, flipped instantly */
  .layer.cmp-hide { display: none; }
  .layer.over { z-index: 2; } /* one element's After: its frame and Before/After stay above the snapshot */
  .cmp { position: fixed; inset: 0; pointer-events: none; display: none; }
  .cmp.on { display: block; }
  .cmp img, .cmp canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  .cmp img { display: none; }
  .cmp img.show { display: block; }
  .cmp canvas { display: none; }
  .cmp canvas.show { display: block; }
  .cmp .handle { position: absolute; top: 0; bottom: 0; width: 24px; margin-left: -12px; pointer-events: auto; cursor: ew-resize; display: none; touch-action: none; }
  .cmp .handle::before { content: ""; position: absolute; left: 11px; top: 0; bottom: 0; width: 2px; background: #facc15; box-shadow: 0 0 0 1px rgb(0 0 0 / .35); }
  .cmp .handle::after { content: "◀ ▶"; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); padding: 6px 8px; border-radius: 999px; background: #facc15; color: #1c1503; font: 700 11px/1 ui-sans-serif, system-ui; white-space: nowrap; }
  .cmp.slider .handle { display: block; }
  .cmp .badge { position: absolute; bottom: 14px; padding: 4px 10px; border-radius: 999px; font: 700 12px/18px ui-sans-serif, system-ui; box-shadow: 0 2px 10px rgb(0 0 0 / .35); }
  .cmp .badge.b { left: 12px; background: #facc15; color: #1c1503; }
  .cmp .badge.a { right: 12px; background: #22c55e; color: #052e16; display: none; }
  .cmp.slider .badge.a { display: block; }
  .tools { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 14px 8px; }
  .tools .chip[aria-pressed="true"] { background: #facc15; border-color: #facc15; color: #1c1503; }
  .layer.off .box.peek { display: block; }
  .tag { position: absolute; top: -12px; left: -12px; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; background: #ef4444; color: #fff; font: 600 11px/20px ui-sans-serif, system-ui; text-align: center; }
  .panel { z-index: 3; position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); width: min(560px, calc(100vw - 32px)); pointer-events: auto;
    background: #111318; color: #f4f4f5; border: 1px solid #2a2d35; border-radius: 14px; box-shadow: 0 12px 40px rgb(0 0 0 / .45); overflow: hidden; }
  .head button { flex: none; white-space: nowrap; }
  .head { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid #23262d; font-size: 13px; cursor: grab; user-select: none; touch-action: none; }
  .panel.dragging .head { cursor: grabbing; }
  .panel.dragging { transition: none; box-shadow: 0 18px 50px rgb(0 0 0 / .55); }
  .grip { color: #52525b; font-size: 12px; letter-spacing: -2px; }
  .collapse { padding: 2px 8px; font-size: 14px; line-height: 18px; background: transparent; color: #a1a1aa; border-color: #3f3f46; }
  /* never taller than the window: the list gives up its height first, the decision buttons stay */
  .panel { max-height: calc(100vh - 16px); display: flex; flex-direction: column; }
  .panel > .head { flex: none; }
  .body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
  .body > * { flex: none; }
  .body > .list { flex: 0 1 auto; min-height: 48px; }
  .panel.collapsed .body { display: none; }
  .panel.collapsed .head { border-bottom: 0; }
  .list li .ex { display: grid; gap: 3px; min-width: 0; }
  .ex .t { font-weight: 600; color: #f4f4f5; }
  .ex .el { color: #d4d4d8; }
  .ex .el .cnt { color: #a1a1aa; }
  .ex .why { color: #a1a1aa; }
  .ex .fix { color: #86efac; }
  .ex .tech { display: none; color: #71717a; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; word-break: break-all; }
  li.open .ex .tech { display: block; }
  .more { justify-self: start; padding: 0; border: 0; background: none; color: #71717a; font-size: 11px; font-weight: 500; text-decoration: underline; }
  .seg button:disabled { opacity: .45; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #71717a; }
  .dot.on { background: #22c55e; } .dot.alert { background: #ef4444; }
  .title { font-weight: 600; flex: 1 0 auto; white-space: nowrap; } .status { flex: 0 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .muted { color: #a1a1aa; font-size: 12px; }
  .list { max-height: min(46vh, 360px); overflow: auto; overscroll-behavior: contain; margin: 0; padding: 6px 0; list-style: none; }
  .list li { display: flex; gap: 8px; padding: 6px 14px; font-size: 12.5px; line-height: 1.4; cursor: pointer; }
  .list li:hover { background: #1b1e25; }
  .n { flex: none; width: 20px; height: 20px; border-radius: 10px; background: #ef4444; color: #fff; font-size: 11px; font-weight: 600; text-align: center; line-height: 20px; }
  .n.static { background: #3f3f46; }
  .where { color: #a1a1aa; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
  .foot { display: grid; gap: 8px; padding: 10px 14px 14px; border-top: 1px solid #23262d; }
  textarea { width: 100%; min-height: 44px; resize: vertical; padding: 8px 10px; border-radius: 8px; border: 1px solid #3f3f46; background: #0b0c0f; color: #f4f4f5; font-size: 13px; }
  textarea:focus-visible, button:focus-visible { outline: 2px solid #60a5fa; outline-offset: 2px; }
  .row { display: flex; gap: 8px; justify-content: flex-end; }
  button { appearance: none; border: 1px solid transparent; border-radius: 8px; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .approve { background: #16a34a; color: #fff; } .reject { background: #dc2626; color: #fff; } .ghost { background: transparent; color: #e4e4e7; border-color: #3f3f46; }
  button:disabled { opacity: .5; cursor: default; }
  .min { padding: 8px 14px; font-size: 12px; display: flex; align-items: center; gap: 8px; }
  /* Time Travel: After / Before (HEAD) */
  .tt { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-bottom: 1px solid #23262d; font-size: 12px; }
  .seg { flex: none; display: inline-flex; padding: 2px; border-radius: 8px; background: #0b0c0f; border: 1px solid #3f3f46; }
  .seg button { white-space: nowrap; padding: 4px 10px; font-size: 12px; font-weight: 600; border-radius: 6px; background: transparent; color: #a1a1aa; }
  .seg button[aria-pressed="true"] { background: #f4f4f5; color: #111318; }
  .panel.before { background: #231d0b; border-color: #a16207; }
  .panel.before .head, .panel.before .tt, .panel.before .foot { border-color: #3d3210; }
  .panel.before .seg button[aria-pressed="true"] { background: #facc15; color: #1c1503; }
  .tt .err { color: #fca5a5; }
  .layer.hidden { display: none; }
  /* Visual Prompting: blue = a human's note, red = the automation's finding */
  .box.code { border: 2px dashed #eab308; background: none; }
  .box.code.pulse { box-shadow: 0 0 0 6px rgb(234 179 8 / 0.35); }
  .box.code .tag, .n.code { background: #facc15; color: #1c1503; }
  .box.fixed { border: 2px solid #22c55e; background: none; }
  .box.fixed.pulse { box-shadow: 0 0 0 6px rgb(34 197 94 / 0.35); }
  .box.fixed .tag, .n.fixed { background: #22c55e; color: #052e16; }
  .list li.sep.fixed { color: #4ade80; }
  .list li.sep.red { color: #f87171; border-top: 0; margin-top: 0; }
  .list li.k-fixed .t::after { content: attr(data-done); margin-left: 6px; padding: 0 6px; border-radius: 6px; background: #14532d; color: #bbf7d0; font-size: 10.5px; font-weight: 600; }
  .prop { margin-top: 6px; padding: 8px 10px; border-radius: 8px; background: #17191f; border: 1px solid #2a2d35; display: grid; gap: 6px; cursor: default; }
  .prop .ptitle { font-size: 12px; color: #e4e4e7; } .prop .ptitle b { font-weight: 600; }
  .prop .pst { margin-left: 6px; font-size: 11px; color: #a1a1aa; }
  .prop.s-approved .pst { color: #4ade80; } .prop.s-rejected .pst, .prop.s-conflict .pst { color: #fca5a5; } .prop.s-revising .pst { color: #facc15; }
  .prop .pnote { font-size: 11.5px; color: #a1a1aa; } .prop .perr { font-size: 11.5px; color: #fca5a5; }
  .prop .pbtn { display: flex; flex-wrap: wrap; gap: 6px; }
  .prop .pbtn button, .prop .pc button { padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; border: 1px solid #3f3f46; background: #23262d; color: #f4f4f5; cursor: pointer; }
  .prop .pbtn button[data-pa=approve] { background: #16a34a; border-color: #16a34a; color: #fff; }
  .prop .pbtn button[data-pa=reject] { background: #3f1d1d; border-color: #7f1d1d; color: #fecaca; }
  .prop .pbtn button:disabled { opacity: .5; cursor: default; }
  .prop .pc { display: grid; gap: 6px; } .prop .pc[hidden] { display: none; }
  .prop .pc textarea { min-height: 54px; resize: vertical; border-radius: 6px; border: 1px solid #3f3f46; background: #0b0c0f; color: #f4f4f5; padding: 6px 8px; font-size: 12px; }
  .ba { position: absolute; top: -13px; right: -2px; display: inline-flex; border-radius: 999px; overflow: hidden; pointer-events: auto; box-shadow: 0 2px 8px rgb(0 0 0 / .3); opacity: .5; transition: opacity .15s; }
  .box.narrow .ba { right: auto; left: 12px; } /* a small frame: Before/After next to the number, not on it */
  .ba:hover, .ba:focus-within, .ba:has(button[data-ba=AFTER][aria-pressed="true"]) { opacity: 1; }
  .ba button { padding: 2px 8px; font: 600 11px/16px ui-sans-serif, system-ui; border: 0; background: #111318; color: #d4d4d8; cursor: pointer; }
  .ba button[aria-pressed="true"] { background: #facc15; color: #1c1503; }
  .codesum { padding: 6px 14px 0; font-size: 11.5px; color: #a1a1aa; }
  .filters { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 14px 0; }
  .filters button { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 999px; border: 1px solid #3f3f46; background: #18181b; color: #f4f4f5; font-size: 12px; cursor: pointer; }
  .filters button i { width: 9px; height: 9px; border-radius: 50%; }
  .filters button[aria-pressed="false"] { opacity: .45; text-decoration: line-through; }
  .list.hide-red .k-red, .list.hide-code .k-code, .list.hide-fixed .k-fixed { display: none; }
  .layer.hide-red .box.k-red, .layer.hide-code .box.k-code, .layer.hide-fixed .box.k-fixed { display: none !important; }
  .list li.sep { display: block; cursor: default; padding: 10px 14px 4px; font-size: 11.5px; color: #facc15; border-top: 1px solid #23262d; margin-top: 4px; }
  .list li.sep:hover { background: none; }
  .list li.sep span { color: #a1a1aa; }
  .box.note { border-color: #3b82f6; background: rgb(59 130 246 / 0.08); }
  .box.note .tag { background: #2563eb; }
  .pick { position: fixed; inset: 0; pointer-events: none; }
  .hover { position: fixed; display: none; border: 2px solid #3b82f6; border-radius: 3px; background: rgb(59 130 246 / 0.12);
    transition: left 60ms ease-out, top 60ms ease-out, width 60ms ease-out, height 60ms ease-out; }
  .hover.locked { box-shadow: 0 0 0 4px rgb(59 130 246 / 0.28); transition: none; }
  .hover .label { position: absolute; left: -2px; bottom: 100%; margin-bottom: 4px; padding: 0 6px; border-radius: 4px; background: #1d4ed8; color: #fff;
    font: 600 11px/18px ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; max-width: 60vw; overflow: hidden; text-overflow: ellipsis; }
  .hover.flip .label { bottom: auto; top: 100%; margin: 4px 0 0; }
  .pop { position: fixed; display: none; width: 320px; pointer-events: auto; padding: 10px; border-radius: 12px; background: #111318; color: #f4f4f5;
    border: 1px solid #1d4ed8; box-shadow: 0 12px 32px rgb(0 0 0 / .45); }
  .pop .sel { margin: 0 0 6px; color: #93c5fd; font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
  .pop textarea { min-height: 64px; }
  .pop .row { margin-top: 8px; justify-content: space-between; }
  .pop .row span { display: flex; gap: 6px; }
  .save { background: #2563eb; color: #fff; }
  .small { padding: 6px 10px; font-size: 12px; }
  .chip { padding: 4px 10px; font-size: 12px; background: transparent; color: #e4e4e7; border-color: #3f3f46; }
  .chip[aria-pressed="true"] { background: #2563eb; border-color: #2563eb; color: #fff; }
  .sec { padding: 6px 14px 0; color: #93c5fd; font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
  .n.note { background: #2563eb; width: auto; min-width: 24px; padding: 0 5px; }
  .x { margin-left: auto; padding: 0 6px; background: transparent; color: #a1a1aa; font-size: 15px; line-height: 20px; }
  .x:hover { color: #f4f4f5; }
</style>
<div class="layer" part="layer"></div>
<div class="cmp" aria-hidden="true"><img class="a" alt=""><img class="b" alt=""><canvas class="d"></canvas><div class="handle"></div><span class="badge b"></span><span class="badge a"></span></div>
<div class="pick"><div class="hover"><span class="label"></span></div>
  <div class="pop" role="dialog" aria-label="Note for Claude">
    <p class="sel"></p>
    <textarea id="note-text" placeholder="What should change here?" aria-label="What should change here?"></textarea>
    <div class="row"><button class="ghost small" id="note-parent" type="button" title="Alt+↑">⬆ Parent</button>
      <span><button class="ghost small" id="note-cancel" type="button">Cancel</button><button class="save small" id="note-save" type="button" disabled>Save</button></span></div>
  </div></div>
<div class="panel" role="region" aria-label="Babysitter Studio">
  <div class="head" title="Drag to move · double-click to put back"><span class="grip" aria-hidden="true">⋮⋮</span><span class="dot"></span><span class="title">Babysitter Studio</span><span class="muted status">connecting…</span><button class="chip" id="frames" type="button" aria-pressed="true" title="Frames on the page: on / off">▢</button><button class="chip" id="lang" type="button" title="Language / Язык">EN</button><button class="chip collapse" id="collapse" type="button" aria-expanded="true" title="Collapse / expand">–</button><button class="chip" id="inspect" type="button" aria-pressed="false" title="Point at any element and leave a note for Claude (Esc to stop)">🎯 Inspect</button></div>
  <div class="body"></div>
</div>`;
  const $ = (s) => root.querySelector(s);
  const layer = $(".layer"), body = $(".body"), dot = $(".dot"), status = $(".status"), title = $(".title");
  (document.body || document.documentElement).appendChild(host);

  let ws, retry = 500, queue = [], current = null, boxes = [], raf = 0, side = "AFTER", notes = [];
  const panel = $(".panel");
  // the reviewer's language for what the panel says (findings carry their explanations in en and ru)
  const PREF_KEY = "babysitter-studio-prefs";
  const prefs = { get() { try { return JSON.parse(localStorage.getItem(PREF_KEY) || "{}"); } catch { return {}; } }, set(v) { try { localStorage.setItem(PREF_KEY, JSON.stringify({ ...prefs.get(), ...v })); } catch {} } };
  let LANG = prefs.get().lang || (/^ru\b/i.test(navigator.language || "") ? "ru" : "en");
  const DICT = {
    en: { problems: (n) => `${n} problem${n === 1 ? "" : "s"}`, paused: "the CLI is paused until you decide", after: "After", before: "👁 Before", viewing: (b) => `Viewing ${b} · frames hidden`, differ: (n, b) => `Your changes · ${n} file(s) differ from ${b}`, cmpHint: (n, b) => `Your changes · ${n} file(s) differ from ${b} · Before = a snapshot right here, no reload (B)`, switching: "Swapping the files and waiting for the dev server to rebuild (~5 s)…", startingBase: (b) => `Starting a dev server of ${b} next to yours (first time ~10–30 s)…`, capturing: "Capturing both versions at your scroll position…", cmpBefore: (b) => `Snapshot of ${b} · B flips · scroll re-captures`, cmpAfter: "Snapshot of your changes · B flips", slider: "⇆ Slider", diffs: "◫ Differences", exit: "✕ Live page", live: "↻ Live", liveBack: "↺ Back to your changes", noDiffHere: "No visible differences on this screen", diffCount: (n) => `${n} changed area(s) highlighted`, badgeBefore: (b) => `BEFORE · ${b}`, badgeAfter: "AFTER", framesOn: "Frames on the page: on", framesOff: "Frames on the page: off (click an entry to see its frame)", nothing: "Nothing to compare — no changed UI files", noRepo: "Before/After needs the review's repository (the hooks pass it; studio review --repo)", details: "details", beforeNow: "Before (now)", afterFix: "👁 After (with fixes)", startingFix: "Starting a dev server with the proposed fixes next to yours (first time ~10–30 s)…", beforeShort: "Before", afterShort: "After", cmpTimeout: "⚠ No snapshot in 2 minutes — the dev server may have stopped. Press Before/After again.", clipChanged: (p) => `After for this element: ${p}% of its frame changes · Before/After on the frame switch`, clipSame: "⚠ In this frame the two versions look the same — this fix does not change this element (tell the agent with Comment)", propHint: (n) => `${n} fix(es) proposed · the page is the original; After shows it with the fixes, nothing applied yet (B)`, cmpAfterProp: "With the proposed fixes · B flips · the original files are untouched", cmpBeforeProp: "Snapshot of the original · B flips", clipInfo: "After for this element only · the Before/After buttons on its frame switch", badgeOrig: "BEFORE · original", badgeFixed: "AFTER · with fixes", fix: "Fix", accept: "Accept", decline: "Reject", comment: "Comment", send2: "Send", pcPlaceholder: "What should be different in this fix?", covers: (n) => `fixes ${n} findings at once`, pstatus: { pending: "waiting for your decision", approved: "applied to the files", rejected: "rejected — not applied", revising: "being revised after your comment…", conflict: "does not apply to the files as they are now" }, applying: "applying…", approveAll: "Approve all", rejectAll: "Reject all", applied: "applied", codeSum: (n) => `${n} finding(s) only in the code (style= …) are fixed without your approval — the page looks exactly the same.`, fVisible: "Visible", fCode: "In code", fFixed: "Fixed", showOnPage: "Before/After on the page", was: "Was:", openHead: (n) => `Visible on the page — not fixed yet (${n})`, done: "fixed", fixedHead: (n) => `Fixed since the previous check (${n}) <span>· green frames: these were problems and are gone now</span>`, split: (v, c) => `${v} visible · ${c} in code`, codeOnly: (n) => `Not visible on the page — only in the code (${n}) <span>· yellow frames: fixing them changes nothing you can see</span>`, pages: (n) => `on ${n} pages`, places: (n) => `${n} places`, otherPage: (r) => `on ${r}`, placeholder: "What should change? Send Comment returns the work to its author with this brief…", send: "Send Comment", reject: "Reject", approve: "Approve" },
    ru: { problems: (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "проблема" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "проблемы" : "проблем"}`, paused: "проверка ждёт вашего решения", after: "После", before: "👁 До", viewing: (b) => `Показано состояние ${b} · рамки скрыты`, differ: (n, b) => `Ваши изменения · ${n} файл(ов) отличаются от ${b}`, cmpHint: (n, b) => `Ваши изменения · ${n} файл(ов) отличаются от ${b} · «До» — снимок прямо здесь, без перезагрузки (B)`, switching: "Подменяю файлы и жду, пока dev-сервер пересоберёт (~5 с)…", startingBase: (b) => `Запускаю рядом dev-сервер версии ${b} (в первый раз ~10–30 с)…`, capturing: "Снимаю обе версии на вашей прокрутке…", cmpBefore: (b) => `Снимок версии ${b} · B — переключить · при прокрутке пересниму`, cmpAfter: "Снимок ваших изменений · B — переключить", slider: "⇆ Шторка", diffs: "◫ Отличия", exit: "✕ Живая страница", live: "↻ Вживую", liveBack: "↺ Вернуть ваши изменения", noDiffHere: "На этом экране видимых отличий нет", diffCount: (n) => `Подсвечено изменённых мест: ${n}`, badgeBefore: (b) => `ДО · ${b}`, badgeAfter: "ПОСЛЕ", framesOn: "Рамки на странице: включены", framesOff: "Рамки на странице: выключены (клик по пункту покажет его рамку)", nothing: "Сравнивать нечего — изменённых UI-файлов нет", noRepo: "Для «До / После» ревью нужен репозиторий (хуки передают его сами; studio review --repo)", details: "подробности", beforeNow: "До (сейчас)", afterFix: "👁 После (с исправлениями)", startingFix: "Запускаю рядом dev-сервер с предложенными исправлениями (в первый раз ~10–30 с)…", beforeShort: "До", afterShort: "После", cmpTimeout: "⚠ Снимок не пришёл за 2 минуты — возможно, dev-сервер остановился. Нажмите «До/После» ещё раз.", clipChanged: (p) => `«После» для этого элемента: в рамке изменилось ${p}% · кнопки До/После на рамке переключают`, clipSame: "⚠ В этой рамке версии выглядят одинаково — исправление этот элемент не меняет (напишите об этом в «Комментарий»)", propHint: (n) => `Предложено исправлений: ${n} · страница — оригинал; «После» — она же с исправлениями, ничего ещё не применено (B)`, cmpAfterProp: "С предложенными исправлениями · B — переключить · оригинальные файлы не тронуты", cmpBeforeProp: "Снимок оригинала · B — переключить", clipInfo: "«После» только для этого элемента · кнопки До/После на рамке переключают", badgeOrig: "ДО · оригинал", badgeFixed: "ПОСЛЕ · с исправлениями", fix: "Исправление", accept: "Принять", decline: "Отклонить", comment: "Комментарий", send2: "Отправить", pcPlaceholder: "Что изменить в этом исправлении?", covers: (n) => `исправляет сразу ${n} пункт(ов)`, pstatus: { pending: "ждёт вашего решения", approved: "применено к файлам", rejected: "отклонено — не применено", revising: "дорабатывается по вашему комментарию…", conflict: "не применяется к текущим файлам" }, applying: "применяю…", approveAll: "Approve all", rejectAll: "Reject all", applied: "применено", codeSum: (n) => `Замечаний только в коде (style= и т.п.): ${n} — их исправляю без вашего одобрения, вид страницы при этом не меняется.`, fVisible: "Видно", fCode: "В коде", fFixed: "Исправлено", showOnPage: "До/После на странице", was: "Было:", openHead: (n) => `Видно глазами — ещё не исправлено (${n})`, done: "исправлено", fixedHead: (n) => `Исправлено с прошлой проверки (${n}) <span>· зелёные рамки: здесь были проблемы, теперь их нет</span>`, split: (v, c) => `${v} видно · ${c} в коде`, codeOnly: (n) => `Глазами не видно — только в коде (${n}) <span>· жёлтые рамки: их исправление ничего на странице не меняет</span>`, pages: (n) => `на ${n} страницах`, places: (n) => `${n} мест`, otherPage: (r) => `на странице ${r}`, placeholder: "Что изменить? Send Comment вернёт работу автору с этим заданием…", send: "Send Comment", reject: "Reject", approve: "Approve" },
  };
  let T = DICT[LANG];
  const plural = (n) => T.problems(n);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const send = (m) => ws && ws.readyState === 1 && ws.send(JSON.stringify(m));

  /* Time Travel. The panel only asks; the frozen CLI swaps the files on disk (HMR re-renders the page) and
   * answers with DIFF_STATE. Until it does, the switch shows "switching…". Frames hide on BEFORE: the old DOM
   * need not contain the flagged nodes. */
  function setSide(next, note) {
    side = next;
    panel.classList.toggle("before", side === "BEFORE");
    if (side === "BEFORE") stopPicking();
    inspectBtn.disabled = side === "BEFORE";
    layer.classList.toggle("hidden", side === "BEFORE");
    // the switch compares snapshots; while the files themselves are swapped (live), it waits
    const comparable = !!current?.diff?.repo && side !== "BEFORE";
    root.querySelectorAll(".seg button").forEach((b) => { b.setAttribute("aria-pressed", String(b.dataset.side === side)); b.disabled = !comparable; });
    if ($("#live")) { $("#live").textContent = side === "BEFORE" ? T.liveBack : T.live; $("#live").disabled = false; }
    const info = $(".tt .info");
    const base = current?.diff?.base || "HEAD";
    if (info) info.innerHTML = note ? `<span class="err">${esc(note)}</span>` : side === "BEFORE" ? esc(T.viewing(base)) : current?.diff?.repo ? esc(T.cmpHint(current?.diff?.files ?? 0, base)) : esc(T.differ(current?.diff?.files ?? 0, base));
    if (side === "AFTER") schedule();
  }
  function toggle(next) {
    if (!current?.diff || next === side) return;
    root.querySelectorAll(".seg button, #live").forEach((b) => (b.disabled = true));
    $(".tt .info").textContent = T.switching;
    awaitingSwap = true;
    send({ type: "TOGGLE_DIFF", reviewId: current.reviewId, side: next });
  }

  /* ───────── Before/After by snapshots ─────────
   * Studio renders the base version on a second dev server and captures both sides at this window's size,
   * pixel ratio and scroll position; the panel lays them over the page and flips instantly — no reload, no
   * jump. Scrolling re-captures. Slider: drag the divider. Differences: changed areas tinted red. */
  const cmpEl = $(".cmp"), imgA = $(".cmp img.a"), imgB = $(".cmp img.b"), diffC = $(".cmp canvas.d"), handle = $(".cmp .handle");
  const cmp = { on: false, want: false, side: "AFTER", before: null, after: null, key: null, slider: false, diffs: false, x: 0.5, pending: null, diffKey: null, diffN: null };
  const shots = new Map(); // viewKey -> { before, after }
  let reqSeq = 0, recapture = 0;
  const viewKey = () => `${location.pathname}${location.search}|${innerWidth}x${innerHeight}@${devicePixelRatio || 1}|${Math.round(scrollY)}`;
  const canCompare = () => !!current?.diff?.repo && side !== "BEFORE";
  // proposals: the live page is the ORIGINAL (Before) and the snapshot shows it with the fixes (After);
  // base mode: the live page is the developer's work (After) and the snapshot is the base ref (Before)
  const propMode = () => current?.diff?.mode === "proposals";
  const liveSide = () => (propMode() ? "BEFORE" : "AFTER");
  const otherSide = () => (propMode() ? "AFTER" : "BEFORE");
  const cmpInfo = (text) => { const i = $(".tt .info"); if (i) i.textContent = text; };
  function requestCompare() {
    const reqId = String(++reqSeq);
    cmp.pending = { reqId, key: viewKey() };
    cmpInfo(T.capturing);
    const storage = {};
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); storage[k] = localStorage.getItem(k); } } catch {}
    // never stuck on "capturing…": no answer in 2 minutes → say so; pressing Before/After again asks anew
    setTimeout(() => { if (cmp.pending?.reqId !== reqId) return; cmp.pending = null; cmp.want = false; cmp.clipG = null; renderCompare(); cmpInfo(T.cmpTimeout); }, 120000);
    send({ type: "COMPARE", reviewId: current.reviewId, reqId, path: location.pathname + location.search, width: innerWidth, height: innerHeight, dpr: devicePixelRatio || 1, scrollY: Math.round(scrollY), storage, cookies: document.cookie });
  }
  function compareShow(next) {
    if (!canCompare()) return;
    cmp.side = next;
    if (next === liveSide() && !cmp.on && !cmp.want && !cmp.slider && !cmp.diffs) { cmp.clipG = null; renderCompare(); return; } // that side is the live page
    cmp.want = true;
    const hit = shots.get(viewKey());
    if (hit) { Object.assign(cmp, hit, { key: viewKey(), on: true }); renderCompare(); return; }
    cmp.on = false;
    // already being captured for this very view (Slider / Differences pressed while waiting): wait for it
    if (!(cmp.pending && cmp.pending.key === viewKey())) requestCompare();
    renderCompare();
  }
  function exitCompare() { Object.assign(cmp, { on: false, want: false, side: liveSide(), slider: false, diffs: false, pending: null, clipG: null }); renderCompare(); }
  // one element's After: the snapshot with the fixes shown only inside that element's frame
  function elementAfter(gi) { Object.assign(cmp, { clipG: gi, slider: false, diffs: false }); compareShow("AFTER"); }
  // how much the fix changes inside this one frame: counted on the two snapshots, so "no difference" is said
  // out loud instead of leaving the reviewer to wonder
  const clipDiffs = new Map(); // `${cmp.key}|${gi}` -> n
  async function clipDiff(gi, key, r) {
    const k = `${key}|${gi}`;
    if (clipDiffs.has(k)) return clipDiffs.get(k);
    const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
    const [a, b] = await Promise.all([load(cmp.after), load(cmp.before)]);
    const sx = a.naturalWidth / innerWidth, x = Math.round(r.left * sx), y = Math.round(r.top * sx);
    const w = Math.max(1, Math.round((innerWidth - r.left - r.right) * sx)), h = Math.max(1, Math.round((innerHeight - r.top - r.bottom) * sx));
    const px = (img) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, x, y, w, h, 0, 0, w, h); return g.getImageData(0, 0, w, h).data; };
    const A = px(a), B = px(b);
    let n = 0;
    for (let i = 0; i < A.length; i += 4) if (Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2])) > 10) n++;
    const pct = Math.round((n / (w * h)) * 1000) / 10;
    clipDiffs.set(k, { n, pct });
    return { n, pct };
  }
  function clipRect() {
    if (cmp.clipG == null) return null;
    const b = boxes.find((x) => Number(x.box.dataset.g) === cmp.clipG && x.el.getBoundingClientRect().width > 0);
    if (!b) return null;
    const r = b.el.getBoundingClientRect();
    return { top: Math.max(0, r.top - GAP), left: Math.max(0, r.left - GAP), bottom: Math.max(0, innerHeight - r.bottom - GAP), right: Math.max(0, innerWidth - r.right - GAP) };
  }
  function renderCompare() {
    cmpEl.classList.toggle("on", cmp.on);
    cmpEl.classList.toggle("slider", cmp.on && cmp.slider);
    // frames out of the way while BEFORE, the slider or the difference map is on; over the AFTER snapshot they stay
    // (it is the page at this very scroll), so going Before → After never leaves the page without its frames
    layer.classList.toggle("cmp-hide", cmp.on && cmp.clipG == null && (cmp.side !== liveSide() || cmp.slider || cmp.diffs));
    layer.classList.toggle("over", cmp.on && cmp.clipG != null);
    if (cmp.on) {
      if (imgA.getAttribute("src") !== cmp.after) imgA.src = cmp.after;
      if (imgB.getAttribute("src") !== cmp.before) imgB.src = cmp.before;
      const showB = cmp.slider || cmp.side === "BEFORE";
      imgB.classList.toggle("show", showB); imgA.classList.toggle("show", cmp.slider || !showB);
      imgB.style.clipPath = cmp.slider ? `inset(0 ${((1 - cmp.x) * 100).toFixed(2)}% 0 0)` : "";
      const cr = !cmp.slider && cmp.side === "AFTER" ? clipRect() : null;
      imgA.style.clipPath = cr ? `inset(${cr.top}px ${cr.right}px ${cr.bottom}px ${cr.left}px round 6px)` : "";
      if (cr && cmp.clipG != null) { const gi = cmp.clipG, key = cmp.key; clipDiff(gi, key, cr).then((d) => { if (cmp.on && cmp.clipG === gi && cmp.key === key && cmp.side === "AFTER") cmpInfo(d.n ? T.clipChanged(d.pct) : T.clipSame); }).catch(() => {}); }
      handle.style.left = `${(cmp.x * 100).toFixed(2)}%`;
      const bb = $(".cmp .badge.b"), ba = $(".cmp .badge.a");
      bb.textContent = propMode() ? T.badgeOrig : T.badgeBefore(current?.diff?.base || "HEAD"); ba.textContent = propMode() ? T.badgeFixed : T.badgeAfter;
      bb.style.display = showB ? "" : "none"; ba.style.display = cmp.slider || !showB ? "block" : "none";
      diffC.classList.toggle("show", cmp.diffs);
      if (cmp.diffs) drawDiffs();
    }
    root.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.side === (cmp.want && cmp.clipG == null ? cmp.side : liveSide()))));
    layer.querySelectorAll(".ba button").forEach((b) => { const mine = cmp.want && cmp.clipG === Number(b.closest(".box").dataset.g); b.setAttribute("aria-pressed", String(b.dataset.ba === (mine && cmp.side === "AFTER" ? "AFTER" : "BEFORE"))); });
    if ($("#cmp-slider")) $("#cmp-slider").setAttribute("aria-pressed", String(cmp.slider));
    if ($("#cmp-diff")) $("#cmp-diff").setAttribute("aria-pressed", String(cmp.diffs));
    if ($("#cmp-exit")) $("#cmp-exit").hidden = !cmp.want;
    if (cmp.on) cmpInfo(cmp.diffs && cmp.diffN !== null && cmp.diffKey === cmp.key ? (cmp.diffN ? T.diffCount(cmp.diffN) : T.noDiffHere) : cmp.clipG != null && cmp.side === "AFTER" ? T.clipInfo : propMode() ? (cmp.side === "AFTER" && !cmp.slider ? T.cmpAfterProp : T.cmpBeforeProp) : cmp.side === "BEFORE" || cmp.slider ? T.cmpBefore(current?.diff?.base || "HEAD") : T.cmpAfter);
    else if (!cmp.want && current?.diff?.repo && side !== "BEFORE") cmpInfo(propMode() ? T.propHint(current.diff.files ?? 0) : T.cmpHint(current.diff.files ?? 0, current.diff.base || "HEAD"));
  }
  // changed areas between the two snapshots (same renderer, so only real differences): a grid of cells,
  // tinted where pixels differ, counted as connected areas
  async function drawDiffs() {
    if (cmp.diffKey === cmp.key) return;
    const key = cmp.key; cmp.diffKey = key; cmp.diffN = null;
    const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
    const [a, b] = await Promise.all([load(cmp.after), load(cmp.before)]);
    if (cmp.key !== key) return;
    const w = Math.min(a.naturalWidth, b.naturalWidth), h = Math.min(a.naturalHeight, b.naturalHeight);
    const pixels = (img) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
    const A = pixels(a), B = pixels(b);
    const cell = Math.max(6, Math.round(8 * (devicePixelRatio || 1))), cw = Math.ceil(w / cell), ch = Math.ceil(h / cell);
    const hot = new Uint8Array(cw * ch);
    for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
      let n = 0;
      for (let y = cy * cell; y < Math.min(h, (cy + 1) * cell) && n < 3; y += 2) for (let x = cx * cell; x < Math.min(w, (cx + 1) * cell); x += 2) {
        const k = (y * w + x) * 4;
        // both snapshots come from the same headless browser and the same frozen moment, so even a quiet change
        // (a border two shades lighter) counts; a single stray pixel does not
        if (Math.max(Math.abs(A[k] - B[k]), Math.abs(A[k + 1] - B[k + 1]), Math.abs(A[k + 2] - B[k + 2])) > 10 && ++n >= 3) break;
      }
      if (n >= 3) hot[cy * cw + cx] = 1;
    }
    diffC.width = w; diffC.height = h;
    const g = diffC.getContext("2d"); g.clearRect(0, 0, w, h);
    g.fillStyle = "rgba(239, 68, 68, 0.34)";
    for (let i = 0; i < hot.length; i++) if (hot[i]) g.fillRect((i % cw) * cell, Math.floor(i / cw) * cell, cell, cell);
    // connected areas, for the count
    const seen = new Uint8Array(hot.length); let areas = 0;
    for (let i = 0; i < hot.length; i++) if (hot[i] && !seen[i]) {
      areas++; const st = [i]; seen[i] = 1;
      while (st.length) { const j = st.pop(), x = j % cw, y = (j / cw) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const nx = x + dx, ny = y + dy, nj = ny * cw + nx; if (nx >= 0 && ny >= 0 && nx < cw && ny < ch && hot[nj] && !seen[nj]) { seen[nj] = 1; st.push(nj); } } }
    }
    cmp.diffN = areas;
    renderCompare();
  }
  handle.addEventListener("pointerdown", (e) => {
    handle.setPointerCapture(e.pointerId);
    const move = (ev) => { cmp.x = Math.min(1, Math.max(0, ev.clientX / innerWidth)); renderCompare(); };
    const up = () => { handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", up); };
    handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", up);
  });
  // the snapshots belong to one scroll position: scrolling shows the live page, then re-captures where you stop
  const onViewChange = () => {
    if (!cmp.want) return;
    if (cmp.on) { cmp.on = false; renderCompare(); }
    clearTimeout(recapture);
    recapture = setTimeout(() => { if (cmp.want) compareShow(cmp.side); }, 450);
  };
  addEventListener("scroll", onViewChange, { passive: true });
  addEventListener("resize", onViewChange, { passive: true });
  // B flips Before/After (also on a Russian layout: И), Esc leaves the comparison — not while typing
  addEventListener("keydown", (e) => {
    if (!current || picking || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.composedPath()[0];
    if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName || ""))) return;
    if (/^[bBиИ]$/.test(e.key) && canCompare()) { e.preventDefault(); cmp.clipG = null; if (cmp.want && cmp.side === otherSide() && !cmp.slider && !cmp.diffs && propMode()) exitCompare(); else compareShow(cmp.want && cmp.side === otherSide() ? liveSide() : otherSide()); }
    else if (e.key === "Escape" && cmp.want) { e.preventDefault(); exitCompare(); }
  }, true);

  function renderIdle(note) {
    dot.className = "dot" + (ws && ws.readyState === 1 ? " on" : "");
    title.textContent = "Babysitter Studio";
    panel.classList.remove("before"); layer.classList.remove("hidden"); side = "AFTER"; inspectBtn.disabled = false;
    exitCompare(); shots.clear();
    body.innerHTML = `<div class="min muted">${note || "Watching. Reviews from the Babysitter CLI appear here. 🎯 Inspect leaves a note on any element."}</div><div class="notes"></div>`;
    syncFrames(); renderNotes();
  }

  // one entry per issue × element as a person names it (the same switch in the header, the mobile menu and
  // on twelve pages is one entry), each saying what is wrong, why it matters and how to fix it
  function groupsOf(list) {
    const map = new Map();
    list.forEach((p, i) => {
      const key = (p.__fixed ? "fixed|" : "") + (p.group || `${p.message}|${p.selector || p.file}`);
      if (!map.has(key)) map.set(key, { key, items: [], p });
      map.get(key).items.push({ p, i });
    });
    // only what a person can see is listed: open (red) first, fixed (green) after. Findings that live only in
    // the code (style=…) change nothing on screen — the agent fixes them without asking; they are just counted.
    const gs = [...map.values()].map((g) => { const fixed = !!g.p.__fixed, code = g.items.every(({ p }) => codeOnly(p)); return { ...g, fixed, code, kind: code ? "code" : fixed ? "fixed" : "red" }; });
    codeCount = gs.filter((g) => g.kind === "code" && !g.fixed).length;
    return ["red", "fixed"].flatMap((k) => gs.filter((g) => g.kind === k));
  }
  let codeCount = 0;
  const allOf = (r) => r ? (r.__all ||= [...(r.problems || []), ...(r.fixed || []).map((p) => ({ ...p, __fixed: true }))]) : [];
  // which kinds are shown (list + frames): the reviewer can hide the yellow, the red or the green ones
  const shown = () => ({ red: true, code: true, fixed: true, ...(prefs.get().show || {}) });
  function applyFilters() {
    const s = shown();
    for (const k of ["red", "code", "fixed"]) { layer.classList.toggle(`hide-${k}`, !s[k]); root.querySelectorAll(".list").forEach((l) => l.classList.toggle(`hide-${k}`, !s[k])); }
    root.querySelectorAll(".filters button").forEach((b) => b.setAttribute("aria-pressed", String(s[b.dataset.f])));
  }
  const codeOnly = (p) => p.visual === false || (p.visual === undefined && !!p.selector && /inline style/.test(p.check || ""));
  function exOf(p) {
    const e = p.explain && (p.explain[LANG] || p.explain.en);
    return e || { title: p.message, why: "", fix: "", element: p.selector || [p.file, p.line].filter(Boolean).join(":") };
  }
  let groups = [], awaitingSwap = false;

  function renderReview(r) {
    groups = groupsOf(allOf(r));
    dot.className = "dot alert";
    const n = { red: 0, fixed: 0 }; groups.forEach((g) => n[g.kind]++);
    title.textContent = `Babysitter: ${plural(n.red)}`;
    const props = new Map((r.proposals || []).map((x) => [x.id, x]));
    const pm = propMode();
    status.textContent = `review ${r.reviewId}`;
    const items = groups.map((g, gi) => {
      const ex = { ...exOf(g.p) };
      // one element in several places (header and footer): name it once and list every place
      const places = [...new Set(g.items.map(({ p }) => (p.explain && (p.explain[LANG] || p.explain.en) || {}).place).filter(Boolean))];
      if (ex.head && places.length > 1) ex.element = `${ex.head} ${places.slice(0, -1).join(", ")} ${LANG === "ru" ? "и" : "and"} ${places.at(-1)}`;
      const routes = [...new Set(g.items.map((x) => x.p.route).filter(Boolean))];
      const here = routes.includes(location.pathname);
      const count = [routes.length > 1 ? T.pages(routes.length) : routes.length === 1 && !here ? T.otherPage(routes[0]) : "", g.items.length > routes.length && g.items.length > 1 ? T.places(g.items.length) : ""].filter(Boolean).join(" · ");
      const tech = [...new Set(g.items.map(({ p }) => [p.route, p.selector || [p.file, p.line].filter(Boolean).join(":"), p.check || p.rule].filter(Boolean).join("  ")))].slice(0, 12).join("\n");
      const first = gi === 0 || groups[gi - 1].kind !== g.kind;
      const sep = first && g.kind === "red" && n.fixed ? `<li class="sep red k-red">${T.openHead(n.red)}</li>` : first && g.kind === "fixed" ? `<li class="sep fixed k-fixed">${T.fixedHead(n.fixed)}</li>` : "";
      // the fix prepared for this finding: decided right here, applied to the original only on Accept
      const pid = !g.fixed && g.items.map((x) => x.p.proposal).find(Boolean);
      const pr = pid && props.get(pid);
      const busy = pr && pr.status === "pending";
      const prop = pr ? `<div class="prop s-${esc(pr.status)}" data-prop="${esc(pr.id)}">
            <div class="ptitle">🔧 ${esc(T.fix)}: <b>${esc(pr.title)}</b><span class="pst">${esc(T.pstatus[pr.status] || pr.status)}</span></div>
            ${pr.findings > 1 ? `<div class="pnote">${esc(T.covers(pr.findings))}</div>` : ""}
            ${pr.error && pr.status === "conflict" ? `<div class="perr">⚠ ${esc(pr.error)}</div>` : ""}
            ${pr.status === "revising" && pr.comment ? `<div class="pnote">💬 ${esc(pr.comment)}</div>` : ""}
            ${busy && g.items.some((x) => x.p.selector) ? `<div class="pbtn"><button type="button" data-pa="show">👁 ${esc(T.showOnPage)}</button></div>` : ""}
            ${busy ? `<div class="pbtn"><button type="button" data-pa="approve">✓ ${esc(T.accept)}</button><button type="button" data-pa="reject">✗ ${esc(T.decline)}</button><button type="button" data-pa="comment">💬 ${esc(T.comment)}</button></div>
            <div class="pc" hidden><textarea aria-label="${esc(T.comment)}" placeholder="${esc(T.pcPlaceholder)}"></textarea><button type="button" data-pa="send">${esc(T.send2)}</button></div>` : ""}
          </div>` : "";
      return `${sep}
      <li data-g="${gi}" class="k-${g.kind}"><span class="n${g.kind !== "red" ? " " + g.kind : g.items.some((x) => x.p.selector) ? "" : " static"}">${gi + 1}</span>
        <span class="ex">
          <span class="t"${g.fixed ? ` data-done="${esc(g.p.applied ? T.applied : T.done)}"` : ""}>${esc(ex.title)}</span>
          ${ex.element ? `<span class="el">${esc(ex.element)}${count ? ` <span class="cnt">· ${esc(count)}</span>` : ""}</span>` : ""}
          ${ex.why ? `<span class="why">${g.fixed ? `${esc(T.was)} ` : ""}${esc(ex.why)}</span>` : ""}
          ${ex.fix && !g.fixed && !pr ? `<span class="fix">→ ${esc(ex.fix)}</span>` : ""}
          <button class="more" type="button" data-more="${gi}">${T.details}</button>
          <span class="tech">${esc(tech)}</span>
          ${prop}
        </span></li>`;
    }).join("");
    body.innerHTML = `
      <div class="min"><strong>${esc(r.title || "UI review")}</strong><span class="muted">· ${T.paused}</span></div>
      <div class="tt"><span class="seg" role="group" aria-label="Before / After">${pm ? `<button type="button" data-side="BEFORE" aria-pressed="true">${T.beforeNow}</button><button type="button" data-side="AFTER" aria-pressed="false">${T.afterFix}</button>` : `<button type="button" data-side="AFTER" aria-pressed="true">${T.after}</button><button type="button" data-side="BEFORE" aria-pressed="false">${T.before}${r.diff?.base ? ` (${esc(r.diff.base)})` : " (HEAD)"}</button>`}</span><span class="muted info"></span></div>
      ${r.diff ? `<div class="tools">${r.diff.repo ? `<button class="chip" id="cmp-slider" type="button" aria-pressed="false">${T.slider}</button><button class="chip" id="cmp-diff" type="button" aria-pressed="false">${T.diffs}</button><button class="chip" id="cmp-exit" type="button" hidden>${T.exit}</button>` : ""}${r.diff.live ? `<button class="chip" id="live" type="button">${T.live}</button>` : ""}</div>` : ""}
      <div class="filters" role="group" aria-label="Show">
        <button type="button" data-f="red" aria-pressed="true"><i style="background:#ef4444"></i>${T.fVisible} · ${n.red}</button>
        ${n.fixed ? `<button type="button" data-f="fixed" aria-pressed="true"><i style="background:#22c55e"></i>${T.fFixed} · ${n.fixed}</button>` : ""}
      </div>
      ${codeCount ? `<div class="codesum">${esc(T.codeSum(codeCount))}</div>` : ""}
      <ul class="list">${items}</ul>
      <div class="notes"></div>
      <div class="foot">
        <textarea id="comment-text" placeholder="${esc(T.placeholder)}" aria-label="Comment"></textarea>
        <div class="row">
          <button class="ghost" id="comment-send" type="button" disabled>${T.send}</button>
          <button class="reject" id="reject" type="button">${pm ? T.rejectAll : T.reject}</button>
          <button class="approve" id="approve" type="button">${pm ? T.approveAll : T.approve}</button>
        </div>
      </div>`;
    const text = () => $("#comment-text").value.trim();
    $("#comment-text").oninput = canSend;
    $("#comment-send").onclick = () => (text() || notes.length) && decide("COMMENT", text());
    $("#approve").onclick = () => decide("APPROVE", text());
    $("#reject").onclick = () => decide("REJECT", text());
    root.querySelectorAll(".list li[data-g]").forEach((li) => (li.onclick = () => focusGroup(Number(li.dataset.g))));
    root.querySelectorAll(".filters button").forEach((b) => (b.onclick = () => { prefs.set({ show: { ...shown(), [b.dataset.f]: !shown()[b.dataset.f] } }); applyFilters(); }));
    applyFilters();
    // a decision on one fix: the CLI applies or drops it and sends the review back changed (REVIEW_UPDATE)
    root.querySelectorAll(".prop").forEach((box) => (box.onclick = (e) => {
      e.stopPropagation();
      const b = e.target.closest("button[data-pa]"); if (!b) return;
      const id = box.dataset.prop, pa = b.dataset.pa;
      if (pa === "show") {
        // to the element (another page opens if need be), the panel out of its way, then After inside its frame
        const gi = Number(box.closest("li").dataset.g);
        if (cmp.want && cmp.clipG === gi) { exitCompare(); return; }
        const g = groups[gi], here = g?.items.some(({ p }) => !p.route || p.route === location.pathname);
        if (!here) { try { sessionStorage.setItem("babysitter-studio-show", g.key); } catch {} focusGroup(gi); return; }
        focusGroup(gi); setTimeout(() => elementAfter(gi), 900); return;
      }
      if (pa === "comment") { const pc = box.querySelector(".pc"); pc.hidden = !pc.hidden; if (!pc.hidden) pc.querySelector("textarea").focus(); return; }
      const text = pa === "send" ? box.querySelector(".pc textarea").value.trim() : undefined;
      if (pa === "send" && !text) return;
      box.querySelectorAll("button").forEach((x) => (x.disabled = true));
      box.querySelector(".pst").textContent = T.applying;
      send({ type: "PROPOSAL", reviewId: current.reviewId, id, decision: pa === "send" ? "comment" : pa, text });
    }));
    root.querySelectorAll("[data-more]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); b.closest("li").classList.toggle("open"); }));
    // the live side of the switch is the live page itself (no snapshot), unless the slider or the map is on
    root.querySelectorAll(".seg button").forEach((b) => (b.onclick = () => (b.dataset.side === liveSide() && !cmp.slider && !cmp.diffs ? exitCompare() : compareShow(b.dataset.side))));
    if ($("#cmp-slider")) $("#cmp-slider").onclick = () => { cmp.slider = !cmp.slider; if (cmp.slider && !cmp.on) compareShow(otherSide()); else renderCompare(); };
    if ($("#cmp-diff")) $("#cmp-diff").onclick = () => { cmp.diffs = !cmp.diffs; if (cmp.diffs && !cmp.on) compareShow(cmp.side); else renderCompare(); };
    if ($("#cmp-exit")) $("#cmp-exit").onclick = exitCompare;
    if ($("#live")) $("#live").onclick = () => { exitCompare(); toggle(side === "BEFORE" ? "AFTER" : "BEFORE"); };
    syncFrames(); renderNotes();
    // an entry clicked on another page: this page was opened for it — find its frame and point at it
    let want = null; try { want = sessionStorage.getItem("babysitter-studio-focus"); sessionStorage.removeItem("babysitter-studio-focus"); } catch {}
    if (want) { const gi = groups.findIndex((g) => g.key === want); if (gi >= 0) focusSoon(gi); }
    let show = null; try { show = sessionStorage.getItem("babysitter-studio-show"); sessionStorage.removeItem("babysitter-studio-show"); } catch {}
    if (show) { const gi = groups.findIndex((g) => g.key === show); if (gi >= 0) { focusSoon(gi); setTimeout(() => elementAfter(gi), 2500); } }
    if (restoreView) { const v = restoreView; restoreView = null; requestAnimationFrame(() => scrollTo(0, v.y)); if (v.draft) $("#comment-text").value = v.draft; }
    if (r.diff && pm) { if (cmp.want) compareShow(cmp.side); else renderCompare(); }
    else if (r.diff) { setSide(r.state?.side || "AFTER"); if (cmp.want) compareShow(cmp.side); else renderCompare(); }
    else {
      // always visible, so reviewers know it exists; says why it is off
      root.querySelectorAll(".seg button").forEach((b) => (b.disabled = true));
      $(".tt .info").textContent = r.diffNote === "no-repo" ? T.noRepo : T.nothing;
    }
  }

  // Send Comment needs either text or at least one note; the bus attaches the notes to REJECT / COMMENT
  function canSend() { const b = $("#comment-send"); if (b) b.disabled = !($("#comment-text").value.trim() || notes.length); }

  function renderNotes() {
    const here = (n) => !n.route || n.route === location.pathname;
    const html = notes.length ? `<div class="sec">Manual Feedback · ${notes.length}</div><ul class="list">${notes.map((n, i) => `
      <li data-note="${n.id}"><span class="n note">M${i + 1}</span>
        <span><div>${esc(n.comment)}</div><div class="where">${esc((here(n) ? "" : "on " + n.route + " · ") + n.selector)}</div></span>
        <button class="x" type="button" data-remove="${n.id}" aria-label="Remove note M${i + 1}">×</button></li>`).join("")}</ul>
      ${current ? "" : `<div class="min muted">These go to Claude with your next prompt, or when its current turn ends.</div>`}` : "";
    root.querySelectorAll(".notes").forEach((c) => (c.innerHTML = html));
    root.querySelectorAll("[data-remove]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); send({ type: "NOTE_REMOVE", id: Number(b.dataset.remove) }); }));
    root.querySelectorAll("li[data-note]").forEach((li) => (li.onclick = () => focusNote(Number(li.dataset.note))));
    canSend();
  }

  function decide(type, text) {
    if (!current) return;
    root.querySelectorAll(".foot button, .seg button").forEach((b) => (b.disabled = true));
    send({ type, reviewId: current.reviewId, text: text || undefined });
  }

  /* red frames over the flagged elements. Repositioned on scroll (any scroller: capture), resize, element
   * resize and DOM changes (HMR re-renders swap nodes) — coalesced to one layout read per animation frame. */
  function place() {
    raf = 0;
    placePick();
    for (const b of boxes) {
      if (!b.el.isConnected) { try { b.el = document.querySelector(b.selector) || b.el; ro.observe(b.el); } catch {} }
      const r = b.el.getBoundingClientRect();
      const shown = b.el.isConnected && (r.width || r.height);
      // 6px of air between the element and the 2px frame, so the frame never sits on the element's own edge
      b.box.style.cssText = shown ? `left:${r.left - GAP}px;top:${r.top - GAP}px;width:${r.width + GAP * 2}px;height:${r.height + GAP * 2}px` : "display:none";
      b.box.classList.toggle("narrow", r.width + GAP * 2 < 120);
    }
  }
  const GAP = 8; // 2px border + 6px of air
  const schedule = () => { if ((boxes.length || picking) && !raf) raf = requestAnimationFrame(place); };
  const ro = new ResizeObserver(schedule);
  addEventListener("scroll", schedule, { capture: true, passive: true });
  addEventListener("resize", schedule, { passive: true });
  // elements a client component renders after load (a header hydrated late, a lazy section) and client-side
  // navigation (another page, no reload) both need the frames drawn again, not just moved
  let missing = 0, framesPath = location.pathname, framesNarrow = innerWidth < 640, resync = 0;
  const maybeResync = () => {
    const stale = () => missing > 0 || framesPath !== location.pathname || framesNarrow !== innerWidth < 640;
    if (!current || resync || !stale()) return;
    resync = setTimeout(() => { resync = 0; if (current && stale()) { const was = framesPath; syncFrames(); if (was !== location.pathname) renderReview(current); } }, 250);
  };
  new MutationObserver(() => { schedule(); maybeResync(); }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  addEventListener("popstate", maybeResync);
  addEventListener("resize", maybeResync, { passive: true });

  function syncFrames() {
    clearBoxes(); missing = 0; framesPath = location.pathname; framesNarrow = innerWidth < 640;
    const add = (sel, route, cls, tag, key, extra = "") => {
      if (!sel || (route && route !== location.pathname)) return; // only frames of THIS page
      let el = null; try { el = document.querySelector(sel); } catch {}
      if (!el) { missing++; return; }
      const box = document.createElement("div");
      box.className = cls; Object.assign(box.dataset, key);
      box.innerHTML = `<span class="tag">${tag}</span>${extra}`;
      layer.appendChild(box);
      boxes.push({ el, box, selector: sel });
      ro.observe(el);
    };
    const gOf = new Map(); groups.forEach((g, gi) => g.items.forEach(({ i }) => gOf.set(i, gi)));
    // a finding from the phone width (390) is framed on a phone-sized window only, and vice versa: the same
    // selector may point at a different element in the other layout
    const sameLayout = (p) => !Number(p.viewport) || (Number(p.viewport) < 640) === (innerWidth < 640);
    const seen = new Set();
        // only listed findings get a frame (code-only ones are not listed); a finding with a fix waiting for a decision
    // gets Before/After on its frame: After shows the fixed version inside this frame only
    const props = new Map((current?.proposals || []).map((x) => [x.id, x]));
    allOf(current).forEach((p, i) => {
      const gi = gOf.get(i), g = groups[gi];
      if (!g || !sameLayout(p) || seen.has(`${gi}|${p.selector}`)) return;
      seen.add(`${gi}|${p.selector}`);
      const pending = propMode() && !g.fixed && props.get(p.proposal)?.status === "pending";
      add(p.selector, p.route, `box k-${g.kind}${g.kind === "red" ? "" : " " + g.kind}`, gi + 1, { i, g: gi }, pending ? `<span class="ba"><button type="button" data-ba="BEFORE" aria-pressed="true">${esc(T.beforeShort)}</button><button type="button" data-ba="AFTER" aria-pressed="false">${esc(T.afterShort)}</button></span>` : "");
    });
    notes.forEach((n, i) => add(n.selector, n.route, "box note", `M${i + 1}`, { note: n.id }));
    markFocus();
    place();
  }
  // Before/After on a frame: After = the fixed version of this element only; Before = the live page (original)
  layer.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-ba]"); if (!b) return;
    e.stopPropagation();
    const gi = Number(b.closest(".box").dataset.g);
    if (b.dataset.ba === "AFTER") elementAfter(gi); else exitCompare();
  });
  function clearBoxes() { cancelAnimationFrame(raf); raf = 0; ro.disconnect(); layer.innerHTML = ""; boxes = []; }
  function focusNote(id) {
    const n = notes.find((x) => x.id === id);
    if (n && n.route && n.route !== location.pathname) { location.href = n.route; return; }
    const b = boxes.find((x) => Number(x.box.dataset.note) === id);
    if (!b) return;
    b.el.scrollIntoView({ block: "center", behavior: "smooth" });
    b.box.classList.add("pulse"); setTimeout(() => b.box.classList.remove("pulse"), 900);
  }
  function focusGroup(gi) {
    const g = groups[gi]; if (!g) return;
    const here = g.items.find(({ p }) => !p.route || p.route === location.pathname);
    if (!here) {
      // on another page: open it; the review is replayed there and the entry is found again by its key
      const r = g.items.find(({ p }) => p.route)?.p.route; if (!r) return;
      try { sessionStorage.setItem("babysitter-studio-focus", g.key); } catch {}
      location.href = r; return;
    }
    const b = boxes.find((x) => x.box.dataset.g !== undefined && Number(x.box.dataset.g) === gi && x.el.getBoundingClientRect().width > 0) || boxes.find((x) => Number(x.box.dataset.g) === gi);
    if (!b) return;
    b.el.scrollIntoView({ block: "center", behavior: "smooth" });
    setTimeout(() => makeRoom(b.el), 500);
    lastFocus = { gi, until: Date.now() + 2500 };
    markFocus();
  }
  // the pointed-at frames pulse, and stay visible for a moment even with frames off (peek); a redraw of the
  // frames (notes arriving, a late element) keeps the mark
  let lastFocus = null;
  function markFocus() {
    if (!lastFocus || Date.now() > lastFocus.until) return;
    const left = lastFocus.until - Date.now();
    boxes.filter((x) => Number(x.box.dataset.g) === lastFocus.gi).forEach((x) => { x.box.classList.add("pulse", "peek"); setTimeout(() => x.box.classList.remove("pulse"), Math.min(900, left)); setTimeout(() => x.box.classList.remove("peek"), left); });
  }

  // the panel must not sit on the element it points at: move it beside the element when there is room,
  // otherwise bring the element up and put the panel under it (not remembered — a drag still is)
  function makeRoom(el) {
    if (panel.classList.contains("collapsed")) return;
    let r = el.getBoundingClientRect(); const p = panel.getBoundingClientRect();
    const overlap = (r) => !(r.right + GAP < p.left || r.left - GAP > p.right || r.bottom + GAP < p.top || r.top - GAP > p.bottom);
    if (!overlap(r) || r.height > innerHeight * 0.6) return;
    // the panel always stays whole on screen (its buttons must stay reachable): beside the element, else below it,
    // else above it — otherwise it stays where it is
    const left = r.left - GAP - 16, right = innerWidth - r.right - GAP - 16;
    if (Math.max(left, right) >= p.width) { placeAt(right >= left ? r.right + GAP + 16 : r.left - GAP - 16 - p.width, Math.min(p.top, innerHeight - p.height - 8)); return; }
    const top = 96;
    if (top + r.height + GAP + 16 + p.height + 8 <= innerHeight) {
      scrollBy({ top: r.top - top, behavior: "instant" }); r = el.getBoundingClientRect();
      placeAt(p.left, r.bottom + GAP + 16); return;
    }
    if (p.height + 8 + 16 + GAP + r.height + 24 <= innerHeight) {
      scrollBy({ top: r.top - (innerHeight - r.height - 24), behavior: "instant" });
      placeAt(p.left, 8);
    }
  }


  // after a page load the element may render late (hydration, lazy sections): retry for a few seconds
  function focusSoon(gi, tries = 20) {
    const has = boxes.some((x) => Number(x.box.dataset.g) === gi && x.el.getBoundingClientRect().width > 0);
    if (has) return focusGroup(gi);
    if (tries > 0) setTimeout(() => { syncFrames(); focusSoon(gi, tries - 1); }, 250);
  }

  /* ───────── Visual Prompting: point at ANY element, leave a note for Claude ─────────
   * Hover: one elementFromPoint per animation frame (pointermove only stores the coordinates), a blue frame that
   * glides between targets. Click: the frame locks and a popup opens next to the element. Page clicks, presses and
   * key handlers never reach the app while picking; everything inside the panel keeps working. */
  const pick = $(".pick"), hover = $(".hover"), label = $(".hover .label"), pop = $(".pop");
  const noteText = $("#note-text"), saveBtn = $("#note-save"), inspectBtn = $("#inspect");
  let picking = false, hoverEl = null, locked = null, px = -1, py = -1, pickRaf = 0;
  const cursor = document.createElement("style");
  cursor.textContent = "html, html * { cursor: crosshair !important; }";
  const fromPanel = (e) => e.composedPath().includes(host);

  function describe(el) {
    const r = el.getBoundingClientRect();
    const cls = [...el.classList].filter(stableClass).slice(0, 2).map((c) => "." + c).join("");
    return `${el.localName}${el.id && !unstableId(el.id) ? "#" + el.id : cls}  ${Math.round(r.width)}×${Math.round(r.height)}`;
  }
  function placePick() {
    const el = locked || hoverEl;
    if (!picking || !el || !el.isConnected) { hover.style.display = "none"; pop.style.display = "none"; return; }
    const r = el.getBoundingClientRect();
    hover.style.cssText = `display:block;left:${r.left - 2}px;top:${r.top - 2}px;width:${r.width + 4}px;height:${r.height + 4}px`;
    hover.classList.toggle("flip", r.top < 26);
    if (!locked) { pop.style.display = "none"; return; }
    pop.style.display = "block";
    const w = pop.offsetWidth, h = pop.offsetHeight, gap = 10;
    const below = r.bottom + gap + h <= innerHeight || r.top - gap - h < 0;
    pop.style.top = `${Math.max(8, Math.min(innerHeight - h - 8, below ? r.bottom + gap : r.top - gap - h))}px`;
    pop.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left))}px`;
  }
  // you point at a button, not at the <span> or <svg> inside it: snap to the nearest interactive ancestor
  // (≤ 4 levels up). Hold Shift for the exact element under the cursor.
  const INTERACTIVE = "button, a[href], input, select, textarea, label, summary, [role=button], [role=link], [role=tab], [role=menuitem], [role=checkbox], [role=switch], [role=combobox]";
  function snap(el) {
    if (el.matches(INTERACTIVE)) return el;
    for (let n = el.parentElement, i = 0; n && i < 4 && n !== document.body; n = n.parentElement, i++) if (n.matches(INTERACTIVE)) return n;
    return el;
  }
  let shift = false;
  function onMove(e) {
    px = e.clientX; py = e.clientY;
    if (e.shiftKey !== shift) { shift = e.shiftKey; hoverEl = null; } // re-target when Shift changes
    if (!pickRaf) pickRaf = requestAnimationFrame(() => {
      pickRaf = 0;
      if (locked) return;
      const el = document.elementFromPoint(px, py);
      const raw = !el || el === host || host.contains(el) || el === document.documentElement ? null : el;
      const next = raw && !shift ? snap(raw) : raw;
      if (next !== hoverEl) { hoverEl = next; if (next) label.textContent = describe(next); placePick(); }
    });
  }
  function swallow(e) {
    if (fromPanel(e)) return;               // the panel and the popup work normally
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.type === "click" && hoverEl && !locked) lock(hoverEl);
    else if (e.type === "click" && locked) { unlock(); onMove(e); } // click elsewhere = pick something else
  }
  function onKey(e) {
    const t = e.composedPath()[0];
    if (fromPanel(e) && t && (t.localName === "textarea" || t.localName === "input")) return; // typing in the panel / popup
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); locked ? unlock() : stopPicking(); }
    if (e.key === "ArrowUp" && e.altKey && hoverEl?.parentElement && hoverEl.parentElement !== document.documentElement) {
      e.preventDefault(); hoverEl = hoverEl.parentElement; label.textContent = describe(hoverEl); placePick();
    }
  }
  const EVENTS = ["click", "mousedown", "mouseup", "pointerdown", "pointerup", "dblclick", "contextmenu", "auxclick", "submit"];
  function startPicking() {
    if (picking || side === "BEFORE") return;
    picking = true; inspectBtn.setAttribute("aria-pressed", "true");
    inspectBtn.title = "Click an element · Shift = exact element · Alt+↑ = parent · Esc = stop";
    document.head.appendChild(cursor);
    addEventListener("pointermove", onMove, { capture: true, passive: true });
    for (const t of EVENTS) addEventListener(t, swallow, true);
    addEventListener("keydown", onKey, true);
  }
  function stopPicking() {
    if (!picking) return;
    picking = false; locked = null; hoverEl = null; inspectBtn.setAttribute("aria-pressed", "false"); releaseFocus();
    cursor.remove();
    removeEventListener("pointermove", onMove, { capture: true });
    for (const t of EVENTS) removeEventListener(t, swallow, true);
    removeEventListener("keydown", onKey, true);
    placePick();
  }
  function lock(el) {
    locked = el;
    hover.classList.add("locked");
    $(".pop .sel").textContent = uniqueSelector(el);
    noteText.value = ""; saveBtn.disabled = true;
    placePick();
    noteText.focus({ preventScroll: true });
  }
  // a hidden popup must not keep the focus, or Esc / Alt+↑ would go to its textarea instead of the picker
  const releaseFocus = () => { if (root.activeElement && pop.contains(root.activeElement)) root.activeElement.blur(); };
  function unlock() { locked = null; hover.classList.remove("locked"); releaseFocus(); placePick(); }
  function saveNote() {
    const comment = noteText.value.trim();
    if (!locked || !comment) return;
    const el = locked, r = el.getBoundingClientRect();
    send({ type: "NOTE_ADD", note: {
      selector: uniqueSelector(el), comment, route: location.pathname, tag: el.localName,
      text: (el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 120),
      classes: (typeof el.className === "string" ? el.className : el.getAttribute("class") || "").slice(0, 200),
      size: `${Math.round(r.width)}×${Math.round(r.height)}`,
    } });
    hover.classList.remove("locked");
    stopPicking();
  }
  inspectBtn.onclick = () => (picking ? stopPicking() : startPicking());
  noteText.oninput = () => (saveBtn.disabled = !noteText.value.trim());
  noteText.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); saveNote(); }
    if (e.key === "Escape") { e.preventDefault(); unlock(); }
  };
  saveBtn.onclick = saveNote;
  $("#note-cancel").onclick = unlock;
  $("#note-parent").onclick = () => { if (locked?.parentElement && locked.parentElement !== document.documentElement) lock(locked.parentElement); };

  /* A selector Claude can grep for and the panel can find again after HMR: stable id → test/aria attributes →
   * up to two stable classes → :nth-child, one step at a time from the element up, stopping as soon as the
   * whole chain is unique. Generated ids (React useId, Radix, hashes) and utility/hashed classes are skipped. */
  // generated ids: React useId in every format (:r1:, «r1», _R_4j9bn5rlb_), UI-kit prefixes, hashes, or any segment
  // that mixes letters with 2+ digits (4j9bn5rlb) — they change between renders and reloads
  function unstableId(id) {
    return /(:r|«|»|_r_)|^(base-ui-|radix-|headlessui-|react-aria|mui-|rc[-_]|\d)/i.test(id) || /[0-9a-f]{6,}|\d{4,}/i.test(id)
      || id.split(/[-_:]/).some((seg) => seg.length >= 5 && /[a-z]/i.test(seg) && (seg.match(/\d/g) || []).length >= 2);
  }
  function stableClass(c) { return c.length < 32 && !/[:\[\]\/!%@.()]/.test(c) && !/^(css|sc|jsx|emotion|svelte|astro)-|^_|__[a-z0-9]{5}$|[0-9a-f]{6,}/i.test(c); }
  const unique = (sel) => { try { return document.querySelectorAll(sel).length === 1; } catch { return false; } };
  const ATTRS = ["data-testid", "data-test", "data-cy", "data-qa", "name", "aria-label", "placeholder", "type", "href", "role"];
  function uniqueSelector(el) {
    if (el.id && !unstableId(el.id) && unique("#" + CSS.escape(el.id))) return "#" + CSS.escape(el.id);
    const chain = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n === document.body || n === document.documentElement) { chain.unshift(n.localName); break; }
      if (n.id && !unstableId(n.id) && unique("#" + CSS.escape(n.id))) { chain.unshift("#" + CSS.escape(n.id)); break; }
      const tag = n.localName, sibs = n.parentElement ? [...n.parentElement.children].filter((x) => x !== n) : [];
      const soleAmongSiblings = (part) => !sibs.some((x) => { try { return x.matches(part); } catch { return true; } });
      const cands = [];
      for (const a of ATTRS) { const v = n.getAttribute(a); if (v && v.length < 60 && !/[\n\r]/.test(v)) cands.push(`${tag}[${a}="${v.replace(/["\\]/g, "\\$&")}"]`); } // readable: grep-able as written in the source
      const cls = [...n.classList].filter(stableClass).slice(0, 2).map((c) => "." + CSS.escape(c)).join("");
      if (cls) cands.push(tag + cls);
      cands.push(tag);
      const part = cands.find(soleAmongSiblings) || `${tag + cls}:nth-child(${[...n.parentElement.children].indexOf(n) + 1})`;
      chain.unshift(part);
      if (unique(chain.join(" > "))) return chain.join(" > ");
    }
    return chain.join(" > ");
  }
  window.__babysitterSelector = uniqueSelector; // for tests and the console

  /* The panel moves: drag it by its header (mouse or touch), it stays inside the window, the place is
   * remembered per site; double-click the header to put it back. The – button folds it to its header. */
  const POS_KEY = "babysitter-studio-panel", store = { get() { try { return JSON.parse(localStorage.getItem(POS_KEY) || "{}"); } catch { return {}; } }, set(v) { try { localStorage.setItem(POS_KEY, JSON.stringify({ ...store.get(), ...v })); } catch {} } };
  const head = $(".head"), collapseBtn = $("#collapse");
  function placeAt(x, y) {
    const w = panel.offsetWidth, h = panel.offsetHeight;
    x = Math.max(8, Math.min(innerWidth - w - 8, x)); y = Math.max(8, Math.min(innerHeight - Math.min(h, 120) - 8, y));
    // placed by its top: it may never reach past the bottom edge, however the list grows later
    Object.assign(panel.style, { left: `${x}px`, top: `${y}px`, bottom: "auto", transform: "none", maxHeight: `${Math.max(160, innerHeight - y - 8)}px` });
    return { x, y };
  }
  function resetPlace() { Object.assign(panel.style, { left: "", top: "", bottom: "", transform: "", maxHeight: "" }); store.set({ x: null, y: null }); }
  head.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    const r = panel.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    panel.classList.add("dragging"); head.setPointerCapture(e.pointerId);
    const move = (ev) => placeAt(ev.clientX - dx, ev.clientY - dy);
    const up = (ev) => { head.removeEventListener("pointermove", move); head.removeEventListener("pointerup", up); panel.classList.remove("dragging"); store.set(placeAt(ev.clientX - dx, ev.clientY - dy)); };
    head.addEventListener("pointermove", move); head.addEventListener("pointerup", up);
  });
  head.addEventListener("dblclick", (e) => { if (!e.target.closest("button")) resetPlace(); });
  addEventListener("resize", () => { const s0 = store.get(); if (s0.x != null) placeAt(s0.x, s0.y); });
  function setCollapsed(c) { panel.classList.toggle("collapsed", c); collapseBtn.textContent = c ? "+" : "–"; collapseBtn.setAttribute("aria-expanded", String(!c)); store.set({ collapsed: c }); }
  collapseBtn.onclick = () => setCollapsed(!panel.classList.contains("collapsed"));
  { const s0 = store.get(); if (s0.x != null) requestAnimationFrame(() => placeAt(s0.x, s0.y)); if (s0.collapsed) setCollapsed(true); }

  // frames on/off (the reviewer may want the page clean to compare Before/After); off = peek on click
  const framesBtn = $("#frames"), langBtn = $("#lang");
  function setFrames(on) { layer.classList.toggle("off", !on); framesBtn.setAttribute("aria-pressed", String(on)); framesBtn.title = on ? T.framesOn : T.framesOff; framesBtn.textContent = on ? "▣" : "▢"; prefs.set({ frames: on }); }
  framesBtn.onclick = () => setFrames(layer.classList.contains("off"));
  setFrames(prefs.get().frames !== false);
  // language of the panel and of the explanations: EN / RU
  function setLang(l) {
    LANG = l; T = DICT[l]; langBtn.textContent = l.toUpperCase(); prefs.set({ lang: l });
    setFrames(!layer.classList.contains("off"));
    const draft = $("#comment-text")?.value;
    if (current) { renderReview(current); if (draft) $("#comment-text").value = draft; } else renderIdle();
  }
  langBtn.onclick = () => setLang(LANG === "ru" ? "en" : "ru");
  langBtn.textContent = LANG.toUpperCase();
  let restoreView = null;
  try { const v = JSON.parse(sessionStorage.getItem("babysitter-studio-scroll") || "null"); sessionStorage.removeItem("babysitter-studio-scroll"); if (v && v.path === location.pathname) restoreView = v; } catch {}

  function next() {
    current = queue.shift() || null;
    if (current) renderReview(current); else renderIdle();
  }

  function connect() {
    ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/__babysitter/ws?role=studio`);
    ws.onopen = () => { retry = 500; status.textContent = "connected"; if (!current) renderIdle(); };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === "REVIEW_REQUIRED") {
        if (current?.reviewId === m.reviewId || queue.some((q) => q.reviewId === m.reviewId)) return;
        if (current) queue.push(m); else { current = m; renderReview(m); }
        if (panel.classList.contains("collapsed")) setCollapsed(false); // a review waiting must not hide in a folded panel
      }
      // the review changed in place: a fix applied / dropped / revised. Same list position, same draft; a new set of
      // fixes means new After snapshots
      if (m.type === "REVIEW_UPDATE") {
        const target = current?.reviewId === m.reviewId ? current : queue.find((q) => q.reviewId === m.reviewId);
        if (target) {
          const refChanged = target.diff?.ref !== m.diff?.ref;
          Object.assign(target, { problems: m.problems, fixed: m.fixed, proposals: m.proposals, diff: m.diff }); delete target.__all;
          if (target === current) {
            const y = $(".list")?.scrollTop || 0, draft = $("#comment-text")?.value || "";
            if (refChanged) { shots.clear(); cmp.on = false; cmp.pending = null; }
            renderReview(current);
            const l = $(".list"); if (l) l.scrollTop = y; if (draft) $("#comment-text").value = draft;
          }
        }
      }
      if (m.type === "COMPARE_PROGRESS" && cmp.pending?.reqId === m.reqId) cmpInfo(m.stage === "base-site" ? (propMode() ? T.startingFix : T.startingBase(current?.diff?.base || "HEAD")) : T.capturing);
      if (m.type === "COMPARE_READY" && cmp.pending?.reqId === m.reqId) {
        const key = cmp.pending.key; cmp.pending = null;
        shots.set(key, { before: m.before, after: m.after });
        if (shots.size > 8) shots.delete(shots.keys().next().value);
        if (cmp.want && key === viewKey()) { Object.assign(cmp, { before: m.before, after: m.after, key, on: true }); renderCompare(); }
      }
      if (m.type === "COMPARE_FAILED" && cmp.pending?.reqId === m.reqId) { cmp.pending = null; cmp.want = false; cmp.clipG = null; renderCompare(); cmpInfo(m.error === "no-repo" ? T.noRepo : `⚠ ${m.error}`); }
      if (m.type === "NOTES") { notes = m.notes || []; syncFrames(); renderNotes(); }
      // only the answer to a switch THIS panel asked for reloads it — never a replayed state (no reload loop)
      if (m.type === "DIFF_STATE" && awaitingSwap && !m.error && current?.reviewId === m.reviewId) {
        awaitingSwap = false;
        // the files changed under the dev server; HMR may keep a stale stylesheet — load the page fresh, same scroll
        try { sessionStorage.setItem("babysitter-studio-scroll", JSON.stringify({ path: location.pathname, y: scrollY, draft: $("#comment-text")?.value || "" })); } catch {}
        current.state = m;
        setTimeout(() => location.reload(), 600);
      }
      if (m.type === "DIFF_STATE") {
        if (current?.reviewId === m.reviewId) { current.state = m; setSide(m.side, m.error || (m.conflicts?.length ? `Edits made while viewing HEAD were kept in ${m.conflicts[0].replace(/\/[^/]*$/, "")}` : "")); }
        else { const q = queue.find((x) => x.reviewId === m.reviewId); if (q) q.state = m; }
      }
      if (m.type === "REVIEW_CLOSED") {
        queue = queue.filter((q) => q.reviewId !== m.reviewId);
        if (current?.reviewId === m.reviewId) {
          const word = { approve: "Approved ✓", reject: "Rejected ✗", comment: "Sent back with your comment ↩", abandoned: "The CLI stopped waiting" }[m.decision] || m.decision;
          current = null; renderIdle(`${word} — review ${m.reviewId}.`);
          setTimeout(() => { if (!current) next(); }, 1500);
        }
      }
    };
    ws.onclose = () => { status.textContent = "reconnecting…"; dot.className = "dot"; setTimeout(connect, (retry = Math.min(retry * 2, 10000))); };
  }
  renderIdle(); connect();
})();
