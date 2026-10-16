// A tiny product for the RUN tests: a language switcher that stores the language in localStorage (az, Praxis-style),
// a /kk URL prefix announced by hreflang, a signed-in area with a task list whose rows navigate by click (no href) to a
// dynamic /tasks/[id] page, two roles, and pages that break only in Azerbaijani.
import { createServer } from "node:http";
const T = {
  en: { title: "Find a specialist for your task", cta: "Apply", hire: "Hire the best people", about: "About us", col: "Task" },
  az: { title: "Find a specialist for your task", cta: "Mütəxəssis kimi müraciət edin indi", hire: "Ən yaxşı insanları işə götürün", about: "Haqqımızda", col: "Tapşırıqlar" },
  kk: { title: "Тапсырмаңызға маман табыңыз", cta: "Өтінім", hire: "Ең жақсы адамдарды жалдаңыз", about: "Біз туралы", col: "Іс" },
};
const page = (lang, body, { hreflang = true } = {}) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
${hreflang ? '<link rel="alternate" hreflang="en" href="/"><link rel="alternate" hreflang="kk" href="/kk">' : ""}
<style>body{margin:0;font:16px Arial;color:#111;background:#fff} header{display:flex;gap:8px;padding:8px;border-bottom:1px solid #ccc} main{padding:16px}
.card{background:#f2f2f2;border:1px solid #bbb;border-radius:8px;padding:12px;width:160px} th.col{width:44px;font-size:13px;word-break:break-all;text-align:left} .cta{white-space:nowrap;height:40px;padding:0 12px}</style></head>
<body><header><a href="/">Home</a><button type="button" data-l="en" title="English">EN</button><button type="button" data-l="az" title="Azərbaycanca">AZ</button><a href="/kk" hreflang="kk">KK</a></header>
<main>${body}</main><footer><a href="/about">About</a></footer>
<script>
document.querySelectorAll("[data-l]").forEach((b) => b.onclick = () => { localStorage.setItem("site-locale", b.dataset.l); location.reload(); });
const L = ${JSON.stringify(T)};
if (document.documentElement.lang !== "kk") {
  const lang = localStorage.getItem("site-locale") || "en";
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-t]").forEach((e) => e.textContent = L[lang][e.dataset.t]);
}
</script></body></html>`;
const home = (lang) => `<h1 data-t="title">${T[lang].title}</h1><p data-t="hire">${T[lang].hire}</p><div class="card"><button class="cta" data-t="cta">${T[lang].cta}</button></div><a href="/about" data-t="about">${T[lang].about}</a><table><thead><tr><th class="col" data-t="col">${T[lang].col}</th><th>1,200</th></tr></thead></table>`;
export function start() {
  const srv = createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const sid = /sid=(\w+)/.exec(req.headers.cookie || "")?.[1];
    const send = (code, html, headers = {}) => { res.writeHead(code, { "content-type": "text/html; charset=utf-8", ...headers }); res.end(html); };
    if (u.pathname === "/") return send(200, page("en", home("en")));
    if (u.pathname === "/kk") return send(200, page("kk", home("kk")));
    if (u.pathname === "/about") return send(200, page("en", `<h1>About</h1><p data-t="hire">${T.en.hire}</p>`));
    if (u.pathname === "/login") return send(200, page("en", `<h1>Sign in</h1><form onsubmit="event.preventDefault(); document.cookie='sid=' + (this.email.value.startsWith('spec') ? 'spec' : 'user') + '; path=/'; location.href='/dashboard'"><input type="email" name="email"><input type="password" name="password"><button type="submit">Sign in</button></form>`, { hreflang: false }));
    if (/^\/(dashboard|tasks)/.test(u.pathname) && !sid) return send(302, "", { location: "/login" });
    if (u.pathname === "/dashboard") return send(200, page("en", `<h1>Dashboard</h1><a href="/tasks">Tasks</a>${sid === "spec" ? '<a href="/dashboard/jobs">Jobs</a>' : ""}`, { hreflang: false }));
    if (u.pathname === "/dashboard/jobs" && sid === "spec") return send(200, page("en", `<h1>Jobs</h1>`, { hreflang: false }));
    if (u.pathname === "/tasks") return send(200, page("en", `<h1>Tasks</h1><table><tbody><tr style="cursor:pointer" onclick="location.href='/tasks/cmv8abcdefghijklmnopqrstu'"><td>Logo design</td><td>1,200 credits</td></tr></tbody></table>`, { hreflang: false }));
    if (/^\/tasks\/\w+$/.test(u.pathname)) return send(200, page("en", `<h1>Logo design</h1><p>Price 1200 credits</p>`, { hreflang: false }));
    send(404, "<h1>Not found</h1>");
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r({ url: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() })));
}
