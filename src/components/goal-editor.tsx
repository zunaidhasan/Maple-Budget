"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GoalEditor() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("EMERGENCY_FUND");
  const [targetAmount, setTargetAmount] = useState("");
  const [currentAmount, setCurrentAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [frequency, setFrequency] = useState("MONTHLY");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          type,
          targetAmount: Number(targetAmount),
          currentAmount: Number(currentAmount) || 0,
          targetDate: targetDate
            ? new Date(`${targetDate}T00:00:00Z`).toISOString()
            : undefined,
          contributionFrequency: targetDate ? frequency : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create goal");
        return;
      }
      setOpen(false);
      setTitle("");
      setTargetAmount("");
      setCurrentAmount("");
      setTargetDate("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-primary w-full" onClick={() => setOpen(true)}>
        New goal
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
      <h2 className="font-bold">New goal</h2>
      <div>
        <label className="label" htmlFor="goal-title">Title</label>
        <input id="goal-title" className="input" required value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Emergency fund" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor="goal-type">Type</label>
          <select id="goal-type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="EMERGENCY_FUND">Emergency fund</option>
            <option value="VACATION">Vacation</option>
            <option value="HOME_DOWN_PAYMENT">Home down payment</option>
            <option value="CAR">Car</option>
            <option value="EDUCATION">Education</option>
            <option value="DEBT_PAYOFF">Debt payoff</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="goal-freq">Contribute</label>
          <select id="goal-freq" className="input" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            <option value="WEEKLY">Weekly</option>
            <option value="BIWEEKLY">Biweekly</option>
            <option value="SEMIMONTHLY">Semimonthly</option>
            <option value="MONTHLY">Monthly</option>
            <option value="QUARTERLY">Quarterly</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor="goal-target">Target $</label>
          <input id="goal-target" className="input" required inputMode="decimal"
            value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} placeholder="10000" />
        </div>
        <div>
          <label className="label" htmlFor="goal-current">Saved so far $</label>
          <input id="goal-current" className="input" inputMode="decimal"
            value={currentAmount} onChange={(e) => setCurrentAmount(e.target.value)} placeholder="0" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="goal-date">Target date (optional)</label>
        <input id="goal-date" type="date" className="input" value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary flex-1" disabled={busy}>
          {busy ? "Creating…" : "Create goal"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
