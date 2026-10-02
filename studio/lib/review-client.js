// The CLI side of a review: send REVIEW_REQUIRED and wait for a human in the browser.
//   approve  → resolves { decision: "approve" }   (the caller lets the commit through)
//   reject   → resolves { decision: "reject" }    (the caller aborts the commit)
//   comment  → resolves { decision: "comment", text } (send the work back to its author with this brief)
//   reject / comment also carry manual: [{ selector, comment, route, text, classes }] — notes pinned in the panel
//   diff: { files } advertises Time Travel; onToggle(side) must switch the disk and return { side, files } or throw
//   no studio running → resolves { decision: "unavailable" } so the caller can fall back to plain blocking
//   proposals: [{ id, title, status, … }] — fixes kept next to the original; onProposal({ id, decision, text }, api)
//   handles a decision on one of them; api.update({ problems, fixed, proposals, diff, event }) changes the review in place
//   no answer within timeoutMs → { decision: "timeout" } (callers should treat it as a reject: fail closed)
import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import { PATH } from "./protocol.js";
import { explain } from "../../lib/explain.js";

export function requestReview({ url = "http://localhost:3001", title = "UI review", problems = [], fixed = [], proposals = null, onProposal = null, onOpen = null, timeoutMs = 15 * 60_000, onWaiting = () => {}, diff = null, onToggle = null, diffNote = null } = {}) {
  return new Promise((resolve) => {
    const reviewId = randomUUID().slice(0, 8);
    const ws = new WebSocket(url.replace(/^http/, "ws") + PATH + "?role=cli");
    let done = false, toggling = Promise.resolve(), deciding = Promise.resolve();
    // the review changes in place (a fix applied, dropped or revised): problems are explained again as they are sent
    const api = {
      reviewId,
      update: (u) => { if (ws.readyState !== 1) return; const m = { type: "REVIEW_UPDATE", reviewId, ...u }; if (u.problems) m.problems = u.problems.map(explain); if (u.fixed) m.fixed = u.fixed.map(explain); ws.send(JSON.stringify(m)); },
    };
    const finish = (r) => { if (done) return; done = true; clearTimeout(timer); try { ws.close(); } catch {} resolve({ reviewId, ...r }); };
    const timer = setTimeout(() => finish({ decision: "timeout" }), timeoutMs);
    ws.on("error", () => finish({ decision: "unavailable" }));
    ws.on("open", () => {
      // every finding goes out with its plain-language explanation (what, why, how to fix) and a group key
      const explained = problems.map(explain);
      // diff: { repo, base, files, live } — repo/base let Studio capture Before/After; live = files can also be swapped
      const d = diff ? { ...diff, live: !!onToggle } : null;
      ws.send(JSON.stringify({ type: "REVIEW_REQUIRED", reviewId, title, problems: explained, fixed: fixed.map(explain), ...(proposals ? { proposals } : {}), diff: d && d.repo ? d : onToggle ? d : null, diffNote: d ? null : diffNote || "no-repo" }));
      onWaiting({ reviewId, url });
      if (onOpen) onOpen(api);
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
      // one decision at a time: applying a patch and rebuilding the After side must not interleave
      if (m.type === "PROPOSAL" && onProposal) deciding = deciding.then(() => onProposal({ id: m.id, decision: m.decision, text: m.text }, api)).catch(() => {});
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
