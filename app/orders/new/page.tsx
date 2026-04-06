"use client";

import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { OrderForm } from "@/components/OrderForm";
import { VerificationPanel } from "@/components/VerificationPanel";
import { RiskSummary } from "@/components/RiskSummary";
import { DecisionModal } from "@/components/DecisionModal";
import { ClaudeSummary } from "@/components/ClaudeSummary";
import { RepPlaybook } from "@/components/RepPlaybook";
import { OtpPanel } from "@/components/OtpPanel";
import { StripeCardPanel } from "@/components/StripeCardPanel";
import { IdentityPanel } from "@/components/panels/IdentityPanel";
import { DevicePanel } from "@/components/panels/DevicePanel";
import { PropertyPanel } from "@/components/panels/PropertyPanel";
import { PhonePanel } from "@/components/panels/PhonePanel";
import { RiskTimeline, buildTimeline } from "@/components/panels/RiskTimeline";
import { useToast } from "@/components/ui/Toast";
import type { OrderPayload, VerificationResult, DecisionFormValues } from "@/lib/schemas";

interface VerifyResponse {
  id: string;
  verification: VerificationResult;
}

export default function NewOrderPage() {
  const { success, error: toastError } = useToast();
  const [orderId, setOrderId] = useState<string | null>(null);
  const [currentOrder, setCurrentOrder] = useState<OrderPayload | null>(null);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [stripeCardResult, setStripeCardResult] = useState<{
    avs: "Y"|"N"|"P"|"U"; cvv: "M"|"N"|"U";
    last4?: string; brand?: string; expMonth?: number; expYear?: number;
  } | null>(null);
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
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (json as { error?: string; message?: string } | null)?.error ??
          (json as { error?: string; message?: string } | null)?.message ??
          `Verification failed (${res.status})`
        );
      }
      return json;
    },
    onSuccess: (data, variables) => {
      setOrderId(data.id);
      setVerification(data.verification);
      setCurrentOrder(variables);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (err: Error) => {
      toastError("Verification failed", err.message);
    },
  });

  const decisionMutation = useMutation({
    mutationFn: async (values: DecisionFormValues) => {
      const res = await fetch("/api/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, ...values, decidedAt: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error("Decision failed");
      return res.json();
    },
    onSuccess: (_, variables) => {
      success(`Order ${variables.status}`, `Decision recorded by ${variables.decidedBy}`);
      setDecisionModal(null);
    },
    onError: () => {
      toastError("Decision failed", "Could not save decision. Please try again.");
    },
  });

  // Extract advanced signals from verification response
  type AdvancedVerification = typeof verification & {
    identity?: React.ComponentProps<typeof IdentityPanel>["identity"];
    property?: React.ComponentProps<typeof PropertyPanel>["property"];
    device?: React.ComponentProps<typeof DevicePanel>["device"];
    phoneIntel?: React.ComponentProps<typeof PhonePanel>["phone"];
  };
  const adv = verification as AdvancedVerification | null;
  const advancedSignals = {
    identity:   adv?.identity   ?? null,
    property:   adv?.property   ?? null,
    device:     adv?.device     ?? null,
    phoneIntel: adv?.phoneIntel ?? null,
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">New Order Verification</h1>
        <p className="text-slate-500 mt-1">Enter order details to run fraud signals and receive a risk assessment.</p>
      </div>

      {!verification ? (
        <div className="space-y-4">
          <OrderForm onSubmit={verifyMutation.mutateAsync} isLoading={verifyMutation.isPending} />
          {/* Stripe card panel — collect card before running verify */}
          <StripeCardPanel
            billingZip=""
            onResult={(r) => setStripeCardResult(r as typeof stripeCardResult)}
          />
        </div>
      ) : (
        <div className="space-y-6 animate-fade-in">
          <button type="button" onClick={() => { setVerification(null); setCurrentOrder(null); setOrderId(null); }} className="btn-secondary text-sm">
            ← Start New Order
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3 space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">
                Verification Results
                <span className="ml-2 text-sm font-normal text-slate-400 font-mono">#{orderId}</span>
              </h2>
              <VerificationPanel verification={verification} />
              <RepPlaybook
                verification={verification}
                requiresOtp={(verification.overall as { requiresOtp?: boolean }).requiresOtp}
                requiresDoc={(verification.overall as { requiresDocVerification?: boolean }).requiresDocVerification}
              />
              {orderId && (
                <OtpPanel
                  orderId={orderId}
                  phone={currentOrder?.contact?.phone ?? ""}
                  required={!!(verification.overall as { requiresOtp?: boolean }).requiresOtp}
                />
              )}

              {currentOrder && <ClaudeSummary order={currentOrder} verification={verification} />}
            </div>

            <div className="lg:col-span-2 space-y-4">
              <RiskTimeline steps={buildTimeline({
                verified: true,
                requiresOtp: !!(verification.overall as { requiresOtp?: boolean }).requiresOtp,
                otpComplete: false,
                requiresDoc: !!(verification.overall as { requiresDocVerification?: boolean }).requiresDocVerification,
                docComplete: false,
                decision: (verification.overall as { decision?: string }).decision ?? "",
              })} />
              <div className="sticky top-20 space-y-4">
                <RiskSummary
                  verification={verification}
                  onApprove={() => setDecisionModal({ open: true, initialStatus: "approved" })}
                  onQueue={() => setDecisionModal({ open: true, initialStatus: "queued" })}
                  onDeny={() => setDecisionModal({ open: true, initialStatus: "denied" })}
                  isPending={decisionMutation.isPending}
                />
                {/* Advanced signal panels — inside sticky so they stay visible */}
                {advancedSignals.identity   && <IdentityPanel  identity={advancedSignals.identity}  />}
                {advancedSignals.property   && <PropertyPanel  property={advancedSignals.property}  />}
                {advancedSignals.device     && <DevicePanel    device={advancedSignals.device}       />}
                {advancedSignals.phoneIntel && <PhonePanel     phone={advancedSignals.phoneIntel}   />}
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
      )}
    </div>
  );
}



