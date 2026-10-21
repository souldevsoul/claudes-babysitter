import { useTranslations } from "next-intl";
export const metadata = { title: "Pricing | Acme" };
export default function Pricing() {
  const t = useTranslations("Pricing");
  return (
    <main>
      <h1>Pricing</h1>
      <p>{t("methods")}</p>
      <p>{t("currencies")}</p>
      <p>{t("open")}</p>
      <p>{t("credits")}</p>
      <p>Unused credits are refundable within 14 days of purchase.</p>
      <button type="button">Buy credits</button>
    </main>
  );
}
