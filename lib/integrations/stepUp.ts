/**
 * 3DS / Payment Step-Up Adapter
 *
 * Adapter-first design: all providers implement StepUpAdapter.
 * Default is StubStepUpAdapter (no-op) when feature flag is off or
 * no provider is configured. Swap to StripeStepUpAdapter when ready.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { writeAuditLog } from "@/lib/audit";
import { flags } from "@/lib/featureFlags";

export interface StepUpResult {
  success: boolean;
  outcome: "authenticated" | "declined" | "attempted" | "unavailable";
  challengeId?: string;
  acsUrl?: string;   // redirect URL for browser challenge
}

export interface StepUpAdapter {
  name: string;
  initiateStepUp(opts: {
    orderId: string;
    bin?: string;
    cardLast4?: string;
    amount: number;
    currency: string;
  }): Promise<StepUpResult>;
}

// ── Stub adapter (safe no-op) ─────────────────────────────────────────────────

class StubStepUpAdapter implements StepUpAdapter {
  name = "stub";
  async initiateStepUp(): Promise<StepUpResult> {
    return { success: true, outcome: "unavailable" };
  }
}

// ── Stripe 3DS adapter (wired when STRIPE_SECRET_KEY is set) ─────────────────

class StripeStepUpAdapter implements StepUpAdapter {
  name = "stripe_3ds";

  async initiateStepUp(opts: {
    orderId: string;
    bin?: string;
    cardLast4?: string;
    amount: number;
    currency: string;
  }): Promise<StepUpResult> {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return { success: false, outcome: "unavailable" };

    try {
      // Create a SetupIntent or PaymentIntent with 3DS enforcement
      // This is a simplified version — full implementation would include
      // confirm flow and webhook handling
      const res = await fetch("https://api.stripe.com/v1/payment_intents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          amount: String(Math.round(opts.amount * 100)),
          currency: opts.currency.toLowerCase(),
          payment_method_types: "card",
          capture_method: "manual",
          "payment_method_options[card][request_three_d_secure]": "any",
          description: `3DS step-up for order ${opts.orderId}`,
        }),
      });

      if (!res.ok) return { success: false, outcome: "unavailable" };

      const data = await res.json() as { id: string; next_action?: { redirect_to_url?: { url: string } } };
      const acsUrl = data.next_action?.redirect_to_url?.url;

      return {
        success: true,
        outcome: acsUrl ? "attempted" : "authenticated",
        challengeId: data.id,
        acsUrl,
      };
    } catch (err) {
      logger.error("Stripe 3DS initiation failed", { error: String(err) });
      return { success: false, outcome: "unavailable" };
    }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

function getAdapter(): StepUpAdapter {
  if (!flags.threeDsStepUp) return new StubStepUpAdapter();
  if (process.env.STRIPE_SECRET_KEY) return new StripeStepUpAdapter();
  return new StubStepUpAdapter();
}

// ── Public service function ───────────────────────────────────────────────────

export async function initiatePaymentStepUp(opts: {
  orderId: string;
  paymentMeta: { bin?: string; cardLast4?: string };
  orderTotal: number;
  actor: string;
}): Promise<StepUpResult> {
  const adapter = getAdapter();

  const result = await adapter.initiateStepUp({
    orderId: opts.orderId,
    bin: opts.paymentMeta.bin,
    cardLast4: opts.paymentMeta.cardLast4,
    amount: opts.orderTotal,
    currency: "USD",
  });

  // Persist the step-up attempt
  await db.stepUpResult.create({
    data: {
      orderId: opts.orderId,
      provider: adapter.name,
      status: result.outcome === "authenticated" ? "authenticated" : "initiated",
      challengeId: result.challengeId ?? null,
      acsUrl: result.acsUrl ?? null,
      outcome: result.outcome,
    },
  });

  await writeAuditLog({
    orderId: opts.orderId,
    actor: opts.actor,
    action: "stepup:initiated",
    payload: { provider: adapter.name, outcome: result.outcome },
  });

  logger.info("Payment step-up initiated", {
    orderId: opts.orderId,
    provider: adapter.name,
    outcome: result.outcome,
  });

  return result;
}
