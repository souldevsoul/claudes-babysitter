export function PolicyLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return <article><h1>{title}</h1>{children}</article>;
}
