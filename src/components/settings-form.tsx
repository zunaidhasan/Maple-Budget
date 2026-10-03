"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardTitle } from "./ui";

interface Props {
  initial: {
    timezone: string;
    currency: string;
    budgetWarningThreshold: number;
    budgetCriticalThreshold: number;
  };
}

const TIMEZONES = [
  "America/St_Johns",
  "America/Halifax",
  "America/Toronto",
  "America/Winnipeg",
  "America/Edmonton",
  "America/Vancouver",
];

export function SettingsForm({ initial }: Props) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardTitle>Preferences</CardTitle>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="tz">Timezone</label>
            <select
              id="tz"
              className="input"
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz.replaceAll("_", " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="cur">Currency</label>
            <select
              id="cur"
              className="input"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            >
              <option value="CAD">CAD — Canadian Dollar</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="warn">Budget warning %</label>
            <input
              id="warn"
              className="input"
              inputMode="numeric"
              value={form.budgetWarningThreshold}
              onChange={(e) =>
                setForm({ ...form, budgetWarningThreshold: Number(e.target.value) || 0 })
              }
            />
          </div>
          <div>
            <label className="label" htmlFor="crit">Budget critical %</label>
            <input
              id="crit"
              className="input"
              inputMode="numeric"
              value={form.budgetCriticalThreshold}
              onChange={(e) =>
                setForm({ ...form, budgetCriticalThreshold: Number(e.target.value) || 0 })
              }
            />
          </div>
        </div>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : saved ? "Saved ✓" : "Save preferences"}
        </button>
      </form>
    </Card>
  );
}
