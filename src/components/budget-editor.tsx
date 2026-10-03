"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  categories: { key: string; label: string }[];
  existing: { categoryKey: string; amount: number }[];
  budgetId: string | null;
}

export function BudgetEditor({ categories, existing, budgetId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Monthly budget");
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(existing.map((e) => [e.categoryKey, String(e.amount)]))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: string, v: string) {
    setAmounts((prev) => ({ ...prev, [key]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const items = Object.entries(amounts)
        .map(([categoryKey, v]) => ({ categoryKey, amount: Number(v) || 0 }))
        .filter((i) => i.amount > 0);
      if (items.length === 0) {
        setError("Add at least one category allocation.");
        return;
      }
      const res = await fetch(
        budgetId ? `/api/budgets/${budgetId}` : "/api/budgets",
        {
          method: budgetId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(budgetId ? { items } : { name, period: "MONTHLY", items }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save budget");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-secondary w-full" onClick={() => setOpen(true)}>
        {budgetId ? "Edit allocations" : "Create a budget"}
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
      <h2 className="font-bold">{budgetId ? "Edit allocations" : "New monthly budget"}</h2>
      {!budgetId && (
        <div>
          <label className="label" htmlFor="budget-name">Name</label>
          <input
            id="budget-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      )}
      <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
        {categories.map((c) => (
          <div key={c.key} className="flex items-center gap-2">
            <label className="flex-1 text-sm" htmlFor={`amt-${c.key}`}>{c.label}</label>
            <input
              id={`amt-${c.key}`}
              className="input max-w-32 text-right"
              inputMode="decimal"
              placeholder="0.00"
              value={amounts[c.key] ?? ""}
              onChange={(e) => set(c.key, e.target.value)}
            />
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary flex-1" disabled={busy}>
          {busy ? "Saving…" : "Save budget"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
