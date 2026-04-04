"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { OrderRecord } from "@/lib/schemas";
import { DecisionBadge } from "./ui/Badge";
import { formatDate, scoreLabel, truncate } from "@/lib/format";
import { scoreColor } from "@/lib/risk";
import { clsx } from "clsx";

interface QueueTableProps {
  orders: OrderRecord[];
}

type FilterStatus = "all" | "approved" | "queued" | "denied";

const PER_PAGE = 10;

export function QueueTable({ orders }: QueueTableProps) {
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [minScore, setMinScore] = useState(0);
  const [maxScore, setMaxScore] = useState(100);
  const [reasonFilter, setReasonFilter] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<"createdAt" | "score">("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    return orders
      .filter((o) => statusFilter === "all" || o.currentStatus === statusFilter)
      .filter((o) => {
        const score = o.overall?.score ?? 0;
        return score >= minScore && score <= maxScore;
      })
      .filter((o) => {
        if (!reasonFilter) return true;
        return (o.overall?.reasons ?? []).some((r: string) =>
          r.toLowerCase().includes(reasonFilter.toLowerCase())
        );
      })
      .sort((a, b) => {
        let av: number, bv: number;
        if (sortBy === "score") {
          av = a.overall?.score ?? 0;
          bv = b.overall?.score ?? 0;
        } else {
          av = new Date(a.createdAt).getTime();
          bv = new Date(b.createdAt).getTime();
        }
        return sortDir === "asc" ? av - bv : bv - av;
      });
  }, [orders, statusFilter, minScore, maxScore, reasonFilter, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("desc");
    }
    setPage(1);
  };

  const SortIcon = ({ col }: { col: typeof sortBy }) =>
    sortBy === col ? (
      <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
    ) : (
      <span className="ml-1 opacity-30">↕</span>
    );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className="form-label text-xs">Status</label>
            <select
              className="form-input text-sm"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as FilterStatus);
                setPage(1);
              }}
            >
              <option value="all">All</option>
              <option value="queued">Queued</option>
              <option value="approved">Approved</option>
              <option value="denied">Denied</option>
            </select>
          </div>
          <div>
            <label className="form-label text-xs">
              Min Score: {minScore}
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={minScore}
              onChange={(e) => {
                setMinScore(Number(e.target.value));
                setPage(1);
              }}
              className="w-full accent-brand-600"
            />
          </div>
          <div>
            <label className="form-label text-xs">
              Max Score: {maxScore}
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={maxScore}
              onChange={(e) => {
                setMaxScore(Number(e.target.value));
                setPage(1);
              }}
              className="w-full accent-brand-600"
            />
          </div>
          <div>
            <label className="form-label text-xs">Reason Contains</label>
            <input
              type="search"
              className="form-input text-sm"
              placeholder="e.g. proxy, address…"
              value={reasonFilter}
              onChange={(e) => {
                setReasonFilter(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {paginated.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p className="text-lg mb-1">No orders match your filters</p>
            <p className="text-sm">Try adjusting the filters above</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">
                    Order ID
                  </th>
                  <th
                    className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider cursor-pointer hover:text-brand-600"
                    onClick={() => toggleSort("createdAt")}
                  >
                    Created <SortIcon col="createdAt" />
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">
                    Contact
                  </th>
                  <th
                    className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider cursor-pointer hover:text-brand-600"
                    onClick={() => toggleSort("score")}
                  >
                    Score <SortIcon col="score" />
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">
                    Top Signals
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.map((order) => {
                  const score = order.overall?.score ?? 0;
                  const decision = order.overall?.decision ?? order.currentStatus;
                  const reasons: string[] = order.overall?.reasons ?? [];
                  return (
                    <tr
                      key={order.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {order.id}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {formatDate(order.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">
                          {order.order.customer.firstName}{" "}
                          {order.order.customer.lastName}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <p>{truncate(order.order.contact.email, 30)}</p>
                        <p className="text-slate-400">{order.order.contact.phone}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={clsx(
                            "font-bold tabular-nums",
                            scoreColor(score)
                          )}
                        >
                          {score}
                        </span>
                        <span className="text-xs text-slate-400 ml-0.5">/100</span>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <div className="flex flex-wrap gap-1">
                          {reasons.slice(0, 2).map((r, i) => (
                            <span
                              key={i}
                              className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded"
                            >
                              {truncate(r, 30)}
                            </span>
                          ))}
                          {reasons.length > 2 && (
                            <span className="text-xs text-slate-400">
                              +{reasons.length - 2} more
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <DecisionBadge decision={decision} />
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/orders/${order.id}`}
                          className="btn-secondary text-xs px-3 py-1.5"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <p className="text-xs text-slate-500">
              Showing {(page - 1) * PER_PAGE + 1}–
              {Math.min(page * PER_PAGE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary text-xs px-2 py-1"
              >
                ← Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1
                )
                .map((p, idx, arr) => (
                  <>
                    {idx > 0 && arr[idx - 1] !== p - 1 && (
                      <span key={`ellipsis-${p}`} className="text-slate-400 px-1">
                        …
                      </span>
                    )}
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={clsx(
                        "btn text-xs px-3 py-1",
                        p === page
                          ? "bg-brand-600 text-white"
                          : "btn-secondary"
                      )}
                    >
                      {p}
                    </button>
                  </>
                ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-secondary text-xs px-2 py-1"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400 text-right">
        {filtered.length} order{filtered.length !== 1 ? "s" : ""} found
      </p>
    </div>
  );
}
