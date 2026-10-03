// App shell: sticky top bar + mobile bottom tab bar (section 7 frontend).

import Link from "next/link";
import {
  LayoutDashboard,
  Landmark,
  Receipt,
  PiggyBank,
  Target,
  Bell,
} from "lucide-react";

export function AppShell({
  children,
  title,
  unread = 0,
}: {
  children: React.ReactNode;
  title: string;
  unread?: number;
}) {
  const tabs = [
    { href: "/app", label: "Home", icon: LayoutDashboard },
    { href: "/app/accounts", label: "Accounts", icon: Landmark },
    { href: "/app/transactions", label: "Transactions", icon: Receipt },
    { href: "/app/budget", label: "Budget", icon: PiggyBank },
    { href: "/app/goals", label: "Goals", icon: Target },
  ];
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-(--border) bg-(--card)/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-3">
          <span className="text-lg font-bold">{title}</span>
          <Link
            href="/app/notifications"
            className="relative rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Notifications"
          >
            <Bell size={20} />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-24 pt-4">
        {children}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-(--border) bg-(--card)/95 backdrop-blur"
        aria-label="Primary"
      >
        <div className="mx-auto grid w-full max-w-2xl grid-cols-5">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-(--muted) hover:text-(--foreground)"
            >
              <t.icon size={20} />
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
