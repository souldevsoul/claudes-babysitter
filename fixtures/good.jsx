// The same screen written per the guidelines. `npx eslint fixtures/good.jsx` must pass.
export default function Good({ go, open, setOpen }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      <Select value="EUR" onValueChange={go} />
      <DatePicker value={null} onChange={go} />
      <Button variant="primary" size="md" className="w-full">Save</Button>
      <Button variant="destructive" onClick={() => setOpen(true)}>Delete</Button>
      <AlertDialog open={open} onOpenChange={setOpen} />
      <Button asChild variant="primary"><Link href="/start">Start</Link></Button>
      <Link href="/logout">Log out</Link>
      <p className="text-xs text-muted-foreground transition-colors"><RocketIcon /> Fast</p>
      <img src="/hero.png" width={1280} height={720} className="w-full" alt="" />
    </div>
  );
}
