"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { scoreColor } from "@/lib/risk";
import { clsx } from "clsx";

interface ReportData {
  decisions: {
    period: string; total: number; approved: number;
    queued: number; denied: number;
    approvalRate: number; denialRate: number; queueRate: number;
  };
  aging: {
    total: number;
    aging: { under1h: number; under4h: number; under24h: number; over24h: number };
  };
  riskDistribution: {
    total: number;
    distribution: { low: number; medium: number; high: number };
  };
  chargebacks: {
    total: number; open: number; won: number; lost: number;
    totalAmountUsd: number; winRate: number;
  };
  jobs: {
    pending: number; running: number; completed: number;
    failed: number; deadLetter: number;
  };
}

function StatCard({ label, value, sub, color }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={clsx("text-3xl font-bold tabular-nums", color ?? "text-slate-900")}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function ReportsPage() {
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery<ReportData>({
    queryKey: ["admin-reports", days],
    queryFn: async () => {
      const res = await fetch(`/api/admin/reports?days=${days}`);
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const exportCsv = () => {
    window.open(`/api/admin/reports?days=${days}&format=csv`, "_blank");
  };

  if (isLoading) return <LoadingPage label="Loading reports…" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Operations Dashboard</h1>
          <p className="text-slate-500 mt-1">Real-time fraud metrics and reporting.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="form-input w-32"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>Last 7d</option>
            <option value={30}>Last 30d</option>
            <option value={90}>Last 90d</option>
          </select>
          <button onClick={exportCsv} className="btn-secondary">
            Export CSV
          </button>
        </div>
      </div>

      {/* Decision metrics */}
      <div>
        <h2 className="section-header">Decision Metrics ({data?.decisions.period})</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total Decisions" value={data?.decisions.total ?? 0} />
          <StatCard
            label="Approved"
            value={`${data?.decisions.approvalRate ?? 0}%`}
            sub={`${data?.decisions.approved ?? 0} orders`}
            color="text-green-600"
          />
          <StatCard
            label="Queued"
            value={`${data?.decisions.queueRate ?? 0}%`}
            sub={`${data?.decisions.queued ?? 0} orders`}
            color="text-amber-600"
          />
          <StatCard
            label="Denied"
            value={`${data?.decisions.denialRate ?? 0}%`}
            sub={`${data?.decisions.denied ?? 0} orders`}
            color="text-red-600"
          />
        </div>
      </div>

      {/* Queue aging */}
      <div>
        <h2 className="section-header">Queue Aging ({data?.aging.total ?? 0} pending)</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="< 1 hour" value={data?.aging.aging.under1h ?? 0} color="text-green-600" />
          <StatCard label="1–4 hours" value={data?.aging.aging.under4h ?? 0} color="text-amber-600" />
          <StatCard label="4–24 hours" value={data?.aging.aging.under24h ?? 0} color="text-orange-600" />
          <StatCard
            label="> 24 hours"
            value={data?.aging.aging.over24h ?? 0}
            color={data?.aging.aging.over24h ? "text-red-600" : "text-slate-400"}
            sub={data?.aging.aging.over24h ? "⚠ SLA breach" : undefined}
          />
        </div>
      </div>

      {/* Risk distribution */}
      <div>
        <h2 className="section-header">Risk Distribution ({data?.riskDistribution.total ?? 0} verifications)</h2>
        <div className="card p-5">
          <div className="space-y-3">
            {[
              { label: "Low Risk (≤25)", key: "low", color: "bg-green-500", textColor: "text-green-700" },
              { label: "Medium Risk (26–60)", key: "medium", color: "bg-amber-500", textColor: "text-amber-700" },
              { label: "High Risk (>60)", key: "high", color: "bg-red-500", textColor: "text-red-700" },
            ].map((band) => {
              const count = data?.riskDistribution.distribution[band.key as keyof typeof data.riskDistribution.distribution] ?? 0;
              const total = data?.riskDistribution.total ?? 1;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={band.key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-slate-600">{band.label}</span>
                    <span className={clsx("text-sm font-semibold", band.textColor)}>{count} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={clsx("h-full rounded-full transition-all", band.color)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Chargebacks + Jobs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="section-header">Chargebacks</h2>
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Total" value={data?.chargebacks.total ?? 0} />
            <StatCard label="Win Rate" value={`${data?.chargebacks.winRate ?? 0}%`} color="text-green-600" />
            <StatCard label="Open" value={data?.chargebacks.open ?? 0} color="text-amber-600" />
            <StatCard
              label="Total Exposure"
              value={`$${(data?.chargebacks.totalAmountUsd ?? 0).toLocaleString()}`}
              color="text-red-600"
            />
          </div>
        </div>

        <div>
          <h2 className="section-header">Job Queue</h2>
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Pending" value={data?.jobs.pending ?? 0} />
            <StatCard label="Completed" value={data?.jobs.completed ?? 0} color="text-green-600" />
            <StatCard label="Failed" value={data?.jobs.failed ?? 0} color="text-amber-600" />
            <StatCard
              label="Dead Letter"
              value={data?.jobs.deadLetter ?? 0}
              color={data?.jobs.deadLetter ? "text-red-600" : "text-slate-400"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
