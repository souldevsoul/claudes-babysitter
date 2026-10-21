import { useTranslations } from "next-intl";
import Link from "next/link";
import { Wallet } from "@/components/Wallet";

export default function Home({ params: { locale } }: { params: { locale: string } }) {
  const t = useTranslations("Home");
  return (
    <main>
      <h1>{t("title")}</h1>
      <p>{t("lede")}</p>
      <p>Read the Specialist Service Terms before you start.</p>
      <p>Payments run through Stripe, and Stripe's Services Agreement applies to them.</p>
      <p>Questions? Our Help Center has the answers, and the Refund Policy explains money matters.</p>
      <p>This Agreement is between you and us.</p>
      <p>
        See the <Link href="/pricing">price list</Link> for what each task costs.
      </p>
      <Link href="/specialist-terms">Specialist terms</Link>
      <Link href="/guide.pdf">Guide (PDF)</Link>
      <Link href="/old-pricing">Old prices</Link>
      <Link href="/pricing#faq">Pricing</Link>
      <Link href="/fr/pricing">Pricing</Link>
      <Link href={`/${locale}/help`}>Help Centre</Link>
      <Link href="/sign-up">
        <div>
          <h3>Become a specialist</h3>
          <p>Apply in five minutes and start earning.</p>
        </div>
      </Link>
      <Wallet />
      <code>an expert will reply</code>
    </main>
  );
}
