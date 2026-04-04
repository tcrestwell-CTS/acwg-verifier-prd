"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/Toast";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { formatDate, formatCurrency } from "@/lib/format";

interface ChargebackRecord {
  id: string;
  orderId: string;
  reason: string;
  amount: number;
  currency: string;
  chargebackDate: string;
  reportedBy: string;
  notes?: string;
  status: string;
  resolution?: string;
  resolvedAt?: string;
  createdAt: string;
  order: { customerName: string; email: string };
}

const STATUS_COLORS: Record<string, string> = {
  open: "badge-warn",
  investigating: "badge-neutral",
  won: "badge-pass",
  lost: "badge-fail",
  resolved: "badge-neutral",
};

export default function ChargebacksPage() {
  const qc = useQueryClient();
  const { success, error: toastError } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [actor, setActor] = useState("");
  const [form, setForm] = useState({
    orderId: "", reason: "", amount: "", chargebackDate: "", notes: "",
  });

  const { data: chargebacks, isLoading } = useQuery<ChargebackRecord[]>({
    queryKey: ["chargebacks"],
    queryFn: async () => {
      const res = await fetch("/api/admin/chargebacks");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/chargebacks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          amount: parseFloat(form.amount),
          actor,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      success("Chargeback recorded");
      setShowForm(false);
      setForm({ orderId: "", reason: "", amount: "", chargebackDate: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["chargebacks"] });
    },
    onError: (err: Error) => toastError("Failed", err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch("/api/admin/chargebacks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, actor }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      success("Status updated");
      qc.invalidateQueries({ queryKey: ["chargebacks"] });
    },
    onError: (err: Error) => toastError("Failed", err.message),
  });

  if (isLoading) return <LoadingPage label="Loading chargebacks…" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Chargebacks</h1>
          <p className="text-slate-500 mt-1">Record and track chargeback disputes.</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            className="form-input w-40"
            placeholder="Your name"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
          />
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            + New Chargeback
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card p-5 space-y-4">
          <h2 className="section-header">Record Chargeback</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Order ID *</label>
              <input className="form-input font-mono text-sm" value={form.orderId}
                onChange={(e) => setForm({ ...form, orderId: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Amount (USD) *</label>
              <input className="form-input" type="number" step="0.01" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Reason *</label>
              <input className="form-input" value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Chargeback Date *</label>
              <input className="form-input" type="date" value={form.chargebackDate}
                onChange={(e) => setForm({ ...form, chargebackDate: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="form-label">Notes</label>
              <textarea className="form-input resize-none" rows={2} value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !form.orderId || !form.reason || !form.amount || !actor}
              className="btn-primary"
            >
              Record Chargeback
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        {!chargebacks || chargebacks.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p className="text-lg mb-1">No chargebacks recorded</p>
            <p className="text-sm">Chargebacks will appear here when added.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  {["Date", "Customer", "Amount", "Reason", "Status", "Actions"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {chargebacks.map((cb) => (
                  <tr key={cb.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {formatDate(cb.chargebackDate)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{cb.order.customerName}</p>
                      <p className="text-xs text-slate-400">{cb.order.email}</p>
                    </td>
                    <td className="px-4 py-3 font-semibold text-red-600">
                      {formatCurrency(cb.amount)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-xs">
                      <p className="truncate">{cb.reason}</p>
                      {cb.notes && <p className="text-xs text-slate-400 truncate">{cb.notes}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${STATUS_COLORS[cb.status] ?? "badge-neutral"}`}>
                        {cb.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {cb.status === "open" && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => updateMutation.mutate({ id: cb.id, status: "won" })}
                            disabled={!actor}
                            className="btn text-xs px-2 py-1 bg-green-600 text-white hover:bg-green-700 focus:ring-green-500"
                          >
                            Won
                          </button>
                          <button
                            onClick={() => updateMutation.mutate({ id: cb.id, status: "lost" })}
                            disabled={!actor}
                            className="btn-danger text-xs px-2 py-1"
                          >
                            Lost
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
