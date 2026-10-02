import { chromium } from "@playwright/test";
const [label, out] = process.argv.slice(2);
const pages = { home: "/", about: "/about", changelog: "/changelog", contact: "/contact", docs: "/docs", faq: "/faq", hardware: "/hardware", "how-it-works": "/how-it-works", pricing: "/pricing", status: "/status", support: "/support", terms: "/legal/terms", privacy: "/legal/privacy", "executor-terms": "/legal/executor-terms", cookies: "/legal/cookies", login: "/login", register: "/register", forgot: "/forgot-password", reset: "/reset-password?token=x", demo: "/demo", notfound: "/no-such-page" };
const b = await chromium.launch({ channel: "chrome" });
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" })).newPage();
for (const [name, path] of Object.entries(pages)) {
  await p.goto("http://localhost:4321" + path, { waitUntil: "networkidle" }).catch(() => {});
  await p.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important} canvas{visibility:hidden!important} nextjs-portal{display:none!important}" });
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 300) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); } scrollTo(0, 0); });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${out}/w-${label}-${name}.png`, fullPage: true });
}
await b.close();
