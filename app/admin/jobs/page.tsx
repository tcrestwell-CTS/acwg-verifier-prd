"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/Toast";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { formatDate } from "@/lib/format";

interface JobMetrics {
  pending: number; running: number; completed: number;
  failed: number; deadLetter: number;
}

interface QueueJob {
  id: string; type: string; status: string;
  attempts: number; maxAttempts: number;
  lastError?: string; runAt: string; createdAt: string;
  payload: Record<string, unknown>;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "badge-warn", running: "bg-blue-100 text-blue-700 border-blue-200",
  completed: "badge-pass", failed: "badge-fail", dead_letter: "bg-gray-100 text-gray-600 border-gray-200",
};

export default function JobsPage() {
  const qc = useQueryClient();
  const { success, error: toastError } = useToast();
  const [view, setView] = useState<"metrics" | "failed" | "pending">("metrics");

  const { data: metrics } = useQuery<JobMetrics>({
    queryKey: ["job-metrics"],
    queryFn: async () => (await fetch("/api/admin/jobs?view=metrics")).json(),
    refetchInterval: 10_000,
  });

  const { data: jobs, isLoading } = useQuery<QueueJob[]>({
    queryKey: ["jobs", view],
    queryFn: async () => (await fetch(`/api/admin/jobs?view=${view}`)).json(),
    enabled: view !== "metrics",
  });

  const actionMutation = useMutation({
    mutationFn: async ({ action, jobId }: { action: string; jobId?: string }) => {
      const res = await fetch("/api/admin/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, jobId }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: (_, { action }) => {
      success(action === "retry" ? "Job re-queued" : action === "discard" ? "Job discarded" : "Processed");
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["job-metrics"] });
    },
    onError: (err: Error) => toastError("Action failed", err.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Job Queue</h1>
          <p className="text-slate-500 mt-1">Monitor and manage background jobs.</p>
        </div>
        <button
          onClick={() => actionMutation.mutate({ action: "process_next" })}
          className="btn-secondary"
        >
          Process Next Job
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[
          { label: "Pending", key: "pending", color: "text-amber-600" },
          { label: "Running", key: "running", color: "text-blue-600" },
          { label: "Completed", key: "completed", color: "text-green-600" },
          { label: "Failed", key: "failed", color: "text-red-600" },
          { label: "Dead Letter", key: "deadLetter", color: "text-gray-500" },
        ].map((stat) => (
          <div key={stat.key} className="card p-4 text-center">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{stat.label}</p>
            <p className={`text-3xl font-bold tabular-nums mt-1 ${stat.color}`}>
              {metrics?.[stat.key as keyof JobMetrics] ?? 0}
            </p>
          </div>
        ))}
      </div>

      {/* View tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        {(["metrics", "pending", "failed"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md capitalize transition-colors ${
              view === v ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {v === "metrics" ? "Overview" : v}
          </button>
        ))}
      </div>

      {/* Job list */}
      {view !== "metrics" && (
        <div className="card overflow-hidden">
          {isLoading ? (
            <LoadingPage label="Loading jobs…" />
          ) : !jobs || jobs.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p>No {view} jobs</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    {["Type", "Status", "Attempts", "Run At", "Error", "Actions"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-semibold">{job.type}</p>
                        <p className="font-mono text-xs text-slate-400">{job.id.slice(0, 8)}…</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${STATUS_COLORS[job.status] ?? "badge-neutral"}`}>
                          {job.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {job.attempts}/{job.maxAttempts}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {formatDate(job.runAt)}
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        {job.lastError && (
                          <p className="text-xs text-red-600 truncate" title={job.lastError}>
                            {job.lastError}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button
                            onClick={() => actionMutation.mutate({ action: "retry", jobId: job.id })}
                            className="btn-secondary text-xs px-2 py-1"
                          >
                            Retry
                          </button>
                          <button
                            onClick={() => actionMutation.mutate({ action: "discard", jobId: job.id })}
                            className="btn-danger text-xs px-2 py-1"
                          >
                            Discard
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
