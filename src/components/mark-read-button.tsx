"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function MarkReadButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      className="rounded-full border border-(--border) px-2.5 py-1 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
        router.refresh();
      }}
    >
      Mark read
    </button>
  );
}
