import { useTranslations } from "next-intl";
import Link from "next/link";
const LINKS = [
  { key: "help", href: "/help" },
  { key: "cookies", href: "/cookies" },
  { key: "terms", href: "/terms" },
  { key: "refunds", href: "/refunds" },
];
export function Footer() {
  const t = useTranslations("Footer");
  return (
    <footer>
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href}>{t(l.key)}</Link>
      ))}
    </footer>
  );
}
