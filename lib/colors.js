// Colour parsing and WCAG 2.1 contrast, without a browser.
// Accepts: #rgb #rgba #rrggbb #rrggbbaa, rgb()/rgba(), hsl()/hsla(), bare shadcn v3 "222.2 47.4% 11.2%",
// oklch(), oklab(), lab(), lch(), color(srgb …), named white/black/transparent.
// Returns { r, g, b, a } with r,g,b in 0..1 (gamma-encoded sRGB, clamped) or null.

const clamp = (x) => Math.min(1, Math.max(0, x));
const num = (s, scale = 1) => {
  s = String(s).trim();
  if (s.endsWith("%")) return (parseFloat(s) / 100) * scale;
  return parseFloat(s);
};
const alpha = (s) => (s === undefined ? 1 : clamp(num(s, 1)));
const args = (body) => body.replace(/,/g, " ").replace(/\//g, " / ").split(/\s+/).filter(Boolean);
const splitAlpha = (parts) => { const i = parts.indexOf("/"); return i < 0 ? [parts, undefined] : [parts.slice(0, i), parts[i + 1]]; };

const linToGamma = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
const gammaToLin = (x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));

function oklabToRgb(L, a, b, A) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return {
    r: clamp(linToGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    g: clamp(linToGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    b: clamp(linToGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
    a: A,
  };
}
function labToRgb(L, a, b, A) {
  // CIE Lab (D50) → XYZ → linear sRGB (Bradford-adapted to D65)
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const e = 216 / 24389, k = 24389 / 27;
  const xr = fx ** 3 > e ? fx ** 3 : (116 * fx - 16) / k;
  const yr = L > k * e ? fy ** 3 : L / k;
  const zr = fz ** 3 > e ? fz ** 3 : (116 * fz - 16) / k;
  const X = xr * 0.96422, Y = yr, Z = zr * 0.82521;
  const r = 3.1338561 * X - 1.6168667 * Y - 0.4906146 * Z;
  const g = -0.9787684 * X + 1.9161415 * Y + 0.033454 * Z;
  const bl = 0.0719453 * X - 0.2289914 * Y + 1.4052427 * Z;
  return { r: clamp(linToGamma(r)), g: clamp(linToGamma(g)), b: clamp(linToGamma(bl)), a: A };
}
function hslToRgb(h, s, l, A) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: r + m, g: g + m, b: b + m, a: A };
}

export function parseColor(input) {
  if (!input) return null;
  let s = String(input).trim().toLowerCase();
  if (s === "white") return { r: 1, g: 1, b: 1, a: 1 };
  if (s === "black") return { r: 0, g: 0, b: 0, a: 1 };
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  let m;
  if ((m = s.match(/^#([0-9a-f]{3,8})$/))) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join("");
    const v = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
    return { r: v(0), g: v(2), b: v(4), a: h.length === 8 ? v(6) : 1 };
  }
  if ((m = s.match(/^(rgba?|hsla?|oklch|oklab|lab|lch|color)\((.*)\)$/))) {
    const fn = m[1];
    let [p, A] = splitAlpha(args(m[2]));
    if (fn.startsWith("rgb")) { if (p.length === 4 && A === undefined) A = p.pop(); return { r: clamp(num(p[0], 255) / 255), g: clamp(num(p[1], 255) / 255), b: clamp(num(p[2], 255) / 255), a: alpha(A) }; }
    if (fn.startsWith("hsl")) { if (p.length === 4 && A === undefined) A = p.pop(); return hslToRgb(parseFloat(p[0]), num(p[1].includes("%") ? p[1] : p[1] + "%", 1), num(p[2].includes("%") ? p[2] : p[2] + "%", 1), alpha(A)); }
    if (fn === "oklch") { const L = num(p[0], 1), C = num(p[1], 0.4), H = parseFloat(p[2]) || 0; return oklabToRgb(L, C * Math.cos((H * Math.PI) / 180), C * Math.sin((H * Math.PI) / 180), alpha(A)); }
    if (fn === "oklab") return oklabToRgb(num(p[0], 1), num(p[1], 0.4), num(p[2], 0.4), alpha(A));
    if (fn === "lab") return labToRgb(num(p[0], 100), num(p[1], 125), num(p[2], 125), alpha(A));
    if (fn === "lch") { const L = num(p[0], 100), C = num(p[1], 150), H = parseFloat(p[2]) || 0; return labToRgb(L, C * Math.cos((H * Math.PI) / 180), C * Math.sin((H * Math.PI) / 180), alpha(A)); }
    if (fn === "color" && p[0] === "srgb") return { r: clamp(num(p[1])), g: clamp(num(p[2])), b: clamp(num(p[3])), a: alpha(A) };
    return null;
  }
  // shadcn v3 bare HSL triplet: "222.2 47.4% 11.2%" (optionally "/ 0.5")
  if ((m = s.match(/^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%(?:\s*\/\s*([\d.]+%?))?$/))) return hslToRgb(parseFloat(m[1]), parseFloat(m[2]) / 100, parseFloat(m[3]) / 100, alpha(m[4]));
  return null;
}

export const over = (top, bottom) => ({
  r: top.r * top.a + bottom.r * (1 - top.a),
  g: top.g * top.a + bottom.g * (1 - top.a),
  b: top.b * top.a + bottom.b * (1 - top.a),
  a: 1,
});
export const luminance = (c) => 0.2126 * gammaToLin(c.r) + 0.7152 * gammaToLin(c.g) + 0.0722 * gammaToLin(c.b);
/** WCAG 2.1 contrast ratio of fg drawn over bg (bg composited over `base`, white by default). */
export function contrast(fg, bg, base = { r: 1, g: 1, b: 1, a: 1 }) {
  const B = bg.a < 1 ? over(bg, base) : bg;
  const F = fg.a < 1 ? over(fg, B) : fg;
  const l1 = luminance(F), l2 = luminance(B);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
/** OKLCH of a colour, for fingerprints. */
export function toOklch(c) {
  const l = 0.4122214708 * gammaToLin(c.r) + 0.5363325363 * gammaToLin(c.g) + 0.0514459929 * gammaToLin(c.b);
  const m = 0.2119034982 * gammaToLin(c.r) + 0.6806995451 * gammaToLin(c.g) + 0.1073969566 * gammaToLin(c.b);
  const s = 0.0883024619 * gammaToLin(c.r) + 0.2817188376 * gammaToLin(c.g) + 0.6299787005 * gammaToLin(c.b);
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const b = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  return { L, C: Math.hypot(a, b), H: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}
