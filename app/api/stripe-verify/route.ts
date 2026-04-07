import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const { error } = await requireAuth("reviewer");
  if (error) return error;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ avs: "U", cvv: "U", error: "Stripe not configured" }, { status: 503 });
  }

  const { paymentMethodId } = await req.json();
  if (!paymentMethodId) {
    return NextResponse.json({ avs: "U", cvv: "U", error: "paymentMethodId required" }, { status: 400 });
  }

  let intentId: string | undefined;

  try {
    // $1 manual-capture authorization — triggers real AVS/CVV from issuer
    // off_session:true reduces likelihood of 3DS being required
    const createParams = new URLSearchParams({
      amount: "100",
      currency: "usd",
      payment_method: paymentMethodId,
      "payment_method_types[]": "card",
      capture_method: "manual",
      confirm: "true",
      off_session: "true",
      "payment_method_options[card][request_three_d_secure]": "automatic",
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
      last_payment_error?: {
        payment_method?: {
          card?: {
            checks?: {
              address_line1_check?: string | null;
              address_postal_code_check?: string | null;
              cvc_check?: string | null;
            };
          };
        };
        code?: string;
        decline_code?: string;
      };
      error?: { message?: string; code?: string };
    };

    intentId = intent.id;

    // Extract card — checks are available whether succeeded OR declined/requires_action
    let card = typeof intent.payment_method === "object"
      ? intent.payment_method?.card
      : undefined;

    // If 3DS required or declined, checks may be on last_payment_error
    if (!card?.checks && intent.last_payment_error?.payment_method?.card) {
      card = intent.last_payment_error.payment_method.card as typeof card;
    }

    const checks = card?.checks;
    const avsStreet = checks?.address_line1_check;
    const avsZip    = checks?.address_postal_code_check;
    const cvvCheck  = checks?.cvc_check;

    const avs = deriveAvs(avsStreet, avsZip);
    const cvv = deriveCvv(cvvCheck);

    logger.info("Stripe AVS/CVV", {
      intentId, status: intent.status,
      avsStreet, avsZip, cvvCheck, avs, cvv,
    });

    // Cancel the hold — never capture
    if (intentId) {
      await fetch(`https://api.stripe.com/v1/payment_intents/${intentId}/cancel`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }).catch(() => {});
    }

    return NextResponse.json({
      avs,
      cvv,
      last4: card?.last4,
      brand: card?.brand,
      checks: { avsStreet, avsZip, cvvCheck },
      stripeStatus: intent.status,
    });

  } catch (err) {
    if (intentId) {
      await fetch(`https://api.stripe.com/v1/payment_intents/${intentId}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      }).catch(() => {});
    }
    logger.error("Stripe verify failed", { error: String(err) });
    return NextResponse.json({ avs: "U", cvv: "U", error: String(err) }, { status: 500 });
  }
}

function deriveAvs(street?: string | null, zip?: string | null): "Y"|"N"|"P"|"U" {
  if (street === "pass" && zip === "pass") return "Y";
  if (street === "pass" || zip === "pass") return "P";
  if (street === "fail" || zip === "fail") return "N";
  return "U";
}

function deriveCvv(cvc?: string | null): "M"|"N"|"U" {
  if (cvc === "pass") return "M";
  if (cvc === "fail") return "N";
  return "U";
}
