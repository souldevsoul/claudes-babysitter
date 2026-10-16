import Link from "next/link";
import { SupportEmail } from "@/components/support-email";

export default function Page({ count }: { count: number }) {
  return (
    <main>
      <h1>Terms of Service.</h1>
      <p className="muted">Last updated: October 1, 2026</p>
      <p>
        Read our <Link href="/privacy">Privacy Policy</Link> (it explains
        cookies).
      </p>
      <p>Questions? Write to <SupportEmail />.</p>
      <p>Prices go up 10–20% — sometimes.</p>
      <button type="button">Save changes.</button>
      <input placeholder="John Doe" aria-label="Your name" />
      <code>const a = b -- c;</code>
      <nav>
        <Link href="/about">About.</Link>
      </nav>
      <p>Last updated: 2 October 2026</p>
      <span>{count} items</span>
      <p>1 PROFILES OFFER THIS TASK</p>
      <p>The total is NaN credits</p>
      <h2>
        Excellence is not
        <span className="block">an option.</span>
      </h2>
      <p>Fees: 1 of 3 items, 1.5 hours, step 1, 2 days, 30 day refund window, null and void.</p>
      <p>Lorem ipsum dolor sit amet</p>
    </main>
  );
}
