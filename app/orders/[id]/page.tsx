"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import type { OrderRecord, DecisionFormValues } from "@/lib/schemas";
import { VerificationPanel } from "@/components/VerificationPanel";
import { DecisionModal } from "@/components/DecisionModal";
import { ClaudeSummary } from "@/components/ClaudeSummary";
import { DecisionBadge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { formatDate, formatCurrency, scoreLabel } from "@/lib/format";
import { scoreColor, scoreBg } from "@/lib/risk";
import { clsx } from "clsx";

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { success, error: toastError } = useToast();
  const [decisionModal, setDecisionModal] = useState<{ open: boolean; initialStatus: "approved" | "queued" | "denied" } | null>(null);

  const { data: record, isLoading, error } = useQuery<OrderRecord>({
    queryKey: ["order", params.id],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${params.id}`);
      if (!res.ok) throw new Error("Order not found");
      return res.json();
    },
  });

  const decisionMutation = useMutation({
    mutationFn: async (values: DecisionFormValues) => {
      const res = await fetch("/api/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: params.id, ...values, decidedAt: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error("Decision failed");
      return res.json();
    },
    onSuccess: (_, variables) => {
      success(`Order ${variables.status}`, `Recorded by ${variables.decidedBy}`);
      setDecisionModal(null);
      qc.invalidateQueries({ queryKey: ["order", params.id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: () => toastError("Failed to save decision"),
  });

  if (isLoading) return <LoadingPage label="Loading order…" />;
  if (error || !record) {
    return (
      <div className="card p-8 text-center">
        <p className="text-red-600 font-medium">Order not found</p>
        <Link href="/orders/queue" className="btn-secondary mt-4 inline-flex">← Back to Queue</Link>
      </div>
    );
  }

  const { order, verification, history, currentStatus } = record;
  const score = (verification?.overall as { score?: number })?.score ?? 0;
  const totalOrderValue = order.items.reduce((sum, item) => sum + item.qty * item.price, 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/orders/queue" className="text-sm text-slate-500 hover:text-brand-600 transition-colors">← Back to Queue</Link>
        <div className="flex items-start justify-between mt-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{order.customer.firstName} {order.customer.lastName}</h1>
            <p className="text-slate-500 text-sm font-mono mt-0.5">{record.id} · Created {formatDate(record.createdAt)}</p>
          </div>
          <DecisionBadge decision={currentStatus} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-5">
            <h2 className="section-header">Order Details</h2>
            <div className="grid grid-cols-2 gap-4 text-sm mb-4">
              <div><p className="text-slate-400 text-xs">Email</p><p className="font-medium text-slate-800">{order.contact.email}</p></div>
              <div><p className="text-slate-400 text-xs">Phone</p><p className="font-medium text-slate-800">{order.contact.phone}</p></div>
              <div><p className="text-slate-400 text-xs">Billing</p><p className="font-medium text-slate-800">{order.billingAddress.line1}, {order.billingAddress.city}, {order.billingAddress.state}</p></div>
              <div><p className="text-slate-400 text-xs">Shipping</p><p className="font-medium text-slate-800">{order.shippingAddress.line1}, {order.shippingAddress.city}, {order.shippingAddress.state}</p></div>
              {order.paymentMeta.cardLast4 && (
                <div><p className="text-slate-400 text-xs">Card</p><p className="font-medium font-mono text-slate-800">{order.paymentMeta.brand} ···{order.paymentMeta.cardLast4}</p></div>
              )}
              <div><p className="text-slate-400 text-xs">Order Total</p><p className="font-semibold text-slate-900">{formatCurrency(totalOrderValue)}</p></div>
            </div>
            <div className="border-t border-slate-100 pt-3">
              <p className="text-xs text-slate-400 mb-2">Items</p>
              {order.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">{item.qty}× {item.name} <span className="text-slate-400 font-mono ml-2 text-xs">{item.sku}</span></span>
                  <span className="font-medium">{formatCurrency(item.qty * item.price)}</span>
                </div>
              ))}
            </div>
          </div>

          {verification && <><h2 className="text-base font-semibold text-slate-900">Verification Results</h2><VerificationPanel verification={verification as never} /></>}
          {verification && <ClaudeSummary order={order} verification={verification as never} />}
        </div>

        <div className="space-y-4">
          <div className={clsx("card p-5 border-2", scoreBg(score))}>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Risk Score</p>
            <div className="flex items-end gap-2 mb-3">
              <span className={clsx("text-4xl font-bold tabular-nums", scoreColor(score))}>{score}</span>
              <span className="text-slate-400 pb-1">/100</span>
            </div>
            <p className="text-sm text-slate-600">{scoreLabel(score)}</p>
            <div className="h-2 bg-white/50 rounded-full mt-3 overflow-hidden">
              <div className={clsx("h-full rounded-full", score <= 25 ? "bg-green-500" : score <= 60 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${score}%` }} />
            </div>
          </div>

          <div className="card p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Actions</p>
            <div className="space-y-2">
              <button onClick={() => setDecisionModal({ open: true, initialStatus: "approved" })} className="btn-success w-full">Approve Order</button>
              <button onClick={() => setDecisionModal({ open: true, initialStatus: "denied" })} className="btn-danger w-full">Deny Order</button>
              <button onClick={() => setDecisionModal({ open: true, initialStatus: "queued" })} className="btn w-full bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-400">Add Note / Re-queue</button>
            </div>
          </div>

          <div className="card p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Decision History</p>
            {history.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No decisions yet.</p>
            ) : (
              <div className="space-y-3">
                {[...history].reverse().map((h, i) => (
                  <div key={i} className="border-l-2 border-slate-200 pl-3 text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <DecisionBadge decision={h.status} />
                      <span className="text-xs text-slate-400">{formatDate(h.decidedAt)}</span>
                    </div>
                    <p className="text-xs text-slate-500">by {h.decidedBy}</p>
                    {h.reasons.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {h.reasons.map((r, j) => <li key={j} className="text-xs text-slate-600">› {r}</li>)}
                      </ul>
                    )}
                    {h.notes && <p className="text-xs text-slate-500 italic mt-1">"{h.notes}"</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {decisionModal && (
        <DecisionModal
          open={decisionModal.open}
          onClose={() => setDecisionModal(null)}
          onSubmit={decisionMutation.mutateAsync}
          initialStatus={decisionModal.initialStatus}
          isLoading={decisionMutation.isPending}
        />
      )}
    </div>
  );
}
