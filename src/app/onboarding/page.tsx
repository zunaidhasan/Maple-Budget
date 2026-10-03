// Onboarding (section 7): welcome → connect bank → done.

import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-sm text-center">
        <div className="text-4xl">🍁</div>
        <h1 className="mt-3 text-2xl font-bold">
          Welcome{session.user.displayName ? `, ${session.user.displayName}` : ""}!
        </h1>
        <p className="mt-2 text-sm text-(--muted)">
          Three quick steps and you'll see your money clearly.
        </p>

        <ol className="mt-8 space-y-3 text-left">
          {[
            { n: 1, t: "Create your account", done: true },
            { n: 2, t: "Connect a Canadian bank via Flinks", done: false },
            { n: 3, t: "Review auto-categorized transactions", done: false },
          ].map((s) => (
            <li key={s.n} className="card flex items-center gap-3 py-3">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                  s.done
                    ? "bg-(--primary) text-white"
                    : "border border-(--border) text-(--muted)"
                }`}
              >
                {s.done ? "✓" : s.n}
              </span>
              <span className="flex-1 text-sm font-medium">{s.t}</span>
            </li>
          ))}
        </ol>

        <div className="mt-8 flex flex-col gap-3">
          <Link href="/app/accounts" className="btn btn-primary">
            Connect your bank
          </Link>
          <Link href="/app" className="btn btn-secondary">
            Explore the app first
          </Link>
        </div>
      </div>
    </div>
  );
}
