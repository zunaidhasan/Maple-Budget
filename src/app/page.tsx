import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export default async function LandingPage() {
  const session = await getSessionUser();
  if (session) redirect("/app");

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-12 text-center">
      <div className="text-5xl">🍁</div>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight">
        Maple Budget
      </h1>
      <p className="mt-3 max-w-md text-(--muted)">
        See where your money goes. Connect your Canadian bank accounts,
        track spending automatically, and reach your savings goals.
      </p>

      <ul className="mt-6 grid w-full max-w-md gap-2 text-left text-sm">
        {[
          "Bank sync through Flinks — read-only, secure",
          "Automatic transaction categorization",
          "Recurring income detection for payday planning",
          "Budgets, goals, and clear cash-flow insights",
        ].map((f) => (
          <li key={f} className="card flex items-center gap-2 py-2">
            <span aria-hidden>✅</span> {f}
          </li>
        ))}
      </ul>

      <div className="mt-8 flex w-full max-w-md flex-col gap-3">
        <Link href="/signup" className="btn btn-primary">
          Create your account
        </Link>
        <Link href="/login" className="btn btn-secondary">
          Sign in
        </Link>
      </div>

      <p className="mt-8 max-w-md text-xs text-(--muted)">
        Your banking credentials are never seen or stored by Maple Budget —
        connections are handled by Flinks, a bank-grade financial-data provider.
      </p>
    </div>
  );
}
