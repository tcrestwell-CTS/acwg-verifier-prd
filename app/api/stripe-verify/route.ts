import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

// ── POST /api/stripe-verify ───────────────────────────────────────────────────
// Retrieves the PaymentMethod created by Stripe.js and reads the AVS/CVV checks
// directly from it. Stripe runs these checks at PM creation time when billing
// details are provided — no PaymentIntent needed.

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

  try {
    // Fetch the PaymentMethod directly — checks are populated at creation time
    const res = await fetch(
      `https://api.stripe.com/v1/payment_methods/${paymentMethodId}`,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Stripe-Version": "2023-10-16",
        },
      }
    );

    if (!res.ok) {
      const err = await res.json() as { error?: { message?: string } };
      logger.warn("Stripe PM fetch failed", { status: res.status, error: err.error?.message });
      return NextResponse.json({ avs: "U", cvv: "U", error: err.error?.message });
    }

    const pm = await res.json() as {
      id?: string;
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

    const card   = pm.card;
    const checks = card?.checks;

    const avsStreet = checks?.address_line1_check;
    const avsZip    = checks?.address_postal_code_check;
    const cvvCheck  = checks?.cvc_check;

    const avs = deriveAvs(avsStreet, avsZip);
    const cvv = deriveCvv(cvvCheck);

    logger.info("Stripe PM checks", {
      pmId: pm.id,
      avsStreet, avsZip, cvvCheck,
      avs, cvv,
    });

    return NextResponse.json({
      avs,
      cvv,
      last4:    card?.last4,
      brand:    card?.brand,
      expMonth: card?.exp_month,
      expYear:  card?.exp_year,
      checks:   { avsStreet, avsZip, cvvCheck },
    });

  } catch (err) {
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
