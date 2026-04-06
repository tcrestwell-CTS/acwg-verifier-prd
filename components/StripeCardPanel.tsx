"use client";

import { useState, useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/components/ui/Toast";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

// Load Stripe outside component to avoid recreating on every render
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""
);

interface AvsResult {
  avs: "Y" | "N" | "P" | "U";
  cvv: "M" | "N" | "U";
  last4?: string;
  brand?: string;
  checks?: {
    avsStreet?: string | null;
    avsZip?: string | null;
    cvvCheck?: string | null;
  };
  error?: string;
}

interface StripeCardPanelProps {
  billingZip: string;
  onResult: (result: AvsResult) => void;
}

const ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: "14px",
      color: "#1e293b",
      fontFamily: "Arial, sans-serif",
      "::placeholder": { color: "#94a3b8" },
    },
    invalid: { color: "#cc1111" },
  },
};

function CardForm({ billingZip, onResult }: StripeCardPanelProps) {
  const stripe = useStripe();
  const elements = useElements();
  const { success, error: toastError } = useToast();
  const [result, setResult] = useState<AvsResult | null>(null);

  const verifyMutation = useMutation({
    mutationFn: async () => {
      if (!stripe || !elements) throw new Error("Stripe not loaded");

      const cardNumber = elements.getElement(CardNumberElement);
      if (!cardNumber) throw new Error("Card element not mounted");

      // Tokenize card client-side — raw number never touches our server
      const { error, paymentMethod } = await stripe.createPaymentMethod({
        type: "card",
        card: cardNumber,
        billing_details: {
          address: { postal_code: billingZip || undefined },
        },
      });

      if (error) throw new Error(error.message ?? "Card tokenization failed");
      if (!paymentMethod) throw new Error("No payment method returned");

      // Send token to our server for AVS/CVV check
      const res = await fetch("/api/stripe-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethodId: paymentMethod.id,
          billingZip,
        }),
      });

      if (!res.ok) throw new Error((await res.json()).error);
      return await res.json() as AvsResult;
    },
    onSuccess: (data) => {
      setResult(data);
      onResult(data);
      if (data.avs === "Y") success("Card verified", "AVS full match — billing address confirmed");
      else if (data.avs === "N") toastError("AVS mismatch", "Billing address does not match card records");
      else if (data.avs === "P") toastError("AVS partial", "ZIP matched but street address did not");
    },
    onError: (err: Error) => toastError("Verification failed", err.message),
  });

  const avsColor = result?.avs === "Y" ? "text-green-600" :
                   result?.avs === "N" ? "text-red-600" :
                   result?.avs === "P" ? "text-amber-600" : "text-slate-500";

  const cvvColor = result?.cvv === "M" ? "text-green-600" :
                   result?.cvv === "N" ? "text-red-600" : "text-slate-500";

  const avsLabel = { Y: "✓ Full Match", N: "✗ Mismatch", P: "Partial Match", U: "Unavailable" };
  const cvvLabel = { M: "✓ Match", N: "✗ Mismatch", U: "Unavailable" };

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest">
          Card Verification (AVS / CVV)
        </h3>
        {result && (
          <div className="flex items-center gap-3 text-xs font-semibold">
            <span className={avsColor}>AVS: {avsLabel[result.avs]}</span>
            <span className={cvvColor}>CVV: {cvvLabel[result.cvv]}</span>
          </div>
        )}
      </div>

      <div className="px-4 py-4 space-y-4">
        <p className="text-xs text-slate-500">
          Enter the card details the customer provided. Card data is tokenized directly by Stripe — the full card number never touches our servers.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Card Number
            </label>
            <div className="form-input py-3">
              <CardNumberElement options={ELEMENT_OPTIONS} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Expiry
              </label>
              <div className="form-input py-3">
                <CardExpiryElement options={ELEMENT_OPTIONS} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                CVV
              </label>
              <div className="form-input py-3">
                <CardCvcElement options={ELEMENT_OPTIONS} />
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={() => verifyMutation.mutate()}
          disabled={verifyMutation.isPending || !stripe}
          className="btn-primary w-full"
        >
          {verifyMutation.isPending
            ? <><LoadingSpinner size="sm" /> Verifying with Stripe…</>
            : "Run AVS / CVV Check"
          }
        </button>

        {result && (
          <div className={`p-3 rounded-lg border text-sm ${
            result.avs === "Y" && result.cvv === "M"
              ? "bg-green-50 border-green-200 text-green-800"
              : result.avs === "N" || result.cvv === "N"
              ? "bg-red-50 border-red-200 text-red-800"
              : "bg-amber-50 border-amber-200 text-amber-800"
          }`}>
            <p className="font-semibold mb-1">
              {result.brand?.toUpperCase()} ending {result.last4}
            </p>
            <p>AVS (billing address): <strong>{avsLabel[result.avs]}</strong></p>
            <p>CVV (security code): <strong>{cvvLabel[result.cvv]}</strong></p>
            {result.error && <p className="mt-1 text-red-700">{result.error}</p>}
          </div>
        )}

        <p className="text-xs text-slate-400 text-center">
          🔒 Powered by Stripe — PCI DSS compliant · No card data stored
        </p>
      </div>
    </div>
  );
}

export function StripeCardPanel(props: StripeCardPanelProps) {
  if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
    return (
      <div className="card px-4 py-4 text-sm text-slate-400">
        Stripe not configured — add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to enable AVS/CVV
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise}>
      <CardForm {...props} />
    </Elements>
  );
}
