// RuleTester suite: every rule has bad cases taken from real Nexus bug patterns and good cases from the guidelines.
import { RuleTester } from "eslint";
import plugin from "./index.js";

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } },
});
const R = plugin.rules;
const err = (messageId) => ({ errors: [{ messageId }] });

tester.run("no-native-controls", R["no-native-controls"], {
  valid: [
    "<Select value={v} onValueChange={set} />",
    '<input type="text" />',
    '<Button variant="primary">Save</Button>',
    { code: "<select />", filename: "/app/src/components/ui/select.jsx" },
  ],
  invalid: [
    { code: "<select><option>a</option></select>", ...err("select") },
    { code: '<input type="date" />', ...err("input") },
    { code: '<input type="file" />', ...err("input") },
    { code: '<input type="checkbox" />', ...err("input") },
    { code: '<button onClick={go}>Go</button>', filename: "/app/src/app/page.jsx", ...err("button") },
  ],
});

tester.run("no-native-dialogs", R["no-native-dialogs"], {
  valid: ["openConfirm()", "dialog.confirm()"],
  invalid: [
    { code: 'if (confirm("Delete?")) remove()', ...err("dialog") },
    { code: 'window.alert("Saved")', ...err("dialog") },
  ],
});

tester.run("no-auth-library-pages", R["no-auth-library-pages"], {
  valid: ['<Link href="/logout">Log out</Link>'],
  invalid: [{ code: '<a href="/api/auth/signout">Log out</a>', ...err("page") }],
});

tester.run("no-adhoc-button", R["no-adhoc-button"], {
  valid: [
    '<Link href="/x" className="underline">x</Link>',
    '<Button asChild><Link href="/x">x</Link></Button>',
    // cards and badges are not buttons
    '<div className="rounded-2xl border bg-card p-6">card</div>',
    '<span className="rounded-full bg-blue-500/10 px-3 py-1">New</span>',
    // other rules' elements must not crash this one (regression: shared helper leaked into it)
    '<select />', 'const F = "select"; const X = () => <F />', '<input type={"da" + "te"} />',
  ],
  invalid: [
    { code: '<Link href="/x" className="bg-primary px-4 py-2 rounded-lg text-white">Start</Link>', ...err("adhoc") },
    { code: '<div role="button" onClick={go} className="bg-blue-600 px-4 py-2 rounded-md">Save</div>', ...err("adhoc") },
    { code: '<a href="/x" className="rounded-xl border px-5 py-2">Ghost</a>', ...err("adhoc") },
  ],
});

tester.run("no-visual-classname-override", R["no-visual-classname-override"], {
  valid: ['<Button className="w-full mt-4">a</Button>', '<Card className="col-span-2 flex-1">a</Card>', '<div className="bg-red-500 p-4" />'],
  invalid: [
    { code: '<Button className="bg-red-500 hover:bg-red-600">a</Button>', ...err("override") },
    { code: '<Card className={cn("w-full", active && "border-primary")}>a</Card>', ...err("override") },
    { code: '<SelectTrigger className="h-8 rounded-none" />', ...err("override") },
    { code: "<Button className={variantClass}>a</Button>", ...err("dynamic") },
    { code: '<Button style={{ background: "red" }}>a</Button>', ...err("style") },
  ],
});

tester.run("no-transition-all", R["no-transition-all"], {
  valid: ['<div className="transition-colors duration-200" />'],
  invalid: [{ code: '<div className="transition-all duration-300" />', ...err("bad") }],
});

tester.run("no-arbitrary-spacing", R["no-arbitrary-spacing"], {
  valid: ['<div className="p-4 gap-6 mt-8" />', { code: '<div className="-mt-24" />', options: [{ allowNegative: true }] }],
  invalid: [{ code: '<div className="-mt-2" />', ...err("bad") }],
});

tester.run("no-illegible-text", R["no-illegible-text"], {
  // weight and translucency are design choices — legibility is measured at runtime (contrast)
  valid: ['<p className="text-xs text-muted-foreground" />', '<p className="text-white/70 font-extralight text-lg" />', '<p className="text-[14px]" />'],
  invalid: [{ code: '<p className="text-[10px]" />', ...err("bad") }, { code: '<p className="text-[0.6rem]" />', ...err("bad") }],
});

tester.run("no-arbitrary-values", R["no-arbitrary-values"], {
  valid: [
    '<div className="bg-card text-foreground rounded-lg shadow-md" />',
    '<div className="w-[340px] grid-cols-[1fr_2fr] bg-white/[0.02]" />',
    '<div className="rounded-[var(--radius-card)] bg-[var(--brand)]" />',
    'const msg = "Hello world, rounded corners are nice";',
    { code: '<div className="bg-[#f8f6f3]" />', filename: "/app/src/components/ui/card.jsx" },
  ],
  invalid: [
    { code: '<div className="text-[#1a1a2e]" />', ...err("bad") },
    { code: '<div className="rounded-[14px]" />', ...err("bad") },
    { code: '<div className="shadow-[0_2px_8px_#0002]" />', ...err("bad") },
    { code: '<p className="text-[15px]" />', ...err("bad") },
    { code: '<p className="tracking-[0.3em]" />', ...err("bad") },
    { code: '<div className="mt-[13px] z-[9999]" />', errors: [{ messageId: "bad" }, { messageId: "bad" }] },
    // object class maps, judged where they are written
    { code: 'const styles = { card: "rounded-[13px] bg-[#f4f4f5] p-[19px]" }; const X = () => <div className={styles.card} />', errors: [{ messageId: "bad" }, { messageId: "bad" }, { messageId: "bad" }] },
    { code: 'styles.title = "rounded-[3px] font-medium";', ...err("bad") },
  ],
});


tester.run("no-thin-kit-wrapper", R["no-thin-kit-wrapper"], {
  valid: [
    "const Toolbar = (p) => <div><Button {...p} /><Button>b</Button></div>",
    { code: "export const Button = (p) => <Primitive.button {...p} />", filename: "/app/src/components/ui/button.jsx" },
  ],
  invalid: [
    { code: "export const HeroButton = ({ children, ...p }) => <Button {...p}>{children}</Button>", ...err("wrapper") },
    { code: "export function PricingCard2(props) { return <Card {...props} /> }", ...err("wrapper") },
  ],
});

tester.run("no-scroll-rail", R["no-scroll-rail"], {
  valid: ['<div className="overflow-x-auto" />', '<div className="grid grid-cols-1 md:grid-cols-3" />'],
  invalid: [{ code: '<div className="flex overflow-x-auto snap-x snap-mandatory" />', ...err("rail") }],
});


tester.run("no-emoji", R["no-emoji"], {
  valid: ["<p>Ready © 2026</p>", "<p><CheckIcon /> Done</p>"],
  invalid: [
    { code: "<p>🚀 Launch</p>", ...err("emoji") },
    { code: '<Button title="✅ ok" />', ...err("emoji") },
  ],
});

tester.run("img-dimensions", R["img-dimensions"], {
  valid: ['<img src="a.png" width={640} height={480} alt="" />', '<img src="a.png" className="aspect-video w-full" alt="" />'],
  invalid: [{ code: '<img src="a.png" className="w-full" alt="" />', ...err("dims") }],
});

tester.run("no-raw-palette", R["no-raw-palette"], {
  valid: ['<div className="bg-primary text-primary-foreground border-border" />', '<p className="text-white bg-black/50" />', { code: '<div className="bg-blue-600" />', filename: "/app/src/components/ui/button.jsx" }],
  invalid: [
    { code: '<section className="bg-blue-600 text-blue-200" />', errors: [{ messageId: "bad" }, { messageId: "bad" }] },
    { code: 'const card = "rounded-xl border-slate-300"; const X = () => <div className={card} />', ...err("bad") },
  ],
});

tester.run("no-styles-outside-kit", R["no-styles-outside-kit"], {
  valid: [{ code: 'const button = cva("inline-flex")', filename: "/app/src/components/ui/button.jsx" }],
  invalid: [{ code: 'const planCard = cva("rounded-3xl border bg-white p-7")', filename: "/app/src/app/pricing/page.jsx", ...err("bad") }],
});

tester.run("class constants are resolved", R["no-arbitrary-values"], {
  valid: [],
  invalid: [
    { code: 'const cls = cn("p-4", "rounded-[22px]"); const X = () => <div className={cls} />', ...err("bad") },
    { code: '<p className="text-[#333] rounded-[9px]" />', errors: [{ messageId: "bad" }, { messageId: "bad" }] },
  ],
});

tester.run("no-dynamic-classes", R["no-dynamic-classes"], {
  valid: ['const c = `px-4 ${active ? "bg-primary" : "bg-muted"}`', 'const url = `/api/${id}/bg-image`', "const s = styled.div`color: ${c};`"],
  invalid: [
    { code: 'const X = () => <div className={`bg-${tone}-600 text-${tone}-100`} />', errors: [{ messageId: "bad" }, { messageId: "bad" }] },
    { code: 'const cls = `rounded-${size} p-4`', ...err("bad") },
    { code: 'cn(`hover:bg-${c}-500`)', ...err("bad") },
  ],
});

tester.run("no-css-in-js-literals", R["no-css-in-js-literals"], {
  valid: [
    "const Hero = styled.section`background: var(--primary); color: ${(p) => p.theme.fg}; border-radius: var(--radius);`",
    "const H = styled.div({ color: 'var(--fg)', padding: 0 })",
  ],
  invalid: [
    { code: "const Hero = styled.section`background: #4f46e5; color: #c7d2fe; border-radius: 13px; padding: 37px;`", errors: [{ messageId: "bad" }, { messageId: "bad" }, { messageId: "bad" }, { messageId: "bad" }] },
    { code: "const B = styled(Button)`&:hover { box-shadow: 0 2px 8px rgba(0,0,0,.2); }`", ...err("bad") },
    { code: "const t = css`font-size: 15px;`", ...err("bad") },
    { code: "const H = styled.div({ color: '#fff', fontSize: 11 })", errors: [{ messageId: "bad" }, { messageId: "bad" }] },
  ],
});


// ── red-team regressions (2026-10-02): every evasion that got through must stay blocked ──
tester.run("red-team: concatenated / joined classes", R["no-dynamic-classes"], {
  valid: ['const c = "px-2 " + (ok ? "bg-primary" : "bg-muted")', 'const u = "/api/" + id + "/bg-image"'],
  invalid: [
    { code: 'const X = ({ c }) => <span className={"px-2 py-1 bg-" + c + "-500 rounded"} />', ...err("bad") },
    { code: 'const cls = ["bg", tone, "500"].join("-")', ...err("bad") },
  ],
});
tester.run("red-team: raw <style> in JSX", R["no-css-in-js-literals"], {
  valid: ["const S = () => <style>{`.x { color: var(--brand); }`}</style>"],
  invalid: [
    { code: "const S = () => <style>{`.billing-accent { color: #bada55; font-weight: 600; }`}</style>", ...err("bad") },
    { code: 'const S = () => <style dangerouslySetInnerHTML={{ __html: ".x{border-radius:13px}" }} />', ...err("bad") },
  ],
});
tester.run("red-team: native controls behind a mask", R["no-native-controls"], {
  valid: ['const X = () => <input type={show ? "text" : "password"} />'],
  invalid: [
    { code: 'const Field = "select"; const X = () => <Field />', ...err("select") },
    { code: 'const X = () => <input type={"da" + "te"} />', ...err("input") },
    { code: 'const t = "date"; const X = () => <input type={t} />', ...err("input") },
    { code: 'React.createElement("select", null)', ...err("select") },
  ],
});

// ── ui/no-inline-style 3.3: the style prop is forbidden; only all-custom-property object literals pass ──
tester.run("no-inline-style (3.3 strict)", R["no-inline-style"], {
  valid: [
    '<div style={{ "--progress": p }} />',
    '<div style={{ "--x": a, "--y": `${b}px` }} />',
    "<Button style={{ '--dynamic-offset': value }} />",
    'const p = { style: { paragraph: { indent: { left: 720 } } } };', // a docx style, not CSS
    'export const noteProps = { style: { "--x": 1 } };',
  ],
  invalid: [
    { code: '<div style={{ color: "#999" }} />', errors: [{ messageId: "prop" }] },
    { code: "<div style={{ width: `${p}%` }} />", errors: [{ messageId: "prop" }] }, // geometry too — use --var
    { code: '<div style={{ "--x": 1, margin: 4 }} />', errors: [{ messageId: "prop" }] }, // one plain key is enough
    { code: "<Card style={{ padding: 13 }} />", errors: [{ messageId: "prop" }] }, // components as well as DOM
    { code: "const s = { '--x': 1 }; const X = () => <div style={{ ...s }} />", errors: [{ messageId: "spread" }] },
    { code: "const X = () => <div style={styles.box} />", errors: [{ messageId: "notLiteral" }] },
    { code: "const X = () => <div style={cond ? a : b} />", errors: [{ messageId: "notLiteral" }] },
    { code: '<div style="color: red" />', errors: [{ messageId: "string" }] },
    { code: '<div {...{ style: { color: "#999999", margin: "24px" } }} />', errors: [{ messageId: "prop" }] },
    { code: 'export const noteProps = { style: { color: "#999999", margin: "24px" } };', errors: [{ messageId: "definition" }] },
    { code: 'import { noteProps } from "./note-props"; const X = () => <div {...noteProps} />', errors: [{ messageId: "opaque" }] },
  ],
});

console.log(`eslint-plugin-babysitter: ${Object.keys(R).length} rules, all RuleTester cases passed`);
