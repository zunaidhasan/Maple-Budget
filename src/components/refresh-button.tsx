"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function RefreshButton({ connectionId }: { connectionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    try {
      await fetch(`/api/connections/${connectionId}/refresh`, { method: "POST" });
      // Give the worker a moment, then refresh server data.
      setTimeout(() => {
        router.refresh();
        setBusy(false);
      }, 2500);
    } catch {
      setBusy(false);
    }
  }

  return (
    <button
      className="inline-flex items-center gap-1 rounded-full border border-(--border) px-2.5 py-1 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
      onClick={refresh}
      disabled={busy}
    >
      <RefreshCw size={12} className={busy ? "animate-spin" : ""} />
      {busy ? "Refreshing…" : "Refresh"}
    </button>
  );
}
