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
    // kit inputs with a non-picker type, and components that are the replacement
    '<Input type="email" />',
    '<Button type="submit">Save</Button>',
    '<DatePicker type="date" />',
    '<Checkbox type="checkbox" />',
  ],
  invalid: [
    { code: "<select><option>a</option></select>", ...err("select") },
    { code: '<input type="date" />', ...err("input") },
    { code: '<input type="file" />', ...err("input") },
    { code: '<input type="checkbox" />', ...err("input") },
    { code: '<button onClick={go}>Go</button>', filename: "/app/src/app/page.jsx", ...err("button") },
    // a plain kit input forwarding a native picker type (kiln request-modal, 2026-10)
    { code: '<Input type="datetime-local" value={v} />', ...err("wrapped") },
    { code: '<TextField type={"da" + "te"} />', ...err("wrapped") },
    { code: '<input type="week" />', ...err("input") },
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
      // a pass-through variant does not make a call site's own look legal (the "bare" loophole)
      { code: '<Button variant="bare" className="h-14 rounded-full bg-primary px-8 text-white">Go</Button>', ...err("override") },
      { code: '<Dropdown mode="menu" className="rounded-xl bg-zinc-900 p-2" />', ...err("override") },
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


// 6.12 — overlays animate in and out; animation classes need their plugin
{
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const noPlugin = mkdtempSync(join(tmpdir(), "motion-")); writeFileSync(join(noPlugin, "package.json"), JSON.stringify({ dependencies: { "@radix-ui/react-select": "2" } }));
  const withPlugin = mkdtempSync(join(tmpdir(), "motion-")); writeFileSync(join(withPlugin, "package.json"), JSON.stringify({ dependencies: { "tw-animate-css": "1" } }));
  const oldSelect = mkdtempSync(join(tmpdir(), "motion-")); writeFileSync(join(oldSelect, "package.json"), JSON.stringify({ dependencies: { "tw-animate-css": "1", "@radix-ui/react-select": "^2.2.6" } }));
  const newSelect = mkdtempSync(join(tmpdir(), "motion-")); writeFileSync(join(newSelect, "package.json"), JSON.stringify({ dependencies: { "tw-animate-css": "1", "@radix-ui/react-select": "^2.3.7" } }));
  const imp = 'import * as SelectPrimitive from "@radix-ui/react-select";\n';
  const ok = 'className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 motion-reduce:animate-none"';
  tester.run("overlay-motion", R["overlay-motion"], {
    valid: [
      { code: imp + `<SelectPrimitive.Content ${ok} />`, filename: join(withPlugin, "select.tsx") },
      // Base UI: CSS transitions with starting / ending styles
      { code: 'import { Popover } from "@base-ui-components/react/popover";\n<Popover.Popup className="transition-[opacity,scale] duration-150 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />', filename: join(noPlugin, "p.tsx") },
      // not an overlay part, not a headless-UI import
      { code: imp + '<SelectPrimitive.Trigger className="border" />', filename: join(noPlugin, "s.tsx") },
      '<Content className="x" />',
      // tabs are content, not an overlay
      { code: 'import * as TabsPrimitive from "@radix-ui/react-tabs";\n<TabsPrimitive.Content className="mt-2" />', filename: join(noPlugin, "tabs.tsx") },
      { code: 'import { Tabs } from "radix-ui";\n<Tabs.Content className="mt-2" />', filename: join(noPlugin, "tabs2.tsx") },
      // classes from a cva() variants helper count
      { code: 'import * as D from "@radix-ui/react-dialog";\nconst v = cva("fixed data-[state=open]:animate-in data-[state=closed]:animate-out", { variants: { side: { right: "data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right" } } });\n<D.Content className={cn(v({ side }), className)} />', filename: join(withPlugin, "drawer.tsx") },
      // Radix Select that can play its exit (≥ 2.3.0)
      { code: imp + `<SelectPrimitive.Content ${ok} />`, filename: join(newSelect, "select.tsx") },
      // conditional, but not an overlay (not positioned / not layered) or a component / framer-motion
      { code: '<div>{open && <div className="mt-2 rounded border p-2">x</div>}</div>', filename: join(noPlugin, "a.tsx") },
      { code: '<div>{open && <Menu className="absolute z-50 shadow" />}</div>', filename: join(noPlugin, "a.tsx") },
      { code: '<AnimatePresence>{open && <motion.div className="absolute z-50 shadow-lg" exit={{ opacity: 0 }} />}</AnimatePresence>', filename: join(noPlugin, "a.tsx") },
      { code: '<div>{user && <div className="absolute z-50 shadow">x</div>}</div>', filename: join(noPlugin, "a.tsx") },
      // a presence hook keeps it mounted while it leaves and it animates on data-state
      { code: '<div>{list.mounted && <ul data-state={list.state} className="wb-menu absolute z-50 shadow-lg">x</ul>}</div>', filename: join(noPlugin, "a.tsx") },
      { code: '<AnimatePresence>{open && (<div className="fixed inset-0 z-50"><motion.div exit={{ opacity: 0 }} /></div>)}</AnimatePresence>', filename: join(noPlugin, "a.tsx") },
    ],
    invalid: [
      { code: imp + '<SelectPrimitive.Content className="relative z-50 rounded-lg border" />', filename: join(withPlugin, "s.tsx"), ...err("none") },
      { code: 'import { Popover } from "radix-ui";\n<Popover.Content className="rounded border" />', filename: join(withPlugin, "p.tsx"), ...err("none") },
      { code: imp + '<SelectPrimitive.Content className="data-[state=open]:animate-in data-[state=open]:fade-in-0" />', filename: join(withPlugin, "s.tsx"), ...err("exit") },
      { code: 'import * as D from "@radix-ui/react-dialog";\n<D.Content className={cn("fixed", "data-[state=closed]:animate-out")} />', filename: join(withPlugin, "d.tsx"), ...err("enter") },
      // the classes are there but nothing makes them move
      { code: imp + `<SelectPrimitive.Content ${ok} />`, filename: join(noPlugin, "select.tsx"), ...err("plugin") },
      // Radix Select before 2.3 unmounts at once: the exit classes never play
      { code: imp + `<SelectPrimitive.Content ${ok} />`, filename: join(oldSelect, "select.tsx"), ...err("selectExit") },
      // a hand-made dropdown mounted with {isOpen && …} (the Wordbench currency switcher before the fix)
      { code: '<div className="relative">{isOpen && (<div className="absolute right-0 top-full z-1000 mt-2 rounded-xl border shadow-cur-menu">x</div>)}</div>', filename: join(noPlugin, "c.tsx"), ...err("mount") },
      { code: '<div>{showMenu ? <ul className="fixed inset-x-0 z-40 shadow-lg animate-in fade-in-0">x</ul> : null}</div>', filename: join(noPlugin, "c.tsx"), ...err("mount") },
    ],
  });
}

// 1.18 — interactive elements are reusable kit components; one dropdown per site; disclosures animate (6.12)
{
  const { _resetSelectImpls } = await import("./rules/interactive.js");
  const KIT = { uiKitPaths: ["**/components/ui/**"] };
  const page = "/repo/app/contact/page.tsx", kit = "/repo/components/ui/select.tsx", kit2 = "/repo/components/ui/listbox.tsx";
  _resetSelectImpls();
  tester.run("kit-interactive", R["kit-interactive"], {
    valid: [
      // the kit builds them from the headless library
      { code: 'import * as SelectPrimitive from "@radix-ui/react-select";', filename: kit, options: [KIT] },
      { code: 'import * as D from "@radix-ui/react-dialog";', filename: "/repo/components/ui/dialog.tsx", options: [KIT] },
      // pages use the kit
      { code: 'import { Select } from "@/components/ui/select";\n<Select />', filename: page, options: [KIT] },
      // a component shown on state is the component's business; plain state that is not "open"
      { code: '<div>{open && <Menu items={x} />}</div>', filename: page, options: [KIT] },
      { code: '<div>{error && <p className="text-red">x</p>}</div>', filename: page, options: [KIT] },
      { code: '<div>{showPassword && <span>x</span>}</div>', filename: page, options: [KIT] },
      // shown while closed, data called "open", list lengths
      { code: '<div>{!open && <p>hint</p>}</div>', filename: page, options: [KIT] },
      { code: '<div>{!loading && !open && <p>x</p>}</div>', filename: page, options: [KIT] },
      { code: '<div>{open.length > 0 && <div>x</div>}</div>', filename: page, options: [KIT] },
      { code: '<div>{sku.open && <button>Book</button>}</div>', filename: page, options: [KIT] },
      // a business state called "open" (Plinth: buying is open), not a panel
      { code: '<div>{buyingOpen && !canPay && <div className="stamp">Insufficient balance</div>}</div>', filename: page, options: [KIT] },
      { code: '<div>{paymentsOpen ? <a href="/x">Top up</a> : null}</div>', filename: page, options: [KIT] },
      { code: '<p hidden={!error}>x</p>', filename: page, options: [KIT] },
      // a hand-made element inside the kit is the kit (overlay-motion checks its motion)
      { code: '<div>{open && <ul className="absolute">x</ul>}</div>', filename: "/repo/components/ui/panel.tsx", options: [KIT] },
      // a non-element utility from the umbrella package
      { code: 'import { Slot } from "radix-ui";', filename: page, options: [KIT] },
    ],
    invalid: [
      { code: 'import * as SelectPrimitive from "@radix-ui/react-select";', filename: page, options: [KIT], errors: [{ messageId: "secondImpl" }, { messageId: "library" }] },
      { code: 'import { Accordion } from "radix-ui";', filename: page, options: [KIT], errors: [{ messageId: "library" }] },
      { code: 'import { Dialog } from "@headlessui/react";', filename: page, options: [KIT], errors: [{ messageId: "secondImpl" }, { messageId: "library" }] },
      // hand-built in a page: an FAQ answer, a dropdown, a modal
      { code: '<div>{isOpen && <div className="mt-2 text-sm">answer</div>}</div>', filename: page, options: [KIT], errors: [{ messageId: "handmade" }] },
      { code: '<div>{menuOpen ? <ul className="absolute z-50">x</ul> : null}</div>', filename: page, options: [KIT], errors: [{ messageId: "handmade" }] },
      { code: '<div>{expanded[i] && <p>x</p>}</div>', filename: page, options: [KIT], errors: [{ messageId: "handmade" }] },
      { code: '<div>{openKey === key && <p>answer</p>}</div>', filename: page, options: [KIT], errors: [{ messageId: "handmade" }] },
      { code: '<div>{mobileMenuOpen && <nav>x</nav>}</div>', filename: page, options: [KIT], errors: [{ messageId: "handmade" }] },
      { code: '<div>{isFiltersOpen && <div>x</div>}</div>', filename: page, options: [KIT], errors: [{ messageId: "handmade" }] },
      // a panel kept in the DOM and toggled with hidden= (Ferrous mobile nav)
      { code: '<nav id="m" hidden={!mobileNavOpen} className="flex flex-col">x</nav>', filename: page, options: [KIT], errors: [{ messageId: "handmade" }] },
      { code: '<div>{sidebarOpen && <div className="fixed inset-0 bg-black/50" />}</div>', filename: page, options: [KIT], errors: [{ messageId: "handmade" }] },
      // native disclosure / dialog / popover
      { code: '<details><summary>Q</summary>A</details>', filename: page, options: [KIT], errors: [{ messageId: "native" }] },
      { code: '<dialog open>x</dialog>', filename: page, options: [KIT], errors: [{ messageId: "native" }] },
      { code: '<div popover="auto" id="p">x</div>', filename: page, options: [KIT], errors: [{ messageId: "native" }] },
      // a second dropdown implementation, even inside the kit
      { code: '<ul role="listbox">x</ul>', filename: kit2, options: [KIT], errors: [{ messageId: "secondImpl" }] },
    ],
  });
  // one component per ROLE: a menu next to the select is a second dropdown; pill-button next to button; sheet next to dialog
  for (const [first, second, role] of [
    [['import * as S from "@radix-ui/react-select";', "/r2/components/ui/select.tsx"], ['import * as M from "@radix-ui/react-dropdown-menu";', "/r2/components/ui/dropdown-menu.tsx"], "dropdown (menu)"],
    [['export const Button = () => null;', "/r3/components/ui/button.tsx"], ['export const PillButton = () => null;', "/r3/components/ui/pill-button.tsx"], "button"],
    [['import * as D from "@radix-ui/react-dialog";', "/r4/components/ui/dialog.tsx"], ['import { Drawer } from "vaul";', "/r4/components/ui/drawer.tsx"], "modal"],
    [['import { Toaster } from "sonner";', "/r5/components/ui/sonner.tsx"], ['export const Toast = () => null;', "/r5/components/ui/toast.tsx"], "toast"],
  ]) {
    _resetSelectImpls();
    tester.run(`kit-interactive one ${role}`, R["kit-interactive"], {
      valid: [{ code: first[0], filename: first[1], options: [KIT] }],
      invalid: [{ code: second[0], filename: second[1], options: [KIT], errors: [{ messageId: "secondImpl" }] }],
    });
  }
  _resetSelectImpls();
  tester.run("kit-interactive roles (valid)", R["kit-interactive"], {
    valid: [
      // a kit component built on another kit component is not a second implementation
      { code: 'import { Select } from "./select";\nexport const CurrencySelect = () => <Select />;', filename: "/r6/components/ui/currency-select.tsx", options: [KIT] },
      // select-card / segmented / radio-button are not dropdowns or buttons
      { code: 'export const SelectCard = () => null;', filename: "/r6/components/ui/select-card.tsx", options: [KIT] },
      { code: 'export const S = () => null;', filename: "/r6/components/ui/segmented.tsx", options: [KIT] },
      // pages call toast() — the Toaster is mounted once in the kit
      { code: 'import { toast } from "sonner";\ntoast("Saved");', filename: page, options: [KIT] },
      { code: 'import { toast } from "sonner";\ntoast("Saved again");', filename: page.replace("contact", "pricing"), options: [KIT] },
      // checkbox/radio/hidden/file inputs are other rules' business
      { code: '<form><input type="hidden" name="a" /><input type="file" /></form>', filename: page, options: [KIT] },
    ],
    invalid: [
      { code: '<form><input className="border px-2" name="email" /></form>', filename: page, options: [KIT], errors: [{ messageId: "nativeField" }] },
      { code: '<form><input type="email" name="email" /></form>', filename: page, options: [KIT], errors: [{ messageId: "nativeField" }] },
      { code: '<textarea rows={4} />', filename: page, options: [KIT], errors: [{ messageId: "nativeField" }] },
      { code: '<input type={show ? "text" : "password"} name="pw" />', filename: page, options: [KIT], errors: [{ messageId: "nativeField" }] },
      { code: '<input type="range" min={1} max={9} />', filename: page, options: [KIT], errors: [{ messageId: "nativeField" }] },
      { code: '<div>{payOpen && createPortal(<div className="fixed inset-0">pay</div>, document.body)}</div>', filename: page, options: [KIT], errors: [{ messageId: "handmade" }] },
      { code: '<div role="dialog" aria-modal="true">x</div>', filename: page, options: [KIT], errors: [{ messageId: "handRole" }] },
      { code: '<button role="radio" aria-checked={on}>EUR</button>', filename: page, options: [KIT], errors: [{ messageId: "handRole" }] },
      { code: '<ul role="menu"><li role="menuitem">a</li></ul>', filename: page, options: [KIT], errors: [{ messageId: "handRole" }, { messageId: "handRole" }] },
    ],
  });
  _resetSelectImpls();
  const accImp = 'import * as AccordionPrimitive from "@radix-ui/react-accordion";\n';
  tester.run("overlay-motion (disclosures)", R["overlay-motion"], {
    valid: [
      { code: accImp + '<AccordionPrimitive.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down" />' },
      { code: 'import { Collapsible } from "@base-ui-components/react/collapsible";\n<Collapsible.Panel className="h-[var(--collapsible-panel-height)] transition-[height] data-[starting-style]:h-0 data-[ending-style]:h-0" />' },
      { code: accImp + '<AccordionPrimitive.Trigger className="x" />' },
    ],
    invalid: [
      { code: accImp + '<AccordionPrimitive.Content className="overflow-hidden pb-4" />', errors: [{ messageId: "disclosure" }] },
      { code: 'import * as C from "@radix-ui/react-collapsible";\n<C.Content className="data-[state=open]:animate-collapsible-down" />', errors: [{ messageId: "disclosure" }] },
    ],
  });
}

console.log(`eslint-plugin-babysitter: ${Object.keys(R).length} rules, all RuleTester cases passed`);
