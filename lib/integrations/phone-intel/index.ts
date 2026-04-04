import { logger } from "@/lib/logger";

export interface PhoneIntelSignals {
  simSwapRecent: boolean;
  simSwapDaysAgo: number | null;
  lineType: "mobile" | "landline" | "voip" | "unknown";
  ownershipMatch: boolean | null;
  carrierName: string | null;
  reasons: string[];
}

interface PhoneIntelInput {
  phone: string;  // E.164
  submittedName: string;
}

/**
 * Phone Risk Plus stub.
 *
 * In production: wire to Ekata (now Mastercard), Telesign, or SEON.
 * Set PHONE_INTEL_API_KEY in env.
 *
 * SIM swap detection is the most valuable signal here — requires carrier-level API.
 */
export async function checkPhoneIntel(input: PhoneIntelInput): Promise<PhoneIntelSignals> {
  const apiKey = process.env.PHONE_INTEL_API_KEY;

  if (!apiKey) {
    logger.info("phone-intel: not configured — returning stub signals");
    return {
      simSwapRecent: false,
      simSwapDaysAgo: null,
      lineType: "unknown",
      ownershipMatch: null,
      carrierName: null,
      reasons: ["Phone intelligence API not configured — stub signals used"],
    };
  }

  try {
    // Example: Telesign PhoneID API
    const encoded = Buffer.from(`${apiKey}`).toString("base64");
    const res = await fetch(
      `https://rest-api.telesign.com/v1/phoneid/${encodeURIComponent(input.phone)}`,
      {
        headers: { Authorization: `Basic ${encoded}` },
        signal: AbortSignal.timeout(3000),
      }
    );

    if (!res.ok) throw new Error(`Phone Intel API ${res.status}`);

    const data = await res.json() as {
      phone_type?: { description?: string };
      carrier?: { name?: string };
      sim_swap?: { last_sim_swap?: string };
    };

    const simSwapDate = data.sim_swap?.last_sim_swap
      ? new Date(data.sim_swap.last_sim_swap)
      : null;
    const simSwapDaysAgo = simSwapDate
      ? Math.floor((Date.now() - simSwapDate.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const typeMap: Record<string, PhoneIntelSignals["lineType"]> = {
      MOBILE: "mobile", LAND_LINE: "landline", VOIP: "voip",
    };
    const rawType = (data.phone_type?.description ?? "").toUpperCase();

    return {
      simSwapRecent: simSwapDaysAgo !== null && simSwapDaysAgo <= 30,
      simSwapDaysAgo,
      lineType: typeMap[rawType] ?? "unknown",
      ownershipMatch: null, // requires separate name-match API call
      carrierName: data.carrier?.name ?? null,
      reasons: simSwapDaysAgo !== null && simSwapDaysAgo <= 30
        ? [`SIM swap detected ${simSwapDaysAgo} days ago`]
        : [],
    };
  } catch (err) {
    logger.error("phone-intel: check failed", { error: String(err) });
    return {
      simSwapRecent: false, simSwapDaysAgo: null,
      lineType: "unknown", ownershipMatch: null, carrierName: null,
      reasons: ["Phone intelligence check failed — continuing without signal"],
    };
  }
}
