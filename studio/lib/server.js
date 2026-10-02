// Local proxy in front of the project's dev server: serves the injector, hosts the bus, injects the panel
// into every HTML page, and passes everything else through untouched (incl. the dev server's HMR socket).
import http from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import httpProxy from "http-proxy";
import { createBus } from "./bus.js";
import { baseSite, stopBaseSites } from "./basesite.js";
import { capture, closeCapture } from "./capture.js";
import { PATH, INJECTOR_PATH, INJECT_TAG } from "./protocol.js";

const INJECTOR = join(dirname(fileURLToPath(import.meta.url)), "..", "client", "injector.js");

/** Insert the tag before the LAST </body> (an inline script or string earlier in the page may contain one). */
export function injectHtml(html) {
  if (html.includes(INJECT_TAG)) return html;
  const i = html.toLowerCase().lastIndexOf("</body>");
  return i < 0 ? html + INJECT_TAG : html.slice(0, i) + INJECT_TAG + html.slice(i);
}

export function startStudio({ port = 3001, target = "http://localhost:3000", host = "127.0.0.1", log = console.log } = {}) {
  const proxy = httpProxy.createProxyServer({ target, ws: true, changeOrigin: true, selfHandleResponse: true });
  // Before/After: BEFORE from a dev server of the base ref (a worktree), AFTER from the developer's own server
  const onCompare = async ({ repo, base, path, view, progress }) => {
    progress("base-site");
    const site = await baseSite({ repo, ref: base, log });
    progress("capture");
    const [before, after] = await Promise.all([capture(site.url + path, view), capture(target.replace(/\/$/, "") + path, view)]);
    return { before, after };
  };
  const bus = createBus({ log, onCompare });

  // ask for an uncompressed body so the HTML can be edited without a decompress/recompress round-trip
  proxy.on("proxyReq", (proxyReq) => proxyReq.setHeader("accept-encoding", "identity"));

  proxy.on("proxyRes", (proxyRes, req, res) => {
    const type = String(proxyRes.headers["content-type"] || "");
    const encoded = proxyRes.headers["content-encoding"] && proxyRes.headers["content-encoding"] !== "identity";
    if (!type.includes("text/html") || encoded) {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      return proxyRes.pipe(res);
    }
    const chunks = [];
    proxyRes.on("data", (c) => chunks.push(c));
    proxyRes.on("end", () => {
      const body = Buffer.from(injectHtml(Buffer.concat(chunks).toString("utf8")), "utf8");
      const headers = { ...proxyRes.headers, "content-length": String(body.length) };
      delete headers["transfer-encoding"];
      // the page now runs our script: relax a CSP that would block it, only on this local proxy
      delete headers["content-security-policy"];
      res.writeHead(proxyRes.statusCode, headers);
      res.end(body);
    });
  });

  proxy.on("error", (err, req, res) => {
    if (res && res.writeHead && !res.headersSent) { res.writeHead(502, { "content-type": "text/plain" }); res.end(`Babysitter Studio: dev server at ${target} is not answering (${err.code || err.message}).`); }
    else if (res && res.destroy) res.destroy();
  });

  const server = http.createServer((req, res) => {
    if (req.url === INJECTOR_PATH) {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
      return res.end(readFileSync(INJECTOR));
    }
    proxy.web(req, res);
  });

  server.on("upgrade", (req, socket, head) => {
    if (new URL(req.url, "http://x").pathname === PATH) {
      // Cross-site WebSocket hijacking guard: any page in the developer's browser may open a socket to
      // localhost. A panel must come from this proxy's own origin; the CLI is not a browser and sends none.
      const role = new URL(req.url, "http://x").searchParams.get("role") === "cli" ? "cli" : "studio";
      const origin = req.headers.origin;
      const port = server.address().port;
      const own = [`http://localhost:${port}`, `http://127.0.0.1:${port}`, `http://[::1]:${port}`];
      const ok = role === "cli" ? !origin : !!origin && own.includes(origin);
      if (!ok) { log(`refused a ${role} socket from ${origin || "no origin"}`); socket.write("HTTP/1.1 403 Forbidden\r\n\r\n"); return socket.destroy(); }
      return bus.handleUpgrade(req, socket, head);
    }
    else proxy.ws(req, socket, head); // the dev server's own sockets (Next/Vite HMR) keep working
  });

  return new Promise((resolve) => {
    // loopback only: the panel can approve commits, so it must not be reachable from the LAN
    server.listen(port, host, () => {
      const actual = server.address().port;
      log(`Babysitter Studio on http://localhost:${actual} → ${target}`);
      resolve({ port: actual, bus, close: () => new Promise((r) => { bus.close(); proxy.close(); stopBaseSites(); closeCapture().finally(() => server.close(() => r())); }) });
    });
  });
}
