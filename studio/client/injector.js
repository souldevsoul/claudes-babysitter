/* Babysitter Studio — review panel injected by the local proxy. Vanilla JS, everything inside a Shadow DOM
 * so the site's CSS (Tailwind resets included) cannot touch it and it cannot touch the site. */
(() => {
  if (window.__babysitterStudio) return;
  window.__babysitterStudio = true;

  const host = document.createElement("div");
  host.id = "__babysitter-studio";
  host.style.cssText = "all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
<style>
  :host { all: initial; }
  * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .layer { position: fixed; inset: 0; pointer-events: none; }
  .box { position: fixed; border: 2px solid #ef4444; border-radius: 4px; background: rgb(239 68 68 / 0.08); box-shadow: 0 0 0 1px rgb(255 255 255 / 0.6); transition: box-shadow .2s; }
  .box.pulse { box-shadow: 0 0 0 6px rgb(239 68 68 / 0.35); }
  .tag { position: absolute; top: -11px; left: -2px; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; background: #ef4444; color: #fff; font: 600 11px/20px ui-sans-serif, system-ui; text-align: center; }
  .panel { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); width: min(560px, calc(100vw - 32px)); pointer-events: auto;
    background: #111318; color: #f4f4f5; border: 1px solid #2a2d35; border-radius: 14px; box-shadow: 0 12px 40px rgb(0 0 0 / .45); overflow: hidden; }
  .head { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid #23262d; font-size: 13px; cursor: grab; user-select: none; touch-action: none; }
  .panel.dragging .head { cursor: grabbing; }
  .panel.dragging { transition: none; box-shadow: 0 18px 50px rgb(0 0 0 / .55); }
  .grip { color: #52525b; font-size: 12px; letter-spacing: -2px; }
  .collapse { padding: 2px 8px; font-size: 14px; line-height: 18px; background: transparent; color: #a1a1aa; border-color: #3f3f46; }
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
  .title { font-weight: 600; flex: 1; } .muted { color: #a1a1aa; font-size: 12px; }
  .list { max-height: min(46vh, 360px); overflow: auto; margin: 0; padding: 6px 0; list-style: none; }
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
  .seg { display: inline-flex; padding: 2px; border-radius: 8px; background: #0b0c0f; border: 1px solid #3f3f46; }
  .seg button { padding: 4px 10px; font-size: 12px; font-weight: 600; border-radius: 6px; background: transparent; color: #a1a1aa; }
  .seg button[aria-pressed="true"] { background: #f4f4f5; color: #111318; }
  .panel.before { background: #231d0b; border-color: #a16207; }
  .panel.before .head, .panel.before .tt, .panel.before .foot { border-color: #3d3210; }
  .panel.before .seg button[aria-pressed="true"] { background: #facc15; color: #1c1503; }
  .tt .err { color: #fca5a5; }
  .layer.hidden { display: none; }
  /* Visual Prompting: blue = a human's note, red = the automation's finding */
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
<div class="pick"><div class="hover"><span class="label"></span></div>
  <div class="pop" role="dialog" aria-label="Note for Claude">
    <p class="sel"></p>
    <textarea id="note-text" placeholder="What should change here?" aria-label="What should change here?"></textarea>
    <div class="row"><button class="ghost small" id="note-parent" type="button" title="Alt+↑">⬆ Parent</button>
      <span><button class="ghost small" id="note-cancel" type="button">Cancel</button><button class="save small" id="note-save" type="button" disabled>Save</button></span></div>
  </div></div>
<div class="panel" role="region" aria-label="Babysitter Studio">
  <div class="head" title="Drag to move · double-click to put back"><span class="grip" aria-hidden="true">⋮⋮</span><span class="dot"></span><span class="title">Babysitter Studio</span><span class="muted status">connecting…</span><button class="chip collapse" id="collapse" type="button" aria-expanded="true" title="Collapse / expand">–</button><button class="chip" id="inspect" type="button" aria-pressed="false" title="Point at any element and leave a note for Claude (Esc to stop)">🎯 Inspect</button></div>
  <div class="body"></div>
</div>`;
  const $ = (s) => root.querySelector(s);
  const layer = $(".layer"), body = $(".body"), dot = $(".dot"), status = $(".status"), title = $(".title");
  (document.body || document.documentElement).appendChild(host);

  let ws, retry = 500, queue = [], current = null, boxes = [], raf = 0, side = "AFTER", notes = [];
  const panel = $(".panel");
  // the reviewer's language for what the panel says (findings carry their explanations in en and ru)
  const LANG = /^ru\b/i.test(navigator.language || "") ? "ru" : "en";
  const T = {
    en: { problems: (n) => `${n} problem${n === 1 ? "" : "s"}`, paused: "the CLI is paused until you decide", after: "After", before: "👁 Before", viewing: (b) => `Viewing ${b} · frames hidden`, differ: (n, b) => `Your changes · ${n} file(s) differ from ${b}`, nothing: "Nothing to compare — no changed UI files", noRepo: "Before/After needs the review's repository (the hooks pass it; studio review --repo)", details: "details", pages: (n) => `on ${n} pages`, places: (n) => `${n} places`, otherPage: (r) => `on ${r}`, placeholder: "What should change? Send Comment returns the work to its author with this brief…", send: "Send Comment", reject: "Reject", approve: "Approve" },
    ru: { problems: (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "проблема" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "проблемы" : "проблем"}`, paused: "проверка ждёт вашего решения", after: "После", before: "👁 До", viewing: (b) => `Показано состояние ${b} · рамки скрыты`, differ: (n, b) => `Ваши изменения · ${n} файл(ов) отличаются от ${b}`, nothing: "Сравнивать нечего — изменённых UI-файлов нет", noRepo: "Для «До / После» ревью нужен репозиторий (хуки передают его сами; studio review --repo)", details: "подробности", pages: (n) => `на ${n} страницах`, places: (n) => `${n} мест`, otherPage: (r) => `на странице ${r}`, placeholder: "Что изменить? Send Comment вернёт работу автору с этим заданием…", send: "Send Comment", reject: "Reject", approve: "Approve" },
  }[LANG];
  const plural = T.problems;
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
    root.querySelectorAll(".seg button").forEach((b) => { b.setAttribute("aria-pressed", String(b.dataset.side === side)); b.disabled = false; });
    const info = $(".tt .info");
    const base = current?.diff?.base || "HEAD";
    if (info) info.innerHTML = note ? `<span class="err">${esc(note)}</span>` : side === "BEFORE" ? esc(T.viewing(base)) : esc(T.differ(current?.diff?.files ?? 0, base));
    if (side === "AFTER") schedule();
  }
  function toggle(next) {
    if (!current?.diff || next === side) return;
    root.querySelectorAll(".seg button").forEach((b) => (b.disabled = true));
    $(".tt .info").textContent = "switching…";
    send({ type: "TOGGLE_DIFF", reviewId: current.reviewId, side: next });
  }

  function renderIdle(note) {
    dot.className = "dot" + (ws && ws.readyState === 1 ? " on" : "");
    title.textContent = "Babysitter Studio";
    panel.classList.remove("before"); layer.classList.remove("hidden"); side = "AFTER"; inspectBtn.disabled = false;
    body.innerHTML = `<div class="min muted">${note || "Watching. Reviews from the Babysitter CLI appear here. 🎯 Inspect leaves a note on any element."}</div><div class="notes"></div>`;
    syncFrames(); renderNotes();
  }

  // one entry per issue × element as a person names it (the same switch in the header, the mobile menu and
  // on twelve pages is one entry), each saying what is wrong, why it matters and how to fix it
  function groupsOf(list) {
    const map = new Map();
    list.forEach((p, i) => {
      const key = p.group || `${p.message}|${p.selector || p.file}`;
      if (!map.has(key)) map.set(key, { key, items: [], p });
      map.get(key).items.push({ p, i });
    });
    return [...map.values()];
  }
  function exOf(p) {
    const e = p.explain && (p.explain[LANG] || p.explain.en);
    return e || { title: p.message, why: "", fix: "", element: p.selector || [p.file, p.line].filter(Boolean).join(":") };
  }
  let groups = [];

  function renderReview(r) {
    const list = r.problems || [];
    groups = groupsOf(list);
    dot.className = "dot alert";
    title.textContent = `Babysitter: ${plural(groups.length)}`;
    status.textContent = `review ${r.reviewId}`;
    const items = groups.map((g, gi) => {
      const ex = exOf(g.p);
      const routes = [...new Set(g.items.map((x) => x.p.route).filter(Boolean))];
      const here = routes.includes(location.pathname);
      const count = [routes.length > 1 ? T.pages(routes.length) : routes.length === 1 && !here ? T.otherPage(routes[0]) : "", g.items.length > routes.length && g.items.length > 1 ? T.places(g.items.length) : ""].filter(Boolean).join(" · ");
      const tech = [...new Set(g.items.map(({ p }) => [p.route, p.selector || [p.file, p.line].filter(Boolean).join(":"), p.check || p.rule].filter(Boolean).join("  ")))].slice(0, 12).join("\n");
      return `
      <li data-g="${gi}"><span class="n${g.items.some((x) => x.p.selector) ? "" : " static"}">${gi + 1}</span>
        <span class="ex">
          <span class="t">${esc(ex.title)}</span>
          ${ex.element ? `<span class="el">${esc(ex.element)}${count ? ` <span class="cnt">· ${esc(count)}</span>` : ""}</span>` : ""}
          ${ex.why ? `<span class="why">${esc(ex.why)}</span>` : ""}
          ${ex.fix ? `<span class="fix">→ ${esc(ex.fix)}</span>` : ""}
          <button class="more" type="button" data-more="${gi}">${T.details}</button>
          <span class="tech">${esc(tech)}</span>
        </span></li>`;
    }).join("");
    body.innerHTML = `
      <div class="min"><strong>${esc(r.title || "UI review")}</strong><span class="muted">· ${T.paused}</span></div>
      <div class="tt"><span class="seg" role="group" aria-label="Before / After"><button type="button" data-side="AFTER" aria-pressed="true">${T.after}</button><button type="button" data-side="BEFORE" aria-pressed="false">${T.before}${r.diff?.base ? ` (${esc(r.diff.base)})` : " (HEAD)"}</button></span><span class="muted info"></span></div>
      <ul class="list">${items}</ul>
      <div class="notes"></div>
      <div class="foot">
        <textarea id="comment-text" placeholder="${esc(T.placeholder)}" aria-label="Comment"></textarea>
        <div class="row">
          <button class="ghost" id="comment-send" type="button" disabled>${T.send}</button>
          <button class="reject" id="reject" type="button">${T.reject}</button>
          <button class="approve" id="approve" type="button">${T.approve}</button>
        </div>
      </div>`;
    const text = () => $("#comment-text").value.trim();
    $("#comment-text").oninput = canSend;
    $("#comment-send").onclick = () => (text() || notes.length) && decide("COMMENT", text());
    $("#approve").onclick = () => decide("APPROVE", text());
    $("#reject").onclick = () => decide("REJECT", text());
    root.querySelectorAll(".list li[data-g]").forEach((li) => (li.onclick = () => focusGroup(Number(li.dataset.g))));
    root.querySelectorAll("[data-more]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); b.closest("li").classList.toggle("open"); }));
    root.querySelectorAll(".seg button").forEach((b) => (b.onclick = () => toggle(b.dataset.side)));
    syncFrames(); renderNotes();
    if (r.diff) setSide(r.state?.side || "AFTER");
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
      b.box.style.cssText = shown ? `left:${r.left - 3}px;top:${r.top - 3}px;width:${r.width + 6}px;height:${r.height + 6}px` : "display:none";
    }
  }
  const schedule = () => { if ((boxes.length || picking) && !raf) raf = requestAnimationFrame(place); };
  const ro = new ResizeObserver(schedule);
  addEventListener("scroll", schedule, { capture: true, passive: true });
  addEventListener("resize", schedule, { passive: true });
  new MutationObserver(schedule).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });

  function syncFrames() {
    clearBoxes();
    const add = (sel, route, cls, tag, key) => {
      if (!sel || (route && route !== location.pathname)) return; // only frames of THIS page
      let el = null; try { el = document.querySelector(sel); } catch {}
      if (!el) return;
      const box = document.createElement("div");
      box.className = cls; Object.assign(box.dataset, key);
      box.innerHTML = `<span class="tag">${tag}</span>`;
      layer.appendChild(box);
      boxes.push({ el, box, selector: sel });
      ro.observe(el);
    };
    const gOf = new Map(); groups.forEach((g, gi) => g.items.forEach(({ i }) => gOf.set(i, gi)));
    (current?.problems || []).forEach((p, i) => add(p.selector, p.route, "box", (gOf.get(i) ?? i) + 1, { i, g: gOf.get(i) ?? i }));
    notes.forEach((n, i) => add(n.selector, n.route, "box note", `M${i + 1}`, { note: n.id }));
    place();
  }
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
    if (!here) { const r = g.items.find(({ p }) => p.route)?.p.route; if (r) location.href = r; return; } // the review is replayed there
    const b = boxes.find((x) => x.box.dataset.g !== undefined && Number(x.box.dataset.g) === gi && x.el.getBoundingClientRect().width > 0) || boxes.find((x) => Number(x.box.dataset.g) === gi);
    if (!b) return;
    b.el.scrollIntoView({ block: "center", behavior: "smooth" });
    boxes.filter((x) => Number(x.box.dataset.g) === gi).forEach((x) => { x.box.classList.add("pulse"); setTimeout(() => x.box.classList.remove("pulse"), 900); });
  }
  function focusProblem(i) {
    const p = current && current.problems[i];
    if (p && p.route && p.route !== location.pathname) { location.href = p.route; return; } // the review is replayed there
    const b = boxes.find((x) => x.box.dataset.i !== undefined && Number(x.box.dataset.i) === i);
    if (!b) return;
    b.el.scrollIntoView({ block: "center", behavior: "smooth" });
    b.box.classList.add("pulse"); setTimeout(() => b.box.classList.remove("pulse"), 900);
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
    Object.assign(panel.style, { left: `${x}px`, top: `${y}px`, bottom: "auto", transform: "none" });
    return { x, y };
  }
  function resetPlace() { Object.assign(panel.style, { left: "", top: "", bottom: "", transform: "" }); store.set({ x: null, y: null }); }
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
      if (m.type === "NOTES") { notes = m.notes || []; syncFrames(); renderNotes(); }
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
