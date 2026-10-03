"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Landmark } from "lucide-react";

interface Institution {
  providerSlug: string;
  name: string;
  shortName?: string;
}

export function ConnectBankButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [mode, setMode] = useState<string>("simulator");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/flinks/session")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load institutions"))))
      .then((d) => {
        setInstitutions(d.institutions ?? []);
        setMode(d.mode);
      })
      .catch(() => setError("Could not load institutions"));
  }, [open]);

  async function connect(slug: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/flinks/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institutionSlug: slug }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Connection failed");
        return;
      }
      setOpen(false);
      router.push("/app/sync?connecting=1");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="btn btn-primary w-full" onClick={() => setOpen(true)}>
        <Plus size={16} /> Connect a bank account
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Connect a financial institution"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-(--card) p-4 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2">
              <Landmark size={18} />
              <h2 className="flex-1 font-bold">Choose your institution</h2>
              <button
                className="rounded-full p-1.5 hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => setOpen(false)}
                aria-label="Close"
                disabled={busy}
              >
                ✕
              </button>
            </div>

            {mode === "simulator" && (
              <p className="mb-3 rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
                Simulator mode: selecting an institution creates demo Canadian
                accounts and transactions. No real bank is contacted.
              </p>
            )}

            {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

            <ul className="max-h-80 divide-y divide-(--border) overflow-y-auto">
              {institutions.map((i) => (
                <li key={i.providerSlug}>
                  <button
                    className="flex w-full items-center gap-3 px-1 py-3 text-left hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50"
                    onClick={() => connect(i.providerSlug)}
                    disabled={busy}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--primary)/10 text-xs font-bold text-(--primary)">
                      {(i.shortName ?? i.name).slice(0, 2).toUpperCase()}
                    </span>
                    <span className="flex-1 text-sm font-medium">{i.name}</span>
                    {busy && selected === i.providerSlug && <span className="text-xs">…</span>}
                  </button>
                </li>
              ))}
              {institutions.length === 0 && (
                <li className="py-6 text-center text-sm text-(--muted)">
                  Loading institutions…
                </li>
              )}
            </ul>

            <p className="mt-3 text-xs text-(--muted)">
              Bank credentials are entered only in Flinks' secure flow — never
              in this app.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
