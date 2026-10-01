// Every line here reproduces a Nexus bug pattern. `npx eslint fixtures/bad.jsx` must fail.
export default function Bad({ go }) {
  if (confirm("Delete?")) go();
  return (
    <div className="flex overflow-x-auto snap-x z-[9999] -mt-2">
      <select><option>EUR</option></select>
      <input type="date" />
      <button onClick={go}>Save</button>
      <Button className="bg-red-500 hover:bg-red-600">Delete</Button>
      <Link href="/start" className="bg-primary px-4 py-2 rounded-lg">Start</Link>
      <a href="/api/auth/signout">Log out</a>
      <p className="text-[10px] text-white/60 transition-all">🚀 Fast</p>
      <img src="/hero.png" className="w-full" alt="" />
    </div>
  );
}
