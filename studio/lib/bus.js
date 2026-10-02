// WebSocket bus between the CLI (role=cli) and the browser panel(s) (role=studio).
import { WebSocketServer } from "ws";

export function createBus({ log = () => {} } = {}) {
  const wss = new WebSocketServer({ noServer: true });
  const studios = new Set();
  const reviews = new Map(); // reviewId -> { msg, cli }
  const send = (ws, m) => ws.readyState === 1 && ws.send(JSON.stringify(m));
  const toStudios = (m) => studios.forEach((s) => send(s, m));

  const close = (id, decision, text) => {
    const r = reviews.get(id);
    if (!r) return;
    reviews.delete(id);
    send(r.cli, { type: "DECISION", reviewId: id, decision, text });
    toStudios({ type: "REVIEW_CLOSED", reviewId: id, decision });
    log(`review ${id}: ${decision}${text ? ` — ${text}` : ""}`);
  };

  wss.on("connection", (ws, req) => {
    const role = new URL(req.url, "http://x").searchParams.get("role") === "cli" ? "cli" : "studio";
    if (role === "studio") {
      studios.add(ws);
      for (const r of reviews.values()) { send(ws, r.msg); if (r.diff) send(ws, r.diff); } // a panel opened later still sees it, on the right side
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
      if (role !== "studio" || !reviews.has(m.reviewId)) return;
      if (m.type === "TOGGLE_DIFF" && (m.side === "BEFORE" || m.side === "AFTER")) {
        send(reviews.get(m.reviewId).cli, { type: "TOGGLE_DIFF", reviewId: m.reviewId, side: m.side }); // only an enum crosses: panels never name files
        return;
      }
      // COMMENT ends the review too: the work goes back to its author (Claude) with the comment as the brief
      if (m.type === "COMMENT" && m.text) close(m.reviewId, "comment", m.text);
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
    close: () => { for (const c of wss.clients) c.terminate(); wss.close(); },
  };
}
