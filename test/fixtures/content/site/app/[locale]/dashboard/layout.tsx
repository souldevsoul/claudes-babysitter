import Link from "next/link";
const SIDEBAR = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/videos", label: "Video Library" },
  { href: "/dashboard/settings", label: "Settings" },
];
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav>
        {SIDEBAR.map((l) => (
          <Link key={l.href} href={l.href}>{l.label}</Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
