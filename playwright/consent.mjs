// Closes a cookie/consent banner the way a visitor would, so it cannot sit on top of the login form.
// Self-contained (no __ui helpers): prepare.mjs runs it before the checks install anything.
// Prefers the privacy-preserving choice ("Reject all" / "Only necessary"), then "Accept".

const REJECT = /^(reject( all)?|decline( all)?|deny|only (necessary|essential)|necessary only|essential only|отклонить( все)?|только необходимые)$/i;
const ACCEPT = /^(accept( all)?|allow( all)?|agree|i agree|got it|ok(ay)?|принять( все)?|согласен)$/i;

/** @param {import("@playwright/test").Page} page @returns {Promise<string|null>} the label clicked, or null */
export async function dismissConsent(page) {
  const label = await page.evaluate(({ reject, accept }) => {
    const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
    const named = (el) => /cookie|consent|куки/i.test(`${typeof el.className === "string" ? el.className : ""} ${el.id} ${el.getAttribute("aria-label") || ""}`);
    const banners = Array.from(document.querySelectorAll("body *")).filter((el) => {
      if (!visible(el)) return false;
      const fixed = /^(fixed|sticky)$/.test(getComputedStyle(el).position) || el.getAttribute("role") === "dialog" || el.getAttribute("role") === "region";
      return (named(el) || (fixed && /cookie|куки/i.test(el.textContent || ""))) && el.querySelector("button, [role=button]");
    });
    for (const rx of [new RegExp(reject, "i"), new RegExp(accept, "i")])
      for (const b of banners)
        for (const btn of Array.from(b.querySelectorAll("button, [role=button]"))) {
          const t = (btn.textContent || "").trim().replace(/\s+/g, " ");
          if (visible(btn) && rx.test(t)) { btn.setAttribute("data-bs-consent-choice", ""); return t; }
        }
    return null;
  }, { reject: REJECT.source, accept: ACCEPT.source }).catch(() => null);
  if (!label) return null;
  await page.locator("[data-bs-consent-choice]").first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(400);
  return label;
}
