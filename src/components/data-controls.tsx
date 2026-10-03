"use client";

import { useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Card } from "./ui";

export function DataControls() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function exportData() {
    const res = await fetch("/api/export");
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `maple-budget-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteAccount() {
    if (text !== "DELETE") return;
    setBusy(true);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (res.ok) {
        router.push("/");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <Download size={16} />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-(--muted)">
          Your data
        </h2>
      </div>
      <button className="btn btn-secondary w-full" onClick={exportData}>
        Export my data (JSON)
      </button>

      <div className="mt-4 border-t border-(--border) pt-4">
        <button
          className="btn btn-danger w-full"
          onClick={() => setConfirming((v) => !v)}
        >
          <Trash2 size={15} /> Delete my account
        </button>
        {confirming && (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-(--muted)">
              This permanently deletes your account, connections, and financial
              data. Type <strong>DELETE</strong> to confirm.
            </p>
            <input
              className="input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label="Type DELETE to confirm"
            />
            <button
              className="btn btn-danger w-full"
              disabled={text !== "DELETE" || busy}
              onClick={deleteAccount}
            >
              {busy ? "Deleting…" : "Permanently delete everything"}
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}
