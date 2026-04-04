import { logger } from "@/lib/logger";
import type { PaymentAdapter, PaymentSignals } from "./adapter";

// AVS response code mapping (Stripe uses single chars)
const AVS_MAP: Record<string, "Y" | "N" | "P" | "U"> = {
  Y: "Y", // Full match
  A: "P", // Street match, ZIP no match
  Z: "P", // ZIP match, street no match
  N: "N", // No match
  U: "U", // Unavailable
  W: "P", // 9-digit ZIP match
  X: "Y", // Exact match (street + ZIP)
};

const CVV_MAP: Record<string, "M" | "N" | "U"> = {
  M: "M", // Match
  N: "N", // No match
  U: "U", // Unchecked
  P: "U", // Not processed
};

export class StripePaymentAdapter implements PaymentAdapter {
  name = "stripe";

  async collectSignals(opts: {
    cardLast4?: string;
    bin?: string;
    amount?: number;
    currency?: string;
    billingZip?: string;
  }): Promise<PaymentSignals> {
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      logger.warn("Stripe not configured — returning stub signals");
      return this.stubSignals(opts);
    }

    // For real signal collection we use a PaymentMethod + SetupIntent
    // In production: client creates PaymentMethod token, server confirms
    // For server-side zero-auth: use a test PaymentMethod token
    const testPmId = process.env.STRIPE_TEST_PM_ID;
    if (!testPmId) {
      logger.warn("STRIPE_TEST_PM_ID not set — returning stub signals");
      return this.stubSignals(opts);
    }

    try {
      const params = new URLSearchParams({
        payment_method: testPmId,
        confirm: "true",
        "payment_method_options[card][request_three_d_secure]": "any",
        amount: String(Math.round((opts.amount ?? 0) * 100)),
        currency: (opts.currency ?? "usd").toLowerCase(),
        capture_method: "manual",
      });

      const res = await fetch("https://api.stripe.com/v1/payment_intents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      });

      if (!res.ok) throw new Error(`Stripe ${res.status}`);

      const pi = await res.json() as {
        charges?: { data?: Array<{
          payment_method_details?: {
            card?: { checks?: { address_postal_code_check?: string; cvc_check?: string } }
          }
        }> }
      };

      const card = pi.charges?.data?.[0]?.payment_method_details?.card;
      const checks = card?.checks ?? {};

      const avs = AVS_MAP[checks.address_postal_code_check?.toUpperCase() ?? "U"] ?? "U";
      const cvv = CVV_MAP[checks.cvc_check?.toUpperCase() ?? "U"] ?? "U";

      const reasons: string[] = [];
      if (avs === "N") reasons.push("Stripe AVS: address mismatch");
      else if (avs === "P") reasons.push("Stripe AVS: partial match");
      if (cvv === "N") reasons.push("Stripe CVV: mismatch");

      return { avs, cvv, provider: "stripe", reasons };
    } catch (err) {
      logger.error("Stripe signal collection failed", { error: String(err) });
      return this.stubSignals(opts);
    }
  }

  private stubSignals(opts: { bin?: string; cardLast4?: string }): PaymentSignals {
    const isTest = opts.bin === "424242" || opts.cardLast4 === "4242";
    return {
      avs: isTest ? "Y" : "U",
      cvv: isTest ? "M" : "U",
      provider: "stripe_stub",
      reasons: ["Stripe not configured — stub signals used"],
    };
  }
}
