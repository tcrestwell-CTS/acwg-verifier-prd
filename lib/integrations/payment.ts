import { logger } from "@/lib/logger";

export interface PaymentCheckResult {
  avs?: "Y" | "N" | "P" | "U";
  cvv?: "M" | "N" | "U";
  binCountry?: string;
  binType?: "debit" | "credit" | "prepaid" | "unknown";
  fraudScore?: number;
  cardBlacklisted?: boolean;
  reasons: string[];
}

interface PaymentMeta {
  cardLast4?: string;
  bin?: string;
  brand?: string;
}

interface BillingContext {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: {
    line1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
  orderAmount?: number;
  ip?: string;
}

// ── BIN lookup ────────────────────────────────────────────────────────────────

async function lookupBin(bin: string): Promise<{
  country?: string;
  type?: string;
  prepaid?: boolean;
  scheme?: string;
}> {
  try {
    const res = await fetch(`https://lookup.binlist.net/${bin}`, {
      headers: { Accept: "application/json", "Accept-Version": "3" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return {};
    const data = await res.json() as {
      country?: { alpha2?: string };
      type?: string;
      prepaid?: boolean;
      scheme?: string;
    };
    return {
      country: data.country?.alpha2,
      type: data.type,
      prepaid: data.prepaid,
      scheme: data.scheme,
    };
  } catch {
    return {};
  }
}

// ── IPQS Transaction Scoring ──────────────────────────────────────────────────
// Extends the IPQS Proxy Detection API with billing/card transaction parameters
// Docs: https://www.ipqualityscore.com/documentation/proxy-detection-api/transaction-scoring
// Uses same IDENTITY_INTEL_API_KEY as identity/phone-intel

interface IPQSTransactionResponse {
  success?: boolean;
  message?: string;
  fraud_score?: number;
  transaction_details?: {
    valid_billing_address?: boolean;
    valid_shipping_address?: boolean;
    valid_billing_email?: boolean;
    valid_billing_phone?: boolean;
    leaked_billing_email?: boolean;
    leaked_billing_phone?: boolean;
    leaked_billing_address?: boolean;
    name_matches_billing?: string;  // "exact", "partial", "mismatch", "unknown"
    phone_matches_billing?: string;
    address_matches_billing?: string;
    risk_score?: number;
    order_risk?: string; // "low", "medium", "high"
    bin_country?: string;
    bin_bank_name?: string;
    bin_type?: string;   // "credit", "debit", "prepaid"
    bin_valid?: boolean;
    credit_card_valid?: boolean;
    is_prepaid?: boolean;
  };
}

async function scoreTransaction(
  meta: PaymentMeta,
  billing: BillingContext
): Promise<IPQSTransactionResponse | null> {
  const apiKey = process.env.IDENTITY_INTEL_API_KEY;
  if (!apiKey) return null;

  const ip = billing.ip ?? "1.1.1.1"; // IPQS requires an IP; use neutral fallback

  try {
    const params = new URLSearchParams({
      strictness: "1",
      // Billing identity
      ...(billing.firstName && { billing_first_name: billing.firstName }),
      ...(billing.lastName  && { billing_last_name: billing.lastName }),
      ...(billing.email     && { billing_email: billing.email }),
      ...(billing.phone     && { billing_phone: billing.phone }),
      // Billing address
      ...(billing.address?.line1      && { billing_address: billing.address.line1 }),
      ...(billing.address?.city       && { billing_city: billing.address.city }),
      ...(billing.address?.state      && { billing_region: billing.address.state }),
      ...(billing.address?.postalCode && { billing_postcode: billing.address.postalCode }),
      billing_country: "US",
      // Card details
      ...(meta.bin         && { credit_card_bin: meta.bin }),
      ...(meta.cardLast4   && { credit_card_last_4: meta.cardLast4 }),
      // Order context
      ...(billing.orderAmount && { order_amount: billing.orderAmount.toString() }),
      currency: "USD",
    });

    const res = await fetch(
      `https://ipqualityscore.com/api/json/ip/${apiKey}/${ip}?${params}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!res.ok) return null;
    return await res.json() as IPQSTransactionResponse;
  } catch (err) {
    logger.error("IPQS transaction score failed", { error: String(err) });
    return null;
  }
}

// ── Main payment check ────────────────────────────────────────────────────────

export async function checkPayment(
  meta: PaymentMeta,
  billing?: BillingContext
): Promise<PaymentCheckResult> {
  const reasons: string[] = [];

  if (!meta.cardLast4 && !meta.bin) {
    return {
      avs: "U", cvv: "U",
      reasons: ["No payment info provided — verification skipped"],
    };
  }

  // 1. BIN lookup
  let binCountry: string | undefined;
  let binType: PaymentCheckResult["binType"] = "unknown";

  if (meta.bin && meta.bin.length >= 6) {
    const binData = await lookupBin(meta.bin);
    binCountry = binData.country;

    if (binData.prepaid) {
      binType = "prepaid";
      reasons.push("Prepaid card — higher chargeback risk");
    } else if (binData.type === "debit") {
      binType = "debit";
    } else if (binData.type === "credit") {
      binType = "credit";
    }

    if (binCountry && binCountry !== "US") {
      reasons.push(`Card issued in ${binCountry} — international card`);
    }
  }

  // 2. IPQS transaction scoring (card last4 + billing address correlation)
  let fraudScore: number | undefined;
  let cardBlacklisted = false;

  if (billing) {
    const ipqs = await scoreTransaction(meta, billing);
    const td = ipqs?.transaction_details;
    fraudScore = ipqs?.fraud_score;

    if (td) {
      const binValid = td.bin_valid;
      const cardValid = td.credit_card_valid;
      const addressMatch = td.address_matches_billing;
      const nameMatch = td.name_matches_billing;
      const orderRisk = td.order_risk;
      const isPrepaid = td.is_prepaid;

      // Card validity
      if (cardValid === false) {
        cardBlacklisted = true;
        reasons.push("Card number flagged as invalid or blacklisted by IPQS fraud network");
      }
      if (binValid === false) {
        reasons.push("Card BIN not recognized — may be fake or invalid");
      }
      if (isPrepaid && binType !== "prepaid") {
        binType = "prepaid";
        reasons.push("Card identified as prepaid by IPQS");
      }

      // Address correlation
      if (addressMatch === "mismatch") {
        reasons.push("Billing address does not match card records — AVS mismatch signal");
      } else if (addressMatch === "partial") {
        reasons.push("Billing address partially matches card records");
      } else if (addressMatch === "exact") {
        reasons.push("✓ Billing address matches card records");
      }

      // Name correlation
      if (nameMatch === "mismatch") {
        reasons.push("Cardholder name does not match billing name on record");
      } else if (nameMatch === "exact" || nameMatch === "partial") {
        reasons.push(`✓ Cardholder name ${nameMatch} match`);
      }

      // Leaked data
      if (td.leaked_billing_address) reasons.push("Billing address found in data breach records");
      if (td.leaked_billing_email)   reasons.push("Billing email found in data breach records");
      if (td.leaked_billing_phone)   reasons.push("Billing phone found in data breach records");

      // Overall order risk
      if (orderRisk === "high")   reasons.push(`IPQS transaction risk: HIGH (score: ${fraudScore})`);
      else if (orderRisk === "medium") reasons.push(`IPQS transaction risk: MEDIUM (score: ${fraudScore})`);
    }

    logger.info("payment: IPQS transaction score", {
      fraudScore,
      orderRisk: td?.order_risk,
      addressMatch: td?.address_matches_billing,
      nameMatch: td?.name_matches_billing,
    });
  }

  // AVS — derived from IPQS address match since we don't have a payment gateway
  const addressMatch = billing ? (await scoreTransaction(meta, billing))
    ?.transaction_details?.address_matches_billing : undefined;
  const avs: PaymentCheckResult["avs"] =
    addressMatch === "exact"   ? "Y" :
    addressMatch === "partial" ? "P" :
    addressMatch === "mismatch" ? "N" : "U";

  if (reasons.length === 0) {
    reasons.push("Payment details reviewed — no fraud signals detected");
  }

  return { avs, cvv: "U", binCountry, binType, fraudScore, cardBlacklisted, reasons };
}
