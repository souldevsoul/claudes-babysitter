// A small product for the express parity test: pages built to break many checks at once (overflow, native controls,
// contrast, emoji icons, two h1s, a dialog, a dropdown menu, a burger menu, a form, money without separators, a long
// list, a clipped table, hover that hurts contrast), a language switched by a URL prefix (/kk, announced by hreflang),
// and a signed-in area (one role). Everything is static: no timers, no randomness — two runs see the same pages.
import { createServer } from "node:http";

const T = {
  en: { title: "Invoices without the paperwork", lead: "Send an invoice in a minute and get paid.", cta: "Start free", about: "About", pricing: "Pricing", form: "Contact" },
  kk: { title: "Қағазсыз шот-фактуралар", lead: "Шот-фактураны бір минутта жіберіп, төлем алыңыз.", cta: "Тегін бастау қазір бірден", about: "Біз туралы", pricing: "Бағалар", form: "Байланыс" },
};
const css = `:root{--bg:#fff;--fg:#15151f;--muted:#5b5b6e;--primary:#2f45d0;--border:#c8c8d4;--card:#f3f3f8}
*{box-sizing:border-box}body{margin:0;font:16px/1.5 Arial,sans-serif;color:var(--fg);background:var(--bg)}
header{display:flex;align-items:center;gap:16px;padding:12px 20px;border-bottom:1px solid var(--border);background:var(--bg)}
header nav{display:flex;gap:14px}header nav a{color:var(--fg);text-decoration:none}
.burger{display:none;height:40px;padding:0 12px}
@media (max-width:767px){header nav{display:none}.burger{display:inline-flex;align-items:center}}
#mnav{display:none;position:fixed;inset:60px 0 0 0;background:#fff;padding:20px;border-top:1px solid var(--border)}#mnav.open{display:block}#mnav a{display:block;padding:10px 0;color:var(--fg)}
main{max-width:1100px;margin:0 auto;padding:24px 20px}
.btn{display:inline-flex;align-items:center;height:40px;padding:0 16px;border-radius:8px;background:var(--primary);color:#fff;border:0;font:inherit;cursor:pointer}
.btn.ghost:hover{background:#e9e9ef;color:#d8d8e0}
.row{display:flex;gap:16px;flex-wrap:wrap}.card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px;width:240px}
.wide{width:1400px;height:20px;background:#eee}
.faint{color:#c4c4c4}.tiny{font-size:9px}
.menu{position:relative;display:inline-block}.menu [role=menu]{display:none;position:absolute;top:44px;left:0;background:#fff;border:1px solid var(--border);border-radius:8px;padding:6px;min-width:160px}
.menu.open [role=menu]{display:block}
dialog{border:1px solid var(--border);border-radius:12px;padding:20px;width:min(480px,92vw)}
table{border-collapse:collapse}td,th{border:1px solid var(--border);padding:8px 12px;white-space:nowrap}
.fake{text-decoration:underline;color:var(--fg)}
input.bare{border:0;background:transparent;height:36px}
footer{border-top:1px solid var(--border);padding:20px;display:flex;gap:14px;flex-wrap:wrap}footer a{color:var(--fg)}`;
const page = (lang, title, body, { auth = false, path = "/" } = {}) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<link rel="alternate" hreflang="en" href="${path}"><link rel="alternate" hreflang="kk" href="/kk${path === "/" ? "" : path}">
<style>${css}</style></head><body>
<header><a href="/" class="logo" style="font-weight:700;color:var(--fg);text-decoration:none">Ledgerly</a>
<nav><a href="/">${T[lang].title.split(" ")[0]}</a><a href="/pricing">${T[lang].pricing}</a><a href="/form">${T[lang].form}</a>${auth ? '<a href="/account">Account</a>' : '<a href="/login">Sign in</a>'}</nav>
<button class="burger" type="button" aria-label="Menu" aria-expanded="false" onclick="const m=document.getElementById('mnav');m.classList.toggle('open');this.setAttribute('aria-expanded',m.classList.contains('open'))">☰</button>
<a href="/kk" hreflang="kk">KK</a></header>
<div id="mnav"><a href="/">Home</a><a href="/pricing">${T[lang].pricing}</a><a href="/form">${T[lang].form}</a></div>
<main>${body}</main>
<footer><a href="/terms">Terms of Service</a><a href="/privacy">Privacy Policy</a><span>© 2026 Ledgerly</span><a href="mailto:help@ledgerly.test">help@ledgerly.test</a></footer>
</body></html>`;
const home = (lang) => `<h1>${T[lang].title}</h1><h1>${T[lang].lead}</h1>
<p class="faint">Low contrast text that is hard to read.</p><p class="tiny">Tiny print nobody can read.</p>
<div class="row"><div class="card"><h3>🚀 Fast</h3><p>Short.</p><a class="btn" href="/pricing">${T[lang].cta}</a></div><div class="card"><h3>🔒 Safe</h3><p>A much longer description that makes this card taller than the others in the row by a lot.</p></div><div class="card"><h3>Clear</h3><button class="btn ghost" type="button">Learn more</button></div></div>
<p><select><option>Monthly</option><option>Yearly</option></select> <input type="checkbox"> <input class="bare" placeholder="Search invoices"></p>
<div class="menu"><button class="btn" type="button" aria-haspopup="menu" aria-expanded="false" onclick="const m=this.parentElement;m.classList.toggle('open');this.setAttribute('aria-expanded',m.classList.contains('open'))">Options</button><div role="menu"><a role="menuitem" href="/pricing">Zebra plan</a><a role="menuitem" href="/pricing">Alpha plan</a></div></div>
<button class="btn" type="button" onclick="document.getElementById('dlg').showModal()">Open dialog</button>
<dialog id="dlg" aria-label="Plan details"><h2>Plan details</h2><p>Everything included for 1200 credits a month.</p><input type="number" value="3"><div class="wide"></div><button type="button" onclick="this.closest('dialog').close()">Close</button></dialog>
<p><span class="fake">Looks like a link</span></p><div class="wide"></div>`;
const pricing = `<h1>Pricing</h1><p>Pro costs $12000 a year, VAT included.</p>
<table><thead><tr><th>Plan</th><th>Invoices</th><th>Users</th><th>Storage</th><th>Support</th><th>Price</th></tr></thead><tbody>${["Free", "Pro", "Team"].map((p, i) => `<tr><td>${p}</td><td>${(i + 1) * 100}</td><td>${i + 1}</td><td>${(i + 1) * 5} GB</td><td>email and chat</td><td>${(i + 1) * 1500} credits</td></tr>`).join("")}</tbody></table>
<ul>${Array.from({ length: 26 }, (_, i) => `<li>Invoice template number ${i + 1}</li>`).join("")}</ul>`;
const form = `<h1>Contact us</h1><form onsubmit="event.preventDefault()"><label>Name <input name="name"></label><label>Amount <input name="amount" type="number"></label><label>Password <input name="pw" type="password"></label><label>File <input type="file"></label><button class="btn" type="submit">Send</button></form>`;
const legal = (name) => `<h1>${name}</h1><p>These terms apply to Ledgerly. Read the Privacy Policy and the Cookie Policy too.</p>${Array.from({ length: 4 }, (_, i) => `<h2>Section ${i + 1}</h2><p>Text of section ${i + 1}.</p>`).join("")}`;
export function start() {
  const srv = createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const signed = /sid=user/.test(req.headers.cookie || "");
    const send = (code, html, headers = {}) => { res.writeHead(code, { "content-type": "text/html; charset=utf-8", ...headers }); res.end(html); };
    const p = u.pathname;
    if (p === "/" || p === "/kk") { const lang = p === "/kk" ? "kk" : "en"; return send(200, page(lang, "Ledgerly", home(lang), { auth: signed, path: "/" })); }
    if (p === "/pricing" || p === "/kk/pricing") return send(200, page(p.startsWith("/kk") ? "kk" : "en", "Pricing — Ledgerly", pricing, { auth: signed, path: "/pricing" }));
    if (p === "/form" || p === "/kk/form") return send(200, page(p.startsWith("/kk") ? "kk" : "en", "Contact — Ledgerly", form, { auth: signed, path: "/form" }));
    if (p === "/terms") return send(200, page("en", "Terms of Service — Ledgerly", legal("Terms of Service"), { path: "/terms" }));
    if (p === "/privacy") return send(200, page("en", "Privacy Policy — Ledgerly", legal("Privacy Policy"), { path: "/privacy" }));
    if (p === "/login") return send(200, page("en", "Sign in — Ledgerly", `<h1>Sign in</h1><form onsubmit="event.preventDefault(); document.cookie='sid=user; path=/'; location.href='/account'"><input type="email" name="email" autocomplete="email"><input type="password" name="password"><button class="btn" type="submit">Sign in</button></form>`, { path: "/login" }));
    if (p === "/account") return signed ? send(200, page("en", "Account — Ledgerly", `<h1>Account</h1><p>Balance: 2500 credits</p><div class="row"><div class="card">Invoices</div><div class="card">Clients 🙂</div></div><button class="btn" type="button" onclick="document.getElementById('d2').showModal()">Top up</button><dialog id="d2" aria-label="Top up"><h2>Top up</h2><p>5000 credits for €4500</p><button type="button" onclick="this.closest('dialog').close()">Close</button></dialog>`, { auth: true, path: "/account" })) : send(302, "", { location: "/login" });
    send(404, page("en", "Not found", "<h1>Not found</h1>"));
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r({ url: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() })));
}
