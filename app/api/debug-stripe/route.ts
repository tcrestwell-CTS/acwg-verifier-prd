import { NextResponse } from "next/server";

export async function GET() {
  const sk = process.env.STRIPE_SECRET_KEY;
  const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  if (!sk) return NextResponse.json({ error: "STRIPE_SECRET_KEY not set" });

  // Verify key by hitting Stripe's account endpoint
  const res = await fetch("https://api.stripe.com/v1/account", {
    headers: { Authorization: `Bearer ${sk}` },
  });

  const data = await res.json() as {
    id?: string;
    business_profile?: { name?: string };
    charges_enabled?: boolean;
    country?: string;
    error?: { message?: string };
  };

  if (data.error) {
    return NextResponse.json({
      sk_prefix: sk.slice(0, 12) + "...",
      pk_prefix: (pk ?? "").slice(0, 12) + "...",
      error: data.error.message,
    }, { status: 400 });
  }

  // Also create a test PaymentMethod to verify full flow
  const pmRes = await fetch("https://api.stripe.com/v1/payment_methods", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sk}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      type: "card",
      "card[number]": "4000000000000077", // AVS line1 pass, zip fail
      "card[exp_month]": "12",
      "card[exp_year]": "2029",
      "card[cvc]": "314",
    }),
  });

  const pm = await pmRes.json() as {
    id?: string;
    card?: { last4?: string; brand?: string };
    error?: { message?: string };
  };

  if (pm.error) {
    return NextResponse.json({
      account: data.id,
      pm_error: pm.error.message,
    });
  }

  // Run SetupIntent on the test card
  const siRes = await fetch("https://api.stripe.com/v1/setup_intents", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sk}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": "2023-10-16",
    },
    body: new URLSearchParams({
      payment_method: pm.id!,
      confirm: "true",
      usage: "off_session",
    }),
  });

  const si = await siRes.json() as {
    id?: string;
    status?: string;
    payment_method?: {
      card?: {
        last4?: string;
        checks?: {
          address_line1_check?: string | null;
          address_postal_code_check?: string | null;
          cvc_check?: string | null;
        };
      };
    };
    error?: { message?: string };
  };

  const card = typeof si.payment_method === "object" ? si.payment_method?.card : null;

  return NextResponse.json({
    account_id: data.id,
    business_name: data.business_profile?.name,
    charges_enabled: data.charges_enabled,
    country: data.country,
    test_card_last4: pm.card?.last4,
    setup_intent_status: si.status,
    avs_street: card?.checks?.address_line1_check,
    avs_zip: card?.checks?.address_postal_code_check,
    cvv: card?.checks?.cvc_check,
    si_error: si.error?.message,
  });
}
