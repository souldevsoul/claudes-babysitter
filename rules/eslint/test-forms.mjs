// RuleTester cases for the FORMS rules (docs/checks-forms.md): bad cases from the factory's cards, good cases the fix.
import { RuleTester } from "eslint";
import plugin from "./index.js";

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } },
});
const R = plugin.rules;

tester.run("numeric-input-bounds", R["numeric-input-bounds"], {
  valid: [
    '<input type="number" min={1} max={100} step={1} />',
    '<Input type="number" name="credits" min={10} max={100000} />',
    '<Input name="amount" inputMode="decimal" min="1" max="20000" />',
    // bounded in a schema in the same file
    'const schema = z.object({ amount: z.coerce.number().min(1).max(20000) });\n<Input name="amount" type="number" />',
    'const s = z.object({ seats: z.number().int().positive().lte(50) });\n<input {...register("seats")} type="number" />',
    // react-hook-form register options
    '<input type="number" {...register("qty", { valueAsNumber: true, min: 1, max: 10 })} />',
    // the file clamps the value itself
    'const onBlur = (v) => setAmount(Math.min(20000, Math.max(1, v)));\n<Input name="amount" inputMode="decimal" onBlur={onBlur} />',
    // length-bounded IBAN / phone
    '<Input name="iban" maxLength={34} />',
    '<input type="tel" name="phone" pattern="[+0-9 ]{7,16}" />',
    'const s = z.object({ phone: z.string().regex(/^\\+?[0-9 ]{7,16}$/) });\n<Input name="phone" type="tel" />',
    // not numeric: one-time codes, card expiry, search, plain text, sliders, read-only display
    '<Input name="otpCode" inputMode="numeric" />',
    '<Input name="cardExpiry" inputMode="numeric" />',
    '<input type="search" name="q" />',
    '<Input name="fullName" />',
    '<input type="range" name="amount" />',
    '<Input name="amount" type="number" readOnly />',
    '<Input name="amount" type="number" disabled />',
    // real repos (2026-10): Praxis /admin/payouts "Transfer reference" (id payout-ref is not an amount)
    '<Input id="payout-ref" value={reference} onChange={(e) => setReference(e.target.value)} />',
    // Praxis dispute refund: the file checks the range itself and prints it in the label
    'const refundNumber = Number(refund);\nconst ok = Number.isInteger(refundNumber) && refundNumber >= 0 && refundNumber <= price;\n<Input id={`refund-${id}`} inputMode="numeric" value={refund} />',
    // Praxis / Vertex top-up custom amount: validated with the error on the field
    '<Input id="custom-amount" type="text" inputMode="decimal" value={v} aria-invalid={!!customError} />',
    // Vertex OtpCodeInput: one digit per box
    { code: '<input type="text" inputMode="numeric" maxLength={1} value={value[i]} />', filename: "components/auth/OtpCodeInput.tsx" },
    '<input type="text" inputMode="numeric" maxLength={1} aria-label={`Digit ${i + 1}`} />',
    // truelogos CreditAmountInput: the kit wrapper itself (bounds belong to each use)
    'export function CreditAmountInput({ value, onChange, ...rest }) { return <input {...rest} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} /> }',
    '<CreditAmountInput value={v} onChange={setV} min={10} max={100000} />',
  ],
  invalid: [
    // playfix /pricing "Custom amount", voicecraft "Custom credits"
    { code: '<Input name="amount" type="number" />', errors: [{ messageId: "number" }] },
    { code: '<input name="customCredits" inputMode="numeric" min={20} />', errors: [{ messageId: "number" }] },
    { code: '<Input placeholder="Amount (€)" inputMode="decimal" />', errors: [{ messageId: "number" }] },
    { code: '<input type="number" />', errors: [{ messageId: "number" }] },
    { code: '<TextField name="quantity" type="number" max={10} />', errors: [{ messageId: "number" }] },
    // a disabled flag that is not always on does not exempt the field
    { code: '<Input name="amount" type="number" disabled={loading} />', errors: [{ messageId: "number" }] },
    // a schema for another field does not bound this one
    { code: 'const s = z.object({ seats: z.number().min(1).max(5) });\n<Input name="amount" type="number" />', errors: [{ messageId: "number" }] },
    // rift /kyc IBAN and card number
    { code: '<Input name="iban" />', errors: [{ messageId: "length" }] },
    { code: '<input name="cardNumber" inputMode="numeric" />', errors: [{ messageId: "length" }] },
    { code: '<input type="tel" name="phone" />', errors: [{ messageId: "length" }] },
    // Vertex topup-modal: digits only, "min 10" in the placeholder, no maximum anywhere
    { code: 'const h = (v) => setCustomAmount(v.replace(/\\D/g, ""));\n<Input type="text" placeholder="Enter credits (min 10)" value={customAmount} onChange={(e) => h(e.target.value)} />', errors: [{ messageId: "number" }] },
    // a one-sided check is not a range; a static aria-invalid is not validation; a length check is not a value range
    { code: 'const ok = amount >= 10;\n<Input name="amount" type="number" />', errors: [{ messageId: "number" }] },
    { code: '<Input name="amount" type="number" aria-invalid="false" />', errors: [{ messageId: "number" }] },
    { code: 'const ok = s.length >= 3 && s.length <= 19;\n<Input name="amount" type="number" />', errors: [{ messageId: "number" }] },
    // …but each use of the wrapper is checked
    { code: '<CreditAmountInput value={v} onChange={setV} />', errors: [{ messageId: "number" }] },
    // truelogos quote form: the imported schema has .min(1) only — no ceiling on the quote
    { code: 'export function Q() { return <Input id="quotedCredits" type="number" {...register("quotedCredits", { valueAsNumber: true })} /> }', errors: [{ messageId: "number" }] },
    // a range check of another variable (pagination) does not bound this field
    { code: 'const ok = page >= 1 && page <= pages;\n<Input name="amount" type="number" value={amount} />', errors: [{ messageId: "number" }] },
  ],
});

const client = (body) => `"use client";\n${body}`;
tester.run("mutation-refreshes-ui", R["mutation-refreshes-ui"], {
  valid: [
    // server files, effects and reads are out of scope
    'async function save(n) { await fetch("/api/me", { method: "PATCH", body: n }); }',
    client('export function P() { async function load() { const r = await fetch("/api/me"); } }'),
    // state applied from the response
    client('export function P() { const [user, setUser] = useState(null); async function save(n) { const r = await fetch("/api/me", { method: "PATCH", body: n }); setUser(await r.json()); } }'),
    client('export function P() { const router = useRouter(); const save = async () => { setSaving(true); await fetch("/api/name", { method: "POST" }); router.refresh(); setSaving(false); }; }'),
    client('export function P() { const { mutate } = useSWR("/api/balance"); const topUp = async () => { await api.post("/topup", {}); mutate(); }; }'),
    client('export function P() { const qc = useQueryClient(); const del = async (id) => { await axios.delete(`/api/items/${id}`); qc.invalidateQueries({ queryKey: ["items"] }); }; }'),
    client('export function P({ onSaved }) { const save = async () => { await fetch("/api/x", { method: "PUT" }); onSaved(); }; }'),
    client('export function P() { const { update } = useSession(); const save = async (n) => { await fetch("/api/me", { method: "PATCH" }); await update({ name: n }); }; }'),
    // optimistic: the list is updated before the request
    client('export function L() { const remove = async (id) => { setItems((xs) => xs.filter((x) => x.id !== id)); await fetch(`/api/items/${id}`, { method: "DELETE" }); }; }'),
    // the helper hands the response back for its caller to apply
    client('export function useApi() { async function saveName(n) { return fetch("/api/me", { method: "PATCH", body: n }); } return { saveName }; }\nconst helper = async (n) => { return fetch("/api/me", { method: "PATCH", body: n }); };'),
    // real repos (2026-10): Praxis onboarding upload stores the saved file name (setSaved with data, not a flag)
    client('export function Docs() { const upload = async (type, file) => { setBusy(type); const res = await fetch("/api/onboarding/documents", { method: "POST", body: file }); if (res.ok) { setSaved((prev) => ({ ...prev, [type]: file.name })); } setBusy(null); }; }'),
    // truelogos lib/upload-client.ts: a module-level helper that returns the result to its caller
    client('export async function uploadToStore(file) { const res = await fetch("/api/upload", { method: "POST", body: file }); const data = await res.json(); if (res.ok) return { url: data.url }; return { error: data.error }; }'),
    // Vertex delete account: signs out (navigates away)
    client('export function Settings() { const del = async () => { const res = await fetch("/api/user/delete", { method: "POST" }); toast.success("Deleted"); await signOut({ callbackUrl: "/" }); }; }'),
  ],
  invalid: [
    // voicecraft / orbit / fluentai: credits spent, header balance stays
    { code: client('export function Gen() { const run = async () => { setLoading(true); await fetch("/api/generate", { method: "POST" }); setLoading(false); toast.success("Done"); }; }'), errors: [{ messageId: "stale" }] },
    { code: client('export function Settings() { async function save(e) { e.preventDefault(); const res = await fetch("/api/profile", { method: "PATCH", body: JSON.stringify(form) }); if (res.ok) { setSaved(true); } else { setError("Could not save"); } } }'), errors: [{ messageId: "stale" }] },
    { code: client('export function Row() { const del = async () => { await axios.delete("/api/items/1"); toast("Deleted"); }; }'), errors: [{ messageId: "stale" }] },
    // a handler inside a component that only returns a status is still stale
    { code: client('export function Row() { const del = async () => { const r = await fetch("/api/items/1", { method: "DELETE" }); toast("Deleted"); return; }; }'), errors: [{ messageId: "stale" }] },
  ],
});

console.log("eslint FORMS rules: numeric-input-bounds, mutation-refreshes-ui — all RuleTester cases passed");
