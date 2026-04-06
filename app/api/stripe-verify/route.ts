import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

// ── POST /api/stripe-verify ───────────────────────────────────────────────────
// Receives a Stripe PaymentMethod token (created client-side via Stripe.js)
// Runs a $0 SetupIntent to trigger AVS/CVV checks without charging the card
// Returns real AVS and CVV codes from the card issuer

export async function POST(req: NextRequest) {
  const { error } = await requireAuth("reviewer");
  if (error) return error;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const { paymentMethodId, billingZip } = await req.json();

  if (!paymentMethodId) {
    return NextResponse.json({ error: "paymentMethodId required" }, { status: 400 });
  }

  try {
    // Create a SetupIntent with the PaymentMethod — triggers AVS/CVV check
    // $0 amount means no charge to the customer
    const params = new URLSearchParams({
      payment_method: paymentMethodId,
      confirm: "true",
      usage: "off_session",
      "payment_method_options[card][request_three_d_secure]": "automatic",
    });

    const res = await fetch("https://api.stripe.com/v1/setup_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": "2023-10-16",
      },
      body: params,
    });

    const intent = await res.json() as {
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
      next_action?: unknown;
      error?: { message?: string; code?: string };
    };

    if (intent.error) {
      logger.warn("Stripe SetupIntent error", { error: intent.error });
      return NextResponse.json({
        avs: "U", cvv: "U",
        error: intent.error.message,
        stripeCode: intent.error.code,
      });
    }

    // Extract AVS/CVV from the expanded payment method checks
    const card = typeof intent.payment_method === "object"
      ? intent.payment_method?.card
      : null;

    const checks = card?.checks;

    // Stripe check values: "pass" | "fail" | "unavailable" | "unchecked" | null
    const avsStreet = checks?.address_line1_check;
    const avsZip    = checks?.address_postal_code_check;
    const cvvCheck  = checks?.cvc_check;

    const avs = deriveAvs(avsStreet, avsZip);
    const cvv = deriveCvv(cvvCheck);

    logger.info("Stripe AVS/CVV result", {
      intentId: intent.id,
      status: intent.status,
      avsStreet, avsZip, cvvCheck,
      avs, cvv,
    });

    return NextResponse.json({
      avs,
      cvv,
      status: intent.status,
      last4: card?.last4,
      brand: card?.brand,
      checks: { avsStreet, avsZip, cvvCheck },
    });

  } catch (err) {
    logger.error("Stripe verify failed", { error: String(err) });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

function deriveAvs(
  street: string | null | undefined,
  zip: string | null | undefined
): "Y" | "N" | "P" | "U" {
  if (!street && !zip) return "U";
  if (street === "pass" && zip === "pass") return "Y";
  if (street === "pass" || zip === "pass") return "P";
  if (street === "fail" || zip === "fail") return "N";
  return "U";
}

function deriveCvv(cvc: string | null | undefined): "M" | "N" | "U" {
  if (cvc === "pass") return "M";
  if (cvc === "fail") return "N";
  return "U";
}
