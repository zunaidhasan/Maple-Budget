"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

export function ContributionForm({ goalId }: { goalId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!(value > 0)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/goals/${goalId}/contributions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: value }),
      });
      if (res.ok) {
        setAmount("");
        setOpen(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-(--primary)"
        onClick={() => setOpen(true)}
      >
        <Plus size={13} /> Add contribution
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 flex gap-2">
      <input
        className="input max-w-32"
        inputMode="decimal"
        placeholder="Amount"
        aria-label="Contribution amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        autoFocus
      />
      <button className="btn btn-primary" disabled={busy}>
        {busy ? "…" : "Add"}
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => setOpen(false)}
      >
        Cancel
      </button>
    </form>
  );
}
