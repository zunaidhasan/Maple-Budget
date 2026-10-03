"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";

export function PatternActions({ patternId }: { patternId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action: "confirm" | "reject") {
    setBusy(true);
    try {
      await fetch(`/api/recurring-income/${patternId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex gap-2">
      <button className="btn btn-primary flex-1" onClick={() => act("confirm")} disabled={busy}>
        <Check size={14} /> This is my income
      </button>
      <button className="btn btn-secondary" onClick={() => act("reject")} disabled={busy}>
        <X size={14} /> Not income
      </button>
    </div>
  );
}
