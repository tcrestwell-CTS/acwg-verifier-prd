"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { OrderForm } from "@/components/OrderForm";
import { VerificationPanel } from "@/components/VerificationPanel";
import { RiskSummary } from "@/components/RiskSummary";
import { DecisionModal } from "@/components/DecisionModal";
import { ClaudeSummary } from "@/components/ClaudeSummary";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import type { OrderPayload, VerificationResult, DecisionFormValues } from "@/lib/schemas";

interface VerifyResponse {
  id: string;
  verification: VerificationResult;
}

function NewOrderContent() {
  const { success, error: toastError } = useToast();
  const [orderId, setOrderId] = useState<string | null>(null);
  const [currentOrder, setCurrentOrder] = useState<OrderPayload | null>(null);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [decisionModal, setDecisionModal] = useState<{
    open: boolean;
    initialStatus: "approved" | "queued" | "denied";
  } | null>(null);

  const verifyMutation = useMutation({
    mutationFn: async (data: OrderPayload): Promise<VerifyResponse> => {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Verification failed");
      return res.json();
    },
    onSuccess: (data, variables) => {
      setOrderId(data.id);
      setVerification(data.verification);
      setCurrentOrder(variables);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: () => {
      toastError("Verification failed", "Could not run checks. Please try again.");
    },
  });

  const decisionMutation = useMutation({
    mutationFn: async (values: DecisionFormValues) => {
      const res = await fetch("/api/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          ...values,
          decidedAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error("Decision failed");
      return res.json();
    },
    onSuccess: (_, variables) => {
      success(
        `Order ${variables.status}`,
        `Decision recorded by ${variables.decidedBy}`
      );
      setDecisionModal(null);
    },
    onError: () => {
      toastError("Decision failed", "Could not save decision. Please try again.");
    },
  });

  const openModal = (status: "approved" | "queued" | "denied") => {
    setDecisionModal({ open: true, initialStatus: status });
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">New Order Verification</h1>
        <p className="text-slate-500 mt-1">
          Enter order details to run fraud signals and receive a risk assessment.
        </p>
      </div>

      {!verification ? (
        <OrderForm
          onSubmit={verifyMutation.mutateAsync}
          isLoading={verifyMutation.isPending}
        />
      ) : (
        <div className="space-y-6 animate-fade-in">
          {/* Back to form */}
          <button
            type="button"
            onClick={() => {
              setVerification(null);
              setCurrentOrder(null);
              setOrderId(null);
            }}
            className="btn-secondary text-sm"
          >
            ← Start New Order
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Left: Verification Panel */}
            <div className="lg:col-span-3 space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">
                Verification Results
                <span className="ml-2 text-sm font-normal text-slate-400 font-mono">
                  #{orderId}
                </span>
              </h2>
              <VerificationPanel verification={verification} />
              {currentOrder && (
                <ClaudeSummary
                  order={currentOrder}
                  verification={verification}
                />
              )}
            </div>

            {/* Right: Risk Summary */}
            <div className="lg:col-span-2">
              <div className="sticky top-20">
                <RiskSummary
                  verification={verification}
                  onApprove={() => openModal("approved")}
                  onQueue={() => openModal("queued")}
                  onDeny={() => openModal("denied")}
                  isPending={decisionMutation.isPending}
                />
              </div>
            </div>
          </div>

          {/* Decision Modal */}
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
      )}
    </div>
  );
}

export default function NewOrderPage() {
  return (
    <ToastProvider>
      <NewOrderContent />
    </ToastProvider>
  );
}
