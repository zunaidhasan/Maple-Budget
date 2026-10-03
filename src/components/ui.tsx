// Shared presentational primitives + money/date formatting (en-CA, CAD).

import type { ReactNode } from "react";

export function cad(n: number, opts?: { signed?: boolean }): string {
  const formatted = new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(Math.abs(n));
  if (opts?.signed && n > 0) return `+${formatted}`;
  if (opts?.signed && n < 0) return `-${formatted}`;
  return n < 0 ? `-${formatted}` : formatted;
}

export function dateShort(d: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(typeof d === "string" ? new Date(d) : d);
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function CardTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold text-(--muted) uppercase tracking-wide">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600"
      : tone === "negative"
        ? "text-red-600"
        : "";
  return (
    <div className="card">
      <div className="text-xs font-medium text-(--muted)">{label}</div>
      <div className={`text-xl font-bold mt-1 ${toneClass}`}>{value}</div>
      {sub ? <div className="text-xs text-(--muted) mt-0.5">{sub}</div> : null}
    </div>
  );
}

export function ProgressBar({
  pct,
  color = "var(--primary)",
}: {
  pct: number;
  color?: string;
}) {
  return (
    <div
      className="h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }}
      />
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-10 px-4">
      <p className="font-semibold">{title}</p>
      {hint ? <p className="text-sm text-(--muted) mt-1 max-w-sm mx-auto">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const tones: Record<string, string> = {
    default: "bg-black/5 dark:bg-white/10 text-(--muted)",
    success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    danger: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
