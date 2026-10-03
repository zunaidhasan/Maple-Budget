// Income (section 4.8) — recurring income detection review.

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardTitle, cad, Badge, EmptyState, dateShort } from "@/components/ui";
import { PatternActions } from "@/components/pattern-actions";

export const dynamic = "force-dynamic";

export default async function IncomePage() {
  const user = await requireUser();

  const [patterns, sources] = await Promise.all([
    prisma.recurringPattern.findMany({
      where: { userId: user.id, kind: "INCOME", status: { in: ["SUGGESTED", "CONFIRMED"] } },
      orderBy: { confidence: "desc" },
    }),
    prisma.incomeSource.findMany({
      where: { userId: user.id },
      orderBy: { nextExpectedAt: "asc" },
    }),
  ]);

  const suggested = patterns.filter((p) => p.status === "SUGGESTED");
  const confirmed = sources.filter((s) => s.status !== "PAUSED");

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Your income sources</CardTitle>
        {confirmed.length === 0 ? (
          <EmptyState
            title="No income sources yet"
            hint="Confirm a detected pattern below, or wait for the detector to find your payroll."
          />
        ) : (
          <ul className="divide-y divide-(--border)">
            {confirmed.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-(--muted)">
                    {s.frequency.toLowerCase()}
                    {s.isVariable ? " · variable" : ""} · next{" "}
                    {s.nextExpectedAt ? dateShort(s.nextExpectedAt) : "—"}
                    {s.status === "VARIABLE" ? " · variable" : ""}
                  </p>
                </div>
                <span className="font-semibold text-emerald-600">
                  {cad(Number(s.expectedAmount))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>Detected patterns</CardTitle>
        {suggested.length === 0 ? (
          <p className="text-sm text-(--muted)">
            No new suggestions. Patterns appear after a couple of consistent
            pay deposits.
          </p>
        ) : (
          <ul className="divide-y divide-(--border)">
            {suggested.map((p) => (
              <li key={p.id} className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{p.merchantName}</p>
                    <p className="text-xs text-(--muted)">
                      {p.frequency.toLowerCase()} · ~{cad(Number(p.avgAmount))} · seen{" "}
                      {p.occurrenceCount}× · confidence {Math.round(p.confidence * 100)}%
                    </p>
                    {p.nextExpectedAt && (
                      <p className="text-xs text-(--muted)">
                        next expected {dateShort(p.nextExpectedAt)}
                      </p>
                    )}
                  </div>
                  <Badge tone={p.confidence >= 0.8 ? "success" : "warning"}>
                    {Math.round(p.confidence * 100)}%
                  </Badge>
                </div>
                <PatternActions patternId={p.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
