import { logger } from "@/lib/logger";

export interface PaymentCheckResult {
  avs?: "Y" | "N" | "P" | "U";
  cvv?: "M" | "N" | "U";
  binCountry?: string;
  binType?: "debit" | "credit" | "prepaid" | "unknown";
  reasons: string[];
}

interface PaymentMeta {
  cardLast4?: string;
  bin?: string;
  brand?: string;
}

// BIN lookup via binlist.net (free, no key needed, rate-limited)
async function lookupBin(bin: string): Promise<{
  country?: string;
  type?: string;
  prepaid?: boolean;
  scheme?: string;
}> {
  try {
    const res = await fetch(`https://lookup.binlist.net/${bin}`, {
      headers: { Accept: "application/json", "Accept-Version": "3" },
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

export async function checkPayment(meta: PaymentMeta): Promise<PaymentCheckResult> {
  const reasons: string[] = [];

  // If no payment meta provided
  if (!meta.cardLast4 && !meta.bin) {
    return {
      avs: "U",
      cvv: "U",
      reasons: ["No payment meta provided — AVS/CVV checks skipped"],
    };
  }

  // BIN lookup
  let binCountry: string | undefined;
  let binType: "debit" | "credit" | "prepaid" | "unknown" = "unknown";

  if (meta.bin && meta.bin.length === 6) {
    try {
      const binData = await lookupBin(meta.bin);
      binCountry = binData.country;

      if (binData.prepaid) {
        binType = "prepaid";
        reasons.push("Card BIN indicates a prepaid card — higher chargeback risk");
      } else if (binData.type === "debit") {
        binType = "debit";
        reasons.push("Card BIN indicates a debit card");
      } else if (binData.type === "credit") {
        binType = "credit";
      } else {
        binType = "unknown";
      }

      if (binCountry && binCountry !== "US") {
        reasons.push(`Card issued in ${binCountry} — international card`);
      }
    } catch (err) {
      logger.warn("BIN lookup failed", { error: String(err) });
    }
  }

  // AVS and CVV are gateway signals — in real flow these come from
  // a zero-dollar auth or preauth response. For stub: simulate based on BIN patterns.
  // In production: swap this for your Stripe/Authorize.net preauth result.
  const isTestBin = meta.bin === "424242" || meta.bin === "411111";
  const avs: "Y" | "N" | "P" | "U" = isTestBin ? "Y" : meta.bin ? "P" : "U";
  const cvv: "M" | "N" | "U" = isTestBin ? "M" : meta.cardLast4 ? "M" : "U";

  if (avs === "N") reasons.push("AVS failed — billing address does not match card records");
  else if (avs === "P") reasons.push("AVS partial match — ZIP matched but street address did not");
  else if (avs === "U") reasons.push("AVS unavailable — card issuer did not return address verification");
  else reasons.push("AVS full match");

  if (cvv === "N") reasons.push("CVV check failed — security code did not match");
  else if (cvv === "U") reasons.push("CVV not provided or unavailable");
  else reasons.push("CVV matched");

  return { avs, cvv, binCountry, binType, reasons };
}
