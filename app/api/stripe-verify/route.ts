import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

// ── POST /api/stripe-verify ───────────────────────────────────────────────────
// Uses a PaymentIntent with capture_method=manual ($1 hold) to trigger real
// AVS/CVV checks from the card issuer, then immediately cancels it.
// SetupIntents don't reliably trigger AVS — a real authorization does.

export async function POST(req: NextRequest) {
  const { error } = await requireAuth("reviewer");
  if (error) return error;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const { paymentMethodId } = await req.json();

  if (!paymentMethodId) {
    return NextResponse.json({ error: "paymentMethodId required" }, { status: 400 });
  }

  let intentId: string | undefined;

  try {
    // Step 1: Create a $1.00 authorization hold — triggers real AVS/CVV from issuer
    const createParams = new URLSearchParams({
      amount: "100",          // $1.00 in cents
      currency: "usd",
      payment_method: paymentMethodId,
      "payment_method_types[]": "card",
      capture_method: "manual",  // authorize only — never captured
      confirm: "true",
      "expand[]": "payment_method",
    });

    const createRes = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": "2023-10-16",
      },
      body: createParams,
    });

    const intent = await createRes.json() as {
      id?: string;
      status?: string;
      payment_method?: string | {
        card?: {
          last4?: string;
          brand?: string;
          exp_month?: number;
          exp_year?: number;
          checks?: {
            address_line1_check?: string | null;
            address_postal_code_check?: string | null;
            cvc_check?: string | null;
          };
        };
      };
      error?: { message?: string; code?: string; decline_code?: string };
    };

    intentId = intent.id;

    // Extract AVS/CVV even if declined — checks are still returned
    const card = typeof intent.payment_method === "object"
      ? intent.payment_method?.card
      : null;

    const checks = card?.checks;
    const avsStreet = checks?.address_line1_check;
    const avsZip    = checks?.address_postal_code_check;
    const cvvCheck  = checks?.cvc_check;

    const avs = deriveAvs(avsStreet, avsZip);
    const cvv = deriveCvv(cvvCheck);

    logger.info("Stripe AVS/CVV result", {
      intentId, status: intent.status,
      avsStreet, avsZip, cvvCheck,
      avs, cvv,
      error: intent.error?.code,
    });

    // Step 2: Cancel the hold immediately — no charge to customer
    if (intentId && intent.status !== "canceled") {
      await fetch(`https://api.stripe.com/v1/payment_intents/${intentId}/cancel`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }).catch(() => {}); // non-fatal if cancel fails
    }

    return NextResponse.json({
      avs,
      cvv,
      last4: card?.last4,
      brand: card?.brand,
      checks: { avsStreet, avsZip, cvvCheck },
      stripeError: intent.error?.code ?? null,
    });

  } catch (err) {
    // Cancel if we have an intentId
    if (intentId) {
      await fetch(`https://api.stripe.com/v1/payment_intents/${intentId}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      }).catch(() => {});
    }
    logger.error("Stripe verify failed", { error: String(err) });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

function deriveAvs(
  street: string | null | undefined,
  zip: string | null | undefined
): "Y" | "N" | "P" | "U" {
  if (street === "pass" && zip === "pass") return "Y";
  if (street === "pass" || zip === "pass") return "P";
  if (street === "fail" && zip === "fail") return "N";
  if (street === "fail" || zip === "fail") return "N";
  return "U"; // unavailable or unchecked
}

function deriveCvv(cvc: string | null | undefined): "M" | "N" | "U" {
  if (cvc === "pass") return "M";
  if (cvc === "fail") return "N";
  return "U";
}
