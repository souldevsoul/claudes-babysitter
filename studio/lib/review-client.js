// The CLI side of a review: send REVIEW_REQUIRED and wait for a human in the browser.
//   approve  → resolves { decision: "approve" }   (the caller lets the commit through)
//   reject   → resolves { decision: "reject" }    (the caller aborts the commit)
//   no studio running → resolves { decision: "unavailable" } so the caller can fall back to plain blocking
//   no answer within timeoutMs → { decision: "timeout" } (callers should treat it as a reject: fail closed)
import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import { PATH } from "./protocol.js";

export function requestReview({ url = "http://localhost:3001", title = "UI review", problems = [], timeoutMs = 15 * 60_000, onComment = () => {}, onWaiting = () => {} } = {}) {
  return new Promise((resolve) => {
    const reviewId = randomUUID().slice(0, 8);
    const ws = new WebSocket(url.replace(/^http/, "ws") + PATH + "?role=cli");
    let done = false;
    const finish = (r) => { if (done) return; done = true; clearTimeout(timer); try { ws.close(); } catch {} resolve({ reviewId, ...r }); };
    const timer = setTimeout(() => finish({ decision: "timeout" }), timeoutMs);
    ws.on("error", () => finish({ decision: "unavailable" }));
    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "REVIEW_REQUIRED", reviewId, title, problems }));
      onWaiting({ reviewId, url });
    });
    ws.on("message", (raw) => {
      let m; try { m = JSON.parse(String(raw)); } catch { return; }
      if (m.reviewId !== reviewId) return;
      if (m.type === "COMMENT") onComment(m.text);
      if (m.type === "DECISION") finish({ decision: m.decision, text: m.text, comments: m.comments || [] });
    });
    ws.on("close", () => finish({ decision: "unavailable" }));
  });
}
