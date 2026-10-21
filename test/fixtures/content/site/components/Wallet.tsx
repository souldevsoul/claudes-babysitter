"use client";
import { useState } from "react";
export function Wallet() {
  const [buyOpen, setBuyOpen] = useState(false);
  return (
    <section>
      <p>Your balance: 120 credits</p>
      <button type="button" onClick={() => setBuyOpen(true)}>Top up</button>
      <button type="button" onClick={() => setBuyOpen(true)}>Add credits</button>
      <button type="button" onClick={() => setBuyOpen(false)}>Close</button>
      {buyOpen ? <p>Choose a pack.</p> : null}
    </section>
  );
}
