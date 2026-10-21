import Link from "next/link";
export function UserMenu() {
  return (
    <nav aria-label="Account">
      <Link href="/dashboard">My videos</Link>
      <Link href="/dashboard">Dashboard</Link>
      <Link href="/dashboard/settings">Settings</Link>
    </nav>
  );
}
