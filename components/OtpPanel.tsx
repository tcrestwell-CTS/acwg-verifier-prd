"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/components/ui/Toast";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface OtpPanelProps {
  orderId: string;
  phone: string;
  required: boolean;
}

interface OtpAttempt {
  id: string;
  status: "pending" | "verified" | "failed" | "expired";
  attempts: number;
  expiresAt: string;
  verifiedAt: string | null;
  createdAt: string;
}

export function OtpPanel({ orderId, phone, required }: OtpPanelProps) {
  const { success, error: toastError } = useToast();
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);

  const { data: attempts, refetch } = useQuery<OtpAttempt[]>({
    queryKey: ["otp-status", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/escalation/otp?orderId=${orderId}`);
      return res.json();
    },
    refetchInterval: 10_000,
  });

  const latestAttempt = attempts?.[0];
  const isVerified = latestAttempt?.status === "verified";

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/escalation/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          phone,
          actor: "rep",
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: (data) => {
      setAttemptId(data.attemptId);
      if (data._devCode) setDevCode(data._devCode);
      success("OTP sent", `Verification code sent to ${phone.slice(0, -4)}****`);
      refetch();
    },
    onError: (err: Error) => toastError("Failed to send OTP", err.message),
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/escalation/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId: attemptId ?? latestAttempt?.id,
          code,
          actor: "rep",
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.verified) {
        success("OTP verified", "Customer identity confirmed");
        setCode("");
        setDevCode(null);
      } else {
        toastError("Code incorrect", "Ask the customer to try again");
      }
      refetch();
    },
    onError: (err: Error) => toastError("Verification failed", err.message),
  });

  return (
    <div className={`card overflow-hidden border-2 ${
      isVerified ? "border-green-200" :
      required ? "border-amber-200" : "border-slate-200"
    }`}>
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest">
            SMS Verification
          </h3>
          {required && !isVerified && (
            <span className="badge badge-warn">Required</span>
          )}
          {isVerified && (
            <span className="badge badge-pass">✓ Verified</span>
          )}
        </div>
        <span className="text-xs text-slate-400 font-mono">
          {phone.slice(0, -4)}****
        </span>
      </div>

      <div className="px-4 py-4 space-y-3">
        {isVerified ? (
          <p className="text-sm text-green-700 font-medium">
            ✓ Customer verified via SMS code
          </p>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              {required
                ? "OTP verification is required for this order. Send a code to the customer's phone."
                : "Send a verification code to confirm the customer's identity."}
            </p>

            {/* Dev mode hint */}
            {devCode && (
              <div className="p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-xs font-semibold text-yellow-700">
                  Dev mode — code: <span className="font-mono text-lg">{devCode}</span>
                </p>
              </div>
            )}

            {/* Step 1: Send OTP */}
            {!attemptId && !latestAttempt && (
              <button
                onClick={() => sendMutation.mutate()}
                disabled={sendMutation.isPending}
                className="btn-primary w-full"
              >
                {sendMutation.isPending ? (
                  <><LoadingSpinner size="sm" /> Sending…</>
                ) : (
                  "📱 Send Verification Code"
                )}
              </button>
            )}

            {/* Step 2: Enter code */}
            {(attemptId || latestAttempt?.status === "pending") && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">
                  Ask: <em>"Please read me the 6-digit code we just sent to your phone."</em>
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="Enter 6-digit code"
                    className="form-input font-mono text-center text-lg tracking-widest flex-1"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && code.length === 6 && verifyMutation.mutate()}
                  />
                  <button
                    onClick={() => verifyMutation.mutate()}
                    disabled={code.length !== 6 || verifyMutation.isPending}
                    className="btn-primary px-6"
                  >
                    {verifyMutation.isPending ? <LoadingSpinner size="sm" /> : "Verify"}
                  </button>
                </div>
                <div className="flex justify-between items-center">
                  <button
                    onClick={() => { setAttemptId(null); setCode(""); setDevCode(null); sendMutation.mutate(); }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Resend code
                  </button>
                  {latestAttempt && (
                    <span className="text-xs text-slate-400">
                      Attempt {latestAttempt.attempts}/3
                    </span>
                  )}
                </div>
              </div>
            )}

            {latestAttempt?.status === "failed" && (
              <div className="p-2 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700 font-medium">Max attempts reached</p>
                <button
                  onClick={() => { setAttemptId(null); setCode(""); sendMutation.mutate(); }}
                  className="text-xs text-red-600 hover:underline mt-1"
                >
                  Send new code
                </button>
              </div>
            )}

            {latestAttempt?.status === "expired" && (
              <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-700 font-medium">Code expired</p>
                <button
                  onClick={() => { setAttemptId(null); setCode(""); sendMutation.mutate(); }}
                  className="text-xs text-amber-600 hover:underline mt-1"
                >
                  Send new code
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
