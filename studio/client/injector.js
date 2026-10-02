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
  .head { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid #23262d; font-size: 13px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #71717a; }
  .dot.on { background: #22c55e; } .dot.alert { background: #ef4444; }
  .title { font-weight: 600; flex: 1; } .muted { color: #a1a1aa; font-size: 12px; }
  .list { max-height: 180px; overflow: auto; margin: 0; padding: 6px 0; list-style: none; }
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
</style>
<div class="layer" part="layer"></div>
<div class="panel" role="region" aria-label="Babysitter Studio">
  <div class="head"><span class="dot"></span><span class="title">Babysitter Studio</span><span class="muted status">connecting…</span></div>
  <div class="body"></div>
</div>`;
  const $ = (s) => root.querySelector(s);
  const layer = $(".layer"), body = $(".body"), dot = $(".dot"), status = $(".status"), title = $(".title");
  (document.body || document.documentElement).appendChild(host);

  let ws, retry = 500, queue = [], current = null, boxes = [], raf = 0, side = "AFTER";
  const panel = $(".panel");
  const plural = (n) => `${n} problem${n === 1 ? "" : "s"}`;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const send = (m) => ws && ws.readyState === 1 && ws.send(JSON.stringify(m));

  /* Time Travel. The panel only asks; the frozen CLI swaps the files on disk (HMR re-renders the page) and
   * answers with DIFF_STATE. Until it does, the switch shows "switching…". Frames hide on BEFORE: the old DOM
   * need not contain the flagged nodes. */
  function setSide(next, note) {
    side = next;
    panel.classList.toggle("before", side === "BEFORE");
    layer.classList.toggle("hidden", side === "BEFORE");
    root.querySelectorAll(".seg button").forEach((b) => { b.setAttribute("aria-pressed", String(b.dataset.side === side)); b.disabled = false; });
    const info = $(".tt .info");
    if (info) info.innerHTML = note ? `<span class="err">${esc(note)}</span>` : side === "BEFORE" ? "Viewing HEAD · frames hidden" : `Your changes · ${current?.diff?.files ?? 0} file(s) differ from HEAD`;
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
    panel.classList.remove("before"); layer.classList.remove("hidden"); side = "AFTER";
    body.innerHTML = `<div class="min muted">${note || "Watching. Reviews from the Babysitter CLI appear here."}</div>`;
    clearBoxes();
  }

  function renderReview(r) {
    const list = r.problems || [];
    dot.className = "dot alert";
    title.textContent = `Babysitter: ${plural(list.length)}`;
    status.textContent = `review ${r.reviewId}`;
    const items = list.map((p, i) => `
      <li data-i="${i}"><span class="n${p.selector ? "" : " static"}">${i + 1}</span>
        <span><div>${esc(p.message)}</div><div class="where">${esc([p.route && p.route !== location.pathname ? "on " + p.route : "", p.selector || [p.file, p.line].filter(Boolean).join(":")].filter(Boolean).join(" · "))}</div></span></li>`).join("");
    body.innerHTML = `
      <div class="min"><strong>${esc(r.title || "UI review")}</strong><span class="muted">· the CLI is paused until you decide</span></div>
      ${r.diff ? `<div class="tt"><span class="seg" role="group" aria-label="Compare with HEAD"><button type="button" data-side="AFTER" aria-pressed="true">After</button><button type="button" data-side="BEFORE" aria-pressed="false">👁 Before (HEAD)</button></span><span class="muted info"></span></div>` : ""}
      <ul class="list">${items}</ul>
      <div class="foot">
        <textarea id="comment-text" placeholder="What should change? Send Comment returns the work to its author with this brief…" aria-label="Comment"></textarea>
        <div class="row">
          <button class="ghost" id="comment-send" type="button" disabled>Send Comment</button>
          <button class="reject" id="reject" type="button">Reject</button>
          <button class="approve" id="approve" type="button">Approve</button>
        </div>
      </div>`;
    const text = () => $("#comment-text").value.trim();
    $("#comment-text").oninput = () => ($("#comment-send").disabled = !text());
    $("#comment-send").onclick = () => text() && decide("COMMENT", text());
    $("#approve").onclick = () => decide("APPROVE", text());
    $("#reject").onclick = () => decide("REJECT", text());
    root.querySelectorAll(".list li").forEach((li) => (li.onclick = () => focusProblem(Number(li.dataset.i))));
    root.querySelectorAll(".seg button").forEach((b) => (b.onclick = () => toggle(b.dataset.side)));
    drawBoxes(list);
    if (r.diff) setSide(r.state?.side || "AFTER");
  }

  function decide(type, text) {
    if (!current) return;
    root.querySelectorAll("button").forEach((b) => (b.disabled = true));
    send({ type, reviewId: current.reviewId, text: text || undefined });
  }

  /* red frames over the flagged elements. Repositioned on scroll (any scroller: capture), resize, element
   * resize and DOM changes (HMR re-renders swap nodes) — coalesced to one layout read per animation frame. */
  function place() {
    raf = 0;
    for (const b of boxes) {
      if (!b.el.isConnected) { try { b.el = document.querySelector(b.selector) || b.el; ro.observe(b.el); } catch {} }
      const r = b.el.getBoundingClientRect();
      const shown = b.el.isConnected && (r.width || r.height);
      b.box.style.cssText = shown ? `left:${r.left - 3}px;top:${r.top - 3}px;width:${r.width + 6}px;height:${r.height + 6}px` : "display:none";
    }
  }
  const schedule = () => { if (boxes.length && !raf) raf = requestAnimationFrame(place); };
  const ro = new ResizeObserver(schedule);
  addEventListener("scroll", schedule, { capture: true, passive: true });
  addEventListener("resize", schedule, { passive: true });
  new MutationObserver(schedule).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });

  function drawBoxes(problems) {
    clearBoxes();
    problems.forEach((p, i) => {
      if (!p.selector || (p.route && p.route !== location.pathname)) return; // only problems of THIS page
      let el = null; try { el = document.querySelector(p.selector); } catch {}
      if (!el) return;
      const box = document.createElement("div");
      box.className = "box"; box.dataset.i = i;
      box.innerHTML = `<span class="tag">${i + 1}</span>`;
      layer.appendChild(box);
      boxes.push({ el, box, selector: p.selector });
      ro.observe(el);
    });
    place();
  }
  function clearBoxes() { cancelAnimationFrame(raf); raf = 0; ro.disconnect(); layer.innerHTML = ""; boxes = []; }
  function focusProblem(i) {
    const p = current && current.problems[i];
    if (p && p.route && p.route !== location.pathname) { location.href = p.route; return; } // the review is replayed there
    const b = boxes.find((x) => Number(x.box.dataset.i) === i);
    if (!b) return;
    b.el.scrollIntoView({ block: "center", behavior: "smooth" });
    b.box.classList.add("pulse"); setTimeout(() => b.box.classList.remove("pulse"), 900);
  }

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
