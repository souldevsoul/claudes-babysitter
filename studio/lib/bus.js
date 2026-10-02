// WebSocket bus between the CLI (role=cli) and the browser panel(s) (role=studio).
import { WebSocketServer } from "ws";

export function createBus({ log = () => {} } = {}) {
  const wss = new WebSocketServer({ noServer: true });
  const studios = new Set();
  const reviews = new Map(); // reviewId -> { msg, cli }
  // Visual Prompting: notes a human pinned to elements. They live here (not in a page) so they survive reloads and
  // route changes, and leave with the next REJECT / COMMENT, or when a hook takes them (NOTES_TAKE).
  let notes = [], seq = 0;
  const clip = (v, n) => (typeof v === "string" ? v.slice(0, n) : undefined);
  const notesChanged = () => toStudios({ type: "NOTES", notes });
  const takeNotes = () => { const out = notes; notes = []; if (out.length) notesChanged(); return out; };
  const send = (ws, m) => ws.readyState === 1 && ws.send(JSON.stringify(m));
  const toStudios = (m) => studios.forEach((s) => send(s, m));

  const close = (id, decision, text) => {
    const r = reviews.get(id);
    if (!r) return;
    reviews.delete(id);
    const manual = decision === "approve" || r.cli.readyState !== 1 ? [] : takeNotes(); // approve leaves notes pending for the next prompt
    send(r.cli, { type: "DECISION", reviewId: id, decision, text, manual });
    toStudios({ type: "REVIEW_CLOSED", reviewId: id, decision });
    log(`review ${id}: ${decision}${text ? ` — ${text}` : ""}${manual.length ? ` + ${manual.length} manual note(s)` : ""}`);
  };

  wss.on("connection", (ws, req) => {
    const role = new URL(req.url, "http://x").searchParams.get("role") === "cli" ? "cli" : "studio";
    if (role === "studio") {
      studios.add(ws);
      for (const r of reviews.values()) { send(ws, r.msg); if (r.diff) send(ws, r.diff); } // a panel opened later still sees it, on the right side
      send(ws, { type: "NOTES", notes });
    }
    ws.on("message", (raw) => {
      let m; try { m = JSON.parse(String(raw)); } catch { return; }
      if (role === "cli" && m.type === "REVIEW_REQUIRED") {
        reviews.set(m.reviewId, { msg: m, cli: ws, diff: null });
        toStudios(m);
        log(`review ${m.reviewId}: ${m.problems?.length || 0} problem(s) waiting for a human`);
        return;
      }
      // Time Travel: the CLI that owns the review swaps the files and reports which side is on disk
      if (role === "cli" && m.type === "DIFF_STATE" && reviews.get(m.reviewId)?.cli === ws) {
        reviews.get(m.reviewId).diff = m;
        toStudios(m);
        return;
      }
      // two-step hand-over: notes leave the bus only once the hook confirms it has them (a timed-out hook loses nothing)
      if (role === "cli" && m.type === "NOTES_TAKE") { send(ws, { type: "NOTES_OFFER", notes }); return; }
      if (role === "cli" && m.type === "NOTES_ACK" && Array.isArray(m.ids)) { const before = notes.length; notes = notes.filter((n) => !m.ids.includes(n.id)); if (notes.length !== before) notesChanged(); return; }
      if (role === "studio" && m.type === "NOTE_ADD" && m.note && typeof m.note.selector === "string" && typeof m.note.comment === "string" && m.note.comment.trim() && notes.length < 50) {
        const n = m.note;
        notes.push({ id: ++seq, selector: clip(n.selector, 500), comment: clip(n.comment.trim(), 2000), route: clip(n.route, 300), tag: clip(n.tag, 40), text: clip(n.text, 120), classes: clip(n.classes, 200), size: clip(n.size, 20) });
        notesChanged(); log(`note M${notes.length} on ${n.selector}`);
        return;
      }
      if (role === "studio" && m.type === "NOTE_REMOVE") { notes = notes.filter((n) => n.id !== m.id); notesChanged(); return; }
      if (role !== "studio" || !reviews.has(m.reviewId)) return;
      if (m.type === "TOGGLE_DIFF" && (m.side === "BEFORE" || m.side === "AFTER")) {
        send(reviews.get(m.reviewId).cli, { type: "TOGGLE_DIFF", reviewId: m.reviewId, side: m.side }); // only an enum crosses: panels never name files
        return;
      }
      // COMMENT ends the review too: the work goes back to its author (Claude) with the comment as the brief
      if (m.type === "COMMENT" && (m.text || notes.length)) close(m.reviewId, "comment", m.text || "");
      if (m.type === "APPROVE") close(m.reviewId, "approve", m.text);
      if (m.type === "REJECT") close(m.reviewId, "reject", m.text);
    });
    ws.on("close", () => {
      studios.delete(ws);
      // the CLI gave up (Ctrl-C, timeout): take its reviews off the panels
      for (const [id, r] of reviews) if (r.cli === ws) { reviews.delete(id); toStudios({ type: "REVIEW_CLOSED", reviewId: id, decision: "abandoned" }); }
    });
  });

  return {
    handleUpgrade: (req, socket, head) => wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req)),
    pending: () => [...reviews.keys()],
    notes: () => notes,
    close: () => { for (const c of wss.clients) c.terminate(); wss.close(); },
  };
}
