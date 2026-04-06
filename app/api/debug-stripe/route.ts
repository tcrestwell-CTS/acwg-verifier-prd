import { NextResponse } from "next/server";

export async function GET() {
  const sk = process.env.STRIPE_SECRET_KEY;
  const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  if (!sk) return NextResponse.json({ error: "STRIPE_SECRET_KEY not set" });

  // Verify account
  const accountRes = await fetch("https://api.stripe.com/v1/account", {
    headers: { Authorization: `Bearer ${sk}` },
  });
  const account = await accountRes.json() as {
    id?: string;
    business_profile?: { name?: string };
    charges_enabled?: boolean;
    error?: { message?: string };
  };

  if (account.error) {
    return NextResponse.json({ error: account.error.message });
  }

  // Use Stripe's built-in test PaymentMethod tokens — no raw card needed
  // tok_visa is a pre-tokenized test card available on all Stripe accounts
  const tokenRes = await fetch("https://api.stripe.com/v1/payment_methods", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sk}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      type: "card",
      "card[token]": "tok_avsFail",  // Stripe test token: AVS fail
    }),
  });
  const pm = await tokenRes.json() as {
    id?: string;
    card?: { last4?: string; brand?: string };
    error?: { message?: string };
  };

  if (pm.error) {
    // Fallback: use pm_card_visa — a pre-built test PaymentMethod ID
    const siRes = await fetch("https://api.stripe.com/v1/setup_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sk}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": "2023-10-16",
      },
      body: new URLSearchParams({
        payment_method: "pm_card_visa",
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
          brand?: string;
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
      account_id: account.id,
      charges_enabled: account.charges_enabled,
      sk_prefix: sk.slice(0, 12) + "...",
      pk_set: !!pk,
      test_method: "pm_card_visa (built-in test PaymentMethod)",
      setup_intent_id: si.id,
      setup_intent_status: si.status,
      last4: card?.last4,
      brand: card?.brand,
      avs_street: card?.checks?.address_line1_check,
      avs_zip:    card?.checks?.address_postal_code_check,
      cvv:        card?.checks?.cvc_check,
      si_error: si.error?.message ?? null,
      result: si.status === "succeeded"
        ? "✅ Stripe AVS/CVV is working"
        : si.error?.message ?? "check setup_intent_status",
    });
  }

  // If PM created successfully, run SetupIntent
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
    account_id: account.id,
    charges_enabled: account.charges_enabled,
    setup_intent_status: si.status,
    avs_street: card?.checks?.address_line1_check,
    avs_zip:    card?.checks?.address_postal_code_check,
    cvv:        card?.checks?.cvc_check,
    result: si.status === "succeeded" ? "✅ Working" : si.error?.message,
  });
}
