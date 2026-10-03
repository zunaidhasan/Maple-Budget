"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { cad, dateShort, EmptyState } from "./ui";

interface Tx {
  id: string;
  date: string;
  description: string;
  merchantName: string | null;
  amount: number;
  status: string;
  isTransfer: boolean;
  category: { key?: string; id?: string; label: string; color: string } | null;
  account: { name: string };
}

interface Props {
  accounts: { id: string; name: string }[];
  categories: { id: string; label: string; color: string; group: string }[];
}

export function TransactionsBrowser({ accounts, categories }: Props) {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [type, setType] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageSize = 50;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (q) params.set("q", q);
    if (categoryId) params.set("categoryId", categoryId);
    if (accountId) params.set("accountId", accountId);
    if (type) params.set("type", type);
    const res = await fetch(`/api/transactions?${params}`);
    if (res.ok) {
      const data = await res.json();
      setTxs(data.transactions);
      setTotal(data.total);
    }
    setLoading(false);
  }, [page, q, categoryId, accountId, type]);

  useEffect(() => {
    load();
  }, [load]);

  function onSearch(v: string) {
    setQ(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setPage(1), 350);
  }

  async function recategorize(txId: string, newCategoryId: string) {
    setEditing(null);
    const res = await fetch(`/api/transactions/${txId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: newCategoryId || null }),
    });
    if (res.ok) {
      setTxs((prev) =>
        prev.map((t): Tx =>
          t.id === txId
            ? {
                ...t,
                category: categories.find((c) => c.id === newCategoryId) ?? null,
              }
            : t
        )
      );
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-(--muted)" />
        <input
          className="input pl-9"
          placeholder="Search descriptions…"
          value={q}
          onChange={(e) => onSearch(e.target.value)}
          aria-label="Search transactions"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <select
          className="input max-w-40 shrink-0"
          value={categoryId}
          onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
        <select
          className="input max-w-40 shrink-0"
          value={accountId}
          onChange={(e) => { setAccountId(e.target.value); setPage(1); }}
          aria-label="Filter by account"
        >
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select
          className="input max-w-36 shrink-0"
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(1); }}
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          <option value="income">Income</option>
          <option value="expense">Expenses</option>
          <option value="transfer">Transfers</option>
        </select>
      </div>

      {loading && txs.length === 0 ? (
        <p className="py-8 text-center text-sm text-(--muted)">Loading…</p>
      ) : txs.length === 0 ? (
        <EmptyState
          title="No transactions found"
          hint="Try clearing filters, or connect a bank account to import data."
        />
      ) : (
        <div className="card px-0 py-0 overflow-hidden">
          <ul className="divide-y divide-(--border)">
            {txs.map((t) => (
              <li key={t.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <button
                      className="block w-full truncate text-left font-medium"
                      onClick={() => setEditing(editing === t.id ? null : t.id)}
                      aria-expanded={editing === t.id}
                    >
                      {t.merchantName ?? t.description}
                    </button>
                    <p className="text-xs text-(--muted)">
                      {dateShort(t.date)} · {t.account.name}
                      {t.status === "PENDING" ? " · pending" : ""}
                      {t.isTransfer ? " · transfer" : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${t.amount >= 0 ? "text-emerald-600" : ""}`}>
                      {cad(t.amount, { signed: true })}
                    </p>
                    {t.category && (
                      <span
                        className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{ background: `${t.category.color}22`, color: t.category.color }}
                      >
                        {t.category.label}
                      </span>
                    )}
                  </div>
                </div>

                {editing === t.id && (
                  <div className="mt-3 rounded-xl border border-(--border) p-3">
                    <label className="label">Category</label>
                    <select
                      className="input"
                      value={t.category ? categories.find((c) => c.label === t.category?.label)?.id ?? "" : ""}
                      onChange={(e) => recategorize(t.id, e.target.value)}
                    >
                      <option value="">Uncategorized</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-(--muted)">
                      Changing a category teaches the app your preference for
                      this merchant.
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button
            className="btn btn-secondary"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Previous
          </button>
          <span className="text-(--muted)">
            Page {page} of {pageCount} · {total} transactions
          </span>
          <button
            className="btn btn-secondary"
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={page >= pageCount}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
