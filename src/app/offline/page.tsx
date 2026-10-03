// Offline fallback (section 5): served by the service worker when the
// network is unavailable. Never presents stale financial data as current.

"use client";

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="text-5xl">📡</div>
      <h1 className="mt-4 text-2xl font-bold">You're offline</h1>
      <p className="mt-2 max-w-sm text-(--muted)">
        Maple Budget needs a connection to show current balances and
        transactions. We don't cache your financial data on this device, so
        nothing is displayed rather than something out of date.
      </p>
      <button
        className="btn btn-primary mt-6"
        onClick={() => window.location.reload()}
      >
        Retry now
      </button>
    </div>
  );
}
