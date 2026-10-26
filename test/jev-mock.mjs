// A Jev endpoint for the tests: no network, no token of anyone's. `answer(key, question, state)` returns a noul
// probability (number) or a choice ({ option: p, … }); the default answers "no" to every noul and the first option
// of every choice with certainty 0.1 spread. Records every request.
import http from "node:http";

export async function mockJev(answer = () => null, { status = null } = {}) {
  const requests = [];
  let n = 0;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      n++;
      const j = JSON.parse(body || "{}");
      requests.push({ auth: req.headers.authorization, body: j });
      const st = typeof status === "function" ? status(n, j) : status;
      if (st && st !== 200) { res.writeHead(st, { "content-type": "application/json", ...(st === 429 ? { "retry-after": "0" } : {}) }); res.end(JSON.stringify({ error: { message: `mock ${st}` } })); return; }
      const answers = {};
      for (const [k, q] of Object.entries(j.questions || {})) {
        const a = answer(k, q, j.state);
        if (q.type === "noul") answers[k] = { noul: typeof a === "number" ? a : 0 };
        else {
          const opts = Object.keys(q.criteria || {});
          const pr = a && typeof a === "object" ? a : { [opts[0]]: 1 };
          const full = Object.fromEntries(opts.map((o) => [o, pr[o] || 0]));
          const best = Object.entries(full).sort((x, y) => y[1] - x[1])[0][0];
          answers[k] = { choice: best, probabilities: full, confidence: full[best] };
        }
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ answers, usage: { cost_usd: 0.001 } }));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/decide`;
  return { url, requests, close: () => new Promise((r) => server.close(r)), env: { BABYSITTER_JEV_URL: url, JEV_API_KEY: "test-token-not-real", AI_GATEWAY_API_KEY: "", VERCEL_OIDC_TOKEN: "" } };
}
