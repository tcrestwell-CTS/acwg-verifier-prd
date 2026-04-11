"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

interface ManagerEscalationPanelProps {
  orderId: string;
  score: number;
  reasons: string[];
  customerName: string;
  orderAmount: number;
}

export function ManagerEscalationPanel({
  orderId, score, reasons, customerName, orderAmount,
}: ManagerEscalationPanelProps) {
  const [escalated, setEscalated] = useState(false);
  const [managerCode, setManagerCode] = useState("");
  const [overrideGranted, setOverrideGranted] = useState(false);

  const escalateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/escalation/manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, score, reasons, customerName, orderAmount }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => setEscalated(true),
  });

  const overrideMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/escalation/manager-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, managerCode }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => setOverrideGranted(true),
  });

  if (overrideGranted) {
    return (
      <div className="card border border-green-300 bg-green-50 px-4 py-4">
        <p className="text-sm font-semibold text-green-800">
          ✓ Manager override granted — you may now process this order
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden border border-amber-300">
      <div className="px-4 py-3 border-b border-amber-200 bg-amber-50 flex items-center justify-between">
        <h3 className="text-sm font-bold text-amber-900 flex items-center gap-2">
          🔔 Manager Escalation Required
        </h3>
        <span className="badge badge-warn">Score {score}/100</span>
      </div>

      <div className="px-4 py-4 space-y-4">
        <p className="text-sm text-slate-700">
          This order falls in the <strong>manager review zone (26–39)</strong>. A sales manager
          must approve before this order can be processed.
        </p>

        <div className="bg-slate-50 rounded-lg p-3 space-y-1">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Why this order needs review</p>
          {reasons.filter(r => r.length > 0).slice(0, 4).map((r, i) => (
            <p key={i} className="text-xs text-slate-600">• {r}</p>
          ))}
        </div>

        {!escalated ? (
          <button
            onClick={() => escalateMutation.mutate()}
            disabled={escalateMutation.isPending}
            className="btn-primary w-full"
          >
            {escalateMutation.isPending ? "Notifying manager…" : "📧 Notify Sales Manager"}
          </button>
        ) : (
          <div className="space-y-3">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm font-semibold text-blue-800">✓ Manager notified</p>
              <p className="text-xs text-blue-600 mt-0.5">
                Enter the override code from your manager to proceed.
              </p>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                className="form-input flex-1 font-mono tracking-widest text-center"
                placeholder="Manager code"
                maxLength={8}
                value={managerCode}
                onChange={e => setManagerCode(e.target.value.toUpperCase())}
              />
              <button
                onClick={() => overrideMutation.mutate()}
                disabled={overrideMutation.isPending || managerCode.length < 4}
                className="btn-primary px-4"
              >
                {overrideMutation.isPending ? "…" : "Verify"}
              </button>
            </div>
            {overrideMutation.isError && (
              <p className="text-xs text-red-600">
                {(overrideMutation.error as Error).message}
              </p>
            )}
          </div>
        )}

        <p className="text-xs text-slate-400 text-center">
          Manager can also approve directly in the Review Queue
        </p>
      </div>
    </div>
  );
}
