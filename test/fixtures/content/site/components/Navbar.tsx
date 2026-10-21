import { useTranslations } from "next-intl";
import Link from "next/link";
export function Navbar() {
  const t = useTranslations("Nav");
  return (
    <nav>
      <Link href="/help">{t("help")}</Link>
      <Link href="/pricing">{t("pricing")}</Link>
      <Link href="/sign-up">{t("signup")}</Link>
    </nav>
  );
}
