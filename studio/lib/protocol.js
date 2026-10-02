// Messages on the bus (JSON over WebSocket, path /__babysitter/ws).
//
//   CLI → bus      { type: "REVIEW_REQUIRED", reviewId, title, problems: [{ selector?, message, file?, line?, route? }] }
//   bus → studio   { type: "REVIEW_REQUIRED", ... }           (also replayed to a studio that connects later)
//   studio → bus   { type: "APPROVE" | "REJECT", reviewId, text? }   ends the review
//                  { type: "COMMENT", reviewId, text }               does not end it
//   bus → CLI      { type: "DECISION", reviewId, decision: "approve" | "reject", text?, comments: [] }
//                  { type: "COMMENT", reviewId, text }
//   bus → studio   { type: "REVIEW_CLOSED", reviewId, decision }   (also when the CLI goes away: decision "abandoned")
export const PATH = "/__babysitter/ws";
export const INJECTOR_PATH = "/__babysitter/injector.js";
export const INJECT_TAG = `<script src="${INJECTOR_PATH}" defer></script>`;
