// The CLI side of a review: send REVIEW_REQUIRED and wait for a human in the browser.
//   approve  → resolves { decision: "approve" }   (the caller lets the commit through)
//   reject   → resolves { decision: "reject" }    (the caller aborts the commit)
//   comment  → resolves { decision: "comment", text } (send the work back to its author with this brief)
//   reject / comment also carry manual: [{ selector, comment, route, text, classes }] — notes pinned in the panel
//   diff: { files } advertises Time Travel; onToggle(side) must switch the disk and return { side, files } or throw
//   no studio running → resolves { decision: "unavailable" } so the caller can fall back to plain blocking
//   no answer within timeoutMs → { decision: "timeout" } (callers should treat it as a reject: fail closed)
import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import { PATH } from "./protocol.js";
import { explain } from "../../lib/explain.js";

export function requestReview({ url = "http://localhost:3001", title = "UI review", problems = [], timeoutMs = 15 * 60_000, onWaiting = () => {}, diff = null, onToggle = null, diffNote = null } = {}) {
  return new Promise((resolve) => {
    const reviewId = randomUUID().slice(0, 8);
    const ws = new WebSocket(url.replace(/^http/, "ws") + PATH + "?role=cli");
    let done = false, toggling = Promise.resolve();
    const finish = (r) => { if (done) return; done = true; clearTimeout(timer); try { ws.close(); } catch {} resolve({ reviewId, ...r }); };
    const timer = setTimeout(() => finish({ decision: "timeout" }), timeoutMs);
    ws.on("error", () => finish({ decision: "unavailable" }));
    ws.on("open", () => {
      // every finding goes out with its plain-language explanation (what, why, how to fix) and a group key
      const explained = problems.map(explain);
      // diff: { repo, base, files, live } — repo/base let Studio capture Before/After; live = files can also be swapped
      const d = diff ? { ...diff, live: !!onToggle } : null;
      ws.send(JSON.stringify({ type: "REVIEW_REQUIRED", reviewId, title, problems: explained, diff: d && d.repo ? d : onToggle ? d : null, diffNote: d ? null : diffNote || "no-repo" }));
      onWaiting({ reviewId, url });
    });
    ws.on("message", (raw) => {
      let m; try { m = JSON.parse(String(raw)); } catch { return; }
      if (m.reviewId !== reviewId) return;
      if (m.type === "TOGGLE_DIFF" && onToggle) {
        // one switch at a time: a staged swap takes a few seconds and must not interleave with the next
        toggling = toggling.then(async () => {
          let state;
          try { state = { ...(await onToggle(m.side)), error: undefined }; } catch (e) { state = { side: m.side === "BEFORE" ? "AFTER" : "BEFORE", error: e.message }; }
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: "DIFF_STATE", reviewId, ...state }));
        });
      }
      if (m.type === "DECISION") finish({ decision: m.decision, text: m.text, manual: m.manual || [] });
    });
    ws.on("close", () => finish({ decision: "unavailable" }));
  });
}

// Take the notes pinned in the panel while no review was waiting (hooks call this). Fast: local socket, short timeout.
export function takeNotes({ url = "http://localhost:3001", timeoutMs = 1500 } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const ws = new WebSocket(url.replace(/^http/, "ws") + PATH + "?role=cli");
    const finish = (notes) => { if (done) return; done = true; clearTimeout(timer); try { ws.close(); } catch {} resolve(notes); };
    const timer = setTimeout(() => finish([]), timeoutMs);
    ws.on("error", () => finish([]));
    ws.on("open", () => ws.send(JSON.stringify({ type: "NOTES_TAKE" })));
    ws.on("message", (raw) => {
      let m; try { m = JSON.parse(String(raw)); } catch { return; }
      if (m.type !== "NOTES_OFFER" || done) return;
      const notes = m.notes || [];
      if (!notes.length) return finish([]);
      ws.send(JSON.stringify({ type: "NOTES_ACK", ids: notes.map((n) => n.id) }), () => finish(notes)); // resolve once the ACK is out
    });
  });
}
